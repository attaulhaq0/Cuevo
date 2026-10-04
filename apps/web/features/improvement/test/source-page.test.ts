import assert from 'node:assert/strict';
import test from 'node:test';
import { admittedSourceRows, sourcePageDenied } from '../source-page-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const data = [{ id: 'private-record', title: 'Current teacher source' }];
test('a denied source continuation cannot retain earlier private proposal or follow-up choices', () => {
  for (const kind of ['denied', 'unauthorized'] as const) { const source = { data, error: null, moreError: new LearningApiError(kind) }; assert.equal(sourcePageDenied(source), true); assert.deepEqual(admittedSourceRows(source), []); }
  assert.deepEqual(admittedSourceRows({ data, error: new LearningApiError('denied'), moreError: null }), []);
});
test('temporary unavailable continuation preserves current bounded facts without claiming completeness', () => {
  const source = { data, error: null, moreError: new LearningApiError('unavailable') };
  assert.equal(sourcePageDenied(source), false); assert.equal(admittedSourceRows(source), data);
});
