type IntelligenceMetadata={selectedActivityId?:string|null;analysis?:IntelligenceAnalysis|null;promptDigest?:string|null};
export type Recommendation = IntelligenceMetadata & { id: string; learnerId: string; referenceId: string; baselineResultId: string; origin: 'TEACHER_AUTHORED' | 'AI_GENERATED'; generationMode: 'HUMAN' | 'FIXTURE' | 'LIVE'; intelligenceRunId: string | null; observation: string; evidenceIds: string[]; interpretation: string; recommendation: string; rationale: string; uncertainty: string; activityTitle: string; instructions: string; status: 'AWAITING_HUMAN' | 'APPROVED' | 'REJECTED'; createdAt: string };
type SourceReview = { requiresReview?: boolean; reviewReason?: 'ACADEMIC_SOURCE_CHANGED' | null };
export type Intervention = SourceReview & IntelligenceMetadata & { id: string; recommendationId: string; learnerId: string; referenceId: string; baselineResultId: string; title: string; instructions: string; status: 'ASSIGNED' | 'COMPLETED' | 'MEASURED'; createdAt: string; completedAt: string | null; followUpAssessmentId: string | null };
export type NumericOutcome = SourceReview & { id: string; interventionId: string; baselineResultId: string; followUpResultId: string; status: 'improved' | 'no_meaningful_change' | 'inconclusive'; difference: number; minimumChange: number; baseline: { score: number; maxScore: number }; followUp: { score: number; maxScore: number }; reason: string; limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF'; measuredAt: string; context?: OutcomeDisplayContext };
export type Outcome=NumericOutcome|z.infer<typeof nativeOutcomeDisplaySchema>;
import { LearningApiError } from '../../shared/api/client.ts';
import { insightContextSchema,intelligenceAnalysisSchema,nativeOutcomeDisplaySchema,outcomeDisplayContextSchema,type OutcomeDisplayContext,type IntelligenceAnalysis, type InsightContext } from '@cuevo/contracts';
import { z } from 'zod';
const insightEnvelopeSchema = z.object({ runId: z.uuid(), context: insightContextSchema.nullable() }).strict();
export type InsightContextEnvelope = { runId: string; context: InsightContext | null };
export function parseInsightContextEnvelope(value: unknown): InsightContextEnvelope {
  const parsed = insightEnvelopeSchema.safeParse(value); if (!parsed.success) throw new LearningApiError('invalid');
  const context = parsed.data.context;
  if (context && (context.recentResults.some(result => ('score'in result&&result.score > result.maxScore) || result.referenceId !== context.reference.id || result.referenceVersion !== context.reference.version)
    || new Set(context.recentResults.map(result => result.resultId)).size !== context.recentResults.length
    || new Set(context.observations.map(item => item.id)).size !== context.observations.length
    || new Set(context.learningOptions.map(item => item.activityId)).size !== context.learningOptions.length)) throw new LearningApiError('invalid');
  return parsed.data;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function strings(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string' && value[key] !== ''); }
function date(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validReview(value: Record<string, unknown>) { return value.requiresReview === undefined || typeof value.requiresReview === 'boolean' && (value.requiresReview ? value.reviewReason === 'ACADEMIC_SOURCE_CHANGED' : value.reviewReason === null); }
function validIntelligence(value:Record<string,unknown>){return(value.selectedActivityId===undefined||value.selectedActivityId===null||z.uuid().safeParse(value.selectedActivityId).success)&&(value.analysis===undefined||value.analysis===null||intelligenceAnalysisSchema.safeParse(value.analysis).success)&&(value.promptDigest===undefined||value.promptDigest===null||typeof value.promptDigest==='string'&&/^[a-f0-9]{64}$/.test(value.promptDigest));}
function native(value: unknown): value is { score: number; maxScore: number } { return object(value) && typeof value.score === 'number' && typeof value.maxScore === 'number' && Number.isFinite(value.score) && Number.isFinite(value.maxScore) && value.maxScore > 0 && value.score >= 0 && value.score <= value.maxScore; }
export function parseRecommendation(value: unknown): Recommendation {
  if (!object(value) || !strings(value, ['id', 'learnerId', 'referenceId', 'baselineResultId', 'observation', 'interpretation', 'recommendation', 'rationale', 'uncertainty', 'activityTitle', 'instructions']) || !['TEACHER_AUTHORED', 'AI_GENERATED'].includes(String(value.origin)) || !['AWAITING_HUMAN', 'APPROVED', 'REJECTED'].includes(String(value.status)) || !Array.isArray(value.evidenceIds) || !value.evidenceIds.length || !value.evidenceIds.every((id) => typeof id === 'string' && id !== '') || !date(value.createdAt)) throw new LearningApiError('invalid');
  if (value.origin === 'TEACHER_AUTHORED' ? value.generationMode !== 'HUMAN' || value.intelligenceRunId !== null : !['FIXTURE', 'LIVE'].includes(String(value.generationMode)) || typeof value.intelligenceRunId !== 'string' || !value.intelligenceRunId) throw new LearningApiError('invalid');
  if(!validIntelligence(value))throw new LearningApiError('invalid');
  return value as Recommendation;
}
export function parseIntervention(value: unknown): Intervention {
  if (!object(value) || !strings(value, ['id', 'recommendationId', 'learnerId', 'referenceId', 'baselineResultId', 'title', 'instructions']) || !['ASSIGNED', 'COMPLETED', 'MEASURED'].includes(String(value.status)) || !date(value.createdAt) || !(value.completedAt === null || date(value.completedAt)) || !(value.followUpAssessmentId === null || typeof value.followUpAssessmentId === 'string' && value.followUpAssessmentId !== '')) throw new LearningApiError('invalid');
  if (value.status === 'ASSIGNED' && (value.completedAt !== null || value.followUpAssessmentId !== null) || value.status !== 'ASSIGNED' && value.completedAt === null || value.status === 'MEASURED' && value.followUpAssessmentId === null) throw new LearningApiError('invalid');
  if (typeof value.completedAt === 'string' && Date.parse(value.completedAt) < Date.parse(String(value.createdAt))) throw new LearningApiError('invalid');
  if (!validReview(value)) throw new LearningApiError('invalid');
  if(!validIntelligence(value))throw new LearningApiError('invalid');
  return value as Intervention;
}
export function parseOutcome(value: unknown, expectedLearnerId?: string): Outcome {
  if (object(value) && value.context !== undefined) {
    const context = outcomeDisplayContextSchema.safeParse(value.context);
    if (!context.success || expectedLearnerId !== undefined && context.data.learnerId !== expectedLearnerId
      || value.learnerId !== undefined && context.data.learnerId !== value.learnerId) throw new LearningApiError('invalid');
  }
  if(object(value)&&value.model==='rubric'){const parsed=nativeOutcomeDisplaySchema.safeParse(value);if(!parsed.success||!validReview(value))throw new LearningApiError('invalid');return parsed.data;}
  if (!object(value) || !strings(value, ['id', 'interventionId', 'baselineResultId', 'followUpResultId', 'reason']) || !['improved', 'no_meaningful_change', 'inconclusive'].includes(String(value.status)) || typeof value.difference !== 'number' || !Number.isFinite(value.difference) || typeof value.minimumChange !== 'number' || !Number.isFinite(value.minimumChange) || value.minimumChange <= 0 || !native(value.baseline) || !native(value.followUp) || value.baseline.maxScore !== value.followUp.maxScore || value.limitation !== 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' || !date(value.measuredAt)) throw new LearningApiError('invalid');
  const difference = value.followUp.score - value.baseline.score;
  const expectedStatus = value.difference >= value.minimumChange ? 'improved' : Math.abs(value.difference) < value.minimumChange ? 'no_meaningful_change' : 'inconclusive';
  const expectedReason = value.difference <= -value.minimumChange ? 'FOLLOW_UP_LOWER' : 'OBSERVED_RAW_SCORE_CHANGE';
  if (Math.abs(value.difference - difference) > 1e-9 || value.status !== expectedStatus || value.reason !== expectedReason) throw new LearningApiError('invalid');
  if (!validReview(value)) throw new LearningApiError('invalid');
  return value as Outcome;
}
