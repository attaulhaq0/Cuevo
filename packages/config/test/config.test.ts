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
