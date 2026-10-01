import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePortfolioItem, parsePortfolioRevision, parsePrivateAsset } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const item = { id: 'p', revisionId: 'pr1', revision: 1, learnerId: 'l', sourceModel: 'numeric', title: 'Selected explanation', reflection: 'I explained the source.', createdAt: '2026-10-01T00:00:00Z', feedback: null, featured: false, approvalState: 'AWAITING_REVIEW', parentVisible: false, reviewedAt: null, evidenceId: 'e', resultId: 'r', submissionId: 's', referenceId: 'ref', referenceVersion: 'v1', policyVersion: 2, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 2 }, assessmentTitle: 'School task', referenceTitle: 'Objective' };
test('selected work preserves zero and source/native revision without inheriting parent approval', () => {
  const result = parsePortfolioItem(item); assert.equal(result.parentVisible, false);
  assert.throws(() => parsePortfolioItem({ ...item, parentVisible: true }), LearningApiError);
  assert.throws(() => parsePortfolioItem({ ...item, evidenceId: null }), LearningApiError);
});
test('reviewed portfolio must retain human feedback and reviewed time', () => {
  const reviewed = { ...item, approvalState: 'REVIEWED', feedback: 'Teacher reviewed work.', reviewedAt: '2026-10-01T00:01:00Z', parentVisible: true };
  assert.equal(parsePortfolioItem(reviewed).approvalState, 'REVIEWED');
  assert.throws(() => parsePortfolioItem({ ...reviewed, reviewedAt: null }), LearningApiError);
});
test('history preserves distinct immutable revision identities in bounded pagination', () => { assert.equal(parsePortfolioRevision(item).id, 'pr1'); assert.equal(parsePortfolioRevision({ ...item, revisionId: 'pr2', revision: 2 }).id, 'pr2'); });
test('private asset metadata rejects oversized or unknown files before upload controls', () => { const asset = { id: 'a', ownerId: 'l', name: 'work.txt', contentType: 'text/plain', byteSize: 12, sha256: 'a'.repeat(64), state: 'AVAILABLE', createdAt: '2026-10-01T00:00:00Z' }; assert.equal(parsePrivateAsset(asset).byteSize, 12); assert.throws(() => parsePrivateAsset({ ...asset, byteSize: 524289 }), LearningApiError); assert.throws(() => parsePrivateAsset({ ...asset, contentType: 'text/html' }), LearningApiError); });
