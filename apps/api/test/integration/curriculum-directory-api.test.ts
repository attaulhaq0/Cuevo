import{afterAll,beforeAll,describe,it,expect}from'vitest';
import{programmeLearnerPageSchema,curriculumProgrammeSchema}from'@cuevo/contracts';
import{createCustomerContext,customerActor,customerCourse,customerProgramme,type CustomerContext}from'./customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('current named curriculum directory',()=>{
 let context:CustomerContext;let programmeId:string;
 beforeAll(async()=>{context=await createCustomerContext();const course=await customerCourse(context,'Programme readback source');programmeId=(await customerProgramme(context,course.courseId,context.classId,customerActor(12),'School readback pathway')).programmeId;await context.command('admin','/v1/curriculum/learners',{programmeId,learnerId:customerActor(13),status:'active',confirmAccessChange:true});},30000);
 afterAll(async()=>{await context?.close();});
 it('returns named programme context and active/revoked current assignments with bounded continuation',async()=>{
  const programmes=await context.request('coordinator','/v1/curriculum/programmes?limit=100');expect(programmes.statusCode,programmes.body).toBe(200);const programme=curriculumProgrammeSchema.parse(programmes.json().items.find((row:{id:string})=>row.id===programmeId));expect(programme).toMatchObject({className:'Duplicate class — صف',subjectName:'School Custom synthetic subject',yearGroupName:'Synthetic group',academicYearName:'Synthetic year'});
  const first=await context.request('teacher',`/v1/curriculum/programmes/${programmeId}/learners?limit=1`);expect(first.statusCode,first.body).toBe(200);const page=programmeLearnerPageSchema.parse(first.json());expect(page.items.map(item=>item.learnerId)).toEqual([customerActor(12)]);expect(page.nextCursor).toBe(customerActor(12));
  const second=await context.request('teacher',`/v1/curriculum/programmes/${programmeId}/learners?limit=1&cursor=${page.nextCursor}`);expect(second.json().items[0]).toMatchObject({learnerId:customerActor(13),status:'active'});expect(second.json().nextCursor).toBeNull();
  await context.command('coordinator','/v1/curriculum/learners',{programmeId,learnerId:customerActor(12),status:'revoked',confirmAccessChange:true});expect((await context.request('coordinator',`/v1/curriculum/programmes/${programmeId}/learners?limit=25`)).json().items[0]).toMatchObject({learnerId:customerActor(12),status:'revoked'});
  await context.command('coordinator','/v1/curriculum/learners',{programmeId,learnerId:customerActor(12),status:'active',confirmAccessChange:true});expect((await context.request('teacher',`/v1/curriculum/programmes/${programmeId}/learners?limit=25`)).json().items[0].status).toBe('active');
 });
 it('denies parent/student/unassigned/foreign programme and drops transferred learners',async()=>{
  const path=`/v1/curriculum/programmes/${programmeId}/learners?limit=25`;for(const role of['parent','strong','otherTeacher']as const)expect((await context.request(role,path)).statusCode).toBe(403);
  expect((await context.request('coordinator','/v1/curriculum/programmes/90000000-0000-4000-8000-000000000001/learners?limit=25')).statusCode).toBe(403);
  await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3",[context.school,context.classId,customerActor(12)]);const page=await context.request('teacher',path);expect(page.statusCode,page.body).toBe(200);expect(page.json().items.map((item:{learnerId:string})=>item.learnerId)).toEqual([customerActor(13)]);
  await context.client.query("update app.teacher_assignments set status='revoked'where school_id=$1 and class_id=$2 and teacher_actor_id=$3",[context.school,context.classId,customerActor(4)]);expect((await context.request('teacher',path)).statusCode).toBe(403);
 });
});
