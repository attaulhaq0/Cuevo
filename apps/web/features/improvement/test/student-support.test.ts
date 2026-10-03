import assert from 'node:assert/strict';
import test from 'node:test';
import * as support from '../model.ts';
import { LearningApiError, CommandJournal, confirmCommandReceipt } from '../../../shared/api/client.ts';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const task={id,recommendationId:id,learnerId:id,referenceId:id,baselineResultId:id,title:'Check your explanation',instructions:'Explain each reason.',status:'ASSIGNED',createdAt:'2026-10-01T00:00:00Z',completedAt:null,followUpAssessmentId:null};
const context={apiUrl:'https://api.invalid',membership:{schoolId:id,userId:id,role:'student'},accessToken:'token',accessGeneration:1,online:true,status:'ready'};
test('student practice reads reject another learner or exact task and never reuse a prior access response',()=>{
 const scope=support.improvementReadScope(context,'/v1/interventions/'+id,0);const response={scope,value:support.parseCurrentIntervention(task,id,id)};
 assert.equal(support.currentImprovementRead(response,scope)?.id,id);
 assert.throws(()=>support.parseCurrentIntervention({...task,learnerId:other},id,id),LearningApiError);
 assert.throws(()=>support.parseCurrentIntervention({...task,id:other},id,id),LearningApiError);
 for(const changed of [{...context,accessGeneration:2},{...context,accessToken:'new-token'},{...context,membership:{...context.membership,userId:other}},{...context,online:false}])assert.equal(support.currentImprovementRead(response,support.improvementReadScope(changed,'/v1/interventions/'+id,0)),null);
});
const help={id,interventionId:id,approval:{approvedAt:'2026-10-01T00:00:00Z',teacherName:'Maya',learnerNote:null},help:{id:other,kind:'INSTRUCTIONS',question:'How should I start?',requestedAt:'2026-10-02T00:00:00Z',response:null}};
const choices={id,interventionId:id,options:[{activityId:other,title:'A worked example',instructions:'Read and try one example.',available:true}],choice:{activityId:other,title:'A worked example',instructions:'Read and try one example.',chosenAt:'2026-10-02T00:00:00Z'}};
test('task help and choices require the exact intervention and confirmed choice metadata',()=>{
 assert.equal(support.parseCurrentInterventionHelp(help,id).help?.question,'How should I start?');
 assert.throws(()=>support.parseCurrentInterventionHelp({...help,interventionId:other},id),LearningApiError);
 assert.throws(()=>support.parseCurrentInterventionHelp({...help,id:other},id),LearningApiError);
 assert.equal(support.parseCurrentInterventionChoices(choices,id).choice?.title,'A worked example');
 assert.throws(()=>support.parseCurrentInterventionChoices({...choices,interventionId:other},id),LearningApiError);
 assert.throws(()=>support.parseCurrentInterventionChoices({...choices,id:other},id),LearningApiError);
 assert.throws(()=>support.parseCurrentInterventionChoices({...choices,choice:{...choices.choice,title:'Another saved option'}},id),LearningApiError);
 assert.throws(()=>support.parseCurrentInterventionChoices({...choices,options:[choices.options[0],choices.options[0]]},id),LearningApiError);
});
test('identical approved practice titles require review before selecting a saved option',()=>{
 const status=support.parseCurrentInterventionChoices({...choices,choice:null,options:[choices.options[0],{...choices.options[0],activityId:id}]},id);
 assert.equal(support.approvedPracticeChoiceOptions(status).length,0);
 assert.equal(support.approvedPracticeChoiceOptions({...status,options:[status.options[0],{...status.options[1],title:'A second explanation'}]}).length,2);
});
test('practice completion settles only the exact completed source while malformed outcomes retain original keys',()=>{
 const journal=new CommandJournal(),command=journal.prepare('complete','/v1/interventions/'+id+'/complete',{});
 const done={...task,status:'COMPLETED',completedAt:'2026-10-02T00:00:00Z'};
 for(const receipt of [task,{...done,id:other},{...done,learnerId:other},{...done,baselineResultId:other}]){
  assert.throws(()=>confirmCommandReceipt(journal,'complete',command.key,receipt,undefined,(value)=>{support.validatePracticeCompletionReceipt(value,support.parseIntervention(task));}),error=>error instanceof LearningApiError&&error.uncertain);
  assert.equal(journal.get('complete')?.key,command.key);
 }
 assert.equal(confirmCommandReceipt(journal,'complete',command.key,done,undefined,value=>{support.validatePracticeCompletionReceipt(value,support.parseIntervention(task));}),true);
});
test('help and selected-practice receipts match the original confirmed command before success',()=>{
 assert.doesNotThrow(()=>support.validateInterventionHelpReceipt(help,id,{kind:'INSTRUCTIONS',question:'How should I start?',confirmSend:true},false));
 assert.throws(()=>support.validateInterventionHelpReceipt({...help,help:{...help.help,question:'Another question'}},id,{kind:'INSTRUCTIONS',question:'How should I start?',confirmSend:true},false),LearningApiError);
 assert.doesNotThrow(()=>support.validateInterventionChoiceReceipt(choices,id,{activityId:other,confirmChoice:true}));
 assert.throws(()=>support.validateInterventionChoiceReceipt(choices,id,{activityId:id,confirmChoice:true}),LearningApiError);
});
test('student outcomes require an exact authorized own task and its immutable baseline',()=>{
 const taskSource=support.parseIntervention(task);const outcome={id,interventionId:id,baselineResultId:id,followUpResultId:other,status:'improved',difference:2,minimumChange:1,baseline:{score:0,maxScore:10},followUp:{score:2,maxScore:10},reason:'OBSERVED_RAW_SCORE_CHANGE',limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',measuredAt:'2026-10-03T00:00:00Z'};
 assert.equal(support.currentStudentOutcome(outcome,[taskSource],id).id,id);
 assert.throws(()=>support.currentStudentOutcome({...outcome,baselineResultId:other},[taskSource],id),LearningApiError);
 assert.throws(()=>support.currentStudentOutcome(outcome,[],id),LearningApiError);
 assert.throws(()=>support.currentStudentOutcome(outcome,[{...taskSource,learnerId:other}],id),LearningApiError);
 const context={status:'READY',labelBasis:'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK',learnerId:other,identityRequiresReview:false,learnerName:'Another learner',className:'Cedar',yearGroupName:'Year 1',academicYearName:'2026–2027',courseTitle:'School checking',practiceTitle:'A checking step',baselineAssessmentTitle:'First checking task',followUpAssessmentTitle:'Later checking task',baselineSubmittedAt:'2026-10-01T10:00:00Z',followUpSubmittedAt:'2026-10-02T10:00:00Z'};
 assert.throws(()=>support.currentStudentOutcome({...outcome,context},[taskSource],id),LearningApiError);
});
