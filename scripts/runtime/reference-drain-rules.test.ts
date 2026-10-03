import assert from 'node:assert/strict';
import test from 'node:test';
import { requireReferenceWorkerTarget, referenceManifest, requireReferenceSnapshot, requireReferenceHealth, requireReferenceProgress, drainReference } from './reference-drain-rules';

const worker = 'postgresql://cuevo_worker:fixture@127.0.0.1:56322/postgres';
const snapshot = (pendingCount = 0) => ({ database: 'postgres', port: 5432, sessionUser: 'postgres', readOnly: true, referenceActive: true, populationMatches: true, dispatchDisabled: true, pendingCount, processingCount: 0, failedCount: 0, unsafeCount: 0, nonWorkerCount: 0, nonCompletedCount: pendingCount });
const health = (pendingCount = 0) => ({ scope: 'WORKER', ready: true, pendingCount, failedCount: 0 });
const progress = { processed: 1, attempted: 1, reviewRequired: false, failureReceiptUnknown: false, executionUnavailable: false, deadlineReached: false };

test('reference worker target rejects PostgreSQL query overrides, owner and foreign targets', () => {
  assert.equal(requireReferenceWorkerTarget(worker), worker);
  for (const value of [undefined, worker + '?host=remote.example', worker + '?user=postgres', worker + '?port=5432', worker + '#fragment', worker.replace('postgresql:', 'https:'), worker.replace('cuevo_worker', 'postgres'), worker.replace('127.0.0.1', 'remote.example'), worker.replace('56322', '54322'), worker.replace('/postgres', '/other'), worker.replace(':fixture@', '@')]) assert.throws(() => requireReferenceWorkerTarget(value));
});

test('reference manifest refuses non-synthetic, foreign or duplicate fixture identities', () => {
  const manifest = { synthetic: true, schoolId: '10000000-0000-4000-8000-000000000001', denialSchoolId: '10000000-0000-4000-8000-000000000002', actors: [{ actorId: '20000000-0000-4000-8000-000000000001', schoolId: '10000000-0000-4000-8000-000000000001' }] };
  assert.equal(referenceManifest(manifest).actors.length, 1);
  for (const value of [{ ...manifest, synthetic: false }, { ...manifest, actors: [] }, { ...manifest, actors: [...manifest.actors, ...manifest.actors] }, { ...manifest, actors: [{ ...manifest.actors[0], schoolId: '10000000-0000-4000-8000-000000000003' }] }, { ...manifest, schoolId: '10000000-0000-4000-8000-000000000009' }]) assert.throws(() => referenceManifest(value));
});

test('reference admission refuses active leases, unsafe population, enabled dispatch and owner write sessions', () => {
  assert.equal(requireReferenceSnapshot(snapshot(3)).pendingCount, 3);
  for (const fields of [{ processingCount: 1, nonCompletedCount: 1 }, { failedCount: 1, nonCompletedCount: 1 }, { unsafeCount: 1 }, { populationMatches: false }, { referenceActive: false }, { dispatchDisabled: false }, { readOnly: false }, { sessionUser: 'cuevo_worker' }, { database: 'other' }, { port: 5433 }, { nonCompletedCount: 1 }]) assert.throws(() => requireReferenceSnapshot({ ...snapshot(), ...fields }));
});

test('reference drain refuses unfinished work owned by another executor before claiming', async () => {
  let calls = 0;
  await assert.rejects(() => drainReference({ inspect: async () => ({ ...snapshot(1), nonWorkerCount: 1 }), health: async () => health(1), process: async () => { calls++; return progress; }, now: () => 1000 }));
  assert.equal(calls, 0);
  for (const scope of [undefined, null, 'SCHOOL_ACCOUNT_AUTH']) assert.throws(() => requireReferenceHealth({ ...health(), scope }, 0));
});

test('reference admission and health refuse missing, negative or non-integer counts', () => {
  for (const bad of [undefined, null, '0', -1, 0.5, Number.NaN]) {
    for (const field of ['pendingCount', 'processingCount', 'failedCount', 'unsafeCount', 'nonCompletedCount']) assert.throws(() => requireReferenceSnapshot({ ...snapshot(), [field]: bad }));
    for (const field of ['pendingCount', 'failedCount']) assert.throws(() => requireReferenceHealth({ ...health(), [field]: bad }, 0));
  }
  assert.throws(() => requireReferenceHealth({ ...health(), ready: false }, 0));
  assert.throws(() => requireReferenceHealth(health(1), 0));
});

test('reference processing requires equal confirmed receipts and stops on every failure summary', () => {
  assert.doesNotThrow(() => requireReferenceProgress({ ...progress, deadlineReached: true }));
  for (const fields of [{ processed: 0 }, { attempted: 0, processed: 0 }, { attempted: 11, processed: 11 }, { attempted: '1' }, { reviewRequired: true }, { failureReceiptUnknown: true }, { executionUnavailable: true }, { reviewRequired: undefined }]) assert.throws(() => requireReferenceProgress({ ...progress, ...fields }));
});

test('drain processes bounded sources and confirms the exact queue before success', async () => {
  let pending = 2; let queries = 0; const limits: number[] = [];
  const result = await drainReference({ inspect: async () => { queries++; return snapshot(pending); }, health: async () => health(pending), process: async value => { limits.push(value.maxEvents); pending--; return progress; }, now: () => 1000 });
  assert.equal(result.processed, 2); assert.equal(pending, 0); assert.ok(queries >= 3); assert.deepEqual(limits, [10, 10]);
});

test('drain denies foreign or processing work before the first claim', async () => {
  for (const fields of [{ unsafeCount: 1 }, { processingCount: 1, nonCompletedCount: 1 }, { dispatchDisabled: false }, { populationMatches: false }]) {
    let calls = 0;
    await assert.rejects(() => drainReference({ inspect: async () => ({ ...snapshot(0), ...fields }), health: async () => health(), process: async () => { calls++; return progress; }, now: () => 1000 }));
    assert.equal(calls, 0);
  }
});

test('drain stops after an unconfirmed receipt without a second claim', async () => {
  for (const fields of [{ reviewRequired: true }, { failureReceiptUnknown: true }, { executionUnavailable: true }, { attempted: 0, processed: 0 }, { processed: 0 }]) {
    let calls = 0;
    await assert.rejects(() => drainReference({ inspect: async () => snapshot(1), health: async () => health(1), process: async () => { calls++; return { ...progress, ...fields }; }, now: () => 1000 }));
    assert.equal(calls, 1);
  }
});

test('drain refuses health drift and unfinished final source checks', async () => {
  let calls = 0;
  await assert.rejects(() => drainReference({ inspect: async () => snapshot(1), health: async () => health(0), process: async () => { calls++; return progress; }, now: () => 1000 }));
  assert.equal(calls, 0);
  let reads = 0;
  await assert.rejects(() => drainReference({ inspect: async () => ++reads === 1 ? snapshot(0) : { ...snapshot(), processingCount: 1, nonCompletedCount: 1 }, health: async () => health(), process: async () => progress, now: () => 1000 }));
});

test('drain refuses an expired execution window and caps repeated confirmed work', async () => {
  let clock = 0; let calls = 0;
  await assert.rejects(() => drainReference({ inspect: async () => snapshot(1), health: async () => health(1), process: async () => { calls++; return progress; }, now: () => { clock += 120001; return clock; } }));
  assert.equal(calls, 0);
  await assert.rejects(() => drainReference({ inspect: async () => snapshot(1), health: async () => health(1), process: async () => { calls++; return progress; }, now: () => 0 }));
  assert.equal(calls, 100);
});
