import assert from 'node:assert/strict';import test from 'node:test';
import type { Assessment } from '../../learning/model.ts';import type { ReleasedResult } from '../../academic/model.ts';import type { Intervention } from '../model.ts';
import { compatibleFollowUpAssessments,compatibleFollowUpResults } from '../follow-up-model.ts';
import {validatePracticeManagementReceipt,parseIntervention} from '../model.ts';
import {LearningApiError} from '../../../shared/api/client.ts';
const task={id:'practice',baselineResultId:'baseline',learnerId:'learner',referenceId:'objective',followUpAssessmentId:'followup'}as Intervention;
const baseline={id:'baseline',learnerId:'learner',assessmentId:'before',referenceId:'objective',model:'numeric',maxScore:10}as ReleasedResult;
const source={id:'before',courseId:'course',referenceId:'objective',model:'numeric',maxScore:10,status:'PUBLISHED',rubricId:null}as Assessment;
const followup={...source,id:'followup'};
test('follow-up choices use exact baseline learner course objective and native scale',()=>{
 const rows=[source,followup,{...followup,id:'wrong-course',courseId:'other'},{...followup,id:'wrong-objective',referenceId:'other'},{...followup,id:'wrong-scale',maxScore:4},{...followup,id:'private',status:'DRAFT'}];
 assert.deepEqual(compatibleFollowUpAssessments(task,[baseline],rows),[followup]);
 assert.deepEqual(compatibleFollowUpAssessments(task,[],rows),[]);
 assert.deepEqual(compatibleFollowUpAssessments(task,[{...baseline,learnerId:'other'}],rows),[]);
 assert.deepEqual(compatibleFollowUpAssessments(task,[baseline,baseline],rows),[]);
});
test('native rubric follow-up uses the recorded definition and remains separate from numeric choices',()=>{
 const native={...baseline,model:'rubric',nativeResult:{type:'rubric',rubricId:'rubric'}}as ReleasedResult;
 const before={...source,model:'rubric',rubricId:'rubric'}as Assessment;const after={...before,id:'followup'};
 assert.deepEqual(compatibleFollowUpAssessments(task,[native],[before,after,{...after,id:'other',model:'rubric',rubricId:'other'}as Assessment]),[after]);
});
test('released measurement choices cannot borrow another learner linked task or objective',()=>{
 const result={...baseline,id:'after',assessmentId:'followup'};
 assert.deepEqual(compatibleFollowUpResults(task,[result,{...result,id:'other',learnerId:'other'},{...result,id:'wrong',assessmentId:'another'}]),[result]);
});
test('original reassessment and outcome receipts retain the exact practice baseline and native threshold',()=>{
 const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const current=parseIntervention({id,recommendationId:id,learnerId:id,referenceId:id,baselineResultId:id,title:'Checking task',instructions:'Explain a check',status:'COMPLETED',createdAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-02T00:00:00Z',followUpAssessmentId:other});
 const link={key:'original',path:`/v1/interventions/${id}/reassessment`,body:{assessmentId:other}};assert.doesNotThrow(()=>validatePracticeManagementReceipt(current,current,link));assert.throws(()=>validatePracticeManagementReceipt({...current,followUpAssessmentId:id},current,link),LearningApiError);
 const outcome={id:other,interventionId:id,baselineResultId:id,followUpResultId:other,status:'improved',difference:2,minimumChange:1,baseline:{score:0,maxScore:10},followUp:{score:2,maxScore:10},reason:'OBSERVED_RAW_SCORE_CHANGE',limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',measuredAt:'2026-10-03T00:00:00Z'};
 const measure={key:'original',path:`/v1/interventions/${id}/measure`,body:{followUpResultId:other,minimumChange:1}};assert.doesNotThrow(()=>validatePracticeManagementReceipt(outcome,current,measure));for(const change of[{interventionId:other},{baselineResultId:other},{followUpResultId:id},{minimumChange:2}])assert.throws(()=>validatePracticeManagementReceipt({...outcome,...change},current,measure),LearningApiError);
});
