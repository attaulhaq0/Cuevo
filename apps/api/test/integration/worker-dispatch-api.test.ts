import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createCustomerContext, customerActor, customerCourse, type CustomerContext } from './customer-test-context';
import { prepareSyntheticWorkerWindow, requireSyntheticWorkerTarget } from './customer-worker-window';
import { withFixtureCleanup } from './fixture-cleanup';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
type Control = { singleton: boolean; enabled: boolean; state: string; wake_id: string | null; [key: string]: unknown };
describe.skipIf(!enabled)('restricted worker dispatch admission with isolated committed source', () => {
  let context: CustomerContext;
  let workers: Pool | undefined;
  let original: Control | undefined;
  let controlOwned = false;
  const ownerQueue = async () => (await context.client.query("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING')")).rows[0].count as number;
  const noApplications = async () => {
    for (const port of [3000, 4000, 4001]) {
      let reachable = false;
      try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(800) }); reachable = true; } catch { /* Expected exclusive local window. */ }
      if (reachable) throw new Error('Dispatch fixture requires stopped shared Cuevo applications.');
    }
  };
  const restoreControl = async () => {
    if (!original || !controlOwned) return;
    await noApplications();
    const keys = Object.keys(original).filter(key => key !== 'singleton');
    if (keys.some(key => !/^[a-z_][a-z0-9_]{0,62}$/.test(key))) throw new Error('Unexpected operational fixture column.');
    await context.client.query('BEGIN');
    try {
      await context.client.query('select singleton from internal.worker_dispatch_control where singleton for update');
      await context.client.query(`update internal.worker_dispatch_control set ${keys.map((key, index) => `"${key}"=$${index + 1}`).join(',')} where singleton`, keys.map(key => original![key]));
      await context.client.query('COMMIT'); controlOwned = false;
    } catch (error) { await context.client.query('ROLLBACK'); throw error; }
  };
  beforeAll(async () => {
    await noApplications();
    workers = new Pool({ connectionString: requireSyntheticWorkerTarget(process.env.WORKER_DATABASE_URL), max: 2, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
    workers.on('error', () => { /* Test query assertions report sanitized failures. */ });
    const prior = (await workers.query('select internal.worker_dispatch_health()as health')).rows[0].health;
    if (!prior?.ready || prior.enabled || prior.state !== 'DISABLED') throw new Error('Dispatch fixture requires current restricted role and disabled transport before source setup.');
    context = await createCustomerContext({ committed: true });
    await prepareSyntheticWorkerWindow(context.client, process.env.WORKER_DATABASE_URL);
    original = (await context.client.query('select *from internal.worker_dispatch_control where singleton')).rows[0] as Control;
    if (!original || original.enabled || original.state !== 'DISABLED' || original.wake_id !== null || await ownerQueue() !== 0) throw new Error('Dispatch fixture requires disabled transport and an empty guarded queue.');
  }, 60_000);
  afterAll(async () => {
    const errors: unknown[] = [];
    if (context) try { await restoreControl(); } catch (error) { errors.push(error); }
    if (workers) try { await workers.end(); } catch (error) { errors.push(error); }
    if (context) try { await context.close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Dispatch fixture cleanup requires review.');
  });
  const issued = async (wakeId: string) => {
    await noApplications();
    const current = (await context.client.query('select enabled,state from internal.worker_dispatch_control where singleton')).rows[0];
    if (current.enabled || !['DISABLED', 'IDLE', 'BACKOFF'].includes(current.state)) throw new Error('Operational control is not exclusively owned by this fixture.');
    // Retain restoration ownership before an uncertain response to the exact fixture write.
    controlOwned = true;
    await context.client.query(`update internal.worker_dispatch_control set enabled=true,state='REQUESTED',endpoint='https://worker.example.test/functions/v1/cuevo-worker',vault_secret_name='test-no-delivery',allow_local=false,wake_id=$1,lease_expires_at=clock_timestamp()+interval '60 seconds',network_request_id=null,next_attempt_at=clock_timestamp(),failure_count=0,last_error_code=null where singleton`, [wakeId]);
  };
  const pause = async () => {
    await context.client.query(`update internal.worker_dispatch_control set enabled=false,state='DISABLED',endpoint=null,vault_secret_name=null,allow_local=false,wake_id=null,lease_expires_at=null,network_request_id=null where singleton`);
  };
  it('actual restricted login admits one issued wake, processes a source and records exact completion without public grants', async () => {
    const identity = (await workers!.query('select current_user,session_user')).rows[0];
    expect(identity).toEqual({ current_user: 'cuevo_worker', session_user: 'cuevo_worker' });
    const health = (await workers!.query('select internal.worker_health()as health')).rows[0].health;
    expect(health.ready).toBe(true);
    const course = await customerCourse(context, 'Committed dispatch source');
    await context.drain();
    expect(await ownerQueue()).toBe(0);
    // An isolated actual activity completion supplies canonical source/audit/outbox through its normal command.
    await context.command('strong', `/v1/activities/${course.practiceId}/complete`, { reflection: 'Private synthetic action excluded from wake metadata.' });
    const pending = (await context.client.query("select id from internal.outbox_events where school_id=$1 and state='PENDING'and type='activity.complete'order by occurred_at,id", [context.school])).rows;
    expect(pending).toHaveLength(1);
    const wakeId = randomUUID(); await issued(wakeId);
    expect((await workers!.query('select internal.begin_worker_wake($1)as admitted', [wakeId])).rows[0].admitted).toBe(true);
    expect((await workers!.query('select internal.begin_worker_wake($1)as admitted', [wakeId])).rows[0].admitted).toBe(false);
    const claim = (await workers!.query('select id,lease_token from internal.claim_outbox(1,30)')).rows;
    expect(claim).toHaveLength(1); expect(claim[0].id).toBe(pending[0].id);
    await workers!.query('select internal.process_learner_event($1,$2)as receipt', [claim[0].id, claim[0].lease_token]);
    const stored = (await context.client.query('select state from internal.outbox_events where school_id=$1 and id=$2', [context.school, claim[0].id])).rows[0];
    expect(stored.state).toBe('COMPLETED');
    // Drain resulting canonical follow-on events before finish; this case deliberately performs no network continuation.
    await context.drain(); expect(await ownerQueue()).toBe(0);
    expect((await workers!.query("select internal.finish_worker_wake($1,'COMPLETED',1)as finished", [wakeId])).rows[0].finished).toBe(true);
    const dispatch = (await workers!.query('select internal.worker_dispatch_health()as health')).rows[0].health;
    expect(dispatch).toMatchObject({ ready: true, state: 'IDLE', lastProcessedCount: 1, dueWork: false });
    expect(JSON.stringify(dispatch)).not.toContain('Private synthetic action'); expect(JSON.stringify(dispatch)).not.toContain('test-no-delivery');
    const permissions = (await workers!.query(`select has_table_privilege(current_user,'internal.worker_dispatch_control','SELECT')as raw_control,has_function_privilege(current_user,'internal.send_worker_wake(uuid,text,text)','EXECUTE')as sender,has_function_privilege('authenticated','internal.begin_worker_wake(uuid)','EXECUTE')as browser`)).rows[0];
    expect(permissions).toEqual({ raw_control: false, sender: false, browser: false });
    await pause();
  }, 60_000);
  it('wrong and expired generations deny, then a current admitted review finish stores bounded backoff', async () => {
    expect(await ownerQueue()).toBe(0);
    const wakeId = randomUUID(); await issued(wakeId);
    expect((await workers!.query('select internal.begin_worker_wake($1)as admitted', [randomUUID()])).rows[0].admitted).toBe(false);
    await context.client.query("update internal.worker_dispatch_control set lease_expires_at=clock_timestamp()-interval '1 second'where singleton");
    expect((await workers!.query('select internal.begin_worker_wake($1)as admitted', [wakeId])).rows[0].admitted).toBe(false);
    await context.client.query("update internal.worker_dispatch_control set lease_expires_at=clock_timestamp()+interval '60 seconds'where singleton");
    expect((await workers!.query('select internal.begin_worker_wake($1)as admitted', [wakeId])).rows[0].admitted).toBe(true);
    expect((await workers!.query("select internal.finish_worker_wake($1,'REQUIRES_REVIEW',0)as finished", [wakeId])).rows[0].finished).toBe(true);
    const dispatch = (await workers!.query('select internal.worker_dispatch_health()as health')).rows[0].health;
    expect(dispatch).toMatchObject({ state: 'BACKOFF', failureCount: 1, lastErrorCode: 'WORKER_REQUIRES_REVIEW', lastProcessedCount: 0 });
    expect(Date.parse(dispatch.nextAttemptAt)).toBeGreaterThan(Date.now());
    expect((await workers!.query("select internal.finish_worker_wake($1,'COMPLETED',0)as finished", [wakeId])).rows[0].finished).toBe(false);
    await pause();
  });
  it('actual restricted login cannot claim or mutate API-owned Auth events or expose private ownership helpers', async () => {
    await noApplications(); expect(await ownerQueue()).toBe(0);
    const controlBefore = (await context.client.query('select *from internal.worker_dispatch_control where singleton')).rows[0] as Control;
    expect(controlBefore).toMatchObject({ enabled: false, state: 'DISABLED', wake_id: null });
    const fixtures = [
      { id: randomUUID(), lease: null, type: 'school.account.provisioning_requested', state: 'PENDING' },
      { id: randomUUID(), lease: randomUUID(), type: 'school.account.recovery_requested', state: 'PROCESSING' },
      { id: randomUUID(), lease: randomUUID(), type: 'school.account.provisioning_requested', state: 'PROCESSING' },
      { id: randomUUID(), lease: randomUUID(), type: 'school.account.recovery_requested', state: 'PROCESSING' },
    ];
    const ownedIds = fixtures.map(fixture => fixture.id);
    const sources = async () => (await context.client.query('select to_jsonb(event)as record from internal.outbox_events event where event.school_id=$1 and event.id=any($2::uuid[])order by event.id', [context.school, ownedIds])).rows.map(row => row.record);
    await withFixtureCleanup(async () => {
      // Owner-created committed event/lease fixtures test transport ownership only.
      // No provider, invitation recipient, delivery secret or membership is created.
      for (const fixture of fixtures) {
        await context.client.query(`insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until,attempt_count)
          values($1,$2,$3,$4,'school_account',$2,1,'{"executionOwner":"WORKER"}', $5,$6,$7,case when $7::uuid is null then null else clock_timestamp()+interval'5 minutes'end,case when $7::uuid is null then 0 else 1 end)`,
        [context.school, fixture.id, customerActor(1), fixture.type, 'worker-ownership:' + fixture.id, fixture.state, fixture.lease]);
      }
      const before = await sources(); expect(before).toHaveLength(4); expect(await ownerQueue()).toBe(4);
      expect((await workers!.query('select current_user,session_user')).rows[0]).toEqual({ current_user: 'cuevo_worker', session_user: 'cuevo_worker' });
      const health = (await workers!.query('select internal.worker_health()as health')).rows[0]?.health;
      expect(health).toMatchObject({ ready: true, scope: 'WORKER', pendingCount: 0, failedCount: 0, oldestPendingAt: null });
      const dispatch = (await workers!.query('select internal.worker_dispatch_health()as health')).rows[0]?.health;
      expect(dispatch).toMatchObject({ ready: true, scope: 'WORKER', enabled: false, state: 'DISABLED', dueWork: false });
      expect((await workers!.query('select id,lease_token from internal.claim_outbox(100,30)')).rows).toHaveLength(0);
      expect((await workers!.query('select internal.complete_outbox($1,$2)as receipt', [fixtures[1].id, fixtures[1].lease])).rows[0]?.receipt).toBe(false);
      expect((await workers!.query("select internal.fail_outbox($1,$2,'PROCESSING_REQUIRES_REVIEW',30)as receipt", [fixtures[2].id, fixtures[2].lease])).rows[0]?.receipt).toBe(false);
      await expect(workers!.query('select internal.process_learner_event($1,$2)', [fixtures[3].id, fixtures[3].lease])).rejects.toMatchObject({ code: '42501' });
      const grants = (await workers!.query(`select has_table_privilege(current_user,'internal.outbox_events','SELECT,INSERT,UPDATE,DELETE')as raw_outbox,
        has_function_privilege(current_user,'internal.outbox_event_owner(text)','EXECUTE')as classifier,
        has_function_privilege(current_user,'internal.process_before_account_execution_ownership(uuid,uuid)','EXECUTE')as prior_processor`)).rows[0];
      expect(grants).toEqual({ raw_outbox: false, classifier: false, prior_processor: false });
      await expect(workers!.query('select *from internal.outbox_events')).rejects.toMatchObject({ code: '42501' });
      await expect(workers!.query("select internal.outbox_event_owner('school.account.provisioning_requested')")).rejects.toMatchObject({ code: '42501' });
      await expect(workers!.query('select internal.process_before_account_execution_ownership($1,$2)', [fixtures[3].id, fixtures[3].lease])).rejects.toMatchObject({ code: '42501' });
      expect(await sources()).toEqual(before);
      expect((await context.client.query('select count(*)::integer count from internal.processed_events where school_id=$1 and event_id=any($2::uuid[])', [context.school, ownedIds])).rows[0]?.count).toBe(0);
      expect((await context.client.query('select *from internal.worker_dispatch_control where singleton')).rows[0]).toEqual(controlBefore);
    }, [
      () => context.client.query('delete from internal.processed_events where school_id=$1 and event_id=any($2::uuid[])', [context.school, ownedIds]),
      () => context.client.query('delete from internal.outbox_events where school_id=$1 and id=any($2::uuid[])', [context.school, ownedIds]),
      async () => { expect(await ownerQueue()).toBe(0); },
      async () => { expect((await context.client.query('select *from internal.worker_dispatch_control where singleton')).rows[0]).toEqual(controlBefore); },
    ]);
  }, 60_000);
});
