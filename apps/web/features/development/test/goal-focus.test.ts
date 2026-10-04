import assert from 'node:assert/strict';
import test from 'node:test';
import {learnerGoalEditorFocus} from '../model.ts';

const intent={scope:'school:actor:learner:token:access1',kind:'create' as const,goalId:null};
const current={scope:intent.scope,kind:'create' as 'create'|'review'|null,goalId:null as string|null,permitted:true,failed:false,activeOrigin:true};
test('goal editor focus requires the exact still-open intent and its active opener',()=>{
 const focus=learnerGoalEditorFocus;
 assert.equal(typeof focus,'function');
 assert.equal(focus(intent,current),true);
 for(const change of [{scope:'school:actor:learner:token:access2'},{kind:null},{kind:'review' as const,goalId:'other-goal'},{permitted:false},{failed:true},{activeOrigin:false}])assert.equal(focus(intent,{...current,...change}),false);
 assert.equal(focus(null,current),false);
});
test('review focus cannot transfer to a replacement goal or a create editor',()=>{
 const focus=learnerGoalEditorFocus;
 assert.equal(typeof focus,'function');
 const review={...intent,kind:'review' as const,goalId:'selected-goal'};
 assert.equal(focus(review,{...current,kind:'review',goalId:'selected-goal'}),true);
 assert.equal(focus(review,{...current,kind:'review',goalId:'replacement-goal'}),false);
 assert.equal(focus(review,current),false);
});
