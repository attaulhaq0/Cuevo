import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
import { OutboxProcessor } from '../../apps/worker/src/jobs/outbox/processor';
import { drainReference, referenceManifest, requireReferenceWorkerTarget } from './reference-drain-rules';

function connectionRefused(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === 'ECONNREFUSED') return true;
  if ('cause' in error && connectionRefused(error.cause)) return true;
  return 'errors' in error && Array.isArray(error.errors) && error.errors.length > 0 && error.errors.every(connectionRefused);
}
async function requireStoppedApplications() {
  for (const port of [3000, 4000, 4001]) {
    try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000) }); }
    catch (error) { if (connectionRefused(error)) continue; throw Error('Reference drain requires confirmed stopped application ports.'); }
    throw Error('Stop Cuevo application processes before reference processing.');
  }
}
const metadata = `
with expected as(select *from jsonb_to_recordset($2::jsonb)as actor("schoolId"uuid,"actorId"uuid)),
bounds as(select clock_timestamp()as now),
queue as(
 select event.state,event.school_id,school.status as school_status,person.synthetic,membership.status as member_status,membership.effective_from,membership.effective_to
 from internal.outbox_events event
 left join app.schools school on school.id=event.school_id
 left join app.people person on person.school_id=event.school_id and person.actor_id=event.actor_id
 left join app.memberships membership on membership.school_id=event.school_id and membership.actor_id=event.actor_id
 where event.state<>'COMPLETED'
),counts as(
 select count(*)::integer as "nonCompletedCount",
 count(*)filter(where state='PENDING')::integer as "pendingCount",
 count(*)filter(where state='PROCESSING')::integer as "processingCount",
 count(*)filter(where state='FAILED')::integer as "failedCount",
 count(*)filter(where school_id is distinct from $1::uuid or school_status is distinct from'active'or synthetic is distinct from true or member_status is distinct from'active'or effective_from is null or effective_from>bounds.now or(effective_to is not null and effective_to<=bounds.now))::integer as "unsafeCount"
 from queue cross join bounds
)
select current_database()as database,inet_server_port()as port,session_user as "sessionUser",current_setting('transaction_read_only')='on'as "readOnly",
 exists(select 1 from app.schools where id=$1::uuid and status='active')as "referenceActive",
 not exists(select 1 from app.people person full join expected actor on actor."schoolId"=person.school_id and actor."actorId"=person.actor_id where actor."actorId"is null or person.actor_id is null or person.synthetic is distinct from true)as "populationMatches",
 exists(select 1 from internal.worker_dispatch_control where singleton and not enabled and state='DISABLED'and wake_id is null and lease_expires_at is null and network_request_id is null and endpoint is null and vault_secret_name is null and not allow_local)as "dispatchDisabled",
 counts.*from counts`;

export async function main() {
  await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
  process.loadEnvFile(resolve('.env.local'));
  const cli = resolve('node_modules/supabase/dist/supabase.js');
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
  assertCuevoLocalTarget(status);
  const workerUrl = requireReferenceWorkerTarget(process.env.WORKER_DATABASE_URL);
  const fixture = referenceManifest(JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')));
  await requireStoppedApplications();
  let owner: Pool | undefined; let worker: Pool | undefined; let failed = false; let processed = 0;
  try {
    // The owner connection is metadata-only and read-only; all processing remains on the restricted worker.
    owner = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000, options: '-c default_transaction_read_only=on' });
    owner.on('error', () => { /* Sanitized query admission remains authoritative. */ });
    worker = new Pool({ connectionString: workerUrl, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
    worker.on('error', () => { /* Current health and source processing determine acceptance. */ });
    const processor = new OutboxProcessor(worker);
    const result = await drainReference({
      inspect: async () => { await requireStoppedApplications(); return (await owner!.query(metadata, [fixture.schoolId, JSON.stringify(fixture.actors)])).rows[0]; },
      health: async () => (await worker!.query('select internal.worker_health()as health')).rows[0]?.health,
      process: value => processor.process(value),
    });
    processed = result.processed;
  } catch { failed = true; } finally {
    const cleanup = await Promise.allSettled([worker?.end(), owner?.end()]);
    if (cleanup.some(result => result.status === 'rejected')) failed = true;
  }
  if (failed) throw Error('Reference processing or database cleanup requires review.');
  console.log(`Synthetic reference events processed through restricted domain handlers: ${processed}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch { console.error('Guarded synthetic reference processing requires review; diagnostic data withheld.'); process.exitCode = 1; }
}
