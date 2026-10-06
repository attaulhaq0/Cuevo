import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationReadingFocusState,conversationReadingKey,conversationFocusCleanupOwns} from '../conversation-reading-focus.ts';
const model={conversationReadingFocusState};
const intent={scope:'school:actor:token:access1:en:child:refresh0',threadKey:'thread:learner:parent:teacher:class:subject',readingScope:'thread-read:messages0:reports0'};
const current={scope:intent.scope,threadKey:intent.threadKey,readingScope:intent.readingScope,permitted:true,state:'loading' as 'loading'|'ready'|'error',newerFocus:false,openerConnected:false,activeIsOpener:false,activeIsNeutral:true,headingAvailable:false};
test('explicit conversation opening waits for the exact thread and authorized message/report reads',()=>{
 assert.equal(typeof model.conversationReadingFocusState,'function');
 assert.equal(model.conversationReadingFocusState!(intent,current),'wait');
 assert.equal(model.conversationReadingFocusState!(intent,{...current,state:'ready',headingAvailable:true}),'focus');
 assert.equal(model.conversationReadingFocusState!(intent,{...current,state:'ready',headingAvailable:true,openerConnected:true,activeIsOpener:true,activeIsNeutral:false}),'focus');
 assert.equal(model.conversationReadingFocusState!(null,{...current,state:'ready',headingAvailable:true}),'cancel');
});
test('newer focus, closure and school/actor/token/access/locale/child context revoke pending reading movement',()=>{
 assert.equal(typeof model.conversationReadingFocusState,'function');
 for(const change of[{newerFocus:true},{threadKey:null},{permitted:false},{scope:'school:actor:token:access2:en:child:refresh0'},{scope:'school:actor:token:access1:ar:child:refresh0'},{scope:'school:actor:token:access1:en:other-child:refresh0'},{activeIsNeutral:false},{openerConnected:true}])assert.equal(model.conversationReadingFocusState!(intent,{...current,...change}),'cancel');
});
test('late private read failure or source refresh cannot inherit the original Open focus',()=>{
 assert.equal(typeof model.conversationReadingFocusState,'function');
 assert.equal(model.conversationReadingFocusState!(intent,{...current,state:'error'}),'cancel');
 assert.equal(model.conversationReadingFocusState!(intent,{...current,readingScope:'thread-read:messages1:reports0'}),'cancel');
 assert.equal(model.conversationReadingFocusState!(intent,{...current,scope:'school:actor:token:access1:en:child:refresh1'}),'cancel');
 assert.equal(model.conversationReadingFocusState!({...intent,readingScope:null},{...current,readingScope:null}),'wait');
});
test('reading identity retains the entire conversation tuple without source content',()=>{
 const source={id:'thread',learnerId:'learner',parentId:'parent',teacherId:'teacher',classId:'class',subjectId:'subject'};
 const key=conversationReadingKey(source);
 assert.equal(key,JSON.stringify(['thread','learner','parent','teacher','class','subject']));
 for(const field of Object.keys(source) as (keyof typeof source)[])assert.notEqual(conversationReadingKey({...source,[field]:'replacement'}),key);
});
test('cleanup of an earlier held Open cannot cancel the replacement explicit Open',()=>{
 const first={scope:'current',threadKey:'first'},second={scope:'current',threadKey:'second'};
 assert.equal(conversationFocusCleanupOwns(first,first),true);
 assert.equal(conversationFocusCleanupOwns(first,second),false);
 assert.equal(conversationFocusCleanupOwns(first,null),false);
 assert.equal(conversationFocusCleanupOwns(null,null),false);
});
