import { z } from 'zod';
import { DomainError } from '@cuevo/domain';
import { validateInsightContext, selectInsightOption, type InsightContext } from './insight-context';

const contextSchema = z.object({ resultId: z.uuid(), evidenceId: z.uuid(), referenceId: z.uuid(),
  referenceVersion: z.string().min(1).max(100), score: z.number().min(0), maxScore: z.number().positive().max(100000) });
export interface MinimalEvidenceContext extends z.infer<typeof contextSchema> { referenceTitle?: string; insight?: InsightContext }
export interface AIProvider {
  generate(request: { purpose: 'NEXT_LEARNING_ACTION'; context: z.infer<typeof contextSchema>; insight?: InsightContext; signal: AbortSignal; maxOutputTokens: number }): Promise<{ output: unknown; outputTokens: number; cost: number }>;
}
export const groundedProposalSchema = z.object({
  evidenceIds: z.array(z.uuid()).length(1),
  facts: z.array(contextSchema.extend({ kind: z.literal('NUMERIC_RESULT') }).strict()).length(1),
  action: z.enum(['GUIDED_PRACTICE', 'REVIEW_FEEDBACK']), reason: z.literal('REVIEW_RECORDED_RESULT'),
  limitation: z.literal('SINGLE_RESULT_NOT_CAUSAL'),
  selectedActivityId: z.uuid().optional(),
}).strict();
export type GroundedProposal = z.infer<typeof groundedProposalSchema>;
export function validateEvidenceContext(input: unknown) {
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success || parsed.data.score > parsed.data.maxScore) throw new DomainError('INTELLIGENCE_INSUFFICIENT_EVIDENCE', 409, 'Released evidence and an approved source version are required.');
  // Reference content is untrusted. Only native values and source identifiers reach the provider.
  return parsed.data;
}
export function renderGroundedProposal(output: GroundedProposal, context: z.infer<typeof contextSchema>) {
  return { observation: `The released numeric result is ${context.score} / ${context.maxScore}.`, evidenceIds: output.evidenceIds,
    interpretation: 'This single result may inform a teacher-selected next learning action.',
    recommendation: output.action === 'GUIDED_PRACTICE' ? 'Try teacher-reviewed guided practice for the approved objective.' : 'Review the teacher feedback for the approved objective.',
    rationale: 'The proposal refers to the cited released result and preserves its native scale.',
    uncertainty: 'One result does not establish a cause or a learner trait. A teacher must review the proposed action.',
    activityTitle: output.action === 'GUIDED_PRACTICE' ? 'Guided practice' : 'Review feedback',
    instructions: output.action === 'GUIDED_PRACTICE' ? 'Use a teacher-approved example for this objective, practise it, and explain your approach.' : 'Review the teacher feedback and explain one next step with your teacher.',
    origin: 'AI_GENERATED' as const, status: 'AWAITING_HUMAN' as const };
}
export async function orchestrateProposal(provider: AIProvider, input: MinimalEvidenceContext, policy: { approved: boolean; timeoutMs: number; maxTokens: number; maxCost: number }) {
  if (!policy.approved) throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Approved intelligence policy is unavailable.');
  const context = validateEvidenceContext(input);
  const insight = input.insight ? validateInsightContext(input.insight, context) : undefined;
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1 || policy.timeoutMs > 30000 || !Number.isInteger(policy.maxTokens) || policy.maxTokens < 1 || policy.maxTokens > 4000 || !Number.isFinite(policy.maxCost) || policy.maxCost <= 0) throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Intelligence limits require review.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  const started = performance.now();
  try {
    let response: Awaited<ReturnType<AIProvider['generate']>>;
    try {
      response = await Promise.race([provider.generate({ purpose: 'NEXT_LEARNING_ACTION', context, ...(insight ? { insight } : {}), signal: controller.signal, maxOutputTokens: policy.maxTokens }),
        new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new DomainError('INTELLIGENCE_TIMEOUT', 503, 'Intelligence timed out.')), { once: true }))]);
    } catch (error) { if (error instanceof DomainError && error.code === 'INTELLIGENCE_TIMEOUT') throw error; throw new DomainError('INTELLIGENCE_PROVIDER_FAILED', 503, 'Intelligence generation is temporarily unavailable.'); }
    if (!Number.isInteger(response.outputTokens) || response.outputTokens < 0 || !Number.isFinite(response.cost) || response.cost < 0 || response.outputTokens > policy.maxTokens || response.cost > policy.maxCost) throw new DomainError('INTELLIGENCE_LIMIT_EXCEEDED', 503, 'Intelligence exceeded its configured limits.');
    const parsed = groundedProposalSchema.safeParse(response.output);
    if (!parsed.success) throw new DomainError('INTELLIGENCE_REQUIRES_REVIEW', 409, 'Proposal provenance requires review.');
    if (parsed.data.selectedActivityId) { if (!insight) throw new DomainError('INTELLIGENCE_REQUIRES_REVIEW',409,'A learning option requires authorized insight context.'); selectInsightOption(insight, parsed.data.selectedActivityId); }
    const fact = parsed.data.facts[0];
    if (parsed.data.evidenceIds[0] !== context.evidenceId || fact.resultId !== context.resultId || fact.evidenceId !== context.evidenceId || fact.referenceId !== context.referenceId || fact.referenceVersion !== context.referenceVersion || fact.score !== context.score || fact.maxScore !== context.maxScore) throw new DomainError('INTELLIGENCE_REQUIRES_REVIEW', 409, 'Proposal provenance requires review.');
    return { ...renderGroundedProposal(parsed.data, context), groundedOutput: parsed.data, usage: { outputTokens: response.outputTokens, cost: response.cost, latencyMs: Math.ceil(performance.now() - started) } };
  } finally { clearTimeout(timer); }
}
