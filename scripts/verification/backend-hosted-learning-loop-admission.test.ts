import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { canonicalReleaseReviewJson } from './release-review';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const uuid = (suffix: number) => '93000000-0000-4000-8000-' + String(suffix).padStart(12, '0');
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const seed = {
  repository: 'owner/repo', sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), baseSha: 'c'.repeat(40), ciRunId: '31', qaRunId: '91', qaRunAttempt: 2, environmentId: 123, environmentName: 'staging' as const,
  sourceManifestSha256: 'a'.repeat(64), diffSha256: 'b'.repeat(64),
  migrationEndpoint:{projectRef:'mqxdjvsyckzocokuikmx',kind:'session-pooler' as const,host:'aws-1-ap-southeast-1.pooler.supabase.com',port:5432 as const,database:'postgres' as const},
  migrationEndpointSha256:digest(canonicalReleaseReviewJson({projectRef:'mqxdjvsyckzocokuikmx',kind:'session-pooler',host:'aws-1-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'})),
  backend: { runId: '51', runAttempt: 1, artifactId: '71', archiveSha256: 'c'.repeat(64), transferSha256: 'd'.repeat(64) },
  web: { deploymentId: 'dpl_Web', origin: 'https://cuevo-beta.vercel.app', artifactSha256: 'e'.repeat(64), packageSha256: 'f'.repeat(64) },
  ui: { runId: '81', runAttempt: 2, artifactId: '72', archiveSha256: '1'.repeat(64), commandManifestSha256: '2'.repeat(64), journalHeadSha256: '3'.repeat(64) },
  scope: { projectRef: 'mqxdjvsyckzocokuikmx', schoolId: uuid(1), adminId: uuid(2), teacherId: uuid(3), studentId: uuid(4), classId: uuid(5), subjectId: uuid(6), referenceId: uuid(7), sourceIds: [uuid(8)] },
  mode: 'FULL_LOOP' as const, deadlineMs: 60000, preparedAt: '2026-10-06T12:00:00.000Z', expiresAt: '2026-10-07T12:00:00.000Z',
};
const now = Date.parse('2026-10-06T12:01:00.000Z');
async function api() {
  let module: Record<string, unknown> = {};
  try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-hosted-learning-loop-admission.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.prepareHostedLearningLoopNativePackage, 'function', 'native QA package owner exists');
  return module as typeof import('./backend-hosted-learning-loop-admission');
}

test('pure package binds exact source deployment original artifacts scope mode and bounded clock', async () => {
  const owner = await api(), prepared = owner.prepareHostedLearningLoopNativePackage(seed, now);
  assert.equal(prepared.status, 'PREPARED_ONLY'); assert.equal(prepared.sha256, digest(prepared.canonicalJson));
  assert.equal(Buffer.from(prepared.base64, 'base64').toString('utf8'), prepared.canonicalJson);
  assert.equal(prepared.comment, `Cuevo hosted learning native QA approved: sha=${seed.sourceSha}; run=91; attempt=2; package=sha256:${prepared.sha256}`);
  const body = owner.validatePreparedHostedLearningLoopNativePackage(prepared, now);
  assert.equal(body.purpose, 'CUEVO_HOSTED_LEARNING_LOOP_NATIVE'); assert.deepEqual(body.backend, seed.backend); assert.deepEqual(body.scope, seed.scope);
  assert.equal(Object.hasOwn(body, 'githubToken'), false);
});

test('unknown purpose token input hooks aliases scope duplicates excessive polling and expired bytes fail closed', async () => {
  const owner = await api(); let calls = 0;
  const accessor = Object.defineProperty({ ...seed }, 'sourceSha', { enumerable: true, get() { calls++; return seed.sourceSha; } });
  for (const value of [{ ...seed, purpose: 'BACKEND_SYNTHETIC_STAGING' }, { ...seed, token: 'private-secret' }, { ...seed, deadlineMs: 60001 }, { ...seed, web: { ...seed.web, origin: 'https://cuevo-beta.vercel.app.evil.example/path' } }, { ...seed, scope: { ...seed.scope, teacherId: seed.scope.studentId } }, accessor]) assert.throws(() => owner.prepareHostedLearningLoopNativePackage(value, now));
  assert.equal(calls, 0);
  const prepared = owner.prepareHostedLearningLoopNativePackage(seed, now);
  assert.throws(() => owner.validatePreparedHostedLearningLoopNativePackage(prepared, Date.parse(seed.expiresAt)));
  for (const changed of [{ ...prepared, comment: 'Cuevo backend staging admission approved' }, { ...prepared, sha256: '0'.repeat(64) }, { ...prepared, canonicalJson: prepared.canonicalJson.replace('"qaRunAttempt":2', '"qaRunAttempt":3') }]) assert.throws(() => owner.validatePreparedHostedLearningLoopNativePackage(changed, now));
});

async function fixture(run: (owner: Awaited<ReturnType<typeof api>>, input: Record<string, unknown>, facts: ReturnType<typeof buildFacts>, replies: Map<string, unknown>, calls: string[], ports: Record<string, unknown>) => Promise<void>) {
  const owner = await api(), root = await mkdtemp(join(tmpdir(), 'cuevo-native-qa-admission-')), oldFetch = globalThis.fetch;
  const names = ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'GITHUB_WORKSPACE', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB', 'GITHUB_WORKFLOW_REF', 'GITHUB_SERVER_URL', 'GITHUB_API_URL', 'NODE_OPTIONS'];
  const saved = Object.fromEntries(names.map(key => [key, process.env[key]]));
  try {
    await writeFile(join(root, '.gitattributes'), '* text eol=lf\n'); await writeFile(join(root, 'README.md'), 'Base\n'); git(root, 'init', '--quiet'); git(root, 'add', '.');
    const commit = (label: string) => git(root, '-c', 'user.name=Native QA fixture', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', label);
    commit('base'); const baseSha = git(root, 'rev-parse', 'HEAD'); await writeFile(join(root, 'README.md'), 'Current\n'); git(root, 'add', '.'); commit('source');
    const sourceSha = git(root, 'rev-parse', 'HEAD'), treeSha = git(root, 'rev-parse', 'HEAD^{tree}'), clock = Date.now();
    const selection = { ...seed, sourceSha, treeSha, baseSha, sourceManifestSha256: digest(execFileSync('git', ['-C', root, 'ls-tree', '-r', '-z', sourceSha])), diffSha256: digest(execFileSync('git', ['-C', root, 'diff', '--no-ext-diff', '--no-textconv', '--binary', baseSha, sourceSha, '--'])), preparedAt: new Date(clock - 1000).toISOString(), expiresAt: new Date(clock + 3600000).toISOString() };
    const prepared = owner.prepareHostedLearningLoopNativePackage(selection, clock), facts = buildFacts(selection), calls: string[] = [];
    const environment = { id: 123, name: 'staging', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 95836629, login: 'attaulhaq0', type: 'User' } }] }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } };
    const current = { id: 91, run_attempt: 2, head_sha: sourceSha, head_branch: 'main', repository: { full_name: 'owner/repo' }, path: '.github/workflows/hosted-learning-qa.yml', event: 'workflow_dispatch', status: 'in_progress', conclusion: null };
    const ci = { id: 31, head_sha: sourceSha, head_branch: 'main', repository: { full_name: 'owner/repo' }, path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'success' };
    const replies = new Map<string, unknown>([['', { full_name: 'owner/repo', name: 'repo', owner: { id: 1, login: 'owner', type: 'User' } }], ['git/ref/heads/main', { object: { type: 'commit', sha: sourceSha } }], ['actions/runs/31', ci], ['actions/runs/91', current], ['environments/staging', environment], ['environments/staging/deployment-branch-policies', { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] }], ['branches/main/protection', { enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['required'] }, required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 0, require_last_push_approval: false }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } }], ['branches/main/protection/required_signatures', { enabled: true }], [`git/commits/${sourceSha}`, { sha: sourceSha, tree: { sha: treeSha }, verification: { verified: true, reason: 'valid', signature: 'controlled-signature', payload: 'controlled-payload' } }], ['actions/runs/91/approvals', [{ environments: [{ id: 123, name: 'staging' }], state: 'approved', user: { id: 95836629, login: 'attaulhaq0', type: 'User' }, comment: prepared.comment }]]]);
    Object.assign(process.env, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_WORKSPACE: root, GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: sourceSha, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '91', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'native-qa', GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/hosted-learning-qa.yml@refs/heads/main', GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com' }); delete process.env.NODE_OPTIONS;
    globalThis.fetch = async (url, options) => { assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error'); assert.equal(options?.cache, 'no-store'); assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer private-qa-token'); const parsed = new URL(String(url)); assert.equal(parsed.origin, 'https://api.github.com'); const prefix = '/repos/owner/repo', path = parsed.pathname.slice(prefix.length).replace(/^\//, ''); assert.equal(parsed.pathname, prefix + (path ? '/' + path : '')); calls.push(path); if (!replies.has(path)) throw Error('Unexpected fixed official path'); return Response.json(replies.get(path)); };
    const ports = { readCompletedBackend: async () => { calls.push('backend'); return structuredClone(facts.backend); }, readCurrentWeb: async () => { calls.push('web'); return structuredClone(facts.web); }, readOfficialUiArtifact: async () => { calls.push('ui'); return structuredClone(facts.ui); } };
    await run(owner, { repoRoot: root, githubToken: 'private-qa-token', prepared }, facts, replies, calls, ports);
  } finally { globalThis.fetch = oldFetch; for (const key of names) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}
function buildFacts(selection: typeof seed) {
  return { backend: { backend: selection.backend, sourceSha: selection.sourceSha, treeSha: selection.treeSha, ciRunId: selection.ciRunId, expiresAt: selection.expiresAt, provenance: 'OFFICIAL_COMPLETED_BACKEND_ADMISSION' }, web: { web: selection.web, sourceSha: selection.sourceSha, expiresAt: selection.expiresAt, provenance: 'CURRENT_VERIFIED_WEB_DEPLOYMENT' }, ui: { ui: selection.ui, sourceSha: selection.sourceSha, treeSha: selection.treeSha, scopeSha256: digest(canonicalReleaseReviewJson(selection.scope)), status: 'UI_LOOP_VERIFIED', expiresAt: selection.expiresAt, provenance: 'OFFICIAL_UI_ARTIFACT_ADMISSION' } };
}
// Runner path/platform guards are genuine production requirements; fixture
// loader substitutes those two local primitives only. Source and official
// metadata readers remain real, with controlled HTTP/consumer fact ports.
async function controlled(_owner: Awaited<ReturnType<typeof api>>) {
  const url = pathToFileURL(resolve(import.meta.dirname, 'backend-hosted-learning-loop-admission.ts')).href;
  const source = await readFile(new URL(url), 'utf8');
  const hook = registerHooks({ load(selected, context, next) { if (selected === url + '?controlled') return { format: 'module', shortCircuit: true, source: transformSync(source.replace("process.platform !== 'linux'", 'false').replace("!input.repoRoot.startsWith('/home/runner/work/')", 'false'), { loader: 'ts', format: 'esm' }).code }; return next(selected, context); } });
  try { return await import(url + '?controlled') as typeof _owner; } finally { hook.deregister(); }
}

test('current native QA admits its own protected run while completed producers stay separate facts', async () => {
  await fixture(async (owner, input, _facts, _replies, calls, ports) => {
    const reader = await controlled(owner), result = await reader.readHostedLearningLoopNativeAdmission(input, ports);
    assert.equal(result.purpose, 'CUEVO_HOSTED_LEARNING_LOOP_NATIVE'); assert.equal(result.status, 'NATIVE_QA_ADMITTED'); assert.equal(result.nativeExecutionVerified, false); assert.equal(result.hostedAcceptance, false);
    assert.equal(result.approval.releaseRunId, '91'); assert.equal(result.selection.backend.runId, '51'); assert.equal(result.selection.ui.runId, '81');
    assert.equal(calls.filter(path => path === 'actions/runs/91').length, 2); assert.equal(calls.filter(path => path === 'backend').length, 2);
    assert(!JSON.stringify(result).includes('private-qa-token'));
  });
});

test('wrong current purpose attempt signed source artifact or alias refuses without native execution', async () => {
  for (const mode of ['workflow', 'attempt', 'signature', 'artifact', 'alias', 'approval'] as const) await fixture(async (owner, input, facts, replies, _calls, ports) => {
    const reader = await controlled(owner);
    if (mode === 'workflow') replies.set('actions/runs/91', { ...(replies.get('actions/runs/91') as object), path: '.github/workflows/backend-release.yml' });
    if (mode === 'attempt') replies.set('actions/runs/91', { ...(replies.get('actions/runs/91') as object), run_attempt: 3 });
    if (mode === 'signature') { const selected = owner.validatePreparedHostedLearningLoopNativePackage(input.prepared, Date.now()); replies.set('git/commits/' + selected.sourceSha, { sha: selected.sourceSha, tree: { sha: selected.treeSha }, verification: { verified: false, reason: 'unsigned', signature: null, payload: null } }); }
    if (mode === 'artifact') facts.ui.ui.archiveSha256 = '0'.repeat(64);
    if (mode === 'alias') facts.web.web.origin = 'https://older.vercel.app';
    if (mode === 'approval') replies.set('actions/runs/91/approvals', [{ environments: [{ id: 123, name: 'staging' }], state: 'approved', user: { id: 95836629, login: 'attaulhaq0', type: 'User' }, comment: 'Cuevo backend staging admission approved' }]);
    await assert.rejects(reader.readHostedLearningLoopNativeAdmission(input, ports), /requires review; contents withheld/);
  });
});

test('completed UI uncertainty admits original reconciliation only and never full-loop permission', async () => {
  await fixture(async (owner, input, facts, _replies, _calls, ports) => {
    const reader = await controlled(owner); facts.ui.status = 'ORIGINALS_RETAINED'; await assert.rejects(reader.readHostedLearningLoopNativeAdmission(input, ports));
  });
  await fixture(async (owner, input, facts, replies, _calls, ports) => {
    const current = owner.validatePreparedHostedLearningLoopNativePackage(input.prepared, Date.now()), selection: Record<string, unknown> = { ...current };
    delete selection.version; delete selection.purpose; selection.mode = 'ORIGINAL_RECONCILIATION';
    const prepared = owner.prepareHostedLearningLoopNativePackage(selection, Date.now()); input.prepared = prepared;
    const rows = replies.get('actions/runs/91/approvals') as { comment: string }[]; rows[0].comment = prepared.comment; facts.ui.status = 'ORIGINALS_RETAINED';
    const reader = await controlled(owner), result = await reader.readHostedLearningLoopNativeAdmission(input, ports);
    assert.equal(result.selection.mode, 'ORIGINAL_RECONCILIATION'); assert.equal(result.nativeExecutionVerified, false);
  });
});

test('current QA attempt control approval or producer facts revoked mid-proof cannot remain admitted', async () => {
  for (const mode of ['attempt', 'control', 'approval', 'facts', 'expiry'] as const) await fixture(async (owner, input, facts, replies, _calls, ports) => {
    const reader = await controlled(owner), original = ports.readOfficialUiArtifact as () => Promise<unknown>; let reads = 0;
    ports.readOfficialUiArtifact = async () => { if (++reads === 2) { if (mode === 'attempt') replies.set('actions/runs/91', { ...(replies.get('actions/runs/91') as object), run_attempt: 3 }); if (mode === 'control') replies.set('branches/main/protection/required_signatures', { enabled: false }); if (mode === 'approval') replies.set('actions/runs/91/approvals', []); if (mode === 'facts') facts.ui.ui.commandManifestSha256 = '0'.repeat(64); if (mode === 'expiry') facts.ui.expiresAt = '2000-01-01T00:00:00.000Z'; } return original(); };
    await assert.rejects(reader.readHostedLearningLoopNativeAdmission(input, ports));
  });
});

test('producer credentials or a shorter original expiry cannot be copied into native QA admission', async () => {
  for (const mode of ['credential', 'shorter-expiry'] as const) await fixture(async (owner, input, facts, _replies, _calls, ports) => {
    const reader = await controlled(owner);
    if (mode === 'credential') Object.assign(facts.backend, { databasePassword: 'private-native-secret' });
    else facts.backend.expiresAt = new Date(Date.now() + 30000).toISOString();
    await assert.rejects(reader.readHostedLearningLoopNativeAdmission(input, ports), error => error instanceof Error && !error.message.includes('private-native-secret'));
  });
});

test('runner identity or a port accessor is refused before consuming any protected producer fact', async () => {
  await fixture(async (owner, input, _facts, _replies, calls, ports) => {
    const reader = await controlled(owner); process.env.GITHUB_RUN_ATTEMPT = '3'; await assert.rejects(reader.readHostedLearningLoopNativeAdmission(input, ports)); assert.equal(calls.length, 0);
    process.env.GITHUB_RUN_ATTEMPT = '2'; let reads = 0;
    const getter = Object.defineProperty({ ...ports }, 'readCompletedBackend', { enumerable: true, get() { reads++; return ports.readCompletedBackend; } });
    await assert.rejects(reader.readHostedLearningLoopNativeAdmission(input, getter)); assert.equal(reads, 0); assert.equal(calls.length, 0);
  });
});
