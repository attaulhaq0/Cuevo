import { z } from 'zod';
import { DomainError } from '@cuevo/domain';
import { validateInsightContext, selectInsightOption, type InsightContext } from './insight-context';
import { intelligenceAnalysisSchema,insightEvidenceSchema,insightNumericEvidenceSchema,insightNativeEvidenceSchema } from '@cuevo/contracts';
import type { IntelligencePrompt } from './prompt';
import { analysisCopy,validateIntelligenceAnalysis } from './analysis';

const contextSchema=insightEvidenceSchema;
export type MinimalEvidenceContext=z.infer<typeof contextSchema>&{referenceTitle?:string;insight?:InsightContext};
export interface AIProvider {
  generate(request: { purpose: 'NEXT_LEARNING_ACTION'; context: z.infer<typeof contextSchema>; insight?: InsightContext; allowedActions?: ('GUIDED_PRACTICE'|'REVIEW_FEEDBACK')[]; prompt?:IntelligencePrompt; signal: AbortSignal; maxOutputTokens: number }): Promise<{ output: unknown; outputTokens: number; cost: number; inputTokens?: number; costBasis?: 'DETERMINISTIC_FIXTURE' | 'CONFIGURED_TOKEN_RATES' | 'BUDGET_RESERVATION'; billedCost?: null }>;
}
export const groundedProposalSchema = z.object({
  evidenceIds: z.array(z.uuid()).length(1),
  facts: z.array(z.union([insightNumericEvidenceSchema.extend({kind:z.literal('NUMERIC_RESULT')}),insightNativeEvidenceSchema.safeExtend({kind:z.literal('RUBRIC_RESULT')})])).length(1),
  action: z.enum(['GUIDED_PRACTICE', 'REVIEW_FEEDBACK']), reason: z.literal('REVIEW_RECORDED_RESULT'),
  limitation: z.literal('SINGLE_RESULT_NOT_CAUSAL'),
  selectedActivityId: z.uuid().optional(),
  analysis:intelligenceAnalysisSchema.optional(),
}).strict();
export type GroundedProposal = z.infer<typeof groundedProposalSchema>;
/** Only a received proposal rejected by output checks belongs in the assessed-output denominator. */
export class ProposalEvaluationError extends DomainError { constructor(){super('INTELLIGENCE_REQUIRES_REVIEW',409,'Proposal evidence or school policy requires review.');} }
export function validateEvidenceContext(input: unknown) {
  const minimized=typeof input==='object'&&input!==null?Object.fromEntries(Object.entries(input).filter(([key])=>['resultId','evidenceId','referenceId','referenceVersion','score','maxScore','nativeResult'].includes(key))):input;
  const parsed = contextSchema.safeParse(minimized);
  if (!parsed.success || ('score'in parsed.data&&parsed.data.score > parsed.data.maxScore)) throw new DomainError('INTELLIGENCE_INSUFFICIENT_EVIDENCE', 409, 'Released evidence and an approved source version are required.');
  // Reference content is untrusted. Only native values and source identifiers reach the provider.
  return parsed.data;
}
export function renderGroundedProposal(output: GroundedProposal, context: z.infer<typeof contextSchema>) {
  return { observation: 'score'in context?`The released numeric result is ${context.score} / ${context.maxScore}.`:'The released rubric retains the cited criterion descriptors.', evidenceIds: output.evidenceIds,
    interpretation: 'This single result may inform a teacher-selected next learning action.',
    recommendation: output.action === 'GUIDED_PRACTICE' ? 'Try teacher-reviewed guided practice for the approved objective.' : 'Review the teacher feedback for the approved objective.',
    rationale: 'The proposal refers to the cited released result and preserves its native scale.',
    uncertainty: 'One result does not establish a cause or a learner trait. A teacher must review the proposed action.',
    activityTitle: output.action === 'GUIDED_PRACTICE' ? 'Guided practice' : 'Review feedback',
    instructions: output.action === 'GUIDED_PRACTICE' ? 'Use a teacher-approved example for this objective, practise it, and explain your approach.' : 'Review the teacher feedback and explain one next step with your teacher.',
    origin: 'AI_GENERATED' as const, status: 'AWAITING_HUMAN' as const };
}
export async function orchestrateProposal(provider: AIProvider, input: MinimalEvidenceContext, policy: { approved: boolean; timeoutMs: number; maxTokens: number; maxCost: number;allowedActions?:('GUIDED_PRACTICE'|'REVIEW_FEEDBACK')[];prompt?:IntelligencePrompt }) {
  if (!policy.approved) throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Approved intelligence policy is unavailable.');
  const context = validateEvidenceContext(input);
  const insight = input.insight ? validateInsightContext(input.insight, context) : undefined;
  const allowedActions=policy.allowedActions??['GUIDED_PRACTICE','REVIEW_FEEDBACK'];
  if(!allowedActions.length||new Set(allowedActions).size!==allowedActions.length||allowedActions.some(action=>!['GUIDED_PRACTICE','REVIEW_FEEDBACK'].includes(action)))throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'Approved action policy is unavailable.');
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1 || policy.timeoutMs > 30000 || !Number.isInteger(policy.maxTokens) || policy.maxTokens < 1 || policy.maxTokens > 4000 || !Number.isFinite(policy.maxCost) || policy.maxCost <= 0) throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Intelligence limits require review.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  const started = performance.now();
  try {
    let response: Awaited<ReturnType<AIProvider['generate']>>;
    try {
      response = await Promise.race([provider.generate({ purpose: 'NEXT_LEARNING_ACTION', context, ...(insight ? { insight } : {}),allowedActions,prompt:policy.prompt, signal: controller.signal, maxOutputTokens: policy.maxTokens }),
        new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new DomainError('INTELLIGENCE_TIMEOUT', 503, 'Intelligence timed out.')), { once: true }))]);
    } catch (error) { if(error instanceof ProposalEvaluationError)throw error;if (error instanceof DomainError && ['INTELLIGENCE_TIMEOUT', 'INTELLIGENCE_LIMIT_EXCEEDED'].includes(error.code)) throw new DomainError(error.code, 503, error.code === 'INTELLIGENCE_TIMEOUT' ? 'Intelligence timed out.' : 'Intelligence exceeded its configured limits.'); throw new DomainError('INTELLIGENCE_PROVIDER_FAILED', 503, 'Intelligence generation is temporarily unavailable.'); }
    if (!Number.isInteger(response.outputTokens) || response.outputTokens < 0 || !Number.isFinite(response.cost) || response.cost < 0 || response.outputTokens > policy.maxTokens || response.cost > policy.maxCost
      || response.costBasis !== undefined && (!['DETERMINISTIC_FIXTURE', 'CONFIGURED_TOKEN_RATES', 'BUDGET_RESERVATION'].includes(response.costBasis) || !Number.isInteger(response.inputTokens) || response.inputTokens! < 0)) throw new DomainError('INTELLIGENCE_LIMIT_EXCEEDED', 503, 'Intelligence exceeded its configured limits.');
    const parsed = groundedProposalSchema.safeParse(response.output);
    if (!parsed.success) throw new ProposalEvaluationError();
    if(!allowedActions.includes(parsed.data.action))throw new ProposalEvaluationError();
    let analysis:GroundedProposal['analysis'];try{
    if (parsed.data.selectedActivityId) { if (!insight||parsed.data.action!=='GUIDED_PRACTICE'||selectInsightOption(insight,parsed.data.selectedActivityId).kind!=='practice') throw new ProposalEvaluationError(); }
    if(['2','3'].includes(policy.prompt?.version??'')&&!parsed.data.analysis)throw new ProposalEvaluationError();
    analysis=parsed.data.analysis?validateIntelligenceAnalysis(parsed.data.analysis,context,insight):undefined;
    }catch{throw new ProposalEvaluationError();}
    const fact = parsed.data.facts[0];
    if (parsed.data.evidenceIds[0] !== context.evidenceId || fact.resultId !== context.resultId || fact.evidenceId !== context.evidenceId || fact.referenceId !== context.referenceId || fact.referenceVersion !== context.referenceVersion || ('score'in context?!('score'in fact)||fact.score!==context.score||fact.maxScore!==context.maxScore:!('nativeResult'in fact)||JSON.stringify(fact.nativeResult)!==JSON.stringify(context.nativeResult))) throw new ProposalEvaluationError();
    return { ...renderGroundedProposal(parsed.data, context),...(analysis?analysisCopy(analysis):{}), groundedOutput: parsed.data, usage: { outputTokens: response.outputTokens, cost: response.cost, latencyMs: Math.ceil(performance.now() - started), ...(response.costBasis ? { costBasis: response.costBasis, inputTokens: response.inputTokens! } : {}) } };
  } finally { clearTimeout(timer); }
}
