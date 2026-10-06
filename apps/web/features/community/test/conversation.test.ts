import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationReadScope, currentConversationRead, parseCurrentConversation, parseCurrentConversationChoice, parseCurrentConversationMessage, parseCurrentConversationReport, conversationChoiceOptions, validateConversationReceipt, conversationIdentity } from '../conversation-model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError, type Command } from '../../../shared/api/client.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),teacher=id(2),learner=id(3),classId=id(4),subject=id(5),threadId=id(6),messageId=id(7),stamp='2026-10-03T09:00:00Z';
const thread={id:threadId,learnerId:learner,parentId:actor,teacherId:teacher,classId,subjectId:subject,title:'Checking conversation',learnerName:'Alex',parentName:'Sam',teacherName:'Maya',className:'Cedar',academicYearName:'2026–2027',subjectName:'School subject',createdAt:stamp,state:'OPEN' as const,stateVersion:0,canModerate:false};
const message={id:messageId,conversationId:threadId,senderId:teacher,senderName:'Maya',senderRole:'teacher' as const,body:'Current explanation',sentAt:stamp,delivery:'DELIVERED_IN_APP' as const,status:'VISIBLE' as const,moderationVersion:0,recipientReadAt:null};
const cmd=(path:string,body:Record<string,unknown>):Command=>({key:'original',path:'/v1/community/conversations'+path,body});
const invalid=(f:()=>unknown)=>assert.throws(f,error=>error instanceof LearningApiError);

test('conversation read scope admits only connected permitted adult roles and refuses stale source frames',()=>{
  const context={apiUrl:'https://api.example.invalid',membership:{schoolId:'school',userId:actor,role:'parent',entitlements:['community']},accessToken:'fictional',online:true,status:'ready',accessGeneration:1};
  const scope=conversationReadScope(context,'/v1/community/conversations',0);assert.ok(scope);assert.equal(currentConversationRead({scope,value:thread},scope),thread);
  for(const patch of[{online:false},{status:'verifying'},{accessToken:null},{membership:{...context.membership,role:'student'}},{membership:{...context.membership,entitlements:[]}}])assert.equal(conversationReadScope({...context,...patch},'/v1/community/conversations',0),null);
  assert.equal(currentConversationRead({scope,value:thread},conversationReadScope({...context,accessGeneration:2},'/v1/community/conversations',0)),null);
});

test('current conversation and choice require exact actor tuple with no parent moderation',()=>{
  assert.equal(parseCurrentConversation(thread,threadId,'parent',actor).id,threadId);
  invalid(()=>parseCurrentConversation(thread,id(99),'parent',actor));invalid(()=>parseCurrentConversation(thread,threadId,'parent',teacher));invalid(()=>parseCurrentConversation({...thread,canModerate:true},threadId,'parent',actor));
  const {createdAt,state,stateVersion,canModerate,title,...choice}=thread;void createdAt;void state;void stateVersion;void canModerate;void title;
  assert.equal(parseCurrentConversationChoice(choice,'parent',actor).parentId,actor);invalid(()=>parseCurrentConversationChoice(choice,'teacher',actor));
  const options=conversationChoiceOptions([choice,{...choice,id:id(99)}]);assert.equal(options.every(row=>row.requiresReview),true);assert.equal(options[0].label,options[1].label);assert.equal(options[0].label.includes(choice.id),false);
});

test('message and reported source parsers bind thread and actual sender role without hidden body leakage',()=>{
  assert.equal(parseCurrentConversationMessage(message,thread).senderId,teacher);
  invalid(()=>parseCurrentConversationMessage({...message,conversationId:id(99)},thread));invalid(()=>parseCurrentConversationMessage({...message,senderId:actor},thread));
  assert.equal(parseCurrentConversationMessage({...message,status:'HIDDEN',body:null,moderationVersion:1},thread).body,null);
  const report={id:id(8),conversationId:threadId,messageId,reporterName:'Sam',reason:'Needs school review',createdAt:stamp};assert.equal(parseCurrentConversationReport(report,threadId).messageId,messageId);invalid(()=>parseCurrentConversationReport({...report,conversationId:id(99)},threadId));
});

test('policy and conversation creation receipts match original fields and permit current paused replay',()=>{
  const policy=cmd('/policy',{enabled:true,expectedVersion:0,reason:'School reviewed',confirmApproval:true});validateConversationReceipt({id:id(8),version:1,enabled:true,approvedAt:stamp},policy,teacher,'admin');invalid(()=>validateConversationReceipt({id:id(8),version:2,enabled:true,approvedAt:stamp},policy,teacher,'admin'));
  const create=cmd('',{learnerId:learner,parentId:actor,teacherId:teacher,classId,subjectId:subject,title:' Checking conversation ',body:' First message '});validateConversationReceipt(thread,create,actor,'parent');validateConversationReceipt({...thread,state:'PAUSED',stateVersion:1},create,actor,'parent');invalid(()=>validateConversationReceipt({...thread,teacherId:id(99)},create,actor,'parent'));
});

test('unmounted sent-message receipt validates exact original sender text and valid hidden/read replay',()=>{
  const original=cmd('/'+threadId+'/messages',{body:' Current explanation '});const journal=new CommandJournal();const command=journal.prepare(original.path,original.path,original.body);const sent={...message,senderId:actor,senderName:'Sam',senderRole:'parent'};
  const validate=(value:unknown,source:Command)=>validateConversationReceipt(value,source,actor,'parent',thread);
  assert.throws(()=>confirmCommandReceipt(journal,original.path,command.key,{...sent,body:'Other text'},undefined,validate),error=>error instanceof LearningApiError&&error.uncertain);assert.equal(journal.get(original.path),command);
  assert.equal(confirmCommandReceipt(journal,original.path,command.key,{...sent,status:'HIDDEN',body:null,moderationVersion:1,recipientReadAt:stamp},undefined,validate),true);
  invalid(()=>validateConversationReceipt({...sent,senderId:teacher},original,actor,'parent',thread));
});

test('read and moderation receipts check only echoed target or generated status and original approval schema',()=>{
  const read=cmd('/messages/'+messageId+'/read',{});validateConversationReceipt({id:messageId,status:'READ'},read,actor,'parent',thread,message);invalid(()=>validateConversationReceipt({id:id(99),status:'READ'},read,actor,'parent',thread,message));
  for(const[path,body,status]of[['/messages/'+messageId+'/report',{reason:'School review'},'REPORTED'],['/messages/'+messageId+'/moderate',{action:'HIDE',expectedVersion:0,reason:'School review',confirmModeration:true},'HIDDEN'],['/'+threadId+'/state',{state:'PAUSED',expectedVersion:0,reason:'School review',confirmModeration:true},'PAUSED']]as const){const command=cmd(path,body);validateConversationReceipt({id:id(99),status},command,teacher,'teacher',{...thread,canModerate:true},message);invalid(()=>validateConversationReceipt({id:id(99),status:'UNKNOWN'},command,teacher,'teacher',thread,message));invalid(()=>validateConversationReceipt({id:id(99),status,version:1},command,teacher,'teacher',thread,message));}
});

test('conversation action receipts require the exact captured message and assigned teacher relationship',()=>{
  const read=cmd('/messages/'+messageId+'/read',{});invalid(()=>validateConversationReceipt({id:messageId,status:'READ'},read,actor,'parent'));
  invalid(()=>validateConversationReceipt({id:messageId,status:'READ'},read,actor,'parent',thread,{...message,id:id(99)}));
  invalid(()=>validateConversationReceipt({id:messageId,status:'READ'},read,actor,'parent',thread,{...message,conversationId:id(99)}));
  const moderate=cmd('/messages/'+messageId+'/moderate',{action:'HIDE',expectedVersion:0,reason:'School review',confirmModeration:true});
  invalid(()=>validateConversationReceipt({id:id(99),status:'HIDDEN'},moderate,id(98),'teacher',{...thread,canModerate:true},message));
  const state=cmd('/'+threadId+'/state',{state:'PAUSED',expectedVersion:0,reason:'School review',confirmModeration:true});
  invalid(()=>validateConversationReceipt({id:id(99),status:'PAUSED'},state,id(98),'teacher',{...thread,canModerate:true}));
});

test('conversation source and receipt helpers cannot admit private metadata or another participant',()=>{
  assert.deepEqual(Object.keys(conversationIdentity(thread)),['id','learnerId','parentId','teacherId','classId','subjectId']);
  invalid(()=>parseCurrentConversation({...thread,privateNotes:'Excluded'},threadId,'parent',actor));
  const sent=cmd('/'+threadId+'/messages',{body:'Current explanation'});
  invalid(()=>validateConversationReceipt(message,sent,learner,'parent',thread));
  invalid(()=>validateConversationReceipt({...message,privateNotes:'Excluded'},sent,teacher,'teacher',thread));
  invalid(()=>validateConversationReceipt({id:messageId,status:'READ'},cmd('/messages/'+messageId+'/read',{}),actor,'admin',thread));
  invalid(()=>validateConversationReceipt({id:id(99),status:'HIDDEN'},cmd('/messages/'+messageId+'/moderate',{action:'HIDE',expectedVersion:0,reason:'School review',confirmModeration:true}),actor,'parent',thread));
});
