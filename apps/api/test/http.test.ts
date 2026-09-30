import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { parseServerConfig } from '@cuevo/config';
describe('HTTP foundation', () => {
  let runtime: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { runtime = await createApp(parseServerConfig({ NODE_ENV: 'test' })); });
  afterAll(async () => { await runtime?.close(); });
  it('exposes liveness but does not fake dependency readiness', async () => {
    const live = await runtime.app.inject({ url: '/health/live' });
    const ready = await runtime.app.inject({ url: '/health/ready' });
    expect(live.statusCode).toBe(200); expect(ready.statusCode).toBe(503);
  });
  it('returns sanitized authentication denial with server request correlation', async () => {
    const result = await runtime.app.inject({ url: '/v1/me', headers: { 'x-request-id': 'untrusted' } });
    expect(result.statusCode).toBe(401);
    expect(result.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED', requestId: expect.any(String) });
    expect(result.json().requestId).not.toBe('untrusted'); expect(result.headers['cache-control']).toBe('no-store');
  });
  it('rejects live token verification while authentication is unavailable', async () => {
    const result = await runtime.app.inject({ url: '/v1/me', headers: { authorization: 'Bearer candidate' } });
    expect(result.statusCode).toBe(503); expect(result.json().code).toBe('AUTH_UNAVAILABLE');
  });
  it('has no permissive cross-origin header for an unapproved origin', async () => {
    const result = await runtime.app.inject({ url: '/v1/me', headers: { origin: 'https://unapproved.example' } });
    expect(result.headers['access-control-allow-origin']).not.toBe('https://unapproved.example');
  });
});

describe('configured dependency health through the HTTP adapter', () => {
  const config = () => parseServerConfig({ NODE_ENV: 'test', SUPABASE_URL: 'http://localhost:56321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' });

  it.each([false, true])('reports an unavailable Auth service even when database readiness is %s', async (databaseReady) => {
    const runtime = await createApp(config());
    vi.spyOn(runtime.database, 'ready').mockResolvedValue(databaseReady);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network detail')));
    try {
      const result = await runtime.app.inject({ url: '/health/ready' });
      expect(result.statusCode).toBe(503);
      expect(result.json()).toMatchObject({ authentication: false, database: databaseReady });
      expect(result.body).not.toContain('private network detail');
    } finally { vi.unstubAllGlobals(); await runtime.close(); }
  });

  it('requires the Auth health endpoint and does not verify an actual user to check readiness', async () => {
    const runtime = await createApp(config());
    vi.spyOn(runtime.database, 'ready').mockResolvedValue(true);
    const fetcher = vi.fn().mockResolvedValue(new Response('{"name":"GoTrue"}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    try {
      const result = await runtime.app.inject({ url: '/health/ready' });
      expect(result.statusCode).toBe(200);
      expect(fetcher).toHaveBeenCalledWith('http://localhost:56321/auth/v1/health', expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(result.headers['cache-control']).toBe('no-store');
    } finally { vi.unstubAllGlobals(); await runtime.close(); }
  });

  it('reports Auth unhealthy responses as unavailable without leaking their body', async () => {
    const runtime = await createApp(config());
    vi.spyOn(runtime.database, 'ready').mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider failure', { status: 503 })));
    try {
      const result = await runtime.app.inject({ url: '/health/ready' });
      expect(result.statusCode).toBe(503);
      expect(result.body).not.toContain('private provider failure');
    } finally { vi.unstubAllGlobals(); await runtime.close(); }
  });
});
