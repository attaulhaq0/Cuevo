import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { assertCuevoLocalConfig } from '../../../../scripts/configure-local';

export function requireSyntheticWorkerTarget(connection: string | undefined) {
  let target: URL; try { target = new URL(connection ?? ''); } catch { throw Error('Restricted local Cuevo worker configuration required.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || target.port !== '56322' || target.username !== 'cuevo_worker' || target.pathname !== '/postgres' || target.search || target.hash)
    throw Error('Restricted local Cuevo worker configuration required.');
  return target.toString();
}

export const syntheticQueueGuard = `
 select count(*)::integer unsafe_count from internal.outbox_events event
 left join app.schools school on school.id=event.school_id
 left join app.people actor on actor.school_id=event.school_id and actor.actor_id=event.actor_id
 where event.state in('PENDING','PROCESSING')and(
  school.id is null or school.status<>'active'or actor.synthetic is distinct from true
  or exists(select 1 from app.memberships member left join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id where member.school_id=event.school_id and person.synthetic is distinct from true)
  or exists(select 1 from app.people person where person.school_id=event.school_id and person.synthetic is distinct from true))`;

type Query = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
/** Processes actual source events through the restricted worker; no owner completion writes. */
export async function drainGuardedSyntheticQueue(ownerQuery: Query, workerQuery: Query) {
  for (let pass = 0; pass < 50; pass++) {
    const guard = (await ownerQuery(syntheticQueueGuard)).rows[0];
    if (guard?.unsafe_count !== 0) throw Error('Global worker fixture refuses unknown or real queue populations.');
    const events = (await workerQuery('select *from internal.claim_outbox(100,30)')).rows;
    if (!events.length) {
      const remaining = (await ownerQuery("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING')")).rows[0]?.count;
      if (remaining !== 0) throw Error('Global worker fixture requires pending or active leases to resolve before competition.');
      return;
    }
    for (const event of events) await workerQuery('select internal.process_learner_event($1,$2)', [event.id, event.lease_token]);
  }
  throw Error('Synthetic global queue did not drain within its bounded worker window.');
}

/** Call only in the root-coordinated exclusive local integration window. */
export async function prepareSyntheticWorkerWindow(client: PoolClient, connection: string | undefined) {
  if (process.env.NODE_ENV === 'production' || process.env.CUEVO_REQUIRE_INTEGRATION !== '1') throw Error('Synthetic integration worker window required.');
  const target = requireSyntheticWorkerTarget(connection);
  await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
  const localOwner = (await client.query("select current_database()as database,inet_server_port()as port,current_user as role")).rows[0];
  // PostgreSQL's container port is 5432; the configured public target is guarded above.
  if (localOwner?.database !== 'postgres' || localOwner.role !== 'postgres' || localOwner.port !== 5432) throw Error('Synthetic worker owner must be the validated local Cuevo database.');
  for (const port of [3000, 4000, 4001]) {
    let reachable = false; try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(800) }); reachable = true; } catch { /* Expected while shared runtimes are stopped. */ }
    if (reachable) throw Error('Stop shared application workers before the global claim fixture.');
  }
  const workers = new Pool({ connectionString: target, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  workers.on('error', () => { /* Errors surface through sanitized fixture failure. */ });
  try { await drainGuardedSyntheticQueue((sql, values) => client.query(sql, values), (sql, values) => workers.query(sql, values)); }
  catch { throw Error('Synthetic worker queue requires source or lease review.'); }
  finally { await workers.end(); }
}
