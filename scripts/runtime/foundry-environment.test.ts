import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeEnvironment } from './environment';

const input = {
  PATH: 'synthetic-toolchain', NODE_ENV: 'test',
  AI_PROVIDER: 'azure-foundry', AI_MODEL: 'configured-deployment',
  AI_BASE_URL: 'https://synthetic.services.ai.azure.com/openai/v1',
  AZURE_OPENAI_API_KEY: 'synthetic-foundry-credential',
  AI_DATA_POLICY_STATUS: 'SYNTHETIC_ONLY', AI_GENERATION_MODE: 'LIVE',
  AI_INPUT_COST_PER_MILLION: '12.375', AI_OUTPUT_COST_PER_MILLION: '20.625',
  AI_TIMEOUT_MS: '10000', AI_MAX_OUTPUT_TOKENS: '1000', AI_MAX_COST: '1',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_AZURE_OPENAI_API_KEY: 'synthetic-unreviewed-public-credential',
  NODE_OPTIONS: '--require=synthetic-untrusted-loader', UNRELATED_SECRET: 'synthetic-unrelated-credential',
};

test('API child retains Foundry credentials, endpoint, policy and cost limits for its provider', () => {
  const child = runtimeEnvironment('api', input);
  assert.equal(child.AZURE_OPENAI_API_KEY, 'synthetic-foundry-credential');
  assert.equal(child.AI_BASE_URL, 'https://synthetic.services.ai.azure.com/openai/v1');
  assert.equal(child.AI_PROVIDER, 'azure-foundry');
  assert.equal(child.AI_MODEL, 'configured-deployment');
  assert.equal(child.AI_DATA_POLICY_STATUS, 'SYNTHETIC_ONLY');
  assert.equal(child.AI_GENERATION_MODE, 'LIVE');
  assert.equal(child.AI_INPUT_COST_PER_MILLION, '12.375');
  assert.equal(child.AI_OUTPUT_COST_PER_MILLION, '20.625');
  assert.equal(child.AI_TIMEOUT_MS, '10000');
  assert.equal(child.AI_MAX_OUTPUT_TOKENS, '1000');
  assert.equal(child.AI_MAX_COST, '1');
  for (const key of ['NEXT_PUBLIC_AZURE_OPENAI_API_KEY', 'NEXT_PUBLIC_API_URL', 'UNRELATED_SECRET', 'NODE_OPTIONS']) assert.equal(child[key], undefined);
});

for (const service of ['web', 'worker'] as const) {
  test(`${service} child excludes Foundry credentials and private provider configuration`, () => {
    const child = runtimeEnvironment(service, input);
    assert.equal(child.PATH, 'synthetic-toolchain');
    for (const key of [
      'AZURE_OPENAI_API_KEY', 'AI_BASE_URL', 'AI_PROVIDER', 'AI_MODEL',
      'AI_DATA_POLICY_STATUS', 'AI_GENERATION_MODE', 'AI_INPUT_COST_PER_MILLION',
      'AI_OUTPUT_COST_PER_MILLION', 'AI_TIMEOUT_MS', 'AI_MAX_OUTPUT_TOKENS', 'AI_MAX_COST',
      'NEXT_PUBLIC_AZURE_OPENAI_API_KEY', 'UNRELATED_SECRET', 'NODE_OPTIONS',
    ]) assert.equal(child[key], undefined);
    assert.equal(Object.values(child).includes('synthetic-foundry-credential'), false);
  });
}
