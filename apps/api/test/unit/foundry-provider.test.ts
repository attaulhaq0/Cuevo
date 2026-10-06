import { describe, expect, it } from 'vitest';
import { FoundryProvider } from '../../src/modules/improvement/foundry-provider';
import { orchestrateProposal, type MinimalEvidenceContext } from '../../src/modules/improvement/orchestrator';
const context: MinimalEvidenceContext = { resultId: '10000000-0000-4000-8000-000000000001', evidenceId: '10000000-0000-4000-8000-000000000002', referenceId: '10000000-0000-4000-8000-000000000003', referenceVersion: 'synthetic-v1', score: 0, maxScore: 10 };
const output = { evidenceIds: [context.evidenceId], facts: [{ kind: 'NUMERIC_RESULT', ...context }], action: 'GUIDED_PRACTICE', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL', selectedActivityId: null };
const config = { endpoint: 'https://synthetic.services.ai.azure.com/openai/v1', model: 'configured-model', apiKey: 'private-synthetic-credential', reservedCost: 1, syntheticOnly: true };
const response = (value: unknown = output) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 150, output_tokens: 100, total_tokens: 250 } }), { status: 200 });
describe('server-only Foundry Responses provider boundary', () => {
  it('uses strict Responses JSON schema, no storage/tools, minimal authorized facts and sanitized accounting', async () => {
    let posted: Record<string, unknown> | undefined; let url = ''; let headers: Headers | undefined;
    const provider = new FoundryProvider(config, async (input, init) => { url = String(input); headers = new Headers(init?.headers); posted = JSON.parse(String(init?.body)); return response(); });
    const result = await provider.generate({ purpose: 'NEXT_LEARNING_ACTION', context, signal: new AbortController().signal, maxOutputTokens: 1000 });
    expect(url).toBe('https://synthetic.services.ai.azure.com/openai/v1/responses'); expect(headers?.get('authorization')).toBe('Bearer private-synthetic-credential');
    expect(posted).toMatchObject({ model: 'configured-model', store: false, max_output_tokens: 1000, text: { format: { type: 'json_schema', name: 'cuevo_grounded_proposal', strict: true } } });
    expect(posted).not.toHaveProperty('tools'); expect(JSON.stringify(posted)).not.toContain('private-synthetic-credential'); expect(result).toMatchObject({ outputTokens: 100, inputTokens: 150, cost: 1, costBasis: 'BUDGET_RESERVATION', billedCost: null });
    expect(result.output).not.toHaveProperty('selectedActivityId');
  });
  it.each([new Response('private upstream response', { status: 401 }), new Response('private upstream response', { status: 429 }), new Response(JSON.stringify({ status: 'incomplete', output: [], usage: { input_tokens: 2, output_tokens: 1000 } }), { status: 200 }), new Response(JSON.stringify({ status: 'completed', output: [{ type: 'function_call', name: 'change_grade' }], usage: { input_tokens: 2, output_tokens: 4 } }), { status: 200 })])('fails closed on refused, incomplete or high-impact outputs without leaking provider bodies', async upstream => {
    const provider = new FoundryProvider(config, async () => upstream); let failure: unknown;
    try { await provider.generate({ purpose: 'NEXT_LEARNING_ACTION', context, signal: new AbortController().signal, maxOutputTokens: 1000 }); } catch (error) { failure = error; }
    expect(failure).toBeDefined(); expect(String(failure)).not.toMatch(/private upstream|credential|change_grade/);
  });
  it('cannot turn a grounded-looking fabricated grade or another evidence ID into a valid proposal', async () => {
    const provider = new FoundryProvider(config, async () => response({ ...output, facts: [{ kind: 'NUMERIC_RESULT', ...context, score: 9 }] }));
    await expect(orchestrateProposal(provider, context, { approved: true, timeoutMs: 1000, maxTokens: 1000, maxCost: 1 })).rejects.toMatchObject({ code: 'INTELLIGENCE_REQUIRES_REVIEW' });
  });
  it('rejects missing usage, oversized output and unsafe endpoint/unknown production pricing', async () => {
    expect(() => new FoundryProvider({ ...config, endpoint: 'http://127.0.0.1:56322' })).toThrow(); expect(() => new FoundryProvider({ ...config, syntheticOnly: false })).toThrow();
    const provider = new FoundryProvider(config, async () => new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(output), usage: { input_tokens: 2, output_tokens: 4001 } }), { status: 200 }));
    await expect(provider.generate({ purpose: 'NEXT_LEARNING_ACTION', context, signal: new AbortController().signal, maxOutputTokens: 1000 })).rejects.toBeDefined();
  });
});
