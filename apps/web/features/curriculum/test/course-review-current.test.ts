import assert from 'node:assert/strict';
import test from 'node:test';
import * as review from '../course-review-model.ts';
import { LearningApiError, CommandJournal, confirmCommandReceipt } from '../../../shared/api/client.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const courseId=id(1),programmeId=id(2),referenceId=id(3),actor=id(4);
const programme={id:programmeId,packVersionId:id(5),name:'School primary',classId:id(6),className:'Cedar',subjectId:id(7),subjectName:'School subject',yearGroupId:id(8),yearGroupName:'Year 1',academicYearName:'2026–2027',framework:'School Custom',packProgramme:'School primary source',packVersion:'school-1'};
const course={id:courseId,classId:id(6),subjectId:id(7),title:'School checking',description:'School-authored course',status:'PUBLISHED',createdAt:'2026-10-03T00:00:00Z',units:[],curriculumContext:{version:1,programmeId,referenceId:id(9)}};
const objective={id:referenceId,academicReferenceId:null,title:'Explain the school example',description:'Explain one checking step.',type:'objective' as const,parentTitle:'School subject',approved:false,approvalReason:null,version:'school-1'};
const page={version:2,scopeStatus:'READY' as const,courseTitle:'School checking',programmeName:'School primary',packVersion:'school-1',subjectName:'School subject',yearGroupName:'Year 1',items:[objective],nextCursor:null};
const context={apiUrl:'https://api.example.invalid',membership:{schoolId:id(10),userId:actor,role:'coordinator',entitlements:['curriculum']},accessToken:'fictional',accessGeneration:1,online:true,status:'ready'};
const invalid=(run:()=>unknown)=>assert.throws(run,LearningApiError);
test('curriculum review refuses stale or disallowed adult frames',()=>{
 const scope=review.courseReviewScope(context,'objectives',0);assert.ok(scope);assert.equal(review.currentCourseReview({scope,value:page},scope),page);
 for(const patch of[{online:false},{status:'verifying'},{accessToken:null},{membership:{...context.membership,role:'parent'}},{membership:{...context.membership,entitlements:[]}}])assert.equal(review.courseReviewScope({...context,...patch},'objectives',0),null);
 assert.equal(review.currentCourseReview({scope,value:page},review.courseReviewScope({...context,accessGeneration:2},'objectives',0)),null);
});
test('bound course review requires requested course and immutable programme class subject tuple',()=>{
 const current=review.parseBoundReviewCourse(course,courseId);assert.equal(current.id,courseId);assert.equal(review.reviewProgramme(current,[programme])?.id,programmeId);
 invalid(()=>review.parseBoundReviewCourse({...course,id:id(99)},courseId));invalid(()=>review.parseBoundReviewCourse({...course,curriculumContext:{...course.curriculumContext,programmeId:null}},courseId));
 invalid(()=>review.reviewProgramme(current,[{...programme,subjectId:id(99)}]));invalid(()=>review.reviewProgramme(current,[programme,{...programme,name:'Other title'}]));
});
test('objective pages bind human programme version context and exact bounded continuation',()=>{
 assert.equal(review.parseCurrentObjectivePage(page,course,programme,null).version,2);
 for(const patch of[{courseTitle:'Other course'},{programmeName:'Other programme'},{packVersion:'school-2'},{subjectName:'Other subject'},{items:[{...objective,version:'school-2'}]},{items:[objective,objective]},{nextCursor:id(99)}])invalid(()=>review.parseCurrentObjectivePage({...page,...patch},course,programme,null));
 invalid(()=>review.parseCurrentObjectivePage(page,course,programme,id(20)));
});
test('approval selection retains only source identities and original independent versions',()=>{
 const selection=review.objectiveReviewSelection(course,programme,page,objective,null);assert.deepEqual(Object.keys(selection).sort(),['approvalVersion','bindingVersion','classId','courseId','cursor','packVersionId','programmeId','referenceId','sourceVersion','subjectId'].sort());
 assert.equal(review.currentObjectiveReview(selection,course,programme,page)?.id,referenceId);
 assert.equal(review.currentObjectiveReview(selection,course,programme,{...page,version:3}),null);assert.equal(review.currentObjectiveReview(selection,{...course,curriculumContext:{...course.curriculumContext,version:2}},programme,page),null);
 assert.equal(review.parseObjectiveReviewSelection({...selection,reason:'Private draft'}),null);
 assert.equal(review.objectiveReviewBindingCurrent(selection,course,programme),true);assert.equal(review.objectiveReviewBindingCurrent(selection,course,{...programme,packVersionId:id(99)}),false);
});
test('pure approval receipts match original course reference version while preserving original-key uncertainty',()=>{
 const selection=review.objectiveReviewSelection(course,programme,page,objective,null),path=`/v1/curriculum/courses/${courseId}/objectives`,journal=new CommandJournal();
 const original=journal.prepare(path,path,{referenceId,expectedVersion:2,reason:' Reviewed school source. ',confirmConfiguration:true});
 const validate=(receipt:unknown,command:typeof original)=>review.validateObjectiveReviewReceipt(receipt,command,selection,'coordinator');
 const receipt={id:referenceId,courseId,academicReferenceId:id(30),version:3};
 invalid(()=>confirmCommandReceipt(journal,path,original.key,{...receipt,courseId:id(99)},undefined,validate));assert.equal(journal.get(path),original);
 assert.equal(confirmCommandReceipt(journal,path,original.key,receipt,undefined,validate),true);
 for(const bad of[{...receipt,id:id(99)},{...receipt,version:4},{...receipt,academicReferenceId:referenceId},{...receipt,reason:'Invented echo'}])invalid(()=>review.validateObjectiveReviewReceipt(bad,original,selection,'coordinator'));
 invalid(()=>review.validateObjectiveReviewReceipt(receipt,original,selection,'teacher'));
});
test('current programme learner pages reject another programme or learner continuation',()=>{
 const item={id:id(40),programmeId,learnerId:id(40),learnerName:'Alex Taylor',status:'active',approvedByName:'Maya Reed',updatedAt:'2026-10-03T00:00:00Z'},assignment={programme,items:[item],nextCursor:null};
 assert.equal(review.parseCurrentProgrammeLearners(assignment,programmeId,null).items[0].learnerName,'Alex Taylor');
 invalid(()=>review.parseCurrentProgrammeLearners(assignment,id(99),null));invalid(()=>review.parseCurrentProgrammeLearners({...assignment,items:[{...item,programmeId:id(99)}]},programmeId,null));invalid(()=>review.parseCurrentProgrammeLearners(assignment,programmeId,id(50)));invalid(()=>review.parseCurrentProgrammeLearners({...assignment,nextCursor:id(99)},programmeId,null));
});

test('original approval recovery retains only the original target and revision without needing a mounted page',()=>{
 const command={key:'original',path:`/v1/curriculum/courses/${courseId}/objectives`,body:{referenceId,expectedVersion:2,reason:'Original school review',confirmConfiguration:true}};
 assert.deepEqual(review.objectiveApprovalRecovery(command,courseId),{courseId,referenceId,approvalVersion:2});
 assert.equal(review.objectiveApprovalRecovery({...command,path:`/v1/curriculum/courses/${id(99)}/objectives`},courseId),null);
 assert.equal(review.objectiveApprovalRecovery({...command,body:{...command.body,confirmConfiguration:false}},courseId),null);
 review.validateObjectiveReviewReceipt({id:referenceId,courseId,academicReferenceId:id(30),version:3},command,{courseId,referenceId,approvalVersion:2},'coordinator');
});
test('indistinguishable full objective context blocks new approval but same names with actual different context remain readable',()=>{
 const rows=[objective,{...objective,id:id(41)},{...objective,id:id(42),description:'A different recorded explanation.'}];
 const choices=review.objectiveReviewOptions(rows);
 assert.deepEqual(choices.map(row=>row.requiresReview),[true,true,false]);
 assert.ok(choices.every(row=>!row.label.includes(referenceId)));
});
test('programme assignment continuation binds the immutable current programme source without rejecting updated human names',()=>{
 const source=review.programmeReviewIdentity(programme),assignment={programme,items:[],nextCursor:null};
 assert.deepEqual(Object.keys(source).sort(),['id','packVersionId','classId','subjectId','yearGroupId','packVersion'].sort());
 assert.equal(review.parseCurrentProgrammeLearners({...assignment,programme:{...programme,name:'Reviewed current name'}},programmeId,null,source).programme.name,'Reviewed current name');
 invalid(()=>review.parseCurrentProgrammeLearners({...assignment,programme:{...programme,packVersionId:id(99)}},programmeId,null,source));
 invalid(()=>review.parseCurrentProgrammeLearners({...assignment,programme:{...programme,classId:id(99)}},programmeId,null,source));
});
test('current target denial withholds even original retry while malformed or unavailable reads preserve recovery',()=>{
 assert.equal(review.objectiveRetryPermitted([null,new LearningApiError('unavailable')]),true);
 assert.equal(review.objectiveRetryPermitted([new LearningApiError('invalid')]),true);
 assert.equal(review.objectiveRetryPermitted([new LearningApiError('unavailable'),new LearningApiError('denied')]),false);
 assert.equal(review.objectiveRetryPermitted([new LearningApiError('unauthorized')]),false);
});

test('new objective review form identity follows the complete captured source while original recovery remains stable',()=>{
 const selection=review.objectiveReviewSelection(course,programme,page,objective,null);
 const formKey=review.objectiveApprovalFormKey(selection);
 assert.equal(formKey,review.objectiveApprovalFormKey({...selection}));
 for(const patch of [{referenceId:id(41)},{courseId:id(42)},{programmeId:id(43)},{packVersionId:id(44)},{classId:id(45)},{subjectId:id(46)},{bindingVersion:2},{approvalVersion:3},{sourceVersion:'school-2'},{cursor:id(47)}]){
  assert.notEqual(formKey,review.objectiveApprovalFormKey({...selection,...patch}));
 }
 const command={key:'original-key',path:`/v1/curriculum/courses/${courseId}/objectives`,body:{referenceId,expectedVersion:2,reason:'Original reviewed reason',confirmConfiguration:true}};
 const recovered=review.objectiveApprovalRecovery(command,courseId)!;
 assert.equal(review.objectiveApprovalFormKey(recovered),review.objectiveApprovalFormKey({...recovered}));
 assert.doesNotMatch(formKey,/Original reviewed reason|School checking|School subject/);
});
