import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecommendation, parseIntervention, parseOutcome } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const proposal = { id: 'proposal-1', learnerId: 'learner-1', referenceId: 'reference-1', baselineResultId: 'result-1', origin: 'TEACHER_AUTHORED', generationMode: 'HUMAN', intelligenceRunId: null, observation: 'Recorded work', evidenceIds: ['evidence-1'], interpretation: 'May benefit from practice', recommendation: 'Try a worked example', rationale: 'Teacher judgment', uncertainty: 'One assessment only', activityTitle: 'Practice', instructions: 'Try these steps', status: 'AWAITING_HUMAN', createdAt: '2026-10-01T00:00:00.000Z' };

test('unapproved proposals and explicit human origin stay separate from executed interventions', () => {
  assert.equal(parseRecommendation(proposal).origin, 'TEACHER_AUTHORED');
  assert.throws(() => parseRecommendation({ ...proposal, origin: 'AI_VERIFIED_GRADE' }), LearningApiError);
  assert.throws(() => parseRecommendation({ ...proposal, evidenceIds: [] }), LearningApiError);
  assert.throws(() => parseIntervention({ id: 'i', recommendationId: 'p', learnerId: 'l', referenceId: 'r', baselineResultId: 'b', title: 'Practice', instructions: 'Try', status: 'AWAITING_HUMAN', createdAt: '2026-10-01T00:00:00.000Z', completedAt: null, followUpAssessmentId: null }), LearningApiError);
});

test('missing follow-up and unknown outcome state never become measured zero change', () => {
  const outcome = { id: 'o', interventionId: 'i', baselineResultId: 'b', followUpResultId: 'f', status: 'improved', difference: 2, minimumChange: 1, baseline: { score: 0, maxScore: 10 }, followUp: { score: 2, maxScore: 10 }, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-01T00:00:00.000Z' };
  const parsed=parseOutcome(outcome);assert.ok('difference'in parsed);assert.equal(parsed.baseline.score,0);
  assert.throws(() => parseOutcome({ ...outcome, status: 'STUDENT_QUALITY_IMPROVED' }), LearningApiError);
  assert.throws(() => parseOutcome({ ...outcome, minimumChange: 0 }), LearningApiError);
  assert.throws(() => parseOutcome({ ...outcome, followUp: { maxScore: 10 } }), LearningApiError);
});

test('measured comparison refuses absent source, incompatible scale and fabricated raw difference', () => {
  const outcome = { id: 'o', interventionId: 'i', baselineResultId: 'b', followUpResultId: 'f', status: 'inconclusive', difference: -3, minimumChange: 2, baseline: { score: 3, maxScore: 10 }, followUp: { score: 0, maxScore: 10 }, reason: 'FOLLOW_UP_LOWER', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-01T00:00:00.000Z' };
  const parsed=parseOutcome(outcome);assert.ok('difference'in parsed);assert.equal(parsed.followUp.score,0);
  assert.throws(() => parseOutcome({ ...outcome, followUpResultId: null }), LearningApiError);
  assert.throws(() => parseOutcome({ ...outcome, difference: null }), LearningApiError);
  assert.throws(() => parseOutcome({ ...outcome, difference: 0 }), LearningApiError);
  assert.throws(() => parseOutcome({ ...outcome, followUp: { score: 0, maxScore: 20 } }), LearningApiError);
  assert.throws(() => parseOutcome({ ...outcome, status: 'improved' }), LearningApiError);
});

test('an assigned practice cannot pretend to have been measured without completion and follow-up', () => {
  const assigned = { id: 'i', recommendationId: 'p', learnerId: 'l', referenceId: 'r', baselineResultId: 'b', title: 'Practice', instructions: 'Try', status: 'ASSIGNED', createdAt: '2026-10-01T00:00:00.000Z', completedAt: null, followUpAssessmentId: null };
  assert.equal(parseIntervention(assigned).completedAt, null);
  assert.throws(() => parseIntervention({ ...assigned, status: 'MEASURED' }), LearningApiError);
  assert.throws(() => parseIntervention({ ...assigned, followUpAssessmentId: '' }), LearningApiError);
});

test('fixture analysis needs a persisted run and cannot masquerade as live or human authorship', () => {
  const fixture = { ...proposal, origin: 'AI_GENERATED', generationMode: 'FIXTURE', intelligenceRunId: 'run-1' };
  assert.equal(parseRecommendation(fixture).generationMode, 'FIXTURE');
  assert.throws(() => parseRecommendation({ ...fixture, intelligenceRunId: null }), LearningApiError);
  assert.throws(() => parseRecommendation({ ...fixture, generationMode: 'HUMAN' }), LearningApiError);
  assert.throws(() => parseRecommendation({ ...proposal, generationMode: 'LIVE', intelligenceRunId: 'run-1' }), LearningApiError);
  assert.throws(() => parseRecommendation({ ...fixture, generationMode: undefined }), LearningApiError);
});

test('native comparison accepts decimal representation and requires the correct observed-change reason', () => {
  const outcome = { id: 'o', interventionId: 'i', baselineResultId: 'b', followUpResultId: 'f', status: 'improved', difference: 0.1, minimumChange: 0.05, baseline: { score: 99999.1, maxScore: 100000 }, followUp: { score: 99999.2, maxScore: 100000 }, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-01T00:00:00.000Z' };
  const parsed=parseOutcome(outcome);assert.ok('difference'in parsed);assert.equal(parsed.difference,0.1);
  assert.throws(() => parseOutcome({ ...outcome, reason: 'FOLLOW_UP_LOWER' }), LearningApiError);
});
