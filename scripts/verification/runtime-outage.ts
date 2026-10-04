import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { learnerStateSchema } from '@cuevo/contracts';
import { parseServerConfig } from '@cuevo/config';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
import { runtimeEnvironment } from '../runtime/environment';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';
import { baselineExternalRestart, isCuevoDependencyContainer, requireCuevoLifecycleCommand, requireOriginalReceipt, sameContainerIdentities, sameUnrelatedContainers, validateOutageDatabaseContainer, waitForCuevoProviderReady, type ProviderReadinessSample, type ObservedContainer } from './runtime-outage-rules';

const execute = promisify(execFile);
async function safeExecute(command: string, args: string[]) { try { return (await execute(command, args, { timeout: 30000, maxBuffer: 1024 * 1024 })).stdout; } catch { throw Error('Runtime verification command failed; review the sanitized phase evidence.'); } }
const cli = resolve('node_modules/supabase/dist/supabase.js');
const evidenceDirectory = resolve('.local/verification/runtime-outage', new Date().toISOString().replace(/[:.]/g, '-'));
const checks: { name: string; passed: boolean; durationMs?: number }[] = [];
const preservationChanges: { id: string; name?: string; beforeRunning: boolean; afterRunning?: boolean; restarted: boolean }[] = [];
const relatedRecoveries: { name: string; restarted: boolean; running: boolean }[] = [];
const lifecycleCommands: { action: string; container: string }[] = [];
const providerReadiness: ProviderReadinessSample[] = [];
const externalDrift: { id: string; name: string; beforeRestartCount: number; afterRestartCount: number; beforeStatus: string; afterStatus: string; changed: boolean; status: 'NOT_ESTABLISHED' }[] = [];
const school = randomUUID(); const classId = randomUUID(); const subjectId = randomUUID(); const yearId = randomUUID(); const groupId = randomUUID();
const actors = { admin: '20000000-0000-4000-8000-000000000001', teacher: '20000000-0000-4000-8000-000000000004', student: '20000000-0000-4000-8000-000000000012' };
process.loadEnvFile(resolve('.env.local'));
await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
const status = JSON.parse(await safeExecute(process.execPath, [cli, 'status', '-o', 'json'])) as LocalStatus;
assertCuevoLocalTarget(status);
const config = parseServerConfig(process.env);
for (const [connection, role] of [[config.databaseUrl, 'cuevo_api'], [config.workerDatabaseUrl, 'cuevo_worker']] as const) {
  const url = connection ? new URL(connection) : null;
  if (!url || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '56322' || url.pathname !== '/postgres' || url.username !== role) throw Error('Outage drill requires restricted local Cuevo runtime credentials.');
}
if (config.apiPort !== 4000 || config.workerPort !== 4001 || config.nodeEnv === 'production' || config.supabaseUrl !== status.API_URL.replace(/\/$/, '')) throw Error('Outage drill requires the documented non-production Cuevo runtime endpoints.');
await mkdir(evidenceDirectory, { recursive: true });
const docker = async (...args: string[]) => safeExecute('docker', args);
const inspectDatabase = async () => {
  const format = '{"Name":{{json .Name}},"Config":{"Image":{{json .Config.Image}}},"NetworkSettings":{"Ports":{{json .HostConfig.PortBindings}},"Networks":{{json .NetworkSettings.Networks}}}}';
  validateOutageDatabaseContainer(JSON.parse(await docker('inspect', '--format', format, 'supabase_db_cuevo')));
};
const providerReady = () => waitForCuevoProviderReady({
  inspect: async remainingMs => {
    const format = '{"Name":{{json .Name}},"Config":{"Image":{{json .Config.Image}}},"NetworkSettings":{"Ports":{{json .HostConfig.PortBindings}},"Networks":{{json .NetworkSettings.Networks}}},"State":{"Running":{{json .State.Running}},"Restarting":{{json .State.Restarting}},"Health":{{if .State.Health}}{"Status":{{json .State.Health.Status}}}{{else}}null{{end}}}}';
    try { return JSON.parse((await execute('docker', ['inspect', '--format', format, 'supabase_db_cuevo'], { timeout: Math.min(5000, remainingMs), maxBuffer: 1024 * 1024 })).stdout); } catch { throw Error('Outage recovery cannot inspect the verified Cuevo database; details withheld.'); }
  },
  readStatus: async remainingMs => { try { const result = await execute(process.execPath, [cli, 'status', '-o', 'json'], { timeout: Math.min(10000, remainingMs), maxBuffer: 1024 * 1024 }); return { exitCode: 0, stdout: result.stdout, stderr: '' }; } catch(error) { const failure = error as {code?: unknown}; return { exitCode: typeof failure.code === 'number' ? failure.code : null, stdout: '', stderr: '' }; } },
  onSample: value => providerReadiness.push(value),
});
const lifecycle = async (action: 'stop' | 'start') => { requireCuevoLifecycleCommand(action, 'supabase_db_cuevo'); await inspectDatabase(); lifecycleCommands.push({ action, container: 'supabase_db_cuevo' }); return action === 'stop' ? docker('stop', '--time', '10', 'supabase_db_cuevo') : docker('start', 'supabase_db_cuevo'); };
const snapshotContainers = async (): Promise<ObservedContainer[]> => {
  const ids = (await docker('ps', '-aq')).split(/\r?\n/).filter(Boolean);
  if (!ids.length) return [];
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"startedAt":{{json .State.StartedAt}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"networks":{{json .NetworkSettings.Networks}},"restarting":{{json .State.Restarting}},"status":{{json .State.Status}},"restartCount":{{json .RestartCount}}}';
  return (await docker('inspect', '--format', format, ...ids)).split(/\r?\n/).filter(Boolean).map(line => { const item = JSON.parse(line) as Omit<ObservedContainer, 'networks'> & { networks: Record<string, unknown> }; return { ...item, networks: Object.keys(item.networks ?? {}) }; });
};
await inspectDatabase();
const beforeSnapshot = await snapshotContainers();
const beforeContainers = beforeSnapshot.filter(item => !isCuevoDependencyContainer(item.name, item.project, item.networks));
const stableForeign = beforeContainers.filter(item => !baselineExternalRestart(item));
const unstableForeign = beforeContainers.filter(baselineExternalRestart);
for (const port of [3000, 4000, 4001]) { let reachable = false; try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(800) }); reachable = true; } catch { /* Required stopped app precondition. */ } if (reachable) throw Error('Stop Cuevo application runtimes before outage verification.'); }
const owner = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
owner.on('error', () => { /* Expected idle pool invalidation during database-only stop. */ });
const runtimeInput = { ...process.env, NODE_ENV: 'development', AI_GENERATION_MODE: 'DISABLED', AI_FIXTURE_ENABLED: 'false', ANALYTICS_FIXTURE_ENABLED: 'false' };
let api: ReturnType<typeof spawnOwnedProcess> | undefined; let worker: ReturnType<typeof spawnOwnedProcess> | undefined;
let databaseStopped = false; let tenantCreated = false; let phase = 'SETUP';
const children: ReturnType<typeof spawnOwnedProcess>[] = [];
let canceled = false;
const cancel = () => { canceled = true; void stopOwnedProcesses(children).catch(() => { /* Finally reports shutdown/cleanup status. */ }); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
const start = (service: 'api' | 'worker') => { const child = spawnOwnedProcess(process.execPath, ['--import', 'tsx', `apps/${service}/src/main.ts`], { env: runtimeEnvironment(service, runtimeInput), stdio: 'ignore' }); child.on('error', () => { /* Sanitized health failure is reported by bounded probes. */ }); children.push(child); return child; };
async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 20000, cleanup = false) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { if (canceled && !cleanup) throw Error('Runtime outage verification canceled.'); if (await predicate()) return; await new Promise(done => setTimeout(done, 200)); } throw Error('Runtime outage recovery deadline exceeded.'); }
async function health(port: number, ready: boolean) { try { const response = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(1500) }); return ready ? response.ok : response.status === 503; } catch { return false; } }
async function stopped(port: number) { try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(800) }); return false; } catch { return true; } }
const tokens: Partial<Record<keyof typeof actors, string>> = {};
async function request(role: keyof typeof actors, path: string, body?: Record<string, unknown>, key = randomUUID()) {
  if (canceled) throw Error('Runtime outage verification canceled.');
  const response = await fetch(`http://127.0.0.1:4000${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, 'X-School-Id': school, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Error(`Synthetic runtime command failed with HTTP ${response.status}.`);
  return response.json() as Promise<Record<string, unknown> & { id: string }>;
}
async function cleanupTenant() {
  if (!tenantCreated) return;
  await owner.query('ROLLBACK'); await owner.query('BEGIN');
  const guard = (await owner.query("select id from app.schools where id=$1 and name='Runtime outage synthetic school'and not exists(select 1 from app.people where school_id=$1 and synthetic is distinct from true)", [school])).rows;
  if (guard.length !== 1) throw Error('Outage cleanup refuses non-synthetic tenant.');
  await owner.query("set local session_replication_role='replica'");
  const events = (await owner.query('select id from internal.outbox_events where school_id=$1', [school])).rows.map(item => item.id as string);
  for (const table of ['community_broadcast_receipts', 'analytics_delivery']) await owner.query(`delete from internal.${table} where event_id=any($1::uuid[])`, [events]);
  const tables = (await owner.query("select namespace.nspname table_schema,relation.relname table_name from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace join pg_attribute column_info on column_info.attrelid=relation.oid and column_info.attname='school_id'and not column_info.attisdropped where namespace.nspname in('app','internal')and relation.relkind='r'order by namespace.nspname,relation.relname")).rows;
  for (const table of tables) { if (!/^[a-z_]+$/.test(table.table_schema) || !/^[a-z_]+$/.test(table.table_name)) throw Error('Unexpected cleanup identifier.'); await owner.query(`delete from "${table.table_schema}"."${table.table_name}"where school_id=$1`, [school]); }
  await owner.query('delete from app.schools where id=$1', [school]); await owner.query('COMMIT');
  if ((await owner.query('select count(*)::integer count from app.schools where id=$1', [school])).rows[0].count !== 0) throw Error('Outage fixture cleanup incomplete.');
}
try {
  const password = (JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
  const identities = (JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
  for (const role of Object.keys(actors) as (keyof typeof actors)[]) { const identity = identities.find(item => item.actorId === actors[role]); if (!identity) throw Error('Verified synthetic actor missing.'); const auth = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const session = await auth.auth.signInWithPassword({ email: identity.email, password }); if (!session.data.session) throw Error('Synthetic runtime sign-in failed.'); tokens[role] = session.data.session.access_token; }
  await owner.query('BEGIN');
  await owner.query("insert into app.schools(id,name,country_code)values($1,'Runtime outage synthetic school','QA')", [school]);
  for (const role of Object.keys(actors) as (keyof typeof actors)[]) { await owner.query("insert into app.memberships(school_id,actor_id,role,effective_from)values($1,$2,$3,now()-interval'1 day')", [school, actors[role], role]); await owner.query('insert into app.people(school_id,actor_id,display_name,synthetic)values($1,$2,$3,true)', [school, actors[role], `Runtime synthetic ${role}`]); }
  for (const code of ['school.context', 'learning', 'assessment', 'learner.state']) await owner.query("insert into app.entitlements(school_id,code,enabled,effective_from)values($1,$2,true,now()-interval'1 day')", [school, code]);
  await owner.query("insert into app.academic_years(school_id,id,name,starts_on,ends_on)values($1,$2,'Outage synthetic year','2026-01-01','2027-12-31')", [school, yearId]);
  await owner.query("insert into app.year_groups(school_id,id,name,ordinal)values($1,$2,'Outage synthetic group',1)", [school, groupId]);
  await owner.query("insert into app.classes(school_id,id,academic_year_id,year_group_id,name)values($1,$2,$3,$4,'Outage synthetic class')", [school, classId, yearId, groupId]);
  await owner.query("insert into app.subjects(school_id,id,name)values($1,$2,'School Custom synthetic subject')", [school, subjectId]);
  await owner.query("insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values($1,$2,$3,$4,now()-interval'1 day')", [school, classId, subjectId, actors.teacher]);
  await owner.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values($1,$2,$3,now()-interval'1 day')", [school, classId, actors.student]);
  await owner.query('insert into app.learner_state_policies(school_id,development_window_days,version,approved_by)values($1,14,1,$2)', [school, actors.admin]);
  await owner.query('COMMIT'); tenantCreated = true;
  phase = 'API_START';
  api = start('api'); await waitUntil(() => health(4000, true)); await request('student', '/v1/me');
  checks.push({ name: 'real_auth_restricted_api_ready', passed: true });
  const course = await request('teacher', '/v1/courses', { classId, subjectId, title: 'Synthetic runtime recovery practice', description: 'School Custom outage verification.' });
  const unit = await request('teacher', `/v1/courses/${course.id}/units`, { title: 'Checking steps', sequence: 1 });
  const lesson = await request('teacher', `/v1/units/${unit.id}/lessons`, { title: 'Explain the check', sequence: 1, body: 'Synthetic teacher-authored practice.' });
  const first = await request('teacher', `/v1/lessons/${lesson.id}/activities`, { title: 'Initial practice', kind: 'practice', instructions: 'Explain one checking step.', sequence: 1 });
  const second = await request('teacher', `/v1/lessons/${lesson.id}/activities`, { title: 'Queued practice', kind: 'practice', instructions: 'Explain the next checking step.', sequence: 2 });
  await request('teacher', `/v1/courses/${course.id}/publish`, {});
  await request('student', `/v1/activities/${first.id}/complete`, {});
  phase = 'WORKER_INITIAL_PROJECTION';
  worker = start('worker'); await waitUntil(() => health(4001, true));
  await waitUntil(async () => (await owner.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and state<>'COMPLETED'", [school])).rows[0].count === 0);
  await stopOwnedProcesses([worker]); await waitUntil(() => stopped(4001));
  const key = randomUUID(); const path = `/v1/activities/${second.id}/complete`; const receipt = await request('student', path, {}, key);
  const event = (await owner.query("select id,state from internal.outbox_events where school_id=$1 and entity_id=$2 and type='activity.complete'", [school, receipt.id])).rows[0];
  if (!event || event.state !== 'PENDING') throw Error('Committed completion was not queued while worker stopped.');
  checks.push({ name: 'worker_stopped_committed_completion_queued', passed: true });
  phase = 'API_RESTART_REPLAY';
  await stopOwnedProcesses([api]); await waitUntil(() => stopped(4000));
  const apiRestartStarted = Date.now(); api = start('api'); await waitUntil(() => health(4000, true));
  requireOriginalReceipt(receipt, await request('student', path, {}, key));
  if ((await owner.query('select count(*)::integer count from app.activity_completions where school_id=$1 and activity_id=$2 and learner_id=$3', [school, second.id, actors.student])).rows[0].count !== 1) throw Error('API restart replay duplicated completion.');
  checks.push({ name: 'api_restart_original_key_single_receipt', passed: true, durationMs: Date.now() - apiRestartStarted });
  phase = 'WORKER_RESTART_PROJECTION';
  const workerRestartStarted = Date.now(); worker = start('worker'); await waitUntil(() => health(4001, true));
  await waitUntil(async () => (await owner.query("select count(*)::integer count from internal.processed_events where school_id=$1 and event_id=$2", [school, event.id])).rows[0].count === 1);
  const projected = learnerStateSchema.parse(await request('student', `/v1/learners/${actors.student}/state`));
  if (projected.development.practice.count !== 2 || !projected.sourceEventIds.includes(event.id)) throw Error('Worker restart failed exact source projection.');
  checks.push({ name: 'worker_restart_exact_event_projection', passed: true, durationMs: Date.now() - workerRestartStarted });
  phase = 'DATABASE_OUTAGE';
  await inspectDatabase(); databaseStopped = true; await lifecycle('stop');
  await waitUntil(async () => await health(4000, false) && await health(4001, false), 20000);
  checks.push({ name: 'database_only_outage_readiness_denied', passed: true });
  phase = 'DATABASE_RESTART_REPLAY';
  const databaseRestartStarted = Date.now(); await lifecycle('start'); databaseStopped = false;
  await waitUntil(async () => await health(4000, true) && await health(4001, true), 45000);
  phase = 'DATABASE_NATIVE_PROVIDER_READY';
  await providerReady();
  checks.push({ name: 'database_native_provider_health_and_status_recovered', passed: true });
  phase = 'DATABASE_RECOVERED_RECEIPT';
  requireOriginalReceipt(receipt, await request('student', path, {}, key));
  phase = 'DATABASE_RECOVERED_PROJECTION';
  const recovered = learnerStateSchema.parse(await request('student', `/v1/learners/${actors.student}/state`));
  if (recovered.development.practice.count !== 2 || !recovered.sourceEventIds.includes(event.id)) throw Error('Database recovery changed source projection.');
  phase = 'DATABASE_RECOVERED_SINGULARITY';
  const singular = (await owner.query("select(select count(*)from app.activity_completions where school_id=$1 and activity_id=$2 and learner_id=$3)::integer completions,(select count(*)from internal.outbox_events where school_id=$1 and entity_id=$4 and type='activity.complete')::integer events,(select count(*)from internal.processed_events where school_id=$1 and event_id=$5)::integer processed", [school, second.id, actors.student, receipt.id, event.id])).rows[0];
  if (singular.completions !== 1 || singular.events !== 1 || singular.processed !== 1) throw Error('Restart replay duplicated a source, event or processed receipt.');
  phase = 'UNRELATED_CONTAINER_PRESERVATION';
  const afterSnapshot = await snapshotContainers();
  const afterContainers = afterSnapshot.filter(item => !isCuevoDependencyContainer(item.name, item.project, item.networks));
  if (!sameContainerIdentities(beforeContainers, afterContainers) || !sameUnrelatedContainers(stableForeign, afterContainers)) {
    const current = new Map(afterContainers.map(item => [item.id, item]));
    for (const item of stableForeign) { const after = current.get(item.id); if (!after || after.running !== item.running || after.startedAt !== item.startedAt) preservationChanges.push({ id: item.id, beforeRunning: item.running, afterRunning: after?.running, restarted: after?.startedAt !== item.startedAt }); }
    throw Error('Outage drill changed an unrelated container.');
  }
  for (const prior of unstableForeign) { const current = afterContainers.find(item => item.id === prior.id)!; externalDrift.push({ id: prior.id, name: prior.name, beforeRestartCount: prior.restartCount, afterRestartCount: current.restartCount, beforeStatus: prior.status, afterStatus: current.status, changed: prior.restartCount !== current.restartCount || prior.startedAt !== current.startedAt || prior.running !== current.running, status: 'NOT_ESTABLISHED' }); }
  for (const prior of beforeSnapshot.filter(item => item.name !== '/supabase_db_cuevo' && isCuevoDependencyContainer(item.name, item.project, item.networks))) { const current = afterSnapshot.find(item => item.id === prior.id); if (!current || current.running !== prior.running) throw Error('A related Cuevo dependency failed to recover.'); if (current.startedAt !== prior.startedAt) relatedRecoveries.push({ name: current.name, restarted: true, running: current.running }); }
  checks.push({ name: 'database_restart_current_auth_and_receipt_recovered', passed: true, durationMs: Date.now() - databaseRestartStarted }, { name: 'restart_completion_event_processed_receipt_singular', passed: true }, { name: 'stable_unrelated_containers_preserved', passed: true }, { name: 'lifecycle_commands_target_validated_cuevo_database_only', passed: lifecycleCommands.every(command => command.container === 'supabase_db_cuevo' && ['stop', 'start'].includes(command.action)) });
} catch { checks.push({ name: `outage_drill_${phase.toLowerCase()}`, passed: false }); process.exitCode = 1; }
finally {
  let clean = true;
  try { if (databaseStopped) { await lifecycle('start'); await waitUntil(async () => { try { return (await owner.query('select true ready')).rows[0]?.ready === true; } catch { return false; } }, 45000, true); await providerReady(); } } catch { clean = false; }
  try { await stopOwnedProcesses(children); } catch { clean = false; }
  try { await owner.query('ROLLBACK'); await cleanupTenant(); } catch { await owner.query('ROLLBACK').catch(() => undefined); clean = false; }
  await owner.end();
  checks.push({ name: 'owned_runtime_stopped_synthetic_tenant_cleaned', passed: clean });
  await writeFile(resolve(evidenceDirectory, 'evidence.json'), JSON.stringify({ status: checks.length > 1 && checks.every(check => check.passed) ? 'VERIFIED' : 'FAILED', checks, providerReadiness, preservationChanges, relatedRecoveries, lifecycleCommands, externalDrift, stableUnrelatedContainerCount: stableForeign.length, baselineRestartingUnrelatedCount: unstableForeign.length, unrelatedContainerPreservation: unstableForeign.length ? 'PARTIAL_EXTERNAL_STATE_NOT_ESTABLISHED' : 'VERIFIED', liveModelCalls: 0, scope: 'LOCAL_SYNTHETIC_REAL_HTTP_RESTART_OUTAGE' }, null, 2) + '\n');
  if (!clean) process.exitCode = 1;
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
process.stdout.write(`Runtime outage verification ${process.exitCode ? 'FAILED' : 'VERIFIED'}; sanitized evidence: ${evidenceDirectory}\n`);
