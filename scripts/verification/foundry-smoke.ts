import { FoundryProvider } from '../../apps/api/src/modules/improvement/foundry-provider';
import { orchestrateProposal } from '../../apps/api/src/modules/improvement/orchestrator';
import { DomainError } from '@cuevo/domain';
import { withCustomerLiveAllowance } from '../../apps/api/test/integration/customer-live-allowance';

// Explicitly synthetic, non-database transport verification. Never print provider output.
const path = '.local/customer-readiness/foundry-smoke.json';
const apiKey = process.env.AZURE_OPENAI_API_KEY;
if (!apiKey) throw Error('Inherited Foundry credential unavailable.');
const { record } = await withCustomerLiveAllowance({ path, writer: 'TRANSPORT_SMOKE' }, async () => {
  const receipt: Record<string, unknown> = { provider: 'azure-foundry', model: 'gpt-6.1-sol', data: 'SYNTHETIC_ONLY', costBasis: 'BUDGET_RESERVATION', reservedBudget: 1, billedCost: null, automaticRetries: 0 };
  const provider = new FoundryProvider({ endpoint: 'https://edeviser-sweden-resource.services.ai.azure.com/openai/v1', apiKey, model: 'gpt-6.1-sol', syntheticOnly: true, reservedCost: 1 });
  const started = performance.now();
  try {
    const result = await orchestrateProposal(provider, { resultId: '70000000-0000-4000-8000-000000000001', evidenceId: '70000000-0000-4000-8000-000000000002', referenceId: '70000000-0000-4000-8000-000000000003', referenceVersion: 'synthetic-smoke-v1', score: 2, maxScore: 10 }, { approved: true, timeoutMs: 30000, maxTokens: 1800, maxCost: 1 });
    Object.assign(receipt, { status: 'VALIDATED_PROPOSAL_AWAITING_HUMAN', inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, elapsedMs: Math.ceil(performance.now() - started), costBasis: result.usage.costBasis });
  } catch (error) { Object.assign(receipt, { status: 'FAILED_REQUIRES_REVIEW', failureCode: error instanceof DomainError ? error.code : 'INTELLIGENCE_PROVIDER_FAILED', elapsedMs: Math.ceil(performance.now() - started), usage: 'UNKNOWN' }); process.exitCode = 1; }
  return { result: undefined, receipt };
});
process.stdout.write(JSON.stringify(record) + '\n');
