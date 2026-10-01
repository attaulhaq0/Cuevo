import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLearnerState, parseObservation, parseSignal } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const unknown = { learnerId: 'learner-1', status: 'UNKNOWN', generatedAt: null, version: null, academic: [], development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [] }, impact: { status: 'unmeasured', measurementIds: [], outcomes: [] }, sourceEventIds: [] };
const support = { id: 'intervention-1', recommendationId: 'proposal-1', learnerId: 'learner-1', referenceId: 'reference-1', baselineResultId: 'baseline-1', title: 'Try the approved example', instructions: 'Practice and explain your steps.', status: 'ASSIGNED', createdAt: '2026-10-01T00:00:00.000Z', completedAt: null, followUpAssessmentId: null };
const outcome = { id: 'outcome-1', interventionId: 'intervention-1', baselineResultId: 'baseline-1', followUpResultId: 'followup-1', status: 'improved', difference: 2, minimumChange: 1, baseline: { score: 0, maxScore: 10 }, followUp: { score: 2, maxScore: 10 }, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-01T00:03:00.000Z' };
const ready = { ...unknown, status: 'READY', generatedAt: '2026-10-01T00:04:00.000Z', version: 1, sourceEventIds: ['event-1'] };

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
  assert.equal(result.academic[0].nativeResult.type === 'numeric' ? result.academic[0].nativeResult.score : null, 0);
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

test('current support keeps its authorized intervention and baseline source instead of staying empty', () => {
  const state = parseLearnerState({ ...ready, support: { activeInterventionIds: ['intervention-1'], items: [support] } });
  assert.equal(state.support.items[0].title, 'Try the approved example');
  assert.equal(state.support.items[0].baselineResultId, 'baseline-1');
  assert.throws(() => parseLearnerState({ ...ready, support: { activeInterventionIds: ['other-intervention'], items: [support] } }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...ready, support: { activeInterventionIds: ['intervention-1'], items: [{ ...support, learnerId: 'another-learner' }] } }), LearningApiError);
});

test('measured impact preserves a zero baseline and source-linked native follow-up', () => {
  const state = parseLearnerState({ ...ready, support: { activeInterventionIds: [], items: [{ ...support, status: 'MEASURED', completedAt: '2026-10-01T00:01:00.000Z', followUpAssessmentId: 'assessment-1' }] }, impact: { status: 'measured', measurementIds: ['outcome-1'], outcomes: [outcome] } });
  assert.equal(state.impact.status, 'measured');
  assert.equal(state.impact.outcomes[0].baseline.score, 0);
  assert.equal(state.impact.outcomes[0].difference, 2);
  assert.throws(() => parseLearnerState({ ...ready, impact: { status: 'measured', measurementIds: [], outcomes: [] } }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...ready, impact: { status: 'measured', measurementIds: ['other-outcome'], outcomes: [outcome] } }), LearningApiError);
});

test('stale habit windows retain real support and outcomes while parent projections remain approved academic-only', () => {
  const state = parseLearnerState({ ...ready, freshness: 'STALE', support: { activeInterventionIds: ['intervention-1'], items: [support] } });
  assert.equal(state.development.practice.count, null);
  assert.equal(state.support.items[0].id, 'intervention-1');
  assert.throws(() => parseLearnerState({ ...unknown, support: { activeInterventionIds: ['intervention-1'], items: [support] } }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...ready, freshness: 'APPROVED_PROJECTION', support: { activeInterventionIds: ['intervention-1'], items: [support] } }), LearningApiError);
});

test('measured support cannot lose its outcome or claim a measurement before actual completion', () => {
  const measuredSupport = { ...support, status: 'MEASURED', completedAt: '2026-10-01T00:01:00.000Z', followUpAssessmentId: 'assessment-1' };
  assert.throws(() => parseLearnerState({ ...ready, support: { activeInterventionIds: [], items: [measuredSupport] } }), LearningApiError);
  assert.throws(() => parseLearnerState({ ...ready, support: { activeInterventionIds: [], items: [measuredSupport] }, impact: { status: 'measured', measurementIds: ['outcome-1'], outcomes: [{ ...outcome, measuredAt: '2026-10-01T00:00:30.000Z' }] } }), LearningApiError);
});

test('native rubric evidence retains criterion levels without a scalar grade in learner progress', () => {
  const native = { type: 'rubric', rubricId: 'rubric-1', rubricTitle: 'School explanation', rubricVersion: 'school-v1', policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'reasoning', criterionTitle: 'Reasoning', levelKey: 'secure', levelLabel: 'Secure', levelDescription: 'Explains each step.' }] };
  const row = { resultId: 'r', referenceId: 'ref', referenceVersion: 'objective-v1', evidenceId: 'e', observedAt: '2026-10-01T00:00:00.000Z', nativeResult: native };
  const state = parseLearnerState({ ...ready, academic: [row] });
  assert.equal(state.academic[0].nativeResult.type, 'rubric');
  assert.equal('score' in state.academic[0].nativeResult, false);
  assert.throws(() => parseLearnerState({ ...ready, academic: [{ ...row, nativeResult: { ...native, normalized: 80 } }] }), LearningApiError);
});

test('revision observations require actual resubmission source after teacher feedback', () => {
  const observation = { id: 'o', learnerId: 'l', kind: 'revision', sourceType: 'SUBMISSION_REVISION', sourceObjectId: 'resubmission-2', occurredAt: '2026-10-01T00:02:00Z', sourceEventId: 'e' };
  assert.equal(parseObservation(observation).kind, 'revision');
  assert.throws(() => parseObservation({ ...observation, sourceType: 'ACTIVITY_COMPLETION' }), LearningApiError);
});
