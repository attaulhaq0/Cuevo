import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOutcome } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const id = (n: number) => `23000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK', learnerId: id(12), identityRequiresReview: false, learnerName: 'Lina Hassan', className: 'Cedar', yearGroupName: 'Year 1', academicYearName: '2026–2027', courseTitle: 'School checking', practiceTitle: 'Explain one checking step', baselineAssessmentTitle: 'First checking task', followUpAssessmentTitle: 'Later checking task', baselineSubmittedAt: '2026-10-01T10:00:00Z', followUpSubmittedAt: '2026-10-02T10:00:00Z' };
const numeric = { id: id(1), interventionId: id(2), baselineResultId: id(3), followUpResultId: id(4), status: 'improved', difference: 2, minimumChange: 1, baseline: { score: 0, maxScore: 10 }, followUp: { score: 2, maxScore: 10 }, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-02T11:00:00Z' };
const native = { type: 'rubric', rubricId: id(5), rubricTitle: 'Checking', rubricVersion: 'school-v1', policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'check', criterionTitle: 'Checking', levelKey: 'shown', levelLabel: 'Shown', levelDescription: 'Show the check.' }] };
const rubric = { id: id(1), interventionId: id(2), baselineResultId: id(3), followUpResultId: id(4), model: 'rubric', status: 'inconclusive', baseline: native, followUp: native, comparability: 'UNKNOWN', reason: 'NO_APPROVED_RUBRIC_COMPARISON_POLICY', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-02T11:00:00Z' };

test('numeric and rubric outcome parsing preserves exact optional human context', () => {
  assert.deepEqual(parseOutcome({ ...numeric, context }), { ...numeric, context });
  assert.deepEqual(parseOutcome({ ...rubric, context }), { ...rubric, context });
  assert.deepEqual(parseOutcome(numeric), numeric); assert.deepEqual(parseOutcome(rubric), rubric);
});
test('malformed or inferred display context cannot pass the existing outcome parser', () => {
  for (const change of [{ learnerId: 'opaque' }, { status: 'UNKNOWN' }, { learnerName: null }, { learnerName: '' }, { identityRequiresReview: true }, { peers: [id(13)] }, { email: 'private@example.test' }, { baselineSubmittedAt: 'not-a-date' }]) {
    for (const outcome of [numeric, rubric]) assert.throws(() => parseOutcome({ ...outcome, context: { ...context, ...change } }), LearningApiError);
  }
  assert.throws(() => parseOutcome({ ...numeric, context: null }), LearningApiError);
});
test('missing or ambiguous context remains explicitly under review with native values intact', () => {
  const review = { ...context, status: 'REQUIRES_REVIEW', identityRequiresReview: true, learnerName: null, baselineSubmittedAt: null };
  const result = parseOutcome({ ...numeric, context: review });
  assert.deepEqual(result, { ...numeric, context: review }); assert.ok('difference' in result); assert.equal(result.baseline.score, 0);
});
test('display context does not relax numeric comparison or rubric UNKNOWN semantics', () => {
  for (const change of [{ difference: 0 }, { status: 'inconclusive' }, { minimumChange: 0 }, { reason: 'FOLLOW_UP_LOWER' }]) assert.throws(() => parseOutcome({ ...numeric, context, ...change }), LearningApiError);
  for (const change of [{ difference: 2 }, { status: 'improved' }, { comparability: 'TRUE' }]) assert.throws(() => parseOutcome({ ...rubric, context, ...change }), LearningApiError);
});
test('a selected learner and any explicit outcome learner must match display context', () => {
  assert.throws(() => parseOutcome({ ...numeric, context }, id(99)), LearningApiError);
  assert.throws(() => parseOutcome({ ...numeric, context, learnerId: id(99) }), LearningApiError);
  assert.deepEqual(parseOutcome({ ...numeric, context }, id(12)), { ...numeric, context });
});
