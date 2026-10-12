import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { LearningApiError } from '../client.ts';
import { SessionReadLifecycle } from '../../session/read-lifecycle.ts';

type Metadata = { name: string; contentType: string; byteSize: number; sha256: string };
type Verified = { bytes: ArrayBuffer; metadata: Readonly<Metadata>; signal: AbortSignal; isCurrent(): boolean };
type Input = { config: { apiUrl: string; accessToken: string; schoolId: string }; path: string; metadata: Metadata; signal: AbortSignal; isCurrent(): boolean; readLifecycle?: SessionReadLifecycle; statusError?: (status: number) => LearningApiError; responseValid?: (headers: Headers) => boolean };
type Api = { fetchVerifiedDownload(input: Input): Promise<Verified>; deliverVerifiedDownload(result: Verified, options?: { onDelivered?: () => void }): boolean };
let apiPromise: Promise<Api>;
function subject() {
  return apiPromise ??= import(pathToFileURL(resolve(import.meta.dirname, '../verified-download.ts')).href).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }).then(value => {
    assert.equal(typeof value.fetchVerifiedDownload, 'function', 'shared verified byte transport exists');
    assert.equal(typeof value.deliverVerifiedDownload, 'function', 'safe delivery exists');
    return value as Api;
  });
}
const bytes = Buffer.from('Current private document.');
const metadata = (): Metadata => ({ name: 'Checked work.txt', contentType: 'text/plain', byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
const input = (changes: Partial<Input> = {}): Input => ({ config: { apiUrl: 'https://download.fixture.invalid/', accessToken: 'synthetic', schoolId: 'school' }, path: '/v1/current-source/download', metadata: metadata(), signal: new AbortController().signal, isCurrent: () => true, ...changes });
async function withFetch(run: (calls: { url: string; init: RequestInit }[]) => Promise<void>, reply: (init: RequestInit) => Promise<Response> = async () => new Response(bytes, { headers: { 'Content-Type': 'text/plain' } })) {
  const original = globalThis.fetch, calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return reply(init); };
  try { await run(calls); } finally { globalThis.fetch = original; }
}
test('verified download refuses paused, departed, aborted and invalid contexts before HTTP', async () => {
  const api = await subject(), lifecycle = new SessionReadLifecycle(); lifecycle.pause();
  const controller = new AbortController(); controller.abort();
  await withFetch(async calls => {
    for (const value of [input({ readLifecycle: lifecycle }), input({ isCurrent: () => false }), input({ signal: controller.signal }), input({ path: 'https://foreign.invalid/private' }), input({ config: { apiUrl: 'https://fixture.invalid', accessToken: '', schoolId: 'school' } }), input({ metadata: { ...metadata(), byteSize: 524289 } })]) await assert.rejects(api.fetchVerifiedDownload(value));
    assert.equal(calls.length, 0);
  });
});
test('verified bytes use bounded authenticated no-store transport and snapshot exact metadata', async () => {
  const api = await subject(), value = input();
  await withFetch(async calls => {
    const result = await api.fetchVerifiedDownload(value);
    assert.equal(calls[0].url, 'https://download.fixture.invalid/v1/current-source/download');
    assert.equal(calls[0].init.cache, 'no-store'); assert.equal(calls[0].init.credentials, 'omit');
    assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer synthetic', 'X-School-Id': 'school' });
    assert.deepEqual(Buffer.from(result.bytes), bytes); assert.equal(result.isCurrent(), true);
    value.metadata.name = 'Changed caller name'; assert.equal(result.metadata.name, 'Checked work.txt'); assert.equal(Object.isFrozen(result.metadata), true);
  });
});
test('held request uses the captured lifecycle signal and remains obsolete after a new resume', async () => {
  const api = await subject(), lifecycle = new SessionReadLifecycle(); let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  await withFetch(async calls => {
    const request = api.fetchVerifiedDownload(input({ readLifecycle: lifecycle })); await Promise.resolve();
    const ticket = lifecycle.pause(); assert.equal((calls[0].init.signal as AbortSignal).aborted, true);
    lifecycle.resume(ticket); release(); await assert.rejects(request);
  }, async () => { await gate; return new Response(bytes); });
});
test('late body and hash cannot return verified bytes after owner or lifecycle withdrawal', async () => {
  const api = await subject(); let current = true;
  await withFetch(async () => { const request = api.fetchVerifiedDownload(input({ isCurrent: () => current })); current = false; await assert.rejects(request); });
  await withFetch(async () => {
    const lifecycle = new SessionReadLifecycle(); const request = api.fetchVerifiedDownload(input({ readLifecycle: lifecycle })); lifecycle.pause(); await assert.rejects(request);
  });
});
test('size, checksum and explicit response validation reject incorrect private bytes', async () => {
  const api = await subject();
  for (const value of [input({ metadata: { ...metadata(), byteSize: bytes.length + 1 } }), input({ metadata: { ...metadata(), sha256: 'a'.repeat(64) } }), input({ responseValid: headers => headers.get('content-type') === 'application/pdf' })]) await withFetch(async () => { await assert.rejects(api.fetchVerifiedDownload(value), error => error instanceof LearningApiError && error.kind === 'invalid'); });
});
test('status errors preserve the owner mapping and never read a failed response body', async () => {
  const api = await subject();
  await withFetch(async () => { await assert.rejects(api.fetchVerifiedDownload(input({ statusError: status => new LearningApiError(status === 409 ? 'conflict' : 'unavailable') })), error => error instanceof LearningApiError && error.kind === 'conflict'); }, async () => new Response(null, { status: 409 }));
});
test('the fixed fifteen-second signal cannot be extended and aborted responses stay unavailable', async () => {
  const api = await subject(), original = AbortSignal.timeout;
  AbortSignal.timeout = delay => { assert.equal(delay, 15000); return AbortSignal.abort(); };
  try { await withFetch(async calls => { await assert.rejects(api.fetchVerifiedDownload(input()), error => error instanceof LearningApiError && error.kind === 'unavailable'); assert.equal(calls.length, 0); }); }
  finally { AbortSignal.timeout = original; }
});
test('late body resolution cannot pass an owner scope predicate', async () => {
  const api = await subject(); let current = true, release!: () => void;
  const bodyGate = new Promise<void>(done => { release = done; });
  await withFetch(async () => {
    const request = api.fetchVerifiedDownload(input({ isCurrent: () => current })); await Promise.resolve(); await Promise.resolve(); current = false; release(); await assert.rejects(request);
  }, async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => { await bodyGate; return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } }) as Response);
});
test('a digest that resolves after lifecycle pause cannot return a delivery token', async () => {
  const api = await subject(), original = crypto.subtle.digest.bind(crypto.subtle), lifecycle = new SessionReadLifecycle(); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(done => { entered = done; }), gate = new Promise<void>(done => { release = done; });
  crypto.subtle.digest = (async (algorithm: AlgorithmIdentifier, data: BufferSource) => { entered(); await gate; return original(algorithm, data); }) as typeof crypto.subtle.digest;
  try { await withFetch(async () => { const request = api.fetchVerifiedDownload(input({ readLifecycle: lifecycle })); await started; lifecycle.pause(); release(); await assert.rejects(request); }); }
  finally { crypto.subtle.digest = original; }
});
async function withDelivery(run: (api: Api, stats: { created: number; clicked: number; revoked: number; timers: (() => void)[]; throwClick: boolean }) => Promise<void>) {
  const api = await subject(), originalDocument = globalThis.document, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const stats = { created: 0, clicked: 0, revoked: 0, timers: [] as (() => void)[], throwClick: false };
  globalThis.document = { createElement: () => ({ href: '', download: '', click() { stats.clicked++; if (stats.throwClick) throw Error('Native delivery failed'); } }) } as unknown as Document;
  URL.createObjectURL = () => { stats.created++; return 'blob:controlled'; }; URL.revokeObjectURL = () => { stats.revoked++; };
  globalThis.setTimeout = ((callback: () => void, delay: number) => { assert.equal(delay, 1000); stats.timers.push(callback); return 1; }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  try { await run(api, stats); } finally { globalThis.document = originalDocument; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; }
}
test('delivery rechecks captured lifecycle across the caller await boundary before creating an object URL', async () => {
  await withDelivery(async (api, stats) => {
    const lifecycle = new SessionReadLifecycle(); let verified!: Verified;
    await withFetch(async () => { verified = await api.fetchVerifiedDownload(input({ readLifecycle: lifecycle })); });
    lifecycle.pause(); assert.equal(api.deliverVerifiedDownload(verified), false); assert.equal(stats.created, 0); assert.equal(stats.clicked, 0);
  });
});
test('object URL lease revokes on abort and once after anchor or owner callback failure', async () => {
  await withDelivery(async (api, stats) => {
    const controller = new AbortController(); let verified!: Verified;
    await withFetch(async () => { verified = await api.fetchVerifiedDownload(input({ signal: controller.signal })); });
    assert.throws(() => api.deliverVerifiedDownload(verified, { onDelivered: () => { throw Error('Owner callback failed'); } }));
    assert.equal(stats.created, 1); assert.equal(stats.clicked, 1); controller.abort(); assert.equal(stats.revoked, 1);
    for (const timer of stats.timers) timer(); assert.equal(stats.revoked, 1);
  });
  await withDelivery(async (api, stats) => {
    let verified!: Verified; await withFetch(async () => { verified = await api.fetchVerifiedDownload(input()); }); stats.throwClick = true;
    assert.throws(() => api.deliverVerifiedDownload(verified)); for (const timer of stats.timers) timer(); assert.equal(stats.revoked, 1);
  });
});
test('an owner callback is not announced if delivery itself pauses the captured lifecycle', async () => {
  await withDelivery(async (api, stats) => {
    const lifecycle = new SessionReadLifecycle(); let verified!: Verified, callbacks = 0;
    await withFetch(async () => { verified = await api.fetchVerifiedDownload(input({ readLifecycle: lifecycle })); });
    globalThis.document = { createElement: () => ({ href: '', download: '', click() { stats.clicked++; lifecycle.pause(); } }) } as unknown as Document;
    api.deliverVerifiedDownload(verified, { onDelivered: () => { callbacks++; } }); assert.equal(callbacks, 0); assert.equal(stats.revoked, 1);
  });
});
test('a throwing current-owner predicate cannot escape URL cleanup or become a download authority', async () => {
  await withDelivery(async (api, stats) => {
    let fail = false, verified!: Verified;
    await withFetch(async () => { verified = await api.fetchVerifiedDownload(input({ isCurrent: () => { if (fail) throw Error('Owner unavailable'); return true; } })); });
    fail = true; assert.equal(api.deliverVerifiedDownload(verified), false); assert.equal(stats.created, 0);
  });
});
