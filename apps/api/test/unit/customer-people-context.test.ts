import {describe,expect,it}from'vitest';
import {SchoolLearningService}from'../../src/modules/school-learning/learning.service';
import type{ActorContext}from'@cuevo/domain';
import type{Database}from'../../src/platform/database/database';
const actor:ActorContext={userId:'20000000-0000-4000-8000-000000000072',schoolId:'10000000-0000-4000-8000-000000000001',role:'parent',membershipId:'21000000-0000-4000-8000-000000000072',entitlements:['learning']};
describe('authorized people choices provide school context',()=>{
 it('projects current class/year labels through the existing protected people query',async()=>{
  let statement='';const db={actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string)=>{statement=sql;return{rows:[{userId:'20000000-0000-4000-8000-000000000012',displayName:'Same name',role:'student',classLabels:['Class A · 2026/27']}]};}})}as unknown as Database;
  const result=await new SchoolLearningService(db).list(actor,'people',{});expect(result.items[0]).toMatchObject({classLabels:['Class A · 2026/27']});expect(statement).toContain('classLabels');expect(statement).toContain('effective_from');
 });
});
