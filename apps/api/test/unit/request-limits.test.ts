import { describe, expect, it } from 'vitest';
import { RequestBudget, registerRequestLimits } from '../../src/platform/request-limits/request-limits';
import Fastify from 'fastify';

describe('bounded API request protection', () => {
  it('bounds requests and distinct keys, then expires the fixed window', () => {
    const budget = new RequestBudget(2, 1000, 2);
    expect(budget.consume('a', 0)).toBe(true);
    expect(budget.consume('a', 0)).toBe(true);
    expect(budget.consume('a', 0)).toBe(false);
    expect(budget.consume('b', 0)).toBe(true);
    expect(budget.consume('c', 0)).toBe(false);
    expect(budget.consume('c', 1000)).toBe(true);
  });
  it('limits before Auth work without trusting forwarded IP or exposing token bytes', async () => {
    const app = Fastify();
    registerRequestLimits(app, { reads: 2, writes: 1, addresses: 20 });
    app.get('/v1/me', async () => ({ status: 'needs-auth' }));
    app.post('/v1/items', async () => ({ status: 'needs-auth' }));
    app.get('/health/live', async () => ({ status: 'ok' }));
    try {
      const headers = { authorization: 'Bearer private-fixture-token' };
      expect((await app.inject({ url: '/v1/me', headers })).statusCode).toBe(200);
      expect((await app.inject({ url: '/v1/me', headers })).statusCode).toBe(200);
      const denied = await app.inject({ url: '/v1/me', headers: { ...headers, 'x-forwarded-for': 'different' } });
      expect(denied.statusCode).toBe(429);
      expect(denied.headers['cache-control']).toBe('no-store');
      expect(denied.headers['retry-after']).toBe('60');
      expect(denied.body).not.toContain('private-fixture-token');
      expect((await app.inject({ method: 'POST', url: '/v1/items', headers })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/v1/items', headers })).statusCode).toBe(429);
      expect((await app.inject({ url: '/health/live', headers })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
  it('bounds anonymous readiness requests separately while keeping liveness available', async () => {
    const app = Fastify();
    registerRequestLimits(app, { readiness: 2 });
    let probes = 0;
    app.get('/health/ready', async () => { probes++; return { status: 'ready' }; });
    app.get('/health/live', async () => ({ status: 'ok' }));
    try {
      const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => app.inject({ url: `/health/ready?probe=${i}`, headers: { authorization: `Bearer varied-${i}` } })));
      expect(responses.filter(r => r.statusCode === 200)).toHaveLength(2);
      expect(responses.filter(r => r.statusCode === 429)).toHaveLength(8);
      expect(probes).toBe(2);
      expect((await app.inject({ url: '/health/live' })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
