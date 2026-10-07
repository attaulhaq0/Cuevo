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

test('full receipt refuses unknown private fields before projecting any source evidence', () => {
  const raw = input();
  assert.throws(() => fullVerificationSummary({ ...raw, evidence: { ...raw.evidence, privateDiagnostic: 'private-canary' } }));
  assert.throws(() => fullVerificationSummary({ ...raw, evidence: { ...raw.evidence, rows: [{ ...raw.evidence.rows[0], privateDiagnostic: 'private-canary' }, ...raw.evidence.rows.slice(1)] } }));
  assert.throws(() => fullVerificationSummary({ ...raw, privateDiagnostic:'private-canary' } as typeof raw));
});

test('full candidate receipt declares its fixture scope and separate acceptance windows without claiming customer acceptance', () => {
  const summary=fullVerificationSummary(input()) as unknown as { technicalAcceptanceScope?:{version:number;hostedAcceptance:boolean;customerAcceptance:boolean;separateBrowserWindows:unknown[];separateIntegrationWindows:unknown[]};technicalAcceptanceScopeSha256?:string };
  assert.ok(summary.technicalAcceptanceScope);
  assert.equal(summary.technicalAcceptanceScope.version,1);
  assert.equal(summary.technicalAcceptanceScope.hostedAcceptance,false);assert.equal(summary.technicalAcceptanceScope.customerAcceptance,false);
  assert.equal(summary.technicalAcceptanceScope.separateBrowserWindows.length,18);assert.equal(summary.technicalAcceptanceScope.separateIntegrationWindows.length,1);
  assert.match(summary.technicalAcceptanceScopeSha256??'',/^[a-f0-9]{64}$/);
});
