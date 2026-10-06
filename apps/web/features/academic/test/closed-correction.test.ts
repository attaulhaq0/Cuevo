import assert from 'node:assert/strict';
import test from 'node:test';
import { closedCorrectionBasis, closedCorrectionBasisCurrent, validateClosedCorrectionReceipt, parseClosedCorrectionBasis } from '../closed-correction-model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError, type Command } from '../../../shared/api/client.ts';
import { parseReleasedResult, type MarkingItem } from '../model.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item: MarkingItem = { id:id(1),assessmentId:id(2),learnerId:id(3),content:'Closed source work',assessmentTitle:'Reviewed school work',learnerName:'Current learner',policyVersion:2,referenceId:id(4),submissionRevision:1,submissionStatus:'CLOSED',model:'numeric',maxScore:10,rubric:null,currentResult:{id:id(5),resultId:id(6),revision:1,feedback:'Previous feedback',status:'RELEASED',model:'numeric',score:3,maxScore:10} };
const body = { score:0,feedback:'Corrected exact feedback',reason:'Reviewed transcription correction.',parentVisible:false,expectedPolicyVersion:2,expectedRevision:1,expectedSubmissionRevision:1,expectedResultId:id(6),expectedResultRevision:1,sourceEvidence:true };
const command:Command = { key:'original',path:`/v1/submissions/${item.id}/closed-result`,body };
const receipt = { id:id(7),submissionId:item.id,assessmentId:item.assessmentId,learnerId:item.learnerId,revision:2,feedback:body.feedback,status:'RELEASED',policyVersion:2,referenceId:item.referenceId,referenceVersion:'school-v1',evidenceId:id(8),createdAt:'2026-10-03T09:00:00Z',actorId:id(9),parentVisible:false,assessmentTitle:item.assessmentTitle,referenceTitle:'School reference',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2} };

test('closed correction receipt matches actual native source values and original revisions before settlement',()=>{
  assert.equal(validateClosedCorrectionReceipt(receipt,command,item,id(9)).id,id(7));
  const journal=new CommandJournal();const original=journal.prepare(command.path,command.path,body);
  const validate=(value:unknown,sent:Command)=>{validateClosedCorrectionReceipt(value,sent,item,id(9));};
  for(const patch of [{submissionId:id(99)},{learnerId:id(99)},{assessmentId:id(99)},{score:1,nativeResult:{type:'numeric',score:1,maxScore:10,policyVersion:2}},{maxScore:20,nativeResult:{type:'numeric',score:0,maxScore:20,policyVersion:2}},{revision:1},{parentVisible:true},{actorId:id(99)},{privateNotes:'Excluded'}]){
    assert.throws(()=>confirmCommandReceipt(journal,command.path,original.key,{...receipt,...patch},undefined,validate),error=>error instanceof LearningApiError&&error.uncertain);
    assert.equal(journal.get(command.path),original);
  }
  assert.equal(confirmCommandReceipt(journal,command.path,original.key,receipt,undefined,validate),true);
});

test('closed correction working basis contains source identity and versions while fresh changes require review',()=>{
  const basis=closedCorrectionBasis(item);assert.ok(basis);assert.equal('content'in basis,false);assert.equal('feedback'in basis,false);
  assert.equal(closedCorrectionBasisCurrent(basis,item),true);
  assert.equal(closedCorrectionBasisCurrent(basis,{...item,submissionRevision:2}),false);
  assert.equal(closedCorrectionBasisCurrent(basis,{...item,currentResult:{...item.currentResult!,revision:2}}),false);
  assert.equal(closedCorrectionBasis({...item,submissionStatus:'RETURNED'}),null);
  assert.deepEqual(parseClosedCorrectionBasis(basis),basis);
  assert.equal(parseClosedCorrectionBasis({...basis,feedback:'Private working text'}),null);
  assert.equal(parseClosedCorrectionBasis({...basis,submissionRevision:0}),null);
});

test('closed correction rejects old result identity and accepts only exact already-recorded replay',()=>{
  assert.throws(()=>validateClosedCorrectionReceipt({...receipt,id:id(6)},command,item,id(9)),error=>error instanceof LearningApiError&&error.uncertain);
  const current:MarkingItem={...item,currentResult:{...item.currentResult!,resultId:id(7),revision:2}};
  assert.equal(validateClosedCorrectionReceipt(receipt,command,current,id(9)).id,id(7));
  assert.throws(()=>validateClosedCorrectionReceipt({...receipt,id:id(99)},command,current,id(9)),error=>error instanceof LearningApiError&&error.uncertain);
});

test('closed review draft preserves distinct latest marking and prior released revisions',()=>{
  const source:MarkingItem={...item,currentResult:{...item.currentResult!,id:id(11),status:'REVIEW',revision:2,resultId:null}};
  assert.equal(closedCorrectionBasis(source),null);
  const prior=parseReleasedResult({...receipt,id:id(6),revision:1,score:3,nativeResult:{type:'numeric',score:3,maxScore:10,policyVersion:2}});
  const basis=closedCorrectionBasis(source,prior);assert.ok(basis);assert.equal(basis.markRevision,2);assert.equal(basis.resultRevision,1);assert.equal(basis.referenceId,item.referenceId);
  const next={...receipt,revision:3};const original={...command,body:{...body,expectedRevision:2}};
  assert.equal(validateClosedCorrectionReceipt(next,original,source,id(9),prior).revision,3);
  assert.equal(closedCorrectionBasis(source,{...prior,submissionId:id(99)}),null);
  assert.equal(closedCorrectionBasis(source,{...prior,learnerId:id(99)}),null);
  assert.equal(closedCorrectionBasis(source,{...prior,assessmentId:id(99)}),null);
  assert.equal(closedCorrectionBasis(source,{...prior,revision:2}),null);
  assert.equal(closedCorrectionBasis(source,parseReleasedResult({...prior,maxScore:20,nativeResult:{type:'numeric',score:3,maxScore:20,policyVersion:2}})),null);
  assert.throws(()=>validateClosedCorrectionReceipt(next,{...original,body:{...original.body,expectedResultRevision:2}},source,id(9),prior),error=>error instanceof LearningApiError&&error.uncertain);
});

test('closed correction rubric preserves the complete source descriptors without numeric values',()=>{
  const rubric={id:id(10),title:'School rubric',version:'school-v1',criteria:[{key:'method',title:'Method',levels:[{key:'shown',label:'Shown',description:'Explains the method.'}]}]};
  const source:MarkingItem={...item,model:'rubric',rubric,currentResult:null};
  delete(source as unknown as Record<string,unknown>).maxScore;
  const input={...body,nativeResult:{type:'rubric',rubricId:rubric.id,criteria:[{criterionKey:'method',levelKey:'shown'}]},expectedRevision:0,expectedResultId:null,expectedResultRevision:0};delete(input as Record<string,unknown>).score;
  const native={type:'rubric',rubricId:rubric.id,rubricTitle:rubric.title,rubricVersion:rubric.version,policyVersion:2,normalized:null,criteria:[{criterionKey:'method',criterionTitle:'Method',levelKey:'shown',levelLabel:'Shown',levelDescription:'Explains the method.'}]};
  const returned={...receipt,model:'rubric',revision:1,nativeResult:native};delete(returned as Record<string,unknown>).score;delete(returned as Record<string,unknown>).maxScore;
  assert.equal(validateClosedCorrectionReceipt(returned,{...command,body:input},source,id(9)).model,'rubric');
  assert.throws(()=>validateClosedCorrectionReceipt({...returned,nativeResult:{...native,criteria:[{...native.criteria[0],levelDescription:'Invented descriptor'}]}},{...command,body:input},source,id(9)),error=>error instanceof LearningApiError&&error.uncertain);
});
