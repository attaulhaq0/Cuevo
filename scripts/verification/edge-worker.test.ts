import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEdgeWorkerLocal, assertIdleWorkerDispatch, assertStartedEdgeRuntime, edgeRuntimeConnected, requireOwnedGatewayReload, assertOwnedWorkerEvents, assertOpaqueWake, signedWakeHeaders, ownedCronUnscheduleSql, requireCronRemoval, edgeVerificationFailure, safeEdgeFailureCode, readEdgeInventory, edgeWorkerEvidence, requireEdgeArtifactSource, requireNoAnalyticsActivation, inspectUnsignedWorkerResponse } from './edge-worker';
const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:fixture@127.0.0.1:56322/postgres' };
const worker = 'postgresql://cuevo_worker:fixture@127.0.0.1:56322/postgres';

test('unsigned HTTP readiness identifies the exact worker denial rather than gateway status alone', async () => {
  const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  assert.equal(await inspectUnsignedWorkerResponse(response(401, { code: 'WORKER_AUTH_REQUIRED' })), 'WORKER_AUTH_REQUIRED');
  for (const [status, body] of [[401, { message: 'No API key found in request' }], [401, { code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing authorization header' }], [503, { message: 'name resolution failed' }], [404, { code: 'NOT_FOUND' }], [502, { message: 'upstream unavailable' }]]) assert.equal(await inspectUnsignedWorkerResponse(response(status as number, body)), 'UNKNOWN_RESPONSE');
  assert.equal(await inspectUnsignedWorkerResponse(response(401, { code: 'WORKER_AUTH_REQUIRED', private: 'unexpected-body' })), 'UNKNOWN_RESPONSE');
  assert.equal(await inspectUnsignedWorkerResponse(new Response('private-html', { status: 503 })), 'UNKNOWN_RESPONSE');
  let discarded = false;
  const unknownBody = new ReadableStream({ cancel() { discarded = true; } });
  assert.equal(await inspectUnsignedWorkerResponse(new Response(unknownBody, { status: 503 })), 'UNKNOWN_RESPONSE');
  assert.equal(discarded, true);
});
test('worker HTTP identity inspection bounds private response reads and stores no response content', async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('private-response-body'.repeat(100))); }, cancel() { canceled = true; } });
  assert.equal(await inspectUnsignedWorkerResponse(new Response(body, { status: 401 })), 'UNKNOWN_RESPONSE');
  assert.equal(canceled, true);
});
test('worker response cancellation cannot hold identity inspection beyond its bounded read deadline', async () => {
  const stalled = () => new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => {}) });
  assert.equal(await inspectUnsignedWorkerResponse(new Response(stalled(), { status: 503 })), 'UNKNOWN_RESPONSE');
  const started = performance.now();
  assert.equal(await inspectUnsignedWorkerResponse(new Response(stalled(), { status: 401 })), 'UNKNOWN_RESPONSE');
  assert.ok(performance.now() - started < 1500);
});
test('unsigned worker identity cannot reach processing when the actual handler rejects absent authentication', async () => {
  const { createWorkerHandler } = await import('../../apps/worker/src/jobs/outbox/edge-handler');
  let connected = false;
  const handler = createWorkerHandler({ purposeKey: 'a'.repeat(64), databaseUrl: 'private-fixture-url' }, async () => { connected = true; throw Error('Must not connect'); });
  const response = await handler(new Request('http://127.0.0.1/functions/v1/cuevo-worker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, wakeId: 'b53cfa42-4280-4d87-bb83-e4c19d6085f6' }) }));
  assert.equal(await inspectUnsignedWorkerResponse(response), 'WORKER_AUTH_REQUIRED');
  assert.equal(connected, false);
});

test('runtime verification admits only current hashed worker and exact portable analytics sources', () => {
  requireEdgeArtifactSource('apps/worker/src/edge.ts');
  requireEdgeArtifactSource('packages/contracts/src/analytics.ts');
  requireEdgeArtifactSource('packages/config/src/synthetic-runtime.ts');
  for (const path of ['packages/contracts/src/index.ts', 'packages/contracts/src/diagnostics-contract.ts', 'packages/config/src/index.ts', 'apps/api/src/app.ts', 'apps/worker/src/../test/private.ts', '../apps/worker/src/edge.ts']) assert.throws(() => requireEdgeArtifactSource(path));
});

test('exclusive deterministic Edge verification refuses an enabled analytics destination before runtime startup', () => {
  requireNoAnalyticsActivation(0);
  for (const value of [1, 2, null, undefined, '0', -1]) assert.throws(() => requireNoAnalyticsActivation(value));
});
test('Edge verification refuses remote, owner, another database and credential-bearing public targets', () => {
  assert.equal(assertEdgeWorkerLocal(status, worker).username, 'cuevo_worker');
  for (const changed of [{ ...status, API_URL: 'https://other.supabase.co' }, { ...status, API_URL: 'http://name:secret@127.0.0.1:56321' }, { ...status, DB_URL: 'postgresql://postgres:fixture@127.0.0.1:54322/postgres' }]) assert.throws(() => assertEdgeWorkerLocal(changed, worker));
  for (const changed of [undefined, worker.replace('cuevo_worker', 'postgres'), worker.replace('127.0.0.1', 'db.example.test'), worker.replace('/postgres', '/other'), worker + '?sslmode=disable']) assert.throws(() => assertEdgeWorkerLocal(status, changed));
});
test('exclusive verifier cannot overwrite active or retained operator dispatch configuration', () => {
  const idle = { enabled: false, state: 'DISABLED', wake_id: null, endpoint: null, vault_secret_name: null, allow_local: false };
  assert.deepEqual(assertIdleWorkerDispatch(idle), idle);
  for (const changed of [undefined, { ...idle, enabled: true }, { ...idle, state: 'REQUESTED' }, { ...idle, wake_id: 'owned-by-another' }, { ...idle, endpoint: 'https://operator.test' }, { ...idle, vault_secret_name: 'operator-key' }, { ...idle, allow_local: true }]) assert.throws(() => assertIdleWorkerDispatch(changed));
});
test('owned CLI start may replace a stopped Edge container but cannot claim an active or foreign baseline', () => {
  const before = { id: 'stopped-id', name: '/supabase_edge_runtime_cuevo', running: false, startedAt: 'before', project: 'cuevo', networks: ['cuevo-local'], restarting: false, status: 'exited', restartCount: 0 };
  const replacement = { ...before, id: 'new-owned-id', running: true, startedAt: 'now', status: 'running' };
  assert.equal(assertStartedEdgeRuntime(before, replacement).id, 'new-owned-id');
  assert.equal(assertStartedEdgeRuntime(undefined, replacement).id, 'new-owned-id');
  assert.throws(() => assertStartedEdgeRuntime({ ...before, running: true }, replacement));
  for (const current of [undefined, { ...replacement, name: '/supabase_edge_runtime_other' }, { ...replacement, project: 'other' }, { ...replacement, networks: ['other'] }, { ...replacement, running: false }]) assert.throws(() => assertStartedEdgeRuntime(before, current));
});
test('Edge restart waits for network attachment while a connected foreign target still denies', () => {
  const pending = { id: 'new-owned-id', name: '/supabase_edge_runtime_cuevo', running: true, startedAt: 'now', project: 'cuevo', networks: [] as string[], restarting: false, status: 'running', restartCount: 0 };
  assert.equal(edgeRuntimeConnected(undefined), false);
  assert.equal(edgeRuntimeConnected(pending), false);
  assert.equal(edgeRuntimeConnected({ ...pending, networks: ['cuevo-local'] }), true);
  assert.equal(edgeRuntimeConnected({ ...pending, running: false, networks: ['cuevo-local'] }), false);
  assert.throws(() => edgeRuntimeConnected({ ...pending, networks: ['other'] }));
  assert.throws(() => edgeRuntimeConnected({ ...pending, project: 'other', networks: ['cuevo-local'] }));
});
test('gateway recovery can reload only the unchanged active Cuevo gateway process', () => {
  const gateway = { id: 'cuevo-gateway-id', name: '/supabase_kong_cuevo', running: true, startedAt: 'baseline', project: 'cuevo', networks: ['cuevo-local'], restarting: false, status: 'running', restartCount: 0 };
  assert.deepEqual(requireOwnedGatewayReload(gateway, gateway), ['exec', 'supabase_kong_cuevo', 'kong', 'reload', '--nginx-conf', '/home/kong/custom_nginx.template']);
  for (const changed of [undefined, { ...gateway, id: 'another' }, { ...gateway, name: '/supabase_kong_other' }, { ...gateway, project: 'other' }, { ...gateway, networks: ['other'] }, { ...gateway, running: false }, { ...gateway, startedAt: 'restarted' }]) assert.throws(() => requireOwnedGatewayReload(gateway, changed));
});
test('physical event cleanup requires exact generated IDs and canonical synthetic acknowledgment source', () => {
  const id = 'b53cfa42-4280-4d87-bb83-e4c19d6085f6'; const prefix = 'edge-verification:b53cfa42-4280-4d87-bb83-e4c19d6085f6:';
  const source = { id, school_id: '10000000-0000-4000-8000-000000000001', actor_id: '20000000-0000-4000-8000-000000000004', type: 'school.updated', entity_type: 'school', entity_id: '10000000-0000-4000-8000-000000000001', version: 1, metadata: {}, deduplication_key: prefix + id };
  assert.doesNotThrow(() => assertOwnedWorkerEvents([source], [id], prefix));
  for (const changed of [{ ...source, school_id: 'other' }, { ...source, actor_id: 'other' }, { ...source, type: 'result.released' }, { ...source, metadata: { learnerId: 'private' } }, { ...source, deduplication_key: 'another-owner' }]) assert.throws(() => assertOwnedWorkerEvents([changed], [id], prefix));
  assert.throws(() => assertOwnedWorkerEvents([source], [], prefix)); assert.throws(() => assertOwnedWorkerEvents([source], [id, id], prefix));
});
test('network proof accepts only an opaque wake and binds signatures to generation and issuance time', () => {
  const key = 'a'.repeat(64); const first = 'b53cfa42-4280-4d87-bb83-e4c19d6085f6'; const second = 'd98798a3-c18a-4a1c-a4d0-ed244f01b261';
  assert.doesNotThrow(() => assertOpaqueWake({ version: 1, wakeId: first }));
  for (const changed of [{ version: 1, wakeId: first, learnerId: 'private' }, { version: 2, wakeId: first }, { version: 1, wakeId: 'unknown' }, []]) assert.throws(() => assertOpaqueWake(changed));
  const headers = signedWakeHeaders(key, first, 1790942400); assert.equal(JSON.stringify(headers).includes(key), false); assert.equal(JSON.stringify(headers).includes('Bearer'), false);
  assert.notEqual(headers['X-Cuevo-Wake-Signature'], signedWakeHeaders(key, second, 1790942400)['X-Cuevo-Wake-Signature']);
  assert.notEqual(headers['X-Cuevo-Wake-Signature'], signedWakeHeaders(key, first, 1790942401)['X-Cuevo-Wake-Signature']);
});
test('evidence projects only sanitized checks and never derives hosted or latency acceptance', () => {
  const proof = edgeWorkerEvidence([{ name: 'committed-wake', passed: true, count: 1, durationMs: 300 }], 'a'.repeat(64));
  assert.equal(proof.status, 'VERIFIED'); assert.equal(proof.hostedAcceptance, false); assert.equal(proof.latencyGuarantee, false);
  assert.equal(edgeWorkerEvidence([{ name: 'cleanup', passed: false }], 'a'.repeat(64)).status, 'FAILED');
  assert.throws(() => edgeWorkerEvidence([{ name: 'private payload', passed: true }], 'a'.repeat(64))); assert.throws(() => edgeWorkerEvidence([{ name: 'bad-duration', passed: true, durationMs: -1 }], 'a'.repeat(64)));
});
test('Cron cleanup selects the numeric overload and requires an actual removal receipt', () => {
  assert.equal(ownedCronUnscheduleSql, 'select cron.unschedule($1::bigint)as removed');
  assert.doesNotThrow(() => requireCronRemoval(true));
  for (const unconfirmed of [false, undefined, null, 'true', 1]) assert.throws(() => requireCronRemoval(unconfirmed));
});
test('failure diagnostics retain only a bounded phase code and exclude raw database details', () => {
  assert.equal(safeEdgeFailureCode({ code: '57014', message: 'Private learner answer and credential' }), 'SQL_57014');
  assert.equal(safeEdgeFailureCode({ code: '23503', detail: 'Protected object identity' }), 'SQL_23503');
  assert.equal(safeEdgeFailureCode({ code: 'arbitrary_private_error', message: 'Credential' }), 'VERIFICATION_UNAVAILABLE');
  assert.equal(safeEdgeFailureCode(new TypeError('Private payload')), 'TYPE_ERROR');
  assert.equal(safeEdgeFailureCode(edgeVerificationFailure('OWNED_SERVER_EXITED')), 'OWNED_SERVER_EXITED');
});
test('Docker inventory retries only transient read races and stops after three attempts', async () => {
  let attempts = 0;
  const result = await readEdgeInventory(async () => { attempts++; if (attempts < 3) throw edgeVerificationFailure('DOCKER_INVENTORY_RACE'); return ['new-owned-container']; });
  assert.deepEqual(result, ['new-owned-container']); assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(readEdgeInventory(async () => { attempts++; throw edgeVerificationFailure('DOCKER_INVENTORY_RACE'); }), error => safeEdgeFailureCode(error) === 'DOCKER_INVENTORY_RACE');
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(readEdgeInventory(async () => { attempts++; throw edgeVerificationFailure('COMMAND_UNAVAILABLE'); }), error => safeEdgeFailureCode(error) === 'COMMAND_UNAVAILABLE');
  assert.equal(attempts, 1);
});
