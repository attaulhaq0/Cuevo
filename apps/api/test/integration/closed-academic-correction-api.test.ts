import{afterAll,beforeAll,describe,it,expect}from'vitest';
import{randomUUID}from'node:crypto';
import{createCustomerContext,customerCourse,customerAssessment,customerReleased,type CustomerContext}from'./customer-test-context';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('purpose-specific closed native academic correction and revision history',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},30000);afterAll(async()=>{await context?.close();});
 it('corrects a closed numeric release once without reopening or rewriting prior source evidence',async()=>{
  const course=await customerCourse(context,'Closed numeric review');const first=await customerReleased(context,'strong',course.courseId,'Reviewed explanation',3);await context.command('teacher',`/v1/submissions/${first.submissionId}/close`,{expectedRevision:1});
  const page=await context.request('teacher','/v1/marking?limit=100');expect(page.statusCode).toBe(200);expect(page.json().items.find((item:{id:string})=>item.id===first.submissionId).currentResult).toMatchObject({id:first.markingId,resultId:first.resultId,status:'RELEASED'});
  const ordinary={score:5,feedback:'Ordinary path denied',expectedPolicyVersion:2,expectedRevision:1,sourceEvidence:true};expect((await context.request('teacher',`/v1/submissions/${first.submissionId}/results`,ordinary)).statusCode).toBe(403);
  const body={...ordinary,feedback:'Reviewed corrected score',reason:'Teacher found a transcription error',expectedSubmissionRevision:1,expectedResultId:first.resultId,expectedResultRevision:1,parentVisible:false};const key=randomUUID();
  expect((await context.request('parent',`/v1/submissions/${first.submissionId}/closed-result`,body)).statusCode).toBe(403);expect((await context.request('otherTeacher',`/v1/submissions/${first.submissionId}/closed-result`,body)).statusCode).toBe(403);
  const corrected=await context.command('teacher',`/v1/submissions/${first.submissionId}/closed-result`,body,key);expect(corrected).toMatchObject({submissionId:first.submissionId,score:5,revision:2,status:'RELEASED'});
  expect((await context.request('teacher',`/v1/submissions/${first.submissionId}/closed-result`,body,key)).json()).toEqual(corrected);
  expect((await context.client.query('select state from app.current_submissions where school_id=$1 and submission_id=$2',[context.school,first.submissionId])).rows[0].state).toBe('CLOSED');
  const history=await context.request('strong',`/v1/results/${corrected.id}/history?limit=100`);expect(history.statusCode,history.body).toBe(200);expect(history.json().items).toEqual(expect.arrayContaining([expect.objectContaining({id:first.resultId,score:3}),expect.objectContaining({id:corrected.id,score:5})]));expect(history.body).not.toContain('Teacher found a transcription error');
  const staff=await context.request('teacher',`/v1/results/${corrected.id}/history?limit=100`);expect(staff.statusCode).toBe(200);expect(staff.json().items.find((item:{id:string})=>item.id===corrected.id).correctionReason).toBe(body.reason);
  const parent=await context.request('parent',`/v1/results/${first.resultId}/history?limit=100`);expect(parent.statusCode).toBe(200);expect(parent.json().items.map((item:{id:string})=>item.id)).toEqual([first.resultId]);
  expect((await context.client.query('select count(*)::integer count from internal.closed_academic_write_scope where school_id=$1',[context.school])).rows[0].count).toBe(0);
  expect((await context.request('teacher',`/v1/submissions/${first.submissionId}/closed-result`,body)).statusCode).toBe(409);
 });
 it('releases deliberately reviewed closed unmarked work and keeps rubric correction native',async()=>{
  const course=await customerCourse(context,'Closed rubric review');const assessmentId=await customerAssessment(context,course.courseId,'Closed rubric explanation');const rubric=await context.command('teacher','/v1/rubrics',{courseId:course.courseId,title:'Explanation rubric',version:'closed-rubric-1',criteria:[{key:'method',title:'Method',levels:[{key:'partial',label:'Partial',description:'Method partly shown'},{key:'shown',label:'Shown',description:'Method clearly shown'}]}]});await context.command('teacher',`/v1/assessments/${assessmentId}/rubric`,{rubricId:rubric.id,expectedPolicyVersion:2});
  const submission=await context.command('strong',`/v1/assessments/${assessmentId}/submissions`,{content:'School explanation'});await context.command('teacher',`/v1/submissions/${submission.id}/close`,{expectedRevision:1});
  const base={nativeResult:{type:'rubric',rubricId:rubric.id,criteria:[{criterionKey:'method',levelKey:'partial'}]},feedback:'Teacher reviewed the closed source',reason:'Closed before the scheduled academic review',expectedPolicyVersion:3,expectedRevision:0,expectedSubmissionRevision:1,expectedResultId:null,expectedResultRevision:0,parentVisible:true,sourceEvidence:true};
  const released=await context.command('teacher',`/v1/submissions/${submission.id}/closed-result`,base);expect(released).toMatchObject({model:'rubric',revision:1,nativeResult:{criteria:[{levelLabel:'Partial'}]}});expect(released).not.toHaveProperty('score');
  const corrected=await context.command('teacher',`/v1/submissions/${submission.id}/closed-result`,{...base,nativeResult:{...base.nativeResult,criteria:[{criterionKey:'method',levelKey:'shown'}]},expectedRevision:1,expectedResultId:released.id,expectedResultRevision:1,reason:'Review found the full criterion was demonstrated.'});expect(corrected.nativeResult).toMatchObject({criteria:[{levelLabel:'Shown'}]});expect(corrected).not.toHaveProperty('maxScore');
  const history=await context.request('teacher',`/v1/results/${corrected.id}/history?limit=100`);expect(history.statusCode).toBe(200);expect(history.json().items).toHaveLength(2);expect(history.body).not.toContain('School explanation');
 });
});
