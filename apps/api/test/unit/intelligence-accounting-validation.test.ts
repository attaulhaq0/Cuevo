import { describe, expect, it } from 'vitest';
import { orchestrateProposal, type AIProvider } from '../../src/modules/improvement/orchestrator';
const context = { resultId: '10000000-0000-4000-8000-000000000001', evidenceId: '10000000-0000-4000-8000-000000000002', referenceId: '10000000-0000-4000-8000-000000000003', referenceVersion: 'synthetic-v1', score: 0, maxScore: 10 };
const output = { evidenceIds: [context.evidenceId], facts: [{ kind: 'NUMERIC_RESULT', ...context }], action: 'GUIDED_PRACTICE', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL' };
const policy = { approved: true, timeoutMs: 1000, maxTokens: 1000, maxCost: 1 };
describe('model-independent accounting validation', () => {
  it.each([undefined, -1, 1.5, Number.NaN])('never replaces missing or invalid live input usage with zero: %s', async inputTokens => {
    const provider: AIProvider = { generate: async () => ({ output, inputTokens, outputTokens: 2, cost: 1, costBasis: 'BUDGET_RESERVATION' }) };
    await expect(orchestrateProposal(provider, context, policy)).rejects.toMatchObject({ code: 'INTELLIGENCE_LIMIT_EXCEEDED' });
  });
  it('retains a sanitized provider budget rejection as a limit failure', async () => {
    const { DomainError } = await import('@cuevo/domain');
    const provider: AIProvider = { generate: async () => { throw new DomainError('INTELLIGENCE_LIMIT_EXCEEDED', 503, 'Configured model budget requires review.'); } };
    await expect(orchestrateProposal(provider, context, policy)).rejects.toMatchObject({ code: 'INTELLIGENCE_LIMIT_EXCEEDED' });
  });
});
