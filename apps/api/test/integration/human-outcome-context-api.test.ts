import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { mkdir,writeFile } from 'node:fs/promises';
import { createCustomerContext,customerActor,customerCourse,customerReleased,customerAssessment,type CustomerContext,type CustomerRole } from './customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('human measured outcome context',()=>{
 let context:CustomerContext;
 beforeAll(async()=>{context=await createCustomerContext();},60000);afterAll(async()=>{await context?.close();});
 it('identifies two learner practices on current reads without changing measure receipts or stored state',async()=>{
  const created:{outcomeId:string;learnerId:string;practiceTitle:string;baselineTitle:string;followupTitle:string;measureBody:Record<string,unknown>;measureKey:string;receipt:unknown;interventionId:string}[]=[];
  for(const[role,name]of [['strong','Explain'],['observed','Check']]as const){
   const course=await customerCourse(context,name+' source course');const baselineTitle=name+' before practice';const baseline=await customerReleased(context,role,course.courseId,baselineTitle,0);
   const practiceTitle=name+' one checking step';const proposal=await context.command('teacher','/v1/recommendations',{baselineResultId:baseline.resultId,observation:'One native source result.',interpretation:'Teacher reviewed the source.',recommendation:'Try the approved checking step.',rationale:'Uses this exact school example.',uncertainty:'Observed change is not causal proof.',activityTitle:practiceTitle,instructions:'Explain one checking step.'});
   const approval=await context.command('teacher',`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Reviewed current source.'});
   await context.command(role,`/v1/interventions/${approval.interventionId}/complete`,{reflection:'I explained a step.'});
   const followupTitle=name+' after practice';const assessmentId=await customerAssessment(context,course.courseId,followupTitle);await context.command('teacher',`/v1/interventions/${approval.interventionId}/reassessment`,{assessmentId});
   const work=await context.command(role,`/v1/assessments/${assessmentId}/submissions`,{content:'My new explanation.'});const mark=await context.command('teacher',`/v1/submissions/${work.id}/results`,{score:4,feedback:'Reviewed follow-up.',expectedPolicyVersion:2,expectedRevision:0,sourceEvidence:true});const released=await context.command('teacher',`/v1/results/${mark.id}/release`,{expectedRevision:1,parentVisible:true});
   const measureBody={followUpResultId:released.id,minimumChange:1};const measureKey='human-outcome-'+name;const response=await context.request('teacher',`/v1/interventions/${approval.interventionId}/measure`,measureBody,measureKey);expect(response.statusCode).toBe(200);
   const receipt=response.json();expect(receipt).not.toHaveProperty('context');created.push({outcomeId:String(receipt.id),learnerId:customerActor(role==='strong'?12:13),practiceTitle,baselineTitle,followupTitle,measureBody,measureKey,receipt,interventionId:String(approval.interventionId)});
  }
  await context.drain();
  for(const item of created){
   const stateBefore=(await context.client.query('select impact from app.learner_state_snapshots where school_id=$1 and learner_id=$2',[context.school,item.learnerId])).rows[0].impact;
   expect(stateBefore.outcomes.find((row:{id:string})=>row.id===item.outcomeId)).not.toHaveProperty('context');
   const list=await context.request('teacher','/v1/outcomes?limit=100');expect(list.statusCode).toBe(200);const current=list.json().items.find((row:{id:string})=>row.id===item.outcomeId);
   expect(current.context).toMatchObject({learnerId:item.learnerId,practiceTitle:item.practiceTitle,baselineAssessmentTitle:item.baselineTitle,followUpAssessmentTitle:item.followupTitle,className:'Duplicate class — صف',yearGroupName:'Synthetic group',academicYearName:'Synthetic year',labelBasis:'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK'});
   const learnerRole:CustomerRole=item.learnerId===customerActor(12)?'strong':'observed';const state=await context.request(learnerRole,`/v1/learners/${item.learnerId}/state`);expect(state.statusCode).toBe(200);expect(state.json().impact.outcomes.find((row:{id:string})=>row.id===item.outcomeId).context.practiceTitle).toBe(item.practiceTitle);
   const replay=await context.request('teacher',`/v1/interventions/${item.interventionId}/measure`,item.measureBody,item.measureKey);expect(replay.statusCode).toBe(200);expect(replay.json()).toEqual(item.receipt);
   const stateAfter=(await context.client.query('select impact from app.learner_state_snapshots where school_id=$1 and learner_id=$2',[context.school,item.learnerId])).rows[0].impact;expect(stateAfter).toEqual(stateBefore);
  }
  const first=created[0];
  await context.client.query('SAVEPOINT outcome_name_review');
  try{
   await context.client.query('delete from app.people where school_id=$1 and actor_id=$2',[context.school,first.learnerId]);
   const page=await context.request('teacher','/v1/outcomes?limit=100');const row=page.json().items.find((item:{id:string})=>item.id===first.outcomeId);expect(row.context.learnerName).toBeNull();expect(row.context.status).toBe('REQUIRES_REVIEW');
  }finally{await context.client.query('ROLLBACK TO SAVEPOINT outcome_name_review');await context.client.query('RELEASE SAVEPOINT outcome_name_review');}
  await context.client.query('SAVEPOINT outcome_snapshot_review');
  try{
   const foreignRevision=(await context.client.query("select id from app.learning_content_revisions where school_id=$1 and resource='course'and source_id<>(select course_id from app.assessments where school_id=$1 and id=(select assessment_id from internal.improvement_result_sources where school_id=$1 and id=$2))limit 1",[context.school,first.measureBody.followUpResultId])).rows[0].id;
   await context.client.query("set local session_replication_role='replica'");
   const changed=await context.client.query('update app.learning_submission_context set course_revision_id=$3 where school_id=$1 and submission_id=(select submission_id from internal.improvement_result_sources where school_id=$1 and id=$2)',[context.school,first.measureBody.followUpResultId,foreignRevision]);expect(changed.rowCount).toBe(1);await context.client.query("set local session_replication_role='origin'");
   const page=await context.request('teacher','/v1/outcomes?limit=100');const row=page.json().items.find((item:{id:string})=>item.id===first.outcomeId);expect(row.context.followUpAssessmentTitle).toBeNull();expect(row.context.status).toBe('REQUIRES_REVIEW');
  }finally{await context.client.query('ROLLBACK TO SAVEPOINT outcome_snapshot_review');await context.client.query('RELEASE SAVEPOINT outcome_snapshot_review');}
  await context.client.query('SAVEPOINT outcome_current_access');
  try{await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and student_actor_id=$2",[context.school,first.learnerId]);const page=await context.request('teacher','/v1/outcomes?limit=100');expect(page.json().items.some((row:{id:string})=>row.id===first.outcomeId)).toBe(false);}finally{await context.client.query('ROLLBACK TO SAVEPOINT outcome_current_access');await context.client.query('RELEASE SAVEPOINT outcome_current_access');}
  expect((await context.request('parent','/v1/outcomes?limit=100')).statusCode).toBe(403);expect((await context.request('otherTeacher','/v1/outcomes?limit=100')).json().items).toEqual([]);
 },90000);
 it('keeps one hundred genuine measured practices bounded on the normal named outcome page',async()=>{
  const course=await customerCourse(context,'Measured practice review');const baseline=await customerReleased(context,'strong',course.courseId,'Before the reviewed practice',0);const interventionIds:string[]=[];
  for(let index=0;index<100;index++){
   const proposal=await context.command('teacher','/v1/recommendations',{baselineResultId:baseline.resultId,observation:'Released result on the ten-point school scale.',interpretation:'Teacher-reviewed evidence.',recommendation:'Try one checking step.',rationale:'Uses the reviewed school source.',uncertainty:'Observed change does not prove cause.',activityTitle:'Reviewed checking practice '+(index+1),instructions:'Explain one checking step.'});
   const approval=await context.command('teacher',`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Teacher reviewed the exact source.'});const id=String(approval.interventionId);interventionIds.push(id);await context.command('strong',`/v1/interventions/${id}/complete`,{reflection:'I checked my explanation.'});
  }
  const assessmentId=await customerAssessment(context,course.courseId,'After the reviewed practices');const work=await context.command('strong',`/v1/assessments/${assessmentId}/submissions`,{content:'My later explanation.'});const mark=await context.command('teacher',`/v1/submissions/${work.id}/results`,{score:4,feedback:'Reviewed later source.',expectedPolicyVersion:2,expectedRevision:0,sourceEvidence:true});const followup=await context.command('teacher',`/v1/results/${mark.id}/release`,{expectedRevision:1,parentVisible:true});
  for(const id of interventionIds){await context.command('teacher',`/v1/interventions/${id}/reassessment`,{assessmentId});await context.command('teacher',`/v1/interventions/${id}/measure`,{followUpResultId:followup.id,minimumChange:1});}
  const samples:{path:string;limit:number;elapsedMs:number;status:string}[]=[];
  const rows=(await context.client.query('select id from app.outcome_measurements where school_id=$1 order by id',[context.school])).rows;
  const probes=[{path:'RAW_RLS',sql:'select id from app.outcome_measurements where school_id=$1 order by id limit 100',args:[context.school]},{path:'CANONICAL_PROJECTION',sql:'select internal.intervention_outcome_projection(id)from app.outcome_measurements where school_id=$1 order by id limit 100',args:[context.school]},{path:'NAMED_PROJECTION',sql:'select internal.read_outcome_display(id)from app.outcome_measurements where school_id=$1 order by id limit 100',args:[context.school]}];
  if(process.env.CUEVO_OUTCOME_DIAGNOSTIC_PROBES==='1')for(const probe of probes){await context.client.query('SAVEPOINT outcome_latency');const start=performance.now();try{await context.client.query('set local role cuevo_api');await context.client.query("set local statement_timeout='5s'");await context.client.query("select set_config('app.school_id',$1,true),set_config('app.actor_id',$2,true)",[context.school,customerActor(4)]);await context.client.query(probe.sql,probe.args);samples.push({path:probe.path,limit:100,elapsedMs:Math.round(performance.now()-start),status:'OK'});}catch(error){samples.push({path:probe.path,limit:100,elapsedMs:Math.round(performance.now()-start),status:typeof error==='object'&&error!==null&&'code'in error?String(error.code):'UNKNOWN'});}finally{await context.client.query('ROLLBACK TO SAVEPOINT outcome_latency');await context.client.query('RELEASE SAVEPOINT outcome_latency');}}
  for(const limit of[1,10,100]){const start=performance.now();const page=await context.request('teacher','/v1/outcomes?limit='+limit);const elapsed=performance.now()-start;samples.push({path:'CURRENT_API',limit,elapsedMs:Math.round(elapsed),status:'HTTP_'+page.statusCode});await mkdir('.local/performance-investigation',{recursive:true});await writeFile('.local/performance-investigation/named-outcome-100.json',JSON.stringify({classification:'LOCAL_SYNTHETIC_ROLLBACK_ONLY',population:rows.length,statementBudgetMs:5000,samples},null,2)+'\n');expect(page.statusCode,'Named outcome page limit '+limit+' returned '+page.statusCode).toBe(200);expect(page.json().items).toHaveLength(limit);expect(page.json().items.every((row:{context?:{practiceTitle?:string}})=>typeof row.context?.practiceTitle==='string')).toBe(true);expect(elapsed,'Named outcome page limit '+limit).toBeLessThan(5000);}
 },240000);
});
