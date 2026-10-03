import assert from 'node:assert/strict';
import test from 'node:test';
import * as planning from '../period-planning-model.ts';
import { periodPlanningReadScope, currentPeriodPlanningRead, parseCurrentPeriodCoverage, validatePeriodPlanningReceipt, periodPlanningChoices, parsePlanningPeriod, parsePeriodPlanningIntent, periodPlanningBody, periodPlanningPendingPaths, periodPlanningCourseChoices, parsePlanningLessons } from '../period-planning-model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../../../shared/api/client.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,courseId=id(1),periodId=id(2),planId=id(3);
const context={apiUrl:'https://api.example.invalid',membership:{userId:id(4),schoolId:id(5),role:'teacher',entitlements:['curriculum','learning','assessment','school.operations']},accessToken:'fictional',online:true,status:'ready',accessGeneration:1};
const page={courseId,courseTitle:'Current course',className:'Cedar',periodId,periodName:'Current school period',startsOn:'2026-10-01',endsOn:'2026-10-31',periodRevision:2,planStatus:'DECLARED' as const,plannedTotal:0,learnerTotal:0,items:[],nextCursor:null,limitation:'DECLARED_PLAN_NOT_OFFICIAL_CURRICULUM_COVERAGE' as const};
test('known denied planning source stays blocked through refresh loading and failed reads until its exact current success',()=>{
 const path=`/v1/curriculum/courses/${courseId}/coverage`,read={path,scope:'first',loading:false,ready:false,error:new LearningApiError('denied')};
 let denied=planning.updatePeriodPlanningDenials({},[read]);assert.equal(planning.periodPlanningHasDenial(denied,[read]),true);
 const loading={...read,scope:'refreshed',loading:true,error:null};denied=planning.updatePeriodPlanningDenials(denied,[loading]);assert.equal(planning.periodPlanningHasDenial(denied,[loading]),true);
 const unavailable={...loading,loading:false,error:new LearningApiError('unavailable')};denied=planning.updatePeriodPlanningDenials(denied,[unavailable]);assert.equal(planning.periodPlanningHasDenial(denied,[unavailable]),true);
 const currentLoading={...loading,scope:'current'};denied=planning.updatePeriodPlanningDenials(denied,[currentLoading]);
 const staleSuccess={...currentLoading,scope:'refreshed',loading:false,ready:true};assert.equal(planning.periodPlanningHasDenial(planning.updatePeriodPlanningDenials(denied,[staleSuccess]),[staleSuccess]),true);
 const malformed={...currentLoading,loading:false,error:new LearningApiError('invalid')};denied=planning.updatePeriodPlanningDenials(denied,[malformed]);assert.equal(planning.periodPlanningHasDenial(denied,[malformed]),true);
 denied=planning.updatePeriodPlanningDenials(denied,[currentLoading]);const success={...currentLoading,loading:false,ready:true};denied=planning.updatePeriodPlanningDenials(denied,[success]);assert.equal(planning.periodPlanningHasDenial(denied,[success]),false);
});
test('successful unrelated planning reads cannot clear another denied source or alter its original command',()=>{
 const journal=new CommandJournal(),path=`/v1/curriculum/courses/${courseId}/plans`,original=journal.prepare(path,path,{referenceId:id(8),periodId,expectedPeriodRevision:2,reason:'Original source',confirmPlanning:true});
 const read={path:'/v1/courses',scope:'courses',loading:false,ready:false,error:new LearningApiError('denied')};let denied=planning.updatePeriodPlanningDenials({},[read]);
 const other={path:'/v1/classes',scope:'classes',loading:false,ready:true,error:null};denied=planning.updatePeriodPlanningDenials(denied,[other]);assert.equal(planning.periodPlanningHasDenial(denied,[read]),true);assert.deepEqual(journal.get(path),original);
});
test('period planning read envelope requires current permitted staff and invalidates source selection on every request scope',()=>{const scope=periodPlanningReadScope(context,'/coverage',0);assert.ok(scope);assert.equal(currentPeriodPlanningRead({scope,value:page},scope),page);for(const patch of[{online:false},{accessToken:null},{status:'verifying'},{membership:{...context.membership,role:'parent'}},{membership:{...context.membership,entitlements:['curriculum']}}])assert.equal(periodPlanningReadScope({...context,...patch},'/coverage',0),null);assert.equal(currentPeriodPlanningRead({scope,value:page},periodPlanningReadScope({...context,accessGeneration:2},'/coverage',0)),null);});
test('period coverage retains actual known zero but rejects another current course period or revision',()=>{assert.equal(parseCurrentPeriodCoverage(page,courseId,periodId,2).learnerTotal,0);for(const fields of[{courseId:id(99)},{periodId:id(99)},{periodRevision:1},{privateContent:'Excluded'}])assert.throws(()=>parseCurrentPeriodCoverage({...page,...fields},courseId,periodId,2),LearningApiError);});
test('planning receipt matches only actual echoed course and original period version before settling an unmounted key',()=>{const path=`/v1/curriculum/courses/${courseId}/plans`,body={referenceId:id(8),periodId,expectedPeriodRevision:2,reason:'Approved period plan',confirmPlanning:true},journal=new CommandJournal(),command=journal.prepare(path,path,body),receipt={id:planId,courseId,periodRevision:2};const validate=(value:unknown,original:typeof command)=>validatePeriodPlanningReceipt(value,original,courseId);for(const fields of[{courseId:id(99)},{periodRevision:1},{referenceId:id(8)},{id:'unknown'}]){assert.throws(()=>confirmCommandReceipt(journal,path,command.key,{...receipt,...fields},undefined,validate),error=>error instanceof LearningApiError&&error.uncertain);assert.equal(journal.get(path),command);}assert.equal(confirmCommandReceipt(journal,path,command.key,receipt,undefined,validate),true);});
test('taught and included assessment commands require their exact original confirmations with generated receipt identity',()=>{for(const[path,body]of[[`/v1/curriculum/plans/${planId}/revalidate`,{expectedPeriodRevision:2,reason:'Review changed period',confirmPlanning:true}],[`/v1/curriculum/plans/${planId}/taught`,{lessonId:id(9),taughtOn:'2026-10-03',expectedPeriodRevision:2,note:'Actually taught lesson',confirmTeaching:true}],[`/v1/curriculum/plans/${planId}/assessments`,{assessmentId:id(10),expectedPolicyVersion:1,expectedPeriodRevision:2,reason:'Exact included task',confirmInclusion:true}]]as const){validatePeriodPlanningReceipt({id:id(11),courseId,periodRevision:2},{key:'original',path,body},courseId);assert.throws(()=>validatePeriodPlanningReceipt({id:id(11),courseId,periodRevision:2},{key:'original',path,body:{...body,expectedPeriodRevision:3}},courseId),error=>error instanceof LearningApiError&&error.uncertain);}});
test('period choices show real names and dates and mark indistinguishable context for review',()=>{const period={id:periodId,name:'October review',startsOn:'2026-10-01',endsOn:'2026-10-31',revision:2};assert.equal(parsePlanningPeriod(period).revision,2);assert.throws(()=>parsePlanningPeriod({...period,revision:0}),LearningApiError);const choices=periodPlanningChoices([period,{...period,id:id(99)}]);assert.equal(choices.every(row=>row.requiresReview),true);assert.equal(choices[0].label,choices[1].label);assert.equal(choices[0].label.includes(periodId),false);});
test('planning control intent retains only bounded identities, pagination and original period revisions',()=>{const intent={editor:{kind:'assessment',planId,periodRevision:2,referenceId:id(8)},cursor:null,unitId:null,unitCursor:null,lessonCursor:null,assessmentId:id(10),assessmentVersion:1,referenceId:null,referenceVersion:null};assert.deepEqual(parsePeriodPlanningIntent(intent),intent);assert.equal(parsePeriodPlanningIntent({...intent,privatePlan:page}),null);assert.equal(parsePeriodPlanningIntent({...intent,editor:{...intent.editor,periodRevision:0}}),null);assert.equal(parsePeriodPlanningIntent({...intent,unitId:'not-an-id'}),null);});

const reference={id:id(8),title:'Checking explanations',description:'Explain the school checking step.',code:null,version:'school-v1',status:'APPROVED' as const,sourceType:'SCHOOL_AUTHORED' as const,createdBy:id(4),approvedBy:id(4)};
const plan={id:planId,referenceId:reference.id,referenceTitle:reference.title,referenceDescription:reference.description,periodRevision:2,sourceStatus:'CURRENT' as const,reason:'School plan',taughtCount:0,assessmentCount:0,evidenceLearnerCount:0,evidenceCount:0,taught:[],assessments:[],evidence:[]};
const coverage={...page,plannedTotal:1,items:[plan]};
test('fresh commands preserve their captured period and replan source rather than using a newer read',()=>{
 const editor={kind:'replan' as const,planId,referenceId:reference.id,periodRevision:3,planRevision:2};const changed={...coverage,periodRevision:3,planStatus:'REQUIRES_REVIEW' as const,items:[{...plan,sourceStatus:'REQUIRES_REVIEW' as const}]};
 assert.deepEqual(periodPlanningBody(editor,changed,{reason:'Reviewed changed period',confirmPlanning:true}),{expectedPeriodRevision:3,reason:'Reviewed changed period',confirmPlanning:true});
 assert.throws(()=>periodPlanningBody(editor,{...changed,periodRevision:4},{reason:'Fresh read cannot reprice draft',confirmPlanning:true}),error=>error instanceof LearningApiError&&error.kind==='conflict');
 assert.throws(()=>periodPlanningBody(editor,{...changed,items:[{...changed.items[0],periodRevision:1}]},{reason:'Different retained plan',confirmPlanning:true}),LearningApiError);
 assert.deepEqual(periodPlanningPendingPaths(courseId,editor),[`/v1/curriculum/courses/${courseId}/plans`,`/v1/curriculum/plans/${planId}/revalidate`]);
});
test('new teaching and task inclusion require exact current lesson, objective, period and native policy',()=>{
 const taught={kind:'taught' as const,planId,referenceId:reference.id,periodRevision:2};const lesson={id:id(9),title:'Checking lesson',sequence:1,body:'School example',status:'PUBLISHED',activities:[]};
 assert.equal(periodPlanningBody(taught,coverage,{lessonId:lesson.id,taughtOn:'2026-10-03',note:'Actually taught',confirmTeaching:true},{lessons:[lesson]},'2026-10-03').expectedPeriodRevision,2);
 for(const taughtOn of['2026-09-30','2026-10-04','2026-02-30'])assert.throws(()=>periodPlanningBody(taught,coverage,{lessonId:lesson.id,taughtOn,note:'Reviewed',confirmTeaching:true},{lessons:[lesson]},'2026-10-03'),LearningApiError);
 assert.throws(()=>periodPlanningBody(taught,coverage,{lessonId:id(99),taughtOn:'2026-10-03',note:'Foreign lesson',confirmTeaching:true},{lessons:[lesson]},'2026-10-03'),LearningApiError);
 const assessment={id:id(10),courseId,referenceId:reference.id,status:'PUBLISHED',policyVersion:2};const editor={kind:'assessment' as const,planId,referenceId:reference.id,periodRevision:2};
 assert.equal(periodPlanningBody(editor,coverage,{assessmentId:assessment.id,expectedPolicyVersion:2,reason:'Exact included task',confirmInclusion:true},{assessments:[assessment]}).expectedPolicyVersion,2);
 for(const patch of[{courseId:id(99)},{referenceId:id(99)},{policyVersion:3},{status:'DRAFT'}])assert.throws(()=>periodPlanningBody(editor,coverage,{assessmentId:assessment.id,expectedPolicyVersion:2,reason:'Review exact task',confirmInclusion:true},{assessments:[{...assessment,...patch}]}),LearningApiError);
});
test('source changed fresh command conflicts while exact original command receipt can settle independently',()=>{
 const editor={kind:'create' as const,periodRevision:2},body={referenceId:reference.id,periodId,expectedPeriodRevision:2,reason:'Original reviewed objective',confirmPlanning:true},journal=new CommandJournal(),path=`/v1/curriculum/courses/${courseId}/plans`,command=journal.prepare(path,path,body);
 assert.throws(()=>periodPlanningBody(editor,{...page,periodRevision:3},{referenceId:reference.id,reason:body.reason,confirmPlanning:true},{references:[reference]}),LearningApiError);
 assert.equal(confirmCommandReceipt(journal,path,command.key,{id:planId,courseId,periodRevision:2},undefined,(receipt,original)=>validatePeriodPlanningReceipt(receipt,original,courseId,editor)),true);
 assert.equal(journal.get(path),undefined);
});
test('coverage rejects duplicate or non-current plan revisions and invalid cursor continuation',()=>{
 assert.throws(()=>parseCurrentPeriodCoverage({...coverage,items:[plan,plan],plannedTotal:2},courseId,periodId,2),LearningApiError);
 assert.throws(()=>parseCurrentPeriodCoverage({...coverage,items:[{...plan,periodRevision:1}]},courseId,periodId,2),LearningApiError);
 assert.throws(()=>parseCurrentPeriodCoverage({...coverage,nextCursor:id(99)},courseId,periodId,2),LearningApiError);
 assert.throws(()=>parseCurrentPeriodCoverage(coverage,courseId,periodId,2,planId),LearningApiError);
});
test('course choices distinguish saved class context without opaque identity suffixes',()=>{
 const courses=[{id:courseId,classId:id(20),subjectId:id(21),title:'Learning strategies'},{id:id(99),classId:id(22),subjectId:id(21),title:'Learning strategies'}],classes=[{id:id(20),name:'Cedar',yearGroupName:'Year six'},{id:id(22),name:'Willow',yearGroupName:'Year six'}],subjects=[{id:id(21),name:'Reasoning'}];
 const choices=periodPlanningCourseChoices(courses,classes,subjects);assert.equal(choices.every(choice=>!choice.requiresReview),true);assert.match(choices[0].label,/Cedar/);assert.equal(choices[0].label.includes(courseId),false);assert.equal(periodPlanningCourseChoices(courses,[],subjects).every(choice=>choice.requiresReview),true);
});
test('lesson source validates requested course and explicit current unit',()=>{
 const course={id:courseId,classId:id(20),subjectId:id(21),title:'Current course',description:'School context',status:'PUBLISHED',createdAt:'2026-10-01T00:00:00Z',selectedUnitId:id(30),units:[{id:id(30),title:'Current unit',sequence:1,lessons:[]}]};
 assert.equal(parsePlanningLessons(course,courseId,id(30)).selectedUnitId,id(30));assert.throws(()=>parsePlanningLessons(course,id(99),id(30)),LearningApiError);assert.throws(()=>parsePlanningLessons(course,courseId,id(99)),LearningApiError);
});
test('pending planning commands reconstruct bounded recovery after private working input was cleared',()=>{
 const original={key:'original',path:`/v1/curriculum/courses/${courseId}/plans`,body:{referenceId:id(8),periodId,expectedPeriodRevision:2,reason:'Original period plan',confirmPlanning:true}};
 const recovery=planning.periodPlanningRecovery([original],courseId,periodId,[]);
 assert.equal(recovery?.path,original.path);assert.deepEqual(recovery?.editor,{kind:'create',periodRevision:2});assert.equal(JSON.stringify(recovery).includes('Original period plan'),false);
 assert.equal(planning.periodPlanningRecovery([original],courseId,id(99),[]),null);
 const task={key:'task-original',path:`/v1/curriculum/plans/${planId}/assessments`,body:{assessmentId:id(10),expectedPolicyVersion:1,expectedPeriodRevision:2,reason:'Exact included task',confirmInclusion:true}};
 assert.deepEqual(planning.periodPlanningRecovery([task],courseId,periodId,[{id:planId,referenceId:id(8)}])?.editor,{kind:'assessment',planId,referenceId:id(8),periodRevision:2});
 assert.equal(planning.periodPlanningRecovery([task],courseId,periodId,[]),null);
 assert.equal(planning.periodPlanningRecovery([original,{...original,key:'another'}],courseId,periodId,[]),null);
});
