import{afterAll,beforeAll,describe,expect,it}from'vitest';
import{createCustomerContext,customerCourse,customerReleased,type CustomerContext}from'./customer-test-context';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('source changed support remains visible requiring review',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},30000);afterAll(async()=>{await context?.close();});
 it('API retains historical assignment and explicitly blocks new completion after baseline correction',async()=>{
  const course=await customerCourse(context,'Historical support');const source=await customerReleased(context,'strong',course.courseId,'Reviewed original source',2);
  const proposal=await context.command('teacher','/v1/recommendations',{baselineResultId:source.resultId,observation:'Recorded native source',interpretation:'Teacher selection',recommendation:'Try school practice',rationale:'Source evidence',uncertainty:'Not causal proof',activityTitle:'Teacher practice',instructions:'Review school example'});
  const decision=await context.command('teacher',`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Human reviewed'});
  const correction=await context.command('teacher',`/v1/submissions/${source.submissionId}/results`,{score:6,feedback:'Human correction',expectedPolicyVersion:2,expectedRevision:1,sourceEvidence:true});await context.command('teacher',`/v1/results/${correction.id}/release`,{expectedRevision:2,parentVisible:true});
  const history=await context.request('strong','/v1/interventions?limit=100');expect(history.statusCode).toBe(200);expect(history.json().items.find((item:{id:string})=>item.id===decision.interventionId)).toMatchObject({requiresReview:true,reviewReason:'ACADEMIC_SOURCE_CHANGED',baselineResultId:source.resultId,status:'ASSIGNED'});
  expect((await context.request('strong',`/v1/interventions/${decision.interventionId}/complete`,{})).statusCode).toBe(403);
 });
});
