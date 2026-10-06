import{describe,it,expect}from'vitest';import{SchoolLearningService}from'../../src/modules/school-learning/learning.service';import type{Database}from'../../src/platform/database/database';import type{ActorContext}from'@cuevo/domain';
const teacher:ActorContext={userId:'20000000-0000-4000-8000-000000000004',schoolId:'10000000-0000-4000-8000-000000000001',membershipId:'21000000-0000-4000-8000-000000000004',role:'teacher',entitlements:['assessment','learning']};
const id='91100000-0000-4000-8000-000000000001';
function store(){return{actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string)=>({rows:sql.includes('read_submission_page')?[{page:{items:[{id,status:'RETURNED',revision:1,returnFeedback:'Teacher review'}],nextCursor:null}}]:[]})})}as unknown as Database;}
describe('bounded current and historical submissions',()=>{
 it('reads current queue through one scoped source page',async()=>{const page=await new SchoolLearningService(store()).list(teacher,'submissions',{limit:100});expect(page.items).toEqual([{id,status:'RETURNED',revision:1,returnFeedback:'Teacher review'}]);});
 it('uses the same source scope for immutable submission history',async()=>{const page=await new SchoolLearningService(store()).submissionHistory(teacher,id,{limit:25});expect(page.items).toHaveLength(1);});
 it('never lets a parent read raw submitted work',async()=>{await expect(new SchoolLearningService(store()).list({...teacher,role:'parent'},'submissions',{limit:25})).rejects.toMatchObject({status:403});});
});
