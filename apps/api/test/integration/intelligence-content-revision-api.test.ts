import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createCustomerContext, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('intelligence exact published learning revision actual Auth API', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  it('uses published meaning, ignores drafts and denies stale or retired proposed options', async () => {
    const course = await customerCourse(context, 'Published insight practice'); const baseline = await customerReleased(context, 'strong', course.courseId, 'Published context baseline', 3); await context.drain();
    const initial = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId });
    const saved = (await context.request('teacher', `/v1/intelligence/runs/${initial.intelligenceRunId}/context`)).json().context.learningOptions.find((option: { activityId: string }) => option.activityId === course.practiceId); expect(saved).toMatchObject({ title: 'Teacher practice', instructions: 'Explain one step, then check it.', contentRevisionId: expect.any(String), contentRevision: expect.any(Number) });
    const source = (await context.request('teacher', `/v1/learning-content/activity/${course.practiceId}`)).json();
    const draft = await context.command('teacher', `/v1/learning-content/activity/${course.practiceId}/draft`, { resource: 'activity', title: 'Published checking practice v2', content: 'Explain two checking steps using the new worked example.', kind: 'practice', assessmentId: null, expectedRevision: source.revision, reason: 'Teacher edits draft without changing published source.' });
    expect((await context.request('teacher', `/v1/intelligence/runs/${initial.intelligenceRunId}/context`)).statusCode).toBe(200);
    await context.command('teacher', `/v1/learning-content/activity/${course.practiceId}/publish`, { expectedRevision: draft.revision, confirmPublication: true });
    expect((await context.request('teacher', `/v1/intelligence/runs/${initial.intelligenceRunId}/context`)).statusCode).toBe(403);
    expect((await context.request('teacher', `/v1/recommendations/${initial.id}/decision`, { decision: 'APPROVE', reason: 'Old published instructions are stale.' })).statusCode).toBe(403);
    const fresh = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId }); expect(fresh.activityTitle).toBe('Published checking practice v2'); expect(fresh.instructions).toBe('Explain two checking steps using the new worked example.');
    const approved = await context.command('teacher', `/v1/recommendations/${fresh.id}/decision`, { decision: 'APPROVE', reason: 'Teacher approved the current published revision.', approvedActivityIds: [course.practiceId] });
    const published = (await context.request('teacher', `/v1/learning-content/activity/${course.practiceId}`)).json(); await context.command('teacher', `/v1/learning-content/activity/${course.practiceId}/retire`, { expectedRevision: published.revision, reason: 'Teacher withdraws this practice.', confirmRetirement: true });
    expect((await context.request('strong', `/v1/interventions/${approved.interventionId}/choices`, { activityId: course.practiceId, confirmChoice: true })).statusCode).toBe(403); expect((await context.request('strong', `/v1/interventions/${approved.interventionId}/choices`)).json().options[0].available).toBe(false);
  });
});
