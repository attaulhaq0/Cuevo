import { describe, expect, it } from 'vitest';
import { orchestrateProposal } from '../../src/modules/improvement/orchestrator';
import { createFixtureProvider } from '../../src/modules/improvement/fixture-provider';
import { resolveIntelligencePrompt } from '../../src/modules/improvement/prompt';
const id = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const baseline = { resultId: id(1), evidenceId: id(2), referenceId: id(3), referenceVersion: 'school-v1', score: 3, maxScore: 10 };
const insight = { schemaVersion: '1' as const, learnerId: id(4), courseId: id(5), classId: id(6), reference: { id: id(3), version: 'school-v1', title: 'Explain a checking step' }, recentResults: [baseline, { ...baseline, resultId: id(7), evidenceId: id(8), score: 8 }], observations: [], priorInterventions: [], learningOptions: [{ activityId: id(9), title: 'Check a worked example', instructions: 'Explain each checking step.', kind: 'practice' as const }], coverage: 'BOUNDED_AUTHORIZED_CONTEXT' as const };
const policy = { approved: true, timeoutMs: 1000, maxTokens: 1000, maxCost: 1, allowedActions: ['GUIDED_PRACTICE', 'REVIEW_FEEDBACK'] as ('GUIDED_PRACTICE'|'REVIEW_FEEDBACK')[], prompt: resolveIntelligencePrompt('next-learning-action', '2') };
describe('useful governed Teacher Insight context', () => {
  it('resolves immutable approved prompts and refuses invented version labels', () => {
    expect(policy.prompt).toMatchObject({ id: 'next-learning-action', version: '2', digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(() => resolveIntelligencePrompt('invented', '2')).toThrow(); expect(() => resolveIntelligencePrompt('next-learning-action', '999')).toThrow();
  });
  it('respects a school allowing feedback review only before generating a permitted proposal', async () => {
    const result = await orchestrateProposal(createFixtureProvider(), { ...baseline, insight }, { ...policy, allowedActions: ['REVIEW_FEEDBACK'] });
    expect(result.groundedOutput.action).toBe('REVIEW_FEEDBACK'); expect(result.groundedOutput.selectedActivityId).toBeUndefined();
  });
  it('contrasts native decline with recorded practice and cites their actual source prerequisites', async () => {
    const decline = await orchestrateProposal(createFixtureProvider(), { ...baseline, insight }, policy);
    expect(decline.groundedOutput.analysis).toMatchObject({ basis: 'NATIVE_RESULT_DECLINE', resultIds: expect.arrayContaining([id(1), id(7)]) });
    const practiceContext = { ...insight, recentResults: [baseline], observations: [{ id: id(10), kind: 'practice' as const, sourceObjectId: id(11), sourceEventId: id(12), occurredAt: '2026-10-01T00:00:00Z' }] };
    const practice = await orchestrateProposal(createFixtureProvider(), { ...baseline, insight: practiceContext }, policy);
    expect(practice.groundedOutput.analysis).toMatchObject({ basis: 'RECORDED_PRACTICE', observationIds: [id(10)] });
    expect(practice.groundedOutput.action).not.toBe(decline.groundedOutput.action);
  });
  it('rejects forbidden action, mismatched option purpose and fabricated citation reasoning', async () => {
    const valid = { evidenceIds: [baseline.evidenceId], facts: [{ kind: 'NUMERIC_RESULT', ...baseline }], action: 'REVIEW_FEEDBACK', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL', selectedActivityId: id(9), analysis: { basis: 'NATIVE_RESULT_DECLINE', resultIds: [id(1), id(99)], observationIds: [], priorInterventionIds: [], interpretation: 'TEACHER_REVIEW_RECORDED_EVIDENCE', uncertainty: 'EVIDENCE_NOT_CAUSAL' } };
    await expect(orchestrateProposal({ generate: async () => ({ output: valid, outputTokens: 1, cost: 0 }) }, { ...baseline, insight }, policy)).rejects.toMatchObject({ code: 'INTELLIGENCE_REQUIRES_REVIEW' });
  });
  it.each([
    {action:'GUIDED_PRACTICE',selectedActivityId:undefined,basis:'NATIVE_RESULT_DECLINE',resultIds:[id(1),id(99)],observationIds:[],priorInterventionIds:[]},
    {action:'GUIDED_PRACTICE',selectedActivityId:undefined,basis:'RECORDED_PRACTICE',resultIds:[id(1)],observationIds:[id(99)],priorInterventionIds:[]},
    {action:'GUIDED_PRACTICE',selectedActivityId:undefined,basis:'PRIOR_NO_MEANINGFUL_CHANGE',resultIds:[id(1)],observationIds:[],priorInterventionIds:[id(99)]},
  ])('rejects reasoning that cites an unavailable source independently of option compatibility',async value=>{
    const {action,selectedActivityId,...analysis}=value;
    const output={evidenceIds:[baseline.evidenceId],facts:[{kind:'NUMERIC_RESULT',...baseline}],action,selectedActivityId,reason:'REVIEW_RECORDED_RESULT',limitation:'SINGLE_RESULT_NOT_CAUSAL',analysis:{...analysis,interpretation:'TEACHER_REVIEW_RECORDED_EVIDENCE',uncertainty:'EVIDENCE_NOT_CAUSAL'}};
    await expect(orchestrateProposal({generate:async()=>({output,outputTokens:1,cost:0})},{...baseline,insight},policy)).rejects.toMatchObject({code:'INTELLIGENCE_REQUIRES_REVIEW'});
  });
  it('uses a cited prior measured no-change outcome and remains within teacher action policy',async()=>{
    const prior={...insight,recentResults:[baseline],priorInterventions:[{id:id(13),status:'MEASURED' as const,baselineResultId:id(14),outcome:{id:id(15),status:'no_meaningful_change' as const,difference:0,minimumChange:1,baselineResultId:id(14),followUpResultId:id(16)}}]};
    const result=await orchestrateProposal(createFixtureProvider(),{...baseline,insight:prior},policy);
    expect(result.groundedOutput.analysis).toMatchObject({basis:'PRIOR_NO_MEANINGFUL_CHANGE',priorInterventionIds:[id(13)]});expect(result.groundedOutput.action).toBe('REVIEW_FEEDBACK');
  });
  it('rejects a valid-shaped action excluded by the frozen policy before persistence',async()=>{
    const output={evidenceIds:[baseline.evidenceId],facts:[{kind:'NUMERIC_RESULT',...baseline}],action:'GUIDED_PRACTICE',reason:'REVIEW_RECORDED_RESULT',limitation:'SINGLE_RESULT_NOT_CAUSAL',analysis:{basis:'SINGLE_RESULT',resultIds:[id(1)],observationIds:[],priorInterventionIds:[],interpretation:'TEACHER_REVIEW_RECORDED_EVIDENCE',uncertainty:'EVIDENCE_NOT_CAUSAL'}};
    await expect(orchestrateProposal({generate:async()=>({output,outputTokens:1,cost:0})},{...baseline,insight},{...policy,allowedActions:['REVIEW_FEEDBACK']})).rejects.toMatchObject({code:'INTELLIGENCE_REQUIRES_REVIEW'});
  });
});
