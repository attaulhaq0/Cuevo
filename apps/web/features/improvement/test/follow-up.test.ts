import assert from 'node:assert/strict';import test from 'node:test';
import type { Assessment } from '../../learning/model.ts';import type { ReleasedResult } from '../../academic/model.ts';import type { Intervention } from '../model.ts';
import { compatibleFollowUpAssessments,compatibleFollowUpResults } from '../follow-up-model.ts';
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
