import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('current proposal paging with shared immutable context', () => {
  let context: CustomerContext; let first: Record<string, unknown> & { id: string }; let second: typeof first; let practiceId: string; let baselineResultId: string;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  const page = async () => { const start = performance.now(); const response = await context.request('teacher', '/v1/recommendations?limit=100'); expect(response.statusCode, response.body).toBe(200); expect(performance.now() - start).toBeLessThan(5000); return response.json() as { items: { id: string }[]; nextCursor: string | null }; };

  it('returns fifty real fixture proposals, without reducing the page or repeating generation on replay', async () => {
    const course = await customerCourse(context, 'Source-authorized proposal page');
    const source = await customerReleased(context, 'strong', course.courseId, 'Current proposal baseline', 3); await context.drain();
    practiceId = course.practiceId; baselineResultId = source.resultId;
    const key = randomUUID(); first = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: source.resultId }, key);
    expect(await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: source.resultId }, key)).toEqual(first);
    for (let index = 1; index < 50; index++) second = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: source.resultId });
    const result = await page(); expect(result.items).toHaveLength(50); expect(result.nextCursor).toBeNull(); expect(new Set(result.items.map(item => item.id)).size).toBe(50);
    const firstPage = await context.request('teacher', '/v1/recommendations?limit=25'); expect(firstPage.statusCode, firstPage.body).toBe(200);
    const next = await context.request('teacher', '/v1/recommendations?limit=25&cursor=' + firstPage.json().nextCursor); expect(next.statusCode, next.body).toBe(200);
    expect([...firstPage.json().items, ...next.json().items].map((item: { id: string }) => item.id).sort()).toEqual(result.items.map(item => item.id).sort());
    for (const role of ['parent', 'strong', 'otherTeacher'] as const) { const denied = await context.request(role, '/v1/recommendations?limit=100'); expect(denied.statusCode === 403 || denied.statusCode === 200 && denied.json().items.length === 0).toBe(true); }
  }, 180000);

  it('does not reuse a valid verdict for one different saved context, and repeats current population and policy', async () => {
    await context.client.query('SAVEPOINT changed_context');
    try {
      // Fixture-only source change: preserve all other groups and corrupt only one exact snapshot.
      await context.client.query('alter table app.intelligence_context_details disable trigger immutable_history');
      await context.client.query("update app.intelligence_context_details set context=jsonb_set(context,'{reference,version}',to_jsonb('changed-source'::text))where school_id=$1 and run_id=$2", [context.school, second.intelligenceRunId]);
      await context.client.query('alter table app.intelligence_context_details enable trigger immutable_history');
      const result = await page(); expect(result.items).toHaveLength(49); expect(result.items.some(item => item.id === second.id)).toBe(false); expect(result.items.some(item => item.id === first.id)).toBe(true);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT changed_context'); }
    await context.client.query('SAVEPOINT changed_population');
    try { await context.client.query('update app.people set synthetic=false where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]); expect((await page()).items).toHaveLength(0); }
    finally { await context.client.query('ROLLBACK TO SAVEPOINT changed_population'); }
    await context.client.query('SAVEPOINT changed_policy');
    try { await context.client.query('update app.intelligence_policies set version=version+1 where school_id=$1', [context.school]); expect((await page()).items).toHaveLength(0); }
    finally { await context.client.query('ROLLBACK TO SAVEPOINT changed_policy'); }
    await context.client.query('SAVEPOINT withdrawn_learner');
    try { await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and student_actor_id=$2", [context.school, customerActor(12)]); expect((await page()).items).toHaveLength(0); }
    finally { await context.client.query('ROLLBACK TO SAVEPOINT withdrawn_learner'); }
    expect((await page()).items).toHaveLength(50);
  }, 30000);

  it('retains exact published instructional revision and native source authority', async () => {
    const source = (await context.request('teacher', '/v1/learning-content/activity/' + practiceId)).json();
    const draft = await context.command('teacher', '/v1/learning-content/activity/' + practiceId + '/draft', { resource: 'activity', title: source.title, content: 'Changed published checking instruction.', kind: 'practice', assessmentId: null, expectedRevision: source.revision, reason: 'Teacher edits the exact saved practice.' });
    expect((await page()).items).toHaveLength(50);
    await context.command('teacher', '/v1/learning-content/activity/' + practiceId + '/publish', { expectedRevision: draft.revision, confirmPublication: true });
    expect((await page()).items).toHaveLength(0);
    const stale = await context.request('teacher', '/v1/recommendations/' + first.id + '/decision', { decision: 'APPROVE', reason: 'Stale saved practice must deny.' }); expect(stale.statusCode).toBe(403);
    const current = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId }); expect((await page()).items.map(item => item.id)).toEqual([current.id]);
  }, 30000);
});
