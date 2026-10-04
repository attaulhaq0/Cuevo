import assert from 'node:assert/strict';
import test from 'node:test';
import { taskReadingFocusState } from '../task-reading-focus.ts';
const state={open:true,permitted:true,failed:false,ready:false,newerFocus:false,openerConnected:false,activeIsOpener:false,activeIsNeutral:true,headingAvailable:false};
test('explicit task opening waits for its current reader and only focuses from its unchanged opener or neutral removal',()=>{
 const intent={scope:'actor:token:activity:g1'};
 assert.equal(taskReadingFocusState(intent,intent.scope,state),'wait');
 assert.equal(taskReadingFocusState(intent,intent.scope,{...state,ready:true,headingAvailable:true}),'focus');
 assert.equal(taskReadingFocusState(intent,intent.scope,{...state,ready:true,headingAvailable:true,openerConnected:true,activeIsOpener:true,activeIsNeutral:false}),'focus');
});
test('newer user focus permanently cancels a held task or nested availability response',()=>{
 const intent={scope:'actor:token:activity:g1'};
 assert.equal(taskReadingFocusState(intent,intent.scope,{...state,newerFocus:true}),'cancel');
 assert.equal(taskReadingFocusState(intent,intent.scope,{...state,ready:true,headingAvailable:true,activeIsNeutral:false}),'cancel');
 assert.equal(taskReadingFocusState(intent,intent.scope,{...state,openerConnected:true,activeIsNeutral:true}),'cancel');
});
test('closure, access/source change and failed or unavailable reads cancel focus while background refresh has no new intent',()=>{
 const intent={scope:'actor:token:activity:g1'};
 for(const scope of['other:token:activity:g1','actor:token2:activity:g1','actor:token:activity:g2','actor:token:activity:g1:refresh'])assert.equal(taskReadingFocusState(intent,scope,state),'cancel');
 for(const change of[{open:false},{permitted:false},{failed:true}])assert.equal(taskReadingFocusState(intent,intent.scope,{...state,...change}),'cancel');
 assert.equal(taskReadingFocusState(null,intent.scope,{...state,ready:true,headingAvailable:true}),'cancel');
});
