import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createCustomerContext, customerCourse, customerActor, type CustomerContext } from './customer-test-context';
// Root composition registers the resource factory in CustomerContext before actual execution.
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('learning documents current source actual Auth/API',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},30000);afterAll(async()=>{await context?.close();});
 it('publishes exact current verified course bytes and removes previous publication after replacement',async()=>{
  const course=await customerCourse(context,'Document source course');const stagedBytes=Buffer.from('School checking worksheet.');const hash=createHash('sha256').update(stagedBytes).digest('hex');const stage=await context.command('teacher',`/v1/courses/${course.courseId}/resource-assets`,{name:'ورقة التحقق.txt',contentType:'text/plain',byteSize:stagedBytes.length,sha256:hash});
  expect((await context.request('strong',`/v1/courses/${course.courseId}/resource-assets`,{name:'bad.txt',contentType:'text/plain',byteSize:1,sha256:hash})).statusCode).toBe(403);
  // Domain SQL metadata finalize is fixture-only here; root real Storage/browser verifies the byte path.
  await context.client.query("update app.private_assets set state='AVAILABLE',available_at=clock_timestamp()where school_id=$1 and id=$2",[context.school,stage.id]);
  const attached=await context.command('teacher',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}`,{assetId:stage.id,title:'Checking worksheet',sequence:1});expect((await context.request('strong',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}?limit=100`)).json().items).toHaveLength(0);
  const published=await context.command('teacher',`/v1/courses/${course.courseId}/resources/${attached.id}/publish`,{expectedRevision:1,confirmPublication:true});const page=await context.request('strong',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}?limit=100`);expect(page.statusCode).toBe(200);expect(page.json().items[0]).toMatchObject({id:attached.id,revisionId:published.revisionId,name:'ورقة التحقق.txt',state:'PUBLISHED'});expect(page.body).not.toContain('objectPath');
  expect((await context.request('parent',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}?limit=100`)).statusCode).toBe(403);
  const next=await context.command('teacher',`/v1/courses/${course.courseId}/resource-assets`,{name:'replacement.txt',contentType:'text/plain',byteSize:stagedBytes.length,sha256:hash});await context.client.query("update app.private_assets set state='AVAILABLE',available_at=clock_timestamp()where school_id=$1 and id=$2",[context.school,next.id]);
  const replacement=await context.command('teacher',`/v1/courses/${course.courseId}/resources/${attached.id}/replace`,{assetId:next.id,expectedRevision:2,reason:'Teacher replaces the worksheet.'});expect(replacement).toMatchObject({revision:3,state:'ATTACHED',assetId:next.id});expect((await context.request('strong',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}?limit=100`)).json().items).toHaveLength(0);
  await context.command('teacher',`/v1/courses/${course.courseId}/resources/${attached.id}/publish`,{expectedRevision:3,confirmPublication:true});
  const removed=await context.command('teacher',`/v1/courses/${course.courseId}/resources/${attached.id}/remove`,{expectedRevision:4,reason:'Teacher removes the worksheet.',confirmRemoval:true});expect(removed.state).toBe('REMOVED');expect((await context.request('strong',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}?limit=100`)).json().items).toHaveLength(0);
  await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3",[context.school,context.classId,customerActor(12)]);expect((await context.request('strong',`/v1/courses/${course.courseId}/resources/lesson/${course.lessonId}?limit=100`)).statusCode).toBe(403);
 },30000);
});
