import type { AIProvider } from './orchestrator';

/** Deterministic synthetic execution. It does not contact a model or claim model quality. */
export function createFixtureProvider(): AIProvider {
  return { generate: async ({ context, insight, signal,allowedActions,prompt }) => {
    signal.throwIfAborted();
    const higher='score'in context?insight?.recentResults.find(result=>'score'in result&&result.score>context.score&&result.maxScore===context.maxScore):undefined;const practice=insight?.observations.filter(item=>item.kind==='practice')??[];const reflection=insight?.observations.filter(item=>item.kind==='reflection')??[];const prior=insight?.priorInterventions.filter(item=>item.status==='MEASURED'&&item.outcome?.status==='no_meaningful_change')??[];
    const basis=higher?'NATIVE_RESULT_DECLINE':prior.length?'PRIOR_NO_MEANINGFUL_CHANGE':practice.length?'RECORDED_PRACTICE':reflection.length?'RECORDED_REFLECTION':'SINGLE_RESULT';
    const desired=['RECORDED_PRACTICE','RECORDED_REFLECTION','PRIOR_NO_MEANINGFUL_CHANGE'].includes(basis)?'REVIEW_FEEDBACK':'GUIDED_PRACTICE';const action=allowedActions?.includes(desired)?desired:allowedActions?.[0]??'GUIDED_PRACTICE';
    return { output: { evidenceIds: [context.evidenceId], facts: [{ kind: 'score'in context?'NUMERIC_RESULT':'RUBRIC_RESULT', ...context }],
      action, reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL', ...(action==='GUIDED_PRACTICE'&&insight?.learningOptions.find(option => option.kind === 'practice') ? { selectedActivityId: insight.learningOptions.find(option => option.kind === 'practice')!.activityId } : {}),
      ...(['2','3'].includes(prompt?.version??'')?{analysis:{basis,resultIds:[context.resultId,...(higher?[higher.resultId]:[])],observationIds:basis==='RECORDED_PRACTICE'?practice.map(item=>item.id):basis==='RECORDED_REFLECTION'?reflection.map(item=>item.id):[],priorInterventionIds:basis==='PRIOR_NO_MEANINGFUL_CHANGE'?prior.map(item=>item.id):[],interpretation:'TEACHER_REVIEW_RECORDED_EVIDENCE',uncertainty:'EVIDENCE_NOT_CAUSAL'}}:{}) }, outputTokens: 0, cost: 0, inputTokens: 0, costBasis: 'DETERMINISTIC_FIXTURE' };
  } };
}
