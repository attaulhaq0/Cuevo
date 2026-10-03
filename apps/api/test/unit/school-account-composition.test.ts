import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import { createApp } from '../../src/app';

describe('account route composition without external credentials', () => {
  it('composes invitation management and actor-only claim without enabling provisioning', async () => {
    const runtime = await createApp(parseServerConfig({}, 'api'));
    try {
      for (const [method, url] of [['GET', '/v1/school/accounts/invitations'], ['POST', '/v1/account/school-admission/claim']] as const) {
        const result = await runtime.app.inject({ method, url, headers: url.includes('/school/accounts') ? { 'x-school-id': '35000000-0000-4000-8000-000000000001' } : {}, payload: method === 'POST' ? {} : undefined });
        expect(result.statusCode).toBe(401); expect(result.headers['cache-control']).toBe('no-store');
      }
    } finally { await runtime.close(); }
  });
});
