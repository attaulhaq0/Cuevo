import { describe, expect, it } from 'vitest';
import * as reference from '../../../../scripts/seed-reference-scenarios';

type Fixture = { version: string; tasks: { key: string; focus: { primaryProcess: string; additionalProcesses: string[] }; title: { en: string; ar: string }; instructions: { en: string; ar: string } }[] };
type SeedExports = {
  loadThinkingSeedFixture: () => Promise<Fixture>;
  parseThinkingSeedFixture: (value: unknown) => Fixture;
  validateThinkingSeedTarget: (url: string) => URL;
  thinkingSeedCommand: (fixtureDigest: string, taskKey: string, command: 'draft' | 'review', target: { kind: 'ACTIVITY'; id: string; criterionKey: null }, input: Record<string, unknown>) => { key: string; fingerprint: string };
  requireThinkingSeedReceipt: (value: unknown, source: Record<string, unknown>, fixture: Record<string, unknown>, status: 'AWAITING_REVIEW' | 'APPROVED') => unknown;
  requireThinkingSeedContent: (value: unknown, resource: 'lesson' | 'activity', id: string, title: string, content: string) => unknown;
};
const seed = reference as unknown as SeedExports;
const id = '96060000-0000-4000-8000-000000000100';
const course = '96010000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000004';
const reviewer = '20000000-0000-4000-8000-000000000002';
const source = { schemaVersion: '1', target: { kind: 'ACTIVITY', id, criterionKey: null }, courseId: course, targetTitle: 'Check a method', sourceVersion: 'a'.repeat(64), status: 'UNCLASSIFIED', revision: 0, classification: null, source: { title: 'Check a method', instructions: 'Use the provided method.', contentRevision: 1, preparationVersion: null, policyVersion: null, rubricVersion: null, criterionTitle: null }, canAuthor: true, canReview: false };
const task = { focus: { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'APPLY', additionalProcesses: [] }, rationale: 'Use the supplied method in a new example.', reviewReason: 'Synthetic coordinator reviewed the exact instructions.' };
const receipt = { ...source, id: '97000000-0000-4000-8000-000000000001', status: 'APPROVED', revision: 2, classification: { id: '97000000-0000-4000-8000-000000000001', revision: 2, focus: task.focus, rationale: task.rationale, authorId: actor, authoredAt: '2026-10-05T07:00:00Z', reviewerId: reviewer, reviewedAt: '2026-10-05T07:01:00Z', reviewReason: task.reviewReason }, canReview: true };

describe('reviewed task-demand reference seed', () => {
  it('restores six usable bilingual task demands without calling them learner levels', async () => {
    expect(seed.loadThinkingSeedFixture).toBeTypeOf('function');
    const fixture = await seed.loadThinkingSeedFixture();
    expect(fixture.tasks.map(task => task.focus.primaryProcess).sort()).toEqual(['ANALYZE', 'APPLY', 'CREATE', 'EVALUATE', 'REMEMBER', 'UNDERSTAND']);
    for (const task of fixture.tasks) { expect(task.title.en.length).toBeGreaterThan(0); expect(task.title.ar).toMatch(/[\u0600-\u06ff]/); expect(task.instructions.en.length).toBeGreaterThan(30); expect(task.instructions.ar).toMatch(/[\u0600-\u06ff]/); }
  });
  it('refuses duplicate task identities rather than creating a fake six-stage trail', async () => {
    expect(seed.loadThinkingSeedFixture).toBeTypeOf('function');
    const fixture = await seed.loadThinkingSeedFixture();
    expect(() => seed.parseThinkingSeedFixture({ ...fixture, tasks: fixture.tasks.map((task, index) => index === 1 ? fixture.tasks[0] : task) })).toThrow();
  });
  it.each(['learnerLevel', 'mastery', 'xp', 'prerequisite', 'grade'])('rejects unsupported %s fields in task metadata', async field => {
    expect(seed.loadThinkingSeedFixture).toBeTypeOf('function');
    const fixture = await seed.loadThinkingSeedFixture();
    expect(() => seed.parseThinkingSeedFixture({ ...fixture, tasks: fixture.tasks.map((task, index) => index === 0 ? { ...task, [field]: 1 } : task) })).toThrow();
  });
  it('refuses remote, shared alternative-port and query-override targets before database I/O', () => {
    expect(seed.validateThinkingSeedTarget).toBeTypeOf('function');
    for (const url of ['postgres://postgres:test@remote.invalid:56322/postgres', 'postgres://postgres:test@127.0.0.1:57422/cuevo_integration_20261004', 'postgres://postgres:test@localhost:56322/other', 'postgres://postgres:test@localhost:56322/postgres?host=remote.invalid', 'postgres://postgres:test@localhost:56322/postgres#other']) expect(() => seed.validateThinkingSeedTarget(url)).toThrow();
    expect(seed.validateThinkingSeedTarget('postgres://cuevo_api:test@127.0.0.1:56322/postgres').port).toBe('56322');
  });
  it('keeps the original thinking command key stable while detecting changed payloads', () => {
    expect(seed.thinkingSeedCommand).toBeTypeOf('function');
    const target = { kind: 'ACTIVITY' as const, id, criterionKey: null };
    const first = seed.thinkingSeedCommand('a'.repeat(64), 'use-a-method', 'draft', target, { expectedRevision: 0, expectedSourceVersion: 'b'.repeat(64), focus: task.focus, rationale: task.rationale });
    const changed = seed.thinkingSeedCommand('a'.repeat(64), 'use-a-method', 'draft', target, { expectedRevision: 0, expectedSourceVersion: 'b'.repeat(64), focus: task.focus, rationale: 'Changed demand' });
    expect(changed.key).toBe(first.key); expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(first.key).toMatch(/^reference-thinking-checking-v1:/);
  });
  it('accepts only an exact independent review receipt', () => {
    expect(seed.requireThinkingSeedReceipt).toBeTypeOf('function');
    expect(() => seed.requireThinkingSeedReceipt(receipt, source, task, 'APPROVED')).not.toThrow();
    for (const changed of [{ ...receipt, sourceVersion: 'b'.repeat(64) }, { ...receipt, target: { ...source.target, id: '97000000-0000-4000-8000-000000000003' } }, { ...receipt, courseId: '97000000-0000-4000-8000-000000000003' }, { ...receipt, classification: { ...receipt.classification, reviewerId: actor } }, { ...receipt, classification: { ...receipt.classification, focus: { ...task.focus, primaryProcess: 'CREATE' } } }, { ...receipt, source: { ...source.source, instructions: 'Changed source' } }]) expect(() => seed.requireThinkingSeedReceipt(changed, source, task, 'APPROVED')).toThrow();
  });
  it('refuses a changed current lesson even when its legacy source row still matches', () => {
    expect(seed.requireThinkingSeedContent).toBeTypeOf('function');
    const current = { id: '97000000-0000-4000-8000-000000000001', courseId: course, resource: 'lesson', sourceId: id, revision: 1, title: 'Checking example', content: 'The reviewed example.', kind: null, assessmentId: null, state: 'PUBLISHED', createdAt: '2026-10-05T07:00:00Z', publishedRevision: 1, draftRevision: 1 };
    expect(() => seed.requireThinkingSeedContent(current, 'lesson', id, 'Checking example', 'The reviewed example.')).not.toThrow();
    for (const changed of [{ ...current, content: 'A replacement example.' }, { ...current, revision: 2, draftRevision: 2 }, { ...current, state: 'DRAFT' }, { ...current, sourceId: '97000000-0000-4000-8000-000000000003' }]) expect(() => seed.requireThinkingSeedContent(changed, 'lesson', id, 'Checking example', 'The reviewed example.')).toThrow();
  });
});
