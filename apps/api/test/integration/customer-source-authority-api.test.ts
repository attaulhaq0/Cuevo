import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config as dotenv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { Database } from '../../src/platform/database/database';
import { IdentityService, type MembershipRow } from '../../src/platform/identity/identity.service';
import { createUserVerifier } from '../../src/platform/identity/supabase-auth';
import { createLearnerStateController } from '../../src/modules/learner-state/learner-state.controller';
import { createAcademicController } from '../../src/modules/academic/academic.controller';

dotenv({ path: '.env.local', quiet: true });
const config = parseServerConfig(process.env);
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
const school = '10000000-0000-4000-8000-000000000001';
const learner = '20000000-0000-4000-8000-000000000012';
const sibling = '20000000-0000-4000-8000-000000000013';
const parent = '20000000-0000-4000-8000-000000000072';
const teacher = '20000000-0000-4000-8000-000000000004';
const otherTeacher = '20000000-0000-4000-8000-000000000005';
const subject = '43000000-0000-4000-8000-000000000001';

describe.skipIf(!enabled)('independent customer current source API authority', () => {
  let owner: Pool; let client: PoolClient; let identityDatabase: Database; let identity: IdentityService;
  let app: NestFastifyApplication;
  const tokens: Record<string, string> = {};
  let source: { classId: string; courseId: string; resultId: string; evidenceId: string; observationId: string; eventId: string };
  beforeAll(async () => {
    const url = new URL(config.databaseUrl!);
    if (url.hostname !== '127.0.0.1' || url.port !== '56322') throw Error('Guarded Cuevo local target required');
    url.username = 'postgres'; url.password = 'postgres'; owner = new Pool({ connectionString: url.toString() });
    identityDatabase = new Database(config.databaseUrl);
    identity = new IdentityService({
      verifyUser: createUserVerifier(config),
      currentMemberships: actor => identityDatabase.actorTransaction(actor, undefined, async c => (await c.query<MembershipRow>('select * from "authorization".current_memberships()')).rows),
      isCurrentSession: (_actor, session) => identityDatabase.actorTransaction(_actor, undefined, async c => Boolean((await c.query('select "authorization".is_current_session($1) active', [session])).rows[0]?.active)),
    });
    const password = JSON.parse(readFileSync('.local/runtime-secrets.json', 'utf8')).syntheticPassword as string;
    const actors = JSON.parse(readFileSync('supabase/seed/identities.json', 'utf8')).actors as { actorId: string; email: string }[];
    for (const [role, actorId] of Object.entries({ teacher, student: learner, parent })) {
      const actor = actors.find(item => item.actorId === actorId)!;
      const auth = createClient(config.supabaseUrl!, config.supabasePublishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await auth.auth.signInWithPassword({ email: actor.email, password });
      if (!result.data.session) throw Error('Synthetic sign-in failed'); tokens[role] = result.data.session.access_token;
    }
  }, 30000);
  beforeEach(async () => {
    client = await owner.connect(); await client.query('BEGIN');
    const classId = randomUUID(); const courseId = randomUUID(); const assessmentId = randomUUID();
    const submissionId = randomUUID(); const unitId = randomUUID(); const lessonId = randomUUID(); const activityId = randomUUID();
    const completionId = randomUUID(); const eventId = randomUUID(); const lease = randomUUID();
    await client.query('insert into app.classes(school_id,id,academic_year_id,year_group_id,name) select school_id,$1,academic_year_id,year_group_id,$2 from app.classes where id=$3', [classId, 'Customer source boundary', '30000000-0000-4000-8000-000000000001']);
    await client.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values($1,$2,$3,now()-interval '1 day'),($1,$2,$4,now()-interval '1 day')", [school, classId, learner, sibling]);
    await client.query("insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values($1,$2,$3,$4,now()-interval '1 day')", [school, classId, subject, otherTeacher]);
    await client.query("insert into app.parent_relationships(school_id,parent_actor_id,student_actor_id,relationship_type,effective_from)values($1,$2,$3,'parent',now()-interval '1 day')on conflict(school_id,parent_actor_id,student_actor_id)do update set status='active',effective_from=excluded.effective_from,effective_to=null", [school, parent, sibling]);
    await client.query("insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values($1,$2,$3,$4,$5,'Customer source course','Synthetic','PUBLISHED')", [school, courseId, classId, subject, otherTeacher]);
    await client.query("insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score,academic_reference_id,policy_version)values($1,$2,$3,$4,'Customer source assessment','Synthetic',10,$5,2)", [school, assessmentId, courseId, otherTeacher, '61000000-0000-4000-8000-000000000001']);
    await client.query("insert into app.submissions(school_id,id,assessment_id,learner_id,content)values($1,$2,$3,$4,'Synthetic immutable source')", [school, submissionId, assessmentId, learner]);
    await client.query("select set_config('app.school_id',$1,true),set_config('app.actor_id',$2,true)", [school, otherTeacher]);
    const resultId = (await client.query("select internal.release_marking(internal.mark_submission($1,6,'Human reviewed',2,0,true),1,true) id", [submissionId])).rows[0].id as string;
    const evidenceId = (await client.query('select evidence_id from app.result_revisions where id=$1', [resultId])).rows[0].evidence_id as string;
    await client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until)values($1,$2::uuid,$3,'result.released','result',$4,1,'{}',$2::text,'PROCESSING',$5,clock_timestamp()+interval '30 seconds')", [school, eventId, otherTeacher, resultId, lease]);
    await client.query('set local role cuevo_worker'); await client.query('select internal.process_learner_event($1,$2)', [eventId, lease]); await client.query('reset role');
    await client.query("insert into app.units(school_id,id,course_id,title,sequence)values($1,$2,$3,'Unit',1)", [school, unitId, courseId]);
    await client.query("insert into app.lessons(school_id,id,unit_id,title,sequence,body)values($1,$2,$3,'Lesson',1,'Synthetic')", [school, lessonId, unitId]);
    await client.query("insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)values($1,$2,$3,'Practice','practice','Synthetic',1)", [school, activityId, lessonId]);
    await client.query('insert into app.activity_completions(school_id,id,activity_id,learner_id)values($1,$2,$3,$4)', [school, completionId, activityId, learner]);
    const observationEvent = randomUUID(); const observationLease = randomUUID();
    await client.query("insert into internal.outbox_events(school_id,id,actor_id,type,entity_type,entity_id,version,metadata,deduplication_key,state,lease_token,lease_until)values($1,$2::uuid,$3,'activity.complete','activity',$4,1,'{}',$2::text,'PROCESSING',$5,clock_timestamp()+interval '30 seconds')", [school, observationEvent, learner, completionId, observationLease]);
    await client.query('set local role cuevo_worker'); await client.query('select internal.process_learner_event($1,$2)', [observationEvent, observationLease]); await client.query('reset role');
    const observationId = (await client.query('select id from app.habit_observations where source_object_id=$1', [completionId])).rows[0].id as string;
    await client.query('update app.learner_signals set observation_ids=array[$1::uuid],source_event_ids=array[$2::uuid],count=1,expires_at=clock_timestamp()+interval\'1 day\'where school_id=$3 and learner_id=$4',[observationId,observationEvent,school,learner]);
    source = { classId, courseId, resultId, evidenceId, observationId, eventId };
    // Run actual controllers and current Auth against one rollback fixture transaction.
    const rollbackDatabase = { actorTransaction: async <T>(actor: string, selectedSchool: string | undefined, run: (c: PoolClient) => Promise<T>) => {
      await client.query('SAVEPOINT api_request'); await client.query('set local role cuevo_api');
      try { await client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [actor, selectedSchool ?? '']); const result = await run(client); await client.query('reset role'); await client.query('RELEASE SAVEPOINT api_request'); return result; }
      catch (error) { await client.query('ROLLBACK TO SAVEPOINT api_request'); await client.query('reset role'); throw error; }
    } } as unknown as Database;
    const controllers = [createLearnerStateController(identity, rollbackDatabase), createAcademicController(identity, rollbackDatabase)];
    @Module({ controllers }) class TestModule {}
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter({ logger: false }), { logger: false });
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  }, 30000);
  afterEach(async () => { await app?.close(); await client?.query('ROLLBACK'); client?.release(); });
  afterAll(async () => { await identityDatabase?.close(); await owner?.end(); });
  const request = (role: string, url: string) => app.inject({ url, headers: { authorization: `Bearer ${tokens[role]}`, 'x-school-id': school } });
  it('AUTH01 teacher snapshot excludes sources from another owned class', async () => {
    const response = await request('teacher', `/v1/learners/${learner}/state`);
    expect(response.statusCode).toBe(200);
    const state = response.json();
    expect(state.academic.some((item: { resultId: string }) => item.resultId === source.resultId)).toBe(false);
    expect(state.development.practice.observationIds).not.toContain(source.observationId);
    expect(state.sourceEventIds).not.toContain(source.eventId);
  });
  it('AUTH02 observation source page excludes another owned class', async () => {
    const observations = await request('teacher', `/v1/observations?learnerId=${learner}&limit=100`);
    expect(observations.statusCode).toBe(200);
    expect(observations.json().items.some((item: { id: string }) => item.id === source.observationId)).toBe(false);
  });
  it('AUTH01 cached practice signal cannot expose foreign class source IDs', async () => {
    const signals=await request('teacher',`/v1/signals?learnerId=${learner}&limit=100`);
    expect(signals.statusCode).toBe(200);
    expect(signals.json().items.some((item:{observationIds:string[]})=>item.observationIds.includes(source.observationId))).toBe(false);
  });
  it('AUTH01 cached signal is denied after learner course withdrawal', async () => {
    await client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3",[school,source.classId,learner]);
    const signals=await request('student',`/v1/signals?learnerId=${learner}&limit=100`);
    expect(signals.statusCode).toBe(200);
    expect(signals.json().items.some((item:{observationIds:string[]})=>item.observationIds.includes(source.observationId))).toBe(false);
  });
  it('AUTH02 related teacher cannot access foreign class evidence or observation sources', async () => {
    expect((await request('teacher', `/v1/evidence/${source.evidenceId}`)).statusCode).toBe(404);
    const observations = await request('teacher', `/v1/observations?learnerId=${learner}&limit=100`);
    expect(observations.statusCode).toBe(200);
    expect(observations.json().items.some((item: { id: string }) => item.id === source.observationId)).toBe(false);
  });
  it('AUTH01 withdrawal removes source from student snapshot', async () => {
    await client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [school, source.classId, learner]);
    const state = await request('student', `/v1/learners/${learner}/state`);
    expect(state.statusCode).toBe(200);
    expect(state.json().academic.some((item: { resultId: string }) => item.resultId === source.resultId)).toBe(false);
  });
  it('current academic source rows carry authorized human labels',async()=>{
    const response=await request('student',`/v1/learners/${learner}/state`);expect(response.statusCode).toBe(200);
    const row=response.json().academic.find((item:{resultId:string})=>item.resultId===source.resultId);
    expect(row).toMatchObject({assessmentTitle:'Customer source assessment',referenceTitle:expect.any(String)});
  });
  it('AUTH01 parent snapshot matches exact child withdrawal projection despite enrolled sibling', async () => {
    await client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [school, source.classId, learner]);
    const report = await request('parent', `/v1/learners/${learner}/academic-report?limit=100`);
    expect(report.statusCode).toBe(200);
    expect(report.json().items.some((item: { id: string }) => item.id === source.resultId)).toBe(false);
    const state = await request('parent', `/v1/learners/${learner}/state`);
    expect(state.statusCode).toBe(200);
    expect(state.json().academic.some((item: { resultId: string }) => item.resultId === source.resultId)).toBe(false);
  });
});
