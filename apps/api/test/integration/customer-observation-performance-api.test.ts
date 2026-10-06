import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { learnerStateSchema } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('independent 1002-source learner-state performance budget', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60_000);
  afterAll(async () => { await context?.close(); });
  it('real current API source authorization fits its 5-second SQL budget after 1001 historical observations', async () => {
    const course = await customerCourse(context, 'Observed-source performance'); await customerReleased(context, 'strong', course.courseId, 'One native baseline', 6); await context.drain();
    // Bulk history is fully pinned synthetic source data. One new action still passes through the real API and worker.
    await context.client.query("create temporary table customer_perf_history(activity uuid not null,completion uuid not null,event uuid not null,sequence integer not null,occurred timestamptz not null)");
    await context.client.query("insert into customer_perf_history select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),n,clock_timestamp()-interval '1 minute'from generate_series(1,1001)n");
    await context.client.query("insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)select $1,activity,$2,'Synthetic observed practice '||sequence,'practice','School-defined practice.',sequence+10 from customer_perf_history", [context.school, course.lessonId]);
    await context.client.query('insert into app.activity_completions(school_id,id,activity_id,learner_id,completed_at)select $1,completion,activity,$2,occurred from customer_perf_history', [context.school, customerActor(12)]);
    await context.client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,occurred_at,completed_at)select $1,event,$2,'activity.complete','activity',completion,1,'{}',event::text,'COMPLETED',occurred,occurred from customer_perf_history", [context.school, customerActor(12)]);
    await context.client.query("insert into internal.processed_events(event_id,school_id,source_type,source_id)select event,$1,'COMPLETION',completion from customer_perf_history", [context.school]);
    await context.client.query("insert into app.habit_observations(school_id,learner_id,kind,source_type,source_object_id,occurred_at,source_event_id)select $1,$2,'practice','ACTIVITY_COMPLETION',completion,occurred,event from customer_perf_history", [context.school, customerActor(12)]);
    const activity = await context.command('teacher', `/v1/lessons/${course.lessonId}/activities`, { title: 'Fresh action after imported history', kind: 'practice', instructions: 'Authorized new source.', sequence: 2000 }); await context.command('strong', `/v1/activities/${activity.id}/complete`, {}); await context.drain();
    const samples: { durationMs: number; status: number; payloadBytes: number }[] = [];
    const signalSamples: { durationMs: number; status: number; payloadBytes: number }[] = [];
    let verifiedStateSamples = 0; let verifiedSignalSamples = 0;
    try {
      for (let index = 0; index < 9; index++) { const start = performance.now(); const response = await context.request('strong', `/v1/learners/${customerActor(12)}/state`); const durationMs = performance.now() - start; samples.push({ durationMs, status: response.statusCode, payloadBytes: Buffer.byteLength(response.body) }); expect(response.statusCode).toBe(200); const state = learnerStateSchema.parse(response.json()); expect(state.development.practice.count).toBe(1002); expect(state.development.practice.observationIds).toHaveLength(1000); expect(state.projection?.observations.practice).toMatchObject({ totalCount: 1002, returnedCount: 1000, truncated: true }); expect(durationMs).toBeLessThan(5000); expect(Buffer.byteLength(response.body)).toBeLessThan(500000); verifiedStateSamples++; }
      for(let index=0;index<7;index++){const start=performance.now();const response=await context.request('strong',`/v1/signals?limit=100&learnerId=${customerActor(12)}`);const durationMs=performance.now()-start;signalSamples.push({durationMs,status:response.statusCode,payloadBytes:Buffer.byteLength(response.body)});expect(response.statusCode).toBe(200);const signal=response.json().items[0];expect(signal.count).toBe(1002);expect(signal.sourceCoverage).toMatchObject({totalCount:1002,returnedCount:1000,truncated:true});expect(durationMs).toBeLessThan(5000);verifiedSignalSamples++;}
    } finally {
      await mkdir('.local/customer-readiness', { recursive: true }); const times = samples.map(item => item.durationMs).sort((a, b) => a - b); await writeFile('.local/customer-readiness/observation-performance.json', JSON.stringify({ status: verifiedStateSamples === 9 ? 'VERIFIED' : 'FAILED', verifiedSamples: verifiedStateSamples, expectedSamples: 9, fixtureId: randomUUID(), sourceCount: 1002, scope: 'SYNTHETIC_ROLLBACK_ACTUAL_AUTH_API', statementTimeoutMs: 5000, medianMs: times.length ? times[Math.floor(times.length / 2)] : null, p95Ms: times.length ? times[Math.ceil(times.length * .95) - 1] : null, samples }, null, 2));
      const signalTimes=signalSamples.map(item=>item.durationMs).sort((a,b)=>a-b);await writeFile('.local/customer-readiness/signal-performance.json',JSON.stringify({status:verifiedSignalSamples===7?'VERIFIED':'FAILED',verifiedSamples:verifiedSignalSamples,expectedSamples:7,sourceCount:1002,statementTimeoutMs:5000,medianMs:signalTimes.length?signalTimes[Math.floor(signalTimes.length/2)]:null,p95Ms:signalTimes.length?signalTimes[Math.ceil(signalTimes.length*.95)-1]:null,samples:signalSamples},null,2));
    }
  }, 60_000);
});
