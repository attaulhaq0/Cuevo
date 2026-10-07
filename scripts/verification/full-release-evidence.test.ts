import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verificationSteps } from './steps';
import { validateCiRun } from './cicd-contracts';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Readable } from 'node:stream';
import { canonicalReleaseReviewJson } from './release-review';

const sha = 'a'.repeat(40), tree = 'b'.repeat(40), expected = { sha, repository: 'owner/repo', ciRunId: '42' };
const run = () => ({ id: 42, run_attempt: 2, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', path: '.github/workflows/full-regression.yml', repository: { full_name: expected.repository } });
const summary = () => ({ version: 1, profile: 'CUSTOMER_CANDIDATE', repository: expected.repository, sourceSha: sha, treeSha: tree, runId: '42', runAttempt: 2, evidence: { commitSha: sha, runId: '42', status: 'VERIFIED', sourceFileCount: 10, rows: [...verificationSteps.map(step => ({ name: step.name, exitCode: 0, durationMs: 1 })), { name: 'source-freeze', exitCode: 0, durationMs: 1 }] } });
async function api() { const subject = await import('./full-release-evidence'); assert.equal(typeof subject.validateFullReleaseSummary, 'function'); return subject; }

test('production requires explicit current-source manual full candidate and every original full row', async () => {
  const subject = await api();
  subject.validateProductionCiRun(run(), expected);
  assert.equal(subject.validateFullReleaseSummary(summary(), { ...expected, treeSha: tree, runAttempt: 2 }).profile, 'CUSTOMER_CANDIDATE');
  assert.throws(() => validateCiRun(run(), expected), 'routine source admission remains distinct');
});

const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const { yazl } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { yazl: { ZipFile: new () => { outputStream: Readable; addBuffer(bytes: Buffer, name: string): void; end(): void } } };
async function zipSummary(value: unknown) {
  const zip = new yazl.ZipFile(), chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { zip.outputStream.on('data', chunk => chunks.push(chunk)); zip.outputStream.on('error', reject); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks))); });
  zip.addBuffer(Buffer.from(canonicalReleaseReviewJson(value)), 'summary.json'); zip.end(); return done;
}
async function nativeFixture(check: (fixture: { root: string; input: { repoRoot: string; githubToken: string; repository: string; sha: string; ciRunId: string }; responses: Map<string, unknown>; calls: string[] }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-full-admission-')), original = globalThis.fetch;
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], windowsHide: true }).trim();
  try {
    await mkdir(join(root, '.github/workflows'), { recursive: true }); const workflowText = await readFile(resolve('.github/workflows/full-regression.yml'), 'utf8');
    await writeFile(join(root, '.github/workflows/full-regression.yml'), workflowText); await writeFile(join(root, 'README.md'), 'Controlled immutable source\n'); await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
    git('init', '--quiet'); git('add', '.'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','source');
    const source = git('rev-parse','HEAD'), sourceTree = git('rev-parse','HEAD^{tree}'), input = { repoRoot: root, githubToken: 'private-full-reader-canary', repository: expected.repository, sha: source, ciRunId: '42' };
    const fullRun = { ...run(), head_sha: source }, result = { ...summary(), sourceSha: source, treeSha: sourceTree, evidence: { ...summary().evidence, commitSha: source } };
    const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): { jobs: Record<string, { steps: { name: string }[] }> } }, workflow = yaml.load(workflowText);
    const jobs = Object.entries(workflow.jobs).map(([name, job], index) => ({ id: index + 1, name, run_id: 42, run_attempt: 2, head_sha: source, head_branch: 'main', status: 'completed', conclusion: 'success', steps: job.steps.map((step, number) => ({ name: step.name, number: number + 1, status: 'completed', conclusion: 'success' })) }));
    const archive = await zipSummary(result), artifact = { id: 72, name: 'cuevo-full-verification-42-2', size_in_bytes: archive.length, expired: false, digest: 'sha256:' + hash(archive), created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), workflow_run: { id: 42, head_branch: 'main', head_sha: source } };
    const responses = new Map<string, unknown>([['actions/runs/42', fullRun],['actions/runs/42/attempts/2/jobs?per_page=100&page=1', { total_count: jobs.length, jobs }],['actions/runs/42/artifacts?per_page=100', { total_count: 1, artifacts: [artifact] }],['git/ref/heads/main',{ object: { type: 'commit', sha: source } }]]), calls: string[] = [];
    globalThis.fetch = async (url, options) => {
      const raw = String(url), prefix = `https://api.github.com/repos/${expected.repository}/`; assert.ok(raw.startsWith(prefix)); assert.equal(options?.method, 'GET'); assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer ' + input.githubToken); const path = raw.slice(prefix.length); calls.push(path);
      if (path === 'actions/artifacts/72/zip') return new Response(new Uint8Array(archive));
      if (!responses.has(path)) throw Error('Unexpected official route'); return Response.json(responses.get(path));
    };
    await check({ root, input, responses, calls });
  } finally { globalThis.fetch = original; assert.equal(resolve(root, '..'), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}
test('native production evidence reads exact complete official profile artifact without executing or exposing it', async () => {
  const subject = await api();
  await nativeFixture(async fixture => { const proof = await subject.readFullReleaseEvidence(fixture.input); assert.equal(proof.profile, 'CUSTOMER_CANDIDATE'); assert.equal(proof.sourceSha, fixture.input.sha); assert.equal(proof.runAttempt, 2); assert.equal(proof.artifactId, 72); assert.equal(JSON.stringify(proof).includes(fixture.input.githubToken), false); assert.equal(fixture.calls.filter(path => path === 'actions/runs/42').length, 2); });
});
test('native production refuses aggregate success with skipped incomplete or foreign job proof before artifact consumption', async () => {
  const subject = await api();
  for (const mode of ['skipped', 'missing', 'extra', 'source', 'attempt']) await nativeFixture(async fixture => {
    const path = 'actions/runs/42/attempts/2/jobs?per_page=100&page=1', response = fixture.responses.get(path) as { total_count: number; jobs: { name: string; head_sha: string; run_attempt: number; steps: { conclusion: string }[] }[] };
    if (mode === 'skipped') response.jobs[0].steps[0].conclusion = 'skipped';
    else if (mode === 'missing') response.jobs[0].steps.pop();
    else if (mode === 'extra') response.jobs[0].name = 'foreign-job';
    else if (mode === 'source') response.jobs[0].head_sha = 'c'.repeat(40);
    else response.jobs[0].run_attempt++;
    await assert.rejects(subject.readFullReleaseEvidence(fixture.input), /contents withheld/); assert.equal(fixture.calls.includes('actions/artifacts/72/zip'), false);
  });
});

test('native production refuses job artifact or source drift after reading the original candidate', async () => {
  const subject = await api();
  for (const mode of ['run', 'artifact', 'main', 'dirty']) await nativeFixture(async fixture => {
    const fetcher = globalThis.fetch; let artifactRead = false;
    globalThis.fetch = async (url, options) => {
      const path = String(url).split('/repos/owner/repo/')[1];
      if (artifactRead && path === 'actions/runs/42' && mode === 'run') return Response.json({ ...run(), head_sha: fixture.input.sha, run_attempt: 3 });
      if (path === 'git/ref/heads/main' && mode === 'main') return Response.json({ object: { type: 'commit', sha: 'c'.repeat(40) } });
      if (path === 'actions/artifacts/72/zip') { artifactRead = true; if (mode === 'dirty') await writeFile(join(fixture.root, 'README.md'), 'Changed after candidate reads\n'); }
      if (mode === 'artifact' && path === 'actions/runs/42/artifacts?per_page=100') { const value = fixture.responses.get(path) as { artifacts: { digest: string }[] }; value.artifacts[0].digest = 'sha256:' + '0'.repeat(64); }
      return fetcher(url, options);
    };
    await assert.rejects(subject.readFullReleaseEvidence(fixture.input), /contents withheld/, mode);
  });
});

test('routine scheduled regression skipped missing failed or foreign proof never becomes a production certificate', async () => {
  const subject = await api();
  for (const fields of [{ path: '.github/workflows/ci.yml', event: 'push' }, { event: 'schedule' }, { event: 'push' }, { head_sha: 'c'.repeat(40) }, { repository: { full_name: 'fork/repo' } }, { run_attempt: 0 }, { conclusion: 'cancelled' }]) assert.throws(() => subject.validateProductionCiRun({ ...run(), ...fields }, expected));
  for (const mode of ['profile', 'source', 'tree', 'run', 'attempt', 'missing', 'failed', 'unexecuted', 'duplicate', 'unknown', 'count']) {
    const value = summary();
    if (mode === 'profile') value.profile = 'FULL_REGRESSION';
    else if (mode === 'source') value.sourceSha = 'c'.repeat(40);
    else if (mode === 'tree') value.treeSha = 'c'.repeat(40);
    else if (mode === 'run') value.runId = '43';
    else if (mode === 'attempt') value.runAttempt++;
    else if (mode === 'missing') value.evidence.rows.pop();
    else if (mode === 'failed') value.evidence.rows[0].exitCode = 1;
    else if (mode === 'unexecuted') (value.evidence.rows[0] as { exitCode: number | null }).exitCode = null;
    else if (mode === 'duplicate') value.evidence.rows.push({ ...value.evidence.rows[0] });
    else if (mode === 'unknown') value.evidence.rows[0].name = 'invented-check';
    else value.evidence.sourceFileCount = 0;
    assert.throws(() => subject.validateFullReleaseSummary(value, { ...expected, treeSha: tree, runAttempt: 2 }), mode);
  }
});
