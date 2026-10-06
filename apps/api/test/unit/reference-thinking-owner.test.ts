import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import * as thinkingSeed from '../../../../scripts/seed-thinking-focus';
import { seedReviewedThinkingTasks } from '../../../../scripts/seed-thinking-focus';
import type { ThinkingFocusResponse } from '@cuevo/contracts';
import { readFile } from 'node:fs/promises';

const expectedActors = [
  { actorId: '20000000-0000-4000-8000-000000000004', schoolId: '10000000-0000-4000-8000-000000000001', role: 'teacher' },
  { actorId: '20000000-0000-4000-8000-000000000002', schoolId: '10000000-0000-4000-8000-000000000001', role: 'coordinator' },
  { actorId: '20000000-0000-4000-8000-000000000012', schoolId: '10000000-0000-4000-8000-000000000001', role: 'student' },
];
const roles = thinkingSeed as unknown as { parseThinkingSeedManifest: (value: unknown) => unknown; requireThinkingSeedRoles: (value: unknown) => void };

describe('reference thinking seed private-owner orchestration', () => {
  it.each([[0, 'admin'], [1, 'admin'], [2, 'parent']])('rejects reassigned manifest actor %s before admitting declared task roles', async (index, role) => {
    expect(roles.parseThinkingSeedManifest).toBeTypeOf('function');
    const manifest = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8'));
    expect(() => roles.parseThinkingSeedManifest(manifest)).not.toThrow();
    const changed = { ...manifest, actors: manifest.actors.map((actor: { actorId: string }) => actor.actorId === expectedActors[index]!.actorId ? { ...actor, role } : actor) };
    expect(() => roles.parseThinkingSeedManifest(changed)).toThrow('declared teacher, coordinator and learner');
  });
  it.each([[0, 'admin'], [1, 'admin'], [2, 'parent']])('rejects active current actor %s whose role was changed', (index, role) => {
    expect(roles.requireThinkingSeedRoles).toBeTypeOf('function');
    expect(() => roles.requireThinkingSeedRoles(expectedActors)).not.toThrow();
    expect(() => roles.requireThinkingSeedRoles(expectedActors.map((actor, position) => position === index ? { ...actor, role } : actor))).toThrow('declared teacher, coordinator and learner');
  });
  it('rejects missing, duplicate and cross-school current task actors', () => {
    expect(roles.requireThinkingSeedRoles).toBeTypeOf('function');
    for (const actors of [expectedActors.slice(0, 2), [expectedActors[0], expectedActors[0], expectedActors[2]], expectedActors.map((actor, index) => index === 2 ? { ...actor, schoolId: '10000000-0000-4000-8000-000000000002' } : actor)]) expect(() => roles.requireThinkingSeedRoles(actors)).toThrow();
  });
  it('rejects an unsafe target before any source or database operation', async () => {
    let calls = 0;
    const client = { query: async () => { calls++; throw Error('Unexpected database access'); } } as unknown as PoolClient;
    await expect(seedReviewedThinkingTasks(client, 'postgres://postgres:test@127.0.0.1:57422/cuevo_integration_20261004', { asActor: async (_actor, run) => run(), create: async (_key, _action, run) => (await run()).id, requireExact: () => { calls++; } })).rejects.toThrow('guarded standard');
    expect(calls).toBe(0);
  });
  it('requires current synthetic population admission before creating a demonstration lesson', async () => {
    const writes: string[] = [];
    const client = { query: async (sql: string) => { if (/insert|update|delete/i.test(sql)) writes.push(sql); return { rows: [{ database: 'postgres', port: 5432, populationMatches: false, people: 133, currentActors: true, originalCourse: true }] }; } } as unknown as PoolClient;
    await expect(seedReviewedThinkingTasks(client, 'postgres://postgres:test@127.0.0.1:56322/postgres', { asActor: async (_actor, run) => run(), create: async (_key, _action, run) => (await run()).id, requireExact: () => undefined })).rejects.toThrow('intact synthetic reference');
    expect(writes).toEqual([]);
  });
  it.each([[0, 'admin'], [1, 'admin'], [2, 'parent']])('blocks all fixture writes after current role %s changed despite active membership', async (index, role) => {
    const writes: string[] = [];
    const client = { query: async (sql: string) => { if (/insert|update|delete/i.test(sql)) writes.push(sql); return { rows: [{ database: 'postgres', port: 5432, populationMatches: true, people: 133, currentActors: true, currentRoles: expectedActors.map((actor, position) => position === index ? { ...actor, role } : actor), originalCourse: true }] }; } } as unknown as PoolClient;
    await expect(seedReviewedThinkingTasks(client, 'postgres://postgres:test@127.0.0.1:56322/postgres', { asActor: async (_actor, run) => run(), create: async (_key, _action, run) => (await run()).id, requireExact: () => undefined })).rejects.toThrow('declared teacher, coordinator and learner');
    expect(writes).toEqual([]);
  });
  it('restores explicit reviewed activities through the private owner without awarding or completing work', async () => {
    let actor = 4, serial = 1;
    const sourceWrites: string[] = [], commands = new Map<string, ThinkingFocusResponse>(), created = new Map<string, string>();
    let lesson: Record<string, unknown> | undefined;
    const tasks = new Map<string, Record<string, unknown>>(), current = new Map<string, ThinkingFocusResponse>();
    const author = '20000000-0000-4000-8000-000000000004', reviewer = '20000000-0000-4000-8000-000000000002';
    const course = '96010000-0000-4000-8000-000000000001';
    const source = (id: string): ThinkingFocusResponse => ({ schemaVersion: '1', target: { kind: 'ACTIVITY', id, criterionKey: null }, courseId: course, targetTitle: String(tasks.get(id)?.title), sourceVersion: 'a'.repeat(64), status: 'UNCLASSIFIED', revision: 0, classification: null, source: { title: String(tasks.get(id)?.title), instructions: String(tasks.get(id)?.instructions), contentRevision: 1, preparationVersion: null, policyVersion: null, rubricVersion: null, criterionTitle: null }, canAuthor: true, canReview: false });
    const client = { query: async (sql: string, args: unknown[]) => {
      if (sql.includes('populationMatches')) return { rows: [{ database: 'postgres', port: 5432, people: 133, populationMatches: true, currentActors: true, currentRoles: expectedActors, originalCourse: true }] };
      if (sql.startsWith('insert into app.lessons')) { sourceWrites.push('lesson'); lesson = { id: args[0], unitId: args[1], title: args[2], sequence: 2, body: args[3] }; return { rows: [] }; }
      if (sql.startsWith('select id,unit_id')) return { rows: [lesson] };
      if (sql.startsWith('insert into app.activities')) { sourceWrites.push('activity'); tasks.set(String(args[0]), { id: args[0], lessonId: args[1], title: args[2], kind: 'practice', instructions: args[3], sequence: args[4] }); return { rows: [] }; }
      if (sql.startsWith('select id,lesson_id')) return { rows: [tasks.get(String(args[0]))] };
      if (sql.startsWith('select internal.learning_content_view')) { const isLesson = sql.includes("'lesson'"), stored = isLesson ? lesson! : tasks.get(String(args[0]))!; return { rows: [{ response: { id: '97000000-0000-4000-8000-000000000999', courseId: course, resource: isLesson ? 'lesson' : 'activity', sourceId: args[0], revision: 1, title: stored.title, content: isLesson ? stored.body : stored.instructions, kind: isLesson ? null : 'practice', assessmentId: null, state: 'PUBLISHED', createdAt: '2026-10-05T07:00:00Z', publishedRevision: 1, draftRevision: 1 } }] }; }
      if (sql.startsWith('select internal.read_thinking_focus(')) { const value = current.get(String(args[0])) ?? source(String(args[0])); return { rows: [{ response: { ...value, id: undefined, canAuthor: actor === 4, canReview: actor === 2 } }] }; }
      if (sql.startsWith('select internal.read_thinking_focus_materials')) return { rows: [{ response: { schemaVersion: '1', target: { kind: 'ACTIVITY', id: args[0], criterionKey: null }, courseId: course, sourceVersion: args[1], items: [] } }] };
      if (sql.startsWith('select internal.thinking_focus_command')) {
        const [command, taskId, body, key] = args as string[];
        if (commands.has(key)) return { rows: [{ response: commands.get(key) }] };
        sourceWrites.push(String(command));
        const input = JSON.parse(body), previous = current.get(taskId), classificationId = `97000000-0000-4000-8000-${String(serial++).padStart(12, '0')}`;
        const classification = command === 'draft' ? { id: classificationId, revision: 1, focus: input.focus, rationale: input.rationale, authorId: author, authoredAt: '2026-10-05T07:00:00Z', reviewerId: null, reviewedAt: null, reviewReason: null } : { ...previous!.classification!, id: classificationId, revision: 2, reviewerId: reviewer, reviewedAt: '2026-10-05T07:01:00Z', reviewReason: input.reason };
        expect(actor).toBe(command === 'draft' ? 4 : 2);
        const value: ThinkingFocusResponse = { ...source(taskId), id: classificationId, status: command === 'draft' ? 'AWAITING_REVIEW' : 'APPROVED', revision: classification.revision, classification, canAuthor: actor === 4, canReview: actor === 2 };
        commands.set(key, value); current.set(taskId, value); return { rows: [{ response: value }] };
      }
      throw Error('Unexpected private owner query');
    } } as unknown as PoolClient;
    const owner = { asActor: async <T>(nextActor: number, run: () => Promise<T>) => { actor = nextActor; return run(); }, create: async (key: string, _action: string, run: () => Promise<{ id: string; value: string }>) => { actor = 4; if (created.has(key)) return created.get(key)!; const result = await run(); created.set(key, result.id); return result.id; }, requireExact: (actual: Record<string, unknown> | undefined, expected: Record<string, unknown>) => expect(actual).toEqual(expected) };
    const first = await seedReviewedThinkingTasks(client, 'postgres://postgres:test@127.0.0.1:56322/postgres', owner);
    expect(first.tasks).toHaveLength(6); expect(first.tasks.every(task => current.get(task.taskId)?.status === 'APPROVED')).toBe(true);
    expect(sourceWrites).toEqual(['lesson', 'activity', 'draft', 'review', 'activity', 'draft', 'review', 'activity', 'draft', 'review', 'activity', 'draft', 'review', 'activity', 'draft', 'review', 'activity', 'draft', 'review']);
    const second = await seedReviewedThinkingTasks(client, 'postgres://postgres:test@127.0.0.1:56322/postgres', owner);
    expect(second).toEqual(first); expect(commands.size).toBe(12); expect(sourceWrites).toHaveLength(19);
  });
});
