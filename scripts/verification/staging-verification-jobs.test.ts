import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const run = { id: 31, head_sha: 'a'.repeat(40), head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/staging-verification.yml', run_attempt: 2, repository: { full_name: 'owner/repo' } };
function canonical(path: string): unknown {
  const securityRun = { ...run, id: 41, path: '.github/workflows/ci.yml' };
  if (path === 'git/ref/heads/main') return { object: { type: 'commit', sha: run.head_sha } };
  if (path.startsWith('actions/workflows/ci.yml/runs?')) return { total_count: 1, workflow_runs: [securityRun] };
  if (path === 'actions/runs/41') return securityRun;
  if (path === 'actions/runs/41/attempts/2/jobs?per_page=100&page=1') {
    const names = ['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund', 'Run npm ci --ignore-scripts --no-audit --no-fund', 'Run node node_modules/esbuild/install.js', 'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2', 'Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2', 'Require current processed CodeQL security findings to be clear'];
    return { total_count: 1, jobs: [{ id: 51, name: 'codeql', run_id: 41, run_attempt: 2, head_sha: run.head_sha, head_branch: 'main', status: 'completed', conclusion: 'success', steps: names.map((name, index) => ({ name, number: index + 1, status: 'completed', conclusion: 'success' })) }] };
  }
  return undefined;
}
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'staging-verification-jobs.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.readStagingVerificationJobs, 'function', 'official focused run-attempt jobs reader exists');
  return subject as typeof import('./staging-verification-jobs');
}
async function fixture() {
  const { stagingVerificationJobPolicy } = await import('./staging-verification');
  return Object.entries(stagingVerificationJobPolicy).map(([name, policy], index) => ({
    id: index + 1, name, run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, head_branch: 'main', status: 'completed', conclusion: 'success',
    steps: [{ name: 'Set up job', number: 1, status: 'completed', conclusion: 'success' },
      ...policy.steps.map((step, position) => ({ name: step, number: position + 2, status: 'completed', conclusion: 'success' })),
      { name: 'Complete job', number: policy.steps.length + 2, status: 'completed', conclusion: 'success' }],
  }));
}

test('only official exhaustive attempt jobs create deterministic narrow evidence and canonical CI needs no extra read', async () => {
  const { readStagingVerificationJobs } = await api(); const jobs = await fixture(), calls: string[] = [];
  const reader = async (path: string) => { calls.push(path); return canonical(path) ?? (path === 'actions/runs/31' ? run : { total_count: jobs.length, jobs }); };
  const proof = await readStagingVerificationJobs(run, reader);
  assert.equal(proof?.runAttempt, 2); assert.match(proof?.jobsSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.deepEqual(calls.filter(path => path.startsWith('actions/runs/31')), ['actions/runs/31', 'actions/runs/31/attempts/2/jobs?per_page=100&page=1', 'actions/runs/31']);
  assert.ok(calls.includes('actions/runs/41/attempts/2/jobs?per_page=100&page=1'));
  const withTimestamps = jobs.map(job => ({ ...job, started_at: '2026-10-07T00:00:00Z', completed_at: '2026-10-07T00:01:00Z' }));
  assert.deepEqual(await readStagingVerificationJobs(run, async path => canonical(path) ?? (path === 'actions/runs/31' ? run : { total_count: jobs.length, jobs: withTimestamps })), proof);
  const legacy = { ...run, path: '.github/workflows/ci.yml' };
  assert.equal(await readStagingVerificationJobs(legacy, async () => { throw Error('canonical must not read jobs'); }), undefined);
});

test('failed skipped missing unexpected jobs or required steps cannot be admitted by aggregate success', async () => {
  const { readStagingVerificationJobs } = await api();
  for (const mode of ['failed-job', 'skipped-job', 'missing-job', 'extra-job', 'missing-step', 'failed-step', 'skipped-step', 'duplicate-step', 'extra-step', 'wrong-sha', 'wrong-attempt', 'wrong-run', 'duplicate-job']) {
    const jobs = await fixture();
    if (mode === 'missing-job') jobs.pop();
    else if (mode === 'extra-job') jobs.push({ ...jobs[0], id: 100, name: 'untrusted-job' });
    else if (mode === 'duplicate-job') jobs.push({ ...jobs[0] });
    else if (mode === 'failed-job') jobs[0].conclusion = 'failure';
    else if (mode === 'skipped-job') jobs[0].conclusion = 'skipped';
    else if (mode === 'wrong-sha') jobs[0].head_sha = 'b'.repeat(40);
    else if (mode === 'wrong-attempt') jobs[0].run_attempt++;
    else if (mode === 'wrong-run') jobs[0].run_id++;
    else if (mode === 'missing-step') jobs[0].steps.splice(1, 1);
    else if (mode === 'failed-step') jobs[0].steps[1].conclusion = 'failure';
    else if (mode === 'skipped-step') jobs[0].steps[1].conclusion = 'skipped';
    else if (mode === 'duplicate-step') jobs[0].steps.push({ ...jobs[0].steps[1], number: 99 });
    else jobs[0].steps.push({ ...jobs[0].steps[1], name: 'unexpected admission', number: 99 });
    await assert.rejects(readStagingVerificationJobs(run, async path => path === 'actions/runs/31' ? run : { total_count: jobs.length, jobs }), mode);
  }
});

test('job pages require consistent bounded complete counts and no duplicated or hidden rows', async () => {
  const { readStagingVerificationJobs } = await api();
  const jobs = await fixture();
  for (const response of [{ total_count: null, jobs }, { total_count: 0, jobs }, { total_count: 1001, jobs: [] }, { total_count: jobs.length + 1, jobs }, { total_count: jobs.length - 1, jobs }, { total_count: jobs.length, jobs: [] }]) {
    await assert.rejects(readStagingVerificationJobs(run, async path => path === 'actions/runs/31' ? run : response));
  }
});

test('rerun and source changes during official collection refuse original successful evidence', async () => {
  const { readStagingVerificationJobs } = await api(), jobs = await fixture();
  for (const fields of [{ run_attempt: 3 }, { status: 'in_progress', conclusion: null }, { head_sha: 'b'.repeat(40) }, { repository: { full_name: 'fork/repo' } }]) {
    let reads = 0;
    await assert.rejects(readStagingVerificationJobs(run, async path => path === 'actions/runs/31' ? (++reads > 1 ? { ...run, ...fields } : run) : { total_count: jobs.length, jobs }));
  }
});

test('only known optional GitHub action cleanup may be skipped and private reader failures stay redacted', async () => {
  const { readStagingVerificationJobs } = await api(), jobs = await fixture();
  jobs[0].steps.splice(jobs[0].steps.length - 1, 0, { name: 'Post Check out frozen source', number: jobs[0].steps.length, status: 'completed', conclusion: 'skipped' });
  jobs[0].steps[jobs[0].steps.length - 1].number++;
  assert.ok(await readStagingVerificationJobs(run, async path => canonical(path) ?? (path === 'actions/runs/31' ? run : { total_count: jobs.length, jobs })));
  await assert.rejects(readStagingVerificationJobs(run, async () => { throw Error('private provider credential'); }), error => error instanceof Error && !error.message.includes('private provider credential'));
});
