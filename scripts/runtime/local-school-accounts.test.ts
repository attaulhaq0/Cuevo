import test from 'node:test';
import assert from 'node:assert/strict';
import { localSchoolAccountOverlay, requireLocalInvitationCapture } from './local-school-accounts';
import { runtimeEnvironment } from './environment';
import * as localAccounts from './local-school-accounts';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const operatorId = '20000000-0000-4000-8000-000000000001';
const config = 'project_id = "cuevo"\n[api]\nport = 56321\n[db]\nport = 56322\n[local_smtp]\nenabled = true\nport = 56324\n';
const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:unused@127.0.0.1:56322/postgres', SERVICE_ROLE_KEY: 'task-local-secret-key-123456789', INBUCKET_URL: 'http://127.0.0.1:56324' };
const control = { revision: 7, enabled: true, mode: 'LOCAL_SYNTHETIC', database_oid: 123, current_database_oid: 123, project_ref: 'LOCAL_CUEVO', approved_operator_id: operatorId, history_matches: true, operator_verified: true };
function flow(options: { prepareFailure?: boolean; approveFailure?: boolean; commitFailure?: boolean; publishFailure?: boolean; current?: unknown } = {}) {
  const order: string[] = []; const queries: { sql: string; args?: unknown[] }[] = []; let overlay = 'previous-overlay';
  const deps = { projectConfig: config, status, appsStopped: async () => true, query: async (sql: string, args?: unknown[]) => {
    queries.push({ sql, args }); order.push(sql.startsWith('select internal.configure') ? 'approve' : sql);
    if (sql.includes('configure_local_school_account_runtime')) { if (options.approveFailure) throw Error('private-secret'); return { rows: [{ revision: 8 }] }; }
    if (sql === 'COMMIT' && options.commitFailure) throw Error('private-secret');
    if (sql.includes('school_account_runtime_control')) return { rows: [Object.hasOwn(options, 'current') ? options.current : control] };
    return { rows: [] };
  }, prepareOverlay: async (text: string) => {
    order.push('prepare'); if (options.prepareFailure) throw Error('private-secret');
    return { publish: async () => { order.push('publish'); if (options.publishFailure) throw Error('private-secret'); overlay = text; }, discard: async () => { order.push('discard'); } };
  } };
  return { deps, order, queries, overlay: () => overlay };
}
test('local account overlay has one dedicated credential and disabled mode removes it', () => {
  const key = 'task-local-secret-key-123456789'; const text = localSchoolAccountOverlay({ SERVICE_ROLE_KEY: key }, true);
  assert.equal((text.match(/KEY=/g) ?? []).length, 1); assert.ok(text.includes('CUEVO_AUTH_PROVISIONING_KEY=' + key));
  assert.ok(!text.includes('SUPABASE_SERVICE_ROLE_KEY=')); assert.equal(localSchoolAccountOverlay({ SERVICE_ROLE_KEY: key }, false), 'CUEVO_AUTH_PROVISIONING_MODE=DISABLED\n');
  for (const value of ['', 'bad\nsecret']) assert.throws(() => localSchoolAccountOverlay({ SERVICE_ROLE_KEY: value }, true));
});
test('explicit local provisioning overlay never gives credentials to web or worker', () => {
  const text = localSchoolAccountOverlay({ SERVICE_ROLE_KEY: 'task-local-secret-key-123456789' }, true);
  const input = Object.fromEntries(text.trim().split('\n').map(line => { const offset = line.indexOf('='); return [line.slice(0, offset), line.slice(offset + 1)]; }));
  assert.ok(runtimeEnvironment('api', input).CUEVO_AUTH_PROVISIONING_KEY);
  for (const service of ['web', 'worker'] as const) assert.ok(!JSON.stringify(runtimeEnvironment(service, input)).includes('task-local-secret'));
});
test('operator activation requires the current exact Cuevo capture port and enabled service', () => {
  const config = '[local_smtp]\nenabled = true\nport = 56324\n[storage]\nenabled = true\n';
  assert.doesNotThrow(() => requireLocalInvitationCapture(config, { INBUCKET_URL: 'http://127.0.0.1:56324' }));
  for (const value of [config.replace('enabled = true', 'enabled = false'), config.replace('56324', '54324'), config.replace('[local_smtp]', '[other]')]) assert.throws(() => requireLocalInvitationCapture(value, { INBUCKET_URL: 'http://127.0.0.1:56324' }));
  for (const INBUCKET_URL of [undefined, 'http://localhost:56324', 'http://127.0.0.1:54324', 'https://foreign.example']) assert.throws(() => requireLocalInvitationCapture(config, { INBUCKET_URL }));
});

test('preparing an overlay failure stops before any database mutation', async () => {
  const state = flow({ prepareFailure: true });
  await assert.rejects(localAccounts.runLocalSchoolAccountConfiguration({ mode: 'enable', operatorId, reason: 'Reviewed activation' }, state.deps), { code: 'OVERLAY_PREPARATION_FAILED' });
  assert.deepEqual(state.queries, []); assert.equal(state.overlay(), 'previous-overlay');
});

test('successful approval stages before SQL and publishes only after its confirmed commit', async () => {
  const state = flow();
  assert.deepEqual(await localAccounts.runLocalSchoolAccountConfiguration({ mode: 'enable', operatorId, reason: 'Reviewed activation' }, state.deps), { mode: 'LOCAL_SYNTHETIC', revision: 8, repaired: false });
  assert.equal(state.order[0], 'prepare'); assert.ok(state.order.indexOf('approve') < state.order.indexOf('COMMIT')); assert.ok(state.order.indexOf('COMMIT') < state.order.indexOf('publish'));
  assert.ok(state.overlay().includes('CUEVO_AUTH_PROVISIONING_KEY='));
});

test('unknown database commit never publishes the staged overlay', async () => {
  const state = flow({ commitFailure: true });
  await assert.rejects(localAccounts.runLocalSchoolAccountConfiguration({ mode: 'enable', operatorId, reason: 'Reviewed activation' }, state.deps), { code: 'DB_APPROVAL_OUTCOME_UNKNOWN' });
  assert.ok(!state.order.includes('publish')); assert.ok(state.order.includes('discard')); assert.equal(state.overlay(), 'previous-overlay');
});

test('postcommit publishing failure preserves old overlay and reports the committed approval', async () => {
  const state = flow({ publishFailure: true });
  let failure: unknown; try { await localAccounts.runLocalSchoolAccountConfiguration({ mode: 'enable', operatorId, reason: 'Reviewed activation' }, state.deps); } catch (error) { failure = error; }
  assert.equal((failure as { code?: string }).code, 'DB_APPROVED_OVERLAY_UNAVAILABLE'); assert.ok(!String(failure).includes('private-secret'));
  assert.equal(state.overlay(), 'previous-overlay'); assert.ok(state.order.includes('discard')); assert.equal(state.order.filter(value => value === 'approve').length, 1);
});

test('repair republishes only the exact current approval without advancing its revision', async () => {
  const state = flow();
  assert.deepEqual(await localAccounts.runLocalSchoolAccountConfiguration({ mode: 'repair-overlay', operatorId }, state.deps), { mode: 'LOCAL_SYNTHETIC', revision: 7, repaired: true });
  assert.ok(!state.queries.some(query => query.sql.includes('configure_local_school_account_runtime'))); assert.ok(state.overlay().includes('CUEVO_AUTH_PROVISIONING_KEY='));
});

test('repair can restore a disabled overlay without reactivating or renewing approval', async () => {
  const state = flow({ current: { ...control, enabled: false, mode: 'DISABLED', database_oid: null, project_ref: null, approved_operator_id: null } });
  assert.deepEqual(await localAccounts.runLocalSchoolAccountConfiguration({ mode: 'repair-overlay', operatorId }, state.deps), { mode: 'DISABLED', revision: 7, repaired: true });
  assert.equal(state.overlay(), 'CUEVO_AUTH_PROVISIONING_MODE=DISABLED\n'); assert.ok(!state.queries.some(query => query.sql.includes('configure_local_school_account_runtime')));
});

test('failed repair preserves approval and previous overlay without an approval mutation', async () => {
  const state = flow({ publishFailure: true });
  await assert.rejects(localAccounts.runLocalSchoolAccountConfiguration({ mode: 'repair-overlay', operatorId }, state.deps), { code: 'OVERLAY_REPAIR_UNAVAILABLE' });
  assert.equal(state.overlay(), 'previous-overlay'); assert.ok(!state.queries.some(query => query.sql.includes('configure_local_school_account_runtime'))); assert.ok(state.order.includes('discard'));
});

test('an unconfirmed stopped state refuses staging and database work', async () => {
  const state = flow(); state.deps.appsStopped = async () => false;
  await assert.rejects(localAccounts.runLocalSchoolAccountConfiguration({ mode: 'enable', operatorId, reason: 'Reviewed activation' }, state.deps), { code: 'DB_APPROVAL_REQUIRES_REVIEW' });
  assert.deepEqual(state.queries, []); assert.ok(!state.order.includes('prepare')); assert.equal(state.overlay(), 'previous-overlay');
});

test('repair validates exact operator target mode and immutable history before staging', async () => {
  for (const current of [null, { ...control, approved_operator_id: '20000000-0000-4000-8000-000000000002' }, { ...control, database_oid: 999 }, { ...control, project_ref: 'foreign' }, { ...control, mode: 'DISABLED' }, { ...control, history_matches: false }, { ...control, operator_verified: false }]) {
    const state = flow({ current });
    await assert.rejects(localAccounts.runLocalSchoolAccountConfiguration({ mode: 'repair-overlay', operatorId }, state.deps), { code: 'OVERLAY_REPAIR_REQUIRES_REVIEW' });
    assert.ok(!state.order.includes('prepare')); assert.equal(state.overlay(), 'previous-overlay'); assert.ok(!state.queries.some(query => query.sql.includes('configure_local_school_account_runtime')));
  }
});

test('database rejection discards staged overlay without publishing', async () => {
  const state = flow({ approveFailure: true });
  await assert.rejects(localAccounts.runLocalSchoolAccountConfiguration({ mode: 'disable', operatorId, reason: 'Reviewed pause' }, state.deps), { code: 'DB_APPROVAL_REQUIRES_REVIEW' });
  assert.ok(state.order.includes('ROLLBACK')); assert.ok(state.order.includes('discard')); assert.ok(!state.order.includes('publish')); assert.equal(state.overlay(), 'previous-overlay');
});

test('atomic overlay staging preserves the previous file and cleans only its own pending file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cuevo-account-overlay-')); const target = join(directory, 'school-account.env'); const unrelated = join(directory, 'unrelated.env');
  try {
    await writeFile(target, 'previous-overlay'); await writeFile(unrelated, 'unrelated');
    const staged = await localAccounts.prepareLocalSchoolAccountOverlay('reviewed-overlay', target);
    assert.equal(await readFile(target, 'utf8'), 'previous-overlay'); assert.equal((await readdir(directory)).length, 3);
    await staged.discard(); assert.deepEqual((await readdir(directory)).sort(), ['school-account.env', 'unrelated.env']); assert.equal(await readFile(target, 'utf8'), 'previous-overlay');
    const published = await localAccounts.prepareLocalSchoolAccountOverlay('reviewed-overlay', target); await published.publish(); await published.discard();
    assert.equal(await readFile(target, 'utf8'), 'reviewed-overlay'); assert.equal(await readFile(unrelated, 'utf8'), 'unrelated');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
