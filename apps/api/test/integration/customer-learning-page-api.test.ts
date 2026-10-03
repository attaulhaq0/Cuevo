import {afterAll,beforeAll,describe,expect,it,afterEach} from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCustomerContext,customerCourse,type CustomerContext } from './customer-test-context';
import{CooperativeFixtureScope}from'./cooperative-fixture-scope';
import{cooperativeCustomerContext}from'./cooperative-customer-context';
import{withFixtureCleanup}from'./fixture-cleanup';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('customer navigable learning pages and completion provenance',()=>{
 let context:CustomerContext;let courseId:string;let unitId:string;let activityId:string;
 let ownerContext:CustomerContext;let caseScope:CooperativeFixtureScope|undefined;
 function journey(budgetMs:number,work:()=>Promise<void>){const scope=new CooperativeFixtureScope(budgetMs);caseScope=scope;context=cooperativeCustomerContext(ownerContext,scope);return scope.run(work);}
 beforeAll(async()=>{
  ownerContext=await createCustomerContext();context=ownerContext;const course=await customerCourse(context,'Realistic complete subject');courseId=course.courseId;unitId=(await context.client.query('select unit_id from app.lessons where school_id=$1 and id=$2',[context.school,course.lessonId])).rows[0].unit_id;
  const lessons=(await context.client.query('select id from app.lessons where school_id=$1 and unit_id=$2',[context.school,unitId])).rows;
  for(let index=1;index<=35;index++){const id=randomUUID();await context.client.query("insert into app.lessons(school_id,id,unit_id,title,sequence,body)values($1,$2,$3,$4,$5,'School-authored content')",[context.school,id,unitId,`Ordinary lesson ${index}`,index+10]);for(let child=1;child<=2;child++){const activity=randomUUID();await context.client.query("insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)values($1,$2,$3,$4,'practice','School practice',$5)",[context.school,activity,id,`Practice ${index}-${child}`,child]);activityId??=activity;}}
  expect(lessons.length).toBeGreaterThan(0);
 },30000);
 afterEach(async()=>{await withFixtureCleanup(async()=>{await caseScope?.cancelAndWait();},[()=>ownerContext.client.query('RESET ROLE'),()=>{caseScope=undefined;}]);});
 afterAll(async()=>{await withFixtureCleanup(async()=>{await caseScope?.cancelAndWait();},[()=>ownerContext?.close()]);});
 it('SCALE01 a 35-lesson course opens with bounded navigable lesson pages',()=>journey(60000,async()=>{
  const result=await context.request('strong',`/v1/courses/${courseId}?unitId=${unitId}&limit=10`);expect(result.statusCode).toBe(200);
  const page=result.json();expect(page.selectedUnitId).toBe(unitId);expect(page.units.find((unit:{id:string})=>unit.id===unitId).lessons.length).toBeLessThanOrEqual(10);expect(page.nextLessonCursor).toEqual(expect.any(String));
  const ids:string[]=[];let cursor:string|null=null;
  do{const response=await context.request('strong',`/v1/courses/${courseId}?unitId=${unitId}&limit=10${cursor?`&lessonCursor=${cursor}`:''}`);expect(response.statusCode).toBe(200);const data=response.json();ids.push(...data.units.find((unit:{id:string})=>unit.id===unitId).lessons.map((lesson:{id:string})=>lesson.id));cursor=data.nextLessonCursor;}while(cursor);
  expect(ids.length).toBe(36);expect(new Set(ids).size).toBe(ids.length);
 }),60000);
 it('UX12 returning to the course resolves persisted own completion without exposing another learner',()=>journey(60000,async()=>{
  const completion=await context.command('strong',`/v1/activities/${activityId}/complete`,{});
  let cursor:string|null=null;let found:Record<string,unknown>|undefined;
  do{const response=await context.request('strong',`/v1/courses/${courseId}?unitId=${unitId}&limit=10${cursor?`&lessonCursor=${cursor}`:''}`);expect(response.statusCode).toBe(200);const page=response.json();for(const lesson of page.units.find((unit:{id:string})=>unit.id===unitId).lessons)found??=lesson.activities.find((activity:{id:string})=>activity.id===activityId);cursor=page.nextLessonCursor;}while(cursor&&!found);
  expect(found?.completion).toMatchObject({id:completion.id,completedAt:expect.any(String)});
  let otherCursor:string|null=null;let otherActivity:Record<string,unknown>|undefined;const otherCursors=new Set<string>();
  do{const other=await context.request('observed',`/v1/courses/${courseId}?unitId=${unitId}&limit=10${otherCursor?`&lessonCursor=${otherCursor}`:''}`);expect(other.statusCode).toBe(200);const data=other.json();for(const lesson of data.units.find((unit:{id:string})=>unit.id===unitId).lessons)otherActivity??=lesson.activities.find((activity:{id:string})=>activity.id===activityId);otherCursor=data.nextLessonCursor;if(otherCursor){expect(otherCursors.has(otherCursor)).toBe(false);otherCursors.add(otherCursor);}}while(otherCursor&&!otherActivity);
  expect(otherActivity?.id).toBe(activityId);expect(otherActivity?.completion).toBeNull();
 }),60000);
 it('SCALE01 guessed foreign unit and cursor cannot widen course scope',()=>journey(60000,async()=>{
  expect((await context.request('strong',`/v1/courses/${courseId}?unitId=${randomUUID()}&limit=10`)).statusCode).toBe(404);
  expect((await context.request('strong',`/v1/courses/${courseId}?limit=1000`)).statusCode).toBe(400);
 }),60000);
 it('staff curriculum configuration receives the server current version while learners receive no configuration context',()=>journey(60000,async()=>{
  const staff=await context.request('coordinator',`/v1/courses/${courseId}?limit=10`);expect(staff.statusCode).toBe(200);expect(staff.json().curriculumContext).toMatchObject({version:1,programmeId:null,referenceId:null});
  const learner=await context.request('strong',`/v1/courses/${courseId}?limit=10`);expect(learner.statusCode).toBe(200);expect(learner.json()).not.toHaveProperty('curriculumContext');
 }),60000);
});
