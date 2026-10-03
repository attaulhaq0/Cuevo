import{afterAll,beforeAll,describe,expect,it}from'vitest';
import{randomUUID}from'node:crypto';
import{createCustomerContext,customerCourse,customerActor,type CustomerContext}from'./customer-test-context';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('approved course curriculum objectives',()=>{
 let context:CustomerContext;let courseId:string;let packId:string;let subjectReference:string;let programmeId:string;let firstSource:string;let firstAcademic:string;let secondSource:string;let secondAcademic:string;let wrong:string;let yearConflict:string;let noHierarchy:string;let third:string;
 async function reference(title:string,parentId:string|null,type='objective',extra:Record<string,unknown>={}){
  return context.command('coordinator','/v1/curriculum/references',{packVersionId:packId,parentId,type,title,description:`${title}: school-authored technical case only.`,code:null,sequence:1,subjectId:null,yearGroupId:null,...extra});
 }
 beforeAll(async()=>{
  context=await createCustomerContext();courseId=(await customerCourse(context,'School course with two approved objectives')).courseId;
  const pack=await context.command('coordinator','/v1/curriculum/versions',{packId:`school-objectives-${randomUUID()}`,kind:'school_custom',framework:'School Custom',programme:'School primary objective context',version:'school-objectives-1',scope:'Synthetic subject/year hierarchy',sourceStatus:'VERIFIED',rightsStatus:'PERMITTED',sourceLocation:'repo:synthetic-course-objective-case',sourceChecksum:null,synthetic:true,reason:'School-authored technical scenario; no official source or readiness claim.'});packId=pack.id;
  const stage=await reference('School primary stage',null,'stage');const year=await reference('School year context',stage.id,'year',{yearGroupId:context.group});
  subjectReference=(await reference('School subject context',year.id,'subject',{subjectId:context.subject})).id;
  firstSource=(await reference('Explain the school example',subjectReference)).id;secondSource=(await reference('Check the school explanation',subjectReference)).id;
  const otherSubject=(await reference('Other school subject hierarchy',null,'subject')).id;wrong=(await reference('Wrong subject objective',otherSubject)).id;
  const wrongYear=randomUUID();await context.client.query("insert into app.year_groups(school_id,id,name,ordinal)values($1,$2,'Other school year',2)",[context.school,wrongYear]);
  yearConflict=(await reference('Conflicting year objective',subjectReference,'objective',{yearGroupId:wrongYear})).id;
  noHierarchy=(await reference('Unscoped objective',null)).id;third=(await reference('Further school checking objective',subjectReference)).id;
  for(const[state,expectedRevision]of [['APPROVED',1],['ACTIVE',2]]as const)await context.command('coordinator',`/v1/curriculum/versions/${packId}/lifecycle`,{state,expectedRevision,reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,replacementVersionId:null,reason:'Reviewed synthetic hierarchy for the selected class.',confirmTransition:true});
  programmeId=(await context.command('coordinator','/v1/curriculum/programmes',{packVersionId:packId,name:'School primary programme',classId:context.classId,subjectId:context.subject,yearGroupId:context.group,confirmConfiguration:true})).id;
  firstAcademic=String((await context.command('coordinator',`/v1/curriculum/courses/${courseId}`,{programmeId,referenceId:firstSource,expectedVersion:1,confirmConfiguration:true})).academicReferenceId);
  await context.command('coordinator','/v1/curriculum/learners',{programmeId,learnerId:customerActor(12),status:'active',confirmAccessChange:true});
 },30000);
 afterAll(async()=>{await context?.close();});
 it('requires explicit scoped approval before a sibling is selectable and preserves original-key replay',async()=>{
  const candidates=await context.request('coordinator',`/v1/curriculum/courses/${courseId}/objectives?limit=1`);expect(candidates.statusCode,candidates.body).toBe(200);expect(candidates.json()).toMatchObject({version:1,scopeStatus:'READY',courseTitle:'School course with two approved objectives',subjectName:'School Custom synthetic subject'});expect(candidates.json().nextCursor).toEqual(expect.any(String));
  let choices=await context.request('teacher',`/v1/courses/${courseId}/academic-references?limit=100`);expect(choices.statusCode,choices.body).toBe(200);expect(choices.json().items.map((row:{id:string})=>row.id)).toEqual([firstAcademic]);
  const input={referenceId:secondSource,expectedVersion:1,reason:'Checked against the same subject and year hierarchy.',confirmConfiguration:true};
  for(const role of ['teacher','strong','parent']as const)expect((await context.request(role,`/v1/curriculum/courses/${courseId}/objectives`,input)).statusCode).toBe(403);
  const key=randomUUID();const approved=await context.request('coordinator',`/v1/curriculum/courses/${courseId}/objectives`,input,key);expect(approved.statusCode,approved.body).toBe(200);secondAcademic=approved.json().academicReferenceId;expect(secondAcademic).not.toBe(firstAcademic);
  const replay=await context.request('coordinator',`/v1/curriculum/courses/${courseId}/objectives`,input,key);expect(replay.statusCode,replay.body).toBe(200);expect(replay.json()).toEqual(approved.json());
  choices=await context.request('teacher',`/v1/courses/${courseId}/academic-references?limit=100`);expect(choices.json().items.map((row:{id:string})=>row.id).sort()).toEqual([firstAcademic,secondAcademic].sort());
  const records=(await context.client.query('select revision,reference_id,academic_reference_id from app.course_objective_approvals where school_id=$1 and course_id=$2 order by revision',[context.school,courseId])).rows;expect(records).toMatchObject([{revision:1,reference_id:firstSource,academic_reference_id:firstAcademic},{revision:2,reference_id:secondSource,academic_reference_id:secondAcademic}]);
  expect((await context.client.query("select count(*)::integer count from internal.audit_events where school_id=$1 and entity_id=$2 and action='curriculum.course-objective.approve'",[context.school,courseId])).rows[0].count).toBe(1);
 });
 it('rejects unrelated hierarchy, conflicting year, foreign source, stale version and current-scope loss',async()=>{
  for(const referenceId of [wrong,yearConflict,noHierarchy,randomUUID()])expect((await context.request('coordinator',`/v1/curriculum/courses/${courseId}/objectives`,{referenceId,expectedVersion:2,reason:'Cannot guess a mapping.',confirmConfiguration:true})).statusCode).toBe(409);
  expect((await context.request('coordinator',`/v1/curriculum/courses/${courseId}/objectives`,{referenceId:third,expectedVersion:1,reason:'Stale approval list.',confirmConfiguration:true})).statusCode).toBe(409);
  expect((await context.request('otherTeacher',`/v1/courses/${courseId}/academic-references?limit=25`)).statusCode).toBe(403);
  await context.client.query("update app.classes set status='archived'where school_id=$1 and id=$2",[context.school,context.classId]);
  expect((await context.request('coordinator',`/v1/curriculum/courses/${courseId}/objectives?limit=25`)).statusCode).toBe(403);
  await context.client.query("update app.classes set status='active'where school_id=$1 and id=$2",[context.school,context.classId]);
 });
 it('releases distinct native result and evidence identities under one pinned course and reauthorizes programme learners',async()=>{
  const releases=[];
  for(const[referenceId,title,score]of [[firstAcademic,'Explain the school example',0],[secondAcademic,'Check the school explanation',7]]as const){
   const draft=await context.command('teacher','/v1/assessments',{courseId,title,instructions:'Use the selected approved school objective.',maxScore:10,preparation:true,intendedSubmissionKind:'TEXT',intendedModel:'numeric'});
   expect((await context.request('teacher',`/v1/assessments/${draft.id}/preparation`,{title,instructions:'Wrong curriculum context.',dueAt:null,maxScore:10,referenceId:context.referenceId,rubricId:null,expectedPreparationVersion:1})).statusCode).toBe(409);
   const edited=await context.command('teacher',`/v1/assessments/${draft.id}/preparation`,{title,instructions:'Use the selected approved school objective.',dueAt:null,maxScore:10,referenceId,rubricId:null,expectedPreparationVersion:1});
   const exact=await context.request('teacher',`/v1/assessments/${draft.id}/academic-reference`);expect(exact.statusCode,exact.body).toBe(200);expect(exact.json()).toMatchObject({id:referenceId,title,version:'school-objectives-1',status:'APPROVED'});
   expect((await context.request('otherTeacher',`/v1/assessments/${draft.id}/academic-reference`)).statusCode).toBe(403);
   await context.command('teacher',`/v1/assessments/${draft.id}/publish`,{expectedPreparationVersion:edited.preparationVersion,expectedPolicyVersion:edited.policyVersion,expectedAvailabilityVersion:edited.availabilityVersion});
   const submission=await context.command('strong',`/v1/assessments/${draft.id}/submissions`,{content:'School example with checking evidence.'});
   const mark=await context.command('teacher',`/v1/submissions/${submission.id}/results`,{score,feedback:'Reviewed for the exact selected objective.',expectedPolicyVersion:edited.policyVersion,expectedRevision:0,sourceEvidence:true});
   const released=await context.command('teacher',`/v1/results/${mark.id}/release`,{expectedRevision:1,parentVisible:true});expect(released).toMatchObject({referenceId,referenceVersion:'school-objectives-1',score});
   const evidence=await context.request('parent',`/v1/evidence/${released.evidenceId}`);expect(evidence.statusCode,evidence.body).toBe(200);expect(evidence.json()).toMatchObject({referenceId,referenceVersion:'school-objectives-1',resultId:released.id});releases.push(released);
  }
  expect(releases[0].evidenceId).not.toBe(releases[1].evidenceId);
  const report=await context.request('parent',`/v1/learners/${customerActor(12)}/academic-report?limit=100`);expect(report.statusCode,report.body).toBe(200);expect(report.json().items.map((row:{referenceId:string})=>row.referenceId).sort()).toEqual([firstAcademic,secondAcademic].sort());
  await context.command('coordinator','/v1/curriculum/learners',{programmeId,learnerId:customerActor(12),status:'revoked',confirmAccessChange:true});
  const withdrawn=await context.request('parent',`/v1/learners/${customerActor(12)}/academic-report?limit=100`);expect(withdrawn.statusCode).toBe(200);expect(withdrawn.json().items).toEqual([]);
  const source=(await context.client.query('select reference_id,academic_reference_id from app.programme_course_contexts where school_id=$1 and course_id=$2',[context.school,courseId])).rows[0];expect(source).toEqual({reference_id:firstSource,academic_reference_id:firstAcademic});
 });
});
