import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningApiError } from '../../../shared/api/client.ts';
import { currentHomeFeedbackEvidence, homeFeedbackEvidenceScope, parseHomeFeedbackEvidence, type HomeFeedbackSource } from '../home-source-context.ts';

const id=(number:number)=>`20000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const result:HomeFeedbackSource={id:id(1),learnerId:id(2),submissionId:id(3),evidenceId:id(4),referenceId:id(5),referenceVersion:'school-1',policyVersion:2,revision:1,model:'numeric'};
const evidence={id:result.evidenceId,sourceType:'SUBMISSION',sourceObjectId:result.submissionId,learnerId:result.learnerId,actorId:id(6),createdAt:'2026-10-01T09:00:00Z',quality:'TEACHER_ENTERED',referenceId:result.referenceId,referenceVersion:result.referenceVersion,policyVersion:result.policyVersion,resultId:result.id,revision:result.revision,visibility:'PARENT_APPROVED',reviewStatus:'APPROVED',model:'numeric',context:{status:'READY',labelBasis:'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK',identityRequiresReview:false,learnerName:'Lina Al-Kuwari',recordedByName:'Samira Hassan',assessmentTitle:'Checking explanation',courseTitle:'Checking ideas',className:'Year 1 · Cedar',yearGroupName:'Year 1',academicYearName:'2026–2027',referenceTitle:'Explain a checking step',submittedAt:'2026-10-01T08:00:00Z',submissionRevision:1}};
const actor={role:'student' as const,userId:result.learnerId,learnerId:result.learnerId};
test('Home feedback uses the exact current protected evidence recorder and human course/class context',()=>{
 const value=parseHomeFeedbackEvidence(evidence,result,actor);assert.equal(value.context.recordedByName,'Samira Hassan');
 const scope=homeFeedbackEvidenceScope('current-read',result);assert.equal(currentHomeFeedbackEvidence({scope,value},scope,false,null)?.teacherName,'Samira Hassan');assert.equal(currentHomeFeedbackEvidence({scope,value},scope,false,null)?.contextLabel,'Checking ideas · Year 1 · Cedar');
});
test('Home feedback rejects mismatched source revisions learner and Parent publication instead of borrowing labels',()=>{
 for(const change of [{id:id(7)},{resultId:id(7)},{learnerId:id(7)},{sourceObjectId:id(7)},{referenceId:id(7)},{referenceVersion:'other'},{policyVersion:3},{revision:2},{model:'rubric'}])assert.throws(()=>parseHomeFeedbackEvidence({...evidence,...change},result,actor),LearningApiError);
 assert.throws(()=>parseHomeFeedbackEvidence(evidence,result,{...actor,userId:id(8)}),LearningApiError);
 assert.throws(()=>parseHomeFeedbackEvidence({...evidence,visibility:'LEARNER_PRIVATE'},result,{role:'parent',userId:id(9),learnerId:result.learnerId}),LearningApiError);
});
test('unreviewed unknown opaque or stale identity remains unavailable with native feedback unaffected',()=>{
 const scope=homeFeedbackEvidenceScope('current-read',result),value=parseHomeFeedbackEvidence(evidence,result,actor);
 for(const [nextScope,loading,error]of [['other-read',false,null],[scope,true,null],[scope,false,new LearningApiError('denied')]]as const)assert.equal(currentHomeFeedbackEvidence({scope,value},nextScope,loading,error),null);
 assert.equal(currentHomeFeedbackEvidence({scope,value:{...value,context:{...value.context,status:'REQUIRES_REVIEW',identityRequiresReview:true}}},scope,false,null),null);
 assert.equal(currentHomeFeedbackEvidence({scope,value:{...value,context:{...value.context,recordedByName:id(6)}}},scope,false,null),null);
 assert.equal(homeFeedbackEvidenceScope('read',null),null);
 assert.equal(homeFeedbackEvidenceScope(null,result),null);
});
test('every current result source change creates a new name-read scope before retained facts can render',()=>{
 const first=homeFeedbackEvidenceScope('current-read',result),source={scope:first,value:parseHomeFeedbackEvidence(evidence,result,actor)};
 for(const next of [{...result,id:id(9)},{...result,learnerId:id(9)},{...result,submissionId:id(9)},{...result,evidenceId:id(9)},{...result,referenceVersion:'school-2'},{...result,policyVersion:3},{...result,revision:2}])assert.equal(currentHomeFeedbackEvidence(source,homeFeedbackEvidenceScope('current-read',next),false,null),null);
 for(const context of [{...source.value.context,recordedByName:' '},{...source.value.context,status:'REQUIRES_REVIEW' as const,yearGroupName:null}])assert.equal(currentHomeFeedbackEvidence({scope:first,value:{...source.value,context}},first,false,null),null);
});
