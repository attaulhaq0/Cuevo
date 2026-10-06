import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCurrentIntervention, parseIntervention } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import { parsePage } from '../../../shared/api/pagination.ts';

const id = (number: number) => `24000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const task = { id: id(1), recommendationId: id(2), learnerId: id(3), referenceId: id(4), baselineResultId: id(5), title: 'Explain one checking step', instructions: 'Compare the two methods.', status: 'ASSIGNED', createdAt: '2026-10-01T10:00:00Z', completedAt: null, followUpAssessmentId: null };
const context = { interventionId: id(1), baselineResultId: id(5), learnerId: id(3), referenceId: id(4), status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false, learnerName: 'Lina Hassan', courseTitle: 'Checking ideas', className: 'Cedar', yearGroupName: 'Year 1', academicYearName: '2026–2027' };

test('current practice pages preserve the exact read-only human source context', () => {
  const record = { ...task, context };
  assert.deepEqual(parsePage({ items: [record], nextCursor: null }, parseIntervention).items, [record]);
  assert.deepEqual(parseCurrentIntervention(record, id(3), id(1)), record);
  assert.throws(() => parseCurrentIntervention(record, id(9), id(1)), LearningApiError);
});

test('practice context must bind its task baseline learner and reference to the exact source', () => {
  for (const key of ['interventionId', 'baselineResultId', 'learnerId', 'referenceId']) {
    assert.throws(() => parseIntervention({ ...task, context: { ...context, [key]: id(9) } }), LearningApiError);
  }
});

test('legacy practice omission remains valid while supplied malformed context fails the response', () => {
  assert.deepEqual(parseIntervention(task), task);
  for (const value of [null, {}, { ...context, status: 'UNKNOWN' }, { ...context, labelBasis: 'INFERRED_FROM_ACTIVITY' }, { ...context, interventionId: 'opaque' }]) {
    assert.throws(() => parseIntervention({ ...task, context: value }), LearningApiError);
  }
});

test('practice context rejects private fields and opaque or blank primary labels', () => {
  for (const change of [{ learnerName: ' ' }, { courseTitle: '' }, { className: id(8) }, { yearGroupName: 'a'.repeat(40) }, { academicYearName: '7e3bf09a' }, { recordedByName: 'Private staff identity' }, { email: 'private@example.test' }, { unitTitle: 'Unestablished unit' }]) {
    assert.throws(() => parseIntervention({ ...task, context: { ...context, ...change } }), LearningApiError);
  }
});

test('missing or ambiguous practice labels remain explicitly under review', () => {
  const review = { ...context, status: 'REQUIRES_REVIEW', identityRequiresReview: true, learnerName: null, className: null };
  assert.deepEqual(parseIntervention({ ...task, context: review }), { ...task, context: review });
  assert.throws(() => parseIntervention({ ...task, context: { ...context, learnerName: null } }), LearningApiError);
  assert.throws(() => parseIntervention({ ...task, context: { ...context, identityRequiresReview: true } }), LearningApiError);
});

test('display context does not clear the separate changed academic-source review', () => {
  const changed = { ...task, context, requiresReview: true, reviewReason: 'ACADEMIC_SOURCE_CHANGED' };
  assert.equal(parseIntervention(changed).requiresReview, true);
  assert.throws(() => parseIntervention({ ...changed, reviewReason: null }), LearningApiError);
});
