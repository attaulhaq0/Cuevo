import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('school current access revisions', () => {
 let context: CustomerContext;
 beforeAll(async()=>{
  context=await createCustomerContext();
  // This suite tests access revisions; duplicate caption denial is owned by school-selection-api.
  await context.client.query('update app.people set display_name=case actor_id when $2 then $4 when $3 then $5 else display_name end where school_id=$1',[context.school,customerActor(12),customerActor(13),'Lina current learner','Maha current learner']);
  await context.client.query('update app.classes set name=case id when $2 then $4 else $5 end where school_id=$1 and id=any($3::uuid[])',[context.school,context.classId,[context.classId,context.secondClassId],'Cedar current class','Palm current class']);
 },60000);
 afterAll(async()=>{await context?.close();});
  it('requires a current revision to restore a revoked guardian and preserves original-key reconciliation',async()=>{
  const path='/v1/school/guardian-relationships';
  const current=(await context.request('admin',path+'?limit=100')).json().items.find((row:{parentId:string;studentId:string})=>row.parentId===customerActor(72)&&row.studentId===customerActor(12));
  const input={parentId:current.parentId,studentId:current.studentId,relationshipType:current.relationshipType,status:'revoked',effectiveFrom:current.effectiveFrom,effectiveTo:current.effectiveTo,expectedRevision:current.revision??1,confirmAccessChange:true};
  const revoked=await context.command('admin',path,input,'guardian-current-revoke');
  expect(revoked.revision).toBe(input.expectedRevision+1);
  expect((await context.request('admin',path,{...input,status:'active'})).statusCode).toBe(409);
  const retained=(await context.request('admin',path+'?limit=100')).json().items.find((row:{id:string})=>row.id===current.id);
  expect(retained).toMatchObject({status:'revoked',revision:revoked.revision});
  expect((await context.request('admin',path,input,'guardian-current-revoke')).json()).toMatchObject({revision:revoked.revision});
  await context.command('admin',path,{...input,status:'active',expectedRevision:revoked.revision});
 });
 it('prevents stale enrollment and teaching assignment changes and keeps identity revision separate',async()=>{
  for(const resource of ['enrollments','teacher-assignments']as const){
   const rows=(await context.request('admin',`/v1/school/${resource}?limit=100`)).json().items;
   const row=rows.find((item:{classId:string;studentId?:string;teacherId?:string})=>item.classId===context.classId&&(resource==='enrollments'?item.studentId===customerActor(12):item.teacherId===customerActor(4)));
   const input={...(resource==='enrollments'?{classId:row.classId,studentId:row.studentId}:{classId:row.classId,subjectId:row.subjectId,teacherId:row.teacherId}),status:'revoked',effectiveFrom:row.effectiveFrom,effectiveTo:row.effectiveTo,confirmAccessChange:true,expectedRevision:row.revision};
   const changed=await context.command('admin',`/v1/school/${resource}`,input);
   expect((await context.request('admin',`/v1/school/${resource}`,{...input,status:'active'})).statusCode).toBe(409);
   await context.command('admin',`/v1/school/${resource}`,{...input,status:'active',expectedRevision:changed.revision});
  }
  const person=(await context.request('admin','/v1/school/people?limit=100')).json().items.find((row:{id:string})=>row.id===customerActor(14));
  const path=`/v1/school/people/${person.id}/configure`;const input={displayName:person.displayName,role:person.role,status:'suspended',effectiveFrom:person.effectiveFrom,effectiveTo:person.effectiveTo,expectedRevision:person.revision,confirmAccessChange:true};
  const changed=await context.command('admin',path,input);
  expect((await context.request('admin',path,{...input,status:'active'})).statusCode).toBe(409);
  await context.command('admin',path,{...input,status:'active',expectedRevision:changed.revision});
 });
});
