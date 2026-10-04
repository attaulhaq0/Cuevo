import assert from 'node:assert/strict';
import test from 'node:test';
import { parentAcademicContinuationFailure } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const prior = () => ({ scope: 'current-school:parent:child:access:refresh', data: [{ id: 'source', feedback: 'Private earlier feedback' }], nextCursor: 'next-page', loading: false, loadingMore: true, loaded: true, error: null as LearningApiError | null, moreError: null as LearningApiError | null });

test('denied, expired and invalid parent continuations clear private records and prevent same-frame paging', () => {
  for (const kind of ['denied', 'unauthorized', 'invalid'] as const) {
    const failure = new LearningApiError(kind);
    const original = prior();
    const result = parentAcademicContinuationFailure(original, failure);
    assert.deepEqual(result.data, []);
    assert.equal(result.nextCursor, null);
    assert.equal(result.error, failure);
    assert.equal(result.moreError, null);
    assert.equal(result.loadingMore, false);
    assert.equal(result.scope, original.scope);
    assert.deepEqual(original.data, [{ id: 'source', feedback: 'Private earlier feedback' }]);
  }
});

test('temporary service failure preserves admitted parent feedback and the original continuation cursor', () => {
  const original = prior(), failure = new LearningApiError('unavailable');
  const result = parentAcademicContinuationFailure(original, failure);
  assert.equal(result.data, original.data);
  assert.equal(result.nextCursor, original.nextCursor);
  assert.equal(result.error, null);
  assert.equal(result.moreError, failure);
  assert.equal(result.loadingMore, false);
});

test('an unexpected continuation parser failure is an invalid source and cannot retain private feedback', () => {
  const result = parentAcademicContinuationFailure(prior(), new Error('Untrusted response detail'));
  assert.deepEqual(result.data, []);
  assert.equal(result.nextCursor, null);
  assert.equal(result.error?.kind, 'invalid');
  assert.equal(result.error?.message, 'Learning request could not be completed.');
});
