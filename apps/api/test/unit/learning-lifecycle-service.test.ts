import {describe,it,expect}from'vitest';
import {SchoolLearningService}from'../../src/modules/school-learning/learning.service';
import type{Database}from'../../src/platform/database/database';
import type{ActorContext}from'@cuevo/domain';
const actor:ActorContext={userId:'20000000-0000-4000-8000-000000000012',schoolId:'10000000-0000-4000-8000-000000000001',membershipId:'21000000-0000-4000-8000-000000000012',role:'student',entitlements:['assessment','learning']};
const id='91100000-0000-4000-8000-000000000001';
describe('learning lifecycle service boundaries',()=>{
 it('rechecks current assignment availability before returning a stored submission receipt',async()=>{
  const db={actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string)=>{if(sql.includes('as allowed'))return{rows:[{allowed:true}]};if(sql.includes('require_assessment_available'))throw Object.assign(Error('closed'),{code:'22023'});if(sql.includes('begin_command'))return{rows:[{reservation:{state:'COMPLETED',response:{id,content:'Old source'}}}]};return{rows:[]};}})}as unknown as Database;
  await expect(new SchoolLearningService(db).command(actor,'submission.create',id,{content:'Old source'},'old-source-key','request')).rejects.toMatchObject({code:'LEARNING_CONFLICT',status:409});
 });
 it('never allows a parent to submit deterministic quiz answers',async()=>{
  const db={}as Database;
  await expect(new SchoolLearningService(db).command({...actor,role:'parent'},'quiz.submit' as never,id,{quizId:id,answers:[{questionKey:'q',optionKey:'a'}]},'quiz-key','request')).rejects.toMatchObject({status:403});
 });
});
