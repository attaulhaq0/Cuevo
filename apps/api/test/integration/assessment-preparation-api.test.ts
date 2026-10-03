import{afterAll,beforeAll,describe,expect,it}from'vitest';
import{createCustomerContext,customerCourse,type CustomerContext}from'./customer-test-context';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('private assessment preparation and closed quiz review',()=>{
 let context:CustomerContext;let courseId:string;
 beforeAll(async()=>{context=await createCustomerContext();courseId=(await customerCourse(context,'Teacher prepared assignments')).courseId;},30000);
 afterAll(async()=>{await context?.close();});
 it('prepares a closed private draft and publishes only a complete versioned objective configuration',async()=>{
  const draft=await context.command('teacher','/v1/assessments',{courseId,title:'Prepared explanation',instructions:'Draft instructions',maxScore:10,preparation:true,intendedSubmissionKind:'TEXT',intendedModel:'numeric'});expect(draft).toMatchObject({status:'DRAFT',assignmentState:'CLOSED',preparationVersion:1});
  const learners=await context.request('strong','/v1/assessments?limit=100');expect(learners.statusCode).toBe(200);expect(learners.json().items.some((item:{id:string})=>item.id===draft.id)).toBe(false);
  const parent=await context.request('parent','/v1/assessments?limit=100');expect(parent.statusCode).toBe(200);expect(parent.json().items.some((item:{id:string})=>item.id===draft.id)).toBe(false);
  expect((await context.request('otherTeacher',`/v1/assessments/${draft.id}/preparation`,{title:'Foreign preparation',instructions:'Cannot edit',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:null,expectedPreparationVersion:1})).statusCode).toBe(403);
  expect((await context.request('strong',`/v1/assessments/${draft.id}/submissions`,{content:'A learner cannot race preparation.'})).statusCode).toBe(409);
  expect((await context.request('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:1,expectedPolicyVersion:1,expectedAvailabilityVersion:1})).statusCode).toBe(409);
  const edited=await context.command('teacher',`/v1/assessments/${draft.id}/preparation`,{title:'Reviewed explanation',instructions:'Reviewed teacher instructions',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:null,expectedPreparationVersion:1});expect(edited).toMatchObject({status:'DRAFT',title:'Reviewed explanation',policyVersion:2,preparationVersion:2});
  expect((await context.request('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:1,expectedPolicyVersion:2,expectedAvailabilityVersion:1})).statusCode).toBe(409);
  const published=await context.command('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:2,expectedPolicyVersion:2,expectedAvailabilityVersion:1});expect(published).toMatchObject({status:'PUBLISHED',assignmentState:'OPEN'});
  await context.command('strong',`/v1/assessments/${draft.id}/submissions`,{content:'Reviewed task work'});
  expect((await context.request('teacher',`/v1/assessments/${draft.id}/preparation`,{title:'Changed used work',instructions:'Other instructions',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:null,expectedPreparationVersion:published.preparationVersion})).statusCode).toBe(409);
 });
 it('requires the intended rubric before publication and retains native rubric semantics',async()=>{
  const draft=await context.command('teacher','/v1/assessments',{courseId,title:'Rubric prepared explanation',instructions:'Explain both criteria',maxScore:10,preparation:true,intendedModel:'rubric',intendedSubmissionKind:'TEXT'});
  const rubric=await context.command('teacher','/v1/rubrics',{courseId,title:'School explanation rubric',version:'school-preparation-1',criteria:[{key:'explanation',title:'Explanation',levels:[{key:'shown',label:'Shown',description:'The explanation is shown.'}]}]});
  const edited=await context.command('teacher',`/v1/assessments/${draft.id}/preparation`,{title:'Rubric prepared explanation',instructions:'Explain the criterion',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:rubric.id,expectedPreparationVersion:1});expect(edited).toMatchObject({model:'rubric',rubricId:rubric.id});expect(edited).not.toHaveProperty('maxScore');
  const published=await context.command('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:edited.preparationVersion,expectedPolicyVersion:edited.policyVersion,expectedAvailabilityVersion:edited.availabilityVersion});expect(published).toMatchObject({model:'rubric',status:'PUBLISHED'});
 });
 it('pins quiz feedback after closure while denying new attempts and draft enumeration',async()=>{
  const draft=await context.command('teacher','/v1/assessments',{courseId,title:'Prepared question',instructions:'Choose the teacher example',maxScore:10,preparation:true,intendedModel:'numeric',intendedSubmissionKind:'QUIZ'});
  let edited=await context.command('teacher',`/v1/assessments/${draft.id}/preparation`,{title:'Prepared question',instructions:'Choose the teacher example',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:null,expectedPreparationVersion:1});
  expect((await context.request('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:edited.preparationVersion,expectedPolicyVersion:edited.policyVersion,expectedAvailabilityVersion:edited.availabilityVersion})).statusCode).toBe(409);
  const quiz=await context.command('teacher',`/v1/assessments/${draft.id}/quiz`,{version:'school-quiz-1',questions:[{key:'q',prompt:'Choose the reviewed answer',options:[{key:'a',label:'First explanation'},{key:'b',label:'Checked explanation'}],correctOptionKey:'b'}]});
  expect((await context.request('strong',`/v1/assessments/${draft.id}/quiz`)).statusCode).toBe(403);
  await context.command('teacher',`/v1/assessments/${draft.id}/quiz/publish`,{quizId:quiz.id,expectedPolicyVersion:edited.policyVersion});
  edited=(await context.request('teacher','/v1/assessments?limit=100')).json().items.find((item:{id:string})=>item.id===draft.id);
  const published=await context.command('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:edited.preparationVersion,expectedPolicyVersion:edited.policyVersion,expectedAvailabilityVersion:edited.availabilityVersion});
  const attempt=await context.command('strong',`/v1/assessments/${draft.id}/quiz/attempts`,{quizId:quiz.id,answers:[{questionKey:'q',optionKey:'a'}]});expect(attempt).toMatchObject({status:'CHECKED_NOT_GRADED'});
  await context.command('teacher',`/v1/assessments/${draft.id}/availability`,{availableFrom:null,availableUntil:null,allowLate:false,state:'CLOSED',expectedAvailabilityVersion:published.availabilityVersion});
  const history=await context.request('strong',`/v1/assessments/${draft.id}/quiz`);expect(history.statusCode,history.body).toBe(200);expect(history.json()).toMatchObject({id:quiz.id});expect(history.body).not.toContain('correctOptionKey');
  const attemptHistory=await context.request('strong',`/v1/assessments/${draft.id}/quiz/attempts?limit=100`);expect(attemptHistory.statusCode).toBe(200);expect(attemptHistory.json().items).toHaveLength(1);expect(attemptHistory.json().items[0]).toMatchObject({id:attempt.id,quizId:quiz.id,checkedAnswers:[{questionKey:'q',optionKey:'a',status:'INCORRECT'}]});
  expect((await context.request('observed',`/v1/assessments/${draft.id}/quiz/attempts`,{quizId:quiz.id,answers:[{questionKey:'q',optionKey:'b'}]})).statusCode).toBe(409);
 });
});
