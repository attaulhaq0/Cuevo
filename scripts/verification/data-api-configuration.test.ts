import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';

const project = 'abcdefghijklmnopqrst', source = 'a'.repeat(40), tree = 'b'.repeat(40), url = `https://api.supabase.com/v1/projects/${project}/postgrest`;
const token = 'PRIVATE_management_token_canary', jwt = 'PRIVATE_JWT_secret_canary';
const clock = Date.parse('2026-10-08T18:00:00Z');
const input = { projectRef: project, sourceSha: source, treeSha: tree, token };
const proof = { status: 'CURRENT_METADATA_ONLY', projectRef: project, sourceSha: source, treeSha: tree, observedAt: new Date(clock - 1000).toISOString(), expiresAt: new Date(clock + 60_000).toISOString() };
async function subject() { return import('./data-api-configuration'); }
type Call = { url: string; method: string | undefined; redirect: RequestRedirect | undefined; cache: RequestCache | undefined; credentials: RequestCredentials | undefined; authorization: string | null; signal: AbortSignal | null | undefined };
async function fixture(work: (ports: { admit(): Promise<unknown>; transport: typeof fetch; now(): number }, calls: Call[], set: (bodies: unknown[], options?: { status?: number; responseUrl?: string; redirect?: boolean; malformed?: string; contentLength?: string }) => void) => Promise<void>) {
  let bodies: unknown[] = [{ db_schema: '', jwt_secret: jwt }, { db_schema: '', jwt_secret: jwt }], count = 0, options: { status?: number; responseUrl?: string; redirect?: boolean; malformed?: string; contentLength?: string } = {};
  const calls: Call[] = []; let server: Server | undefined;
  try {
    server = createServer((request, response) => { assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + token); response.statusCode = options.status ?? 200; response.setHeader('Content-Type', 'application/json'); if (options.contentLength) response.setHeader('Content-Length', options.contentLength); response.end(options.malformed ?? JSON.stringify(bodies[Math.min(count++, bodies.length - 1)])); });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw Error('Owned HTTP fixture missing.');
    const transport: typeof fetch = async (raw, init) => { const target = String(raw); calls.push({ url: target, method: init?.method, redirect: init?.redirect, cache: init?.cache, credentials: init?.credentials, authorization: new Headers(init?.headers).get('Authorization'), signal: init?.signal }); assert.equal(target, url); const local = await fetch(`http://127.0.0.1:${address.port}/config`, { ...init, redirect: 'error' }); const response = new Response(local.body, { status: local.status, headers: local.headers }); Object.defineProperty(response, 'url', { value: options.responseUrl ?? target }); Object.defineProperty(response, 'redirected', { value: options.redirect ?? false }); return response; };
    await work({ admit: async () => proof, transport, now: () => clock }, calls, (next, changed = {}) => { bodies = next; count = 0; options = changed; });
  } finally { server?.closeAllConnections(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); }
}

test('official reader observes explicit empty configuration twice through a bounded GET and keeps a minimized first-clock receipt', async () => {
  const api = await subject(); await fixture(async (ports, calls) => {
    const result = await api.readDataApiConfiguration(input, ports);
    assert.equal(result.evidence.configurationState, 'DISABLED'); assert.equal(result.evidence.observedAt, new Date(clock).toISOString()); assert.equal(result.evidence.verifiedAt, new Date(clock).toISOString());
    assert.equal(result.evidence.metadataBasis, 'SUPPLIED_CURRENT_METADATA_PORT'); assert.equal(result.evidence.effectAuthority, false); assert.equal(result.evidence.hostedAcceptance, false);
    assert.equal(calls.length, 2); for (const call of calls) { assert.equal(call.url, url); assert.equal(call.method, 'GET'); assert.equal(call.redirect, 'error'); assert.equal(call.credentials, 'omit'); assert.equal(call.cache, 'no-store'); assert(call.signal instanceof AbortSignal); }
    assert(!result.canonicalJson.includes(token)); assert(!result.canonicalJson.includes(jwt)); assert(!result.canonicalJson.includes('jwt_secret')); assert(!result.canonicalJson.includes('public, extensions'));
    assert.equal(result.sha256, createHash('sha256').update(result.canonicalJson).digest('hex')); assert.equal(api.validateDataApiConfigurationEvidence(result.evidence, { projectRef: project, sourceSha: source, treeSha: tree, now: clock }).configurationState, 'DISABLED');
  });
});
for (const value of ['public', 'public, graphql_public', 'CustomSchema, extensions']) test(`valid nonempty provider configuration is ENABLED: ${value}`, async () => {
  const api = await subject(); await fixture(async (ports, _calls, set) => { set([{ db_schema: value }, { db_schema: value }]); const result = await api.readDataApiConfiguration(input, ports); assert.equal(result.evidence.configurationState, 'ENABLED'); assert.equal(result.evidence.effectAuthority, false); assert(!result.canonicalJson.includes(value)); });
});
for (const [name, body] of [['missing', {}], ['null', { db_schema: null }], ['whitespace', { db_schema: '  ' }], ['Boolean', { db_schema: false }], ['number', { db_schema: 0 }], ['object', { db_schema: { secret: jwt } }], ['malformed name', { db_schema: 'public; drop table example' }], ['empty member', { db_schema: 'public,,api' }], ['duplicate', { db_schema: 'public,public' }]] as const) test(`unconfirmed configuration stays UNKNOWN: ${name}`, async () => {
  const api = await subject(); await fixture(async (ports, _calls, set) => { set([body, body]); const result = await api.readDataApiConfiguration(input, ports); assert.equal(result.evidence.configurationState, 'UNKNOWN'); assert.equal(result.evidence.effectAuthority, false); assert(!result.canonicalJson.includes(jwt)); });
});
for (const [name, changed] of [['project', { projectRef: 'other' }], ['source', { sourceSha: 'wrong' }], ['caller URL', { url: 'https://foreign.invalid' }], ['credential', { token: 'private whitespace' }]] as const) test(`invalid ${name} refuses before metadata or HTTP`, async () => {
  const api = await subject(); let admission = 0, requests = 0; await assert.rejects(api.readDataApiConfiguration({ ...input, ...changed }, { admit: async () => { admission++; return proof; }, transport: async () => { requests++; throw Error('Unreachable'); }, now: () => clock }), error => !String(error).includes(token)); assert.equal(admission, 0); assert.equal(requests, 0);
});
for (const [name, changed] of [['wrong project', { projectRef: 'z'.repeat(20) }], ['wrong source', { sourceSha: 'c'.repeat(40) }], ['wrong tree', { treeSha: 'd'.repeat(40) }], ['effect authority', { effectAuthority: true }], ['future', { observedAt: new Date(clock + 1).toISOString() }], ['expired', { expiresAt: new Date(clock).toISOString() }], ['stale', { observedAt: new Date(clock - 3_600_001).toISOString() }]] as const) test(`metadata-only admission refuses ${name} without a provider request`, async () => {
  const api = await subject(); let count = 0; await assert.rejects(api.readDataApiConfiguration(input, { admit: async () => ({ ...proof, ...changed }), transport: async () => { count++; throw Error('Unreachable'); }, now: () => clock })); assert.equal(count, 0);
});
for (const status of [401, 403, 429, 500]) test(`HTTP ${status} cannot produce configuration proof`, async () => { const api = await subject(); await fixture(async (ports, calls, set) => { set([{}], { status }); await assert.rejects(api.readDataApiConfiguration(input, ports)); assert.equal(calls.length, 1); }); });
for (const [name, options] of [['foreign response URL', { responseUrl: 'https://foreign.invalid/postgrest' }], ['redirect', { redirect: true }], ['malformed JSON', { malformed: '{private invalid json' }]] as const) test(`${name} refuses minimized proof`, async () => { const api = await subject(); await fixture(async (ports, _calls, set) => { set([{}], options); await assert.rejects(api.readDataApiConfiguration(input, ports), error => !String(error).includes('private invalid json')); }); });
test('body size is bounded even when content length is absent', async () => { const api = await subject(); await fixture(async (ports, _calls, set) => { set([{ db_schema: '', jwt_secret: 'x'.repeat(131072) }]); await assert.rejects(api.readDataApiConfiguration(input, ports)); }); });
test('changed selected configuration refuses while unrelated private fields are never retained', async () => { const api = await subject(); await fixture(async (ports, _calls, set) => { set([{ db_schema: '', jwt_secret: 'first-private' }, { db_schema: 'public', jwt_secret: 'second-private' }]); await assert.rejects(api.readDataApiConfiguration(input, ports)); set([{ db_schema: '', jwt_secret: 'first-private' }, { db_schema: '', jwt_secret: 'second-private' }]); const result = await api.readDataApiConfiguration(input, ports); assert.equal(result.evidence.configurationState, 'DISABLED'); assert(!result.canonicalJson.includes('private')); }); });
test('a stalled body is aborted by the original signal without waiting for an uncooperative read', async () => {
  const api = await subject(), controller = new AbortController(); let cancelled = false; const response = new Response(new ReadableStream({ pull: () => new Promise(() => undefined), cancel: () => { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }); Object.defineProperty(response, 'url', { value: url }); const timer = setTimeout(() => controller.abort(), 60); const started = performance.now();
  try { await assert.rejects(api.readDataApiConfiguration(input, { admit: async () => proof, transport: async () => response, now: () => clock, signal: controller.signal })); assert(performance.now() - started >= 40); assert(performance.now() - started < 1000); await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true); } finally { clearTimeout(timer); }
});
test('metadata refresh cannot renew original proof or hide expiry after both reads', async () => { const api = await subject(); await fixture(async (ports, calls) => { let admission = 0; await assert.rejects(api.readDataApiConfiguration(input, { ...ports, admit: async () => ++admission === 1 ? proof : { ...proof, observedAt: new Date(clock).toISOString() } })); assert.equal(calls.length, 2); }); });
test('receipt validation refuses future or expired original clocks and cross-source or manual substitution', async () => { const api = await subject(); await fixture(async ports => { const { evidence } = await api.readDataApiConfiguration(input, ports); for (const patch of [{ observedAt: new Date(clock + 1).toISOString() }, { verifiedAt: new Date(clock - 1).toISOString() }, { sourceSha: 'c'.repeat(40) }, { source: 'AUTHENTICATED_DASHBOARD' }, { effectAuthority: true }]) assert.throws(() => api.validateDataApiConfigurationEvidence({ ...evidence, ...patch }, { projectRef: project, sourceSha: source, treeSha: tree, now: clock })); assert.throws(() => api.validateDataApiConfigurationEvidence(evidence, { projectRef: project, sourceSha: source, treeSha: tree, now: clock + 3_600_001 })); }); });

test('two different unknown configuration values cannot manufacture a stable observation', async () => { const api = await subject(); await fixture(async (ports, _calls, set) => { set([{ db_schema: null }, { db_schema: {} }]); await assert.rejects(api.readDataApiConfiguration(input, ports)); }); });
test('declared excessive response length refuses before a body is read', async () => { const api = await subject(); let bodyRead = false; const response = new Response(new ReadableStream({ pull() { bodyRead = true; } }, { highWaterMark: 0 }), { headers: { 'Content-Type': 'application/json', 'Content-Length': '131073' } }); Object.defineProperty(response, 'url', { value: url }); await assert.rejects(api.readDataApiConfiguration(input, { admit: async () => proof, transport: async () => response, now: () => clock })); assert.equal(bodyRead, false); });
test('expiry during the second actual read denies rather than restamping the observation', async () => { const api = await subject(); await fixture(async ports => { let time = clock; const transport: typeof fetch = async (raw, init) => { const result = await ports.transport(raw, init); time += 40_000; return result; }; await assert.rejects(api.readDataApiConfiguration(input, { ...ports, transport, now: () => time })); }); });
test('an UNKNOWN value digest cannot be relabeled as the explicit disabled sentinel', async () => { const api = await subject(); await fixture(async (ports, _calls, set) => { set([{ db_schema: null }, { db_schema: null }]); const { evidence } = await api.readDataApiConfiguration(input, ports); assert.throws(() => api.validateDataApiConfigurationEvidence({ ...evidence, configurationState: 'DISABLED' }, { projectRef: project, sourceSha: source, treeSha: tree, now: clock })); }); });
test('first read clock is preserved when second verification is later', async () => { const api = await subject(); await fixture(async ports => { let time = clock; const result = await api.readDataApiConfiguration(input, { ...ports, transport: async (raw, init) => { const response = await ports.transport(raw, init); time += 1000; return response; }, now: () => time }); assert.equal(result.evidence.observedAt, new Date(clock + 1000).toISOString()); assert.equal(result.evidence.verifiedAt, new Date(clock + 2000).toISOString()); assert.equal(result.evidence.expiresAt, proof.expiresAt); }); });
test('an unavailable metadata callback does not leak its private failure or issue a request', async () => { const api = await subject(); let requests = 0; await assert.rejects(api.readDataApiConfiguration(input, { admit: async () => { throw Error(jwt); }, transport: async () => { requests++; throw Error('Unreachable'); }, now: () => clock }), error => !String(error).includes(jwt)); assert.equal(requests, 0); });
test('aborted admission cannot issue either GET even when a supplied metadata callback settles later', async () => { const api = await subject(), controller = new AbortController(); let requests = 0; await assert.rejects(api.readDataApiConfiguration(input, { admit: async () => { controller.abort(); return proof; }, transport: async () => { requests++; throw Error('Should not request'); }, now: () => clock, signal: controller.signal })); assert.equal(requests, 0); });

test('final metadata admission cancellation cannot publish a disabled observation', async () => {
  const api = await subject(); await fixture(async (ports, calls) => {
    const controller = new AbortController(); let admissions = 0;
    await assert.rejects(api.readDataApiConfiguration(input, { ...ports, signal: controller.signal, admit: async () => { if (++admissions === 2) controller.abort(); return proof; } }));
    assert.equal(admissions, 2); assert.equal(calls.length, 2);
  });
});

for (const heldAdmission of [1, 2]) test(`held metadata admission ${heldAdmission} obeys parent cancellation without later publication`, async () => {
  const api = await subject(); await fixture(async (ports, calls) => {
    const controller = new AbortController(); let admissions = 0, published = false, settled = false, release!: (value: unknown) => void;
    const held = new Promise<unknown>(resolve => { release = resolve; });
    const pending = api.readDataApiConfiguration(input, { ...ports, signal: controller.signal, admit: async () => ++admissions === heldAdmission ? held : proof });
    const observed = pending.then(() => { published = true; settled = true; }, () => { settled = true; });
    for (let count = 0; count < 100 && admissions < heldAdmission; count++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(admissions, heldAdmission); controller.abort();
    await Promise.race([observed, new Promise(resolve => setTimeout(resolve, 80))]);
    const cancellationSettled = settled; release(proof); await observed;
    assert.equal(cancellationSettled, true, 'Cancellation must settle without waiting for the supplied callback');
    assert.equal(published, false); assert.equal(calls.length, heldAdmission === 1 ? 0 : 2);
  });
});
