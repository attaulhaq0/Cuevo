import assert from'node:assert/strict';
import test from'node:test';
import * as model from'../gradebook-model.ts';
import {LearningApiError,CommandJournal,confirmCommandReceipt} from '../../../shared/api/client.ts';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const native={type:'numeric' as const,score:0,maxScore:10,policyVersion:2};
const selection={markingId:id(4),submissionId:id(5),expectedRevision:2,expectedSubmissionRevision:1,expectedPolicyVersion:2,parentVisible:false};
const page=()=>({courseId:id(1),courseTitle:'Checking methods',className:'Cedar',yearGroupName:'Year six',assessments:[{id:id(2),title:'Check the method',model:'numeric',referenceTitle:'Checking reasons',policyVersion:2}],items:[{id:id(3),learnerName:'Alex',identityRequiresReview:false,cells:[{assessmentId:id(2),state:'REVIEW',submissionId:id(5),submissionRevision:1,markingId:id(4),markingRevision:2,policyVersion:2,nativeResult:native,releasedResult:null}]}],learnerTotal:1,assessmentTotal:1,nextLearnerCursor:null,nextAssessmentCursor:null});
const preview=()=>({courseId:id(1),items:[{selection,learnerName:'Alex',assessmentTitle:'Check the method',referenceTitle:'Checking reasons',nativeResult:native,feedback:'Explain your checking step.'}]});
const receipt=()=>({id:id(1),items:[{id:id(6),evidenceId:id(7),revision:2,nativeResult:native,feedback:'Explain your checking step.',referenceTitle:'Checking reasons',submissionId:id(5),assessmentId:id(2),learnerId:id(3)}]});

test('gradebook current course and actor envelope rejects another source before rendering',()=>{
 const context={apiUrl:'https://api.invalid',membership:{schoolId:id(10),userId:id(11),role:'teacher',entitlements:['learning','assessment','curriculum']},accessToken:'token',accessGeneration:1,online:true,status:'ready'};
 const scope=model.gradebookReadScope(context,'/v1/gradebook',0);
 assert.ok(scope);assert.equal(model.currentGradebookRead({scope,value:page()},scope)?.courseId,id(1));
 assert.equal(model.currentGradebookRead({scope,value:page()},model.gradebookReadScope({...context,accessGeneration:2},'/v1/gradebook',0)),null);
 assert.equal(model.gradebookReadScope({...context,membership:{...context.membership,role:'parent'}},'/v1/gradebook',0),null);
 assert.equal(model.parseCurrentGradebook(page(),id(1)).courseId,id(1));
 assert.throws(()=>model.parseCurrentGradebook(page(),id(9)),LearningApiError);
 assert.throws(()=>model.parseCurrentGradebook({...page(),items:[{...page().items[0],cells:[{...page().items[0].cells[0],policyVersion:3,nativeResult:{...native,policyVersion:3}}]}]},id(1)),LearningApiError);
});

test('gradebook preview retains exact selected source and current native values',()=>{
 const current=model.parseGradebook(page());
 assert.equal(model.parseCurrentGradebookPreview(preview(),current,[selection]).items[0].nativeResult.type,'numeric');
 for(const changed of [{...preview(),courseId:id(9)},{...preview(),items:[]},{...preview(),items:[{...preview().items[0],selection:{...selection,submissionId:id(9)}}]},{...preview(),items:[{...preview().items[0],learnerName:'Another learner'}]},{...preview(),items:[{...preview().items[0],nativeResult:{...native,score:1}}]}])assert.throws(()=>model.parseCurrentGradebookPreview(changed,current,[selection]),LearningApiError);
 assert.throws(()=>model.parseCurrentGradebookPreview(preview(),{...current,items:[{...current.items[0],identityRequiresReview:true}]},[selection]),LearningApiError);
});

test('gradebook release receipts bind original selections before key settlement, even without mounted preview',()=>{
 const journal=new CommandJournal(),path=`/v1/courses/${id(1)}/gradebook/release`;
 const original=journal.prepare(path,path,{selections:[selection],confirmRelease:true});
 for(const changed of [{...receipt(),id:id(9)},{...receipt(),items:[]},{...receipt(),items:[{...receipt().items[0],submissionId:id(9)}]},{...receipt(),items:[{...receipt().items[0],revision:3}]},{...receipt(),items:[{...receipt().items[0],nativeResult:{...native,policyVersion:3}}]}]){
  assert.throws(()=>confirmCommandReceipt(journal,path,original.key,changed,undefined,model.validateGradebookReleaseReceipt),error=>error instanceof LearningApiError&&error.uncertain);assert.equal(journal.get(path),original);
 }
 assert.equal(confirmCommandReceipt(journal,path,original.key,receipt(),undefined,model.validateGradebookReleaseReceipt),true);
});

test('fresh gradebook release also compares reviewed native feedback while respecting missing receipt echoes',()=>{
 const command={key:'original',path:`/v1/courses/${id(1)}/gradebook/release`,body:{selections:[selection],confirmRelease:true}};
 assert.doesNotThrow(()=>model.validateGradebookReleaseReceipt(receipt(),command,model.parseGradebookPreview(preview()),model.parseGradebook(page())));
 for(const patch of [{feedback:'Different saved feedback'},{learnerId:id(9)},{assessmentId:id(9)},{nativeResult:{...native,score:1}}])assert.throws(()=>model.validateGradebookReleaseReceipt({...receipt(),items:[{...receipt().items[0],...patch}]},command,model.parseGradebookPreview(preview()),model.parseGradebook(page())),LearningApiError);
 assert.throws(()=>model.validateGradebookReleaseReceipt({...receipt(),items:[{...receipt().items[0],parentVisible:true}]},command),LearningApiError);
});
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
