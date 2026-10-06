import{afterAll,beforeAll,describe,it,expect}from'vitest';import{createCustomerContext,customerCourse,customerAssessment,customerActor,type CustomerContext}from'./customer-test-context';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('school campus and approved instructional support',()=>{
 let context:CustomerContext;let courseId:string;let assessmentId:string;let campusId:string;let supportId:string;
 beforeAll(async()=>{context=await createCustomerContext();courseId=(await customerCourse(context,'Supported school learning')).courseId;assessmentId=await customerAssessment(context,courseId,'Supported school task');},30000);afterAll(async()=>{await context?.close();});
 it('requires current reviewed campus assignment and blocks retirement until classes move',async()=>{
  const campus=await context.command('admin','/v1/school/campuses',{name:'School Cedar campus',location:'School-provided room context',reason:'Reviewed school campus.',confirmConfiguration:true});campusId=campus.id;
  expect((await context.request('teacher','/v1/school/campuses',{name:'Teacher cannot create',location:null,reason:'No authority',confirmConfiguration:true})).statusCode).toBe(403);
  await context.command('admin',`/v1/school/classes/${context.classId}/campus`,{campusId,expectedRevision:0,reason:'Current class campus assigned.',confirmConfiguration:true});const current=await context.request('teacher',`/v1/school/classes/${context.classId}/campus`);expect(current.statusCode,current.body).toBe(200);expect(current.json()).toMatchObject({revision:1,campusName:'School Cedar campus'});
  expect((await context.request('admin',`/v1/school/campuses/${campusId}/retire`,{reason:'Still active class assigned.',confirmRetirement:true})).statusCode).toBe(409);expect((await context.request('admin',`/v1/school/classes/${context.classId}/campus`,{campusId:null,expectedRevision:0,reason:'Stale class move.',confirmConfiguration:true})).statusCode).toBe(409);
  await context.command('admin',`/v1/school/classes/${context.classId}/campus`,{campusId:null,expectedRevision:1,reason:'Explicitly remove campus before retirement.',confirmConfiguration:true});await context.command('admin',`/v1/school/campuses/${campusId}/retire`,{reason:'Current classes resolved.',confirmRetirement:true});
 });
 it('publishes only exact approved current instructional metadata and keeps approval notes private',async()=>{
  const payload={learnerId:customerActor(12),courseId,assessmentId,title:'School checking guide',instructions:'Use the school checking guide for this task.',effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',studentVisible:true,parentVisible:true,reason:'Private school approval basis',confirmApproval:true};
  expect((await context.request('teacher','/v1/school/learning-support',payload)).statusCode).toBe(403);supportId=(await context.command('coordinator','/v1/school/learning-support',payload)).id;
  for(const role of ['teacher','strong','parent']as const){const read=await context.request(role,`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=${assessmentId}`);expect(read.statusCode,read.body).toBe(200);expect(read.json().items).toHaveLength(1);expect(read.json().items[0]).toMatchObject({id:supportId,instructions:payload.instructions,state:'ACTIVE'});expect(read.body).not.toContain(payload.reason);}
  const approver=await context.request('coordinator','/v1/school/learning-support?limit=25');expect(approver.body).toContain(payload.reason);
  expect((await context.request('parent','/v1/school/learning-support?limit=25')).statusCode).toBe(403);const denied=await context.request('observed',`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=${assessmentId}`);expect(denied.statusCode).toBe(200);expect(denied.json().items).toEqual([]);
 });
 it('revocation, wrong task and current relationship loss remove protected support publication',async()=>{
  const wrong=await context.request('parent',`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=40000000-0000-4000-8000-000000000001`);expect(wrong.statusCode).toBe(403);
  await context.command('coordinator',`/v1/school/learning-support/${supportId}/revoke`,{expectedRevision:1,reason:'School withdraws this instructional publication.',confirmRevocation:true});
  for(const role of ['strong','parent']as const){const read=await context.request(role,`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=${assessmentId}`);expect(read.statusCode).toBe(200);expect(read.json().items).toEqual([]);}
  const staff=await context.request('teacher',`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=${assessmentId}`);expect(staff.json().items[0].state).toBe('REVOKED');await context.drain();
 });
});
