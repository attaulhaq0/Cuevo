import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '../src/index';
describe('configuration fails closed', () => {
  it('reports unavailable integrations without fabricated secrets', () => {
    const config = parseServerConfig({});
    expect(config.databaseUrl).toBeUndefined(); expect(config.supabaseUrl).toBeUndefined();
    expect(config.aiEnabled).toBe(false); expect(config.analyticsEnabled).toBe(false);
  });
  it('rejects secret Supabase keys in publishable configuration', () => {
    expect(() => parseServerConfig({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_invalid' })).toThrow();
  });
  it('requires explicit origin and database in production', () => {
    expect(() => parseServerConfig({ NODE_ENV: 'production' })).toThrow();
  });
  it('cannot enable AI without approved data policy and configured provider', () => {
    expect(parseServerConfig({ OPENAI_API_KEY: 'present', AI_PROVIDER: 'openai', AI_MODEL: 'configured' }).aiEnabled).toBe(false);
  });

  it.each([
    'ftp://host', 'file:///tmp/auth', 'https://user:private@auth.example',
    'https://auth.example/auth/v1', 'https://auth.example?private=credential', 'https://auth.example#fragment',
  ])('rejects malformed Supabase base URL %s', (SUPABASE_URL) => {
    expect(() => parseServerConfig({ SUPABASE_URL })).toThrow();
  });

  it.each([
    'https://app.example/login', 'https://app.example?query=1', 'https://app.example#fragment',
    'https://user:secret@app.example', 'ftp://app.example',
  ])('rejects a URL that is not a browser origin %s', (API_ALLOWED_ORIGIN) => {
    expect(() => parseServerConfig({ API_ALLOWED_ORIGIN })).toThrow();
  });

  it('normalizes an explicit trailing root slash to the browser origin', () => {
    expect(parseServerConfig({ API_ALLOWED_ORIGIN: 'http://localhost:3000/' }).allowedOrigin).toBe('http://localhost:3000');
  });

  it('preserves HTTP loopback service origins for local development', () => {
    expect(parseServerConfig({ SUPABASE_URL: 'http://127.0.0.1:56321' }).supabaseUrl).toBe('http://127.0.0.1:56321');
  });

  const production = {
    NODE_ENV: 'production', DATABASE_URL: 'postgresql://runtime:private@db.example:5432/cuevo',
    WORKER_DATABASE_URL: 'postgresql://worker:private@db.example:5432/cuevo',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_URL: 'https://auth.example',
    API_ALLOWED_ORIGIN: 'https://app.example',
  };

  it('uses explicit deployment production authority for completeness and HTTPS even with test Node', () => {
    expect(() => parseServerConfig({ NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }, 'api')).toThrow('incomplete');
    expect(() => parseServerConfig({ ...production, NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'production', API_ALLOWED_ORIGIN: 'http://localhost:3000' }, 'api')).toThrow('HTTPS');
    expect(parseServerConfig({ ...production, NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }).databaseTls).toBe(true);
  });
  it.each(['DATABASE_URL', 'WORKER_DATABASE_URL'] as const)('cannot disable production TLS with PostgreSQL URL options in %s', field => {
    for (const suffix of ['?sslmode=disable', '?sslmode=no-verify', '?ssl=false', '?sslrootcert=unreviewed']) expect(() => parseServerConfig({ ...production, [field]: production[field] + suffix })).toThrow();
    expect(parseServerConfig({ ...production, NODE_ENV: 'test' }).databaseTls).toBe(false);
  });

  it.each(['API_ALLOWED_ORIGIN', 'SUPABASE_URL'] as const)('requires production HTTPS for %s', (field) => {
    expect(() => parseServerConfig({ ...production, [field]: 'http://localhost:3000' })).toThrow();
  });

  it.each(['DATABASE_URL', 'WORKER_DATABASE_URL'] as const)('rejects malformed database connection %s', (field) => {
    for (const value of ['not a connection', 'https://db.example', 'postgresql://db.example/cuevo']) {
      expect(() => parseServerConfig({ [field]: value })).toThrow();
    }
  });

  it('accepts valid PostgreSQL runtime connections without guessing an approved role alias', () => {
    expect(parseServerConfig(production).databaseUrl).toBe(production.DATABASE_URL);
  });

  it('does not expose secret values in malformed configuration errors', () => {
    const secret = 'credential-do-not-log';
    try {
      parseServerConfig({ SUPABASE_URL: `https://user:${secret}@auth.example` });
      expect.fail('Invalid credentials URL was accepted');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe('explicit fixture configuration boundary', () => {
  const fixture = { NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:56321', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' };
  it('permits an explicitly enabled local fixture without a live credential', () => {
    expect(parseServerConfig(fixture).intelligence).toMatchObject({ mode: 'FIXTURE', provider: 'deterministic-fixture', model: 'source-locked-v1' });
  });
  it('permits the documented Docker host gateway only on the Cuevo local Auth port', () => {
    expect(parseServerConfig({ ...fixture, SUPABASE_URL: 'http://host.docker.internal:56321' }).intelligence.mode).toBe('FIXTURE');
    expect(() => parseServerConfig({ ...fixture, SUPABASE_URL: 'http://host.docker.internal:54321' })).toThrow();
    expect(() => parseServerConfig({ ...fixture, SUPABASE_URL: 'https://host.docker.internal:56321' })).toThrow();
  });
  it.each([{ ...fixture, AI_FIXTURE_ENABLED: 'false' }, { ...fixture, SUPABASE_URL: 'https://auth.example' }, { ...fixture, NODE_ENV: 'production' }])('rejects unapproved fixture configuration', input => {
    expect(() => parseServerConfig(input)).toThrow();
  });
});

describe('exact hosted synthetic staging boundary', () => {
  const projectRef = 'abcdefghijklmnopqrst';
  const hosted = { NODE_ENV: 'production', CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging',
    CUEVO_SYNTHETIC_PROJECT_REF: projectRef, CUEVO_SYNTHETIC_WEB_ORIGIN: 'https://cuevo.example',
    SUPABASE_URL: `https://${projectRef}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    API_ALLOWED_ORIGIN: 'https://cuevo.example', DATABASE_URL: `postgresql://cuevo_api:private@db.${projectRef}.supabase.co:5432/postgres`,
    WORKER_DATABASE_URL: `postgresql://cuevo_worker:private@db.${projectRef}.supabase.co:5432/postgres`,
    AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' };
  it('permits production Node fixture execution only with the explicit exact project and web binding', () => {
    expect(parseServerConfig(hosted)).toMatchObject({ deploymentEnvironment: 'synthetic-staging', syntheticProjectRef: projectRef, aiEnabled: true, databaseTls: true });
  });
  it.each([
    ['CUEVO_DEPLOYMENT_ENVIRONMENT', undefined], ['CUEVO_DEPLOYMENT_ENVIRONMENT', 'production'],
    ['CUEVO_SYNTHETIC_PROJECT_REF', undefined], ['CUEVO_SYNTHETIC_PROJECT_REF', 'other'],
    ['SUPABASE_URL', 'https://other.supabase.co'], ['SUPABASE_URL', `http://${projectRef}.supabase.co`],
    ['CUEVO_SYNTHETIC_WEB_ORIGIN', 'https://cuevo.example/path'], ['API_ALLOWED_ORIGIN', 'https://foreign.example'],
    ['DATABASE_URL', `postgresql://cuevo_api:private@db.other.supabase.co:5432/postgres`],
    ['DATABASE_URL', `postgresql://postgres:private@db.${projectRef}.supabase.co:5432/postgres`],
    ['WORKER_DATABASE_URL', `postgresql://cuevo_worker:private@db.${projectRef}.supabase.co:5432/postgres?sslmode=disable`],
    ['AI_GENERATION_MODE', 'LIVE'],
  ])('denies incomplete or mismatched hosted authority %s', (key, value) => {
    expect(() => parseServerConfig({ ...hosted, [key]: value })).toThrow();
  });
  it('does not admit production-labelled fixtures under a nonproduction Node process', () => {
    expect(() => parseServerConfig({ NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'production', SUPABASE_URL: 'http://127.0.0.1:56321', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' })).toThrow();
  });
  it('binds hosted STAGING analytics to the same exact source project before capture', () => {
    const analytics = { POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_PROJECT_ID: '393668', POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_KEY: 'phc_test_only', POSTHOG_PSEUDONYM_KEY: 'a'.repeat(64), POSTHOG_PSEUDONYM_KEY_VERSION: '1', POSTHOG_ENVIRONMENT: 'STAGING' };
    expect(parseServerConfig({ ...hosted, AI_GENERATION_MODE: 'DISABLED', AI_FIXTURE_ENABLED: 'false', ...analytics }, 'worker').analytics).toMatchObject({ environment: 'STAGING' });
    expect(() => parseServerConfig({ ...hosted, ...analytics, POSTHOG_ENVIRONMENT: 'QA' }, 'worker')).toThrow();
    expect(() => parseServerConfig({ ...hosted, ...analytics, SUPABASE_URL: 'https://foreign.example' }, 'worker')).toThrow();
  });
});

describe('production credential recipients', () => {
  it('API production boot does not require the worker credential', () => {
    expect(() => parseServerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://runtime:fixture@db.example/cuevo', API_ALLOWED_ORIGIN: 'https://app.example', SUPABASE_URL: 'https://auth.example', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' }, 'api')).not.toThrow();
  });
  it('worker production boot requires only its restricted database configuration', () => {
    expect(() => parseServerConfig({ NODE_ENV: 'production', WORKER_DATABASE_URL: 'postgresql://worker:fixture@db.example/cuevo' }, 'worker')).not.toThrow();
    expect(() => parseServerConfig({ NODE_ENV: 'production' }, 'worker')).toThrow();
  });
});

describe('explicit live synthetic analytics configuration', () => {
  const live = {
    NODE_ENV: 'test', POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC',
    POSTHOG_PROJECT_ID: '393668', POSTHOG_HOST: 'https://us.i.posthog.com',
    POSTHOG_PROJECT_KEY: 'phc_synthetic_test_key', POSTHOG_PSEUDONYM_KEY: 'a'.repeat(64),
    POSTHOG_PSEUDONYM_KEY_VERSION: '1', POSTHOG_ENVIRONMENT: 'QA',
  };

  it('requires an explicit mode before capture credentials can enable analytics', () => {
    const config = parseServerConfig({ ...live, POSTHOG_CAPTURE_MODE: undefined });
    expect(config.analytics).toEqual({ mode: 'DISABLED' });
    expect(config.analyticsEnabled).toBe(false);
  });
  it('does not infer a hosted synthetic approval from a remote source under test Node mode', () => {
    expect(() => parseServerConfig({ ...live, POSTHOG_ENVIRONMENT: 'STAGING', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, 'worker')).toThrow();
    expect(() => parseServerConfig({ ...live, POSTHOG_ENVIRONMENT: 'STAGING', WORKER_DATABASE_URL: 'postgresql://cuevo_worker:private@db.abcdefghijklmnopqrst.supabase.co:5432/postgres' }, 'worker')).toThrow();
  });

  it('API configuration ignores capture mode and credentials even when injected by a parent caller', () => {
    const config = parseServerConfig({ POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC' }, 'api');
    expect(config.analytics).toEqual({ mode: 'DISABLED' });
    expect(config.analyticsEnabled).toBe(false);
    expect(JSON.stringify(config)).not.toContain('projectKey');
    expect(parseServerConfig(live, 'api').analytics).toEqual({ mode: 'DISABLED' });
  });

  it.each(['QA', 'DEMO', 'STAGING'])('returns the fixed destination and trusted %s classification', environment => {
    const config = parseServerConfig({ ...live, POSTHOG_ENVIRONMENT: environment }, 'worker');
    expect(config.analytics).toEqual({
      mode: 'LIVE_SYNTHETIC', projectId: 393668, host: 'https://us.i.posthog.com',
      projectKey: 'phc_synthetic_test_key', pseudonymKey: 'a'.repeat(64), keyVersion: 1, environment,
    });
    expect(config.analyticsEnabled).toBe(true);
  });

  it.each([
    'POSTHOG_PROJECT_ID', 'POSTHOG_HOST', 'POSTHOG_PROJECT_KEY', 'POSTHOG_PSEUDONYM_KEY',
    'POSTHOG_PSEUDONYM_KEY_VERSION', 'POSTHOG_ENVIRONMENT',
  ] as const)('rejects live capture without %s', field => {
    expect(() => parseServerConfig({ ...live, [field]: undefined }, 'worker')).toThrow(field);
  });

  it.each([
    ['POSTHOG_CAPTURE_MODE', 'LIVE'], ['POSTHOG_PROJECT_ID', '393669'],
    ['POSTHOG_HOST', 'http://us.i.posthog.com'], ['POSTHOG_HOST', 'https://eu.i.posthog.com'],
    ['POSTHOG_HOST', 'https://us.i.posthog.com/capture'], ['POSTHOG_HOST', 'https://us.i.posthog.com?redirect=1'],
    ['POSTHOG_HOST', 'https://user:private@us.i.posthog.com'], ['POSTHOG_HOST', 'https://us.i.posthog.com:443'],
    ['POSTHOG_PROJECT_KEY', ' '], ['POSTHOG_PROJECT_KEY', 'key with space'], ['POSTHOG_PROJECT_KEY', 'key\twith-tab'],
    ['POSTHOG_PROJECT_KEY', 'key\u0000with-control'], ['POSTHOG_PROJECT_KEY', 'x'.repeat(201)],
    ['POSTHOG_PSEUDONYM_KEY', 'a'.repeat(63)],
    ['POSTHOG_PSEUDONYM_KEY', 'g'.repeat(64)], ['POSTHOG_PSEUDONYM_KEY_VERSION', '0'],
    ['POSTHOG_PSEUDONYM_KEY_VERSION', '-1'], ['POSTHOG_PSEUDONYM_KEY_VERSION', '1.5'],
    ['POSTHOG_PSEUDONYM_KEY_VERSION', '9007199254740992'], ['POSTHOG_ENVIRONMENT', 'PRODUCTION'],
  ])('rejects unsafe analytics field %s', (field, value) => {
    expect(() => parseServerConfig({ ...live, [field]: value }, 'worker')).toThrow(field);
  });

  it('rejects live synthetic analytics in production even with complete worker configuration', () => {
    expect(() => parseServerConfig({ ...live, NODE_ENV: 'production', WORKER_DATABASE_URL: 'postgresql://worker:fixture@db.example/cuevo' }, 'worker')).toThrow('production');
  });

  it('does not include credential values in analytics validation failures', () => {
    const secret = 'analytics-private-do-not-log';
    expect(() => parseServerConfig({ ...live, POSTHOG_PSEUDONYM_KEY: secret })).toThrow('POSTHOG_PSEUDONYM_KEY');
    try {
      parseServerConfig({ ...live, POSTHOG_PSEUDONYM_KEY: secret });
      expect.fail('Invalid pseudonym key was accepted');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(live.POSTHOG_PROJECT_KEY);
    }
  });
});
