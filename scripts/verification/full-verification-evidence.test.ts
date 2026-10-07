import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fullVerificationSummary } from './full-verification-evidence';
import { verificationSteps } from './steps';
const sourceSha = 'a'.repeat(40), treeSha = 'b'.repeat(40), before = [{ path: 'source.ts', sha256: 'c'.repeat(64) }];
const env = { GITHUB_SHA: sourceSha, GITHUB_WORKFLOW_SHA: sourceSha, GITHUB_REF: 'refs/heads/main', GITHUB_JOB: 'technical-mvp', GITHUB_ACTIONS: 'true', CI: 'true', GITHUB_REPOSITORY: 'owner/repo', GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/full-regression.yml@refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', CUEVO_FULL_VERIFICATION_PURPOSE: 'customer-candidate', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' };
const input = () => ({ env: { ...env }, sourceSha, treeSha, before, after: structuredClone(before), evidence: { status: 'VERIFIED', rows: [...verificationSteps.map(step => ({ name: step.name, exitCode: 0, required: true as const, durationMs: 1 })), { name: 'source-freeze', exitCode: 0, required: true as const, durationMs: 1 }] } });
test('full source receipt distinguishes scheduled regression from an explicit customer candidate', () => {
  assert.equal(fullVerificationSummary(input()).profile, 'CUSTOMER_CANDIDATE');
  assert.equal(fullVerificationSummary({ ...input(), env: { ...env, GITHUB_EVENT_NAME: 'schedule', CUEVO_FULL_VERIFICATION_PURPOSE: 'regression' } }).profile, 'FULL_REGRESSION');
  assert.throws(() => fullVerificationSummary({ ...input(), env: { ...env, GITHUB_EVENT_NAME: 'schedule' } }));
});
test('missing checks source drift routine evidence and wrong run context cannot produce full acceptance', () => {
  const missing = input(); missing.evidence.rows.pop(); assert.throws(() => fullVerificationSummary(missing));
  const failed = input(); failed.evidence.rows[0].exitCode = 1; assert.throws(() => fullVerificationSummary(failed));
  assert.throws(() => fullVerificationSummary({ ...input(), after: [] }));
  assert.throws(() => fullVerificationSummary({ ...input(), env: { ...env, GITHUB_REF: 'refs/heads/other' } }));
  assert.throws(() => fullVerificationSummary({ ...input(), evidence: { status: 'ROUTINE_VERIFIED', rows: [] } }));
});
