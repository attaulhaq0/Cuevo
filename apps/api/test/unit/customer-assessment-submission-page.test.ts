import {describe,expect,it}from'vitest';
import {SchoolLearningService}from'../../src/modules/school-learning/learning.service';
import type{Database}from'../../src/platform/database/database';
import type{ActorContext}from'@cuevo/domain';

const actor:ActorContext={userId:'20000000-0000-4000-8000-000000000012',schoolId:'10000000-0000-4000-8000-000000000001',membershipId:'21000000-0000-4000-8000-000000000012',role:'student',entitlements:['assessment','learning']};
const assessmentId=(index:number)=>`91100000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const assessment=(index:number)=>({id:assessmentId(index),courseId:'91100000-0000-4000-8000-000000000999',title:`School assignment ${index}`,instructions:'Explain the school task.',model:'numeric',maxScore:10,status:'DRAFT'});
const source=(index:number,content='Own current work')=>({id:assessmentId(index+1000),assessmentId:assessmentId(index),learnerId:actor.userId,content,status:'RETURNED',revision:1,assessmentTitle:`School assignment ${index}`,learnerName:'Amira',returnId:assessmentId(index+2000),returnFeedback:'Explain the checking.',returnedAt:'2026-10-01T10:00:00.000Z'});
function service(rows:Record<string,unknown>[],submissions:Record<string,unknown>[]){
 const calls:{sql:string;values:unknown[]}[]=[];const transactions:{user:string;school:string}[]=[];
 const database={actorTransaction:async(user:string,school:string,run:(client:unknown)=>Promise<unknown>)=>{transactions.push({user,school});return run({query:async(sql:string,values:unknown[]=[])=>{calls.push({sql,values});const targets=sql.includes('read_thinking_focus_set')?JSON.parse(String(values[0]))as{id:string;kind:string;criterionKey:null}[]:null;return{rows:targets?[{items:targets.map(target=>({target:{...target,kind:target.kind.toUpperCase()},courseId:rows.find(row=>row.id===target.id)?.courseId,classification:null}))}]:sql.includes('read_own_assessment_submissions')?[{items:submissions}]:rows};}});}}as unknown as Database;
 return{service:new SchoolLearningService(database),calls,transactions};
}
describe('student assessment-page current submission projection',()=>{
 it('resolves exact own current work for the bounded assessment IDs independent of the submission list',async()=>{
  const current=source(101);const {service:learning,calls,transactions}=service([assessment(101),assessment(102),assessment(103)],[current]);
  const page=await learning.list(actor,'assessments',{limit:2});
  expect(page.items).toEqual([{...assessment(101),thinkingFocus:null,currentSubmission:current},{...assessment(102),thinkingFocus:null,currentSubmission:null}]);
  expect(page.nextCursor).toBe(assessmentId(102));expect(transactions).toEqual([{user:actor.userId,school:actor.schoolId}]);
  expect(calls).toHaveLength(3);expect(calls[1].sql).toContain('read_thinking_focus_set');expect(calls[2].values).toEqual([[assessmentId(101),assessmentId(102)]]);
 });
 it.each(['admin','teacher','coordinator','parent']as const)('omits raw own-work context from the %s assessment page',async(role)=>{
  const {service:learning,calls}=service([assessment(1)],[source(1)]);const page=await learning.list({...actor,role},'assessments',{});
  expect(page.items).toEqual([{...assessment(1),thinkingFocus:null}]);expect(calls).toHaveLength(2);expect(calls.some(call=>call.sql.includes('read_own_assessment_submissions'))).toBe(false);
 });
 it('keeps a complete essay source and returns an earlier cursor when a page reaches its byte budget',async()=>{
  const assessments=[1,2,3,4,5,6].map(assessment);const submissions=[1,2,3,4,5,6].map(index=>source(index,'ب'.repeat(49000)));
  const {service:learning}=service(assessments,submissions);const page=await learning.list(actor,'assessments',{limit:6});
  expect(page.items).toHaveLength(5);expect(page.nextCursor).toBe(assessmentId(5));
  expect(page.items[4]).toMatchObject({currentSubmission:{content:'ب'.repeat(49000)}});expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(500000);
 });
 it('does not query own work for an empty assessment page',async()=>{
  const {service:learning,calls}=service([],[]);expect(await learning.list(actor,'assessments',{})).toEqual({items:[],nextCursor:null});expect(calls).toHaveLength(1);
 });
});
