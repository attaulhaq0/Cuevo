import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient } from '@supabase/supabase-js';
import { expect } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import { Database } from '../../src/platform/database/database';
import { IdentityService, type MembershipRow } from '../../src/platform/identity/identity.service';
import { createUserVerifier } from '../../src/platform/identity/supabase-auth';
import { createSchoolLearningController } from '../../src/modules/school-learning/learning.controller';
import { createLearningResourceController } from '../../src/modules/school-learning/resource.controller';
import { createSubmissionAssetController } from '../../src/modules/school-learning/submission-asset.controller';
import { createPortfolioArtifactController } from '../../src/modules/portfolio/portfolio-artifact.controller';
import{createAssetStorage,type AssetStoragePort}from'../../src/modules/assets/public';
import { createAcademicController } from '../../src/modules/academic/academic.controller';
import { createLearnerStateController } from '../../src/modules/learner-state/learner-state.controller';
import { createAttentionController } from '../../src/modules/learner-state/attention.controller';
import { createImprovementController } from '../../src/modules/improvement/improvement.controller';
import { createIntelligenceService } from '../../src/modules/improvement/intelligence.service';
import { createCurriculumController } from '../../src/modules/curriculum/curriculum.controller';
import { createCommunityController } from '../../src/modules/community/community.controller';
import { createParentConversationController } from '../../src/modules/community/conversation.controller';
import { createCommunityMaintenanceController } from '../../src/modules/community/maintenance.controller';
import { createCommunityMentionController } from '../../src/modules/community/mentions.controller';
import{createLearnerGoalController}from'../../src/modules/development/learner-goal.controller';
import { createLearningContentController } from '../../src/modules/school-learning/content.controller';
import { createPortfolioController } from '../../src/modules/portfolio/portfolio.controller';
import { createPortfolioOrganizationController } from '../../src/modules/portfolio/organization.controller';
import { createDevelopmentController } from '../../src/modules/development/development.controller';
import { createAssetController } from '../../src/modules/assets/assets.controller';
import { createSchoolController } from '../../src/modules/school/school.controller';
import{createSchoolSupportController}from'../../src/modules/school/support.controller';
import{createLearnerProfileController}from'../../src/modules/school/profile.controller';
import{createRestrictedRecordsController}from'../../src/modules/restricted-records/restricted-records.controller';
import{createSchoolAutomationController}from'../../src/modules/school/automation.controller';
import { createBrowserDiagnosticsController } from '../../src/platform/telemetry/browser-diagnostics.controller';
import { withFixtureCleanup } from './fixture-cleanup';

export type JsonRow = Record<string, unknown> & { id: string };
export const customerActor = (index: number) => `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export const customerRoles = { admin: 1, coordinator: 2, teacher: 4, otherTeacher: 5, parent: 72,
  strong: 12, observed: 13, decline: 14, missing: 15, incomplete: 16, improved: 17, unchanged: 18,
  inconclusive: 19, disengaged: 20, newcomer: 21, transferred: 22, partial: 23 } as const;
export type CustomerRole = keyof typeof customerRoles;

/** Real Auth and production controllers/SQL with a private rollback tenant, not mocked domain receipts. */
export async function createCustomerContext(options: { committed?: boolean; liveIntelligence?: boolean;portfolioStorage?:(storage:AssetStoragePort)=>AssetStoragePort } = {}) {
  const config = parseServerConfig({ ...process.env, ...(options.liveIntelligence ? {
    NODE_ENV: 'test', AI_GENERATION_MODE: 'LIVE', AI_FIXTURE_ENABLED: 'false', AI_PROVIDER: 'azure-foundry', AI_MODEL: 'gpt-6.1-sol',
    AI_BASE_URL: 'https://edeviser-sweden-resource.services.ai.azure.com/openai/v1', AI_DATA_POLICY_STATUS: 'SYNTHETIC_ONLY',
    AI_INPUT_COST_PER_MILLION: undefined, AI_OUTPUT_COST_PER_MILLION: undefined, AI_TIMEOUT_MS: '30000', AI_MAX_OUTPUT_TOKENS: '1800', AI_MAX_COST: '1', AI_GLOBAL_DAILY_BUDGET: '2',
  } : { AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' }) });
  if (!config.databaseUrl || !config.supabaseUrl || !config.supabasePublishableKey) throw Error('Configured synthetic Cuevo required.');
  const url = new URL(config.databaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '56322' || !['127.0.0.1', 'localhost'].includes(new URL(config.supabaseUrl).hostname)) throw Error('Customer fixtures require guarded local Cuevo.');
  url.username = 'postgres'; url.password = 'postgres'; const owner = new Pool({ connectionString: url.toString(), max: 1 });
  const school = randomUUID(); const classId = randomUUID(); const secondClassId = randomUUID();
  const subject = randomUUID(); const year = randomUUID(); const group = randomUUID();
  let acquiredClient: PoolClient | undefined;
  let app: NestFastifyApplication | undefined; let runtimeDatabase: Database | undefined;
  try {
  const client = await owner.connect(); acquiredClient = client;
  const password = (JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
  const identities = (JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
  const tokens: Partial<Record<CustomerRole, string>> = {};
  for (const [role, actorNumber] of Object.entries(customerRoles)) {
    const actor = identities.find(item => item.actorId === customerActor(actorNumber)); if (!actor) throw Error('Verified synthetic identity missing.');
    const auth = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await auth.auth.signInWithPassword({ email: actor.email, password });
    if (!result.data.session) throw Error('Synthetic customer sign-in unavailable.'); tokens[role as CustomerRole] = result.data.session.access_token;
  }
  await client.query('BEGIN');
  await client.query("insert into app.schools(id,name,country_code)values($1,'Customer acceptance synthetic school','QA')", [school]);
  for (const [role, actorNumber] of Object.entries(customerRoles)) {
    const assignedRole = ['admin', 'coordinator', 'teacher', 'parent'].includes(role) ? role : role === 'otherTeacher' ? 'teacher' : 'student';
    await client.query("insert into app.memberships(school_id,actor_id,role,effective_from)values($1,$2,$3,now()-interval '1 day')", [school, customerActor(actorNumber), assignedRole]);
    await client.query("insert into app.people(school_id,actor_id,display_name,synthetic)values($1,$2,$3,true)", [school, customerActor(actorNumber), ['strong', 'observed'].includes(role) ? 'Same name — اسم مكرر' : `Synthetic ${role} — تعلّم`]);
  }
  for (const code of ['school.context', 'school.operations', 'learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'community', 'portfolio']) await client.query("insert into app.entitlements(school_id,code,enabled,effective_from)values($1,$2,true,now()-interval '1 day')", [school, code]);
  await client.query("insert into app.academic_years(school_id,id,name,starts_on,ends_on)values($1,$2,'Synthetic year','2026-01-01','2027-12-31')", [school, year]);
  await client.query("insert into app.year_groups(school_id,id,name,ordinal)values($1,$2,'Synthetic group',1)", [school, group]);
  for (const id of [classId, secondClassId]) await client.query("insert into app.classes(school_id,id,academic_year_id,year_group_id,name)values($1,$2,$3,$4,'Duplicate class — صف')", [school, id, year, group]);
  await client.query("insert into app.subjects(school_id,id,name)values($1,$2,'School Custom synthetic subject')", [school, subject]);
  for (const id of [classId, secondClassId]) await client.query("insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)values($1,$2,$3,$4,now()-interval '1 day')", [school, id, subject, customerActor(4)]);
  for (const [role, actorNumber] of Object.entries(customerRoles).filter(([, value]) => value >= 12 && value < 72)) {
    await client.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values($1,$2,$3,now()-interval '1 day')", [school, classId, customerActor(actorNumber)]);
    if (role !== 'newcomer') await client.query("insert into app.parent_relationships(school_id,parent_actor_id,student_actor_id,relationship_type,effective_from)values($1,$2,$3,'parent',now()-interval '1 day')", [school, customerActor(72), customerActor(actorNumber)]);
  }
  await client.query('insert into app.learner_state_policies(school_id,development_window_days,version,approved_by)values($1,14,1,$2)', [school, customerActor(1)]);
  await client.query('insert into app.intelligence_policies(school_id,version,fixture_enabled,approved_by)values($1,1,true,$2)', [school, customerActor(1)]);
  const rollbackDatabase = { actorTransaction: async <T>(actor: string, selectedSchool: string | undefined, run: (connection: PoolClient) => Promise<T>) => {
    await client.query('SAVEPOINT customer_request'); await client.query('set local role cuevo_api');
    try { await client.query("set local statement_timeout='5s'"); await client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [actor, selectedSchool ?? '']); const result = await run(client); await client.query('reset role'); await client.query("set local statement_timeout='0'"); await client.query('RELEASE SAVEPOINT customer_request'); return result; }
    catch (error) { await client.query('ROLLBACK TO SAVEPOINT customer_request'); await client.query('reset role'); await client.query('RELEASE SAVEPOINT customer_request'); throw error; }
  } } as unknown as Database;
  if (options.committed) await client.query('COMMIT');
  const database = options.committed ? new Database(config.databaseUrl) : rollbackDatabase;
  runtimeDatabase = options.committed ? database : undefined;
  const identity = new IdentityService({ verifyUser: createUserVerifier(config), currentMemberships: actor => database.actorTransaction(actor, undefined, async connection => (await connection.query<MembershipRow>('select *from "authorization".current_memberships()')).rows), isCurrentSession: (actor, session) => database.actorTransaction(actor, undefined, async connection => Boolean((await connection.query('select "authorization".is_current_session($1)active', [session])).rows[0]?.active)) });
  const controllers = [createBrowserDiagnosticsController(identity,database),createSchoolController(identity, database),createSchoolSupportController(identity,database),createLearnerProfileController(identity,database),createRestrictedRecordsController(identity,database),createSchoolAutomationController(identity,database), createSchoolLearningController(identity, database), createAcademicController(identity, database), createLearnerStateController(identity, database), createAttentionController(identity, database), createImprovementController(identity, database, createIntelligenceService(identity, database, config)), createCurriculumController(identity, database), createCommunityController(identity, database),createParentConversationController(identity,database),createCommunityMaintenanceController(identity,database),createCommunityMentionController(identity,database),createLearnerGoalController(identity,database),createLearningContentController(identity,database), createPortfolioController(identity, database),createPortfolioOrganizationController(identity,database), createDevelopmentController(identity, database), createAssetController(identity, database, { url: config.supabaseUrl, secret: config.storageSecret }), createLearningResourceController(identity, database, { url: config.supabaseUrl, secret: config.storageSecret }),createSubmissionAssetController(identity,database,{url:config.supabaseUrl,secret:config.storageSecret}),createPortfolioArtifactController(identity,database,{url:config.supabaseUrl,secret:config.storageSecret},options.portfolioStorage?options.portfolioStorage(createAssetStorage({url:config.supabaseUrl,secret:config.storageSecret})!):undefined)];
  @Module({ controllers }) class CustomerTestModule {}
  app = await NestFactory.create<NestFastifyApplication>(CustomerTestModule, new FastifyAdapter({ logger: false, bodyLimit: 1024 * 1024 }), { logger: false });
  await app.init(); await app.getHttpAdapter().getInstance().ready();
  const readyApp = app;
  const request = (role: CustomerRole, path: string, body?: Record<string, unknown>, key: string = randomUUID()) => readyApp.inject({ method: body === undefined ? 'GET' : 'POST', url: path, headers: { authorization: `Bearer ${tokens[role]}`, 'x-school-id': school, 'idempotency-key': key }, payload: body });
  const command = async (role: CustomerRole, path: string, body: Record<string, unknown>, key?: string): Promise<JsonRow> => { const response = await request(role, path, body, key); expect(response.statusCode, `HTTP ${response.statusCode} ${path}`).toBe(200); return response.json() as JsonRow; };
  const drain = async () => {
    if (options.committed) await client.query('BEGIN');
    try {
    if ((await client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and state<>'COMPLETED' and internal.outbox_event_owner(type) is distinct from 'WORKER'", [school])).rows[0]?.count !== 0) throw Error('Customer fixture cannot acknowledge unresolved account effects through the general worker.');
    for (let pass = 0; pass < 30; pass++) {
      const events = (await client.query("select id from internal.outbox_events where school_id=$1 and state='PENDING' and internal.outbox_event_owner(type)='WORKER' order by occurred_at,id limit 100", [school])).rows;
      if (!events.length) { if (options.committed) await client.query('COMMIT'); return; }
      for (const event of events) {
        const lease = randomUUID(); await client.query("update internal.outbox_events set state='PROCESSING',lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds',attempt_count=attempt_count+1 where school_id=$1 and id=$3", [school, lease, event.id]);
        await client.query('SAVEPOINT customer_worker'); await client.query('set local role cuevo_worker');
        try { await client.query("set local statement_timeout='5s'"); await client.query('select internal.process_learner_event($1,$2)', [event.id, lease]); await client.query('reset role'); await client.query("set local statement_timeout='0'"); await client.query('RELEASE SAVEPOINT customer_worker'); }
        catch (error) { await client.query('ROLLBACK TO SAVEPOINT customer_worker'); await client.query('reset role'); await client.query('RELEASE SAVEPOINT customer_worker'); throw error; }
      }
    }
    throw Error('Synthetic customer source queue did not drain within its bound.');
    } catch (error) { if (options.committed) await client.query('ROLLBACK'); throw error; }
  };
  const reference = await command('teacher', '/v1/academic-references', { title: 'Synthetic explanation objective', description: 'School-defined explanation only; no official curriculum mapping.', version: 'customer-school-v1' });
  await command('coordinator', `/v1/academic-references/${reference.id}/approve`, {});
  await command('admin', '/v1/attention-policies', { minimumDecline: 3, maxScore: 10, missingDueCount: 2, windowDays: 14, expectedVersion: 0, confirmApproval: true });
  return { app, client, owner, school, classId, secondClassId, subject, year, group, referenceId: reference.id, request, command, drain,
    close: () => withFixtureCleanup(() => readyApp.close(), [
      () => runtimeDatabase?.close(),
      () => client.query('ROLLBACK'),
      async () => { if (options.committed) await cleanupCustomerTenant(client, school); },
      () => client.release(),
      () => owner.end(),
    ]),
    fingerprint: (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex') };
  } catch (error) {
    return withFixtureCleanup(async () => { throw error; }, [
      () => app?.close(),
      () => runtimeDatabase?.close(),
      () => acquiredClient?.query('ROLLBACK'),
      async () => { if (options.committed && acquiredClient && (await acquiredClient.query('select id from app.schools where id=$1', [school])).rows.length) await cleanupCustomerTenant(acquiredClient, school); },
      () => acquiredClient?.release(),
      () => owner.end(),
    ]);
  }
}
export type CustomerContext = Awaited<ReturnType<typeof createCustomerContext>>;

export async function cleanupCustomerTenant(client: PoolClient, school: string) {
  await client.query('BEGIN');
  try {
    const guarded = (await client.query("select name from app.schools where id=$1 and name='Customer acceptance synthetic school'and not exists(select 1 from app.people where school_id=$1 and synthetic is distinct from true)", [school])).rows;
    if (guarded.length !== 1) throw Error('Customer cleanup refuses a non-fixture tenant.');
    const events = (await client.query('select id from internal.outbox_events where school_id=$1', [school])).rows.map(item => item.id as string);
    await client.query("set local session_replication_role='replica'");
    for (const table of ['community_broadcast_receipts', 'analytics_delivery', 'posthog_delivery']) await client.query(`delete from internal.${table} where event_id=any($1::uuid[])`, [events]);
    const tables = (await client.query("select c.table_schema,c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema in('app','internal')and c.column_name='school_id'and t.table_type='BASE TABLE'order by c.table_schema,c.table_name")).rows;
    for (const table of tables) {
      if (!/^[a-z_]+$/.test(table.table_schema) || !/^[a-z_]+$/.test(table.table_name)) throw Error('Unexpected authored cleanup identifier.');
      await client.query(`delete from "${table.table_schema}"."${table.table_name}"where school_id=$1`, [school]);
    }
    await client.query('delete from app.schools where id=$1', [school]);
    for (const table of tables) { const result = await client.query(`select count(*)::integer count from "${table.table_schema}"."${table.table_name}"where school_id=$1`, [school]); if (result.rows[0]?.count !== 0) throw Error('Customer tenant cleanup incomplete.'); }
    if ((await client.query('select count(*)::integer count from app.schools where id=$1', [school])).rows[0]?.count !== 0) throw Error('Customer school cleanup incomplete.');
    await client.query("set local session_replication_role='origin'"); await client.query('COMMIT');
  } catch (error) { return withFixtureCleanup(async () => { throw error; }, [() => client.query('ROLLBACK')]); }
}

export async function customerCourse(context: CustomerContext, title: string, classId = context.classId) {
  const course = await context.command('teacher', '/v1/courses', { classId, subjectId: context.subject, title, description: 'Independent longitudinal synthetic fixture.' });
  const unit = await context.command('teacher', `/v1/courses/${course.id}/units`, { title: 'School plan', sequence: 1 });
  const lesson = await context.command('teacher', `/v1/units/${unit.id}/lessons`, { title: 'School explanation', sequence: 1, body: 'Use the school-authored example; explain and check.' });
  const practice = await context.command('teacher', `/v1/lessons/${lesson.id}/activities`, { title: 'Teacher practice', kind: 'practice', instructions: 'Explain one step, then check it.', sequence: 1 });
  await context.command('teacher', `/v1/courses/${course.id}/publish`, {});
  return { courseId: course.id, lessonId: lesson.id, practiceId: practice.id };
}
export async function customerAssessment(context: CustomerContext, courseId: string, title: string, dueAt?: string, referenceId = context.referenceId) {
  const assessment = await context.command('teacher', '/v1/assessments', { courseId, title, instructions: 'Explain the school-authored example.', maxScore: 10, ...(dueAt ? { dueAt } : {}) });
  await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId, expectedPolicyVersion: 1 }); return assessment.id;
}
export async function customerReleased(context: CustomerContext, role: CustomerRole, courseId: string, title: string, score: number, referenceId = context.referenceId) {
  const assessmentId = await customerAssessment(context, courseId, title, undefined, referenceId);
  const submission = await context.command(role, `/v1/assessments/${assessmentId}/submissions`, { content: 'Synthetic source explanation.' });
  const marking = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { score, feedback: 'Teacher-reviewed native evidence.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
  const result = await context.command('teacher', `/v1/results/${marking.id}/release`, { expectedRevision: 1, parentVisible: true });
  return { assessmentId, submissionId: submission.id, markingId: marking.id, resultId: result.id, evidenceId: String(result.evidenceId) };
}

export async function customerProgramme(context: CustomerContext, courseId: string, classId: string, learnerId: string, name: string) {
  const identity = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pack = await context.command('admin', '/v1/curriculum/versions', { packId: identity, kind: 'school_custom', framework: 'School Custom', programme: name, version: `${identity}-v1`, scope: 'Synthetic technical acceptance only', sourceStatus: 'VERIFIED', rightsStatus: 'PERMITTED', sourceLocation: 'repo:synthetic-customer-acceptance', sourceChecksum: null, synthetic: true, reason: 'School-defined test context; no official curriculum claims.' });
  const reference = await context.command('admin', '/v1/curriculum/references', { packVersionId: pack.id, parentId: null, type: 'objective', title: `${name} objective`, description: 'Teacher explanation in the synthetic programme.', code: null, sequence: 1, subjectId: context.subject, yearGroupId: context.group });
  for(const[state,expectedRevision]of [['APPROVED',1],['ACTIVE',2]]as const)await context.command('admin',`/v1/curriculum/versions/${pack.id}/lifecycle`,{state,expectedRevision,reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,replacementVersionId:null,reason:'Explicit synthetic school source review for this fixture.',confirmTransition:true});
  const programme = await context.command('admin', '/v1/curriculum/programmes', { packVersionId: pack.id, name, classId, subjectId: context.subject, yearGroupId: context.group, confirmConfiguration: true });
  const linked = await context.command('admin', `/v1/curriculum/courses/${courseId}`, { programmeId: programme.id, referenceId: reference.id, expectedVersion: 1, confirmConfiguration: true });
  await context.command('admin', '/v1/curriculum/learners', { programmeId: programme.id, learnerId, status: 'active', confirmAccessChange: true });
  expect(linked.academicReferenceId).toEqual(expect.any(String)); return { programmeId: programme.id, referenceId: String(linked.academicReferenceId) };
}

