import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineExternalRestart, isCuevoDependencyContainer, requireCuevoLifecycleCommand, requireOriginalReceipt, sameContainerIdentities, sameUnrelatedContainers, validateOutageDatabaseContainer, type ObservedContainer } from './runtime-outage-rules';
const database = { Name: '/supabase_db_cuevo', Config: { Image: 'public.ecr.aws/supabase/postgres:17.6.1.062' }, NetworkSettings: { Ports: { '5432/tcp': [{ HostPort: '56322' }] }, Networks: { 'cuevo-local': {} } } };
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
