import {afterAll,beforeAll,describe,expect,it}from'vitest';
import{config as dotenv}from'dotenv';
import{randomUUID}from'node:crypto';
import{Database}from'../../src/platform/database/database';
import{createCustomerContext,customerCourse,customerReleased,type CustomerContext}from'./customer-test-context';
dotenv({path:'.env.local',quiet:true});
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('frozen Teacher Insight policy and cited reasoning actual Auth API',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},60000);afterAll(async()=>{await context?.close();});
 it('propagates approved prompt/action policy, retains chosen source and keeps human control',async()=>{
  const course=await customerCourse(context,'Checked teacher insight');const baseline=await customerReleased(context,'strong',course.courseId,'Current explanation',3);await context.drain();
  const key=randomUUID();const proposal=await context.command('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId},key);
  expect(proposal).toMatchObject({status:'AWAITING_HUMAN',selectedActivityId:course.practiceId,analysis:{basis:'SINGLE_RESULT',resultIds:[baseline.resultId]},promptDigest:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect((await context.request('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId},key)).json()).toEqual(proposal);
  const run=(await context.client.query('select prompt_version,prompt_digest,allowed_actions,grounded_output from app.intelligence_runs where school_id=$1 and id=$2',[context.school,proposal.intelligenceRunId])).rows[0];
  expect(run.prompt_version).toBe('2');expect(run.grounded_output.selectedActivityId).toBe(course.practiceId);expect(run.allowed_actions).toEqual(['GUIDED_PRACTICE','REVIEW_FEEDBACK']);
  expect((await context.request('parent','/v1/intelligence/analyze',{baselineResultId:baseline.resultId})).statusCode).toBe(403);
  const approved=await context.command('teacher',`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Teacher checked cited evidence.'});
  const tasks=await context.request('strong','/v1/interventions?limit=100');expect(tasks.json().items.find((item:{id:string})=>item.id===approved.interventionId)).toMatchObject({selectedActivityId:course.practiceId,analysis:{basis:'SINGLE_RESULT'}});
 });
 it('works with feedback-only school policy and uses real recorded-practice citations',async()=>{
  await context.client.query("update app.intelligence_policies set allowed_actions=array['REVIEW_FEEDBACK']::text[] where school_id=$1",[context.school]);
  const course=await customerCourse(context,'Practice-informed teacher insight');const baseline=await customerReleased(context,'observed',course.courseId,'Practice source',3);const completion=await context.command('observed',`/v1/activities/${course.practiceId}/complete`,{});await context.drain();
  const proposal=await context.command('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId});expect(proposal.selectedActivityId).toBeNull();expect(proposal.analysis).toMatchObject({basis:'RECORDED_PRACTICE',observationIds:[expect.any(String)]});
  const source=(await context.client.query('select id from app.habit_observations where school_id=$1 and source_object_id=$2',[context.school,completion.id])).rows[0].id;
  expect((proposal.analysis as {observationIds:string[]}).observationIds).toEqual([source]);expect(proposal.recommendation).toMatch(/feedback/i);
 });
 it('lists own safe run status and reconciles an expired reservation without generation',async()=>{
  const statusContext=await createCustomerContext({committed:true});
  try{
  const context=statusContext;
  const course=await customerCourse(context,'Analysis status source');const baseline=await customerReleased(context,'strong',course.courseId,'Status baseline',3);await context.drain();
  const actorDatabase=new Database(process.env.DATABASE_URL);let reserved:{runId:string};
  try{reserved=await actorDatabase.actorTransaction('20000000-0000-4000-8000-000000000004',context.school,async client=>(await client.query("select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5)as run",['api-status-timeout','a'.repeat(64),baseline.resultId,JSON.stringify({mode:'FIXTURE',provider:'deterministic-fixture',model:'source-locked-v1',promptId:'next-learning-action',promptVersion:'2',promptDigest:'1f892110e486d0f8117e53ef9d9cf0a884b7c155821dd8eb1284cef22b9f0de4',policyVersion:1,timeoutMs:30000,maxTokens:1000,maxCost:1,costBasis:'DETERMINISTIC_FIXTURE'}),'status-api'])).rows[0].run);}finally{await actorDatabase.close();}
  await context.client.query("update app.intelligence_runs set lease_until=clock_timestamp()-interval'1 second'where school_id=$1 and id=$2",[context.school,reserved.runId]);
  const statuses=await Promise.all([context.request('teacher',`/v1/intelligence/runs/${reserved.runId}`),context.request('teacher',`/v1/intelligence/runs/${reserved.runId}`)]);for(const status of statuses){expect(status.statusCode,status.body).toBe(200);expect(status.json()).toMatchObject({id:reserved.runId,state:'FAILED',failureCode:'INTELLIGENCE_TIMEOUT',cost:null});expect(status.body).not.toMatch(/leaseToken|commandKey|contextReferences|raw answer/i);}
  expect((await context.request('parent',`/v1/intelligence/runs/${reserved.runId}`)).statusCode).toBe(403);expect((await context.request('otherTeacher',`/v1/intelligence/runs/${reserved.runId}`)).statusCode).toBe(403);
  expect((await context.client.query('select count(*)::integer count from app.recommendations where school_id=$1 and intelligence_run_id=$2',[context.school,reserved.runId])).rows[0].count).toBe(0);
  expect((await context.client.query("select count(*)::integer count from internal.audit_events where school_id=$1 and entity_id=$2 and action='intelligence.failed'",[context.school,reserved.runId])).rows[0].count).toBe(1);
  }finally{await statusContext.close();}
 });
});
