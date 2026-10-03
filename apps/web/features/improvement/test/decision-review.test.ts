import assert from 'node:assert/strict';import test from 'node:test';
import {CommandJournal,confirmCommandReceipt,LearningApiError}from'../../../shared/api/client.ts';
import {retainedProposalDecision,validateProposalDecisionReceipt}from'../decision-review-model.ts';
const id='b0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000002';
test('uncertain decision presentation takes its label from the original immutable command',()=>{
 const journal=new CommandJournal(),path=`/v1/recommendations/${id}/decision`,command=journal.prepare(path,path,{decision:'APPROVE',reason:'Reviewed source.',editedActivityTitle:'Practice',editedInstructions:'Explain a step.'});
 assert.deepEqual(retainedProposalDecision(command),{id,value:'APPROVE'});
 assert.throws(()=>journal.prepare(path,path,{decision:'REJECT',reason:'Another action.'}),LearningApiError);
 assert.deepEqual(retainedProposalDecision(journal.get(path)),{id,value:'APPROVE'});
 assert.equal(retainedProposalDecision({...command,body:{decision:'UNKNOWN'}}),null);
});
test('decision receipt must match the original proposal and decision before settlement',()=>{
 const journal=new CommandJournal(),path=`/v1/recommendations/${id}/decision`,command=journal.prepare(path,path,{decision:'APPROVE',reason:'Reviewed source.'});
 const receipt={id,recommendationId:id,status:'APPROVED',decision:'APPROVE',interventionId:other};
 for(const change of[{id:other},{recommendationId:other},{decision:'REJECT'},{status:'REJECTED'},{interventionId:null},{extra:true}]){
  assert.throws(()=>confirmCommandReceipt(journal,path,command.key,{...receipt,...change},undefined,validateProposalDecisionReceipt),LearningApiError);assert.equal(journal.get(path)?.key,command.key);
 }
 assert.equal(confirmCommandReceipt(journal,path,command.key,receipt,undefined,validateProposalDecisionReceipt),true);
});
test('rejection cannot be presented as an approved practice grant',()=>{
 const journal=new CommandJournal(),path=`/v1/recommendations/${id}/decision`,command=journal.prepare(path,path,{decision:'REJECT',reason:'Reviewed reason.'});
 const receipt={id,recommendationId:id,status:'REJECTED',decision:'REJECT',interventionId:null};
 assert.doesNotThrow(()=>validateProposalDecisionReceipt(receipt,command));assert.throws(()=>validateProposalDecisionReceipt({...receipt,interventionId:other},command),LearningApiError);
});
