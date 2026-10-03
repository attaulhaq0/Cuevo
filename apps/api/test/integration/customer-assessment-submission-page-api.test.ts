import {afterAll,beforeAll,describe,expect,it,afterEach}from'vitest';
import {randomUUID}from'node:crypto';
import {createCustomerContext,customerActor,customerCourse,customerProgramme,type CustomerContext}from'./customer-test-context';

import{CooperativeFixtureScope}from'./cooperative-fixture-scope';
import{cooperativeCustomerContext}from'./cooperative-customer-context';
import{withFixtureCleanup}from'./fixture-cleanup';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('customer assessment-page exact current own source',()=>{
 let context:CustomerContext;let courseId:string;let assessmentId:string;let submissionId:string;
 let ownerContext:CustomerContext;let caseScope:CooperativeFixtureScope|undefined;
 function journey(budgetMs:number,work:()=>Promise<void>){const scope=new CooperativeFixtureScope(budgetMs);caseScope=scope;context=cooperativeCustomerContext(ownerContext,scope);return scope.run(work);}
 beforeAll(async()=>{
  ownerContext=await createCustomerContext();context=ownerContext;courseId=(await customerCourse(context,'Ordinary subject assignments')).courseId;
  const assessment=await context.command('teacher','/v1/assessments',{courseId,title:'Explanation for review',instructions:'Explain your reasoning.',maxScore:10});assessmentId=assessment.id;
  submissionId=(await context.command('strong',`/v1/assessments/${assessmentId}/submissions`,{content:'My original explanation.'})).id;
  // Accumulated ordinary records reproduce the independent first-100 source-page mismatch.
  const assessments:string[]=[];for(let index=1;index<=101;index++)assessments.push(randomUUID());
  await context.client.query("insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score)select $1,id,$2,$3,'Earlier school assignment '||ordinal,'Explain the school task.',10 from unnest($4::uuid[])with ordinality value(id,ordinal)",[context.school,courseId,customerActor(4),assessments]);
  await context.client.query("insert into app.submissions(school_id,id,assessment_id,learner_id,content)select $1,('00000000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid,id,$2,'Earlier own work'from unnest($3::uuid[])with ordinality value(id,ordinal)",[context.school,customerActor(12),assessments]);
 },30000);
 afterEach(async()=>{await withFixtureCleanup(async()=>{await caseScope?.cancelAndWait();},[()=>ownerContext.client.query('RESET ROLE'),()=>{caseScope=undefined;}]);});
 afterAll(async()=>{await withFixtureCleanup(async()=>{await caseScope?.cancelAndWait();},[()=>ownerContext?.close()]);});
 const assessmentPage=async(role:'strong'|'observed'|'parent'|'teacher'|'admin'|'coordinator',target=assessmentId)=>{
  let cursor:string|null=null;const ids:string[]=[];
  do{const response=await context.request(role,`/v1/assessments?limit=100${cursor?`&cursor=${cursor}`:''}`);expect(response.statusCode,response.body).toBe(200);expect(Buffer.byteLength(response.body)).toBeLessThanOrEqual(500000);const page=response.json();ids.push(...page.items.map((item:{id:string})=>item.id));expect(new Set(ids).size).toBe(ids.length);const found=page.items.find((item:{id:string})=>item.id===target);if(found)return found as Record<string,unknown>;cursor=page.nextCursor;}while(cursor);
  return undefined;
 };
 it('finds RETURNED source and teacher feedback beyond the independent first 100 submissions',()=>journey(60000,async()=>{
  const returned=await context.command('teacher',`/v1/submissions/${submissionId}/return`,{feedback:'Explain the checking step.',expectedRevision:1});
  const sources=await context.request('strong','/v1/submissions?limit=100');expect(sources.statusCode,sources.body).toBe(200);expect(sources.json().items).toHaveLength(100);expect(sources.json().nextCursor).toEqual(expect.any(String));expect(sources.json().items.some((source:{id:string})=>source.id===submissionId)).toBe(false);
  expect((await assessmentPage('strong'))?.currentSubmission).toMatchObject({id:submissionId,assessmentId,learnerId:customerActor(12),content:'My original explanation.',status:'RETURNED',revision:1,returnId:returned.id,returnFeedback:'Explain the checking step.'});
 }),60000);
 it('uses the latest immutable resubmission and preserves it when the assignment is closed',()=>journey(60000,async()=>{
  const current=(await assessmentPage('strong'))!.currentSubmission as{id:string;returnId:string};
  const revised=await context.command('strong',`/v1/submissions/${current.id}/resubmit`,{content:'My explanation after checking.',returnId:current.returnId,expectedRevision:1});
  expect((await assessmentPage('strong'))?.currentSubmission).toMatchObject({id:revised.id,status:'RESUBMITTED',revision:2,previousSubmissionId:submissionId,sourceReturnId:current.returnId,content:'My explanation after checking.'});
  await context.command('teacher',`/v1/submissions/${revised.id}/close`,{expectedRevision:2});
  await context.command('teacher',`/v1/assessments/${assessmentId}/availability`,{availableFrom:null,availableUntil:null,allowLate:false,state:'CLOSED',expectedAvailabilityVersion:1});
  expect((await assessmentPage('strong'))?.currentSubmission).toMatchObject({id:revised.id,status:'CLOSED',revision:2});
 }),60000);
 it('returns explicit own empty state and never attaches another learner or non-student raw work',()=>journey(60000,async()=>{
  const fresh=await context.command('teacher','/v1/assessments',{courseId,title:'Next explanation',instructions:'Explain a different example.',maxScore:10});
  expect((await assessmentPage('strong',fresh.id))?.currentSubmission).toBeNull();
  expect((await assessmentPage('observed'))?.currentSubmission).toBeNull();
  const peer=await context.command('observed',`/v1/assessments/${fresh.id}/submissions`,{content:'Peer private explanation.'});
  expect((await assessmentPage('strong',fresh.id))?.currentSubmission).toBeNull();expect((await assessmentPage('observed',fresh.id))?.currentSubmission).toMatchObject({id:peer.id,learnerId:customerActor(13)});
  for(const role of ['parent','teacher','admin','coordinator']as const)expect(await assessmentPage(role,fresh.id)).not.toHaveProperty('currentSubmission');
  expect((await context.request('strong',`/v1/assessments?learnerId=${customerActor(13)}`)).statusCode).toBe(400);
 }),60000);
 it('shortens long-essay pages without clipping contents or skipping cursor records',()=>journey(60000,async()=>{
  const ids=Array.from({length:12},()=>randomUUID());const contents='ب'.repeat(49000);
  await context.client.query("insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score)select $1,id,$2,$3,'Long explanation '||ordinal,'Explain the school task.',10 from unnest($4::uuid[])with ordinality value(id,ordinal)",[context.school,courseId,customerActor(4),ids]);
  await context.client.query("insert into app.submissions(school_id,assessment_id,learner_id,content)select $1,id,$2,$3 from unnest($4::uuid[])id",[context.school,customerActor(12),contents,ids]);
  const found:string[]=[];let cursor:string|null=null;let shortened=false;
  do{const response=await context.request('strong',`/v1/assessments?limit=100${cursor?`&cursor=${cursor}`:''}`);expect(response.statusCode,response.body).toBe(200);expect(Buffer.byteLength(response.body)).toBeLessThanOrEqual(500000);const page=response.json();if(page.nextCursor&&page.items.length<100)shortened=true;for(const item of page.items)if(ids.includes(item.id)){expect(item.currentSubmission.content).toBe(contents);found.push(item.id);}cursor=page.nextCursor;}while(cursor);
  expect(shortened).toBe(true);expect(found.sort()).toEqual(ids.sort());
 }),60000);
 it('removes the assessment and raw own source immediately after enrollment or programme revocation',()=>journey(30000,async()=>{
  await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3",[context.school,context.classId,customerActor(12)]);
  expect(await assessmentPage('strong')).toBeUndefined();
  await context.client.query("update app.enrollments set status='active'where school_id=$1 and class_id=$2 and student_actor_id=$3",[context.school,context.classId,customerActor(12)]);
  expect((await assessmentPage('strong'))?.currentSubmission).toMatchObject({status:'CLOSED'});
  const programme=await customerProgramme(context,courseId,context.classId,customerActor(12),'Current explanation programme');
  await context.command('admin','/v1/curriculum/learners',{programmeId:programme.programmeId,learnerId:customerActor(12),status:'revoked',confirmAccessChange:true});
  expect(await assessmentPage('strong')).toBeUndefined();
  await context.command('admin','/v1/curriculum/learners',{programmeId:programme.programmeId,learnerId:customerActor(12),status:'active',confirmAccessChange:true});
  expect((await assessmentPage('strong'))?.currentSubmission).toMatchObject({status:'CLOSED'});
 }),30000);
});
