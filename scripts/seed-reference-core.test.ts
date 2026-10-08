import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import * as scenarios from './seed-reference-scenarios';
import * as thinking from './seed-thinking-focus';
import { loadLockedPack } from '../apps/api/src/modules/curriculum/packs';
import type { ThinkingFocusResponse } from '@cuevo/contracts';

type ScenarioCore = (client: PoolClient) => Promise<unknown>;
type ThinkingOwner = Parameters<typeof thinking.seedReviewedThinkingTasks>[2];
type ThinkingCore = (client: PoolClient, owner: ThinkingOwner) => Promise<unknown>;
const scenarioCore = (scenarios as unknown as { seedReferenceScenarioTransaction: ScenarioCore }).seedReferenceScenarioTransaction;
const thinkingCore = (thinking as unknown as { seedReviewedThinkingTasksTransaction: ThinkingCore }).seedReviewedThinkingTasksTransaction;
const admission = { database: 'postgres', port: 5432, sessionUser: 'postgres', readOnly: false, people: 133, synthetic: true, populationMatches: true, currentActors: true, knownActiveSchools: 2 };
const actor = (number: number) => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const school = '10000000-0000-4000-8000-000000000001';

test('canonical source transaction cores are exported without constructing a Pool', () => {
  assert.equal(typeof scenarioCore, 'function');
  assert.equal(typeof thinkingCore, 'function');
});

test('standard standalone seed validators still refuse 574, 584, hosted and query overrides', () => {
  for (const url of ['postgresql://postgres:fixture@127.0.0.1:57422/postgres', 'postgresql://postgres:fixture@127.0.0.1:58422/postgres', 'postgresql://postgres:fixture@remote.invalid:56322/postgres', 'postgresql://postgres:fixture@127.0.0.1:56322/other', 'postgresql://postgres:fixture@127.0.0.1:56322/postgres?host=remote.invalid']) {
    assert.throws(() => scenarios.validateFixtureDatabase(url));
    assert.throws(() => thinking.validateThinkingSeedTarget(url));
  }
});

test('reference core refuses unknown current source scope before any fixture mutation and rolls back', async () => {
  assert.equal(typeof scenarioCore, 'function');
  for (const changed of [{ database: 'other' }, { port: 5433 }, { sessionUser: 'cuevo_api' }, { readOnly: true }, { people: 132 }, { synthetic: false }, { populationMatches: false }, { currentActors: false }, { knownActiveSchools: 1 }]) {
    const queries: string[] = [];
    const client = { query: async (sql: string) => { queries.push(sql); return { rows: [{ ...admission, ...changed }] }; } } as unknown as PoolClient;
    await assert.rejects(() => scenarioCore(client));
    assert.equal(queries[0], 'BEGIN');
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.equal(queries.some(sql => /insert into|internal.begin_command|internal.configure_curriculum/i.test(sql)), false);
    assert.equal(queries.includes('COMMIT'), false);
  }
});

test('original reference completion receipt returns under its transaction without replaying source mutations', async () => {
 const queries:string[]=[];let observedFingerprint='';
 const client={query:async(sql:string)=>{queries.push(sql);if(sql.includes('populationMatches'))return{rows:[admission]};return{rows:[]};}} as unknown as PoolClient;
 const original={status:'SYNTHETIC_REFERENCE_READY' as const,scenarios:Object.keys(scenarios.scenarioLearners),results:[],thinkingFocus:{status:'SOURCE_LOCKED_EXISTING_REFERENCE'}};
 const result=await scenarios.seedReferenceScenarioTransaction(client,{read:async(sourceBundleFingerprint)=>{observedFingerprint=sourceBundleFingerprint;return original as unknown as Awaited<ReturnType<typeof scenarios.seedReferenceScenarioTransaction>>;},complete:async()=>{throw Error('Completed original must not write another receipt');}});
 assert.deepEqual(result,original);assert.match(observedFingerprint,/^[a-f0-9]{64}$/);assert.equal(queries[0],'BEGIN');assert.equal(queries.at(-1),'COMMIT');assert.equal(queries.some(sql=>/insert into|internal.begin_command|internal.configure_curriculum/i.test(sql)),false);
});

test('unknown original reference receipt rolls back before any new domain source effect', async () => {
 const queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);if(sql.includes('populationMatches'))return{rows:[admission]};return{rows:[]};}} as unknown as PoolClient;
 await assert.rejects(scenarios.seedReferenceScenarioTransaction(client,{read:async()=>{throw Error('Original completion unavailable');},complete:async()=>{throw Error('No completion permitted');}}));
 assert.equal(queries.at(-1),'ROLLBACK');assert.equal(queries.includes('COMMIT'),false);assert.equal(queries.some(sql=>/insert into|internal.begin_command|internal.configure_curriculum/i.test(sql)),false);
});

test('reference transaction re-admits after the awaited original receipt read before its first mutation',async()=>{
 const queries:string[]=[];let current=true,admissions=0;
 const client={query:async(sql:string)=>{queries.push(sql);if(sql.includes('populationMatches'))return{rows:[admission]};return{rows:[]};}} as unknown as PoolClient;
 await assert.rejects(scenarios.seedReferenceScenarioTransaction(client,{read:async()=>{await Promise.resolve();current=false;return null;},beforeWrite:()=>{admissions++;if(!current)throw Error('Original execution authority expired during receipt read');},complete:async()=>{throw Error('No receipt permitted');}}),/authority expired/);
 assert.equal(admissions,1);assert.equal(queries.at(-1),'ROLLBACK');assert.equal(queries.some(sql=>/internal.configure_curriculum|internal.begin_command|insert into|set_config\('app.actor_id'/i.test(sql)),false);
});

function firstCoursePort(reservationState: 'NEW' | 'COMPLETED', failure: Error) {
  const queries: { sql: string; args: unknown[] }[] = [];
  const versions = new Map<string, Record<string, unknown>>();
  let serial = 0;
  const client = { query: async (sql: string, args: unknown[] = []) => {
    queries.push({ sql, args });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.startsWith('select set_config')) return { rows: [] };
    if (sql.includes('populationMatches')) return { rows: [admission] };
    if (sql.startsWith('select internal.configure_curriculum')) {
      if (args[0] !== 'version.create') throw failure;
      const id = `97000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
      versions.set(id, { ...JSON.parse(String(args[2])), id, createdBy: actor(1) });
      return { rows: [{ receipt: { id } }] };
    }
    if (sql.startsWith('select id,pack_id')) return { rows: [versions.get(String(args[1]))] };
    if (sql.startsWith('select internal.begin_command')) return { rows: [{ reservation: reservationState === 'NEW' ? { state: 'NEW' } : { state: 'COMPLETED', response: { value: '96010000-0000-4000-8000-000000000001' } } }] };
    if (sql.startsWith('insert into app.courses') || sql.startsWith('select fingerprint,state,response')) throw failure;
    throw Error('Unexpected controlled reference query');
  } } as unknown as PoolClient;
  return { client, queries };
}

test('reference transaction retains exact original first course data/key/fingerprint and rolls back the original source failure', async () => {
  assert.equal(typeof scenarioCore, 'function');
  const failure = Error('Controlled first source write failed');
  const { client, queries } = firstCoursePort('NEW', failure);
  await assert.rejects(() => scenarioCore(client), error => error === failure);
  const write = queries.find(query => query.sql.startsWith('insert into app.courses'));
  assert.deepEqual(write?.args, [school, '96010000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', actor(4), 'Synthetic primary explanation', 'Locked synthetic programme fixture']);
  const bundles = await Promise.all(['synthetic-primary-v1', 'synthetic-pathway-v1'].map(directory => loadLockedPack('supabase/seed/curriculum', directory)));
  const sourceFingerprint = createHash('sha256').update(JSON.stringify({ bundles: bundles.map(bundle => bundle.manifest), scores: scenarios.referenceScenarioScores, learners: scenarios.scenarioLearners })).digest('hex');
  const expected = createHash('sha256').update(sourceFingerprint + ':course:reference-course-0').digest('hex');
  assert.deepEqual(queries.find(query => query.sql.startsWith('select internal.begin_command'))?.args, ['reference-course-0', 'reference.course', expected]);
  assert.equal(queries.at(-1)?.sql, 'ROLLBACK');
  assert.equal(queries.some(query => query.sql === 'COMMIT' || query.sql.startsWith('select internal.finish_command')), false);
});

test('reference transaction reuses the original completed course command without inserting a replacement', async () => {
  assert.equal(typeof scenarioCore, 'function');
  const failure = Error('Controlled next source inspection failed');
  const { client, queries } = firstCoursePort('COMPLETED', failure);
  await assert.rejects(() => scenarioCore(client), error => error === failure);
  assert.equal(queries.some(query => query.sql.startsWith('insert into app.courses')), false);
  assert.equal(queries.filter(query => query.sql.startsWith('select internal.begin_command')).length, 1);
  assert.equal(queries.at(-1)?.sql, 'ROLLBACK');
});

test('reference transaction preserves primary source error when rollback also fails', async () => {
  assert.equal(typeof scenarioCore, 'function');
  const primary = Error('Controlled source admission failed');
  const client = { query: async (sql: string) => { if (sql === 'BEGIN') return { rows: [] }; if (sql === 'ROLLBACK') throw Error('Controlled rollback failed'); throw primary; } } as unknown as PoolClient;
  await assert.rejects(() => scenarioCore(client), error => error === primary);
});

test('thinking core keeps current population/roles admission and performs no source write when scope is unknown', async () => {
  assert.equal(typeof thinkingCore, 'function');
  const writes: string[] = [];
  const client = { query: async (sql: string) => { if (/insert|update|delete/i.test(sql)) writes.push(sql); return { rows: [{ database: 'postgres', port: 5432, populationMatches: false, people: 133, currentActors: true, originalCourse: true }] }; } } as unknown as PoolClient;
  const owner: ThinkingOwner = { asActor: async (_actor, run) => run(), create: async (_key, _action, run) => (await run()).id, requireExact: () => undefined };
  await assert.rejects(() => thinkingCore(client, owner), /intact synthetic reference/);
  assert.deepEqual(writes, []);
});

function completeSourcePort() {
  const queries: { sql: string; args: unknown[] }[] = [], writes: { table: string; args: unknown[] }[] = [];
  const commands = new Map<string, { fingerprint: string; response: { id: string; value: unknown } }>();
  const versions = new Map<string, Record<string, unknown>>(), references = new Map<string, Record<string, unknown>>();
  const courses = new Map<string, unknown[]>(), lessons = new Map<string, Record<string, unknown>>(), tasks = new Map<string, Record<string, unknown>>();
  const submissions = new Map<string, string>(), marks = new Map<string, { assessmentId: string; score: unknown }>(), results = new Map<string, { assessmentId: string; score: unknown }>();
  const thinkingCommands = new Map<string, ThinkingFocusResponse>(), currentThinking = new Map<string, ThinkingFocusResponse>();
  const expectedActors = [{ actorId: actor(4), schoolId: school, role: 'teacher' }, { actorId: actor(2), schoolId: school, role: 'coordinator' }, { actorId: actor(12), schoolId: school, role: 'student' }];
  let actorNumber = 1, serial = 0;
  const id = () => `97000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
  const courseId = '96010000-0000-4000-8000-000000000001';
  const thinkingSource = (taskId: string): ThinkingFocusResponse => ({ schemaVersion: '1', target: { kind: 'ACTIVITY', id: taskId, criterionKey: null }, courseId, targetTitle: String(tasks.get(taskId)?.title), sourceVersion: 'a'.repeat(64), status: 'UNCLASSIFIED', revision: 0, classification: null, source: { title: String(tasks.get(taskId)?.title), instructions: String(tasks.get(taskId)?.instructions), contentRevision: 1, preparationVersion: null, policyVersion: null, rubricVersion: null, criterionTitle: null }, canAuthor: true, canReview: false });
  const client = { query: async (sql: string, args: unknown[] = []) => {
    queries.push({ sql, args });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.startsWith('select set_config')) { actorNumber = Number(String(args[0]).slice(-12)); return { rows: [] }; }
    if (sql.includes('populationMatches')) return { rows: [{ ...admission, currentRoles: expectedActors, originalCourse: true }] };
    if (sql.startsWith('select internal.begin_command')) {
      const [key, command, fingerprint] = args as string[], saved = commands.get(key + ':' + command);
      if (saved) { assert.equal(saved.fingerprint, fingerprint); return { rows: [{ reservation: { state: 'COMPLETED', response: saved.response } }] }; }
      return { rows: [{ reservation: { state: 'NEW' } }] };
    }
    if (sql.startsWith('select internal.finish_command')) { const [key, command, fingerprint, response] = args as string[]; commands.set(key + ':' + command, { fingerprint, response: JSON.parse(response) }); return { rows: [] }; }
    if (sql.startsWith('select internal.configure_curriculum')) {
      const [command, , raw, key, fingerprint] = args as string[], saved = commands.get(key + ':' + command);
      if (saved) { assert.equal(saved.fingerprint, fingerprint); return { rows: [{ receipt: saved.response }] }; }
      const body = JSON.parse(raw), createdId = id(), response = { id: createdId, value: createdId };
      commands.set(key + ':' + command, { fingerprint, response });
      if (command === 'version.create') versions.set(createdId, { ...body, id: createdId, createdBy: actor(1) });
      if (command === 'reference.create') { references.set(createdId, { ...body, id: createdId, createdBy: actor(1) }); commands.set(key + ':curriculum.reference.create', { fingerprint, response }); }
      return { rows: [{ receipt: response }] };
    }
    if (sql.startsWith('select id,pack_id')) return { rows: [versions.get(String(args[1]))] };
    if (sql.startsWith('select fingerprint,state,response')) { const saved = commands.get(String(args[2]) + ':' + String(args[3])); return { rows: saved ? [{ fingerprint: saved.fingerprint, state: 'COMPLETED', response: saved.response }] : [] }; }
    if (sql.startsWith('select id,pack_version_id')) return { rows: [references.get(String(args[1]))] };
    if (sql.startsWith('select id from app.curriculum_references')) return { rows: [...references.values()].filter(row => row.packVersionId === args[1]).map(row => ({ id: row.id })) };
    if (sql.startsWith('insert into app.')) {
      const table = sql.match(/^insert into app\.([a-z_]+)/)![1]; writes.push({ table, args });
      if (table === 'courses') courses.set(String(args[1]), args);
      if (table === 'lessons') { const isThinking = sql.includes('"authorization"'); lessons.set(String(args[isThinking ? 0 : 1]), { id: args[isThinking ? 0 : 1], unitId: args[isThinking ? 1 : 2], title: args[isThinking ? 2 : 3], sequence: isThinking ? 2 : 1, body: args[isThinking ? 3 : 4] }); }
      if (table === 'activities') { const isThinking = sql.includes('"authorization"'); tasks.set(String(args[isThinking ? 0 : 1]), { id: args[isThinking ? 0 : 1], lessonId: args[isThinking ? 1 : 2], title: args[isThinking ? 2 : 3], kind: isThinking ? 'practice' : args[4], instructions: args[isThinking ? 3 : 5], sequence: args[isThinking ? 4 : 6] }); }
      if (table === 'submissions') submissions.set(String(args[1]), String(args[2]));
      return { rows: [] };
    }
    if (sql.startsWith('select academic_reference_id')) return { rows: [{ academic_reference_id: '61000000-0000-4000-8000-000000000001' }] };
    if (sql.startsWith('select internal.mark_submission')) { const mark = id(); marks.set(mark, { assessmentId: submissions.get(String(args[0]))!, score: args[1] }); return { rows: [{ id: mark }] }; }
    if (sql.startsWith('select internal.release_marking')) { const result = id(); results.set(result, marks.get(String(args[0]))!); return { rows: [{ id: result }] }; }
    if (sql.startsWith('select assessment_id from app.result_revisions')) return { rows: [{ assessment_id: results.get(String(args[1]))?.assessmentId }] };
    if (sql.startsWith('select internal.create_rubric') || sql.startsWith('select internal.mark_rubric_submission') || sql.startsWith('select internal.release_rubric_marking') || sql.startsWith('select internal.create_recommendation') || sql.startsWith('select internal.measure_intervention')) return { rows: [{ id: id() }] };
    if (sql.startsWith('select id from app.interventions')) return { rows: [{ id: id() }] };
    if (sql.startsWith('select id,unit_id')) return { rows: [lessons.get(String(args[0]))] };
    if (sql.startsWith('select id,lesson_id')) return { rows: [tasks.get(String(args[0]))] };
    if (sql.startsWith('select internal.learning_content_view')) { const isLesson = sql.includes("'lesson'"), stored = isLesson ? lessons.get(String(args[0]))! : tasks.get(String(args[0]))!; return { rows: [{ response: { id: '97000000-0000-4000-8000-000000000999', courseId, resource: isLesson ? 'lesson' : 'activity', sourceId: args[0], revision: 1, title: stored.title, content: isLesson ? stored.body : stored.instructions, kind: isLesson ? null : 'practice', assessmentId: null, state: 'PUBLISHED', createdAt: '2026-10-05T07:00:00Z', publishedRevision: 1, draftRevision: 1 } }] }; }
    if (sql.startsWith('select internal.read_thinking_focus(')) { const value = currentThinking.get(String(args[0])) ?? thinkingSource(String(args[0])); return { rows: [{ response: { ...value, id: undefined, canAuthor: actorNumber === 4, canReview: actorNumber === 2 } }] }; }
    if (sql.startsWith('select internal.read_thinking_focus_materials')) return { rows: [{ response: { schemaVersion: '1', target: { kind: 'ACTIVITY', id: args[0], criterionKey: null }, courseId, sourceVersion: args[1], items: [] } }] };
    if (sql.startsWith('select internal.thinking_focus_command')) {
      const [command, taskId, raw, key] = args as string[], saved = thinkingCommands.get(key); if (saved) return { rows: [{ response: saved }] };
      assert.equal(actorNumber, command === 'draft' ? 4 : 2);
      const input = JSON.parse(raw), previous = currentThinking.get(taskId), classificationId = id();
      const classification = command === 'draft' ? { id: classificationId, revision: 1, focus: input.focus, rationale: input.rationale, authorId: actor(4), authoredAt: '2026-10-05T07:00:00Z', reviewerId: null, reviewedAt: null, reviewReason: null } : { ...previous!.classification!, id: classificationId, revision: 2, reviewerId: actor(2), reviewedAt: '2026-10-05T07:01:00Z', reviewReason: input.reason };
      const value: ThinkingFocusResponse = { ...thinkingSource(taskId), id: classificationId, status: command === 'draft' ? 'AWAITING_REVIEW' : 'APPROVED', revision: classification.revision, classification, canAuthor: actorNumber === 4, canReview: actorNumber === 2 };
      thinkingCommands.set(key, value); currentThinking.set(taskId, value); return { rows: [{ response: value }] };
    }
    if (/^select internal\.(append_audit|enqueue_event|transition_curriculum_lifecycle|accept_curriculum_behavior|configure_assessment_rubric|decide_recommendation|complete_intervention|link_reassessment|attention_policy_command|refresh_attention_command)\(/.test(sql)) return { rows: [] };
    throw Error('Unexpected controlled full fixture query');
  } } as unknown as PoolClient;
  return { client, queries, writes, commands, courses, tasks, results, thinkingCommands };
}

test('complete canonical reference core commits the same original A–G/native/thinking fixture and original-key replay adds no sources', async () => {
  const port = completeSourcePort(), first = await scenarioCore(port.client);
  assert.equal(port.queries[0].sql, 'BEGIN'); assert.equal(port.queries.at(-1)?.sql, 'COMMIT');
  assert.equal(port.courses.size, 2);
  assert.deepEqual(port.writes.filter(write => write.table === 'assessments').map(write => write.args[1]), [...Array.from({ length: 10 }, (_, index) => scenarios.fixtureId(4, index + 1)), scenarios.fixtureId(4, 50), scenarios.fixtureId(4, 11), scenarios.fixtureId(4, 12)]);
  assert.equal(port.writes.filter(write => write.table === 'assessments' && write.args[7] === '2026-09-30T00:00:00Z').length, 3);
  assert.deepEqual([...port.results.values()].map(result => result.score), [9, 2, 8, 3, 3, 3, 6, 7, 3]);
  assert.equal(port.tasks.size, 14); assert.equal(port.thinkingCommands.size, 12);
  const nativeRubric = port.queries.find(query => query.sql.startsWith('select internal.mark_rubric_submission'))!;
  const pack = await loadLockedPack('supabase/seed/curriculum', 'synthetic-pathway-v1');
  assert.deepEqual(JSON.parse(String(nativeRubric.args[2])), pack.assessment.rubric.criteria.map(criterion => ({ criterionKey: criterion.key, levelKey: criterion.levels.at(-1)!.key })));
  const beforeWrites = port.writes.length, beforeCommands = port.commands.size;
  const second = await scenarioCore(port.client);
  assert.deepEqual(second, first); assert.equal(port.writes.length, beforeWrites); assert.equal(port.commands.size, beforeCommands); assert.equal(port.thinkingCommands.size, 12);
  assert.equal(port.queries.at(-1)?.sql, 'COMMIT');
});

test('reference completion receipt is written before COMMIT and a lost receipt prevents transaction acceptance',async()=>{
 for(const failCompletion of [false,true]){
  const port=completeSourcePort();let fingerprint='';let completed=false;
  const run=scenarios.seedReferenceScenarioTransaction(port.client,{read:async()=>null,complete:async(sourceBundleFingerprint,result)=>{
    fingerprint=sourceBundleFingerprint;assert.equal(port.queries.at(-1)?.sql==='COMMIT',false);assert.equal(result.status,'SYNTHETIC_REFERENCE_READY');assert.equal(port.tasks.size,14);completed=true;if(failCompletion)throw Error('Original reference receipt unavailable');
  }});
  if(failCompletion){await assert.rejects(run,/Original reference receipt unavailable/);assert.equal(port.queries.at(-1)?.sql,'ROLLBACK');assert.equal(port.queries.some(query=>query.sql==='COMMIT'),false);}
  else{await run;assert.equal(port.queries.at(-1)?.sql,'COMMIT');}
  assert.equal(completed,true);assert.match(fingerprint,/^[a-f0-9]{64}$/);
 }
});
