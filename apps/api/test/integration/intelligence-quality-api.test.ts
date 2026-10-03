import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
import{CooperativeFixtureScope}from'./cooperative-fixture-scope';
import{cooperativeCustomerContext}from'./cooperative-customer-context';
import{withFixtureCleanup}from'./fixture-cleanup';
dotenv({ path: '.env.local', quiet: true });

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('recorded intelligence evaluation actual Auth API', () => {
  let context: CustomerContext;
  let ownerContext:CustomerContext;let caseScope:CooperativeFixtureScope|undefined;
  function journey(work:()=>Promise<void>){const scope=new CooperativeFixtureScope(60000);caseScope=scope;context=cooperativeCustomerContext(ownerContext,scope);return scope.run(work);}
  beforeAll(async () => { ownerContext = await createCustomerContext();context=ownerContext; }, 60000);
  afterEach(async()=>{await withFixtureCleanup(async()=>{await caseScope?.cancelAndWait();},[()=>ownerContext.client.query('RESET ROLE'),()=>{caseScope=undefined;}]);});
  afterAll(async () => {await withFixtureCleanup(async()=>{await caseScope?.cancelAndWait();},[()=>ownerContext?.close()]);});
  it('uses assessed output and observed human review denominators without inferring quality from acceptance', () => journey(async () => {
    const course = await customerCourse(context, 'Observed evaluation context');
    const baseline = await customerReleased(context, 'strong', course.courseId, 'Reviewed current source', 3); await context.drain();
    const first = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId });
    const second = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId });
    const fail = async (rejected: boolean) => {
      try {
        await context.client.query('SAVEPOINT evaluation_failure');await context.client.query('set local role cuevo_api');
        await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(4), context.school]);
        const run = (await context.client.query('select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5)as run', [randomUUID(), 'a'.repeat(64), baseline.resultId, JSON.stringify({ mode: 'FIXTURE', provider: 'deterministic-fixture', model: 'source-locked-v1', promptId: 'next-learning-action', promptVersion: '2', promptDigest: '1f892110e486d0f8117e53ef9d9cf0a884b7c155821dd8eb1284cef22b9f0de4', policyVersion: 1, timeoutMs: 30000, maxTokens: 1000, maxCost: 1, costBasis: 'DETERMINISTIC_FIXTURE' }), 'evaluation-fixture'])).rows[0].run;
        await context.client.query('select internal.fail_intelligence_run($1,$2,$3,$4,$5)', [run.runId, run.leaseToken, rejected ? 'INTELLIGENCE_REQUIRES_REVIEW' : 'INTELLIGENCE_PROVIDER_FAILED', 'evaluation-fixture', rejected]);
        await context.client.query('reset role'); await context.client.query('RELEASE SAVEPOINT evaluation_failure');
      } catch (error) {await withFixtureCleanup(async()=>{throw error;},[()=>ownerContext.client.query('ROLLBACK TO SAVEPOINT evaluation_failure'),()=>ownerContext.client.query('reset role')]);}
    };
    await fail(true); await fail(false);
    const review = { usefulness: 'USEFUL', grounding: 'SUPPORTED', privacy: 'UNKNOWN', toolSafety: 'UNKNOWN', confirmReview: true, reason: 'Teacher reviewed this evidence and proposed learning step.' };
    const path = `/v1/intelligence/runs/${first.intelligenceRunId}/review`;
    for (const role of ['parent', 'strong', 'otherTeacher', 'coordinator'] as const) expect((await context.request(role, path, review)).statusCode).toBe(403);
    expect((await context.request('teacher', path, { ...review, confirmReview: false })).statusCode).toBe(400);
    expect((await context.request('teacher', path)).json().review).toBeNull();
    const key = randomUUID(); const saved = await context.command('teacher', path, review, key);
    expect(saved.review).toMatchObject({ usefulness: 'USEFUL', privacy: 'UNKNOWN', reviewerId: customerActor(4) });
    expect((await context.request('teacher', path, review, key)).json()).toEqual(saved);
    expect((await context.request('teacher', path, { ...review, usefulness: 'NOT_USEFUL' })).statusCode).toBe(409);
    await context.command('teacher', `/v1/recommendations/${first.id}/decision`, { decision: 'APPROVE', reason: 'Teacher retained the proposed step.', editedActivityTitle: first.activityTitle, editedInstructions: first.instructions });
    await context.command('teacher', `/v1/recommendations/${second.id}/decision`, { decision: 'REJECT', reason: 'Teacher chose another appropriate path.' });
    const response = await context.request('teacher', '/v1/intelligence/metrics?windowDays=30&mode=FIXTURE'); expect(response.statusCode).toBe(200);
    expect(response.json().evaluation).toMatchObject({ structuralAcceptance: { numerator: 2, denominator: 3, rate: 2 / 3 }, unevaluatedAttempts: 1, legacyUnobservedRuns: 0, humanReviewCount: 1, usefulness: { numerator: 1, denominator: 1, rate: 1 }, unsupportedClaim: { numerator: 0, denominator: 1, rate: 0 }, privacyIssue: { denominator: 0, rate: null }, invalidTool: { denominator: 0, rate: null }, humanOverride: { numerator: 1, denominator: 2, rate: .5 } });
    expect(response.json()).toMatchObject({ unsupportedClaimRate: null, unauthorizedContextLeakageRate: null, invalidToolCallRate: null, humanOverrideRate: null });
    expect((await context.client.query('select count(*)::integer count from internal.intelligence_quality_reviews where school_id=$1', [context.school])).rows[0].count).toBe(1);
    expect((await context.client.query("select count(*)::integer count from internal.audit_events where school_id=$1 and action='intelligence.quality.reviewed'", [context.school])).rows[0].count).toBe(1);
  }),60000);
  it('records changed approved content as an override without assigning human quality', () => journey(async () => {
    const course = await customerCourse(context, 'Edited review context'); const baseline = await customerReleased(context, 'observed', course.courseId, 'Edited current source', 3); await context.drain();
    const proposal = await context.command('teacher', '/v1/intelligence/analyze', { baselineResultId: baseline.resultId });
    await context.command('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'Teacher narrowed the task.', editedActivityTitle: 'Teacher reviewed checking step', editedInstructions: 'Use one worked example and explain the checking step.' });
    expect((await context.client.query('select overridden from internal.intelligence_decision_observations where school_id=$1 and run_id=$2', [context.school, proposal.intelligenceRunId])).rows[0].overridden).toBe(true);
    expect((await context.client.query('select count(*)::integer count from internal.intelligence_quality_reviews where school_id=$1 and run_id=$2', [context.school, proposal.intelligenceRunId])).rows[0].count).toBe(0);
  }),60000);
});
