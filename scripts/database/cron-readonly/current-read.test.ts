import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { currentFixture, querySha256 } from './current-facts.fixture';

const modulePath = './current-read';
const reader = existsSync(new URL('./current-read.ts', import.meta.url)) ? await import(modulePath) : null;
const endpoint = 'https://api.supabase.com/v1/projects/mqxdjvsyckzocokuikmx/database/query';

test('fixed reader refuses malformed credentials and accessors before a request', async () => {
  assert.ok(reader, 'The fixed authenticated current reader is missing.');
  const originalFetch = globalThis.fetch; let requests = 0, getters = 0;
  globalThis.fetch = async () => { requests++; throw Error('PRIVATE_TRANSPORT'); };
  try {
    const invalid = {}; Object.defineProperty(invalid, 'providerToken', { get() { getters++; return 'PRIVATE'; } });
    for (const input of [invalid, { providerToken: '', originalEvidence: {} }, { providerToken: 'SIMULATED_TOKEN', originalEvidence: {}, authenticated: true }]) {
      const result = await reader.readCurrentCronRecovery('observe', input); assert.equal(result.status, 'unknown'); assert.equal(result.nativeExecutionAuthorized, false);
    }
    assert.equal(requests, 0); assert.equal(getters, 0);
  } finally { globalThis.fetch = originalFetch; }
});

for (const status of [200, 201]) test(`fixed source reader accepts HTTP ${status} with one reviewed query and minimized current facts`, async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++; assert.equal(url, endpoint); assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'error');
    assert.equal(createHash('sha256').update(JSON.parse(String(options?.body)).query).digest('hex'), querySha256);
    const f = currentFixture(); const clock = new Date().toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(f.encode(), { status, headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const result = await reader.readCurrentCronRecovery('observe', { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} });
    assert.equal(requests, 1); assert.equal(result.currentReadAuthentication, 'AUTHENTICATED_FIXED_READER');
    assert.equal(result.status, 'unknown'); assert.equal(result.current.scopedRoleRow, 'ABSENT');
    assert.equal(result.authenticCustodyCreated, false); assert.equal(result.futureEffectAdmitted, false); assert.equal(result.nativeAcceptance, false);
    assert.equal(JSON.stringify(result).includes('SIMULATED_TOKEN'), false);
  } finally { globalThis.fetch = originalFetch; }
});

for (const status of [204, 206]) test(`fixed source reader refuses HTTP ${status} without authenticating current facts`, async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => {
    requests++; const f = currentFixture(), clock = new Date().toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(status === 204 ? null : f.encode(), { status, headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const result = await reader.readCurrentCronRecovery('observe', { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} });
    assert.equal(requests, 1); assert.equal(result.status, 'unknown'); assert.equal(result.currentReadAuthentication, 'UNKNOWN');
    assert.deepEqual(result.reasons, ['CURRENT_READ_FAILED_OR_UNPROVED']);
    assert.equal(result.current.scopedRoleRow, 'UNKNOWN'); assert.equal(result.nativeExecutionAuthorized, false);
    assert.equal(result.authenticCustodyCreated, false); assert.equal(result.futureEffectAdmitted, false); assert.equal(result.nativeAcceptance, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('current transport failure and oversized body are unknown without retry or private output', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch; let requests = 0;
  try {
    for (const response of [null, new Response('PRIVATE_BODY', { status: 200, headers: { 'Content-Length': '2097153' } })]) {
      globalThis.fetch = async () => { requests++; if (!response) throw Error('PRIVATE_TOKEN_OR_RESPONSE'); Object.defineProperty(response, 'url', { value: endpoint }); return response; };
      const result = await reader.readCurrentCronRecovery('observe', { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} });
      assert.equal(result.status, 'unknown'); assert.equal(result.currentReadAuthentication, 'UNKNOWN');
      assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    }
    assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('response BOM is refused before decoding can change its byte identity', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const f = currentFixture(), clock = new Date().toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(f.encode())]);
    const response = new Response(bytes, { status: 200 }); Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const result = await reader.readCurrentCronRecovery('observe', { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} });
    assert.equal(result.currentReadAuthentication, 'UNKNOWN'); assert.equal(result.nativeExecutionAuthorized, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('source verification after response completion cannot borrow the old decision clock', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch, NativeDate = globalThis.Date;
  const base = NativeDate.parse('2026-10-15T15:00:29.000Z'); let now = base, constructions = 0;
  globalThis.Date = new Proxy(NativeDate, { construct(target, args) {
    if (args.length) return Reflect.construct(target, args);
    constructions++; if (constructions === 2) { now = base + 1000; queueMicrotask(() => { now = base + 31000; }); }
    return new NativeDate(now);
  } });
  globalThis.fetch = async () => {
    const f = currentFixture(), clock = new NativeDate(base + 500).toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(f.encode(), { status: 200 }); Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const result = await reader.readCurrentCronRecovery('observe', { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} });
    assert.equal(result.status, 'refused'); assert.ok(result.reasons.includes('CURRENT_READ_CLOCK_STALE_OR_CONFLICTING'));
    assert.equal(result.current.issuedAt, new NativeDate(base).toISOString()); assert.equal(result.current.observedAt, new NativeDate(base + 1000).toISOString());
  } finally { globalThis.fetch = originalFetch; globalThis.Date = NativeDate; }
});

test('original read abort during the final source check prevents authenticated completion', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch, NativeDate = globalThis.Date, originalTimeout = globalThis.setTimeout;
  let constructions = 0, abortRead: (() => void) | undefined;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    if (delay === 30000) abortRead = () => callback(...args);
    return originalTimeout(callback, delay, ...args);
  }) as typeof setTimeout;
  globalThis.Date = new Proxy(NativeDate, { construct(target, args) {
    if (args.length) return Reflect.construct(target, args);
    if (++constructions === 2) queueMicrotask(() => abortRead?.());
    return new NativeDate();
  } });
  globalThis.fetch = async () => {
    const f = currentFixture(), clock = new NativeDate().toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(f.encode(), { status: 200 }); Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const result = await reader.readCurrentCronRecovery('observe', { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} });
    assert.equal(result.currentReadAuthentication, 'UNKNOWN'); assert.equal(result.nativeAcceptance, false);
  } finally { globalThis.fetch = originalFetch; globalThis.Date = NativeDate; globalThis.setTimeout = originalTimeout; }
});

test('caller cannot replace the captured token with a getter after source validation', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch; let getters = 0, requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++; assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer SIMULATED_ORIGINAL_TOKEN');
    const f = currentFixture(), clock = new Date().toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(f.encode(), { status: 200 }); Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const input = { providerToken: 'SIMULATED_ORIGINAL_TOKEN', originalEvidence: {} };
    const pending = reader.readCurrentCronRecovery('observe', input);
    Object.defineProperty(input, 'providerToken', { get() { getters++; throw Error('PRIVATE_REPLACED_TOKEN'); } });
    const result = await pending; assert.equal(getters, 0); assert.equal(requests, 1); assert.equal(result.currentReadAuthentication, 'AUTHENTICATED_FIXED_READER');
  } finally { globalThis.fetch = originalFetch; }
});
test('caller evidence getter installed during the read is never reread after awaits', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch; let getters = 0;
  globalThis.fetch = async () => {
    const f = currentFixture(), clock = new Date().toISOString();
    for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(f.encode(), { status: 200 }); Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const input = { providerToken: 'SIMULATED_TOKEN', originalEvidence: {} };
    const pending = reader.readCurrentCronRecovery('observe', input);
    Object.defineProperty(input, 'originalEvidence', { get() { getters++; throw Error('PRIVATE_REPLACED_EVIDENCE'); } });
    const result = await pending; assert.equal(getters, 0); assert.equal(result.currentReadAuthentication, 'AUTHENTICATED_FIXED_READER');
  } finally { globalThis.fetch = originalFetch; }
});
test('nested caller evidence mutation cannot change the captured original intent', async () => {
  assert.ok(reader); const originalFetch = globalThis.fetch, f = currentFixture(true);
  f.evidence.intent!.writeIntent.issuedAt = new Date(Date.now() - 10000).toISOString();
  const originalEvidence = { intent: f.evidence.intent, custody: null, acknowledgement: null, originalRunBinding: null, originalArmBinding: null, armIntent: null, unrelatedApplicationDrift: false, unrelatedSourceDrift: false };
  globalThis.fetch = async () => {
    const clock = new Date().toISOString(); for (const key of ['transactionStartedAt', 'statementAt', 'readStartedAt', 'readCompletedAt']) f.raw[key] = clock;
    const response = new Response(f.encode(), { status: 200 }); Object.defineProperty(response, 'url', { value: endpoint }); return response;
  };
  try {
    const pending = reader.readCurrentCronRecovery('prepare', { providerToken: 'SIMULATED_TOKEN', originalEvidence });
    originalEvidence.intent!.originalRoleSettings![0] = 'statement_timeout=2s';
    const result = await pending; assert.equal(result.status, 'advice'); assert.equal(result.preparationReadbackMatches, true);
  } finally { globalThis.fetch = originalFetch; }
});
