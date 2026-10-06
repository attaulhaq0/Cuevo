import assert from 'node:assert/strict';
import test from 'node:test';
import { currentSelectedReference, currentSelectedResult, referenceSelection, resultSelection, validateReferenceReceipt } from '../reference-result-reading-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import type { AcademicReference, ReleasedResult } from '../model.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const reference:AcademicReference={id:id(1),title:'School checking',description:'Explain the school checking step.',code:null,version:'school-v1',status:'DRAFT',sourceType:'SCHOOL_AUTHORED',createdBy:id(2),approvedBy:null};
test('objective create and approval receipts retain original author, reviewed source and exact inputs',()=>{
 const create={path:'/v1/academic-references',key:'original',body:{title:reference.title,description:reference.description,version:reference.version}};
 validateReferenceReceipt(reference,create,id(2));
 for(const patch of[{createdBy:id(9)},{description:'Different description'},{status:'APPROVED'}])assert.throws(()=>validateReferenceReceipt({...reference,...patch},create,id(2)),LearningApiError);
 const basis=referenceSelection(reference),approve={path:`/v1/academic-references/${reference.id}/approve`,key:'original',body:{}};
 validateReferenceReceipt({...reference,status:'APPROVED',approvedBy:id(3)},approve,id(3),basis);
 for(const patch of[{id:id(9)},{version:'school-v2'},{createdBy:id(9)},{approvedBy:id(9)}])assert.throws(()=>validateReferenceReceipt({...reference,status:'APPROVED',approvedBy:id(3),...patch},approve,id(3),basis),LearningApiError);
 assert.equal(currentSelectedReference([{...reference,version:'school-v2'}],basis),null);
});
test('released selection keeps native zero and rejects replacement revision, learner, task or native scale',()=>{
 const row:ReleasedResult={id:id(1),submissionId:id(2),assessmentId:id(3),learnerId:id(4),evidenceId:id(5),referenceId:id(6),referenceVersion:'school-v1',revision:1,policyVersion:1,createdAt:'2026-10-03T10:00:00Z',status:'RELEASED',feedback:'Explain the checking step.',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:1}};
 const basis=resultSelection(row);assert.equal(currentSelectedResult([row],basis),row);
 for(const patch of[{revision:2},{learnerId:id(9)},{assessmentId:id(9)},{nativeResult:{type:'numeric' as const,score:1,maxScore:10,policyVersion:1}}])assert.equal(currentSelectedResult([{...row,...patch}],basis),null);
});
