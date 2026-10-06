import assert from 'node:assert/strict';
import test from 'node:test';
import { currentLearnerState, parseLearnerState, parseLearnerObservation, parseLearnerSignal, parseLearnerAttentionSignal } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const unknown = { learnerId: 'learner-1', status: 'UNKNOWN', generatedAt: null, version: null, academic: [], development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [] }, impact: { status: 'unmeasured', measurementIds: [], outcomes: [] }, sourceEventIds: [] };

test('a previous snapshot cannot display after a refresh, actor or selected learner change', () => {
  const value = parseLearnerState(unknown);
  const source = { scope: 'school:actor:access1:refresh0', value };
  assert.equal(currentLearnerState(source, source.scope, 'learner-1'), value);
  assert.equal(currentLearnerState(source, 'school:actor:access1:refresh1', 'learner-1'), null);
  assert.equal(currentLearnerState(source, 'school:other-actor:access1:refresh0', 'learner-1'), null);
  assert.equal(currentLearnerState(source, source.scope, 'learner-2'), null);
  assert.equal(currentLearnerState(null, source.scope, 'learner-1'), null);
});

test('observation pages reject another learner rather than silently displaying or filtering the record', () => {
  const row = { id: 'observation-1', learnerId: 'learner-1', kind: 'practice', sourceType: 'ACTIVITY_COMPLETION', sourceObjectId: 'completion-1', occurredAt: '2026-10-01T00:00:00Z', sourceEventId: 'event-1' };
  assert.equal(parseLearnerObservation(row, 'learner-1').id, row.id);
  assert.throws(() => parseLearnerObservation(row, 'learner-2'), LearningApiError);
});

test('signal pages require the exact learner while retaining a recorded zero count', () => {
  const row = { id: 'signal-1', learnerId: 'learner-1', type: 'practice_observed', count: 0, ruleVersion: 1, createdAt: '2026-10-01T00:00:00Z', windowStart: '2026-09-17T00:00:00Z', windowEnd: '2026-10-01T00:00:00Z', sourceEventIds: [], observationIds: [], status: 'ACTIVE', uncertainty: 'OBSERVATION_ONLY' };
  assert.equal(parseLearnerSignal(row, 'learner-1').count, 0);
  assert.throws(() => parseLearnerSignal(row, 'learner-2'), LearningApiError);
});

test('attention records cannot display another learner’s missing-work context', () => {
  const row = { id: 'attention-1', learnerId: 'learner-1', type: 'missing_due_work', ruleVersion: 1, generatedAt: '2026-10-01T00:00:00Z', sourceEventIds: ['event-1'], count: 1, missingAssessments: [{ id: 'task-1', title: 'Explain a shape', dueAt: '2026-09-30T00:00:00Z' }], uncertainty: 'MISSING_SUBMISSION_NOT_ZERO' };
  assert.equal(parseLearnerAttentionSignal(row, 'learner-1').type, 'missing_due_work');
  assert.throws(() => parseLearnerAttentionSignal(row, 'learner-2'), LearningApiError);
});
