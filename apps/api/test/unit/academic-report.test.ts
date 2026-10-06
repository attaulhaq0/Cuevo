import{describe,it,expect}from'vitest';
import*as contracts from'@cuevo/contracts';
import{AcademicService}from'../../src/modules/academic/academic.service';
import type{Database}from'../../src/platform/database/database';
import type{ActorContext}from'@cuevo/domain';
import type{z}from'zod';
const actor:ActorContext={userId:'20000000-0000-4000-8000-000000000004',schoolId:'10000000-0000-4000-8000-000000000001',role:'teacher',membershipId:'21000000-0000-4000-8000-000000000004',entitlements:['assessment','curriculum']};
const learner='20000000-0000-4000-8000-000000000012';
const base={id:'65000000-0000-4000-8000-000000000001',submissionId:'51000000-0000-4000-8000-000000000001',assessmentId:'50000000-0000-4000-8000-000000000001',learnerId:learner,revision:1,feedback:'Teacher source feedback',status:'RELEASED',policyVersion:2,referenceId:'61000000-0000-4000-8000-000000000001',referenceVersion:'school-1',evidenceId:'66000000-0000-4000-8000-000000000001',createdAt:'2026-10-01T00:00:00Z',actorId:actor.userId,parentVisible:true,assessmentTitle:'School task',referenceTitle:'School objective'};
const numeric={...base,model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2}};
const report={schemaVersion:'1',schoolId:actor.schoolId,learnerId:learner,generatedAt:'2026-10-01T01:00:00Z',scope:'CURRENT_RELEASED_PAGE',coverage:'NOT_ESTABLISHED',items:[numeric],nextCursor:null};
function database(run:(sql:string,args?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>) {return{actorTransaction:async(_actor:string,_school:string,callback:(client:unknown)=>Promise<unknown>)=>callback({query:run})}as unknown as Database;}
describe('native academic report boundary',()=>{
 it('keeps verified native zero and source provenance without an inferred completeness claim',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).academicReportSchema;expect(schema).toBeDefined();expect(schema.safeParse(report).success).toBe(true);
  expect(schema.safeParse({...report,coverage:'COMPLETE'}).success).toBe(false);expect(schema.safeParse({...report,items:[{...numeric,learnerId:actor.userId}]}).success).toBe(false);
 });
 it('scopes to the selected learner before source pagination',async()=>{
  const calls:{sql:string;args?:unknown[]}[]=[];const db=database(async(sql,args)=>{calls.push({sql,args});return{rows:[{page:{items:[numeric],nextCursor:null}}]};});
  const method=(new AcademicService(db)as unknown as{report:(actor:ActorContext,learner:string,query:unknown)=>Promise<unknown>}).report;expect(method).toBeTypeOf('function');
  const result=await method.call(new AcademicService(db),actor,learner,{limit:1});expect(result).toMatchObject({...report,generatedAt:expect.any(String)});expect(calls[0].args).toEqual([1,null,learner]);expect(calls[0].sql).toContain('list_current_native_results_scoped');
 });
 it('rejects a mismatched learner result instead of exporting another learner source',async()=>{
  const db=database(async()=>({rows:[{page:{items:[{...numeric,learnerId:actor.userId}],nextCursor:null}}]}));const service=new AcademicService(db)as unknown as{report:(actor:ActorContext,learner:string,query:unknown)=>Promise<unknown>};expect(service.report).toBeTypeOf('function');await expect(service.report(actor,learner,{})).rejects.toMatchObject({status:503});
 });
});
