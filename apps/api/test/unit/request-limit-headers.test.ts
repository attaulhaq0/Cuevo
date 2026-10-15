import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server, Socket } from 'node:net';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { parseServerConfig } from '@cuevo/config';
import { DomainError } from '@cuevo/domain';
import { createApp } from '../../src/app';
import { IdentityService } from '../../src/platform/identity/identity.service';
import { Database } from '../../src/platform/database/database';

const origin = 'http://localhost:3000';
let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
const phases = { parsing: 0, handlers: 0 };

beforeEach(() => {
  phases.parsing = 0; phases.handlers = 0;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External fetch is forbidden in this fixture.'); }));
  vi.spyOn(Server.prototype, 'listen').mockImplementation(() => { throw new Error('A listener is forbidden in this fixture.'); });
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('A socket is forbidden in this fixture.'); });
  const original = FastifyAdapter.prototype.getInstance;
  const observed = new WeakSet<FastifyInstance>();
  vi.spyOn(FastifyAdapter.prototype, 'getInstance').mockImplementation(function (this: FastifyAdapter) {
    const instance = original.call(this) as FastifyInstance;
    if (!observed.has(instance)) {
      observed.add(instance);
      instance.addHook('preParsing', async (_request, _reply, payload) => { phases.parsing++; return payload; });
      instance.addHook('onRoute', route => {
        const handle = route.handler;
        route.handler = function (request, reply) { phases.handlers++; return handle.call(this, request, reply); };
      });
    }
    return instance;
  });
});

afterEach(async () => {
  await runtime?.close(); runtime = undefined;
  expect(fetch).not.toHaveBeenCalled();
  expect(Server.prototype.listen).not.toHaveBeenCalled();
  expect(Socket.prototype.connect).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function protectedHeaders(response: LightMyRequestResponse) {
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  expect(response.headers['access-control-allow-origin']).toBe(origin);
  expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id');
  expect(String(response.headers.vary).toLowerCase().split(/,\s*/)).toContain('origin');
}

function refusal(response: LightMyRequestResponse) {
  expect(response.statusCode).toBe(429); protectedHeaders(response);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['retry-after']).toBe('60');
  expect(response.json()).toMatchObject({ code: 'REQUEST_LIMIT_REACHED', requestId: expect.any(String) });
  expect(response.headers['x-request-id']).toBe(response.json().requestId);
  expect(response.json().requestId).not.toBe('caller-controlled');
  expect(response.body).not.toContain('private-fixture-token');
}

describe('actual API budget refusal headers before protected work', () => {
  it.each([['GET', '/v1/me', 600], ['POST', '/v1/school/accounts/invitations', 120]] as const)('keeps %s limits and stops later parsing, identity, handlers and transactions', async (method, url, limit) => {
    const identity = vi.spyOn(IdentityService.prototype, 'resolve');
    const transaction = vi.spyOn(Database.prototype, 'actorTransaction');
    runtime = await createApp(parseServerConfig({ NODE_ENV: 'test' }, 'api'));
    expect(runtime.database.pool).toBeUndefined();
    const headers = { origin, authorization: 'Bearer private-fixture-token', 'x-school-id': '35000000-0000-4000-8000-000000000001', 'idempotency-key': 'original-fixture-request-key', 'content-type': 'application/json', 'x-request-id': 'caller-controlled' };
    for (let index = 0; index < limit; index++) {
      const response = await runtime.app.inject({ method, url, headers, ...(method === 'POST' ? { payload: {} } : {}) });
      expect(response.statusCode).toBe(503);
    }
    const before = { ...phases, identity: identity.mock.calls.length };
    const denied = await runtime.app.inject({ method, url, headers, ...(method === 'POST' ? { payload: '{invalid' } : {}) });
    refusal(denied);
    const foreign = await runtime.app.inject({ method, url, headers: { ...headers, origin: 'https://foreign.example', 'x-forwarded-for': '192.0.2.50' }, ...(method === 'POST' ? { payload: 'x'.repeat(1024 * 1024 + 1) } : {}) });
    refusal(foreign); expect(foreign.headers['access-control-allow-origin']).not.toBe('https://foreign.example');
    expect(phases).toEqual({ parsing: before.parsing, handlers: before.handlers });
    expect(identity).toHaveBeenCalledTimes(before.identity); expect(transaction).not.toHaveBeenCalled();
    const fresh = await runtime.app.inject({ method, url, headers: { ...headers, authorization: 'Bearer distinct-fixture-token' }, ...(method === 'POST' ? { payload: {} } : {}) });
    expect(fresh.statusCode).toBe(503);
    expect(identity).toHaveBeenCalledTimes(before.identity + 1);
    expect((await runtime.app.inject({ url: '/health/live' })).statusCode).toBe(200);
  });

  it.each([false, true])('preserves readiness OPTIONS accounting when the first preflight is malformed: %s', async malformed => {
    const identity = vi.spyOn(IdentityService.prototype, 'resolve');
    const transaction = vi.spyOn(Database.prototype, 'actorTransaction');
    runtime = await createApp(parseServerConfig({ NODE_ENV: 'test' }, 'api'));
    const headers = { origin, 'access-control-request-method': 'GET', 'x-request-id': 'caller-controlled' };
    const first = await runtime.app.inject({ method: 'OPTIONS', url: '/health/ready', headers: malformed ? {} : headers });
    expect(first.statusCode).toBe(malformed ? 400 : 204);
    for (let index = 1; index < 120; index++) expect((await runtime.app.inject({ method: 'OPTIONS', url: '/health/ready?probe=' + index, headers })).statusCode).toBe(204);
    const before = { ...phases };
    refusal(await runtime.app.inject({ method: 'OPTIONS', url: '/health/ready', headers }));
    refusal(await runtime.app.inject({ method: 'OPTIONS', url: '/health/ready', headers: { 'x-request-id': 'caller-controlled' } }));
    expect(phases).toEqual(before); expect(identity).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
    expect((await runtime.app.inject({ method: 'OPTIONS', url: '/v1/me', headers })).statusCode).toBe(204);
    expect((await runtime.app.inject({ url: '/health/live' })).statusCode).toBe(200);
  });

  it('keeps the shared address budget when callers vary token and forwarded address', async () => {
    const identity = vi.spyOn(IdentityService.prototype, 'resolve');
    const transaction = vi.spyOn(Database.prototype, 'actorTransaction');
    runtime = await createApp(parseServerConfig({ NODE_ENV: 'test' }, 'api'));
    for (let index = 0; index < 3000; index++) {
      const response = await runtime.app.inject({ url: '/v1/me', headers: { origin, authorization: 'Bearer varied-fixture-' + index, 'x-forwarded-for': '192.0.2.' + index } });
      expect(response.statusCode).toBe(503);
    }
    const before = { ...phases, identity: identity.mock.calls.length };
    refusal(await runtime.app.inject({ url: '/v1/me', headers: { origin, authorization: 'Bearer fresh-fixture', 'x-forwarded-for': 'different', 'x-request-id': 'caller-controlled' } }));
    expect(phases).toEqual({ parsing: before.parsing, handlers: before.handlers });
    expect(identity).toHaveBeenCalledTimes(before.identity); expect(transaction).not.toHaveBeenCalled();
    expect((await runtime.app.inject({ url: '/health/live' })).statusCode).toBe(200);
  });

  it.each([['SCHOOL_SCOPE_DENIED', 403], ['SCHOOL_SELECTION_REQUIRED', 409]] as const)('retains safe ordinary %s responses through the same headers', async (code, status) => {
    vi.spyOn(IdentityService.prototype, 'resolve').mockRejectedValue(new DomainError(code, status, 'School access requires review.'));
    runtime = await createApp(parseServerConfig({ NODE_ENV: 'test' }, 'api'));
    const response = await runtime.app.inject({ url: '/v1/me', headers: { origin } });
    expect(response.statusCode).toBe(status); expect(response.json().code).toBe(code); protectedHeaders(response);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('retains ordinary denial, malformed/oversized bodies, unknown routes and strict preflight', async () => {
    runtime = await createApp(parseServerConfig({ NODE_ENV: 'test' }, 'api'));
    const denied = await runtime.app.inject({ url: '/v1/me', headers: { origin } });
    expect(denied.statusCode).toBe(401); protectedHeaders(denied);
    for (const [payload, status] of [['{invalid', 400], ['x'.repeat(1024 * 1024 + 1), 413]] as const) {
      const response = await runtime.app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers: { origin, 'content-type': 'application/json' }, payload });
      expect(response.statusCode).toBe(status); protectedHeaders(response);
    }
    const missing = await runtime.app.inject({ url: '/missing-route', headers: { origin } });
    expect(missing.statusCode).toBe(404); protectedHeaders(missing);
    expect((await runtime.app.inject({ method: 'OPTIONS', url: '/v1/me' })).statusCode).toBe(400);
    expect((await runtime.app.inject({ method: 'OPTIONS', url: '/v1/me', headers: { origin, 'access-control-request-method': 'GET' } })).statusCode).toBe(204);
  });
});
