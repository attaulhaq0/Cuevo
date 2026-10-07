import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
const expected = { sha: 'a'.repeat(40), repository: 'owner/repo' };
const run = { id: 41, run_attempt: 2, head_sha: expected.sha, head_branch: 'main', event: 'push', status: 'in_progress', conclusion: null, path: '.github/workflows/ci.yml', repository: { full_name: expected.repository } };
const requiredSteps = ['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund', 'Run npm ci --ignore-scripts --no-audit --no-fund', 'Run node node_modules/esbuild/install.js', 'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2', 'Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2', 'Require current processed CodeQL security findings to be clear'];
const job = () => ({ id: 51, name: 'codeql', run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, head_branch: 'main', status: 'completed', conclusion: 'success', steps: requiredSteps.map((name, index) => ({ name, number: index + 1, status: 'completed', conclusion: 'success' })) });
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'staging-security.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.readCanonicalStagingSecurity, 'function', 'canonical same-source security job reader exists');
  return subject as typeof import('./staging-security');
}
function fixture(mutate: (path: string, value: unknown, count: number) => unknown = (_path, value) => value) {
  const calls: string[] = [];
  const reader = async (path: string): Promise<unknown> => {
    calls.push(path); let value: unknown;
    if (path === 'git/ref/heads/main') value = { object: { type: 'commit', sha: expected.sha } };
    else if (path.startsWith('actions/workflows/ci.yml/runs?')) value = { total_count: 1, workflow_runs: [run] };
    else if (path === 'actions/runs/41') value = run;
    else if (path === 'actions/runs/41/attempts/2/jobs?per_page=100&page=1') value = { total_count: 2, jobs: [job(), { id: 52, name: 'technical-mvp', run_id: run.id, run_attempt: 2, head_sha: run.head_sha, head_branch: 'main', status: 'in_progress', conclusion: null }] };
    else assert.fail('unexpected fixed official route');
    return mutate(path, value, calls.filter(value => value === path).length);
  };
  return { reader, calls };
}
test('same-main completed canonical security admits focused staging while browser and full CI are still running', async () => {
  const { readCanonicalStagingSecurity } = await api(), f = fixture();
  const result = await readCanonicalStagingSecurity(expected, f.reader);
  assert.equal(result.status, 'VERIFIED'); if (result.status !== 'VERIFIED') assert.fail();
  assert.equal(result.runId, 41); assert.equal(result.runAttempt, 2); assert.equal(result.jobId, 51); assert.match(result.jobsSha256, /^[a-f0-9]{64}$/);
  assert.equal(f.calls.filter(path => path === 'actions/runs/41').length, 2);
  assert.equal(f.calls.filter(path => path === 'git/ref/heads/main').length, 2);
  assert.ok(f.calls.some(path => path.includes(`head_sha=${expected.sha}`)));
});
test('pending known canonical security returns NOT_READY without claiming zero findings or completed full CI', async () => {
  const { readCanonicalStagingSecurity } = await api();
  const pending = fixture((path, value) => path.includes('/jobs?') ? { total_count: 1, jobs: [{ ...job(), status: 'in_progress', conclusion: null, steps: [] }] } : value);
  assert.deepEqual(await readCanonicalStagingSecurity(expected, pending.reader), { status: 'NOT_READY', runId: 41, runAttempt: 2 });
  const notStarted = fixture((path, value) => path.startsWith('actions/workflows/') ? { total_count: 0, workflow_runs: [] } : value);
  assert.deepEqual(await readCanonicalStagingSecurity(expected, notStarted.reader), { status: 'NOT_READY' });
});
test('failed skipped missing security steps stale source cancelled run changed attempts and unknown metadata refuse', async () => {
  const { readCanonicalStagingSecurity } = await api();
  for (const mode of ['failed-job', 'skipped-step', 'missing-gate', 'wrong-source', 'cancelled-run', 'wrong-attempt', 'changed-attempt', 'changed-main', 'missing-job', 'bad-page']) {
    const f = fixture((path, value, count) => {
      if (path.includes('/jobs?')) {
        const row = job();
        if (mode === 'failed-job') row.conclusion = 'failure';
        if (mode === 'skipped-step') row.steps[6].conclusion = 'skipped';
        if (mode === 'missing-gate') row.steps.pop();
        if (mode === 'wrong-attempt') row.run_attempt++;
        if (mode === 'wrong-source') row.head_sha = 'b'.repeat(40);
        if (mode === 'missing-job') return { total_count: 1, jobs: [{ ...row, name: 'technical-mvp' }] };
        if (mode === 'bad-page') return { total_count: 2, jobs: [row] };
        return { total_count: 1, jobs: [row] };
      }
      if (path === 'actions/runs/41' && mode === 'cancelled-run') return { ...run, status: 'completed', conclusion: 'cancelled' };
      if (path === 'actions/runs/41' && mode === 'missing-job') return { ...run, status: 'completed', conclusion: 'success' };
      if (path === 'actions/runs/41' && mode === 'changed-attempt' && count > 1) return { ...run, run_attempt: 3 };
      if (path === 'git/ref/heads/main' && mode === 'changed-main' && count > 1) return { object: { type: 'commit', sha: 'b'.repeat(40) } };
      return value;
    });
    await assert.rejects(readCanonicalStagingSecurity(expected, f.reader), mode);
  }
});
test('staging security runner context is exact main secret-free Actions source and provider errors are redacted', async () => {
  const { readStagingSecurityContext, readCanonicalStagingSecurity } = await api();
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_JOB: 'codeql', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: expected.sha, GITHUB_WORKFLOW_SHA: expected.sha, GITHUB_REPOSITORY: expected.repository, GITHUB_WORKFLOW_REF: `${expected.repository}/.github/workflows/staging-verification.yml@refs/heads/main`, GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com', GITHUB_EVENT_NAME: 'push', GH_TOKEN: 'fixture-token' };
  assert.deepEqual(readStagingSecurityContext(env, expected.sha), { ...expected, token: 'fixture-token' });
  assert.deepEqual(readStagingSecurityContext({ ...env, GITHUB_JOB: 'codeql-evidence', GITHUB_WORKFLOW_REF: `${expected.repository}/.github/workflows/full-regression.yml@refs/heads/main`, GITHUB_EVENT_NAME: 'schedule' }, expected.sha), { ...expected, token: 'fixture-token' });
  for (const change of [{ GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_JOB: 'other' }, { GITHUB_API_URL: 'https://other.invalid' }, { GITHUB_REF: 'refs/heads/other' }, { GH_TOKEN: 'bad\nsecret' }]) assert.throws(() => readStagingSecurityContext({ ...env, ...change }, expected.sha));
  await assert.rejects(readCanonicalStagingSecurity(expected, async () => { throw Error('private provider credential'); }), error => error instanceof Error && !error.message.includes('private provider credential'));
});
