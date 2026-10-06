import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { type ActorContext } from '@cuevo/domain';
import { Database } from '../../apps/api/src/platform/database/database';
import { IdentityService, type MembershipRow } from '../../apps/api/src/platform/identity/identity.service';
import { createUserVerifier } from '../../apps/api/src/platform/identity/supabase-auth';
import { SchoolLearningService } from '../../apps/api/src/modules/school-learning/learning.service';
import { AcademicService } from '../../apps/api/src/modules/academic/academic.service';
import { PortfolioService } from '../../apps/api/src/modules/portfolio/portfolio.service';
import { CommunityService } from '../../apps/api/src/modules/community/community.service';
import { OutboxProcessor } from '../../apps/worker/src/jobs/outbox/processor';
import { loadLockedPack } from '../../apps/api/src/modules/curriculum/packs';
import { assertCuevoLocalConfig, type LocalStatus } from '../configure-local';
import { referenceManifest, requireReferenceWorkerTarget, requireReferenceProgress } from '../runtime/reference-drain-rules';
import { requirePilotTarget, requirePilotAdmission, requirePilotCounts, pilotSchool, pilotClass, pilotCourse, pilotLearner, pilotCounts } from './browser-pilot-volume-rules';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.local/customer-readiness/browser-pilot-volume');
const prefix = 'Browser pilot volume';
function receipt(value: unknown): Record<string, unknown> & { id: string } {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw Error('Confirmed source command receipt required.');
  return value as Record<string, unknown> & { id: string };
}
function refused(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === 'ECONNREFUSED') return true;
  return 'errors' in error && Array.isArray(error.errors) && error.errors.length > 0 && error.errors.every(refused) || 'cause' in error && refused(error.cause);
}
async function stopped() {
  for (const port of [3000, 4000, 4001]) {
    try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000) }); }
    catch (error) { if (refused(error)) continue; throw Error('Pilot volume requires confirmed stopped application ports.'); }
    throw Error('Pilot volume refuses active application processes.');
  }
}
const ids = (kind: number, count: number) => Array.from({ length: count }, (_, index) => `980${kind}0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
export async function prepareBrowserPilotVolume() {
  await readFile(resolve(root, 'supabase/config.toml'), 'utf8').then(assertCuevoLocalConfig);
  const status = JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
  requirePilotTarget(status, process.env); await stopped();
  const config = parseServerConfig(process.env, 'api');
  if (!config.databaseUrl || !config.supabaseUrl || !config.supabasePublishableKey) throw Error('Local API configuration is required.');
  const sourceBytes = await readFile(resolve(root, 'supabase/seed/identities.json'));
  const originalIdentity = JSON.parse(sourceBytes.toString()) as { actors: { actorId: string; schoolId: string; displayName: string; role: string }[] };
  const source = referenceManifest(originalIdentity);
  const owner = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  const database = new Database(config.databaseUrl);
  const worker = new Pool({ connectionString: requireReferenceWorkerTarget(process.env.WORKER_DATABASE_URL), max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  const started = performance.now(); const runId = randomUUID(); const phases: { name: string; durationMs: number; completed: boolean }[] = [];
  let admitted = false; let ready = false; let failurePhase: string | null = null; let failureCode: string | null = null; const records: { kind: string; id: string }[] = []; const createdAssessments: string[] = []; let roomId = ''; let lastPortfolioId = ''; let processed = 0; let originalRows: string | undefined;
  const bounded = <T>(run: () => Promise<T>): Promise<T> => { if (performance.now() - started > 480000) throw Error('Pilot setup scheduling budget ended; restore required.'); return run(); };
  const phase = async (name: string, run: () => Promise<void>) => { const begin = performance.now(); let completed = false; try { await bounded(run); completed = true; } catch (error) { failurePhase = name; throw error; } finally { phases.push({ name, durationMs: Math.round(performance.now() - begin), completed }); } };
  try {
    await owner.query('BEGIN READ ONLY');
    const admission = (await owner.query(`select
      not exists(select 1 from app.people person full join jsonb_to_recordset($2::jsonb)as actor("actorId"uuid,"schoolId"uuid)on person.actor_id=actor."actorId"and person.school_id=actor."schoolId"where person.actor_id is null or actor."actorId"is null or person.synthetic is distinct from true)as "exactPopulation",
      (select count(*)::integer from app.people)as "originalPeople",(select count(*)::integer from app.memberships where school_id=$1 and role='student')as "originalStudents",(select count(*)::integer from app.classes where school_id=$1)as "originalClasses",
      (select count(*)::integer from auth.users where id=any($3::uuid[]))as "originalAuth",school.name as "schoolName",school.country_code as "countryCode",school.status='active'as active,
      (select count(*)::integer from internal.outbox_events where state='PENDING')as "queuePending",(select count(*)::integer from internal.outbox_events where state='PROCESSING')as "queueProcessing",(select count(*)::integer from internal.outbox_events where state='FAILED')as "queueFailed",
      exists(select 1 from internal.worker_dispatch_control where singleton and not enabled and state='DISABLED'and endpoint is null and vault_secret_name is null and wake_id is null and network_request_id is null)as "dispatchDisabled",internal.worker_transport_private()as "transportPrivate",
      (select count(*)::integer from app.assessments where school_id=$1 and title like 'Browser pilot volume%')as "existingPilotSources"
      from app.schools school where school.id=$1`, [pilotSchool, JSON.stringify(source.actors), source.actors.map(actor => actor.actorId)])).rows[0];
    requirePilotAdmission(admission); await owner.query('COMMIT'); await stopped(); admitted = true;
    const originalProjection = async () => JSON.stringify((await owner.query('select p.school_id,p.actor_id,p.display_name,p.synthetic,m.role,m.status,m.effective_from,m.effective_to from app.people p join app.memberships m on m.school_id=p.school_id and m.actor_id=p.actor_id where p.actor_id=any($1::uuid[])order by p.school_id,p.actor_id', [source.actors.map(actor => actor.actorId)])).rows);
    originalRows = await originalProjection();
    const original = JSON.parse(originalRows) as { actor_id: string; school_id: string; display_name: string; role: string; status: string; synthetic: boolean }[];
    if (original.length !== 133 || original.some(row => !originalIdentity.actors.some(actor => actor.actorId === row.actor_id && actor.schoolId === row.school_id && actor.displayName === row.display_name && actor.role === row.role) || !row.synthetic || row.status !== 'active')) throw Error('Original synthetic names, roles and current membership must match the manifest.');
    const pack = await loadLockedPack(resolve(root, 'supabase/seed/curriculum'), 'synthetic-primary-v1');
    if (pack.pack.programme !== 'Synthetic primary explanation' || pack.assessment.numeric.maxScore !== 10) throw Error('Locked synthetic source changed; review required.');
    const reference = (await owner.query('select academic_reference_id from app.programme_course_contexts where school_id=$1 and course_id=$2', [pilotSchool, pilotCourse])).rows[0]?.academic_reference_id as string;
    if (!reference) throw Error('Current approved course objective is unavailable.');
    await phase('population-500-students-30-classes', async () => {
      const learners = ids(1, 440); const classes = ids(2, 24);
      await owner.query('BEGIN');
      try {
        await owner.query("insert into app.classes(school_id,id,academic_year_id,year_group_id,name)select $1,id,'40000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',$3||' class '||ordinal from unnest($2::uuid[])with ordinality as source(id,ordinal)", [pilotSchool, classes, prefix]);
        await owner.query("insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)select $1,id,'43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',now()-interval'1 day'from unnest($2::uuid[])id", [pilotSchool, classes]);
        await owner.query("insert into app.memberships(school_id,actor_id,role,effective_from)select $1,id,'student',now()-interval'1 day'from unnest($2::uuid[])id", [pilotSchool, learners]);
        await owner.query("insert into app.people(school_id,actor_id,display_name,synthetic)select $1,id,$3||' learner '||ordinal,true from unnest($2::uuid[])with ordinality as source(id,ordinal)", [pilotSchool, learners, prefix]);
        const allClasses = [pilotClass, ...classes];
        await owner.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)select $1,($3::uuid[])[case when ordinal<=60 then 1 else ((ordinal-61)%24+2)::integer end],id,now()-interval'1 day'from unnest($2::uuid[])with ordinality as source(id,ordinal)", [pilotSchool, learners, allClasses]);
        await owner.query('COMMIT'); records.push(...learners.map(id => ({ kind: 'IMPORTED_PERSON', id })), ...classes.map(id => ({ kind: 'IMPORTED_CLASS', id })));
      } catch (error) { await owner.query('ROLLBACK'); throw error; }
    });
    const identity = new IdentityService({ verifyUser: createUserVerifier(config), currentMemberships: userId => database.actorTransaction(userId, undefined, async client => (await client.query<MembershipRow>('select *from "authorization".current_memberships()')).rows), isCurrentSession: (userId, sessionId) => database.actorTransaction(userId, undefined, async client => Boolean((await client.query('select "authorization".is_current_session($1)as active', [sessionId])).rows[0]?.active)) });
    const accounts = JSON.parse(await readFile(resolve(root, '.local/synthetic-accounts.json'), 'utf8')) as { role: string; email: string; password: string }[];
    const actors: Partial<Record<'teacher' | 'student', ActorContext>> = {};
    for (const role of ['teacher', 'student'] as const) {
      const account = accounts.find(account => account.role === role)!; const auth = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await auth.auth.signInWithPassword({ email: account.email, password: account.password }); if (!result.data.session) throw Error('Current synthetic Auth session required.');
      actors[role] = await identity.resolve(`Bearer ${result.data.session.access_token}`, pilotSchool);
    }
    const teacher = actors.teacher!; const student = actors.student!; if (student.userId !== pilotLearner) throw Error('Expected source learner required.');
    const learning = new SchoolLearningService(database); const academic = new AcademicService(database); const portfolio = new PortfolioService(database); const community = new CommunityService(database);
    await phase('101-native-assessments-releases-and-portfolio-selections', async () => {
      for (let index = 1; index <= pilotCounts.assessments; index++) {
        const title = `${prefix} assessment ${String(index).padStart(3, '0')}`;
        const assessment = receipt(await bounded(() => learning.command(teacher, 'assessment.create', undefined, { courseId: pilotCourse, title, instructions: 'Synthetic imported test source; explain a checking step.', maxScore: 10 }, `${runId}:assessment:${index}`, 'browser-volume-setup')));
        createdAssessments.push(String(assessment.id)); records.push({ kind: 'ASSESSMENT', id: String(assessment.id) });
        await bounded(() => academic.command(teacher, 'assessment.reference', String(assessment.id), { referenceId: reference, expectedPolicyVersion: 1 }, `${runId}:reference:${index}`, 'browser-volume-setup'));
        const submission = receipt(await bounded(() => learning.command(student, 'submission.create', String(assessment.id), { content: 'Synthetic explanation imported for browser pilot volume.' }, `${runId}:submission:${index}`, 'browser-volume-setup')));
        const mark = receipt(await bounded(() => academic.command(teacher, 'marking.create', String(submission.id), { score: index % 11, feedback: 'Synthetic operator reviewed fixture native evidence.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true }, `${runId}:mark:${index}`, 'browser-volume-setup')));
        const result = receipt(await bounded(() => academic.command(teacher, 'result.release', String(mark.id), { expectedRevision: 1, parentVisible: true }, `${runId}:release:${index}`, 'browser-volume-setup')));
        const item = await bounded(() => portfolio.command(student, 'create', undefined, { evidenceId: result.evidenceId, sourceModel: 'numeric', title: `${prefix} selected work ${String(index).padStart(3, '0')}`, reflection: 'Synthetic source-selected reflection for performance testing.' }, `${runId}:portfolio:${index}`, 'browser-volume-setup')) as { id: string };
        await bounded(() => portfolio.command(teacher, 'review', item.id, { expectedRevision: 1, feedback: 'Synthetic operator approval for parent performance readback; not customer acceptance.', featured: false, parentVisible: true, confirmParentApproval: true, confirmSourceReview: true }, `${runId}:review:${index}`, 'browser-volume-setup'));
        records.push({ kind: 'RESULT', id: String(result.id) }, { kind: 'PORTFOLIO', id: item.id }); lastPortfolioId = item.id;
      }
    });
    await phase('1000-imported-community-sources-and-notifications', async () => {
      const room = await community.command(teacher, 'room.create', undefined, { classId: pilotClass, name: `${prefix} discussion`, type: 'CLASS', memberIds: [] }, `${runId}:room`, 'browser-volume-setup') as { id: string }; roomId = room.id; records.push({ kind: 'ROOM', id: room.id });
      await owner.query('BEGIN');
      try {
        const messages = ids(3, 1000); const announcements = ids(4, 1000);
        await owner.query("insert into app.community_posts(school_id,id,room_id,actor_id,body,created_at)select $1,id,$3,'20000000-0000-4000-8000-000000000004',$4||' historical message '||ordinal,clock_timestamp()-make_interval(secs=>ordinal::integer)from unnest($2::uuid[])with ordinality as source(id,ordinal)", [pilotSchool, messages, roomId, prefix]);
        await owner.query("insert into app.community_announcements(school_id,id,class_id,title,body,parent_visible,actor_id)select $1,id,$3,$4||' notice '||ordinal,'Synthetic operator-approved imported notice for current families.',true,'20000000-0000-4000-8000-000000000004'from unnest($2::uuid[])with ordinality as source(id,ordinal)", [pilotSchool, announcements, pilotClass, prefix]);
        await owner.query("select set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true),set_config('app.school_id',$1,true)", [pilotSchool]);
        await owner.query("select internal.append_audit('reference.browser-volume.import','reference_fixture',$1,$2,'succeeded',jsonb_build_object('synthetic',true,'messages',1000,'announcements',1000))", [roomId, runId]);
        // Existing worker admission requires an audit for each exact source/actor.
        await owner.query("select internal.append_audit('community.post.create','community',id,$2,'succeeded',jsonb_build_object('syntheticFixtureImport',true))from unnest($1::uuid[])id", [messages, runId]);
        await owner.query("select internal.append_audit('community.announcement.create','community',id,$2,'succeeded',jsonb_build_object('syntheticFixtureImport',true))from unnest($1::uuid[])id", [announcements, runId]);
        await owner.query("select internal.enqueue_event('community.post_created','community',id,1,jsonb_build_object('roomId',$2::uuid),'browser-volume:'||id::text)from unnest($1::uuid[])id", [messages, roomId]);
        await owner.query("select internal.enqueue_event('community.changed','community',id,1,jsonb_build_object('roomId',null),'browser-volume:'||id::text)from unnest($1::uuid[])id", [announcements]);
        await owner.query('COMMIT'); records.push(...messages.map(id => ({ kind: 'IMPORTED_POST', id })), ...announcements.map(id => ({ kind: 'IMPORTED_NOTICE', id })));
      } catch (error) { await owner.query('ROLLBACK'); throw error; }
    });
    await phase('restricted-worker-source-drain', async () => {
      const processor = new OutboxProcessor(worker); const deadline = performance.now() + 300000;
      for (let pass = 0; pass < 400; pass++) {
        const counts = (await owner.query("select count(*)filter(where state='PENDING')::integer pending,count(*)filter(where state in('FAILED','PROCESSING'))::integer unresolved from internal.outbox_events where school_id=$1 and state<>'COMPLETED'", [pilotSchool])).rows[0];
        if (counts.unresolved !== 0) throw Error('Pilot source queue contains failed or owned work.');
        if (counts.pending === 0) return;
        if (deadline - performance.now() < 15000 || performance.now() - started > 465000) throw Error('Pilot source drain deadline ended; restore required.');
        processed += requireReferenceProgress(await processor.process({ maxEvents: 10, deadline: performance.now() + 20000, now: () => performance.now() }));
      }
      throw Error('Pilot source drain limit reached.');
    });
    const actual = (await owner.query("select(select count(*)::integer from app.memberships where school_id=$1 and role='student')students,(select count(*)::integer from app.classes where school_id=$1)classes,(select count(*)::integer from app.assessments where school_id=$1 and id=any($2::uuid[]))assessments,(select count(*)::integer from app.portfolio_items where school_id=$1 and learner_id=$3 and id=any($4::uuid[]))portfolios,(select count(*)::integer from app.community_posts where school_id=$1 and room_id=$5)messages,(select count(*)::integer from app.community_announcements where school_id=$1 and id=any($6::uuid[]))announcements", [pilotSchool, createdAssessments, pilotLearner, records.filter(row => row.kind === 'PORTFOLIO').map(row => row.id), roomId, ids(4, 1000)])).rows[0];
    requirePilotCounts(actual);
    if (await originalProjection() !== originalRows) throw Error('Original source accounts changed during pilot setup; restore required.');
    const totals = (await owner.query('select(select count(*)::integer from app.assessments where school_id=$1)as "schoolAssessments",(select count(*)::integer from app.result_revisions where school_id=$1 and learner_id=$2)as "learnerNativeResults",(select count(*)::integer from app.portfolio_items where school_id=$1 and learner_id=$2)as "learnerPortfolioItems"', [pilotSchool, pilotLearner])).rows[0];
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'scope.json'), JSON.stringify({ schemaVersion: 1, status: 'READY', runId, schoolId: pilotSchool, classId: pilotClass, learnerId: pilotLearner, courseId: pilotCourse, roomId, lastPortfolioId, actual, totals, originalAuthAccounts: 133, originalAccountsPreserved: true, originalIdentitySha256: createHash('sha256').update(sourceBytes).digest('hex'), newAuthAccounts: 0, setupMode: 'EXPLICIT_LOCAL_SYNTHETIC_OPERATOR_HISTORY', records, phases, processed, sourceHash: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'), restore: 'REQUIRED_ROOT_GUARDED_REFERENCE_BOOTSTRAP' }, null, 2) + '\n');
    ready = true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    failureCode = /^[0-9A-Z]{5}$/.test(code) ? code : 'SETUP_REQUIRES_REVIEW';
    failurePhase ??= admitted ? 'source-readiness' : 'admission';
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([database.close(), worker.end(), owner.end()]);
    if (cleanup.some(result => result.status === 'rejected')) ready = false;
    if (!ready) { await mkdir(directory, { recursive: true }); await writeFile(resolve(directory, 'scope.json'), JSON.stringify({ schemaVersion: 1, status: 'FAILED', runId, createdRecordCount: records.length, restoreRequired: admitted }) + '\n'); }
    const queue = await (async () => {
      const inspection = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000, options: '-c default_transaction_read_only=on' });
      try { return (await inspection.query("select count(*)filter(where state='PENDING')::integer pending,count(*)filter(where state='PROCESSING')::integer processing,count(*)filter(where state='FAILED')::integer failed from internal.outbox_events where school_id=$1 and state<>'COMPLETED'", [pilotSchool])).rows[0]; }
      catch { return null; } finally { await inspection.end(); }
    })();
    await mkdir(directory, { recursive: true }); await writeFile(resolve(directory, 'setup.json'), JSON.stringify({ schemaVersion: 1, status: ready ? 'READY' : 'FAILED', runId, admitted, failurePhase, failureCode, queue, elapsedMs: Math.round(performance.now() - started), planned: pilotCounts, createdRecordCount: records.length, phases, processed, newAuthAccounts: 0, customerAcceptance: false, restoreRequired: admitted }, null, 2) + '\n');
  }
  console.log('Committed synthetic browser pilot volume prepared; guarded restoration remains required.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.loadEnvFile(resolve(root, '.env.local'));
  try { await prepareBrowserPilotVolume(); } catch { console.error('Browser pilot volume setup requires review and guarded restoration; details withheld.'); process.exitCode = 1; }
}
