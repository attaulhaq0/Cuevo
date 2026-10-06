import assert from 'node:assert/strict';
import test from 'node:test';
import * as state from '../conversation-state-model.ts';
const id='00000000-0000-4000-8000-000000000001';
test('saved conversation intent contains only the exact route tuple',()=>{
 const value={id,learnerId:id,parentId:id,teacherId:id,classId:id,subjectId:id};
 assert.deepEqual(state.parseConversationIntent(value),value);
 for(const patch of [{id:'unknown'},{learnerId:undefined},{body:'Private message'}])assert.equal(state.parseConversationIntent({...value,...patch}),null);
});
test('saved conversation actions contain only source identity and explicit original decision version',()=>{
 const value={id,kind:'moderate',version:1,target:'HIDE'};
 assert.deepEqual(state.parseConversationAction(value),value);
 for(const patch of [{version:-1},{target:'OPEN'},{kind:'send'},{body:'Private message'}])assert.equal(state.parseConversationAction({...value,...patch}),null);
 assert.equal(state.parseConversationAction({id,kind:'report',version:0,target:null})?.kind,'report');
 assert.equal(state.parseConversationAction({id,kind:'state',version:0,target:'PAUSED'})?.kind,'state');
});
