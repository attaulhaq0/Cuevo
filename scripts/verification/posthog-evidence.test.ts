import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verificationSteps } from './steps';
import { technicalResult } from './rules';
import { loadVerificationEvent, parseEvidenceArguments, parseEvidenceConfig, publishVerificationEvent } from './posthog-evidence';

const run = '2026-10-02T17-02-58-500Z';
const evidenceDirectory = `.local/verification/${run}`;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const config = { POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_ID: '393668', POSTHOG_ENVIRONMENT: 'QA', POSTHOG_PROJECT_KEY: 'phc_synthetic_test_only_123456' };
const clock = () => new Date('2026-10-03T01:00:00.000Z');
type Row = { name: string; exitCode: number | null; required: boolean; durationMs: number };
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'cuevo-posthog-evidence-'));
  const directory = resolve(root, evidenceDirectory);
  await mkdir(directory, { recursive: true });
  await mkdir(resolve(root, 'apps/api'), { recursive: true });
  await mkdir(resolve(root, 'docs/product'), { recursive: true });
  const sources = { '.gitignore': '.local/\n', 'apps/api/source.ts': 'export const answer = 42;\n', 'README.md': '# Cuevo\n', 'docs/product/context.json': '{"version":1}\n' };
  for (const [path, content] of Object.entries(sources)) await writeFile(resolve(root, path), content);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '.'], { cwd: root });
  const source = Object.entries(sources).map(([path, content]) => ({ path, sha256: digest(content) }));
  await writeFile(resolve(directory, 'source.json'), JSON.stringify(source, null, 2));
  await writeFile(resolve(directory, 'source-final.json'), JSON.stringify(source, null, 2));
  const rows: Row[] = [...verificationSteps.map(step => ({ name: step.name, exitCode: 0, required: true, durationMs: 123 })), { name: 'source-freeze', exitCode: 0, required: true, durationMs: 0 }];
  const save = async (nextRows: Row[], extra: Record<string, unknown> = {}) => writeFile(resolve(directory, 'evidence.json'), JSON.stringify({ status: technicalResult(nextRows).status, rows: nextRows, ...extra }, null, 2));
  await save(rows);
  return { root, directory, source, rows, save, cleanup: () => rm(root, { recursive: true, force: true }), load: () => loadVerificationEvent(root, evidenceDirectory, clock) };
}

test('real complete frozen directory yields minimized technical evidence with exact source identity', async () => {
  const f = await fixture();
  try {
    assert.equal(verificationSteps.length + 1, 37, 'sequence version 1 is the frozen 37-row sequence');
    const event = await f.load();
    assert.equal(event.event, 'cuevo_verification_completed');
    assert.equal(event.timestamp, '2026-10-02T17:02:58.500Z');
    assert.equal(event.properties.technical_status, 'VERIFIED');
    assert.equal(event.properties.required_rows, 37);
    assert.equal(event.properties.passed_rows, 37);
    assert.equal(event.properties.failed_rows, 0);
    assert.equal(event.properties.unexecuted_rows, 0);
    assert.equal(event.properties.source_relation, 'EXACT_SOURCE');
    assert.equal(event.properties.runtime_source_unchanged, true);
    assert.equal(event.properties.verified_source_snapshot_sha256, digest(await readFile(resolve(f.directory, 'source-final.json'))));
    assert.equal(event.properties.schema_version, 2);
    assert.equal(event.properties.reporting_kind, 'TECHNICAL_VERIFICATION');
    assert.equal(event.properties.data_class, 'SYNTHETIC');
    assert.equal(event.properties.environment, 'QA');
    assert.equal(event.properties.cuevo_source, 'cuevo-repository');
    assert.equal(event.properties.$process_person_profile, false);
    assert.equal(event.properties.$ip, null);
    assert.equal(event.properties.completion_timestamp_state, 'NOT_RECORDED');
    for (const value of Object.values(event.properties)) assert.ok(value === null || ['string', 'boolean', 'number'].includes(typeof value));
    const bytes = JSON.stringify(event);
    for (const forbidden of ['apps/api/source.ts', 'export const', '.local/', 'README.md', 'school', 'student', 'child', 'phc_', 'durationMs', 'source-freeze']) assert.ok(!bytes.includes(forbidden), forbidden);
    assert.match(event.properties.$insert_id, /^[a-f0-9]{64}$/);
    assert.match(event.properties.distinct_id, /^cuevo-qa-run:[a-f0-9]{64}$/);
  } finally { await f.cleanup(); }
});

test('missing required rows and failed or unexecuted rows cannot become success', async () => {
  const f = await fixture();
  try {
    await f.save(f.rows.slice(1));
    let event = await f.load();
    assert.equal(event.properties.technical_status, 'NOT_VERIFIED');
    assert.equal(event.properties.unexecuted_rows, 1);
    assert.equal(event.properties.passed_rows, 36);
    assert.equal(event.properties.verified_source_snapshot_sha256, null);
    await f.save(f.rows.map(row => row.name === 'unit' ? { ...row, exitCode: 1 } : row.name === 'database' ? { ...row, exitCode: null } : row));
    event = await f.load();
    assert.equal(event.properties.failed_rows, 1);
    assert.equal(event.properties.unexecuted_rows, 1);
    assert.equal(event.properties.technical_status, 'NOT_VERIFIED');
  } finally { await f.cleanup(); }
});

test('historical verified source remains verified as a run but never implies current runtime source', async () => {
  const f = await fixture();
  try {
    const original = await f.load();
    await writeFile(resolve(f.root, 'apps/api/source.ts'), 'export const answer = 43;\n');
    const changed = await f.load();
    assert.equal(changed.properties.technical_status, 'VERIFIED');
    assert.equal(changed.properties.source_relation, 'HISTORICAL_SOURCE');
    assert.equal(changed.properties.runtime_source_unchanged, false);
    assert.equal(changed.properties.$insert_id, original.properties.$insert_id);
    assert.equal(changed.properties.verified_source_snapshot_sha256, original.properties.verified_source_snapshot_sha256);
    assert.notEqual(changed.properties.current_source_snapshot_sha256, original.properties.current_source_snapshot_sha256);
  } finally { await f.cleanup(); }
});

test('only Markdown changes are classified as documentation; curriculum JSON and source additions/deletions are substantive', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'README.md'), '# Cuevo updated status\n');
    let event = await f.load();
    assert.equal(event.properties.runtime_source_unchanged, true);
    assert.equal(event.properties.source_relation, 'DOCUMENTATION_CHANGED');
    await writeFile(resolve(f.root, 'docs/product/context.json'), '{"version":2}\n');
    event = await f.load();
    assert.equal(event.properties.runtime_source_unchanged, false);
    await writeFile(resolve(f.root, 'apps/api/new.ts'), 'export const added = true;\n');
    assert.equal((await f.load()).properties.source_relation, 'HISTORICAL_SOURCE');
    await rm(resolve(f.root, 'apps/api/new.ts'));
    await rm(resolve(f.root, 'apps/api/source.ts'));
    assert.equal((await f.load()).properties.runtime_source_unchanged, false);
  } finally { await f.cleanup(); }
});

test('unknown duplicate optional or arbitrary evidence fields fail closed before publication', async () => {
  const f = await fixture();
  try {
    for (const rows of [ [...f.rows, { name: 'fake-success', exitCode: 0, required: true, durationMs: 0 }], [...f.rows, f.rows[0]!], f.rows.map(row => row.name === 'unit' ? { ...row, required: false } : row), f.rows.map(row => ({ ...row, stdout: 'private content' })) ]) {
      await f.save(rows);
      await assert.rejects(f.load(), /Invalid technical verification evidence/);
    }
    await f.save(f.rows, { token: 'private' });
    await assert.rejects(f.load(), /Invalid technical verification evidence/);
  } finally { await f.cleanup(); }
});

test('source freeze tampering and unsafe manifest paths fail closed', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.directory, 'source-final.json'), JSON.stringify([{ ...f.source[0], sha256: 'a'.repeat(64) }, ...f.source.slice(1)]));
    await assert.rejects(f.load(), /Source freeze evidence is inconsistent/);
    for (const path of ['../outside', '.env.local', '.local/synthetic-accounts.json', 'apps/api\\source.ts']) {
      await writeFile(resolve(f.directory, 'source.json'), JSON.stringify([{ path, sha256: 'a'.repeat(64) }]));
      await assert.rejects(f.load(), /Invalid source manifest/);
    }
  } finally { await f.cleanup(); }
});

test('incomplete run without final manifest publishes only not-verified evidence', async () => {
  const f = await fixture();
  try {
    await f.save(f.rows.map(row => row.name === 'source-freeze' ? { ...row, exitCode: null } : row));
    await rm(resolve(f.directory, 'source-final.json'));
    const event = await f.load();
    assert.equal(event.properties.technical_status, 'NOT_VERIFIED');
    assert.equal(event.properties.source_freeze_unchanged, false);
    assert.equal(event.properties.verified_source_snapshot_sha256, null);
  } finally { await f.cleanup(); }
});

test('operator invocation refuses CI, arbitrary destination, key, environment and evidence paths', () => {
  assert.equal(parseEvidenceArguments(['--evidence-directory', evidenceDirectory], {}), evidenceDirectory);
  for (const args of [[], ['--evidence-directory'], ['--evidence-directory', '/tmp/run'], ['--evidence-directory', '.local/verification/../run'], ['--evidence-directory', evidenceDirectory, '--unknown']]) assert.throws(() => parseEvidenceArguments(args, {}));
  for (const ci of ['true', '1', 'false']) assert.throws(() => parseEvidenceArguments(['--evidence-directory', evidenceDirectory], { CI: ci }), /Operator-only/);
  assert.equal(parseEvidenceConfig(config).projectId, 393668);
  for (const extra of [{ POSTHOG_HOST: 'http://us.i.posthog.com' }, { POSTHOG_HOST: 'https://example.com' }, { POSTHOG_PROJECT_ID: '1' }, { POSTHOG_PROJECT_KEY: '' }, { POSTHOG_PROJECT_KEY: 'secret\nvalue' }, { POSTHOG_CAPTURE_MODE: 'DISABLED' }, { POSTHOG_ENVIRONMENT: 'PRODUCTION' }, { NODE_ENV: 'production' }]) assert.throws(() => parseEvidenceConfig({ ...config, ...extra }), /Invalid operator PostHog configuration/);
});

test('evidence path symlinks are refused without following outside the ignored root', async () => {
  const f = await fixture();
  try {
    const outside = resolve(f.root, 'outside-evidence');
    await mkdir(outside);
    await rm(f.directory, { recursive: true });
    await symlink(outside, f.directory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.load(), /Evidence must be a physical ignored verification directory/);
  } finally { await f.cleanup(); }
});

test('evidence files and current source directories cannot redirect reads through directory junctions', async () => {
  const f = await fixture();
  try {
    const original = await readFile(resolve(f.directory, 'evidence.json'));
    const outside = resolve(f.root, '.local/outside-evidence');
    await mkdir(outside);
    await writeFile(resolve(outside, 'evidence.json'), original);
    await rm(resolve(f.directory, 'evidence.json'));
    await symlink(outside, resolve(f.directory, 'evidence.json'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.load(), /Invalid technical verification evidence file/);
    await rm(resolve(f.directory, 'evidence.json'), { recursive: true });
    await writeFile(resolve(f.directory, 'evidence.json'), original);
    await rm(outside, { recursive: true });
    const redirect = resolve(f.root, '.local/source-redirect');
    await mkdir(redirect);
    await writeFile(resolve(redirect, 'source.ts'), 'private redirected content');
    await rm(resolve(f.root, 'apps/api'), { recursive: true });
    await symlink(redirect, resolve(f.root, 'apps/api'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.load(), /Current authored source inventory cannot be verified/);
  } finally { await f.cleanup(); }
});

test('HTTP rejection remains retry-required when no send outcome was uncertain', async () => {
  const f = await fixture();
  try {
    const receipt = await publishVerificationEvent(parseEvidenceConfig(config), await f.load(), async () => new Response(null, { status: 503 }), async () => undefined);
    assert.equal(receipt.capture_outcome, 'RETRY_REQUIRED');
    assert.equal(receipt.attempts, 3);
    assert.equal(receipt.readback_status, 'NOT_VERIFIED');
  } finally { await f.cleanup(); }
});

test('bounded HTTP retries preserve identity and never read response body or expose the key', async () => {
  const f = await fixture();
  try {
    const event = await f.load();
    const bodies: string[] = [];
    const result = await publishVerificationEvent(parseEvidenceConfig(config), event, async (url, options) => {
      assert.equal(url, 'https://us.i.posthog.com/i/v0/e/');
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.credentials, 'omit');
      assert.ok(options?.signal);
      bodies.push(String(options?.body));
      if (bodies.length === 1) throw Error('private timeout detail');
      return { ok: bodies.length === 3, body: { cancel: async () => undefined }, text: () => { throw Error('response body must not be read'); } } as unknown as Response;
    }, async () => undefined);
    assert.equal(result.capture_outcome, 'ACCEPTED');
    assert.equal(result.attempts, 3);
    assert.equal(result.readback_status, 'NOT_VERIFIED');
    assert.equal(new Set(bodies).size, 1);
    assert.ok(!JSON.stringify(result).includes(config.POSTHOG_PROJECT_KEY));
    const unknown = await publishVerificationEvent(parseEvidenceConfig(config), event, async () => { throw Error('private network failure'); }, async () => undefined);
    assert.equal(unknown.capture_outcome, 'OUTCOME_UNKNOWN');
    assert.equal(unknown.attempts, 3);
  } finally { await f.cleanup(); }
});

test('direct sink rejects arbitrary properties, malformed identity, inconsistent counts and false source claims before HTTP', async () => {
  const f = await fixture();
  try {
    const event = await f.load();
    for (const properties of [
      { ...event.properties, stdout: 'private content' },
      { ...event.properties, $insert_id: 'arbitrary' },
      { ...event.properties, failed_rows: 1 },
      { ...event.properties, runtime_source_unchanged: false },
      { ...event.properties, verified_source_snapshot_sha256: null },
      { ...event.properties, verification_sequence_sha256: 'f'.repeat(64) },
    ]) {
      let calls = 0;
      await assert.rejects(publishVerificationEvent(parseEvidenceConfig(config), { ...event, properties }, async () => { calls++; return new Response(); }), /Invalid minimized verification event/);
      assert.equal(calls, 0);
    }
  } finally { await f.cleanup(); }
});

test('HTTP timeout aborts the request within its bounded limit and retries stay uncertain', async () => {
  const f = await fixture();
  try {
    const event = await f.load();
    let calls = 0;
    const started = Date.now();
    const receipt = await publishVerificationEvent(parseEvidenceConfig(config), event, async (_url, options) => {
      calls++;
      if (calls > 1) throw Error('subsequent network uncertainty');
      return new Promise<Response>((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(Error('timeout')), { once: true });
        // Keep the test alive; AbortSignal.timeout uses an unreferenced timer.
        const timer = setTimeout(() => reject(Error('timeout was not bounded')), 5000);
        options!.signal!.addEventListener('abort', () => clearTimeout(timer), { once: true });
      });
    }, async () => undefined);
    assert.equal(receipt.capture_outcome, 'OUTCOME_UNKNOWN');
    assert.equal(calls, 3);
    assert.ok(Date.now() - started >= 2900 && Date.now() - started < 4500);
  } finally { await f.cleanup(); }
});

test('evidence rewritten during source comparison is refused before constructing a sendable event', async () => {
  const f = await fixture();
  try {
    await assert.rejects(loadVerificationEvent(f.root, evidenceDirectory, () => {
      writeFileSync(resolve(f.directory, 'evidence.json'), JSON.stringify({ status: 'NOT_VERIFIED', rows: [] }));
      return clock();
    }), /Technical evidence changed during export/);
  } finally { await f.cleanup(); }
});
