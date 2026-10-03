import { execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
import { runtimeEnvironment } from '../runtime/environment';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';
import { sameContainerIdentities, sameUnrelatedContainers, validateOutageDatabaseContainer, type ObservedContainer } from './runtime-outage-rules';

const school = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000004';
const endpoint = 'http://supabase_kong_cuevo:8000/functions/v1/cuevo-worker';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function requireEdgeArtifactSource(path: string) {
  if (path.includes('..') || (!path.startsWith('apps/worker/src/') && path !== 'packages/contracts/src/analytics.ts' && path !== 'packages/config/src/synthetic-runtime.ts')) throw Error('Edge source is outside reviewed worker and exact portable ownership.');
}
export function requireNoAnalyticsActivation(value: unknown) {
  if (value !== 0) throw Error('Pause analytics activation before exclusive deterministic Edge verification.');
}
type DispatchControl = { enabled: boolean; state: string; wake_id: string | null; endpoint: string | null; vault_secret_name: string | null; allow_local: boolean };
type EventRecord = { id: string; school_id: string; actor_id: string; type: string; entity_type: string; entity_id: string; version: number; metadata: unknown; deduplication_key: string };
type Check = { name: string; passed: boolean; durationMs?: number; count?: number };

export function assertEdgeWorkerLocal(status: Pick<LocalStatus, 'API_URL' | 'DB_URL'>, workerConnection: string | undefined) {
  assertCuevoLocalTarget(status);
  const worker = workerConnection ? new URL(workerConnection) : null;
  if (!worker || !['postgres:', 'postgresql:'].includes(worker.protocol) || !['localhost', '127.0.0.1'].includes(worker.hostname) || worker.port !== '56322' || worker.pathname !== '/postgres' || worker.username !== 'cuevo_worker' || !worker.password || worker.search || worker.hash) throw Error('Edge verification requires the restricted local Cuevo worker connection.');
  return worker;
}
export function assertIdleWorkerDispatch(value: unknown) {
  const control = value as DispatchControl;
  if (!control || control.enabled !== false || control.state !== 'DISABLED' || control.wake_id !== null || control.endpoint !== null || control.vault_secret_name !== null || control.allow_local !== false) throw Error('Pause and clear existing operator dispatch before exclusive Edge verification.');
  return control;
}
export function assertStartedEdgeRuntime(before: ObservedContainer | undefined, current: ObservedContainer | undefined) {
  if (before?.running || !current || current.name !== '/supabase_edge_runtime_cuevo' || current.project !== 'cuevo' || !current.networks.includes('cuevo-local') || !current.running) throw Error('Only an owned start from a stopped Cuevo Edge baseline is admissible.');
  return current;
}
export function edgeRuntimeConnected(current: ObservedContainer | undefined) {
  if (!current || !current.running || current.networks.length === 0) return false;
  if (current.name !== '/supabase_edge_runtime_cuevo' || current.project !== 'cuevo' || !current.networks.includes('cuevo-local')) throw Error('Connected Edge runtime belongs to another execution target.');
  return true;
}
export function requireOwnedGatewayReload(before: ObservedContainer | undefined, current: ObservedContainer | undefined) {
  if (!before || !current || before.name !== '/supabase_kong_cuevo' || current.name !== before.name || current.id !== before.id || current.project !== 'cuevo' || !current.networks.includes('cuevo-local') || !before.running || !current.running || current.startedAt !== before.startedAt) throw Error('Gateway reload requires the unchanged active local Cuevo gateway.');
  return ['exec', 'supabase_kong_cuevo', 'kong', 'reload', '--nginx-conf', '/home/kong/custom_nginx.template'];
}
export function assertOwnedWorkerEvents(rows: EventRecord[], ownedIds: string[], prefix: string) {
  if (!/^edge-verification:[a-f0-9-]{36}:$/.test(prefix) || ownedIds.some(id => !uuid.test(id)) || new Set(ownedIds).size !== ownedIds.length) throw Error('Exact generated verification event ownership required.');
  if (rows.some(row => !ownedIds.includes(row.id) || row.school_id !== school || row.actor_id !== actor || row.type !== 'school.updated' || row.entity_type !== 'school' || row.entity_id !== school || row.version !== 1 || JSON.stringify(row.metadata) !== '{}' || row.deduplication_key !== prefix + row.id)) throw Error('Cleanup refuses non-verification source events.');
}
export function assertOpaqueWake(value: unknown) {
  const body = value as { version?: unknown; wakeId?: unknown };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join('|') !== 'version|wakeId' || body.version !== 1 || typeof body.wakeId !== 'string' || !uuid.test(body.wakeId)) throw Error('Worker network body must contain only the opaque generation.');
}
export function signedWakeHeaders(key: string, wakeId: string, seconds: number) {
  if (!/^[a-f0-9]{64}$/.test(key) || !uuid.test(wakeId) || !Number.isSafeInteger(seconds) || seconds <= 0) throw Error('Bounded purpose signature inputs required.');
  return { 'Content-Type': 'application/json', 'X-Cuevo-Wake-Time': String(seconds), 'X-Cuevo-Wake-Signature': createHmac('sha256', key).update(`cuevo.worker.wake.v1\n${seconds}\n${wakeId}`).digest('hex') };
}
export const ownedCronUnscheduleSql = 'select cron.unschedule($1::bigint)as removed';
export function requireCronRemoval(value: unknown) { if (value !== true) throw Error('Owned recovery schedule removal was not confirmed.'); }
type VerificationFailureCode = 'DOCKER_INVENTORY_RACE' | 'COMMAND_UNAVAILABLE' | 'OWNED_SERVER_EXITED' | 'VERIFICATION_CANCELLED' | 'WAIT_EXPIRED';
const verificationFailureCodes: VerificationFailureCode[] = ['DOCKER_INVENTORY_RACE', 'COMMAND_UNAVAILABLE', 'OWNED_SERVER_EXITED', 'VERIFICATION_CANCELLED', 'WAIT_EXPIRED'];
export function edgeVerificationFailure(code: VerificationFailureCode) { return Object.assign(Error('Guarded Edge verification operation unavailable.'), { code }); }
export function safeEdgeFailureCode(error: unknown) {
  const value = error as { code?: unknown; name?: unknown } | null;
  if (typeof value?.code === 'string' && verificationFailureCodes.includes(value.code as VerificationFailureCode)) return value.code;
  if (typeof value?.code === 'string' && /^[A-Z0-9]{5}$/.test(value.code)) return 'SQL_' + value.code;
  if (value?.name === 'TypeError') return 'TYPE_ERROR';
  if (value?.name === 'AbortError' || value?.name === 'TimeoutError') return 'TRANSPORT_TIMEOUT';
  return 'VERIFICATION_UNAVAILABLE';
}
export async function readEdgeInventory<T>(read: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await read(); }
    catch (error) { if (safeEdgeFailureCode(error) !== 'DOCKER_INVENTORY_RACE' || attempt === 2) throw error; await new Promise(done => setTimeout(done, 50)); }
  }
  throw edgeVerificationFailure('DOCKER_INVENTORY_RACE');
}
export function edgeWorkerEvidence(checks: Check[], artifactSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(artifactSha256) || checks.some(check => !/^[a-z][a-z0-9-]{0,79}$/.test(check.name) || typeof check.passed !== 'boolean' || check.durationMs !== undefined && (!Number.isFinite(check.durationMs) || check.durationMs < 0) || check.count !== undefined && (!Number.isInteger(check.count) || check.count < 0))) throw Error('Sanitized Edge evidence fields required.');
  return { status: checks.length > 0 && checks.every(check => check.passed) ? 'VERIFIED' : 'FAILED', execution: 'LOCAL_SYNTHETIC_SUPABASE_EDGE', artifactSha256, checks: checks.map(({ name, passed, durationMs, count }) => ({ name, passed, ...(durationMs === undefined ? {} : { durationMs }), ...(count === undefined ? {} : { count }) })), hostedAcceptance: false, latencyGuarantee: false };
}

async function main() {
  process.loadEnvFile(resolve('.env.local'));
  await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
  const execute = promisify(execFile);
  const safeExecute = async (command: string, args: string[], failureCode: VerificationFailureCode = 'COMMAND_UNAVAILABLE') => { try { return (await execute(command, args, { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout; } catch { throw edgeVerificationFailure(failureCode); } };
  const cli = resolve('node_modules/supabase/dist/supabase.js');
  const status = JSON.parse(await safeExecute(process.execPath, [cli, 'status', '-o', 'json'])) as LocalStatus;
  const workerUrl = assertEdgeWorkerLocal(status, process.env.WORKER_DATABASE_URL);
  for (const port of [3000, 4000, 4001]) { let reachable = false; try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(800) }); reachable = true; } catch { /* Stopped application precondition. */ } if (reachable) throw Error('Stop Cuevo applications before exclusive Edge verification.'); }
  const publicEndpoint = status.API_URL.replace(/\/$/, '') + '/functions/v1/cuevo-worker';
  try { const existing = await fetch(publicEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, wakeId: randomUUID() }), signal: AbortSignal.timeout(1500) }); if ([200, 202, 400, 401, 405, 503].includes(existing.status)) throw Error('An existing Edge worker is active; stop it before verification.'); } catch (error) { if (error instanceof Error && error.message.startsWith('An existing')) throw error; }
  const docker = (...args: string[]) => safeExecute('docker', args);
  const databaseFormat = '{"Name":{{json .Name}},"Config":{"Image":{{json .Config.Image}}},"NetworkSettings":{"Ports":{{json .HostConfig.PortBindings}},"Networks":{{json .NetworkSettings.Networks}}}}';
  validateOutageDatabaseContainer(JSON.parse(await docker('inspect', '--format', databaseFormat, 'supabase_db_cuevo')));
  const containers = async (): Promise<ObservedContainer[]> => readEdgeInventory(async () => {
    const ids = (await docker('ps', '-aq')).split(/\r?\n/).filter(Boolean); if (!ids.length) return [];
    const format = '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"startedAt":{{json .State.StartedAt}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"networks":{{json .NetworkSettings.Networks}},"restarting":{{json .State.Restarting}},"status":{{json .State.Status}},"restartCount":{{json .RestartCount}}}';
    return (await safeExecute('docker', ['inspect', '--format', format, ...ids], 'DOCKER_INVENTORY_RACE')).split(/\r?\n/).filter(Boolean).map(line => { const row = JSON.parse(line) as Omit<ObservedContainer, 'networks'> & { networks: Record<string, unknown> }; return { ...row, networks: Object.keys(row.networks ?? {}) }; });
  });
  const beforeContainers = await containers();
  const baselineGateway = beforeContainers.find(row => row.name === '/supabase_kong_cuevo');
  const baselineEdge = beforeContainers.find(row => row.name === '/supabase_edge_runtime_cuevo');
  if (baselineEdge?.running) throw Error('Existing Cuevo Edge runtime must be stopped before verification.');
  const unrelated = beforeContainers.filter(row => row.name !== '/supabase_edge_runtime_cuevo');
  const artifactPath = resolve('.local/edge-artifacts/cuevo-worker/artifact.json');
  const artifactBytes = await readFile(artifactPath); const artifact = JSON.parse(artifactBytes.toString()) as { service: string; runtime: string; files: { path: string; sha256: string }[]; sources: { path: string; sha256: string }[] };
  if (artifact.service !== 'cuevo-worker' || artifact.runtime !== 'deno' || !Array.isArray(artifact.files) || !Array.isArray(artifact.sources)) throw Error('Build the reviewed Edge artifact before verification.');
  if (artifact.files.map(file => file.path).sort().join('|') !== 'deno.json|deno.lock|index.ts') throw Error('Edge artifact has an unexpected emitted file set.');
  if ((await lstat(resolve('.local/edge-artifacts'))).isSymbolicLink() || (await lstat(resolve('.local/edge-artifacts/cuevo-worker'))).isSymbolicLink()) throw Error('Edge artifact path cannot be redirected.');
  for (const file of artifact.files) { const path = resolve('.local/edge-artifacts/cuevo-worker', file.path); if (!['index.ts', 'deno.json', 'deno.lock'].includes(file.path) || (await lstat(path)).isSymbolicLink() || createHash('sha256').update(await readFile(path)).digest('hex') !== file.sha256) throw Error('Edge artifact bytes differ from their captured manifest.'); }
  for (const source of artifact.sources) { requireEdgeArtifactSource(source.path); if (createHash('sha256').update(await readFile(resolve(source.path))).digest('hex') !== source.sha256) throw Error('Edge artifact source is stale or outside its owner.'); }
  const runId = randomUUID(); const prefix = `edge-verification:${runId}:`; const ids: string[] = [];
  const directory = resolve('.local/verification/edge-worker', runId); await mkdir(directory, { recursive: true });
  const functionsDirectory = resolve('supabase/functions'); let functionsExisted = false; try { functionsExisted = (await lstat(functionsDirectory)).isDirectory(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const envFile = resolve(directory, 'worker.env'); const purposeKey = randomBytes(32).toString('hex'); const secretName = 'edge-verification-' + runId; const jobName = 'cuevo-edge-verification-' + runId;
  const owner = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  owner.on('error', () => { /* Sanitized phase failure is retained without connection values. */ });
  const worker = new Pool({ connectionString: workerUrl.toString(), max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  worker.on('error', () => { /* Runtime role failure is reported without credentials. */ });
  let client: PoolClient | undefined; let server: ChildProcess | undefined; let ownedEdge: ObservedContainer | undefined; let baselineControl: Record<string, unknown> | undefined; let secretId: string | undefined; let jobId: number | undefined; let configured = false; let canceled = false; let phase = 'SETUP';
  const failures: { phase: string; code: string }[] = [];
  const checks: Check[] = []; const generationIds = new Set<string>(); const probeRequestIds: string[] = [];
  const cancel = () => { canceled = true; };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  const check = (name: string, passed: boolean, detail: Omit<Check, 'name' | 'passed'> = {}) => { checks.push({ name, passed, ...detail }); if (!passed) throw Error('Edge verification check failed: ' + name); };
  const waitFor = async (predicate: () => Promise<boolean>, timeoutMs: number) => { const started = Date.now(); while (Date.now() - started < timeoutMs) { if (canceled) throw edgeVerificationFailure('VERIFICATION_CANCELLED'); if (server?.exitCode !== null && server?.exitCode !== undefined) throw edgeVerificationFailure('OWNED_SERVER_EXITED'); if (await predicate()) return Date.now() - started; await new Promise(done => setTimeout(done, 250)); } throw edgeVerificationFailure('WAIT_EXPIRED'); };
  const control = async () => (await client!.query('select *from internal.worker_dispatch_control where singleton')).rows[0] as Record<string, unknown>;
  const enqueue = async (count: number) => {
    const batch = Array.from({ length: count }, () => randomUUID()); ids.push(...batch);
    await client!.query('begin');
    try {
      await client!.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)select $1,id,$2,'school.updated','school',$1,1,'{}'::jsonb,$3||id::text from unnest($4::uuid[])id", [school, actor, prefix, batch]);
      const issued = await control();
      if (typeof issued.wake_id !== 'string' || issued.state !== 'REQUESTED') throw Error('Committed source requires an exact new wake generation.');
      generationIds.add(issued.wake_id);
      const queued = (await client!.query("select headers,convert_from(body,'UTF8')::jsonb as body from net.http_request_queue where id=$1", [issued.network_request_id])).rows[0];
      assertOpaqueWake(queued?.body);
      if (queued.body.wakeId !== issued.wake_id || JSON.stringify(queued.headers).includes(purposeKey) || JSON.stringify(queued.headers).includes('Bearer ') || !/^[a-f0-9]{64}$/.test(queued.headers?.['X-Cuevo-Wake-Signature']) || !/^[1-9][0-9]{0,11}$/.test(queued.headers?.['X-Cuevo-Wake-Time'])) throw Error('Wake transport contains an invalid signature or reusable credential.');
      await client!.query('commit'); return { batch, issued };
    } catch { await client!.query('rollback'); throw Error('Owned committed enqueue proof failed.'); }
  };
  const completed = async (batch: string[]) => (await client!.query("select count(*)::integer count from internal.outbox_events event where event.id=any($1::uuid[])and event.state='COMPLETED'and exists(select 1 from internal.processed_events processed where processed.event_id=event.id and processed.school_id=event.school_id)", [batch])).rows[0]?.count === batch.length;
  const readyGateway = async (name: string) => {
    const current = (await containers()).find(row => row.name === '/supabase_kong_cuevo');
    await docker(...requireOwnedGatewayReload(baselineGateway, current));
    check(name + '-local-gateway-reload', true);
    const requestId = (await client!.query("select net.http_post(url:=$1,headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('version',1,'wakeId',$2::uuid),timeout_milliseconds:=5000)as id", [endpoint, randomUUID()])).rows[0]?.id;
    const probe = String(requestId); if (!/^[1-9][0-9]*$/.test(probe)) throw Error('Owned internal route probe identity unavailable.');
    probeRequestIds.push(probe);
    await waitFor(async () => (await client!.query('select status_code from net._http_response where id=$1::bigint', [probe])).rows[0]?.status_code === 401, 15000);
    check(name + '-internal-gateway-auth-ready', true);
  };
  try {
    client = await owner.connect();
    requireNoAnalyticsActivation((await client.query('select count(*)::integer count from internal.posthog_school_activation where enabled')).rows[0]?.count);
    if ((await client.query("select pg_try_advisory_lock(hashtextextended('cuevo-exclusive-edge-verification',0))as locked")).rows[0]?.locked !== true) throw Error('Another Edge verification owns the local operation.');
    baselineControl = await control(); assertIdleWorkerDispatch(baselineControl);
    check('transport-private', (await client.query('select internal.worker_transport_private()as private')).rows[0]?.private === true);
    check('restricted-worker-session', (await worker.query('select internal.worker_health()as health')).rows[0]?.health?.ready === true);
    check('reference-source', (await client.query("select exists(select 1 from app.schools school join app.memberships membership on membership.school_id=school.id join app.people person on person.school_id=membership.school_id and person.actor_id=membership.actor_id where school.id=$1 and school.status='active'and membership.actor_id=$2 and membership.role='teacher'and membership.status='active'and person.synthetic is true)as valid", [school, actor])).rows[0]?.valid === true);
    check('empty-due-queue', (await client.query("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING')")).rows[0]?.count === 0);
    await client.query('create extension if not exists pg_cron');
    check('no-active-recovery-owner', (await client.query("select count(*)::integer count from cron.job where active and command like'%request_worker_wake%'")).rows[0]?.count === 0);
    const internalWorker = new URL(workerUrl); internalWorker.hostname = 'db.supabase.internal'; internalWorker.port = '5432';
    await writeFile(envFile, `CUEVO_WORKER_WAKE_KEY=${purposeKey}\nCUEVO_WORKER_DATABASE_URL=${internalWorker}\nCUEVO_WORKER_EXECUTION_MODE=local-synthetic\n`, { mode: 0o600, flag: 'wx' });
    const childEnvironment = runtimeEnvironment('worker', process.env); delete childEnvironment.WORKER_DATABASE_URL; delete childEnvironment.ANALYTICS_FIXTURE_ENABLED;
    server = spawnOwnedProcess(process.execPath, [cli, 'functions', 'serve', 'cuevo-worker', '--env-file=' + envFile, '--network-id=cuevo-local'], { cwd: resolve('.'), env: childEnvironment, stdio: 'ignore' });
    server.on('error', () => { canceled = true; });
    phase = 'AUTH';
    await waitFor(async () => { try { const response = await fetch(publicEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, wakeId: randomUUID() }), signal: AbortSignal.timeout(1500) }); return response.status === 401; } catch { return false; } }, 30000);
    await waitFor(async () => { const current = (await containers()).find(row => row.name === '/supabase_edge_runtime_cuevo'); if (!edgeRuntimeConnected(current)) return false; ownedEdge = assertStartedEdgeRuntime(baselineEdge, current); return true; }, 30000);
    check('owned-edge-runtime', true);
    phase = 'GATEWAY_INITIAL';
    await readyGateway('initial');
    phase = 'AUTH';
    const probeId = randomUUID();
    const invalid = await fetch(publicEndpoint, { method: 'POST', headers: signedWakeHeaders(randomBytes(32).toString('hex'), probeId, Math.floor(Date.now() / 1000)), body: JSON.stringify({ version: 1, wakeId: probeId }), signal: AbortSignal.timeout(5000) }); check('wrong-signature-denied', invalid.status === 401);
    const extra = await fetch(publicEndpoint, { method: 'POST', headers: signedWakeHeaders(purposeKey, probeId, Math.floor(Date.now() / 1000)), body: JSON.stringify({ version: 1, wakeId: probeId, learnerId: actor }), signal: AbortSignal.timeout(5000) }); check('extra-scope-denied', extra.status === 400);
    check('auth-denial-preserves-control', JSON.stringify(await control()) === JSON.stringify(baselineControl));
    await client.query('begin');
    try { const created = (await client.query('select vault.create_secret($1,$2,$3)as id', [purposeKey, secretName, 'Temporary owned local worker verification purpose key.'])).rows[0]?.id; if (typeof created !== 'string' || !uuid.test(created)) throw Error('Exact Vault identity unavailable.'); secretId = created; await client.query("select set_config('app.runtime_env','local',true)"); await client.query('select internal.configure_worker_dispatch(true,$1,$2,true)', [endpoint, secretName]); await client.query('commit'); configured = true; } catch { await client.query('rollback'); secretId = undefined; throw Error('Private local dispatch setup failed; secret values withheld.'); }
    phase = 'COMMITTED_WAKE';
    const { batch: first, issued: firstControl } = await enqueue(1);
    check('committed-generation-requested', firstControl.state === 'REQUESTED' && typeof firstControl.wake_id === 'string');
    check('opaque-signed-queue-no-reusable-key', true);
    const firstDuration = await waitFor(async () => await completed(first) && (await control()).state === 'IDLE', 30000); check('signed-committed-source-processed', true, { durationMs: firstDuration, count: 1 });
    const replay = await fetch(publicEndpoint, { method: 'POST', headers: signedWakeHeaders(purposeKey, String(firstControl.wake_id), Math.floor(Date.now() / 1000)), body: JSON.stringify({ version: 1, wakeId: firstControl.wake_id }), signal: AbortSignal.timeout(5000) }); check('consumed-generation-not-admitted', replay.status === 202 && (await replay.json()).status === 'NOT_ADMITTED');
    phase = 'BURST';
    const { batch: burst, issued: burstControl } = await enqueue(25);
    const burstDuration = await waitFor(async () => { const current = await control(); if (typeof current.wake_id === 'string') generationIds.add(current.wake_id); return await completed(burst) && current.state === 'IDLE'; }, 60000);
    check('burst-all-sources-processed', true, { durationMs: burstDuration, count: 25 });
    let burstReceipts: { status_code: number; receipt: { status?: string; processed?: number } }[] = [];
    await waitFor(async () => { burstReceipts = (await client!.query("select status_code,content::jsonb as receipt from net._http_response where id>=$1 order by id", [burstControl.network_request_id])).rows.filter(row => row.status_code === 200 && row.receipt?.status === 'COMPLETED' && Number.isInteger(row.receipt?.processed)); return burstReceipts.reduce((total, row) => total + Number(row.receipt.processed), 0) === 25; }, 10000);
    check('burst-coalesced-bounded-waves', burstReceipts.length > 0 && burstReceipts.length < 25 && burstReceipts.reduce((total, row) => total + Number(row.receipt.processed), 0) === 25 && burstReceipts.every(row => Number(row.receipt.processed) >= 1 && Number(row.receipt.processed) <= 10), { count: burstReceipts.length });
    phase = 'ROLLBACK';
    const rollbackId = randomUUID(); const rollbackBaseline = await control();
    await client.query('begin'); try { ids.push(rollbackId); await client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key)values($1,$2,$3,'school.updated','school',$1,1,'{}',$4)", [school, rollbackId, actor, prefix + rollbackId]); await client.query('rollback'); } catch { await client.query('rollback'); throw Error('Owned rollback verification failed.'); }
    check('rollback-no-source-no-generation', (await client.query('select count(*)::integer count from internal.outbox_events where id=$1', [rollbackId])).rows[0]?.count === 0 && JSON.stringify(await control()) === JSON.stringify(rollbackBaseline));
    phase = 'LOST_WAKE';
    await stopOwnedProcesses([server]); server = undefined;
    const stoppedEdge = (await containers()).find(row => row.name === '/supabase_edge_runtime_cuevo');
    if (stoppedEdge?.running) { if (!ownedEdge || stoppedEdge.id !== ownedEdge.id || stoppedEdge.project !== 'cuevo' || !stoppedEdge.networks.includes('cuevo-local')) throw Error('Lost-wake proof cannot stop another Edge runtime.'); await docker('stop', '--time', '10', stoppedEdge.id); }
    const { batch: lost, issued: lostControl } = await enqueue(1);
    check('lost-wake-retains-source', lostControl.state === 'REQUESTED' && !await completed(lost));
    phase = 'LOST_HTTP';
    await waitFor(async () => { const response = (await client!.query('select status_code,timed_out,error_msg is not null as errored from net._http_response where id=$1', [lostControl.network_request_id])).rows[0]; return Boolean(response && (response.timed_out === true || response.errored === true || response.status_code !== 200)); }, 35000);
    await client.query("update internal.worker_dispatch_control set lease_expires_at=clock_timestamp()-interval'1 second'where singleton and wake_id=$1", [lostControl.wake_id]);
    phase = 'RESTART';
    server = spawnOwnedProcess(process.execPath, [cli, 'functions', 'serve', 'cuevo-worker', '--env-file=' + envFile, '--network-id=cuevo-local'], { cwd: resolve('.'), env: childEnvironment, stdio: 'ignore' }); server.on('error', () => { canceled = true; });
    await waitFor(async () => { const current = (await containers()).find(row => row.name === '/supabase_edge_runtime_cuevo'); if (!edgeRuntimeConnected(current)) return false; ownedEdge = assertStartedEdgeRuntime(stoppedEdge ? { ...stoppedEdge, running: false } : undefined, current); return true; }, 30000);
    await waitFor(async () => { try { const response = await fetch(publicEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, wakeId: randomUUID() }), signal: AbortSignal.timeout(1500) }); return response.status === 401; } catch { return false; } }, 30000);
    phase = 'GATEWAY_RELOAD';
    await readyGateway('restart');
    phase = 'RECOVERY';
    await client.query('begin'); try { jobId = Number((await client.query("select cron.schedule($1,'* * * * *','select internal.request_worker_wake();')as id", [jobName])).rows[0]?.id); await client.query('commit'); } catch { await client.query('rollback'); throw Error('Owned recovery schedule could not be created.'); }
    const recoveryDuration = await waitFor(async () => { const current = await control(); if (typeof current.wake_id === 'string') generationIds.add(current.wake_id); return await completed(lost) && current.state === 'IDLE'; }, 80000);
    check('actual-cron-lost-wake-recovery', true, { durationMs: recoveryDuration, count: 1 });
    await waitFor(async () => (await client!.query("select exists(select 1 from cron.job_run_details where jobid=$1 and status='succeeded')as passed", [jobId])).rows[0]?.passed === true, 5000);
    check('actual-cron-success-receipt', true);
    check('lost-wake-recovery-new-generation', (await client.query('select last_requested_at>$1::timestamptz as changed from internal.worker_dispatch_control where singleton', [lostControl.last_requested_at])).rows[0]?.changed === true);
    check('old-generation-denied-after-recovery', (await worker.query('select internal.begin_worker_wake($1)as admitted', [lostControl.wake_id])).rows[0]?.admitted === false);
    phase = 'PRIVACY';
    check('transport-still-private', (await client.query('select internal.worker_transport_private()as private')).rows[0]?.private === true);
    const health = (await worker.query('select internal.worker_dispatch_health()as health')).rows[0]?.health;
    check('health-private-and-idle', health?.ready === true && health.transportPrivate === true && health.state === 'IDLE' && !JSON.stringify(health).includes(purposeKey) && !JSON.stringify(health).includes(secretName));
  } catch (error) { checks.push({ name: 'phase-' + phase.toLowerCase().replaceAll('_', '-'), passed: false }); failures.push({ phase, code: safeEdgeFailureCode(error) }); }
  finally {
    phase = 'RESTORE';
    let clean = true;
    const cleanup = async (name: string, operation: () => Promise<unknown>) => { try { await operation(); } catch (error) { clean = false; failures.push({ phase: 'RESTORE_' + name, code: safeEdgeFailureCode(error) }); } };
    if (client && configured) await cleanup('DISPATCH_PAUSE', async () => {
      await client!.query('begin'); try { const current = await control(); if (current.vault_secret_name !== secretName || current.endpoint !== endpoint) throw Error('Foreign operator dispatch change detected.'); await client!.query('select internal.configure_worker_dispatch(false,null,null,false)'); await client!.query('commit'); } catch { await client!.query('rollback'); throw Error('Owned dispatch pause requires review.'); }
    });
    if (client && jobId !== undefined) await cleanup('CRON', async () => { const job = (await client!.query('select jobname,command from cron.job where jobid=$1', [jobId])).rows[0]; if (job?.jobname !== jobName || job.command !== 'select internal.request_worker_wake();') throw Error('Recovery job ownership changed.'); requireCronRemoval((await client!.query(ownedCronUnscheduleSql, [jobId])).rows[0]?.removed); await client!.query('delete from cron.job_run_details where jobid=$1', [jobId]); });
    if (server) await cleanup('PROCESS', () => stopOwnedProcesses([server!]));
    await cleanup('EDGE_CONTAINER', async () => {
      const currentEdge = (await containers()).find(row => row.name === '/supabase_edge_runtime_cuevo');
      if (currentEdge?.running) { if (!ownedEdge || currentEdge.id !== ownedEdge.id || currentEdge.project !== 'cuevo' || !currentEdge.networks.includes('cuevo-local')) throw Error('Edge cleanup cannot claim an unrelated process.'); await docker('stop', '--time', '10', currentEdge.id); }
    });
    if (!functionsExisted) await cleanup('FUNCTIONS_DIRECTORY', async () => { try { const entry = await lstat(functionsDirectory); if (!entry.isDirectory() || entry.isSymbolicLink() || (await readdir(functionsDirectory)).length) throw Error('Generated functions path contains unowned content.'); await rmdir(functionsDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } });
    if (client) await cleanup('SOURCE_AND_SECRET', async () => {
      await client!.query('begin'); try {
        const rows = (await client!.query('select id,school_id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key from internal.outbox_events where id=any($1::uuid[])for update', [ids])).rows as EventRecord[]; assertOwnedWorkerEvents(rows, ids, prefix);
        await client!.query('delete from internal.processed_events where event_id=any($1::uuid[])and school_id=$2', [ids, school]); await client!.query('delete from internal.outbox_events where id=any($1::uuid[])and school_id=$2', [ids, school]);
        await client!.query('delete from net.http_request_queue where id=any($1::bigint[])', [probeRequestIds]); await client!.query('delete from net._http_response where id=any($1::bigint[])', [probeRequestIds]);
        if (secretId) { const secret = (await client!.query('select name from vault.secrets where id=$1', [secretId])).rows[0]; if (secret?.name !== secretName) throw Error('Vault cleanup cannot claim another secret.'); await client!.query('delete from vault.secrets where id=$1 and name=$2', [secretId, secretName]); }
        if (baselineControl) { const current = await control(); if (current.enabled !== false || current.state !== 'DISABLED') throw Error('Dispatch restore requires exclusive ownership.'); const keys = ['next_attempt_at', 'failure_count', 'last_requested_at', 'last_started_at', 'last_finished_at', 'last_error_code', 'last_processed_count']; await client!.query('update internal.worker_dispatch_control set ' + keys.map((key, index) => key + '=$' + (index + 1)).join(',') + ' where singleton', keys.map(key => baselineControl![key])); }
        await client!.query('commit');
      } catch (error) { await client!.query('rollback'); throw error; }
    });
    if (client) { await cleanup('LOCK', () => client!.query("select pg_advisory_unlock(hashtextextended('cuevo-exclusive-edge-verification',0))")); client.release(); }
    await cleanup('WORKER_POOL', () => worker.end()); await cleanup('OWNER_POOL', () => owner.end()); await cleanup('ENV_FILE', async () => { try { await unlink(envFile); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } });
    await cleanup('CONTAINER_PRESERVATION', async () => { const after = await containers(); if (!sameContainerIdentities(unrelated, after) || !sameUnrelatedContainers(unrelated, after)) throw Error('Unrelated container state changed.'); });
    checks.push({ name: 'owned-cleanup-and-container-preservation', passed: clean });
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
    await writeFile(resolve(directory, 'evidence.json'), JSON.stringify(edgeWorkerEvidence(checks, createHash('sha256').update(artifactBytes).digest('hex')), null, 2) + '\n');
    await writeFile(resolve(directory, 'owned-identities.json'), JSON.stringify({ eventIds: ids, generationIds: [...generationIds], probeRequestIds }, null, 2) + '\n', { mode: 0o600 });
    await writeFile(resolve(directory, 'failure-phases.json'), JSON.stringify({ failures }, null, 2) + '\n', { mode: 0o600 });
  }
  if (!checks.every(row => row.passed)) throw Error('Guarded Edge verification failed; sanitized evidence retained.');
  console.log('Guarded local Edge worker verification passed: ' + directory);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
