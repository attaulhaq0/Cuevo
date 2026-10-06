import{beforeAll,afterAll,describe,it,expect}from'vitest';import{createCustomerContext,customerCourse,type CustomerContext}from'./customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('exact next-action sources',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},60000);afterAll(async()=>{await context?.close();});
 it('resolves one current assessment and marking source with current scope',async()=>{
  const course=await customerCourse(context,'Named next action');const task=await context.command('teacher','/v1/assessments',{courseId:course.courseId,title:'Exact next action',instructions:'Explain current task.',maxScore:10});
  const exact=await context.request('strong',`/v1/assessments/${task.id}`);expect(exact.statusCode).toBe(200);expect(exact.json()).toMatchObject({id:task.id,title:'Exact next action',currentSubmission:null});
  const submission=await context.command('strong',`/v1/assessments/${task.id}/submissions`,{content:'Exact source answer.'});const marking=await context.request('teacher',`/v1/marking/${submission.id}`);expect(marking.statusCode).toBe(200);expect(marking.json()).toMatchObject({id:submission.id,assessmentId:task.id,content:'Exact source answer.'});
  expect((await context.request('otherTeacher',`/v1/marking/${submission.id}`)).statusCode).toBe(403);expect((await context.request('parent',`/v1/marking/${submission.id}`)).statusCode).toBe(403);
  await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3",[context.school,context.classId,'20000000-0000-4000-8000-000000000012']);
  expect((await context.request('strong',`/v1/assessments/${task.id}`)).statusCode).toBe(403);expect((await context.request('teacher',`/v1/marking/${submission.id}`)).statusCode).toBe(403);
 });
});
