import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { COGNITIVE_PROCESSES, idempotencyKeySchema, learningContentSchema, thinkingFocusDraftInputSchema, thinkingFocusMaterialManifestSchema, thinkingFocusResponseSchema, thinkingFocusReviewInputSchema, thinkingFocusSchema, thinkingFocusTargetSchema, type ThinkingFocusResponse, type ThinkingFocusTarget } from '@cuevo/contracts';
import { validateThinkingFocus } from '../apps/api/src/modules/curriculum/public';

const authorId = '20000000-0000-4000-8000-000000000004';
const reviewerId = '20000000-0000-4000-8000-000000000002';
const learnerId = '20000000-0000-4000-8000-000000000012';
const schoolId = '10000000-0000-4000-8000-000000000001';
const expectedRoles = [{ actorId: authorId, schoolId, role: 'teacher' }, { actorId: reviewerId, schoolId, role: 'coordinator' }, { actorId: learnerId, schoolId, role: 'student' }];
const courseId = '96010000-0000-4000-8000-000000000001';
const unitId = '96020000-0000-4000-8000-000000000001';
const lessonId = '96030000-0000-4000-8000-000000000060';
const fixtureSha256 = '4dd307d9002ca1a557939f03cab6618d724d083627154ad83e886b2a5b132221';
const bilingual = (max: number) => z.object({ en: z.string().trim().min(1).max(max), ar: z.string().trim().min(1).max(max).regex(/[\u0600-\u06ff]/) }).strict();
const taskSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/), title: bilingual(90), instructions: bilingual(2000), focus: thinkingFocusSchema, rationale: z.string().trim().min(1).max(2000), reviewReason: z.string().trim().min(1).max(2000) }).strict();
const fixtureSchema = z.object({ schemaVersion: z.literal('1'), version: z.literal('checking-v1'), synthetic: z.literal(true), interpretation: z.literal('TASK_DEMAND_NOT_LEARNER_LEVEL'), authorship: z.literal('CUEVO_SYNTHETIC_SCHOOL_AUTHORED'), lesson: z.object({ title: bilingual(90), body: bilingual(4000) }).strict(), tasks: z.array(taskSchema).length(6) }).strict().superRefine((fixture, context) => {
  if (new Set(fixture.tasks.map(task => task.key)).size !== fixture.tasks.length || new Set(fixture.tasks.map(task => task.focus.primaryProcess)).size !== COGNITIVE_PROCESSES.length) context.addIssue({ code: 'custom', message: 'Distinct exact synthetic task demands required.' });
});
type Fixture = z.infer<typeof fixtureSchema>;
type ReviewTask = Pick<z.infer<typeof taskSchema>, 'focus' | 'rationale' | 'reviewReason'>;
type SeedOwner = {
  asActor: <T>(actor: number, run: () => Promise<T>) => Promise<T>;
  create: (key: string, action: string, run: () => Promise<{ id: string; value: string }>) => Promise<string>;
  requireExact: (actual: Record<string, unknown> | undefined, expected: Record<string, unknown>) => void;
};

export function parseThinkingSeedFixture(value: unknown): Fixture { return fixtureSchema.parse(value); }
export function requireThinkingSeedRoles(value: unknown) {
  const actors = z.array(z.object({ actorId: z.uuid(), schoolId: z.uuid(), role: z.string() }).strict()).length(3).parse(value);
  if (new Set(actors.map(actor => actor.actorId)).size !== 3 || expectedRoles.some(expected => !actors.some(actor => isDeepStrictEqual(actor, expected)))) throw Error('Thinking seed requires the declared teacher, coordinator and learner roles.');
  return actors;
}
export function parseThinkingSeedManifest(value: unknown) {
  const manifest = z.object({ synthetic: z.literal(true), schoolId: z.literal(schoolId), denialSchoolId: z.literal('10000000-0000-4000-8000-000000000002'), actors: z.array(z.object({ actorId: z.uuid(), schoolId: z.uuid(), role: z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']) }).passthrough()).length(133) }).passthrough().parse(value);
  if (new Set(manifest.actors.map(actor => actor.actorId)).size !== 133) throw Error('Thinking seed requires distinct synthetic manifest identities.');
  requireThinkingSeedRoles(manifest.actors.filter(actor => expectedRoles.some(expected => expected.actorId === actor.actorId)).map(({ actorId, schoolId, role }) => ({ actorId, schoolId, role })));
  return manifest;
}
export async function loadThinkingSeedFixture(): Promise<Fixture> {
  const bytes = await readFile(new URL('../supabase/seed/thinking-focus-checking-v1.json', import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== fixtureSha256) throw Error('Reviewed thinking seed artifact changed; a new explicit fixture version requires review.');
  const fixture = parseThinkingSeedFixture(JSON.parse(bytes.toString('utf8')));
  for (const task of fixture.tasks) validateThinkingFocus(task.focus);
  return fixture;
}
export function validateThinkingSeedTarget(value: string): URL {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '56322' || url.pathname !== '/postgres' || url.search || url.hash) throw Error('Thinking seed requires the guarded standard synthetic Cuevo target.');
  return url;
}
export function thinkingSeedCommand(fixtureDigest: string, taskKey: string, command: 'draft' | 'review', rawTarget: ThinkingFocusTarget, body: Record<string, unknown>) {
  if (!/^[a-f0-9]{64}$/.test(fixtureDigest) || !/^[a-z][a-z0-9-]{1,60}$/.test(taskKey)) throw Error('Versioned exact thinking seed identity required.');
  const target = thinkingFocusTargetSchema.parse(rawTarget);
  const input = command === 'draft' ? thinkingFocusDraftInputSchema.parse(body) : thinkingFocusReviewInputSchema.parse(body);
  return { key: idempotencyKeySchema.parse(`reference-thinking-checking-v1:${taskKey}:${command}`), fingerprint: createHash('sha256').update(JSON.stringify({ fixtureDigest, command, target, input })).digest('hex') };
}
export function requireThinkingSeedReceipt(raw: unknown, original: unknown, task: ReviewTask, status: 'AWAITING_REVIEW' | 'APPROVED'): ThinkingFocusResponse {
  const value = thinkingFocusResponseSchema.parse(raw), source = thinkingFocusResponseSchema.parse(original), classification = value.classification;
  if (!value.id || value.id !== classification?.id || value.status !== status || value.courseId !== source.courseId || !isDeepStrictEqual(value.target, source.target) || value.targetTitle !== source.targetTitle || value.sourceVersion !== source.sourceVersion || !isDeepStrictEqual(value.source, source.source) || !classification || !isDeepStrictEqual(classification.focus, task.focus) || classification.rationale !== task.rationale || classification.authorId !== authorId || value.revision !== (status === 'AWAITING_REVIEW' ? 1 : 2) || (status === 'APPROVED' ? classification.reviewerId !== reviewerId || classification.reviewReason !== task.reviewReason : classification.reviewerId !== null)) throw Error('Exact original thinking task/reviewer receipt unconfirmed.');
  return value;
}
export function requireThinkingSeedContent(raw: unknown, resource: 'lesson' | 'activity', id: string, title: string, content: string) {
  const value = learningContentSchema.parse(raw);
  if (value.resource !== resource || value.sourceId !== id || value.courseId !== courseId || value.title !== title || value.content !== content || value.state !== 'PUBLISHED' || value.revision !== 1 || value.publishedRevision !== 1 || value.draftRevision !== 1 || value.assessmentId !== null || value.kind !== (resource === 'activity' ? 'practice' : null)) throw Error('Original thinking seed content changed; new fixture review required.');
  return value;
}
const bilingualText = (text: { en: string; ar: string }) => `${text.en}\n\n${text.ar}`;

/** Called inside the existing reference seed transaction. No connection, reset,
 * role grant, grade, completion or reward mechanism is created here. */
export async function seedReviewedThinkingTasks(client: PoolClient, targetUrl: string, owner: SeedOwner) {
  validateThinkingSeedTarget(targetUrl);
  const fixture = await loadThinkingSeedFixture();
  const manifest = parseThinkingSeedManifest(JSON.parse(await readFile(new URL('../supabase/seed/identities.json', import.meta.url), 'utf8')));
  const admission = await owner.asActor(4, async () => (await client.query(`select
    current_database()as database,inet_server_port()as port,
    (select count(*)::integer from app.people)as people,
    not exists(select 1 from app.people person full join jsonb_to_recordset($1::jsonb)as expected("actorId"uuid,"schoolId"uuid)on person.school_id=expected."schoolId"and person.actor_id=expected."actorId"where person.actor_id is null or expected."actorId"is null or person.synthetic is distinct from true)as "populationMatches",
    (select count(*)=3 from app.memberships where school_id="authorization".school_id()and actor_id=any($2::uuid[])and status='active'and effective_from<=clock_timestamp()and(effective_to is null or effective_to>clock_timestamp()))as "currentActors",
    coalesce((select jsonb_agg(jsonb_build_object('actorId',actor_id,'schoolId',school_id,'role',role))from app.memberships where school_id="authorization".school_id()and actor_id=any($2::uuid[])and status='active'and effective_from<=clock_timestamp()and(effective_to is null or effective_to>clock_timestamp())),'[]'::jsonb)as "currentRoles",
    exists(select 1 from app.courses course join app.units unit on unit.school_id=course.school_id and unit.course_id=course.id where course.school_id="authorization".school_id()and course.id=$3 and unit.id=$4 and course.created_by=$5 and course.class_id='30000000-0000-4000-8000-000000000001'and course.subject_id='43000000-0000-4000-8000-000000000001'and course.status='PUBLISHED'and "authorization".can_manage_course(course.school_id,course.id))as "originalCourse"`, [JSON.stringify(manifest.actors), [authorId, reviewerId, learnerId], courseId, unitId, authorId])).rows[0]);
  if (admission?.database !== 'postgres' || admission.port !== 5432 || admission.people !== 133 || admission.populationMatches !== true || admission.currentActors !== true || admission.originalCourse !== true) throw Error('Thinking seed requires the intact synthetic reference and current course.');
  requireThinkingSeedRoles(admission.currentRoles);
  const title = `${fixture.lesson.title.en} · ${fixture.lesson.title.ar}`, body = bilingualText(fixture.lesson.body);
  await owner.create(`reference-thinking-${fixture.version}-${fixtureSha256}:lesson`, 'thinking-lesson', async () => {
    await client.query('insert into app.lessons(school_id,id,unit_id,title,sequence,body)values("authorization".school_id(),$1,$2,$3,2,$4)', [lessonId, unitId, title, body]);
    return { id: lessonId, value: lessonId };
  });
  const lesson = (await client.query('select id,unit_id as "unitId",title,sequence,body from app.lessons where school_id="authorization".school_id()and id=$1 for share', [lessonId])).rows[0];
  owner.requireExact(lesson, { id: lessonId, unitId, title, sequence: 2, body });
  requireThinkingSeedContent(await owner.asActor(4, async () => (await client.query('select internal.learning_content_view(\'lesson\',$1)as response', [lessonId])).rows[0]?.response), 'lesson', lessonId, title, body);
  const results: { taskId: string; classificationId: string; process: string }[] = [];
  for (const [index, task] of fixture.tasks.entries()) {
    const taskId = `96060000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
    const taskTitle = `${task.title.en} · ${task.title.ar}`, instructions = bilingualText(task.instructions);
    await owner.create(`reference-thinking-${fixture.version}-${fixtureSha256}:${task.key}:activity`, 'thinking-activity', async () => {
      await client.query('insert into app.activities(school_id,id,lesson_id,title,kind,instructions,sequence)values("authorization".school_id(),$1,$2,$3,\'practice\',$4,$5)', [taskId, lessonId, taskTitle, instructions, index + 1]);
      return { id: taskId, value: taskId };
    });
    const stored = (await client.query('select id,lesson_id as "lessonId",title,kind,instructions,sequence from app.activities where school_id="authorization".school_id()and id=$1 for share', [taskId])).rows[0];
    owner.requireExact(stored, { id: taskId, lessonId, title: taskTitle, kind: 'practice', instructions, sequence: index + 1 });
    requireThinkingSeedContent(await owner.asActor(4, async () => (await client.query('select internal.learning_content_view(\'activity\',$1)as response', [taskId])).rows[0]?.response), 'activity', taskId, taskTitle, instructions);
    const target: ThinkingFocusTarget = { kind: 'ACTIVITY', id: taskId, criterionKey: null };
    const read = () => client.query('select internal.read_thinking_focus(\'activity\',$1,null)as response', [taskId]).then(result => thinkingFocusResponseSchema.parse(result.rows[0]?.response));
    const source = await owner.asActor(4, read);
    if (source.courseId !== courseId || !isDeepStrictEqual(source.target, target) || source.source.title !== taskTitle || source.source.instructions !== instructions || source.source.contentRevision !== 1 || !source.canAuthor || !['UNCLASSIFIED', 'APPROVED'].includes(source.status)) throw Error('Original synthetic thinking task source changed; review required.');
    const draftInput = thinkingFocusDraftInputSchema.parse({ expectedRevision: 0, expectedSourceVersion: source.sourceVersion, focus: task.focus, rationale: task.rationale });
    const draftIdentity = thinkingSeedCommand(fixtureSha256, task.key, 'draft', target, draftInput);
    const execute = async (command: 'draft' | 'review', input: Record<string, unknown>, identity: { key: string; fingerprint: string }) => (await client.query('select internal.thinking_focus_command($1,\'activity\',$2,null,$3::jsonb,$4,$5,$4)as response', [command, taskId, JSON.stringify(input), identity.key, identity.fingerprint])).rows[0]?.response;
    const draft = requireThinkingSeedReceipt(await owner.asActor(4, () => execute('draft', draftInput, draftIdentity)), source, task, 'AWAITING_REVIEW');
    const reviewInput = thinkingFocusReviewInputSchema.parse({ expectedRevision: draft.revision, expectedSourceVersion: source.sourceVersion, decision: 'APPROVE', reason: task.reviewReason, confirmReview: true });
    const reviewIdentity = thinkingSeedCommand(fixtureSha256, task.key, 'review', target, reviewInput);
    const approved = await owner.asActor(2, async () => {
      const current = await read();
      if (current.sourceVersion !== source.sourceVersion || current.courseId !== courseId || !isDeepStrictEqual(current.source, source.source)) throw Error('Independent review source changed.');
      const material = thinkingFocusMaterialManifestSchema.parse((await client.query('select internal.read_thinking_focus_materials(\'activity\',$1,null,$2)as response', [taskId, source.sourceVersion])).rows[0]?.response);
      if (!isDeepStrictEqual(material.target, target) || material.courseId !== courseId || material.sourceVersion !== source.sourceVersion || material.items.length !== 0) throw Error('Synthetic inline task acquired unreviewed material.');
      return requireThinkingSeedReceipt(await execute('review', reviewInput, reviewIdentity), source, task, 'APPROVED');
    });
    const visible = await owner.asActor(12, read);
    if (visible.status !== 'APPROVED' || visible.classification?.id !== approved.id || !isDeepStrictEqual(visible.classification?.focus, task.focus) || visible.sourceVersion !== source.sourceVersion || visible.canAuthor || visible.canReview) throw Error('Exact reviewed task is unavailable in the synthetic learner course.');
    results.push({ taskId, classificationId: approved.id!, process: task.focus.primaryProcess });
  }
  return { version: fixture.version, sha256: fixtureSha256, lessonId, tasks: results };
}
