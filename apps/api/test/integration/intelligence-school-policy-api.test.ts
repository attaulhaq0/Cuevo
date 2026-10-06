import{afterAll,beforeAll,describe,expect,it}from'vitest';import{config as dotenv}from'dotenv';import{randomUUID}from'node:crypto';import{createCustomerContext,customerCourse,customerReleased,type CustomerContext}from'./customer-test-context';
dotenv({path:'.env.local',quiet:true});
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('school-approved intelligence purpose actual Auth API',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},60000);afterAll(async()=>{await context?.close();});
 it('approves only school admin actions, replays once and uses the approved current version',async()=>{
  const course=await customerCourse(context,'Current school policy insight');const baseline=await customerReleased(context,'strong',course.courseId,'Current source policy',3);await context.drain();
  const original=await context.command('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId});expect(original.intelligenceRunId).toBeTruthy();
  const before=await context.request('admin','/v1/intelligence/policy');expect(before.statusCode).toBe(200);const input={purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['REVIEW_FEEDBACK'],expectedVersion:before.json().policy.version,confirmApproval:true,reason:'Teacher insight limited to feedback review.'};
  expect((await context.request('teacher','/v1/intelligence/policy',input)).statusCode).toBe(403);expect((await context.request('parent','/v1/intelligence/policy')).statusCode).toBe(403);
  const key=randomUUID();const policy=await context.command('admin','/v1/intelligence/policy',input,key);expect(policy.policy).toMatchObject({version:input.expectedVersion+1,allowedActions:['REVIEW_FEEDBACK']});expect((await context.request('admin','/v1/intelligence/policy',input,key)).json()).toEqual(policy);
  const refreshed=await context.request('teacher','/v1/recommendations');expect(refreshed.statusCode).toBe(200);expect(refreshed.json().items).not.toEqual(expect.arrayContaining([expect.objectContaining({id:original.id})]));
  expect((await context.request('teacher',`/v1/recommendations/${original.id}/decision`,{decision:'APPROVE',reason:'An old policy cannot authorize this proposal.'})).statusCode).toBe(403);
  const proposal=await context.command('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId});expect(proposal.selectedActivityId).toBeNull();expect(proposal.recommendation).toMatch(/feedback/i);
  const freshList=await context.request('teacher','/v1/recommendations');expect(freshList.statusCode).toBe(200);expect(freshList.json().items).toEqual(expect.arrayContaining([expect.objectContaining({id:proposal.id})]));expect(freshList.json().items).toHaveLength(1);
  await context.command('admin','/v1/intelligence/policy',{...input,fixtureEnabled:false,expectedVersion:input.expectedVersion+1,reason:'School paused new analysis.'});expect((await context.request('teacher','/v1/intelligence/analyze',{baselineResultId:baseline.resultId})).statusCode).toBe(409);
  const pausedList=await context.request('teacher','/v1/recommendations');expect(pausedList.statusCode).toBe(200);expect(pausedList.json().items).toEqual([]);
 });
 it('cannot activate live analysis from fixture credentials/configuration',async()=>{
  const current=(await context.request('admin','/v1/intelligence/policy')).json().policy;
  const result=await context.request('admin','/v1/intelligence/policy',{purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:false,liveEnabled:true,allowedActions:['REVIEW_FEEDBACK'],expectedVersion:current.version,confirmApproval:true,reason:'Not an approved live deployment.'});expect(result.statusCode).toBe(503);
 });
});
