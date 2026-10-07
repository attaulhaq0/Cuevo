import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { validateCiRun } from './cicd-contracts';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown; dump(value: unknown): string };
const expected = { sha: 'a'.repeat(40), repository: 'owner/repo', ciRunId: '31' };
const legacy = { id: 31, head_sha: expected.sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: expected.repository } };
const focused = { ...legacy, event: 'workflow_dispatch', path: '.github/workflows/staging-verification.yml', run_attempt: 2 };
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'staging-verification.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.validateBackendVerificationRun, 'function', 'focused backend verification admission exists');
  return subject as typeof import('./staging-verification');
}

test('backend verification preserves canonical CI and admits only exact main focused successful run attempts', async () => {
  const { validateBackendVerificationRun, backendVerificationRunSchema } = await api();
  assert.deepEqual(validateBackendVerificationRun({ ...legacy, run_attempt: 7, extra: 'provider metadata' }, expected), legacy);
  assert.deepEqual(validateBackendVerificationRun({ ...focused, repository: { ...focused.repository, id: 77, owner: { login: 'owner' } }, run_number: 8 }, expected), focused);
  assert.deepEqual(validateBackendVerificationRun(focused, expected), focused);
  assert.deepEqual(validateBackendVerificationRun({ ...focused, event: 'push' }, expected), { ...focused, event: 'push' });
  assert.deepEqual(backendVerificationRunSchema.parse(focused), focused);
  assert.throws(() => backendVerificationRunSchema.parse({ ...legacy, run_attempt: 1 }));
  assert.throws(() => validateCiRun(focused, expected), 'the production validator cannot admit focused staging verification');
});

test('wrong source repository run branch event status path and unknown attempt cannot become staging evidence', async () => {
  const { validateBackendVerificationRun } = await api();
  for (const fields of [{ head_sha: 'b'.repeat(40) }, { repository: { full_name: 'fork/repo' } }, { id: 32 }, { head_branch: 'feature' }, { event: 'pull_request' }, { event: 'pull_request_target' }, { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'skipped' }, { path: '.github/workflows/other.yml' }, { run_attempt: 0 }, { run_attempt: 0.5 }, { run_attempt: undefined }]) {
    assert.throws(() => validateBackendVerificationRun({ ...focused, ...fields }, expected));
  }
  assert.throws(() => validateBackendVerificationRun({ ...legacy, event: 'workflow_dispatch' }, expected));
  let reads = 0;
  assert.throws(() => validateBackendVerificationRun({ ...focused, get path() { reads++; return focused.path; } }, expected));
  assert.equal(reads, 0);
});

test('focused workflow runs every fixed security migration and guarded database boundary without hosted secrets', async () => {
  const { validateStagingVerificationWorkflow, stagingVerificationJobPolicy } = await api();
  const text = await readFile('.github/workflows/staging-verification.yml', 'utf8');
  assert.deepEqual(validateStagingVerificationWorkflow(text), []);
  const flow = yaml.load(text) as { jobs: Record<string, { steps: { name: string }[] }> };
  assert.deepEqual(Object.keys(flow.jobs).sort(), Object.keys(stagingVerificationJobPolicy).sort());
  for (const [name, policy] of Object.entries(stagingVerificationJobPolicy)) assert.deepEqual(flow.jobs[name].steps.map(step => step.name), policy.steps);
});

test('workflow contract rejects broadened trigger secret exposure skipped security altered commands and missing dependencies', async () => {
  const { validateStagingVerificationWorkflow } = await api();
  const text = await readFile('.github/workflows/staging-verification.yml', 'utf8');
  for (const mutate of [
    (flow: Record<string, unknown>) => { flow.on = { pull_request: null }; },
    (flow: Record<string, unknown>) => { flow.env = { SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}' }; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs.codeql.if = 'false'; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; (jobs['staging-database'].steps as Record<string, unknown>[]).find(step => step.run === 'npm run db:test')!.run = 'echo passed'; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs['staging-required'].needs = ['staging-checks']; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; delete jobs['secret-scan']; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs['staging-checks']['continue-on-error'] = true; },
  ]) {
    const flow = yaml.load(text) as Record<string, unknown>; mutate(flow);
    assert.ok(validateStagingVerificationWorkflow(yaml.dump(flow)).length > 0);
  }
});
