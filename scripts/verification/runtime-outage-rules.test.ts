import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineExternalRestart, isCuevoDependencyContainer, requireCuevoLifecycleCommand, requireOriginalReceipt, sameContainerIdentities, sameUnrelatedContainers, validateOutageDatabaseContainer, waitForCuevoProviderReady, type ObservedContainer } from './runtime-outage-rules';
const database = { Name: '/supabase_db_cuevo', Config: { Image: 'public.ecr.aws/supabase/postgres:17.6.1.062' }, NetworkSettings: { Ports: { '5432/tcp': [{ HostPort: '56322' }] }, Networks: { 'cuevo-local': {} } } };
test('post-outage provider waits for exact database native health before admitting private CLI status', async () => {
  const ready = waitForCuevoProviderReady;
  let clock = 0, inspected = 0, cliReads = 0; const samples: unknown[] = [];
  const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:fixture-private@127.0.0.1:56322/postgres', PUBLISHABLE_KEY: 'sb_publishable_fixture', SERVICE_ROLE_KEY: 'fixture-private' };
  assert.deepEqual(await ready({ inspect: async () => ({ ...database, State: { Running: true, Restarting: false, Health: { Status: ++inspected === 1 ? 'starting' : 'healthy' } } }), readStatus: async () => { cliReads++; return { exitCode: 0, stdout: JSON.stringify(status), stderr: '' }; }, now: () => clock, wait: async (ms: number) => { clock += ms; }, onSample: (value: unknown) => samples.push(value) }), status);
  assert.equal(inspected, 2); assert.equal(cliReads, 1); assert.equal(JSON.stringify(samples).includes('fixture-private'), false);
});
test('post-outage provider fails closed on foreign target, malformed CLI and unhealthy deadline without leaking diagnostics', async () => {
  const ready = waitForCuevoProviderReady;
  const healthy = { ...database, State: { Running: true, Restarting: false, Health: { Status: 'healthy' } } };
  for (const value of [{ exitCode: 1, stdout: 'private-token', stderr: 'private-password' }, { exitCode: 0, stdout: '{private-token', stderr: '' }, { exitCode: 0, stdout: JSON.stringify({ API_URL: 'http://foreign:56321', DB_URL: 'postgresql://postgres:private-password@foreign:56322/postgres' }), stderr: '' }]) {
    await assert.rejects(ready({ inspect: async () => healthy, readStatus: async () => value }), (error: unknown) => error instanceof Error && !error.message.includes('private-'));
  }
  let clock = 0, cliReads = 0; const samples: unknown[] = [];
  await assert.rejects(ready({ inspect: async () => ({ ...healthy, State: { ...healthy.State, Health: { Status: 'starting' } } }), readStatus: async () => { cliReads++; return {exitCode:0,stdout:'',stderr:''}; }, now: () => clock, wait: async (ms: number) => { clock += ms; }, timeoutMs: 1000, onSample: (value: unknown) => samples.push(value) }), /deadline/);
  assert.equal(cliReads, 0); assert.ok(samples.length > 0);
});
test('provider requires explicit running and non-restarting native health before requesting private status', async () => {
  for (const state of [undefined, { Running: true, Health: { Status: 'healthy' } }, { Running: true, Restarting: null, Health: { Status: 'healthy' } }, { Running: true, Restarting: 0, Health: { Status: 'healthy' } }, { Running: true, Restarting: 'false', Health: { Status: 'healthy' } }, { Running: false, Restarting: false, Health: { Status: 'healthy' } }, { Running: true, Restarting: true, Health: { Status: 'healthy' } }, { Running: true, Restarting: false, Health: null }, { Running: true, Restarting: false, Health: { Status: 'unhealthy' } }]) {
    let clock = 0, cliReads = 0;
    await assert.rejects(waitForCuevoProviderReady({ inspect: async () => ({ ...database, State: state }), readStatus: async () => { cliReads++; return { exitCode: 0, stdout: '{}', stderr: '' }; }, timeoutMs: 1, now: () => clock, wait: async ms => { clock += ms; } }), /deadline/);
    assert.equal(cliReads, 0);
  }
});
test('late healthy inspection cannot start CLI admission beyond the provider deadline', async () => {
  let clock = 0, cliReads = 0;
  await assert.rejects(waitForCuevoProviderReady({ inspect: async () => { clock = 1000; return { ...database, State: { Running: true, Restarting: false, Health: { Status: 'healthy' } } }; }, readStatus: async () => { cliReads++; return { exitCode: 0, stdout: '{}', stderr: '' }; }, now: () => clock, timeoutMs: 1000 }), /deadline/);
  assert.equal(cliReads, 0);
});
test('late valid CLI status cannot admit a provider beyond the deadline', async () => {
  let clock = 0; const samples: unknown[] = [];
  const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:private-deadline@127.0.0.1:56322/postgres', PUBLISHABLE_KEY: 'sb_publishable_fixture', SERVICE_ROLE_KEY: 'private-deadline' };
  await assert.rejects(waitForCuevoProviderReady({ inspect: async () => ({ ...database, State: { Running: true, Restarting: false, Health: { Status: 'healthy' } } }), readStatus: async () => { clock = 1000; return { exitCode: 0, stdout: JSON.stringify(status), stderr: '' }; }, now: () => clock, timeoutMs: 1000, onSample: sample => samples.push(sample) }), /deadline/);
  assert.ok(samples.length > 0); assert.equal(JSON.stringify(samples).includes('private-deadline'), false);
});
test('inspection and CLI exceptions retain fixed private-safe failure evidence', async () => {
  for (const boundary of ['inspect', 'status']) {
    const samples: unknown[] = [];
    await assert.rejects(waitForCuevoProviderReady({ inspect: async () => { if (boundary === 'inspect') throw Error('private-inspect-body'); return { ...database, State: { Running: true, Restarting: false, Health: { Status: 'healthy' } } }; }, readStatus: async () => { throw Error('private-status-body'); }, onSample: sample => samples.push(sample) }), (error: unknown) => error instanceof Error && !error.message.includes('private-'));
    assert.ok(samples.length > 0); assert.equal(JSON.stringify(samples).includes('private-'), false);
  }
});
test('provider bounds commands to the remaining deadline and refuses invalid deadlines before inspection', async () => {
  let clock = 0; const budgets: number[] = [];
  const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:private-budget@127.0.0.1:56322/postgres', PUBLISHABLE_KEY: 'sb_publishable_fixture', SERVICE_ROLE_KEY: 'private-budget' };
  await waitForCuevoProviderReady({ inspect: async budget => { budgets.push(budget); clock = 250; return { ...database, State: { Running: true, Restarting: false, Health: { Status: 'healthy' } } }; }, readStatus: async budget => { budgets.push(budget); return { exitCode: 0, stdout: JSON.stringify(status), stderr: '' }; }, timeoutMs: 1000, now: () => clock });
  assert.deepEqual(budgets, [1000, 750]);
  for (const timeoutMs of [0, -1, 1.5, 60001, Infinity, NaN]) {
    await assert.rejects(waitForCuevoProviderReady({ timeoutMs, inspect: async () => { throw Error('Inspection must not run'); }, readStatus: async () => { throw Error('CLI must not run'); } }), /bounded deadline/);
  }
});
test('foreign inspected database cannot reach CLI admission and diagnostics remain fixed', async () => {
  let cliReads = 0; const samples: unknown[] = [];
  await assert.rejects(waitForCuevoProviderReady({ inspect: async () => ({ ...database, Name: '/private-foreign-database', State: { Running: true, Restarting: false, Health: { Status: 'healthy' } } }), readStatus: async () => { cliReads++; return { exitCode: 0, stdout: '{}', stderr: '' }; }, onSample: sample => samples.push(sample) }), /unverified Cuevo/);
  assert.equal(cliReads, 0); assert.equal(JSON.stringify(samples).includes('private-'), false);
  assert.deepEqual(samples, [{ attempt: 1, elapsedMs: (samples[0] as { elapsedMs: number }).elapsedMs, state: 'UNKNOWN', cli: 'NOT_REQUESTED', reason: 'TARGET_INVALID' }]);
});
test('restart target requires exact Cuevo identity, Postgres version, port and network', () => {
  assert.doesNotThrow(() => validateOutageDatabaseContainer(database));
  for (const invalid of [undefined, { ...database, Name: '/supabase_db_another' }, { ...database, Config: { Image: 'postgres:17' } }, { ...database, NetworkSettings: { ...database.NetworkSettings, Ports: { '5432/tcp': [{ HostPort: '54322' }] } } }, { ...database, NetworkSettings: { ...database.NetworkSettings, Networks: { other: {} } } }]) assert.throws(() => validateOutageDatabaseContainer(invalid));
});
test('unrelated stopped, replaced or restarted containers fail preservation evidence', () => {
  const before = [{ id: 'unrelated', running: true, startedAt: 'original-start' }];
  assert.equal(sameUnrelatedContainers(before, [...before, { id: 'new-container', running: true, startedAt: 'new-start' }]), true);
  for (const after of [[], [{ ...before[0], running: false }], [{ ...before[0], startedAt: 'new-start' }]]) assert.equal(sameUnrelatedContainers(before, after), false);
});
test('only exact Cuevo dependency names with project label and network are related', () => {
  assert.equal(isCuevoDependencyContainer('/supabase_realtime_cuevo', 'cuevo', ['cuevo-local']), true);
  for (const [name, project, networks] of [['/supabase_realtime_other', 'other', ['cuevo-local']], ['/supabase_realtime_cuevo', 'other', ['cuevo-local']], ['/supabase_realtime_cuevo', 'cuevo', ['other']], ['/unrelated_cuevo', 'cuevo', ['cuevo-local']]] as const) assert.equal(isCuevoDependencyContainer(name, project, [...networks]), false);
});
test('original idempotency key must return the exact confirmed receipt', () => {
  assert.doesNotThrow(() => requireOriginalReceipt({ id: 'source', status: 'COMPLETED' }, { id: 'source', status: 'COMPLETED' }));
  assert.doesNotThrow(() => requireOriginalReceipt({ id: 'source', status: 'COMPLETED' }, { status: 'COMPLETED', id: 'source' }));
  assert.throws(() => requireOriginalReceipt({ id: 'source' }, { id: 'different' }));
  assert.throws(() => requireOriginalReceipt({ id: 'source', status: 'COMPLETED' }, { id: 'source', status: 'PENDING' }));
});
test('only a proven baseline restart on a separate project/network is external state drift', () => {
  const foreign: ObservedContainer = { id: 'foreign', name: '/dependency_foreign', project: 'foreign-project', networks: ['foreign-network'], running: true, startedAt: 'first', restarting: true, status: 'restarting', restartCount: 12 };
  assert.equal(baselineExternalRestart(foreign), true);
  for (const changed of [{ ...foreign, restarting: false }, { ...foreign, status: 'running' }, { ...foreign, restartCount: 0 }, { ...foreign, project: 'cuevo' }, { ...foreign, networks: ['cuevo-local'] }, { ...foreign, project: undefined }]) assert.equal(baselineExternalRestart(changed), false);
  assert.equal(sameContainerIdentities([foreign], [{ ...foreign, startedAt: 'later', restartCount: 13 }]), true);
  for (const after of [[], [{ ...foreign, id: 'replacement' }], [{ ...foreign, project: 'different' }]]) assert.equal(sameContainerIdentities([foreign], after), false);
});
test('every lifecycle command is restricted to the validated Cuevo database', () => {
  assert.doesNotThrow(() => requireCuevoLifecycleCommand('stop', 'supabase_db_cuevo'));
  assert.doesNotThrow(() => requireCuevoLifecycleCommand('start', 'supabase_db_cuevo'));
  for (const [action, container] of [['restart', 'supabase_db_cuevo'], ['stop', 'foreign'], ['start', 'supabase_db_other']]) assert.throws(() => requireCuevoLifecycleCommand(action, container));
});
