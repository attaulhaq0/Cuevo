import{describe,it,expect}from'vitest';import{AcademicService}from'../../src/modules/academic/academic.service';import type{Database}from'../../src/platform/database/database';import type{ActorContext}from'@cuevo/domain';
const actor:ActorContext={userId:'20000000-0000-4000-8000-000000000072',schoolId:'10000000-0000-4000-8000-000000000001',membershipId:'21000000-0000-4000-8000-000000000072',role:'parent',entitlements:['assessment','curriculum']};
describe('bounded academic current projection',()=>{
 it('retrieves parent-approved current native rows through the one purpose-limited parent projection',async()=>{
  const calls:string[]=[];const row={id:'76000000-0000-4000-8000-000000000001',model:'rubric',nativeResult:{type:'rubric'},score:null,maxScore:null};
  const db={actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string)=>{calls.push(sql);return sql.includes('list_parent_current_results')?{rows:[{page:{items:[row],nextCursor:null}}]}:{rows:[]};}})}as unknown as Database;
  const result=await new AcademicService(db).list(actor,'results',{limit:25});expect(result.items).toHaveLength(1);expect(result.items[0]).not.toHaveProperty('score');expect(calls).toHaveLength(1);expect(calls[0]).toContain('list_parent_current_results');
 });
 it('rejects malformed page limits before any privileged parent read',async()=>{
  const db={}as Database;await expect(new AcademicService(db).list(actor,'results',{limit:101})).rejects.toMatchObject({code:'INVALID_INPUT'});
 });
 it.each(['student','teacher','coordinator','admin']as const)('uses a bounded source projection for %s instead of joining policy scans',async role=>{
  const scoped={...actor,role};const calls:string[]=[];const db={actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string)=>{calls.push(sql);return sql.includes('list_current_native_results')?{rows:[{page:{items:[{id:'76000000-0000-4000-8000-000000000001',model:'numeric',score:0,maxScore:10}],nextCursor:null}}]}:{rows:[]};}})}as unknown as Database;
  expect((await new AcademicService(db).list(scoped,'results',{limit:25})).items).toHaveLength(1);expect(calls).toHaveLength(1);expect(calls[0]).toContain('list_current_native_results');
 });
});
