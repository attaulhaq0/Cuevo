import assert from 'node:assert/strict';import test from 'node:test';
import {parseSelectedLifecycle,validateLifecycleReceipt,parseSelectedBehavior,validateBehaviorReceipt,parseAcceptedBehaviorStatus,curriculumLifecycleCanManage} from '../source-review-model.ts';
import { LearningApiError, CommandJournal, confirmCommandReceipt } from '../../../shared/api/client.ts';
import type { Version } from '../model.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('a saved lifecycle review never supplies command authority after the staff role changes to teacher',()=>{
 assert.equal(curriculumLifecycleCanManage('admin'),true);assert.equal(curriculumLifecycleCanManage('coordinator'),true);
 for(const role of ['teacher','student','parent',undefined])assert.equal(curriculumLifecycleCanManage(role),false);
 const original={key:'original',path:`/v1/curriculum/versions/${id(1)}/lifecycle`,body:{state:'ACTIVE',expectedRevision:2,reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,replacementVersionId:null,reason:'Original review',confirmTransition:true}};
 const journal=new CommandJournal();const command=journal.prepare(original.path,original.path,original.body);assert.equal(curriculumLifecycleCanManage('teacher'),false);assert.equal(journal.get(original.path),command);
});
test('lifecycle source and original actual receipt stay bound without inventing reason or actor echoes',()=>{
 const page={versionId:id(1),state:'ACTIVE',revision:2,customerReady:false,configurationAllowed:true,retainedEvidenceAllowed:true,programmeCount:1,courseCount:1,openAssessmentCount:0,reason:'School review',history:[],nextCursor:null};
 assert.equal(parseSelectedLifecycle(page,id(1)).revision,2);assert.throws(()=>parseSelectedLifecycle(page,id(2)),LearningApiError);
 const path=`/v1/curriculum/versions/${id(1)}/lifecycle`,journal=new CommandJournal(),command=journal.prepare(path,path,{state:'ACTIVE',expectedRevision:1,reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,replacementVersionId:null,reason:'Reviewed exact source',confirmTransition:true});
 for(const patch of[{id:id(2)},{revision:1},{state:'RETIRED'},{customerReady:true},{extra:'private'}]){assert.throws(()=>confirmCommandReceipt(journal,path,command.key,{id:id(1),state:'ACTIVE',revision:2,customerReady:false,...patch},undefined,validateLifecycleReceipt));assert.equal(journal.get(path),command);}
 assert.equal(confirmCommandReceipt(journal,path,command.key,{id:id(1),state:'ACTIVE',revision:2,customerReady:false},undefined,validateLifecycleReceipt),true);
});
test('behavior preview preserves missing school values and exact locked source version and directory',()=>{
 const version={id:id(1),version:'2026.1'} as Version;
 const school={basis:'SCHOOL_AUTHORED',version:'2026.1',models:['numeric','rubric'],numericMaxScore:null,rubric:null,directory:null,digest:null};
 assert.equal(parseSelectedBehavior(school,version,'SCHOOL_AUTHORED','').numericMaxScore,null);
 assert.throws(()=>parseSelectedBehavior({...school,version:'older'},version,'SCHOOL_AUTHORED',''),LearningApiError);
 assert.throws(()=>parseSelectedBehavior({...school,basis:'LOCKED_ARTIFACT',directory:'other',digest:'a'.repeat(64),numericMaxScore:10},version,'LOCKED_ARTIFACT','expected'),LearningApiError);
});
test('behavior acceptance receipt keeps lifecycle revision unchanged and validates the original confirmation',()=>{
 const path=`/v1/curriculum/versions/${id(1)}/behavior-acceptance`,command={path,key:'key',body:{reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,expectedLifecycleRevision:2,reason:'Exact reviewed source',confirmAcceptance:true}};
 assert.doesNotThrow(()=>validateBehaviorReceipt({id:id(1),lifecycleRevision:2},command));
 for(const receipt of[{id:id(1),lifecycleRevision:3},{id:id(2),lifecycleRevision:2},{id:id(1),lifecycleRevision:2,numericMaxScore:10}])assert.throws(()=>validateBehaviorReceipt(receipt,command),error=>error instanceof LearningApiError&&error.uncertain);
 assert.throws(()=>validateBehaviorReceipt({id:id(1),lifecycleRevision:2},{...command,body:{...command.body,confirmAcceptance:false}}),LearningApiError);
});
test('current acceptance status distinguishes no saved acceptance from a complete reviewed source',()=>{
 const version={id:id(1),version:'2026.1'} as Version;
 const empty={id:id(1),lifecycleRevision:2,accepted:false,basis:null,behavior:null,reason:null,requiresReview:false};
 assert.equal(parseAcceptedBehaviorStatus(empty,version).accepted,false);
 for(const patch of[{basis:'LOCKED_ARTIFACT'},{reason:'partial source'},{accepted:true,basis:'SCHOOL_AUTHORED',behavior:{basis:'SCHOOL_AUTHORED',version:'2026.1',models:['numeric','rubric'],numericMaxScore:null,rubric:null,directory:null,digest:null},reason:''}])assert.throws(()=>parseAcceptedBehaviorStatus({...empty,...patch},version),LearningApiError);
});
