import { describe, expect, it } from 'vitest';
import { FoundryProvider } from '../../src/modules/improvement/foundry-provider';
const context = { resultId: '10000000-0000-4000-8000-000000000001', evidenceId: '10000000-0000-4000-8000-000000000002', referenceId: '10000000-0000-4000-8000-000000000003', referenceVersion: 'synthetic-v1', score: 0, maxScore: 10 };
const config = { endpoint: 'https://synthetic.services.ai.azure.com/openai/v1', model: 'configured-model', apiKey: 'invented', reservedCost: 1, syntheticOnly: true };
const request = { purpose: 'NEXT_LEARNING_ACTION' as const, context, signal: new AbortController().signal, maxOutputTokens: 1000 };
const output = { evidenceIds: [context.evidenceId], facts: [{ kind: 'NUMERIC_RESULT', ...context }], action: 'GUIDED_PRACTICE', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL', selectedActivityId: null };
describe('Foundry bounded transport and honest estimate accounting', () => {
  it('counts reasoning only once and reports configured estimate separately from unknown billing', async () => {
    let sent = '';
    const provider = new FoundryProvider({ ...config, syntheticOnly: false, inputCostPerMillion: 12.375, outputCostPerMillion: 20.625 }, async (_input, init) => {
      sent = String(init?.body);
      return new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(output), usage: { input_tokens: 150, input_tokens_details: { cached_tokens: 80 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 30 } } }));
    });
    expect(await provider.generate(request)).toMatchObject({ inputTokens: 150, outputTokens: 100, cost: .00391875, costBasis: 'CONFIGURED_TOKEN_RATES', billedCost: null });
    expect(sent).not.toContain('This is synthetic test data');
  });
  it('rejects insufficient configured budget before transport and never retries', async () => {
    let calls = 0; const provider = new FoundryProvider({ ...config, reservedCost: .000001, inputCostPerMillion: 12.375, outputCostPerMillion: 20.625 }, async () => { calls++; throw Error('must never call'); });
    await expect(provider.generate(request)).rejects.toMatchObject({ code: 'INTELLIGENCE_LIMIT_EXCEEDED' }); expect(calls).toBe(0);
  });
  it('strips unknown evidence fields and bounds oversized replies while reading', async () => {
    let canceled = false; let sent = '';
    const provider = new FoundryProvider(config, async (_input, init) => { sent = String(init?.body); return new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(40000)); }, cancel() { canceled = true; } })); });
    await expect(provider.generate({ ...request, context: { ...context, rawAnswer: 'PRIVATE ANSWER' } as typeof context })).rejects.toMatchObject({ code: 'INTELLIGENCE_PROVIDER_FAILED' });
    expect(sent).not.toContain('PRIVATE ANSWER'); expect(canceled).toBe(true);
  });
  it('never exposes invalid endpoint content or accepts partially defined rate estimates', () => {
    expect(() => new FoundryProvider({ ...config, endpoint: 'not a URL private-secret' })).toThrow('Configured model generation');
    expect(() => new FoundryProvider({ ...config, inputCostPerMillion: 2 })).toThrow();
  });
  it('rejects a claimed zero-usage response that contains generated text', async () => {
    const provider = new FoundryProvider(config, async () => new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(output), usage: { input_tokens: 0, output_tokens: 0 } })));
    await expect(provider.generate(request)).rejects.toMatchObject({ code: 'INTELLIGENCE_PROVIDER_FAILED' });
  });
});
