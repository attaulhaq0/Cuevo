import assert from 'node:assert/strict';
import test from 'node:test';
import { admittedSourceRows, sourcePageDenied, currentImprovementDenial } from '../source-page-model.ts';
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
test('a refused current identity page stays withheld through same-scope retry until fresh current read', () => {
  const refused = { data, error: null, moreError: new LearningApiError('denied') };
  const denial = currentImprovementDenial(null, 'current-owner', refused);
  assert.equal(denial?.error.kind, 'denied');
  const retry = { data, error: null, moreError: null };
  assert.equal(currentImprovementDenial(denial, 'current-owner', retry), denial);
  assert.deepEqual(admittedSourceRows(retry, denial), []);
  assert.equal(currentImprovementDenial(denial, 'fresh-owner', retry), null);
  assert.deepEqual(admittedSourceRows(retry, null), data);
});
test('token rotation without a new admitted paginated source frame cannot clear an identity refusal', () => {
  const source = { data, error: null, moreError: new LearningApiError('denied'), context: 'actor:school:people:refresh:access-generation' };
  const denial = currentImprovementDenial(null, source.context, source);
  const tokenRotated = { ...source, moreError: null, accessToken: 'new-token-with-membership-revalidation-pending' };
  assert.equal(currentImprovementDenial(denial, tokenRotated.context, tokenRotated), denial);
  assert.deepEqual(admittedSourceRows(tokenRotated, denial), []);
});
