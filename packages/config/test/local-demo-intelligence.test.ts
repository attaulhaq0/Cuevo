import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '../src/index';

const demo: Record<string, string | undefined> = {
  CUEVO_LOCAL_DEMO_MODE: 'INTEGRATION_PRESENTATION', NODE_ENV: 'development', CUEVO_DEPLOYMENT_ENVIRONMENT: 'local',
  SUPABASE_URL: 'http://127.0.0.1:57421', DATABASE_URL: 'postgresql://cuevo_api:local-fixture-password@127.0.0.1:57422/cuevo_integration_20261004',
  API_ALLOWED_ORIGIN: 'http://127.0.0.1:54131', API_PORT: '54132', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true', POSTHOG_CAPTURE_MODE: 'DISABLED',
};

describe('isolated integration presentation fixture configuration', () => {
  it.each([{VERCEL:'1'},{VERCEL_ENV:'preview'},{VERCEL_ENV:'production'},{VERCEL_URL:'cuevo.vercel.app'},{VERCEL:''}])('rejects hosted markers even with every local fixture field present: %j', hosted => {
    expect(() => parseServerConfig({...demo,...hosted},'api')).toThrow();
  });
  it.each(['development', 'test'])('admits only the explicit exact API fixture profile in %s', NODE_ENV => {
    const config = parseServerConfig({ ...demo, NODE_ENV }, 'api');
    expect(config).toMatchObject({ localDemoMode: 'INTEGRATION_PRESENTATION', deploymentEnvironment: 'local', databaseTls: false, apiPort: 54132, allowedOrigin: 'http://127.0.0.1:54131', aiEnabled: true, analyticsEnabled: false, authProvisioning: { mode: 'DISABLED' }, intelligence: { mode: 'FIXTURE', provider: 'deterministic-fixture', model: 'source-locked-v1', approved: true } });
    expect(config.databaseUrl).toBe(demo.DATABASE_URL); expect(config.foundry).toBeUndefined();
    expect(parseServerConfig({ ...demo, NODE_ENV, CUEVO_DEPLOYMENT_ENVIRONMENT: undefined }, 'api').localDemoMode).toBe('INTEGRATION_PRESENTATION');
  });

  it.each(['all', 'worker'] as const)('refuses profile inheritance by the %s consumer', consumer => {
    expect(() => parseServerConfig(demo, consumer)).toThrow();
  });

  it.each([
    ['CUEVO_LOCAL_DEMO_MODE', undefined], ['CUEVO_LOCAL_DEMO_MODE', ''], ['CUEVO_LOCAL_DEMO_MODE', 'another-profile'],
    ['NODE_ENV', undefined], ['NODE_ENV', 'production'], ['CUEVO_DEPLOYMENT_ENVIRONMENT', 'production'], ['CUEVO_DEPLOYMENT_ENVIRONMENT', 'synthetic-staging'],
    ['SUPABASE_URL', 'http://127.0.0.1:56321'], ['SUPABASE_URL', 'http://localhost:57421'], ['SUPABASE_URL', 'http://127.0.0.1:57421/'], ['SUPABASE_URL', 'https://remote.supabase.co'],
    ['DATABASE_URL', 'postgresql://cuevo_api:local@127.0.0.1:56322/postgres'], ['DATABASE_URL', 'postgresql://cuevo_api:local@localhost:57422/cuevo_integration_20261004'],
    ['DATABASE_URL', 'postgresql://postgres:local@127.0.0.1:57422/cuevo_integration_20261004'], ['DATABASE_URL', 'postgresql://cuevo_worker:local@127.0.0.1:57422/cuevo_integration_20261004'],
    ['DATABASE_URL', 'postgresql://cuevo_api@127.0.0.1:57422/cuevo_integration_20261004'], ['DATABASE_URL', 'postgresql://cuevo_api:local@127.0.0.1:57422/postgres'],
    ['DATABASE_URL', 'postgresql://cuevo_api:local@127.0.0.1:57422/cuevo_integration_20261004?host=remote.invalid'], ['DATABASE_URL', 'postgresql://cuevo_api:local@127.0.0.1:57422/cuevo_integration_20261004#fragment'],
    ['DATABASE_URL', 'postgresql://cuevo_api:local%0Apassword@127.0.0.1:57422/cuevo_integration_20261004'],
    ['API_ALLOWED_ORIGIN', 'http://localhost:54131'], ['API_ALLOWED_ORIGIN', 'http://127.0.0.1:3000'], ['API_PORT', '4000'], ['API_PORT', undefined],
    ['AI_GENERATION_MODE', 'LIVE'], ['AI_GENERATION_MODE', 'DISABLED'], ['AI_FIXTURE_ENABLED', 'false'], ['AI_FIXTURE_ENABLED', undefined],
    ['POSTHOG_CAPTURE_MODE', 'LIVE_SYNTHETIC'], ['POSTHOG_CAPTURE_MODE', undefined],
  ])('refuses a missing or mismatched presentation field %s', (key, value) => {
    expect(() => parseServerConfig({ ...demo, [key]: value }, 'api')).toThrow();
  });

  it.each([
    ['OPENAI_API_KEY', 'private-live-key'], ['AZURE_OPENAI_API_KEY', 'private-live-key'], ['AZURE_SORA_API_KEY', 'private-live-key'],
    ['AI_BASE_URL', 'https://example.services.ai.azure.com/openai/v1'], ['AI_PROVIDER', 'azure-foundry'], ['AI_MODEL', 'configured'], ['CUEVO_SYNTHETIC_PROJECT_REF', 'abcdefghijklmnopqrst'], ['CUEVO_SYNTHETIC_WEB_ORIGIN', 'https://cuevo.example'],
    ['CUEVO_AUTH_PROVISIONING_MODE', 'LOCAL_SYNTHETIC'], ['CUEVO_AUTH_PROVISIONING_KEY', 'private-provisioning-key'],
  ])('refuses an added credential or alternate authority %s without leaking it', (key, value) => {
    let failure: unknown;
    try { parseServerConfig({ ...demo, [key]: value }, 'api'); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error); expect(String(failure)).not.toContain(value);
  });

  it.each(['', 'false', 'integration_presentation', 'ANOTHER_PROFILE'])('rejects explicit unknown profile %s even on the ordinary permitted fixture', CUEVO_LOCAL_DEMO_MODE => {
    expect(() => parseServerConfig({ CUEVO_LOCAL_DEMO_MODE, NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:56321', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }, 'api')).toThrow();
  });

  it('keeps ordinary local fixture and complete hosted staging admission independent', () => {
    const ordinary = parseServerConfig({ NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:56321', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' });
    expect(ordinary.intelligence.mode).toBe('FIXTURE'); expect(ordinary.localDemoMode).toBeUndefined();
    const project = 'abcdefghijklmnopqrst';
    const hosted = parseServerConfig({ NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging', CUEVO_SYNTHETIC_PROJECT_REF: project, CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://cuevo.example', SUPABASE_URL: `https://${project}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', API_ALLOWED_ORIGIN: 'https://cuevo.example', DATABASE_URL: `postgresql://cuevo_api:fixture@db.${project}.supabase.co:5432/postgres`, AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }, 'api');
    expect(hosted).toMatchObject({ aiEnabled: true, databaseTls: true, deploymentEnvironment: 'synthetic-staging' }); expect(hosted.localDemoMode).toBeUndefined();
    expect(() => parseServerConfig({ ...demo, CUEVO_LOCAL_DEMO_MODE: undefined, AI_GENERATION_MODE: 'LIVE', AI_FIXTURE_ENABLED: 'false', AI_DATA_POLICY_STATUS: 'SYNTHETIC_ONLY', AI_PROVIDER: 'azure-foundry', AI_MODEL: 'configured', AI_BASE_URL: 'https://example.services.ai.azure.com/openai/v1', AZURE_OPENAI_API_KEY: 'private-live-key' }, 'api')).toThrow();
  });
});
