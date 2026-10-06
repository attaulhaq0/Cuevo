import assert from 'node:assert/strict';
import test from 'node:test';
import * as school from '../model.ts';
import { CommandJournal, LearningApiError, captureCommandReceiptValidator, confirmCommandReceipt } from '../../../shared/api/client.ts';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const schoolId=id(1),sourceId=id(2);
const receipt={id:sourceId,schoolId,revision:1,status:'REQUESTED',createdAt:'2026-10-03T00:00:00Z',expiresAt:'2026-10-10T00:00:00Z'};
const item={...receipt,purpose:'invite',displayName:'Current learner',email:'learner@example.test',role:'student',userId:null};
const functions=()=>school as unknown as {readBoundAccountPage:(value:unknown,schoolId:string)=>{items:unknown[]};parseBoundDelivery:(value:unknown,schoolId:string,id:string)=>unknown;validateAccountReceipt:(value:unknown,kind:'invite'|'recovery'|'revoke',schoolId:string,body:unknown,id?:string)=>unknown;parseAccountSelection:(value:unknown)=>unknown};

test('account reads reject another school and exact delivery source before display',()=>{
 const model=functions();assert.equal(typeof model.readBoundAccountPage,'function');assert.equal(typeof model.parseBoundDelivery,'function');
 assert.equal(model.readBoundAccountPage({items:[item],nextCursor:null},schoolId).items.length,1);
 assert.throws(()=>model.readBoundAccountPage({items:[{...item,schoolId:id(9)}],nextCursor:null},schoolId),LearningApiError);
 const effect={id:sourceId,schoolId,eventId:id(3),requestRevision:1,status:'AWAITING_CLAIM',providerState:'CONFIRMED',deliveryState:'ACCEPTED'};
 assert.deepEqual(model.parseBoundDelivery({state:'COMPLETED',receipt:effect},schoolId,sourceId),{state:'COMPLETED',receipt:effect});
 for(const value of [{state:'COMPLETED',receipt:{...effect,id:id(9)}},{state:'COMPLETED',receipt:{...effect,schoolId:id(9)}},{state:'COMPLETED',receipt:{...effect,providerState:'OUTCOME_UNKNOWN'}},{state:'UNKNOWN',receipt:null}])assert.throws(()=>model.parseBoundDelivery(value,schoolId,sourceId),LearningApiError);
 assert.deepEqual(model.parseBoundDelivery({state:'PENDING',receipt:null},schoolId,sourceId),{state:'PENDING',receipt:null});
});

test('account invitation recovery and cancellation receipts settle only the original source revision',()=>{
 const model=functions();assert.equal(typeof model.validateAccountReceipt,'function');
 const examples=[{kind:'invite' as const,path:'/v1/school/accounts/invitations',body:{displayName:'Current learner',email:'learner@example.test',role:'student',reason:'School reviewed',confirmInvitation:true},valid:receipt},
 {kind:'recovery' as const,path:`/v1/school/accounts/${id(4)}/recovery`,body:{expectedMembershipRevision:2,reason:'Verified member',confirmRecovery:true},valid:receipt},
 {kind:'revoke' as const,path:`/v1/school/accounts/invitations/${sourceId}/revoke`,body:{expectedRevision:3,reason:'Cancel source',confirmRevocation:true},valid:{...receipt,revision:4,status:'REVOKED'}}];
 for(const e of examples){const journal=new CommandJournal();const command=journal.prepare(e.path,e.path,e.body);const target=e.kind==='invite'?undefined:e.kind==='revoke'?e.path.split('/')[5]:e.path.split('/')[4];const validate=captureCommandReceiptValidator(command,(output,original)=>{model.validateAccountReceipt(output,e.kind,schoolId,original.body,target);});let effects=0;
 for(const value of [{id:sourceId},{...e.valid,schoolId:id(9)},{...e.valid,revision:e.valid.revision+1},{...e.valid,status:'CLAIMED'},{...e.valid,id:'invalid'}]){assert.throws(()=>confirmCommandReceipt(journal,e.path,command.key,value,()=>{effects++;},validate),error=>error instanceof LearningApiError&&error.uncertain);assert.equal(journal.get(e.path)?.key,command.key);assert.equal(effects,0);}
 if(e.kind==='revoke')assert.throws(()=>model.validateAccountReceipt({...e.valid,id:id(9)},e.kind,schoolId,e.body,target),LearningApiError);
 assert.equal(confirmCommandReceipt(journal,e.path,command.key,e.valid,()=>{effects++;},validate),true);assert.equal(effects,1);
 }
});

test('account selection contains only strict source intent and never private person or credential content',()=>{
 const model=functions();assert.equal(typeof model.parseAccountSelection,'function');
 for(const value of [{kind:'invite'},{kind:'recover'},{kind:'read',id:sourceId},{kind:'revoke',id:sourceId,revision:2}])assert.deepEqual(model.parseAccountSelection(value),value);
 for(const value of [null,[],{}, {kind:'other'},{kind:'invite',email:'private@example.test'},{kind:'recover',id:sourceId},{kind:'read',id:'invalid'},{kind:'read',id:sourceId,revision:1},{kind:'revoke',id:sourceId,revision:0},{kind:'revoke',id:sourceId,revision:1.5},{kind:'revoke',id:sourceId,revision:Number.MAX_SAFE_INTEGER+1}])assert.equal(model.parseAccountSelection(value),null);
});
