import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backendWebTransferFixture } from './backend-web-transfer-fixtures';
import { validateBackendWebTransfer } from './backend-web-transfer';
import { canonicalReleaseReviewJson } from './release-review';
import { backendSelectionForWebEvent, encodeWebBackendSelection, readWebBackendSelection, bindWebReviewToBackend, readCanonicalWebOutput, type WebBackendBridge } from './web-backend-bridge';

test('web bridge binds only complete manual staging selection and faithful operator review facts', async () => {
  const api = await import(pathToFileURL(resolve(import.meta.dirname, 'web-backend-bridge.ts')).href).catch(() => ({}));
  assert.equal(typeof api.backendSelectionForWebEvent, 'function');
  assert.equal(typeof api.bindWebReviewToBackend, 'function');
  assert.equal(typeof api.readWebBackendBridge, 'function');
});

test('only complete numeric manual staging selection is admitted; no partial fallback or production bridge', () => {
  const inputs = { backend_run_id: '51', backend_run_attempt: '1', backend_artifact_id: '71', backend_transfer_sha256: 'a'.repeat(64) };
  const selected = backendSelectionForWebEvent({ inputs }, 'workflow_dispatch', 'staging'); assert.equal(selected?.backendRunId, '51');
  assert.deepEqual(readWebBackendSelection(encodeWebBackendSelection(selected)), selected);
  assert.equal(backendSelectionForWebEvent({ inputs: {} }, 'workflow_dispatch', 'staging'), null);
  assert.equal(backendSelectionForWebEvent({}, 'workflow_run', 'production'), null);
  for (const mode of ['partial', 'number', 'junk', 'production', 'automatic', 'coerced']) {
    const changed: Record<string, unknown> = { ...inputs };
    if (mode === 'partial') changed.backend_artifact_id = '';
    if (mode === 'number') changed.backend_run_id = 51;
    if (mode === 'junk') changed.backend_run_attempt = '1;echo';
    if (mode === 'coerced') changed.backend_run_attempt = ' 1 ';
    assert.throws(() => backendSelectionForWebEvent({ inputs: changed }, mode === 'automatic' ? 'workflow_run' : 'workflow_dispatch', mode === 'production' ? 'production' : 'staging'));
  }
});
test('operating web bridge requires explicit manual staging purpose and refuses production selection',()=>{const inputs={backend_run_id:'51',backend_run_attempt:'1',backend_artifact_id:'71',backend_transfer_sha256:'a'.repeat(64),backend_handoff:'operating-staging'},selection=backendSelectionForWebEvent({inputs},'workflow_dispatch','staging');assert.equal(selection?.handoff,'operating-staging');assert.deepEqual(readWebBackendSelection(encodeWebBackendSelection(selection)),selection);assert.throws(()=>backendSelectionForWebEvent({inputs},'workflow_dispatch','production'));assert.throws(()=>backendSelectionForWebEvent({inputs:{...inputs,backend_handoff:'customer-ready'}},'workflow_dispatch','staging'));});

function reviewFixture() {
  const fixture = backendWebTransferFixture(), admitted = validateBackendWebTransfer(fixture.transfer, fixture.now), b = admitted.body;
  const bridge = { manifest: admitted.manifest, reviewFacts: admitted.reviewFacts, assignments: admitted.assignments, backendIdentity: { repository: b.repository, sourceSha: b.releaseSha, baseSha: b.baseSha, ciRunId: b.ciRunId, web: b.targets.web, manifestSha256: fixture.transfer.manifestSha256 } } as WebBackendBridge;
  const review = { version: 1, repository: b.repository, releaseSha: b.releaseSha, baseSha: b.baseSha, ciRunId: b.ciRunId, web: { teamId: b.targets.web.teamId, projectId: b.targets.web.projectId, target: b.targets.web.target }, sourceManifestSha256: b.fingerprints.sourceManifestSha256, diffSha256: b.fingerprints.diffSha256, manifestSha256: '0'.repeat(64),
    reviews: b.reviews.map(row => ({ category: row.category, taskId: row.taskId, releaseSha: row.releaseSha, baseSha: row.baseSha, sourceManifestSha256: row.sourceManifestSha256, diffSha256: row.diffSha256, reportSha256: row.reportSha256, evidenceSha256: row.evidenceSha256, reviewedAt: row.reviewedAt, provenance: 'RETAINED_INDEPENDENT_AGENT_REPORT', independenceAttested: true })) };
  const assignments = { baseSha: b.baseSha, reviews: admitted.assignments.map(row => ({ ...row })) };
  return { bridge, review, assignments };
}
test('actual operator review flags survive exact original backend facts; only bound manifest digest changes', () => {
  const { bridge, review, assignments } = reviewFixture();
  const bound = bindWebReviewToBackend(review, assignments, bridge);
  assert.equal(bound.manifestSha256, bridge.backendIdentity.manifestSha256);
  assert.deepEqual(bound.reviews, review.reviews); assert.equal(review.manifestSha256, '0'.repeat(64));
  assert.equal(bindWebReviewToBackend(review, { ...assignments, reviews: [...assignments.reviews].reverse() }, bridge).manifestSha256, bound.manifestSha256);
});
test('missing independent flags or altered tasks reports time assignments and source cannot create passing review', () => {
  for (const mode of ['flag', 'provenance', 'task', 'report', 'time', 'assignment', 'source']) {
    const { bridge, review, assignments } = reviewFixture();
    if (mode === 'flag') review.reviews[0].independenceAttested = false;
    if (mode === 'provenance') review.reviews[0].provenance = 'invented';
    if (mode === 'task') review.reviews[0].taskId = 'other-review';
    if (mode === 'report') review.reviews[0].reportSha256 = '0'.repeat(64);
    if (mode === 'time') review.reviews[0].reviewedAt = new Date().toISOString();
    if (mode === 'assignment') assignments.reviews[0].evidenceSha256 = '0'.repeat(64);
    if (mode === 'source') review.releaseSha = '0'.repeat(40);
    assert.throws(() => bindWebReviewToBackend(review, assignments, bridge), /contents withheld/, mode);
  }
});
test('canonical job output decode refuses malformed base64/JSON and accepts exact bounded output', () => {
  const value = { status: 'safe' }, encoded = Buffer.from(canonicalReleaseReviewJson(value)).toString('base64'); assert.deepEqual(readCanonicalWebOutput(encoded), value);
  for (const text of ['@@', Buffer.from('{ "status": "safe" }').toString('base64'), encoded + '=', '']) assert.throws(() => readCanonicalWebOutput(text));
});
