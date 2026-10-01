import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config as dotenv } from 'dotenv';
import { Pool } from 'pg';
import { Database } from '../../src/platform/database/database';
import { IdentityService, type MembershipRow } from '../../src/platform/identity/identity.service';
import { createUserVerifier } from '../../src/platform/identity/supabase-auth';
import { createAcademicController } from '../../src/modules/academic/academic.controller';
import { createSchoolLearningController } from '../../src/modules/school-learning/learning.controller';
import { parseServerConfig } from '@cuevo/config';

dotenv({ path: '.env.local', quiet: true });
const local = parseServerConfig(process.env);
const enabled = Boolean(local.databaseUrl && local.supabaseUrl && new URL(local.supabaseUrl).hostname === '127.0.0.1');
if (process.env.CUEVO_REQUIRE_INTEGRATION === '1' && !enabled) throw Error('Cuevo local integration configuration required');
const school = '10000000-0000-4000-8000-000000000001';
const teacherId = '20000000-0000-4000-8000-000000000004';
const parentId = '20000000-0000-4000-8000-000000000072';

describe.skipIf(!enabled)('native rubric actual Auth API database journey', () => {
  let app: NestFastifyApplication; let db: Database; let admin: Pool;
  const tokens: Record<string, string> = {};
  beforeAll(async () => {
    const password = (JSON.parse(readFileSync('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
    const actors = (JSON.parse(readFileSync('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
    for (const [name, suffix] of Object.entries({ teacher: '004', student: '012', parent: '072', peer: '013', otherTeacher: '005', foreign: '133' })) {
      const person = actors.find(item => item.actorId.endsWith(suffix))!;
      const auth = createClient(local.supabaseUrl!, local.supabasePublishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await auth.auth.signInWithPassword({ email: person.email, password });
      if (!result.data.session) throw Error('Synthetic sign in unavailable'); tokens[name] = result.data.session.access_token;
    }
    db = new Database(local.databaseUrl);
    const identity = new IdentityService({
      verifyUser: createUserVerifier(local),
      currentMemberships: actor => db.actorTransaction(actor, undefined, async client => (await client.query<MembershipRow>('select *from "authorization".current_memberships()')).rows),
      isCurrentSession: (actor, session) => db.actorTransaction(actor, undefined, async client => Boolean((await client.query('select "authorization".is_current_session($1)as active', [session])).rows[0]?.active)),
    });
    const academic = createAcademicController(identity, db); const learning = createSchoolLearningController(identity, db);
    @Module({ controllers: [academic, learning] }) class TestModule {}
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter({ logger: false }), { logger: false });
    await app.init(); await app.getHttpAdapter().getInstance().ready();
    const url = new URL(local.databaseUrl!); if (url.port !== '56322' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Not Cuevo local');
    url.username = 'postgres'; url.password = 'postgres'; admin = new Pool({ connectionString: url.toString() });
  }, 30000);
  afterAll(async () => { await app?.close(); await db?.close(); await admin?.end(); });
  const request = (role: string, url: string, body?: Record<string, unknown>, key = randomUUID()) => app.inject({ method: body === undefined ? 'GET' : 'POST', url, headers: { authorization: `Bearer ${tokens[role]}`, 'x-school-id': school, 'idempotency-key': key }, payload: body });
  const command = async (role: string, url: string, body: Record<string, unknown>, key = randomUUID()) => {
    const result = await request(role, url, body, key); expect(result.statusCode, result.body).toBe(200); return result.json();
  };
  const currentResults = async (role: string, submissionId: string) => {
    const matches: Record<string, unknown>[] = []; let cursor: string | null = null;
    do {
      const response = await request(role, `/v1/results?limit=100${cursor ? `&cursor=${cursor}` : ''}`); expect(response.statusCode, response.body).toBe(200);
      const page = response.json() as { items: Record<string, unknown>[]; nextCursor: string | null };
      matches.push(...page.items.filter(item => item.submissionId === submissionId)); cursor = page.nextCursor;
    } while (cursor);
    return matches;
  };

  it('releases complete criterion levels with immutable correction and explicit parent access', async () => {
    const course = await command('teacher', '/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title: `Rubric ${randomUUID()}`, description: 'Synthetic teacher-authored rubric case.' });
    await command('teacher', `/v1/courses/${course.id}/publish`, {});
    const criteria = [
      { key: 'explanation', title: 'Explanation', levels: [{ key: 'developing', label: 'Developing', description: 'Explain one step.' }, { key: 'secure', label: 'Secure', description: 'Explain connected steps.' }] },
      { key: 'checking', title: 'Checking', levels: [{ key: 'not-demonstrated', label: 'Not demonstrated', description: 'Checking not shown.' }, { key: 'demonstrated', label: 'Demonstrated', description: 'Show checking.' }] },
    ];
    const definition = { courseId: course.id, title: 'School explanation rubric', version: 'school-1', criteria };
    const rubricKey = randomUUID(); const rubric = await command('teacher', '/v1/rubrics', definition, rubricKey);
    expect((await request('teacher', '/v1/rubrics', definition, rubricKey)).json()).toEqual(rubric);
    expect((await request('teacher', '/v1/rubrics', { ...definition, version: 'different' }, rubricKey)).statusCode).toBe(409);
    expect((await request('otherTeacher', '/v1/rubrics', definition)).statusCode).toBe(403);
    expect((await request('parent', `/v1/rubrics/${rubric.id}`)).statusCode).toBe(403);
    const assessment = await command('teacher', '/v1/assessments', { courseId: course.id, title: 'Explain and check', instructions: 'Use teacher-authored task instructions.', maxScore: 10 });
    const configured = await command('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: rubric.id, expectedPolicyVersion: 1 });
    expect(configured).toMatchObject({ model: 'rubric', rubricId: rubric.id, policyVersion: 2 }); expect(configured).not.toHaveProperty('maxScore');
    await command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 2 });
    const submission = await command('student', `/v1/assessments/${assessment.id}/submissions`, { content: 'Immutable synthetic explanation.' });
    const context = { feedback: 'Teacher reviewed the submitted evidence.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true };
    const choices = [{ criterionKey: 'explanation', levelKey: 'developing' }, { criterionKey: 'checking', levelKey: 'not-demonstrated' }];
    const markBody = { ...context, nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: choices } };
    expect((await request('teacher', `/v1/submissions/${submission.id}/results`, { ...context, score: 0 })).statusCode).toBe(409);
    expect((await request('teacher', `/v1/submissions/${submission.id}/results`, { ...markBody, nativeResult: { ...markBody.nativeResult, criteria: [choices[0]] } })).statusCode).toBe(409);
    expect((await request('teacher', `/v1/submissions/${submission.id}/results`, { ...markBody, nativeResult: { ...markBody.nativeResult, criteria: [choices[0], { criterionKey: 'checking', levelKey: 'invented' }] } })).statusCode).toBe(409);
    const mark = await command('teacher', `/v1/submissions/${submission.id}/results`, markBody);
    expect(mark).toMatchObject({ model: 'rubric', status: 'REVIEW', nativeResult: { type: 'rubric', rubricVersion: 'school-1', normalized: null, criteria: [{ criterionKey: 'explanation', levelLabel: 'Developing' }, { criterionKey: 'checking', levelLabel: 'Not demonstrated' }] } });
    expect(mark).not.toHaveProperty('score'); expect((await request('student', '/v1/marking')).statusCode).toBe(403);
    expect((await request('teacher', `/v1/assessments/${assessment.id}/rubric`, { rubricId: rubric.id, expectedPolicyVersion: 3 })).statusCode).toBe(409);
    const releaseKey = randomUUID(); const release = await command('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1 }, releaseKey);
    expect(release.nativeResult).toEqual(mark.nativeResult); expect(release).not.toHaveProperty('score'); expect(release).not.toHaveProperty('maxScore');
    expect((await request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1 }, releaseKey)).json()).toEqual(release);
    expect((await request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1 })).json()).toEqual(release);
    expect((await request('parent', `/v1/evidence/${release.evidenceId}`)).statusCode).toBe(404);
    expect((await request('peer', `/v1/evidence/${release.evidenceId}`)).statusCode).toBe(404);
    const evidence = await request('student', `/v1/evidence/${release.evidenceId}`); expect(evidence.statusCode).toBe(200);
    expect(evidence.json()).toMatchObject({ model: 'rubric', sourceObjectId: submission.id, resultId: release.id }); expect(evidence.body).not.toContain('Immutable synthetic explanation');
    const correction = await command('teacher', `/v1/submissions/${submission.id}/results`, { ...markBody, expectedRevision: 1, feedback: 'Correction after human review.', nativeResult: { ...markBody.nativeResult, criteria: [{ criterionKey: 'explanation', levelKey: 'secure' }, { criterionKey: 'checking', levelKey: 'demonstrated' }] } });
    const corrected = await command('teacher', `/v1/results/${correction.id}/release`, { expectedRevision: 2, parentVisible: true });
    const parentRows = await currentResults('parent', submission.id);
    expect(parentRows).toHaveLength(1); expect(parentRows[0].nativeResult).toMatchObject({ criteria: [{ levelKey: 'secure' }, { levelKey: 'demonstrated' }] }); expect(parentRows[0]).not.toHaveProperty('score');
    expect((await request('student', `/v1/evidence/${release.evidenceId}`)).json().revision).toBe(1);
    const counts = (await admin.query('select(select count(*)from app.rubric_result_revisions where submission_id=$1)as results,(select count(*)from app.rubric_evidence where source_object_id=$1)as evidence,(select count(*)from internal.outbox_events where type=\'rubric.result.released\'and entity_id=$2)as events', [submission.id, release.id])).rows[0];
    expect(counts).toEqual({ results: '2', evidence: '2', events: '1' });
    try { await admin.query("update app.teacher_assignments set status='revoked'where school_id=$1 and teacher_actor_id=$2", [school, teacherId]); expect((await request('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1 }, releaseKey)).statusCode).toBe(403); }
    finally { await admin.query("update app.teacher_assignments set status='active'where school_id=$1 and teacher_actor_id=$2", [school, teacherId]); }
    try { await admin.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2", [school, parentId]); expect((await request('parent', `/v1/evidence/${corrected.evidenceId}`)).statusCode).toBe(404); }
    finally { await admin.query("update app.parent_relationships set status='active'where school_id=$1 and parent_actor_id=$2", [school, parentId]); }
  }, 30000);

  it('describes native numeric and rubric result alternatives in OpenAPI', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(document.paths['/v1/rubrics']?.post?.requestBody).toMatchObject({ required: true, content: { 'application/json': { schema: { additionalProperties: false } } } });
    expect(document.paths['/v1/results/{id}/release']?.post?.responses['200']).toMatchObject({ content: { 'application/json': { schema: { oneOf: expect.any(Array) } } } });
  });
});
