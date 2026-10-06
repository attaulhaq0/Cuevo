import assert from 'node:assert/strict';
import test from 'node:test';
import * as binding from '../parent-home-binding-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id='00000000-0000-4000-8000-000000000001',child='00000000-0000-4000-8000-000000000002';
const policy={id,version:1,enabled:true,approvedAt:'2026-10-05T00:00:00Z'};
const context={apiUrl:'https://api.invalid',membership:{schoolId:id,userId:id,role:'parent'},accessToken:'current',accessGeneration:1,online:true,status:'ready'};
const scope=binding.parentHomeReadScope(context,child,'/v1/community/conversations/policy',0)!;

test('Parent Home conversation policy permits exact child directory only after a current enabled read',()=>{
 assert.equal(typeof binding.parentHomeConversationPolicy,'function');
 const current=binding.parentHomeConversationPolicy({scope,value:policy},scope,false,null);
 assert.equal(current.state,'enabled');
 assert.equal(binding.parentHomeConversationPath(current,child),`/v1/community/conversations?limit=25&learnerId=${child}`);
 const disabled=binding.parentHomeConversationPolicy({scope,value:{...policy,version:0,enabled:false,approvedAt:null}},scope,false,null);
 assert.equal(disabled.state,'disabled');assert.equal(binding.parentHomeConversationPath(disabled,child),null);
});
test('unknown loading denied or old policy cannot authorize a conversation request',()=>{
 for(const state of [binding.parentHomeConversationPolicy(null,scope,true,null),binding.parentHomeConversationPolicy({scope:'old-token',value:policy},scope,false,null),binding.parentHomeConversationPolicy({scope,value:policy},scope,false,new LearningApiError('denied')),binding.parentHomeConversationPolicy({scope,value:policy},null,false,null)])assert.equal(binding.parentHomeConversationPath(state,child),null);
 const changed=binding.parentHomeReadScope({...context,accessToken:'next'},child,'/v1/community/conversations/policy',0);
 assert.equal(binding.parentHomeConversationPath(binding.parentHomeConversationPolicy({scope,value:policy},changed,false,null),child),null);
});
test('conversation policy parser preserves disabled default and rejects invalid or invented policy fields',()=>{
 assert.equal(binding.parseParentHomeConversationPolicy({id,version:0,enabled:false,approvedAt:null}).enabled,false);
 assert.throws(()=>binding.parseParentHomeConversationPolicy({...policy,studentMessagingEnabled:true}),LearningApiError);
 assert.throws(()=>binding.parseParentHomeConversationPolicy({...policy,enabled:'yes'}),LearningApiError);
});
