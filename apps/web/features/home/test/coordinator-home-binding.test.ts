import assert from 'node:assert/strict';
import test from 'node:test';
import * as binding from '../coordinator-home-binding-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const app={apiUrl:'https://api.invalid',membership:{schoolId:id,userId:id,role:'coordinator'},accessToken:'token',accessGeneration:1,online:true,status:'ready'};
test('coordinator current source rejects preceding scope period and token before displaying facts',()=>{
 const scope=binding.coordinatorHomeReadScope(app,'course','period','/v1/source',0);const row={scope,value:{id,title:'Current source'}};
 assert.equal(binding.currentCoordinatorHomeRead(row,scope)?.id,id);
 for(const next of [binding.coordinatorHomeReadScope({...app,accessGeneration:2},'course','period','/v1/source',0),binding.coordinatorHomeReadScope(app,'course','other','/v1/source',0),binding.coordinatorHomeReadScope({...app,accessToken:'new'},'course','period','/v1/source',0),binding.coordinatorHomeReadScope({...app,online:false},'course','period','/v1/source',0)])assert.equal(binding.currentCoordinatorHomeRead(row,next),null);
});
const coverage={courseId:id,courseTitle:'Checking course',className:'Cedar',periodId:id,periodName:'Term one',startsOn:'2026-10-01',endsOn:'2026-10-31',periodRevision:1,planStatus:'NOT_ESTABLISHED',plannedTotal:null,learnerTotal:0,items:[],nextCursor:null,limitation:'DECLARED_PLAN_NOT_OFFICIAL_CURRICULUM_COVERAGE'};
test('coordinator declared coverage requires exact current course period revision and truthful missing denominator',()=>{
 assert.equal(binding.parseCoordinatorHomeCoverage(coverage,id,id,1).plannedTotal,null);
 for(const value of [{...coverage,courseId:other},{...coverage,periodId:other},{...coverage,periodRevision:2}])assert.throws(()=>binding.parseCoordinatorHomeCoverage(value,id,id,1),LearningApiError);
});

test('coordinator preserves review-required historic plans without admitting them as current evidence',()=>{
 const plan={id,referenceId:id,referenceTitle:'Checking reasons',referenceDescription:'Explain the checking method.',periodRevision:1,sourceStatus:'CURRENT',reason:'School declared plan.',taughtCount:0,assessmentCount:0,evidenceLearnerCount:0,evidenceCount:0,taught:[],assessments:[],evidence:[]};
 const current={...coverage,planStatus:'DECLARED',plannedTotal:1,items:[plan]};
 assert.equal(binding.coordinatorHomePlanIsCurrent(binding.parseCoordinatorHomeCoverage(current,id,id,1).items[0],1),true);
 const historic={...current,periodRevision:2,planStatus:'REQUIRES_REVIEW',items:[{...plan,sourceStatus:'REQUIRES_REVIEW'}]};
 const row=binding.parseCoordinatorHomeCoverage(historic,id,id,2).items[0];
 assert.equal(row.periodRevision,1);assert.equal(binding.coordinatorHomePlanIsCurrent(row,2),false);
 assert.throws(()=>binding.parseCoordinatorHomeCoverage({...historic,items:[plan]},id,id,2),LearningApiError);
});
test('coordinator matching course and period labels are disabled instead of receiving opaque suffixes',()=>{
 const choices=binding.coordinatorHomeChoices([{id,name:'Term one',startsOn:'2026-10-01',endsOn:'2026-10-31'},{id:other,name:'Term one',startsOn:'2026-10-01',endsOn:'2026-10-31'}],row=>`${row.name} · ${row.startsOn}–${row.endsOn}`);
 assert.equal(choices.every(choice=>choice.requiresReview),true);assert.equal(choices.some(choice=>choice.label.includes(other)),false);
});
test('coordinator period choices refuse missing source dates or revision before coverage reads',()=>{
 const valid={id,name:'Term one',startsOn:'2026-10-01',endsOn:'2026-10-31',revision:1};assert.equal(binding.coordinatorHomePeriod(valid).revision,1);
 for(const row of [{...valid,revision:undefined},{...valid,startsOn:null},{...valid,endsOn:'2026-09-30'},{...valid,name:''}])assert.throws(()=>binding.coordinatorHomePeriod(row),LearningApiError);
});
test('coordinator outcome selects only its exact source-linked current task without inventing period attribution',()=>{
 const task={id,recommendationId:id,learnerId:id,referenceId:id,baselineResultId:id,title:'Checking follow-up',instructions:'Explain another reason.',status:'MEASURED',createdAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-02T00:00:00Z',followUpAssessmentId:other};
 const outcome={id,interventionId:id,baselineResultId:id,followUpResultId:other,status:'improved',difference:2,minimumChange:1,baseline:{score:0,maxScore:4},followUp:{score:2,maxScore:4},reason:'OBSERVED_RAW_SCORE_CHANGE',limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',measuredAt:'2026-10-03T00:00:00Z'};
 assert.equal(binding.coordinatorHomeOutcome([outcome],[task])?.task.title,'Checking follow-up');
 assert.equal(binding.coordinatorHomeOutcome([{...outcome,baselineResultId:other}],[task]),null);
 assert.equal(binding.coordinatorHomeOutcome([outcome],[{...task,requiresReview:true,reviewReason:'ACADEMIC_SOURCE_CHANGED'}]),null);
});
