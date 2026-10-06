import test from'node:test';import assert from'node:assert/strict';
import{parseRecommendation,parseIntervention}from'../model.ts';
const id=(n:number)=>`93000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const analysis={basis:'SINGLE_RESULT',resultIds:[id(1)],observationIds:[],priorInterventionIds:[],interpretation:'TEACHER_REVIEW_RECORDED_EVIDENCE',uncertainty:'EVIDENCE_NOT_CAUSAL'};
const proposal={id:id(2),learnerId:id(3),referenceId:id(4),baselineResultId:id(1),origin:'AI_GENERATED',generationMode:'FIXTURE',intelligenceRunId:id(5),observation:'Current native source',evidenceIds:[id(6)],interpretation:'Teacher review',recommendation:'Practice',rationale:'Cited source',uncertainty:'Not causal',activityTitle:'Checking practice',instructions:'Explain a check',status:'AWAITING_HUMAN',createdAt:'2026-10-01T00:00:00Z',selectedActivityId:id(7),analysis,promptDigest:'a'.repeat(64)};
test('proposal and approved learner task retain exact checked source metadata',()=>{
 assert.equal(parseRecommendation(proposal).selectedActivityId,id(7));
 const task={id:id(8),recommendationId:id(2),learnerId:id(3),referenceId:id(4),baselineResultId:id(1),title:'Checking practice',instructions:'Explain a check',status:'ASSIGNED',createdAt:'2026-10-01T00:00:00Z',completedAt:null,followUpAssessmentId:null,selectedActivityId:id(7),analysis,promptDigest:'a'.repeat(64)};
 assert.equal(parseIntervention(task).analysis?.basis,'SINGLE_RESULT');
});
test('new metadata cannot carry arbitrary explanation text or invalid source identities',()=>{
 assert.throws(()=>parseRecommendation({...proposal,analysis:{...analysis,interpretation:'The learner is lazy'}}));
 assert.throws(()=>parseRecommendation({...proposal,selectedActivityId:'not-source'}));
 assert.throws(()=>parseRecommendation({...proposal,promptDigest:'unversioned'}));
});
