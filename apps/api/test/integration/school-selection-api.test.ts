import { beforeAll,afterAll,describe,expect,it } from 'vitest';
import {createCustomerContext,customerActor,type CustomerContext}from'./customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('School selection identity through real Auth/API/private SQL',()=>{
 let context:CustomerContext;
 beforeAll(async()=>{context=await createCustomerContext();await context.client.query('update app.classes set name=case when id=$2 then $4 else $5 end where school_id=$1 and id=any($3::uuid[])',[context.school,context.classId,[context.classId,context.secondClassId],'Cedar current class','Palm current class']);},60000);
 afterAll(async()=>{await context?.close();});
 it('projects current School people and lets unique unassigned learners be configured',async()=>{
  const response=await context.request('admin','/v1/school/people?limit=100');expect(response.statusCode).toBe(200);
  const row=response.json().items.find((item:{id:string})=>item.id===customerActor(21));expect(row.selectionContext.status).toBe('READY');expect(['CURRENT','NONE']).toContain(row.selectionContext.enrollmentState);
  const classes=await context.request('admin','/v1/school/classes?limit=100');expect(classes.statusCode).toBe(200);expect(classes.json().items.every((item:{selectionStatus?:string;academicYearName?:string})=>item.selectionStatus&&item.academicYearName)).toBe(true);
  expect((await context.request('teacher','/v1/school/people?limit=100')).statusCode).toBe(403);
 });
 it('distinguishes same-name learners in different classes and records attendance for the human-selected actor',async()=>{
  await context.client.query('update app.people set display_name=$3 where school_id=$1 and actor_id=any($2::uuid[])',[context.school,[customerActor(12),customerActor(13)],'Matching school learner']);
  await context.client.query('update app.enrollments set status=\'revoked\'where school_id=$1 and student_actor_id=$2',[context.school,customerActor(13)]);
  await context.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,status,effective_from)values($1,$2,$3,'active',now()-interval'1 day')on conflict(school_id,class_id,student_actor_id)do update set status='active'",[context.school,context.secondClassId,customerActor(13)]);
  const page=(await context.request('admin','/v1/school/people?limit=100')).json();const rows=page.items.filter((row:{id:string})=>[customerActor(12),customerActor(13)].includes(row.id));
  expect(rows).toHaveLength(2);expect(rows.every((row:{selectionContext:{status:string}})=>row.selectionContext.status==='READY')).toBe(true);expect(rows[0].selectionContext.classes).not.toEqual(rows[1].selectionContext.classes);
  await context.command('admin','/v1/school/attendance',{classId:context.classId,studentId:customerActor(12),occurredOn:'2026-10-03',status:'present',note:'Reviewed exact matching-name learner',expectedRevision:0});
  const attendance=(await context.request('admin',`/v1/school/attendance?limit=100&classId=${context.classId}`)).json().items;expect(attendance.some((row:{learnerId:string})=>row.learnerId===customerActor(12))).toBe(true);expect(attendance.some((row:{learnerId:string})=>row.learnerId===customerActor(13))).toBe(false);
 });
 it('same-class duplicates are review-required before paging and deny direct mutation',async()=>{
  await context.client.query('update app.enrollments set status=\'revoked\'where school_id=$1 and student_actor_id=$2',[context.school,customerActor(13)]);
  await context.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,status,effective_from)values($1,$2,$3,'active',now()-interval'1 day')on conflict(school_id,class_id,student_actor_id)do update set status='active'",[context.school,context.classId,customerActor(13)]);
  const page=(await context.request('admin',`/v1/school/people?limit=1&cursor=${customerActor(11)}`)).json();expect(page.items[0].id).toBe(customerActor(12));expect(page.items[0].selectionContext.status).toBe('REQUIRES_REVIEW');expect(page.nextCursor).not.toBeNull();
  const denied=await context.request('admin','/v1/school/attendance',{classId:context.classId,studentId:customerActor(12),occurredOn:'2026-10-04',status:'present',note:'',expectedRevision:0});expect(denied.statusCode).toBe(409);
  expect((await context.request('admin','/v1/school/attendance',{classId:context.classId,studentId:'ffffffff-ffff-4fff-8fff-ffffffffffff',occurredOn:'2026-10-04',status:'present',note:'',expectedRevision:0})).statusCode).toBe(403);
 });
 it('unique classless learner can enroll and unknown class source remains review-visible',async()=>{
  const actor=customerActor(21);await context.client.query('update app.enrollments set status=\'revoked\'where school_id=$1 and student_actor_id=$2',[context.school,actor]);
  let row=(await context.request('admin','/v1/school/people?limit=100')).json().items.find((row:{id:string})=>row.id===actor);expect(row.selectionContext).toEqual({status:'READY',enrollmentState:'NONE',classes:[]});
  const current=(await context.client.query('select revision from app.enrollments where school_id=$1 and class_id=$2 and student_actor_id=$3',[context.school,context.classId,actor])).rows[0];
  await context.command('admin','/v1/school/enrollments',{classId:context.classId,studentId:actor,status:'active',effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:null,confirmAccessChange:true,expectedRevision:current?.revision??0});
  row=(await context.request('admin','/v1/school/people?limit=100')).json().items.find((row:{id:string})=>row.id===actor);expect(row.selectionContext.enrollmentState).toBe('CURRENT');
  await context.client.query('update app.classes set name=\' \'where school_id=$1 and id=$2',[context.school,context.classId]);
  const roster=await context.request('admin',`/v1/school/attendance-roster?limit=100&classId=${context.classId}`);expect(roster.statusCode).toBe(200);expect(roster.json().items.every((row:{selectionContext:{status:string;enrollmentState:string}})=>row.selectionContext.status==='REQUIRES_REVIEW'&&row.selectionContext.enrollmentState==='UNAVAILABLE')).toBe(true);
 });
});
