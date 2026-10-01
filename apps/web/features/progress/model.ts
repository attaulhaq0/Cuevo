import { LearningApiError } from '../../shared/api/client.ts';
import { parseIntervention, parseOutcome, type Intervention, type Outcome } from '../improvement/model.ts';
import { parseNativeResult, type NativeResult } from '../academic/model.ts';

export type AcademicStateRow = { resultId: string; referenceId: string; referenceVersion: string; nativeResult: NativeResult; evidenceId: string; observedAt: string };
export type LearnerState = { learnerId: string; status: 'READY' | 'UNKNOWN'; freshness?: 'CURRENT' | 'STALE' | 'APPROVED_PROJECTION'; generatedAt: string | null; version: number | null; academic: AcademicStateRow[]; development: { practice: { count: number | null; observationIds: string[] }; revision: { count: number | null; observationIds: string[] }; reflection: { count: number | null; observationIds: string[] }; windowStart: string | null; windowEnd: string | null; completeness?: 'RECORDED_ONLY' }; engagement: { completedActivityCount: number | null; lastCompletedAt: string | null }; support: { activeInterventionIds: string[]; items: Intervention[] }; impact: { status: 'unmeasured' | 'measured'; measurementIds: string[]; outcomes: Outcome[] }; sourceEventIds: string[] };
export type Observation = { id: string; learnerId: string; kind: 'practice' | 'revision' | 'reflection'; sourceType: string; sourceObjectId: string; occurredAt: string; sourceEventId: string };
export type Signal = { id: string; learnerId: string; type: 'practice_observed'; count: number; ruleVersion: number; createdAt: string; windowStart: string; windowEnd: string; sourceEventIds: string[]; observationIds: string[]; status: 'ACTIVE'; uncertainty: 'OBSERVATION_ONLY' };
type AttentionBase = { id: string; learnerId: string; ruleVersion: number; generatedAt: string; sourceEventIds: string[] };
export type AttentionSignal = AttentionBase & ({ type: 'native_result_decline'; referenceId: string; referenceVersion: string; baselineResultId: string; followUpResultId: string; evidenceIds: string[]; baseline: { score: number; maxScore: number }; followUp: { score: number; maxScore: number }; difference: number; minimumDecline: number; uncertainty: 'OBSERVED_CHANGE_NOT_CAUSE' } | { type: 'missing_due_work'; count: number; missingAssessments: { id: string; title: string; dueAt: string }[]; uncertainty: 'MISSING_SUBMISSION_NOT_ZERO' });
export function parseAttentionSignal(value: unknown): AttentionSignal {
  if (!object(value) || !strings(value, ['id', 'learnerId']) || typeof value.ruleVersion !== 'number' || !Number.isInteger(value.ruleVersion) || value.ruleVersion < 1 || !date(value.generatedAt) || !ids(value.sourceEventIds)) throw new LearningApiError('invalid');
  if (value.type === 'native_result_decline') {
    if (!strings(value, ['referenceId', 'referenceVersion', 'baselineResultId', 'followUpResultId']) || !ids(value.evidenceIds) || value.evidenceIds.length !== 2 || !object(value.baseline) || !object(value.followUp) || typeof value.difference !== 'number' || !Number.isFinite(value.difference) || typeof value.minimumDecline !== 'number' || !Number.isFinite(value.minimumDecline) || value.minimumDecline <= 0 || value.uncertainty !== 'OBSERVED_CHANGE_NOT_CAUSE') throw new LearningApiError('invalid');
    for (const native of [value.baseline, value.followUp]) if (typeof native.score !== 'number' || typeof native.maxScore !== 'number' || !Number.isFinite(native.score) || !Number.isFinite(native.maxScore) || native.maxScore <= 0 || native.score < 0 || native.score > native.maxScore) throw new LearningApiError('invalid');
    if (value.baseline.maxScore !== value.followUp.maxScore || Math.abs(value.difference - (Number(value.followUp.score) - Number(value.baseline.score))) > 1e-9 || value.difference > -value.minimumDecline) throw new LearningApiError('invalid');
  } else if (value.type === 'missing_due_work') {
    if (typeof value.count !== 'number' || !Number.isInteger(value.count) || value.count < 1 || !Array.isArray(value.missingAssessments) || value.missingAssessments.length !== value.count || value.missingAssessments.length > 100 || value.missingAssessments.some(item => !object(item) || !strings(item, ['id', 'title']) || !date(item.dueAt)) || value.uncertainty !== 'MISSING_SUBMISSION_NOT_ZERO') throw new LearningApiError('invalid');
  } else throw new LearningApiError('invalid');
  return value as AttentionSignal;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function strings(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string' && value[key] !== ''); }
function ids(value: unknown): value is string[] { return Array.isArray(value) && value.every((id) => typeof id === 'string' && id !== ''); }
function date(value: unknown, nullable = false) { return nullable && value === null || typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function count(value: unknown) { return value === null || typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function sameIds(actual: string[], expected: string[]) { return new Set(actual).size === actual.length && actual.length === expected.length && actual.every((id) => expected.includes(id)); }
export function parseLearnerState(value: unknown): LearnerState {
  if (!object(value) || !strings(value, ['learnerId']) || !['READY', 'UNKNOWN'].includes(String(value.status)) || !date(value.generatedAt, true) || !(value.version === null || typeof value.version === 'number' && Number.isInteger(value.version) && value.version > 0) || !Array.isArray(value.academic) || !ids(value.sourceEventIds) || !object(value.development) || !object(value.engagement) || !object(value.support) || !object(value.impact)) throw new LearningApiError('invalid');
  for (const row of value.academic) {
    if (!object(row) || !strings(row, ['resultId', 'referenceId', 'referenceVersion', 'evidenceId']) || !date(row.observedAt) || !object(row.nativeResult) || row.nativeResult.normalized !== null) throw new LearningApiError('invalid');
    parseNativeResult(row.nativeResult);
  }
  for (const kind of ['practice', 'revision', 'reflection']) {
    const dimension = value.development[kind];
    if (!object(dimension) || !count(dimension.count) || !ids(dimension.observationIds)) throw new LearningApiError('invalid');
  }
  if (!date(value.development.windowStart, true) || !date(value.development.windowEnd, true) || !count(value.engagement.completedActivityCount) || !date(value.engagement.lastCompletedAt, true) || !ids(value.support.activeInterventionIds) || !Array.isArray(value.support.items) || value.support.items.length > 100 || !['unmeasured', 'measured'].includes(String(value.impact.status)) || !ids(value.impact.measurementIds) || !Array.isArray(value.impact.outcomes) || value.impact.outcomes.length > 100) throw new LearningApiError('invalid');
  const interventions = value.support.items.map(parseIntervention);
  const outcomes = value.impact.outcomes.map(parseOutcome);
  if (new Set(interventions.map((item) => item.id)).size !== interventions.length || interventions.some((item) => item.learnerId !== value.learnerId) || !sameIds(value.support.activeInterventionIds, interventions.filter((item) => item.status !== 'MEASURED').map((item) => item.id)) || !sameIds(value.impact.measurementIds, outcomes.map((item) => item.id)) || (value.impact.status === 'measured') !== (outcomes.length > 0)) throw new LearningApiError('invalid');
  if (interventions.some((item) => item.status === 'MEASURED' && !outcomes.some((outcome) => outcome.interventionId === item.id))) throw new LearningApiError('invalid');
  for (const outcome of outcomes) {
    const intervention = interventions.find((item) => item.id === outcome.interventionId);
    if (!intervention || intervention.status !== 'MEASURED' || intervention.baselineResultId !== outcome.baselineResultId || intervention.completedAt === null || Date.parse(outcome.measuredAt) < Date.parse(intervention.completedAt)) throw new LearningApiError('invalid');
  }
  if (value.freshness !== undefined && !['CURRENT', 'STALE', 'APPROVED_PROJECTION'].includes(String(value.freshness)) || value.development.completeness !== undefined && value.development.completeness !== 'RECORDED_ONLY') throw new LearningApiError('invalid');
  if (value.status === 'UNKNOWN' && (value.generatedAt !== null || value.version !== null || value.academic.length || value.sourceEventIds.length || value.engagement.completedActivityCount !== null || ['practice', 'revision', 'reflection'].some((kind) => (value.development as Record<string, Record<string, unknown>>)[kind].count !== null))) throw new LearningApiError('invalid');
  if ((value.status === 'UNKNOWN' || value.freshness === 'APPROVED_PROJECTION') && (interventions.length || outcomes.length || value.support.activeInterventionIds.length || value.impact.measurementIds.length)) throw new LearningApiError('invalid');
  return value as LearnerState;
}
export function parseObservation(value: unknown): Observation { if (!object(value) || !strings(value, ['id', 'learnerId', 'sourceObjectId', 'sourceEventId']) || !['practice', 'reflection', 'revision'].includes(String(value.kind)) || value.sourceType !== (value.kind === 'revision' ? 'SUBMISSION_REVISION' : 'ACTIVITY_COMPLETION') || !date(value.occurredAt)) throw new LearningApiError('invalid'); return value as Observation; }
export function parseSignal(value: unknown): Signal { if (!object(value) || !strings(value, ['id', 'learnerId']) || typeof value.ruleVersion !== 'number' || !Number.isInteger(value.ruleVersion) || value.ruleVersion < 1 || value.type !== 'practice_observed' || typeof value.count !== 'number' || !count(value.count) || !date(value.createdAt) || !date(value.windowStart) || !date(value.windowEnd) || !ids(value.sourceEventIds) || !ids(value.observationIds) || value.status !== 'ACTIVE' || value.uncertainty !== 'OBSERVATION_ONLY') throw new LearningApiError('invalid'); return value as Signal; }
