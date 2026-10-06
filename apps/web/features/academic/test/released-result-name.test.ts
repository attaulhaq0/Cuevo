import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReleasedResult } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const result={id:id(1),submissionId:id(2),assessmentId:id(3),learnerId:id(4),revision:1,feedback:'Current school feedback',status:'RELEASED',policyVersion:2,referenceId:id(5),referenceVersion:'school-v1',evidenceId:id(6),createdAt:'2026-10-05T08:00:00Z',assessmentTitle:'Explain a method',referenceTitle:'Checking reasons',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2}};
test('released native result preserves nullable current learner context and legacy absence',()=>{
 assert.equal(parseReleasedResult(result).learnerName,undefined);
 for(const name of [null,'Lina Al-Kuwari','  Current school name  ',id(4)]) {const parsed=parseReleasedResult({...result,learnerName:name});assert.equal(parsed.learnerName,name);assert.deepEqual(parsed.nativeResult,result.nativeResult);assert.equal(parsed.learnerId,id(4));}
});
test('invalid learner-name types and blank or oversized names cannot become current read context',()=>{
 for(const name of ['', '   ','x'.repeat(201),42,false,{},[]])assert.throws(()=>parseReleasedResult({...result,learnerName:name}),LearningApiError);
});
test('rubric reader keeps nullable names and descriptors without introducing a numeric scale',()=>{
 const base=Object.fromEntries(Object.entries(result).filter(([key])=>!['score','maxScore','nativeResult'].includes(key)));
 const source={...base,model:'rubric',learnerName:null,nativeResult:{type:'rubric',rubricId:id(10),rubricTitle:'Checking rubric',rubricVersion:'school-v1',policyVersion:2,normalized:null,criteria:[{criterionKey:'check',criterionTitle:'Checking',levelKey:'shown',levelLabel:'Shown',levelDescription:'A checking step is shown.'}]}};
 const parsed=parseReleasedResult(source);assert.equal(parsed.learnerName,null);assert.deepEqual(parsed.nativeResult,source.nativeResult);assert.equal('score'in parsed,false);assert.equal('maxScore'in parsed,false);
});
