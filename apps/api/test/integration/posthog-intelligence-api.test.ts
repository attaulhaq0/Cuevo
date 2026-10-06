import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PosthogDelivery } from '../../../worker/src/jobs/analytics/posthog-delivery';
import type { LiveAnalyticsConfig, PosthogEvent } from '../../../worker/src/platform/posthog';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
import { prepareSyntheticWorkerWindow, requireSyntheticWorkerTarget } from './customer-worker-window';

dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('private intelligence PostHog source delivery without network model or capture calls', () => {
 let context: CustomerContext; let worker: Pool;
 const config: LiveAnalyticsConfig = { mode: 'LIVE_SYNTHETIC', projectId: 393668, host: 'https://us.i.posthog.com', projectKey: 'integration-only', pseudonymKey: 'a'.repeat(64), keyVersion: 1, environment: 'QA' };
 const captured: PosthogEvent[] = [];
 const sink = async (_config: LiveAnalyticsConfig, event: PosthogEvent) => { captured.push(event); return 'ACCEPTED' as const; };
 const events = async () => {
  const first = new PosthogDelivery(worker, config, sink); const second = new PosthogDelivery(worker, config, sink);
  for (let pass=0;pass<8;pass++) await Promise.all([first.process({ maxEvents: 10, deadline: Date.now()+30000 }), second.process({ maxEvents: 10, deadline: Date.now()+30000 })]);
 };
 beforeAll(async () => {
  context = await createCustomerContext({ committed: true });
  await prepareSyntheticWorkerWindow(context.client, process.env.WORKER_DATABASE_URL);
  worker = new Pool({ connectionString: requireSyntheticWorkerTarget(process.env.WORKER_DATABASE_URL), max: 2, statement_timeout: 5000, connectionTimeoutMillis: 3000 });
  await context.command('admin','/v1/school/policies',{ expectedVersion:0,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:true,reason:'Explicit synthetic metadata capture approval.',confirmPolicyApproval:true });
  await context.client.query("select set_config('app.runtime_env','local',false)");
  await context.client.query('select internal.configure_posthog_school($1,true,$2,$3)',[context.school,'QA',1]);
 },60000);
 afterAll(async () => { await worker?.end(); await context?.close(); });

 it('joins actual fixture run, explicit review, decision and outcome without raw content or fabricated billing',async () => {
  const course = await customerCourse(context,'Private metadata source');
  const baseline = await customerReleased(context,'strong',course.courseId,'Private baseline metadata',3); await context.drain();
  const commandKey = randomUUID();
  const proposal = await context.command('teacher','/v1/intelligence/analyze',{ baselineResultId:baseline.resultId },commandKey);
  expect((await context.command('teacher','/v1/intelligence/analyze',{ baselineResultId:baseline.resultId },commandKey)).id).toBe(proposal.id);
  const reviewKey = randomUUID(); const review = { usefulness:'USEFUL',grounding:'SUPPORTED',privacy:'UNKNOWN',toolSafety:'UNKNOWN',confirmReview:true,reason:'private sentinel quality review' };
  const reviewPath = `/v1/intelligence/runs/${proposal.intelligenceRunId}/review`;
  await context.command('teacher',reviewPath,review,reviewKey); await context.command('teacher',reviewPath,review,reviewKey);
  const decision = await context.command('teacher',`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'private sentinel approval',editedActivityTitle:proposal.activityTitle,editedInstructions:proposal.instructions});
  await context.command('strong',`/v1/interventions/${decision.interventionId}/complete`,{reflection:'private sentinel reflection'});
  const followup = await customerReleased(context,'strong',course.courseId,'Private followup metadata',7);
  await context.command('teacher',`/v1/interventions/${decision.interventionId}/reassessment`,{assessmentId:followup.assessmentId});
  await context.command('teacher',`/v1/interventions/${decision.interventionId}/measure`,{followUpResultId:followup.resultId,minimumChange:1});
  await context.drain();
  const originalActor = (await context.client.query("select current_setting('app.actor_id',true)as actor,current_setting('app.school_id',true)as school")).rows[0];
  await events();
  expect((await context.client.query("select current_setting('app.actor_id',true)as actor,current_setting('app.school_id',true)as school")).rows[0]).toEqual(originalActor);
  const runPseudonym = createHmac('sha256',config.pseudonymKey).update(`posthog:393668:v1:intelligence-run:${context.school}:${proposal.intelligenceRunId}`).digest('hex');
  const runEvents = captured.filter(event=>event.properties.intelligence_run===runPseudonym);
  expect(runEvents.map(event=>event.event)).toEqual(expect.arrayContaining(['cuevo_intelligence_run_observed','cuevo_intelligence_quality_reviewed','recommendation_reviewed','intervention_completed','reassessment_linked','outcome_measured']));
  expect(runEvents.filter(event=>event.event==='cuevo_intelligence_run_observed')).toHaveLength(1);
  expect(runEvents.filter(event=>event.event==='cuevo_intelligence_quality_reviewed')).toHaveLength(1);
  const observed = runEvents.find(event=>event.event==='cuevo_intelligence_run_observed');
  expect(observed?.properties).toMatchObject({generation_mode:'FIXTURE',ai_provider:'deterministic-fixture',ai_model:'source-locked-v1',run_state:'PROPOSAL_READY',output_observation:'ACCEPTED',input_tokens:0,output_tokens:0,cost_basis:'DETERMINISTIC_FIXTURE',estimated_cost_usd:0,reserved_budget_usd:0,billed_cost_status:'UNKNOWN',context_reference:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(runEvents.find(event=>event.event==='cuevo_intelligence_quality_reviewed')?.properties).toMatchObject({quality_usefulness:'USEFUL',quality_grounding:'SUPPORTED',quality_privacy:'UNKNOWN',quality_tool_safety:'UNKNOWN'});
  expect(runEvents.find(event=>event.event==='recommendation_reviewed')?.properties.decision_override).toBe(false);
  expect(runEvents.find(event=>event.event==='outcome_measured')?.properties).toMatchObject({outcome_status:'improved',outcome_model:'numeric',outcome_comparability:'COMPARABLE'});
  expect(new Set(captured.map(event=>event.properties.$insert_id)).size).toBe(captured.length);
  expect(JSON.stringify(captured)).not.toMatch(/private sentinel|Private|baselineResultId|followUpResultId|score|feedback|reflection|recommendationId|runId|contextDigest|intelligenceRunId/);
  expect(JSON.stringify(captured)).not.toContain(String(proposal.intelligenceRunId));
  expect((await context.client.query("select count(*)::integer count from internal.posthog_delivery receipt join internal.outbox_events event on event.id=receipt.event_id where event.school_id=$1 and receipt.state='ACCEPTED'",[context.school])).rows[0].count).toBe(captured.length);
  expect((await context.client.query('select internal.posthog_delivery_due()as due')).rows[0].due).toBe(false);
 },60000);

 it('records rejected and unevaluated output once, preserves null usage and denies stale source disclosure',async () => {
  const course = await customerCourse(context,'Private failure metadata');
  const baseline = await customerReleased(context,'strong',course.courseId,'Private failure baseline',3); await context.drain();
  // Normal fixture factory establishes an actual school execution binding; no external provider is called.
  await context.command('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId});
  const registry = (await context.request('teacher','/v1/intelligence/execution')).json();
  const policy = (await context.request('admin','/v1/intelligence/policy')).json().policy;
  const settings = {mode:'FIXTURE',provider:registry.binding.manifest.provider,model:registry.binding.manifest.model,promptId:registry.binding.manifest.promptId,promptVersion:registry.binding.manifest.promptVersion,promptDigest:registry.binding.manifest.promptDigest,executionManifest:registry.binding.manifest,policyVersion:policy.version,timeoutMs:registry.binding.manifest.timeoutMs,maxTokens:registry.binding.manifest.maxOutputTokens,maxCost:registry.binding.manifest.maxCost,costBasis:'DETERMINISTIC_FIXTURE'};
  const rollbackKey=randomUUID();
  await context.client.query('BEGIN');
  try {
   await context.client.query('set local role cuevo_api');
   await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)",[customerActor(4),context.school]);
   const aborted=(await context.client.query('select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5)as run',[rollbackKey,'b'.repeat(64),baseline.resultId,JSON.stringify(settings),'rollback-observation'])).rows[0].run;
   await context.client.query('select internal.fail_intelligence_run($1,$2,$3,$4,$5)',[aborted.runId,aborted.leaseToken,'INTELLIGENCE_REQUIRES_REVIEW','rollback-observation',true]);
   await context.client.query('ROLLBACK');
  } catch(error) { await context.client.query('ROLLBACK'); throw error; }
  expect((await context.client.query('select count(*)::integer count from app.intelligence_runs where school_id=$1 and command_key=$2',[context.school,rollbackKey])).rows[0].count).toBe(0);
  const failureRuns:string[]=[];
  for (const rejected of [true,false]) {
   await context.client.query('BEGIN');
   try {
    await context.client.query('set local role cuevo_api');
    await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)",[customerActor(4),context.school]);
    const reservation = (await context.client.query('select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5)as run',[randomUUID(),'a'.repeat(64),baseline.resultId,JSON.stringify(settings),'posthog-metadata-fixture'])).rows[0].run;
    failureRuns.push(reservation.runId);
    await context.client.query('select internal.fail_intelligence_run($1,$2,$3,$4,$5)',[reservation.runId,reservation.leaseToken,rejected?'INTELLIGENCE_REQUIRES_REVIEW':'INTELLIGENCE_PROVIDER_FAILED','posthog-metadata-fixture',rejected]);
    await context.client.query('reset role'); await context.client.query('COMMIT');
   } catch(error) { await context.client.query('ROLLBACK'); throw error; }
  }
  await context.client.query('BEGIN');
  let expiredRunId:string;
  try {
   await context.client.query('set local role cuevo_api');
   await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)",[customerActor(4),context.school]);
   const expired=(await context.client.query('select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5)as run',[randomUUID(),'c'.repeat(64),baseline.resultId,JSON.stringify(settings),'expired-observation'])).rows[0].run;
   expiredRunId=expired.runId;
   await context.client.query('reset role');
   await context.client.query("update app.intelligence_runs set lease_until=clock_timestamp()-interval'1 second'where school_id=$1 and id=$2",[context.school,expiredRunId]);
   await context.client.query('COMMIT');
  } catch(error) { await context.client.query('ROLLBACK'); throw error; }
  expect((await context.request('teacher',`/v1/intelligence/runs/${expiredRunId}`)).json().state).toBe('FAILED');
  expect((await context.request('teacher',`/v1/intelligence/runs/${expiredRunId}`)).json().state).toBe('FAILED');
  expect((await context.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and type='intelligence.run_observed'and entity_id=$2",[context.school,expiredRunId])).rows[0].count).toBe(1);
  await context.drain(); await events();
  for (const [index,runId] of failureRuns.entries()) {
   const key=createHmac('sha256',config.pseudonymKey).update(`posthog:393668:v1:intelligence-run:${context.school}:${runId}`).digest('hex');
   const items=captured.filter(event=>event.event==='cuevo_intelligence_run_observed'&&event.properties.intelligence_run===key);
   expect(items).toHaveLength(1);expect(items[0].properties).toMatchObject({run_state:'FAILED',output_observation:index===0?'REJECTED':'NOT_EVALUATED',input_tokens:null,output_tokens:null,ai_latency_ms:null,estimated_cost_usd:null,reserved_budget_usd:0,billed_cost_status:'UNKNOWN'});
  }
  const timeoutKey=createHmac('sha256',config.pseudonymKey).update(`posthog:393668:v1:intelligence-run:${context.school}:${expiredRunId}`).digest('hex');
  const timeoutEvents=captured.filter(event=>event.event==='cuevo_intelligence_run_observed'&&event.properties.intelligence_run===timeoutKey);
  expect(timeoutEvents).toHaveLength(1);expect(timeoutEvents[0].properties).toMatchObject({run_state:'FAILED',failure_code:'INTELLIGENCE_TIMEOUT',output_observation:'NOT_EVALUATED',input_tokens:null,estimated_cost_usd:null});
  const pending = await context.command('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId}); await context.drain();
  const sourceEvent=(await context.client.query("select id from internal.outbox_events where school_id=$1 and type='intelligence.run_observed'and entity_id=$2",[context.school,pending.intelligenceRunId])).rows[0];
  expect((await context.client.query('select internal.posthog_event_context($1)as context',[sourceEvent.id])).rows[0].context).not.toBeNull();
  const forged=randomUUID();
  await context.client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,completed_at)values($1,$2,$3,'intelligence.run_observed','intelligence_run',$4,2,'{\"intelligenceSchemaVersion\":1}',$5,'COMPLETED',clock_timestamp())",[context.school,forged,customerActor(4),pending.intelligenceRunId,'forged-version:'+forged]);
  expect((await context.client.query('select internal.intelligence_observability_source_allowed($1)as allowed',[forged])).rows[0].allowed).toBe(false);
  expect((await context.client.query('select internal.posthog_source_event_allowed($1)as allowed',[forged])).rows[0].allowed).toBe(false);
  const previous=(await context.client.query("select current_setting('app.actor_id',true)as actor,current_setting('app.school_id',true)as school")).rows[0];
  await context.client.query("update app.teacher_assignments set status='revoked'where school_id=$1 and teacher_actor_id=$2",[context.school,customerActor(4)]);
  expect((await context.client.query('select internal.posthog_event_context($1)as context',[sourceEvent.id])).rows[0].context).toBeNull();
  expect((await context.client.query('select internal.posthog_source_event_allowed($1)as allowed',[sourceEvent.id])).rows[0].allowed).toBe(false);
  expect((await context.client.query("select current_setting('app.actor_id',true)as actor,current_setting('app.school_id',true)as school")).rows[0]).toEqual(previous);
 },60000);
});
