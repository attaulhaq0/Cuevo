import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureLocalPosthog, parseLocalPosthogConfig, parsePosthogOverlay, loadDevelopmentEnvironment, type LocalPosthogDependencies } from './posthog-local';
import { runtimeEnvironment } from './environment';

const settings = { projectId: 393668, host: 'https://us.i.posthog.com', projectKey: 'phc_test_only', pseudonymKey: 'a'.repeat(64), keyVersion: 1, environment: 'DEMO', schoolId: '10000000-0000-4000-8000-000000000001' };
const project = 'project_id = "cuevo"\n[api]\nport = 56321\n[db]\nport = 56322\n';
const local = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:test@127.0.0.1:56322/postgres' };
function dependencies(overrides: Partial<LocalPosthogDependencies> = {}) {
  const calls: { sql: string; values?: unknown[] }[] = []; const files: string[] = [];
  const deps: LocalPosthogDependencies = {
    projectConfig: project, status: local, appsStopped: async () => true,
    query: async (sql, values) => { calls.push({ sql, values }); if (sql.includes('runtime_guard')) return { rows: [{ database: 'postgres', port: 5432, role: 'postgres' }] }; if (sql.includes('school_guard')) return { rows: [{ active: true, population: 10, active_memberships: 10, unsafe: 0, analytics_enabled: true }] }; if (sql.includes('configure_posthog_school')) return { rows: [{ activated: true }] }; return { rows: [] }; },
    writeOverlay: async value => { files.push(value); }, ...overrides,
  };
  return { deps, calls, files };
}
test('approved local configuration activates before saving only reviewed worker keys', async () => {
  const { deps, calls, files } = dependencies(); const result = await configureLocalPosthog(settings, false, deps);
  assert.equal(result.mode, 'LIVE_SYNTHETIC'); assert.equal(files.length, 1);
  assert.deepEqual(calls.find(call => call.sql.includes('configure_posthog_school'))?.values, [settings.schoolId, true, 'DEMO', 1]);
  const overlay = parsePosthogOverlay(files[0]); assert.equal(overlay.POSTHOG_PSEUDONYM_KEY, settings.pseudonymKey); assert.equal(overlay.POSTHOG_PROJECT_KEY, settings.projectKey);
  assert.equal(calls.at(-1)?.sql, 'COMMIT');
  for (const service of ['web', 'api'] as const) assert.equal(runtimeEnvironment(service, overlay).POSTHOG_PROJECT_KEY, undefined);
  assert.equal(runtimeEnvironment('worker', overlay).POSTHOG_PROJECT_KEY, settings.projectKey);
});
test('disable preserves credentials in metadata and records deactivation before disabled overlay', async () => {
  const { deps, calls, files } = dependencies(); const original = structuredClone(settings);
  await configureLocalPosthog(settings, true, deps);
  assert.deepEqual(settings, original); assert.deepEqual(calls.find(call => call.sql.includes('configure_posthog_school'))?.values, [settings.schoolId, false, 'DEMO', 1]);
  assert.equal(files[0], 'POSTHOG_CAPTURE_MODE=DISABLED\n'); assert.deepEqual(parsePosthogOverlay(files[0]), { POSTHOG_CAPTURE_MODE: 'DISABLED' });
});
test('running applications refuse activation before any database or file action', async () => {
  const { deps, calls, files } = dependencies({ appsStopped: async () => false });
  await assert.rejects(() => configureLocalPosthog(settings, false, deps), /Stop local Cuevo/); assert.equal(calls.length, 0); assert.equal(files.length, 0);
});
test('foreign Supabase project and database target refuse before effects', async () => {
  for (const status of [{ ...local, API_URL: 'https://remote.supabase.co' }, { ...local, DB_URL: 'postgresql://postgres:test@127.0.0.1:54322/postgres' }, { ...local, DB_URL: 'postgresql://cuevo_worker:test@127.0.0.1:56322/postgres' }]) {
    const { deps, calls, files } = dependencies({ status }); await assert.rejects(() => configureLocalPosthog(settings, false, deps)); assert.equal(calls.length, 0); assert.equal(files.length, 0);
  }
  const { deps } = dependencies({ projectConfig: project.replace('cuevo', 'foreign') }); await assert.rejects(() => configureLocalPosthog(settings, false, deps));
});
test('unknown population, real person, disabled policy and owner mismatch refuse writes', async () => {
  for (const guard of [{ active: true, population: 10, active_memberships: 10, unsafe: 1, analytics_enabled: true }, { active: true, population: 0, active_memberships: 0, unsafe: 0, analytics_enabled: true }, { active: true, population: 10, active_memberships: 10, unsafe: 0, analytics_enabled: false }, {}]) {
    const { deps, files } = dependencies({ query: async sql => ({ rows: [sql.includes('runtime_guard') ? { database: 'postgres', port: 5432, role: 'postgres' } : guard] }) });
    await assert.rejects(() => configureLocalPosthog(settings, false, deps)); assert.equal(files.length, 0);
  }
  const { deps, files } = dependencies({ query: async () => ({ rows: [{ database: 'postgres', port: 5432, role: 'cuevo_api' }] }) }); await assert.rejects(() => configureLocalPosthog(settings, false, deps)); assert.equal(files.length, 0);
});
test('unknown activation receipt does not publish an enabled overlay', async () => {
  const normal = dependencies(); const { deps, files } = dependencies({ query: async (sql, values) => sql.includes('configure_posthog_school') ? { rows: [{ activated: false }] } : normal.deps.query(sql, values) });
  await assert.rejects(() => configureLocalPosthog(settings, false, deps), /activation outcome/); assert.equal(files.length, 0);
});
test('overlay failure after commit reports the saved activation without pretending rollback', async () => {
  const { deps, calls } = dependencies({ writeOverlay: async () => { throw Error('private path or secret'); } });
  await assert.rejects(() => configureLocalPosthog(settings, false, deps), /activation was saved but the local overlay could not be written/);
  assert.equal(calls.at(-1)?.sql, 'COMMIT'); assert.equal(calls.some(call => call.sql === 'ROLLBACK'), false);
});
test('strict metadata rejects other schools, host, secret injection and extra fields without disclosing values', () => {
  for (const bad of [{ ...settings, schoolId: '10000000-0000-4000-8000-000000000099' }, { ...settings, host: 'https://foreign.test' }, { ...settings, projectKey: 'private\nNODE_OPTIONS=bad' }, { ...settings, projectKey: 'private"quoted' }, { ...settings, privateKey: 'secret' }, { ...settings, environment: 'PRODUCTION' }, { ...settings, keyVersion: 0 }]) assert.throws(() => parseLocalPosthogConfig(bad), /^Error: Invalid local PostHog metadata\.$/);
});
test('development optional overlay overrides capture settings and rejects unknown recipients', async () => {
  const { deps, files } = dependencies(); await configureLocalPosthog(settings, false, deps);
  const base = { NODE_ENV: 'development', POSTHOG_CAPTURE_MODE: 'DISABLED', DATABASE_URL: 'existing-api', UNRELATED: 'retained-parent' };
  const merged = await loadDevelopmentEnvironment(base, async () => files[0]); assert.equal(merged.POSTHOG_CAPTURE_MODE, 'LIVE_SYNTHETIC'); assert.equal(merged.DATABASE_URL, 'existing-api'); assert.equal(merged.POSTHOG_PROJECT_KEY, settings.projectKey);
  assert.deepEqual(await loadDevelopmentEnvironment(base, async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }), base);
  assert.throws(() => parsePosthogOverlay('POSTHOG_CAPTURE_MODE=DISABLED\nNODE_OPTIONS=secret\n')); assert.throws(() => parsePosthogOverlay('POSTHOG_CAPTURE_MODE=DISABLED\nNEXT_PUBLIC_POSTHOG_KEY=secret\n'));
  await assert.rejects(() => loadDevelopmentEnvironment({ ...base, NODE_ENV: 'production' }, async () => files[0]));
});
test('CI and integration launchers skip the optional live overlay before reading credentials', async () => {
  for (const guard of [{ CI: 'true' }, { CUEVO_REQUIRE_INTEGRATION: '1' }, { CUEVO_POSTHOG_LOCAL_OVERLAY: 'false' }]) {
    let reads = 0; const base = { NODE_ENV: 'development', ...guard };
    assert.deepEqual(await loadDevelopmentEnvironment(base, async () => { reads++; return 'POSTHOG_CAPTURE_MODE=LIVE_SYNTHETIC'; }), base);
    assert.equal(reads, 0);
  }
});
