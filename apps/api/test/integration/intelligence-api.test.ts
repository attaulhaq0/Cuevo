import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config as dotenv } from 'dotenv';
import { Pool } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { Database } from '../../src/platform/database/database';
import { IdentityService, type MembershipRow } from '../../src/platform/identity/identity.service';
import { createUserVerifier } from '../../src/platform/identity/supabase-auth';
import { createSchoolLearningController } from '../../src/modules/school-learning/learning.controller';
import { createAcademicController } from '../../src/modules/academic/academic.controller';
import { createImprovementController } from '../../src/modules/improvement/improvement.controller';
import { createIntelligenceService } from '../../src/modules/improvement/intelligence.service';

dotenv({ path: '.env.local', quiet: true });
const base = parseServerConfig(process.env);
const configuredLocal=Boolean(base.databaseUrl&&base.supabaseUrl&&new URL(base.supabaseUrl).hostname==='127.0.0.1');
const local = configuredLocal ? parseServerConfig({ ...process.env, AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }) : base;
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1' && configuredLocal;
if(process.env.CUEVO_REQUIRE_INTEGRATION==='1'&&!enabled)throw Error('Cuevo local integration configuration required');
describe.skipIf(!enabled)('governed fixture intelligence real Auth API database journey', () => {
  let app: NestFastifyApplication; let db: Database; let admin: Pool;
  const school = '10000000-0000-4000-8000-000000000001'; const tokens: Record<string, string> = {};
  beforeAll(async () => {
    const password = (JSON.parse(readFileSync('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
    const actors = (JSON.parse(readFileSync('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
    for (const [role, suffix] of Object.entries({ teacher: '004', student: '012', parent: '072', peer: '013',coordinator:'002' })) {
      const person = actors.find(item => item.actorId.endsWith(suffix))!;
      const auth = createClient(local.supabaseUrl!, local.supabasePublishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await auth.auth.signInWithPassword({ email: person.email, password });
      if (!result.data.session) throw Error('Synthetic sign in unavailable'); tokens[role] = result.data.session.access_token;
    }
    const url = new URL(local.databaseUrl!); if (url.hostname !== '127.0.0.1' || url.port !== '56322') throw Error('Cuevo local DB required');
    url.username = 'postgres'; url.password = 'postgres'; admin = new Pool({ connectionString: url.toString() });
    await admin.query("insert into app.intelligence_policies(school_id,version,fixture_enabled,approved_by)values($1,1,true,$2)on conflict(school_id)do update set fixture_enabled=true,version=1", [school, '20000000-0000-4000-8000-000000000002']);
    db = new Database(local.databaseUrl);
    const identity = new IdentityService({ verifyUser: createUserVerifier(local), currentMemberships: actor => db.actorTransaction(actor, undefined, async client => (await client.query<MembershipRow>('select *from "authorization".current_memberships()')).rows), isCurrentSession: (actor, session) => db.actorTransaction(actor, undefined, async client => Boolean((await client.query('select "authorization".is_current_session($1)as active', [session])).rows[0]?.active)) });
    const controllers = [createSchoolLearningController(identity, db), createAcademicController(identity, db), createImprovementController(identity, db, createIntelligenceService(identity, db, local))];
    @Module({ controllers }) class TestModule {}
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter({ logger: false }), { logger: false }); await app.init(); await app.getHttpAdapter().getInstance().ready();
  }, 30000);
  afterAll(async () => { await app?.close(); await db?.close(); await admin?.end(); });
  const request = (role: string, url: string, payload?: Record<string, unknown>, key = randomUUID()) => app.inject({ method: payload === undefined ? 'GET' : 'POST', url, headers: { authorization: `Bearer ${tokens[role]}`, 'x-school-id': school, 'idempotency-key': key }, payload });
  const command = async (role: string, url: string, payload: Record<string, unknown>) => { const response = await request(role, url, payload); expect(response.statusCode, response.body).toBe(200); return response.json(); };
  it('persists minimum authorized context, replays one proposal and requires human rejection or approval', async () => {
    const course = await command('teacher', '/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title: `Intelligence ${randomUUID()}`, description: 'School authored' });
    await command('teacher', `/v1/courses/${course.id}/publish`, {});
    const unit=await command('teacher',`/v1/courses/${course.id}/units`,{title:'Reviewed learning options',sequence:1});
    const lesson=await command('teacher',`/v1/units/${unit.id}/lessons`,{title:'Approved source example',sequence:1,body:'School-authored worked example.'});
    const activity=await command('teacher',`/v1/lessons/${lesson.id}/activities`,{title:'School-guided explanation',kind:'practice',instructions:'Use the school example and explain your checking step.',sequence:1});
    await command('student',`/v1/activities/${activity.id}/complete`,{});
    const assessment = await command('teacher', '/v1/assessments', { courseId: course.id, title: 'Baseline', instructions: 'School task', maxScore: 10 });
    await command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
    const submission = await command('student', `/v1/assessments/${assessment.id}/submissions`, { content: 'PRIVATE RAW ANSWER' });
    const marking = await command('teacher', `/v1/submissions/${submission.id}/results`, { score: 0, feedback: 'PRIVATE RAW FEEDBACK', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
    const baseline = await command('teacher', `/v1/results/${marking.id}/release`, { expectedRevision: 1 });
    const secondaryAssessment=await command('teacher','/v1/assessments',{courseId:course.id,title:'Other current source',instructions:'School task',maxScore:10});
    await command('teacher',`/v1/assessments/${secondaryAssessment.id}/reference`,{referenceId:'61000000-0000-4000-8000-000000000001',expectedPolicyVersion:1});
    const secondarySubmission=await command('student',`/v1/assessments/${secondaryAssessment.id}/submissions`,{content:'Other current released evidence'});
    const secondaryMarking=await command('teacher',`/v1/submissions/${secondarySubmission.id}/results`,{score:2,feedback:'Teacher reviewed',expectedPolicyVersion:2,expectedRevision:0,sourceEvidence:true});
    const secondary=await command('teacher',`/v1/results/${secondaryMarking.id}/release`,{expectedRevision:1});
    const key = randomUUID(); const body = { baselineResultId: baseline.id };
    const analyzed = await request('teacher', '/v1/intelligence/analyze', body, key); expect(analyzed.statusCode, analyzed.body).toBe(200);
    const proposal = analyzed.json(); expect(proposal).toMatchObject({ origin: 'AI_GENERATED', generationMode: 'FIXTURE', intelligenceRunId: expect.any(String), status: 'AWAITING_HUMAN', observation: 'The released numeric result is 0 / 10.' });
    expect(proposal).toMatchObject({activityTitle:'School-guided explanation',instructions:'Use the school example and explain your checking step.'});
    const disclosure=await request('teacher',`/v1/intelligence/runs/${proposal.intelligenceRunId}/context`);
    expect(disclosure.statusCode,disclosure.body).toBe(200);expect(disclosure.json().context).toMatchObject({courseId:course.id,reference:{version:'synthetic-school-1'},coverage:'BOUNDED_AUTHORIZED_CONTEXT'});
    expect(disclosure.json().context.learningOptions).toEqual(expect.arrayContaining([expect.objectContaining({activityId:activity.id})]));
    expect(disclosure.json().context.recentResults).toEqual(expect.arrayContaining([expect.objectContaining({resultId:secondary.id})]));
    await command('teacher',`/v1/lessons/${lesson.id}/activities`,{title:'New authorized option',kind:'practice',instructions:'Another approved example',sequence:2});
    expect((await request('teacher',`/v1/intelligence/runs/${proposal.intelligenceRunId}/context`)).statusCode).toBe(200);
    expect((await request('teacher','/v1/intelligence/analyze',body,key)).json()).toEqual(proposal);
    expect((await request('parent',`/v1/intelligence/runs/${proposal.intelligenceRunId}/context`)).statusCode).toBe(403);
    expect((await request('teacher', '/v1/intelligence/analyze', body, key)).json()).toEqual(proposal);
    expect((await request('student', '/v1/intelligence/analyze', body)).statusCode).toBe(403); expect((await request('parent', '/v1/intelligence/analyze', body)).statusCode).toBe(403);
    expect((await request('teacher', '/v1/intelligence/analyze', { ...body, origin: 'TEACHER_AUTHORED' })).statusCode).toBe(400);
    const persisted = (await admin.query('select context_references,tool_trace,state,evaluation_status from app.intelligence_runs where id=$1', [proposal.intelligenceRunId])).rows[0];
    expect(persisted).toMatchObject({ state: 'PROPOSAL_READY', evaluation_status: 'PASSED' }); expect(JSON.stringify(persisted)).not.toMatch(/PRIVATE RAW|password|email/);
    expect((await admin.query('select count(*)from app.recommendations where intelligence_run_id=$1', [proposal.intelligenceRunId])).rows[0].count).toBe('1');
    expect((await command('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'REJECT', reason: 'Teacher chose another approach' })).interventionId).toBeNull();
    const second = await command('teacher', '/v1/intelligence/analyze', body); const approved = await command('teacher', `/v1/recommendations/${second.id}/decision`, { decision: 'APPROVE', reason: 'Teacher reviewed this practice' }); expect(approved.interventionId).toEqual(expect.any(String));
    const metrics=await request('teacher','/v1/intelligence/metrics?mode=FIXTURE&windowDays=30');expect(metrics.statusCode,metrics.body).toBe(200);expect(metrics.json()).toMatchObject({scope:'CURRENT_AUTHORIZED_RUNS',mode:'FIXTURE',unsupportedClaimRate:null,unknownMetricReason:'NO_DEDICATED_OBSERVATION_DENOMINATOR'});expect(metrics.json().acceptance.denominator).toBeGreaterThanOrEqual(2);
    expect((await request('coordinator','/v1/intelligence/metrics')).statusCode).toBe(403);
    const corrected=await command('teacher',`/v1/submissions/${secondarySubmission.id}/results`,{score:3,feedback:'Teacher correction',expectedPolicyVersion:2,expectedRevision:1,sourceEvidence:true});
    await command('teacher',`/v1/results/${corrected.id}/release`,{expectedRevision:2});
    expect((await request('teacher',`/v1/intelligence/runs/${proposal.intelligenceRunId}/context`)).statusCode).toBe(403);
    expect((await request('teacher','/v1/intelligence/analyze',body,key)).statusCode).toBe(403);
    await admin.query("update app.teacher_assignments set status='revoked'where teacher_actor_id=$1", ['20000000-0000-4000-8000-000000000004']);
    try { expect((await request('teacher', '/v1/intelligence/analyze', body, key)).statusCode).toBe(403); }
    finally { await admin.query("update app.teacher_assignments set status='active'where teacher_actor_id=$1", ['20000000-0000-4000-8000-000000000004']); }
  }, 30000);
});
