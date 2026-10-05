import assert from'node:assert/strict';import test from'node:test';import * as model from'../thinking-focus-model.ts';
const id='f2000000-0000-4000-8000-000000000001',courseId='f2000000-0000-4000-8000-000000000002';
const row={target:{kind:'ACTIVITY'as const,id,criterionKey:null},courseId,sourceVersion:'activity:2',revision:1};
test('thinking review choice contains only exact current target and source identity',()=>{
 const intent=model.parseThinkingFocusSelection({target:row.target,sourceVersion:row.sourceVersion,revision:row.revision,cursor:null});assert.deepEqual(intent,{target:row.target,sourceVersion:'activity:2',revision:1,cursor:null});
 for(const value of [null,{},[],{...intent,privatePrompt:'Copied instructions'},{...intent,target:{kind:'ACTIVITY',id,criterionKey:'wrong'}}])assert.equal(model.parseThinkingFocusSelection(value),null);
 assert.deepEqual(model.parseThinkingFocusSelection({...intent,cursor:courseId}),{...intent,cursor:courseId});assert.equal(model.parseThinkingFocusSelection({...intent,cursor:'unknown'}),null);
});
test('thinking queue never substitutes another source or source revision for selected editor',()=>{
 const intent={target:row.target,sourceVersion:row.sourceVersion,revision:row.revision,cursor:null};assert.equal(model.currentThinkingFocusSelection([row],intent,courseId,true),row);assert.equal(model.currentThinkingFocusSelection([row],null,courseId,true),null);assert.equal(model.currentThinkingFocusSelection([row],intent,courseId,false),null);
 for(const changed of [{...row,sourceVersion:'activity:3'},{...row,revision:2},{...row,target:{...row.target,id:courseId}},{...row,courseId:id}])assert.equal(model.currentThinkingFocusSelection([changed],intent,courseId,true),null);
 assert.equal(model.currentThinkingFocusSelection([row,row],intent,courseId,true),null);
});
