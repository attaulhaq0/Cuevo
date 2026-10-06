import { describe, expect, it } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createCustomerContext, customerActor, customerCourse, customerRoles, type CustomerContext, type CustomerRole } from './customer-test-context';
import { requireSyntheticWorkerTarget, syntheticQueueGuard } from './customer-worker-window';
import { withFixtureCleanup } from './fixture-cleanup';
import { assertCuevoLocalConfig } from '../../../../scripts/configure-local';
import { OutboxProcessor } from '../../../worker/src/jobs/outbox/processor';
import type { WorkerQueryPort, WorkerRow } from '../../../worker/src/platform/query-port';

type Measurement = { operation: 'CLAIM' | 'PROCESS' | 'FAIL' | 'IDENTITY' | 'DENY'; durationMs: number; returned: boolean; asserted: boolean; expectedDenial?:boolean };
const countsSql = `select (select count(*)::integer from app.schools)schools,(select count(*)::integer from app.people)people,
 (select count(*)::integer from auth.users)auth,(select count(*)::integer from app.learner_state_policies)policies,
 (select count(*)::integer from internal.learner_observation_policy_revisions)history,
 (select count(*)::integer from internal.outbox_events)events`;

/** Committed normal API sources and a real worker LOGIN; no processing through SET ROLE. */
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('independent worker login observation recovery and finite policy paging', () => {
  it('recovers eleven real learner sources, preserves original failures and updates only current-policy projections', async () => {
    let context: CustomerContext | undefined; let worker: Pool | undefined; let owner: Pool | undefined;
    let baseline: Record<string, unknown> | undefined; let actionPassed = false; let cleanupPassed = false;
    const measurements: Measurement[] = []; const batchSizes: number[] = [];
    const runId = randomUUID(); const setupStarted = performance.now(); let setupMs = 0; let recoveryMs = 0;
    let completedSources = 0; let originalFailureCount = 0; let deferredCount = 0;
    const workerQuery = async (sql: string, values?: unknown[]): Promise<{ rows: WorkerRow[] }> => {
      if (!worker) throw Error('Verified local worker connection required.');
      const operation: Measurement['operation'] = sql.includes('claim_outbox') ? 'CLAIM' : sql.includes('process_learner_event') ? 'PROCESS' : sql.includes('fail_outbox') ? 'FAIL' : sql.includes('session_user') ? 'IDENTITY' : 'DENY';
      const started = performance.now(); const sample: Measurement = { operation, durationMs: 0, returned: false, asserted: false }; measurements.push(sample);
      try {
        const result = await worker.query(sql, values); sample.returned = true;
        if (operation === 'CLAIM') {
          const ids = result.rows.map(row => String(row.id));
          if (ids.length) {
            if (!context) throw Error('Owned committed source context required.');
            const owned = (await context.client.query<{ count: number }>('select count(*)::integer count from internal.outbox_events where school_id=$1 and id=any($2::uuid[])', [context.school, ids])).rows[0].count;
            if (owned !== ids.length) throw Error('Worker fixture refuses another school delivery.');
          }
        }
        sample.asserted = true; return result;
      } finally { sample.durationMs = performance.now() - started; }
    };
    try {
      await withFixtureCleanup(async () => {
        await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
        const apiUrl = new URL(process.env.DATABASE_URL ?? '');
        if (!['postgres:', 'postgresql:'].includes(apiUrl.protocol) || apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== '56322' || apiUrl.pathname !== '/postgres' || apiUrl.username !== 'cuevo_api' || apiUrl.search || apiUrl.hash || process.env.SUPABASE_URL !== 'http://127.0.0.1:56321') throw Error('Exact local Cuevo API and Auth targets required.');
        const workerUrl = requireSyntheticWorkerTarget(process.env.WORKER_DATABASE_URL);
        if (new URL(workerUrl).hostname !== '127.0.0.1') throw Error('Exact loopback worker target required.');
        for (const port of [3000, 4000, 4001]) {
          try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000), redirect: 'error' }); }
          catch (error) { if ((error as Error & { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') continue; throw Error('Stopped application state is unknown.'); }
          throw Error('Worker proof requires stopped shared applications.');
        }
        apiUrl.username = 'postgres'; apiUrl.password = 'postgres';
        owner = new Pool({ connectionString: apiUrl.toString(), max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
        baseline = (await owner.query(countsSql)).rows[0];
        if (!baseline||baseline.people !== 133 || baseline.auth !== 133) throw Error('Restored synthetic reference required before committed proof.');
        if ((await owner.query("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING','FAILED')")).rows[0].count !== 0 || (await owner.query(syntheticQueueGuard)).rows[0].unsafe_count !== 0 || (await owner.query('select enabled from internal.worker_dispatch_control where singleton')).rows[0].enabled !== false) throw Error('Worker proof requires settled private reference and disabled dispatch.');
        context = await createCustomerContext({ committed: true, observationPolicy: false });
        worker = new Pool({ connectionString: workerUrl, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
        worker.on('error', () => { /* Active queries expose failures without credential logs. */ });
        expect((await workerQuery('select session_user,current_user')).rows).toEqual([{ session_user: 'cuevo_worker', current_user: 'cuevo_worker' }]);
        await expect(workerQuery('select *from app.learner_state_policies')).rejects.toMatchObject({ code: '42501' });
        await expect(workerQuery('select *from internal.learner_observation_policy_revisions')).rejects.toMatchObject({ code: '42501' });
        expect((await context.request('admin', '/v1/learner-observation-policy')).json()).toEqual({ schoolId: context.school, status: 'UNCONFIGURED', policy: null });
        const course = await customerCourse(context, 'Independent worker recorded practice');
        const learners = Object.entries(customerRoles).filter(([, actor]) => actor >= 12 && actor <= 22).map(([role, actor]) => ({ role: role as CustomerRole, id: customerActor(actor) }));
        expect(learners).toHaveLength(11);
        const originalEvents = new Map<string, string>();
        for (const learner of learners) {
          const completion = await context.command(learner.role, `/v1/activities/${course.practiceId}/complete`, { reflection: 'I explained the reviewed checking step.' });
          const event = (await context.client.query<{ id: string }>("select id from internal.outbox_events where school_id=$1 and actor_id=$2 and type='activity.complete'and entity_id=$3", [context.school, learner.id, completion.id])).rows[0];
          if (!event) throw Error('Actual API source delivery unavailable.'); originalEvents.set(event.id, completion.id);
        }
        setupMs = performance.now() - setupStarted;
        const protectedTruth = async () => (await context!.client.query(`select
         (select coalesce(jsonb_agg(to_jsonb(result)order by result.id),'[]'::jsonb)from app.result_revisions result where school_id=$1)grades,
         (select coalesce(jsonb_agg(to_jsonb(result)order by result.id),'[]'::jsonb)from app.rubric_result_revisions result where school_id=$1)rubric,
         (select coalesce(jsonb_agg(to_jsonb(award)order by award.id),'[]'::jsonb)from app.xp_ledger award where school_id=$1)xp`, [context!.school])).rows[0];
        const truth = await protectedTruth();
        for (let pass = 0; pass < 150; pass++) {
          const claimed = (await workerQuery('select id,school_id,lease_token from internal.claim_outbox(1,30)')).rows[0];
          if (!claimed) break;
          try { await workerQuery('select internal.process_learner_event($1,$2)', [claimed.id, claimed.lease_token]); }
          catch (error) {
            if (!originalEvents.has(String(claimed.id))) throw error;
            expect(error).toMatchObject({ code: '22023' });
            const failure=measurements.at(-1);if(failure){failure.asserted=true;failure.expectedDenial=true;}
            expect((await workerQuery('select internal.fail_outbox($1,$2,$3,0)as acknowledged', [claimed.id, claimed.lease_token, 'PROCESSING_REQUIRES_REVIEW'])).rows[0].acknowledged).toBe(true);
          }
        }
        const failed = (await context.client.query('select id,to_jsonb(event)as record from internal.outbox_events event where school_id=$1 and id=any($2::uuid[])order by id', [context.school, [...originalEvents.keys()]])).rows;
        expect(failed).toHaveLength(11); expect(failed.every(row => row.record.state === 'FAILED' && row.record.attempt_count === 5)).toBe(true); originalFailureCount = failed.length;
        expect((await context.client.query('select count(*)::integer count from app.habit_observations where school_id=$1', [context.school])).rows[0].count).toBe(0);
        const input = { developmentWindowDays: 21, expectedVersion: 0, reason: 'Reviewed independent committed worker observation window', confirmApproval: true };
        const approved = await context.command('admin', '/v1/learner-observation-policy', input); expect(approved).toMatchObject({ version: 1, status: 'APPROVED', refreshStatus: 'PENDING' });
        const processor = new OutboxProcessor({ query: workerQuery } satisfies WorkerQueryPort);
        const drain = async () => {
          const deadline = Date.now() + 60000;
          for (let pass = 0; pass < 150 && Date.now() < deadline; pass++) {
            const remaining = (await context!.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and state in('PENDING','PROCESSING')", [context!.school])).rows[0].count;
            if (!remaining) return;
            const result = await processor.process({ maxEvents: 10, deadline: Date.now() + 20000 });
            expect(result.failureReceiptUnknown).toBe(false); expect(result.executionUnavailable).toBe(false); expect(result.reviewRequired).toBe(false);
            batchSizes.push(result.attempted); deferredCount += result.deferred;
            if (result.attempted === 0) await new Promise<void>(resolve => setTimeout(resolve, 200));
          }
          throw Error('Independent policy source recovery exceeded its bounded window.');
        };
        const recoveryStarted = performance.now(); await drain(); recoveryMs = performance.now() - recoveryStarted;
        const planned = (await context.client.query<{ learner_id: string; count: number }>("select learner_id,count(*)::integer count from internal.learner_observation_refresh_sources where school_id=$1 and policy_id=$2 and kind='LEARNER'group by learner_id order by learner_id", [context.school, approved.id])).rows;
        expect(planned).toHaveLength(11); expect(planned.every(row => row.count === 1)).toBe(true); expect(planned.map(row => row.learner_id).sort()).toEqual(learners.map(row => row.id).sort());
        expect((await context.client.query("select count(*)::integer count from internal.learner_observation_refresh_sources where school_id=$1 and policy_id=$2 and kind='PAGE'and cursor_id is not null", [context.school, approved.id])).rows[0].count).toBe(1);
        const recoveries = (await context.client.query('select original_event_id from internal.learner_observation_recovery_sources where school_id=$1 and policy_id=$2 order by original_event_id', [context.school, approved.id])).rows;
        expect(recoveries.map(row => row.original_event_id)).toEqual([...originalEvents.keys()].sort()); completedSources = recoveries.length;
        expect((await context.client.query('select id,to_jsonb(event)as record from internal.outbox_events event where school_id=$1 and id=any($2::uuid[])order by id', [context.school, [...originalEvents.keys()]])).rows).toEqual(failed);
        for (const learner of learners) { const read = await context.request(learner.role, `/v1/learners/${learner.id}/state`); expect(read.statusCode).toBe(200); expect(read.json().development.practice.count).toBe(1); }
        expect(await protectedTruth()).toEqual(truth);
        const changed = await context.command('admin', '/v1/learner-observation-policy', { ...input, expectedVersion: 1, developmentWindowDays: 30 }); expect(changed.version).toBe(2);
        const stale = await context.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(stale.statusCode).toBe(200); expect(stale.json().freshness).toBe('STALE'); expect(stale.json().development.practice.count).toBeNull();
        await drain(); const current = await context.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(current.statusCode).toBe(200); expect(current.json().development.practice.count).toBe(1);
        expect((await context.client.query('select distinct observation_policy_version from app.learner_state_snapshots where school_id=$1', [context.school])).rows).toEqual([{ observation_policy_version: 2 }]);
        expect(await protectedTruth()).toEqual(truth); expect(batchSizes.every(size => size <= 10)).toBe(true); expect(deferredCount).toBeGreaterThan(0);
        expect(measurements.filter(row => row.operation !== 'DENY').every(row => (row.returned||row.expectedDenial) && row.asserted && row.durationMs < 5000)).toBe(true);
        expect((await context.client.query("select id from internal.outbox_events where school_id=$1 and state='FAILED'order by id", [context.school])).rows.map(row => row.id)).toEqual([...originalEvents.keys()].sort());
        actionPassed = true;
      }, [
        () => worker?.end(),
        () => context?.close(),
        async () => { if (owner && baseline) { expect((await owner.query(countsSql)).rows[0]).toEqual(baseline); expect((await owner.query("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING','FAILED')")).rows[0].count).toBe(0); } cleanupPassed = true; },
        () => owner?.end(),
      ]);
    } finally {
      const directory = resolve('.local/learner-observation-policy'); await mkdir(directory, { recursive: true });
      const safeSamples = measurements.filter(row => row.returned && row.asserted).map(row => row.durationMs).sort((a, b) => a - b);
      await writeFile(resolve(directory, `worker-login-${runId}.json`), JSON.stringify({ status: actionPassed && cleanupPassed ? 'VERIFIED' : 'FAILED', workerIdentity: 'cuevo_worker LOGIN', committedFixture: true, learners: 11, originalFailures: originalFailureCount, reconstructedSources: completedSources, setupMs, recoveryMs, deferredCount, maxBatch: batchSizes.length ? Math.max(...batchSizes) : null, attemptedStatements: measurements.length, returnedAndAssertedStatements: safeSamples.length, p95Ms: safeSamples.length ? safeSamples[Math.ceil(safeSamples.length * .95) - 1] : null, maxMs: safeSamples.length ? safeSamples.at(-1) : null, cleanupConfirmed: cleanupPassed, sourceLimits: 'Scoped11learners; no production/load guarantee' }, null, 2));
    }
  }, 180000);
});
