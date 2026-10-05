import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import { createApp } from '../../src/app';
import { createServerlessHandler } from '../../src/serverless';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function expose(handler: ReturnType<typeof createServerlessHandler>) {
  const server = createServer((request, response) => { void handler(request, response); });
  // Keep Expect requests on the same hosted boundary without sending an automatic100 response.
  server.on('checkContinue', (request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Ask the application to reject the declared limit before uploading a body it will not read. */
async function expectContinueRequest(url: string, body: Buffer) {
  let continued = false;
  return new Promise<{status: number | undefined; body: Buffer; continued: boolean}>((resolve, reject) => {
    const request = httpRequest(url, {method: 'POST', headers: {'content-type': 'application/json', 'content-length': body.length, expect: '100-continue', connection: 'close'}}, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => { request.end(); resolve({status: response.statusCode, body: Buffer.concat(chunks), continued}); });
      response.on('error', reject);
    });
    request.on('continue', () => { continued = true; request.end(body); });
    request.on('error', reject);
    request.flushHeaders();
  });
}

describe('hosted API Node HTTP boundary', () => {
  it('keeps the actual liveness, readiness, authentication denial and approved CORS routes', async () => {
    const runtime = await createApp(parseServerConfig({ NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:3000' }, 'api'));
    cleanup.push(runtime.close);
    const url = await expose(createServerlessHandler(async () => runtime));
    expect(await (await fetch(`${url}/health/live?probe=1`)).json()).toEqual({ status: 'ok', service: 'cuevo-api' });
    const ready = await fetch(`${url}/health/ready`);
    expect(ready.status).toBe(503); expect(ready.headers.get('cache-control')).toBe('no-store');
    const denied = await fetch(`${url}/v1/me`, { headers: { 'x-request-id': 'caller-controlled', origin: 'https://unapproved.example' } });
    expect(denied.status).toBe(401); expect(denied.headers.get('cache-control')).toBe('no-store');
    expect(denied.headers.get('access-control-allow-origin')).not.toBe('https://unapproved.example');
    const body = await denied.json();
    expect(body.code).toBe('AUTHENTICATION_REQUIRED'); expect(body.requestId).toBe(denied.headers.get('x-request-id'));
    expect(body.requestId).not.toBe('caller-controlled');
    const preflight = await fetch(`${url}/v1/me`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' } });
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect((await fetch(`${url}/v1/unknown-route`)).status).toBe(404);
  });

  it('shares in-flight initialization and reuses the warm application across real requests', async () => {
    let resolveBootstrap!: (runtime: { app: { getHttpServer(): Server } }) => void;
    let bootstraps = 0;
    const fastify = Fastify(); fastify.get('/health/live', async () => ({ status: 'ok' })); await fastify.ready();
    cleanup.push(() => fastify.close());
    const handler = createServerlessHandler(() => { bootstraps++; return new Promise(resolve => { resolveBootstrap = resolve; }); });
    const url = await expose(handler);
    const pending = Array.from({ length: 8 }, () => fetch(`${url}/health/live`));
    await new Promise<void>(resolve => { const check = () => bootstraps ? resolve() : setTimeout(check, 1); check(); });
    resolveBootstrap({ app: { getHttpServer: () => fastify.server } });
    expect((await Promise.all(pending)).map(response => response.status)).toEqual(Array(8).fill(200));
    expect((await fetch(`${url}/health/live`)).status).toBe(200); expect(bootstraps).toBe(1);
  });

  it('fails closed when production configuration is missing and retries initialization on a later request', async () => {
    let configured = false;
    const handler = createServerlessHandler(async () => {
      const runtime = await createApp(parseServerConfig({ NODE_ENV: configured ? 'test' : 'production' }, 'api'));
      cleanup.push(runtime.close); return runtime;
    });
    const url = await expose(handler);
    const first = await fetch(`${url}/health/live`); expect(first.status).toBe(503);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(await first.json()).toMatchObject({ code: 'API_UNAVAILABLE', message: 'School services are temporarily unavailable.' });
    configured = true;
    expect((await fetch(`${url}/health/live`)).status).toBe(200);
  });

  it('keeps bootstrap failures private and permits a later warm retry', async () => {
    const fastify = Fastify(); fastify.get('/health/live', async () => ({ status: 'ok' })); await fastify.ready();
    cleanup.push(() => fastify.close());
    let attempts = 0;
    const url = await expose(createServerlessHandler(async () => {
      if (++attempts === 1) throw Error('postgres://private-password@private-host');
      return { app: { getHttpServer: () => fastify.server } };
    }));
    const failed = await fetch(`${url}/health/live`); expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private-password');
    expect((await fetch(`${url}/health/live`)).status).toBe(200); expect(attempts).toBe(2);
  });

  it('passes raw bodies, original encoded URLs, status, headers and private binary bytes without JSON conversion', async () => {
    const fastify = Fastify({ bodyLimit: 1024 * 1024 });
    const bytes = Buffer.from([0, 255, 128, 13, 10, 34, 92]);
    let jsonRequests = 0;
    fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    fastify.post('/transport/file', async (request, reply) => {
      expect(request.body).toEqual(bytes); expect(request.raw.url).toBe('/transport/file?name=a%2Fb&name=c');
      expect(request.headers['idempotency-key']).toBe('exact-command-key'); expect(request.headers.authorization).toBe('Bearer synthetic');
      reply.code(206).headers({ 'content-type': 'application/pdf', 'cache-control': 'private, no-store', 'content-disposition': 'attachment; filename="synthetic.pdf"', 'content-range': 'bytes 0-6/7', 'set-cookie': ['first=one; HttpOnly', 'second=two; HttpOnly'] });
      return bytes;
    });
    fastify.post('/transport/json', async (request, reply) => {
      jsonRequests++;
      reply.header('content-type', 'application/json; charset=utf-8');
      return JSON.stringify(request.body);
    });
    await fastify.ready(); cleanup.push(() => fastify.close());
    const url = await expose(createServerlessHandler(async () => ({ app: { getHttpServer: () => fastify.server } })));
    const response = await fetch(`${url}/transport/file?name=a%2Fb&name=c`, { method: 'POST', headers: { authorization: 'Bearer synthetic', 'idempotency-key': 'exact-command-key', 'content-type': 'application/octet-stream' }, body: bytes });
    expect(response.status).toBe(206); expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="synthetic.pdf"');
    expect(response.headers.getSetCookie()).toEqual(['first=one; HttpOnly', 'second=two; HttpOnly']);
    const json = await fetch(`${url}/transport/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"value":"سياق"}' });
    expect(await json.json()).toEqual({ value: 'سياق' });
    const hostile = await fetch(`${url}/transport/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify('<script>window.fixtureExecuted=true</script>') });
    expect(hostile.headers.get('content-type')).toMatch(/^application\/json(?:;|$)/);
    expect(await hostile.json()).toBe('<script>window.fixtureExecuted=true</script>');
    const malformed = await fetch(`${url}/transport/json`, { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: '{invalid' });
    expect(malformed.status).toBe(400); await malformed.arrayBuffer();
    const oversized = await expectContinueRequest(`${url}/transport/json`, Buffer.from(JSON.stringify({ value: 'x'.repeat(1024 * 1024) })));
    expect(oversized.status).toBe(413); expect(oversized.continued).toBe(false);
    expect(JSON.parse(oversized.body.toString()).code).toBe('FST_ERR_CTP_BODY_TOO_LARGE');
    expect(jsonRequests).toBe(2);
  });

  it('forwards a permitted 100-continue exchange and uploads its exact bytes only after the application allows it', async () => {
    const bytes = Buffer.from('{"value":"سياق"}'); let uploads = 0;
    const application = createServer((request, response) => {
      request.on('data', () => uploads++); const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => { expect(Buffer.concat(chunks)).toEqual(bytes); response.writeHead(201, {'content-type': 'application/json'}); response.end(Buffer.from('{"accepted":true}')); });
      response.writeContinue();
    });
    const url = await expose(createServerlessHandler(async () => ({app: {getHttpServer: () => application}})));
    const result = await expectContinueRequest(url, bytes);
    expect(result.continued).toBe(true); expect(result.status).toBe(201); expect(JSON.parse(result.body.toString())).toEqual({accepted: true}); expect(uploads).toBeGreaterThan(0);
  });
});
