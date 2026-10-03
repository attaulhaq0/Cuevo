import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@cuevo/config';

const synthetic = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:56321',
  AI_GENERATION_MODE: 'LIVE',
  AI_PROVIDER: 'azure-foundry',
  AI_MODEL: 'configured-deployment',
  AI_BASE_URL: 'https://synthetic.services.ai.azure.com/openai/v1',
  AZURE_OPENAI_API_KEY: 'synthetic-foundry-credential',
  AI_DATA_POLICY_STATUS: 'SYNTHETIC_ONLY',
};

const approved = {
  ...synthetic,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://runtime:synthetic-database-credential@db.example/cuevo',
  API_ALLOWED_ORIGIN: 'https://app.example',
  SUPABASE_URL: 'https://auth.example',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  AI_DATA_POLICY_STATUS: 'APPROVED',
  AI_INPUT_COST_PER_MILLION: '12.375',
  AI_OUTPUT_COST_PER_MILLION: '20.625',
};

describe('Foundry live configuration approval boundary', () => {
  it.each([
    'http://127.0.0.1:56321',
    'http://localhost:56321',
    'http://host.docker.internal:56321',
  ])('permits synthetic-only live analysis on the documented Cuevo Auth origin %s', SUPABASE_URL => {
    const config = parseServerConfig({ ...synthetic, SUPABASE_URL }, 'api');
    expect(config.aiEnabled).toBe(true);
    expect(config.intelligence).toMatchObject({ mode: 'LIVE', approved: true, provider: 'azure-foundry', model: 'configured-deployment' });
    expect(config.foundry).toMatchObject({ syntheticOnly: true, endpoint: 'https://synthetic.services.ai.azure.com/openai/v1' });
    expect(config.foundry?.inputCostPerMillion).toBeUndefined();
    expect(config.foundry?.outputCostPerMillion).toBeUndefined();
    expect(config.intelligence.maxCost).toBeGreaterThan(0);
  });

  it.each([
    'https://auth.example',
    'http://auth.example:56321',
    'http://127.0.0.1:54321',
    'http://localhost:56322',
    'https://127.0.0.1:56321',
    'http://host.docker.internal:54321',
  ])('denies synthetic-only live analysis outside the local Cuevo Auth boundary %s', SUPABASE_URL => {
    expect(() => parseServerConfig({ ...synthetic, SUPABASE_URL }, 'api')).toThrow();
  });

  it('denies synthetic-only live analysis in production even with otherwise complete approved settings', () => {
    expect(() => parseServerConfig({ ...approved, AI_DATA_POLICY_STATUS: 'SYNTHETIC_ONLY' }, 'api')).toThrow();
  });

  it('permits approved production live analysis only with explicit endpoint, key, deployment and rates', () => {
    const config = parseServerConfig(approved, 'api');
    expect(config.aiEnabled).toBe(true);
    expect(config.intelligence).toMatchObject({ mode: 'LIVE', approved: true });
    expect(config.foundry).toMatchObject({ syntheticOnly: false, inputCostPerMillion: 12.375, outputCostPerMillion: 20.625 });
  });

  it.each([
    'AZURE_OPENAI_API_KEY',
    'AI_BASE_URL',
    'AI_MODEL',
    'AI_DATA_POLICY_STATUS',
    'AI_INPUT_COST_PER_MILLION',
    'AI_OUTPUT_COST_PER_MILLION',
  ])('disables approved production live analysis when %s is missing', field => {
    const config = parseServerConfig({ ...approved, [field]: undefined }, 'api');
    expect(config.aiEnabled).toBe(false);
    expect(config.intelligence.approved).toBe(false);
  });

  it('cannot substitute an OpenAI credential for the Foundry credential', () => {
    const config = parseServerConfig({ ...approved, AZURE_OPENAI_API_KEY: undefined, OPENAI_API_KEY: 'synthetic-other-provider-credential' }, 'api');
    expect(config.aiEnabled).toBe(false);
    expect(config.intelligence.approved).toBe(false);
  });

  it('does not enable an unapproved live data policy merely because rates and credentials exist', () => {
    const config = parseServerConfig({ ...approved, AI_DATA_POLICY_STATUS: 'REQUIRES_REVIEW' }, 'api');
    expect(config.aiEnabled).toBe(false);
    expect(config.intelligence.approved).toBe(false);
  });

  it('keeps live integration disabled until live generation is explicitly selected', () => {
    const config = parseServerConfig({ ...approved, AI_GENERATION_MODE: 'DISABLED' }, 'api');
    expect(config.aiEnabled).toBe(false);
    expect(config.intelligence.mode).toBe('DISABLED');
  });
});

describe('Foundry endpoint, price and error validation', () => {
  it.each([
    'http://synthetic.services.ai.azure.com/openai/v1',
    'https://synthetic.services.ai.azure.com.evil.example/openai/v1',
    'https://synthetic.openai.azure.com.evil.example/openai/v1',
    'https://unapproved.example/openai/v1',
    'https://services.ai.azure.com/openai/v1',
    'https://synthetic.services.ai.azure.com/',
    'https://synthetic.services.ai.azure.com/openai/v1/responses',
    'https://synthetic.services.ai.azure.com/openai/v1?api-key=synthetic-query-credential',
    'https://synthetic.services.ai.azure.com/openai/v1#synthetic-fragment',
    'https://synthetic-user:synthetic-password@synthetic.services.ai.azure.com/openai/v1',
  ])('rejects an unsafe or incorrectly scoped endpoint %s', AI_BASE_URL => {
    expect(() => parseServerConfig({ ...synthetic, AI_BASE_URL }, 'api')).toThrow();
  });

  it.each([
    'https://synthetic.services.ai.azure.com/openai/v1/',
    'https://synthetic.openai.azure.com/openai/v1/',
  ])('accepts only the supported Azure host families and normalizes a trailing slash %s', AI_BASE_URL => {
    expect(parseServerConfig({ ...synthetic, AI_BASE_URL }, 'api').foundry?.endpoint).toBe(AI_BASE_URL.slice(0, -1));
  });

  it.each(['AI_INPUT_COST_PER_MILLION', 'AI_OUTPUT_COST_PER_MILLION'] as const)('rejects non-positive or non-finite configured rates in %s', field => {
    for (const value of ['0', '-0.1', 'NaN', 'Infinity', '-Infinity', 'not-a-price']) {
      expect(() => parseServerConfig({ ...approved, [field]: value }, 'api')).toThrow();
    }
  });

  it('reports validation and policy errors without copying credential or configuration values', () => {
    const marker = 'synthetic-sensitive-value-do-not-log';
    for (const input of [
      { ...synthetic, AZURE_OPENAI_API_KEY: marker, AI_BASE_URL: `https://user:${marker}@synthetic.services.ai.azure.com/openai/v1` },
      { ...approved, AZURE_OPENAI_API_KEY: marker, AI_INPUT_COST_PER_MILLION: marker },
      { ...synthetic, AZURE_OPENAI_API_KEY: marker, SUPABASE_URL: `https://${marker}.example` },
    ]) {
      let failure: unknown;
      try { parseServerConfig(input, 'api'); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).not.toContain(marker);
      expect(String(failure)).not.toContain(input.AI_BASE_URL);
      expect(String(failure)).not.toContain(input.SUPABASE_URL);
    }
  });
});
