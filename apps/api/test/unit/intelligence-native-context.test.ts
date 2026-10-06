import { describe, expect, it } from 'vitest';
import { orchestrateProposal, type AIProvider } from '../../src/modules/improvement/orchestrator';
import { createFixtureProvider } from '../../src/modules/improvement/fixture-provider';
import { resolveIntelligencePrompt } from '../../src/modules/improvement/prompt';
import { FoundryProvider } from '../../src/modules/improvement/foundry-provider';
const id = (n: number) => `21000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const nativeResult = { type: 'rubric' as const, rubricId: id(4), rubricTitle: 'Teacher checking rubric', rubricVersion: 'school-v1', policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'check', criterionTitle: 'Checking', levelKey: 'shown', levelLabel: 'Demonstrated', levelDescription: 'Show the checking step.' }] };
const context = { resultId: id(1), evidenceId: id(2), referenceId: id(3), referenceVersion: 'school-v1', nativeResult };
const policy = { approved: true, timeoutMs: 1000, maxTokens: 1000, maxCost: 1 };
describe('native rubric intelligence with the shared orchestrator', () => {
  it('preserves exact criterion evidence without scalar or level-order inference', async () => {
    const result = await orchestrateProposal(createFixtureProvider(), context, { ...policy, prompt: resolveIntelligencePrompt('next-learning-action', '3') });
    expect(result.groundedOutput.facts[0]).toMatchObject({ kind: 'RUBRIC_RESULT', nativeResult });
    expect(result.groundedOutput.facts[0]).not.toHaveProperty('score');
    expect(result.groundedOutput.analysis).toMatchObject({ basis: 'SINGLE_RESULT', resultIds: [context.resultId] });
  });
  it('rejects an invented native criterion level and does not turn rubric descriptors into a decline', async () => {
    const provider: AIProvider = { generate: async () => ({ output: { evidenceIds: [context.evidenceId], facts: [{ kind: 'RUBRIC_RESULT', ...context, nativeResult: { ...nativeResult, criteria: [{ ...nativeResult.criteria[0], levelKey: 'invented' }] } }], action: 'REVIEW_FEEDBACK', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL' }, outputTokens: 0, cost: 0 }) };
    await expect(orchestrateProposal(provider, context, policy)).rejects.toMatchObject({ code: 'INTELLIGENCE_REQUIRES_REVIEW' });
  });
  it('transports exact native descriptors as untrusted data without identities or mutation tools',async()=>{
    let body:Record<string,unknown>|undefined;const output={evidenceIds:[context.evidenceId],facts:[{kind:'RUBRIC_RESULT',...context}],action:'REVIEW_FEEDBACK',reason:'REVIEW_RECORDED_RESULT',limitation:'SINGLE_RESULT_NOT_CAUSAL',selectedActivityId:null,analysis:{basis:'SINGLE_RESULT',resultIds:[context.resultId],observationIds:[],priorInterventionIds:[],interpretation:'TEACHER_REVIEW_RECORDED_EVIDENCE',uncertainty:'EVIDENCE_NOT_CAUSAL'}};
    const provider=new FoundryProvider({endpoint:'https://synthetic.services.ai.azure.com/openai/v1',model:'configured',apiKey:'invented',reservedCost:1,syntheticOnly:true},async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({status:'completed',output_text:JSON.stringify(output),usage:{input_tokens:100,output_tokens:100}}));});
    const result=await orchestrateProposal(provider,context,{...policy,prompt:resolveIntelligencePrompt('next-learning-action','3')});expect(result.groundedOutput.facts[0]).toMatchObject({nativeResult});expect(body).not.toHaveProperty('tools');expect(body).toHaveProperty('store',false);expect(JSON.stringify(body)).not.toMatch(/learnerId|displayName|classId|rawAnswer|invented/);
  });
});
