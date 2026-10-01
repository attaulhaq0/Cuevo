import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLearnerState, parseObservation, parseSignal } from '../lib/learner-state.ts';
import { LearningApiError } from '../lib/learning-api.ts';

const unknown = { learnerId: 'learner-1', status: 'UNKNOWN', generatedAt: null, version: null, academic: [], development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [] }, impact: { status: 'unmeasured', measurementIds: [] }, sourceEventIds: [] };

test('unknown learner state retains unknown counts instead of producing zero', () => {
  const result = parseLearnerState(unknown);
  assert.equal(result.development!.practice.count, null);
  assert.equal(result.engagement!.completedActivityCount, null);
  assert.throws(() => parseLearnerState({ ...unknown, development: { ...unknown.development, practice: { observationIds: [] } } }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...unknown, development: { ...unknown.development, practice: { count: 0, observationIds: [] } } }), LearningApiError);
});

test('native academic rows require matching numeric scale and evidence provenance', () => {
  assert.throws(() => parseLearnerState({ ...unknown, academic: [{ resultId: 'r', referenceId: 'ref', referenceVersion: 'v1', evidenceId: 'e', observedAt: '2026-10-01T00:00:00.000Z', nativeResult: { type: 'numeric', score: 12, maxScore: 10, policyVersion: 1 } }] }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...unknown, academic: [{ resultId: 'r', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 } }] }), LearningApiError);
});

test('observations and neutral signals need traceable sources rather than inferred traits', () => {
  assert.throws(() => parseObservation({ id: 'o', learnerId: 'l', kind: 'motivation', sourceType: 'ACTIVITY_COMPLETION', sourceObjectId: 'a', occurredAt: '2026-10-01T00:00:00.000Z', sourceEventId: 'e' }), LearningApiError);
  assert.throws(() => parseSignal({ id: 's', learnerId: 'l', type: 'intelligence', count: 90 }), LearningApiError);
});

test('explicit source-backed zero results preserve their native scale without normalization', () => {
  const result = parseLearnerState({ ...unknown, status: 'READY', generatedAt: '2026-10-01T00:00:00.000Z', version: 1, academic: [{ resultId: 'r', referenceId: 'ref', referenceVersion: 'v1', evidenceId: 'e', observedAt: '2026-10-01T00:00:00.000Z', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1, normalized: null } }] });
  assert.equal(result.academic[0].nativeResult.score, 0);
  assert.equal(result.academic[0].nativeResult.normalized, null);
});

test('the server numeric signal rule version is accepted without dropping factual signals', () => {
  const signal = parseSignal({ id: 'signal-1', learnerId: 'learner-1', type: 'practice_observed', count: 2, ruleVersion: 1, windowStart: '2026-09-17T00:00:00.000Z', windowEnd: '2026-10-01T00:00:00.000Z', sourceEventIds: ['event-1'], observationIds: ['observation-1'], status: 'ACTIVE', uncertainty: 'OBSERVATION_ONLY', createdAt: '2026-10-01T00:00:00.000Z' });
  assert.equal(signal.ruleVersion, 1);
  assert.equal(signal.count, 2);
});

test('recorded-only completeness and current/stale freshness cannot become arbitrary authority', () => {
  assert.throws(() => parseLearnerState({ ...unknown, freshness: 'PREDICTED' }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...unknown, development: { ...unknown.development, completeness: 'FULL_ATTAINMENT' } }), LearningApiError);
  const parent = parseLearnerState({ ...unknown, status: 'READY', freshness: 'APPROVED_PROJECTION' });
  assert.equal(parent.generatedAt, null);
});
