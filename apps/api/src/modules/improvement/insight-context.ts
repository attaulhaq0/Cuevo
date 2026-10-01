import { DomainError } from '@cuevo/domain';
import { insightContextSchema, type InsightContext } from '@cuevo/contracts';
export type { InsightContext } from '@cuevo/contracts';
export function validateInsightContext(input: unknown, baseline: { resultId: string; evidenceId: string; referenceId: string; referenceVersion: string; score: number; maxScore: number }): InsightContext {
  const parsed = insightContextSchema.safeParse(input);
  const invalid = () => new DomainError('INTELLIGENCE_REQUIRES_REVIEW', 409, 'Insight source context requires review.');
  if (!parsed.success) throw invalid();
  const context = parsed.data;
  if (context.reference.id !== baseline.referenceId || context.reference.version !== baseline.referenceVersion || !context.recentResults.some(result => result.resultId === baseline.resultId && result.evidenceId === baseline.evidenceId && result.score === baseline.score && result.maxScore === baseline.maxScore)) throw invalid();
  if (context.recentResults.some(result => result.referenceId !== baseline.referenceId || result.referenceVersion !== baseline.referenceVersion || result.score > result.maxScore) || new Set(context.recentResults.map(result => result.resultId)).size !== context.recentResults.length || new Set(context.learningOptions.map(option => option.activityId)).size !== context.learningOptions.length || new Set(context.observations.map(item => item.id)).size !== context.observations.length) throw invalid();
  if(new Set(context.priorInterventions.map(item=>item.id)).size!==context.priorInterventions.length||context.priorInterventions.some(item=>item.outcome&&(item.outcome.baselineResultId!==item.baselineResultId||item.status!=='MEASURED')))throw invalid();
  return context;
}
export function selectInsightOption(context: InsightContext, id: string) {
  const option = context.learningOptions.find(item => item.activityId === id);
  if (!option) throw new DomainError('INTELLIGENCE_REQUIRES_REVIEW', 409, 'The suggested learning option is outside authorized context.');
  return option;
}

