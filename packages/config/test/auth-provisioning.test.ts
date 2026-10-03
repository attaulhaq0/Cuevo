import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '../src/index';

const key = 'sb_secret_dedicated-local-proof-only';
const approved = { NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'local', SUPABASE_URL: 'http://127.0.0.1:56321', API_ALLOWED_ORIGIN: 'http://localhost:3000', CUEVO_AUTH_PROVISIONING_MODE: 'LOCAL_SYNTHETIC', CUEVO_AUTH_PROVISIONING_KEY: key, CUEVO_AUTH_PROVISIONING_URL: 'http://127.0.0.1:56321', CUEVO_AUTH_PROVISIONING_PROJECT_REF: 'LOCAL_CUEVO', CUEVO_AUTH_PROVISIONING_WEB_ORIGIN: 'http://localhost:3000' };

describe('dedicated local Auth provisioning configuration', () => {
  it('is disabled by default and does not borrow the Storage service credential', () => {
    expect(parseServerConfig({ SUPABASE_SERVICE_ROLE_KEY: 'storage-secret' }, 'api').authProvisioning).toEqual({ mode: 'DISABLED' });
  });
  it('returns only the explicitly reviewed local API adapter target and dedicated key', () => {
    expect(parseServerConfig(approved, 'api').authProvisioning).toEqual({ mode: 'LOCAL_SYNTHETIC', url: 'http://127.0.0.1:56321', projectRef: 'LOCAL_CUEVO', webOrigin: 'http://localhost:3000', key, redirects: { invite: 'http://localhost:3000/account/admission', recovery: 'http://localhost:3000/account/recovery' } });
  });
  it.each(['worker', 'all'] as const)('never returns or enables Auth provisioning for %s consumers', consumer => {
    const configured = parseServerConfig(approved, consumer);
    expect(configured.authProvisioning).toEqual({ mode: 'DISABLED' });
    expect(JSON.stringify(configured)).not.toContain(key);
  });
  it('ignores a provisioning key when the mode is disabled or absent', () => {
    for (const mode of [undefined, 'DISABLED']) {
      const configured = parseServerConfig({ CUEVO_AUTH_PROVISIONING_MODE: mode, CUEVO_AUTH_PROVISIONING_KEY: key }, 'api');
      expect(configured.authProvisioning).toEqual({ mode: 'DISABLED' }); expect(JSON.stringify(configured)).not.toContain(key);
    }
  });
  it('never enables local provisioning in production or hosted staging', () => {
    for (const changed of [{ NODE_ENV: 'production' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'production' }, { CUEVO_DEPLOYMENT_ENVIRONMENT: 'synthetic-staging' }]) expect(() => parseServerConfig({ ...approved, ...changed }, 'api')).toThrow();
  });
  it.each(['CUEVO_AUTH_PROVISIONING_KEY', 'CUEVO_AUTH_PROVISIONING_URL', 'CUEVO_AUTH_PROVISIONING_PROJECT_REF', 'CUEVO_AUTH_PROVISIONING_WEB_ORIGIN', 'SUPABASE_URL', 'API_ALLOWED_ORIGIN'])('requires explicit %s and never infers a local target', field => {
    expect(() => parseServerConfig({ ...approved, [field]: undefined }, 'api')).toThrow();
  });
  it.each([
    { CUEVO_AUTH_PROVISIONING_MODE: 'LIVE' }, { CUEVO_AUTH_PROVISIONING_MODE: '' },
    { CUEVO_AUTH_PROVISIONING_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, { CUEVO_AUTH_PROVISIONING_URL: 'http://127.0.0.1:54321' }, { CUEVO_AUTH_PROVISIONING_URL: 'http://localhost:56321' },
    { CUEVO_AUTH_PROVISIONING_PROJECT_REF: 'other' }, { CUEVO_AUTH_PROVISIONING_WEB_ORIGIN: 'https://foreign.example' },
    { SUPABASE_URL: 'http://localhost:56321' }, { API_ALLOWED_ORIGIN: 'http://127.0.0.1:3000' },
    { CUEVO_AUTH_PROVISIONING_KEY: 'sb_publishable_wrong' }, { CUEVO_AUTH_PROVISIONING_KEY: 'has whitespace' },
  ])('rejects unapproved or contradictory local provisioning configuration %j', change => {
    expect(() => parseServerConfig({ ...approved, ...change }, 'api')).toThrow();
  });
  it('requires the dedicated key even when the Storage service key exists', () => {
    expect(() => parseServerConfig({ ...approved, CUEVO_AUTH_PROVISIONING_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: 'storage-secret' }, 'api')).toThrow();
  });
  it('never includes key material in invalid provisioning configuration errors', () => {
    let failure: unknown;
    try { parseServerConfig({ ...approved, CUEVO_AUTH_PROVISIONING_URL: `https://user:${key}@foreign.example` }, 'api'); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error); expect(String(failure)).not.toContain(key);
  });
  it.each(['contains\u0000control-character', 'contains\u007fcontrol-character', 'sb_publishable_not-a-provisioning-secret'])('rejects unsafe key format without reporting its value', value => {
    let failure: unknown;
    try { parseServerConfig({ ...approved, CUEVO_AUTH_PROVISIONING_KEY: value }, 'api'); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error); expect(String(failure)).not.toContain(value);
  });
  it('does not inspect invalid provisioning fields for a worker or all consumer', () => {
    for (const consumer of ['all', 'worker'] as const) expect(parseServerConfig({ CUEVO_AUTH_PROVISIONING_MODE: 'INVALID', CUEVO_AUTH_PROVISIONING_KEY: key, CUEVO_AUTH_PROVISIONING_URL: 'https://foreign.example' }, consumer).authProvisioning).toEqual({ mode: 'DISABLED' });
  });
  it('admits the alternate exact local browser origin only when both reviewed origins match', () => {
    expect(parseServerConfig({ ...approved, API_ALLOWED_ORIGIN: 'http://127.0.0.1:3000', CUEVO_AUTH_PROVISIONING_WEB_ORIGIN: 'http://127.0.0.1:3000' }, 'api').authProvisioning).toMatchObject({ webOrigin: 'http://127.0.0.1:3000' });
  });
});
