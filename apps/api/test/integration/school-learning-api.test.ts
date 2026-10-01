import 'reflect-metadata';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter,type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config as dotenv } from 'dotenv';
import { Database } from '../../src/platform/database/database';
import { IdentityService,type MembershipRow } from '../../src/platform/identity/identity.service';
import { createUserVerifier } from '../../src/platform/identity/supabase-auth';
import { createSchoolLearningController } from '../../src/modules/school-learning/learning.controller';
import { parseServerConfig } from '@cuevo/config';
import { SchoolLearningService } from '../../src/modules/school-learning/learning.service';
import type { ActorContext } from '@cuevo/domain';
import { SwaggerModule,DocumentBuilder } from '@nestjs/swagger';
import { Pool } from 'pg';
dotenv({path:'.env.local',quiet:true});
const local=parseServerConfig(process.env);
const enabled=Boolean(local.databaseUrl&&local.supabaseUrl&&new URL(local.supabaseUrl).hostname==='127.0.0.1');
if(process.env.CUEVO_REQUIRE_INTEGRATION==='1'&&!enabled)throw new Error('A configured Cuevo local integration environment is required.');
describe.skipIf(!enabled)('school learning real Auth/API/Postgres journey',()=>{
  let app:NestFastifyApplication;let database:Database;let admin:Pool;
  const tokens:Record<string,string>={};
  const school='10000000-0000-4000-8000-000000000001';
  const classId='30000000-0000-4000-8000-000000000001';
  const subjectId='43000000-0000-4000-8000-000000000001';
  const ids:Record<string,string>={};
  beforeAll(async()=>{
    const password=(JSON.parse(readFileSync('.local/runtime-secrets.json','utf8'))as{syntheticPassword:string}).syntheticPassword;
    const identities=(JSON.parse(readFileSync('supabase/seed/identities.json','utf8'))as {actors:{actorId:string;email:string}[]}).actors;
    for(const [name,suffix]of Object.entries({teacher:'004',student:'012',otherStudent:'013',parent:'072',otherTeacher:'005',foreign:'133'})){
      const identity=identities.find(item=>item.actorId.endsWith(suffix));if(!identity)throw Error('Synthetic identity missing');
      const client=createClient(local.supabaseUrl!,local.supabasePublishableKey!,{auth:{persistSession:false,autoRefreshToken:false}});
      const result=await client.auth.signInWithPassword({email:identity.email,password});if(result.error||!result.data.session)throw Error('Synthetic sign-in unavailable');tokens[name]=result.data.session.access_token;
    }
    database=new Database(local.databaseUrl);
    const adminUrl=new URL(local.databaseUrl!);if(adminUrl.port!=='56322')throw Error('Not the Cuevo local database');adminUrl.username='postgres';adminUrl.password='postgres';admin=new Pool({connectionString:adminUrl.toString()});
    const identity=new IdentityService({verifyUser:createUserVerifier(local),currentMemberships:actor=>database.actorTransaction(actor,undefined,async client=>(await client.query<MembershipRow>('select * from "authorization".current_memberships()')).rows),isCurrentSession:(actor,session)=>database.actorTransaction(actor,undefined,async client=>Boolean((await client.query('select "authorization".is_current_session($1) as active',[session])).rows[0]?.active))});
    const controller=createSchoolLearningController(identity,database);
    @Module({controllers:[controller]})class TestModule{}
    app=await NestFactory.create<NestFastifyApplication>(TestModule,new FastifyAdapter({logger:false}),{logger:false});await app.init();await app.getHttpAdapter().getInstance().ready();
  },30000);
  afterAll(async()=>{await app?.close();await database?.close();await admin?.end();});
  const request=(role:string,url:string,body?:Record<string,unknown>,key=randomUUID())=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${tokens[role]}`,'x-school-id':school,'idempotency-key':key},payload:body});
  it('teacher and student complete a real published learning and submission journey',async()=>{
    const key=randomUUID();const body={classId,subjectId,title:`Synthetic-${key}`,description:'School authored'};
    const first=await request('teacher','/v1/courses',body,key);expect(first.statusCode,first.body).toBe(200);ids.course=first.json().id;
    const replay=await request('teacher','/v1/courses',body,key);expect(replay.json()).toEqual(first.json());
    const mismatch=await request('teacher','/v1/courses',{...body,title:'Different'},key);expect(mismatch.statusCode).toBe(409);
    // Denial and malformed input are checked before creating dependent hierarchy records.
    const denied=await request('otherTeacher','/v1/courses',{classId,subjectId,title:'Unauthorized',description:''});expect(denied.statusCode).toBe(403);
    const forged=await request('teacher','/v1/courses',{classId,subjectId,title:'Forged',description:'',schoolId:school});expect(forged.statusCode).toBe(400);
    const noKey=await app.inject({method:'POST',url:'/v1/courses',headers:{authorization:`Bearer ${tokens.teacher}`,'x-school-id':school},payload:{classId,subjectId,title:'No key',description:''}});expect(noKey.statusCode).toBe(400);
    expect((await request('student',`/v1/courses/${ids.course}`)).statusCode).toBe(404);
    const unit=await request('teacher',`/v1/courses/${ids.course}/units`,{title:'School unit',sequence:1});expect(unit.statusCode,unit.body).toBe(200);ids.unit=unit.json().id;
    const lesson=await request('teacher',`/v1/units/${ids.unit}/lessons`,{title:'School lesson',sequence:1,body:'Synthetic teacher-authored explanation.'});expect(lesson.statusCode,lesson.body).toBe(200);ids.lesson=lesson.json().id;
    const activity=await request('teacher',`/v1/lessons/${ids.lesson}/activities`,{title:'Practice',kind:'practice',instructions:'Apply the school-authored example.',sequence:1});expect(activity.statusCode,activity.body).toBe(200);ids.activity=activity.json().id;
    const publish=await request('teacher',`/v1/courses/${ids.course}/publish`,{});expect(publish.statusCode,publish.body).toBe(200);expect(publish.json().status).toBe('PUBLISHED');
    const course=await request('student',`/v1/courses/${ids.course}`);expect(course.statusCode,course.body).toBe(200);expect(course.json().units[0].lessons[0].activities[0].id).toBe(ids.activity);
    const completionKey=randomUUID();const done=await request('student',`/v1/activities/${ids.activity}/complete`,{},completionKey);expect(done.statusCode,done.body).toBe(200);
    expect((await request('student',`/v1/activities/${ids.activity}/complete`,{},completionKey)).json()).toEqual(done.json());
    expect((await request('otherStudent',`/v1/activities/${ids.activity}/complete`,{})).statusCode).toBe(403);
    const assessment=await request('teacher','/v1/assessments',{courseId:ids.course,title:'School Custom assessment',instructions:'Explain your answer.',maxScore:10});expect(assessment.statusCode,assessment.body).toBe(200);ids.assessment=assessment.json().id;
    const submissionKey=randomUUID();const submission=await request('student',`/v1/assessments/${ids.assessment}/submissions`,{content:'Synthetic work'},submissionKey);expect(submission.statusCode,submission.body).toBe(200);expect(submission.json()).toMatchObject({revision:1,status:'SUBMITTED'});
    expect((await request('student',`/v1/assessments/${ids.assessment}/submissions`,{content:'Synthetic work'},submissionKey)).json()).toEqual(submission.json());
    expect((await request('student',`/v1/assessments/${ids.assessment}/submissions`,{content:'Different revision'})).statusCode).toBe(409);
    expect((await request('parent',`/v1/assessments/${ids.assessment}/submissions`,{content:'Parent work'})).statusCode).toBe(403);
    expect((await request('parent','/v1/submissions')).statusCode).toBe(403);
    // The default queue is paginated; find this run's source across authorized bounded pages.
    let cursor: string | null = null;
    let foundSubmission = false;
    do {
      const queue = await request('teacher', `/v1/submissions?limit=100${cursor ? `&cursor=${cursor}` : ''}`);
      expect(queue.statusCode).toBe(200);
      const page = queue.json() as { items: { assessmentId: string }[]; nextCursor: string | null };
      foundSubmission = page.items.some(item => item.assessmentId === ids.assessment);
      cursor = page.nextCursor;
    } while (!foundSubmission && cursor);
    expect(foundSubmission).toBe(true);
    const foreign=await request('foreign',`/v1/courses/${ids.course}`);expect(foreign.statusCode).toBe(403);
    const failedKey=randomUUID();
    const unavailable=await request('teacher',`/v1/courses/99999999-0000-4000-8000-000000000001/units`,{title:'Retry after error',sequence:2},failedKey);expect(unavailable.statusCode).toBe(403);
    const recovered=await request('teacher',`/v1/courses/${ids.course}/units`,{title:'Retry after error',sequence:2},failedKey);expect(recovered.statusCode,recovered.body).toBe(200);
    // Change authoritative scope after a successful command, then prove replay loses access.
    try{
      await admin.query("update app.teacher_assignments set status='revoked' where school_id=$1 and teacher_actor_id=$2",[school,'20000000-0000-4000-8000-000000000004']);
      expect((await request('teacher','/v1/courses',body,key)).statusCode).toBe(403);
    }finally{await admin.query("update app.teacher_assignments set status='active' where school_id=$1 and teacher_actor_id=$2",[school,'20000000-0000-4000-8000-000000000004']);}
    try{
      await admin.query("update app.enrollments set status='revoked' where school_id=$1 and student_actor_id=$2",[school,'20000000-0000-4000-8000-000000000012']);
      expect((await request('student',`/v1/assessments/${ids.assessment}/submissions`,{content:'Synthetic work'},submissionKey)).statusCode).toBe(403);
    }finally{await admin.query("update app.enrollments set status='active' where school_id=$1 and student_actor_id=$2",[school,'20000000-0000-4000-8000-000000000012']);}
  },30000);
  it('list pagination honors bounded cursor and malformed queries deny',async()=>{
    const classes=await request('teacher','/v1/classes?limit=1');expect(classes.statusCode).toBe(200);expect(classes.json().items).toHaveLength(1);
    expect((await request('teacher','/v1/courses?limit=101')).statusCode).toBe(400);
    expect((await request('teacher','/v1/courses?cursor=invalid')).statusCode).toBe(400);
  });
  it('publishes strict request bodies, command keys and bounded list query contracts',()=>{
    const document=SwaggerModule.createDocument(app,new DocumentBuilder().build());
    const post=document.paths['/v1/courses']?.post;
    expect(post?.requestBody).toMatchObject({required:true,content:{'application/json':{schema:{additionalProperties:false,required:expect.arrayContaining(['classId','subjectId','title','description'])}}}});
    expect(post?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({in:'header',name:'Idempotency-Key',required:true})]));
    expect(document.paths['/v1/courses']?.get?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({in:'query',name:'limit'})]));
    expect(document.paths['/v1/courses']?.get?.responses['200']).toMatchObject({content:{'application/json':{schema:{required:['items','nextCursor']}}}});
  });
});

describe('learning replay authorization and bounded detail',()=>{
  const actor:ActorContext={userId:'20000000-0000-4000-8000-000000000004',schoolId:'10000000-0000-4000-8000-000000000001',membershipId:'21000000-0000-4000-8000-000000000004',role:'teacher',entitlements:['school.context','learning']};
  it('rechecks current object scope before returning a completed replay',async()=>{
    const client={query:vi.fn(async(sql:string)=>sql.includes('begin_command')?{rows:[{reservation:{state:'COMPLETED',response:{id:'50000000-0000-4000-8000-000000000001',title:'Revoked content'}}}]}:{rows:[{allowed:false}]})};
    const db={actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run(client)}as unknown as Database;
    await expect(new SchoolLearningService(db).command(actor,'unit.create','50000000-0000-4000-8000-000000000001',{title:'Unit',sequence:1},'replay-key','request')).rejects.toMatchObject({status:403});
    expect(client.query.mock.calls.some(([sql])=>sql.includes('begin_command'))).toBe(false);
  });
  it('rejects an oversized tree instead of fetching arbitrary nested lesson bodies',async()=>{
    const client={query:vi.fn(async(sql:string)=>sql.includes('app.courses')?{rows:[{id:'50000000-0000-4000-8000-000000000001'}]}:sql.includes('app.units')?{rows:Array.from({length:101},(_,sequence)=>({id:String(sequence),title:'Large',sequence}))}:{rows:[]})};
    const db={actorTransaction:async(_actor:string,_school:string,run:(client:unknown)=>Promise<unknown>)=>run(client)}as unknown as Database;
    await expect(new SchoolLearningService(db).detail(actor,'50000000-0000-4000-8000-000000000001')).rejects.toMatchObject({code:'LEARNING_DETAIL_TOO_LARGE',status:413});
  });
});
