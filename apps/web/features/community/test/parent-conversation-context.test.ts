import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationChildCurrent, conversationChildMatches, recoverConversationAction, recoverConversationChoice } from '../conversation-state-model.ts';
const child={id:'child-a'};
test('Parent conversation context admits an already resolved child from a current loaded directory',()=>{
  const query={loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:'later'};
  assert.equal(conversationChildCurrent(child,query),child);
  for(const change of[{loaded:false},{loading:true},{loadingMore:true},{error:{}},{moreError:{}}])assert.equal(conversationChildCurrent(child,{...query,...change}),null);
  assert.equal(conversationChildCurrent(undefined,query),null);
});
test('pending conversation creation restores only its exact currently authorized participant choice',()=>{
 const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const choice={id,learnerId:id,parentId:id,teacherId:other,classId:id,subjectId:id,learnerName:'Alex',parentName:'Sam',teacherName:'Maya',className:'Cedar',academicYearName:'2026',subjectName:'Reasoning'};
 const command={key:'original',path:'/v1/community/conversations',body:{learnerId:id,parentId:id,teacherId:other,classId:id,subjectId:id,title:'School question',body:'Original question'}};
 assert.equal(recoverConversationChoice(command,[choice])?.id,id);
 assert.equal(recoverConversationChoice(command,[{...choice,learnerId:other}]),null);
 assert.equal(recoverConversationChoice(command,[choice,{...choice,id:other}]),null);
 assert.equal(recoverConversationChoice({...command,body:{...command.body,body:''}},[choice]),null);
});
test('pending message actions recover only against a current matching source in the exact thread',()=>{
 const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const command={key:'original',path:`/v1/community/conversations/messages/${id}/report`,body:{reason:'Reviewed original source'}};
 assert.deepEqual(recoverConversationAction([command],other,[{id,moderationVersion:2}]),{id,kind:'report',version:2,target:null});
 assert.equal(recoverConversationAction([command],other,[]),null);
 assert.equal(recoverConversationAction([{...command,body:{reason:''}}],other,[{id,moderationVersion:2}]),null);
 assert.equal(recoverConversationAction([command,command],other,[{id,moderationVersion:2}]),null);
});
test('a selected conversation cannot render beneath another child context',()=>{
  assert.equal(conversationChildMatches({learnerId:'child-a'},'child-a'),true);
  assert.equal(conversationChildMatches({learnerId:'child-a'},'child-b'),false);
  assert.equal(conversationChildMatches({learnerId:'child-a'},null),false);
  assert.equal(conversationChildMatches(null,'child-a'),false);
});
