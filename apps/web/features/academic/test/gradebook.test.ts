import assert from'node:assert/strict';
import test from'node:test';
import * as model from'../gradebook-model.ts';
test('native cell states preserve zero, missing and pending corrections separately',()=>{
 const parse=(model as unknown as Record<string,(value:unknown)=>unknown>).parseGradebook;
 assert.equal(typeof parse,'function');
 const id='40000000-0000-4000-8000-000000000001';
 const page={courseId:id,courseTitle:'School mathematics',className:'Cedar',yearGroupName:'Year 1',assessments:[{id,title:'Check the example',model:'numeric',referenceTitle:'School checking',policyVersion:2}],items:[{id,learnerName:'Learner',identityRequiresReview:false,cells:[{assessmentId:id,state:'REVIEW',submissionId:id,submissionRevision:1,markingId:id,markingRevision:2,policyVersion:2,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2},releasedResult:null}]}],learnerTotal:1,assessmentTotal:1,nextLearnerCursor:null,nextAssessmentCursor:null};
 assert.deepEqual(parse(page),page);
 assert.throws(()=>parse({...page,items:[{...page.items[0],cells:[{...page.items[0].cells[0],state:'NO_SUBMISSION'}]}]}));
});
test('identical class learner labels require identity review without an opaque suffix',()=>{
 const ids=model.gradebookAmbiguousNames([{id:'first',learnerName:'Same name',identityRequiresReview:true,cells:[]},{id:'second',learnerName:'Same name',identityRequiresReview:true,cells:[]},{id:'third',learnerName:'Distinct name',identityRequiresReview:false,cells:[]}]);assert.deepEqual([...ids],['first','second']);
});
