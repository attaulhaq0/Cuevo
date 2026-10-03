import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { Pool } from 'pg';
import { PosthogDelivery } from '../../../worker/src/jobs/analytics/posthog-delivery';
import type { PosthogEvent, LiveAnalyticsConfig } from '../../../worker/src/platform/posthog';
import { createCustomerContext, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
import { prepareSyntheticWorkerWindow, requireSyntheticWorkerTarget } from './customer-worker-window';

dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('committed current source PostHog delivery without a remote network call', () => {
  let context: CustomerContext; let worker: Pool;
  const capture: LiveAnalyticsConfig = { mode: 'LIVE_SYNTHETIC', projectId: 393668, host: 'https://us.i.posthog.com', projectKey: 'integration-test-only', pseudonymKey: 'a'.repeat(64), keyVersion: 1, environment: 'QA' };
  beforeAll(async () => {
    context = await createCustomerContext({ committed: true });
    await prepareSyntheticWorkerWindow(context.client, process.env.WORKER_DATABASE_URL);
    worker = new Pool({ connectionString: requireSyntheticWorkerTarget(process.env.WORKER_DATABASE_URL), max: 2, statement_timeout: 5000, connectionTimeoutMillis: 3000 });
    await context.command('admin', '/v1/school/policies', { expectedVersion: 0, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: true, reason: 'Synthetic PostHog integration approval.', confirmPolicyApproval: true });
    await context.client.query("select set_config('app.runtime_env','local',false)");
    await context.client.query('select internal.configure_posthog_school($1,true,$2,$3)', [context.school, 'QA', 1]);
  }, 60000);
  afterAll(async () => { await worker?.end(); await context?.close(); });
  it('captures actual submitted/released/approved/completed/reassessed/measured sources once across two restricted workers', async () => {
    const course = await customerCourse(context, 'PostHog private source verification');
    await context.command('strong', `/v1/activities/${course.practiceId}/complete`, {});
    const baseline = await customerReleased(context, 'strong', course.courseId, 'Private baseline source', 3);
    await context.drain();
    const proposal = await context.command('teacher', '/v1/recommendations', { baselineResultId: baseline.resultId, observation: 'private sentinel observation', interpretation: 'private sentinel interpretation', recommendation: 'private sentinel recommendation', rationale: 'private sentinel rationale', uncertainty: 'private sentinel uncertainty', activityTitle: 'Private practice title', instructions: 'private sentinel instructions' });
    const decision = await context.command('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'Private teacher approval reason' });
    await context.command('strong', `/v1/interventions/${decision.interventionId}/complete`, { reflection: 'private sentinel reflection' });
    const followup = await customerReleased(context, 'strong', course.courseId, 'Private followup source', 7);
    await context.command('teacher', `/v1/interventions/${decision.interventionId}/reassessment`, { assessmentId: followup.assessmentId });
    await context.command('teacher', `/v1/interventions/${decision.interventionId}/measure`, { followUpResultId: followup.resultId, minimumChange: 1 });
    await context.drain();
    const captured: PosthogEvent[] = [];
    const sink = async (_config: LiveAnalyticsConfig, event: PosthogEvent) => { captured.push(event); return 'ACCEPTED' as const; };
    const first = new PosthogDelivery(worker, capture, sink); const second = new PosthogDelivery(worker, capture, sink);
    for (let pass = 0; pass < 5; pass++) await Promise.all([first.process({ maxEvents: 10, deadline: Date.now() + 30000 }), second.process({ maxEvents: 10, deadline: Date.now() + 30000 })]);
    expect(captured.map(event => event.event)).toEqual(expect.arrayContaining(['learning_activity_completed', 'assessment_submitted', 'assessment_marked', 'recommendation_reviewed', 'intervention_completed', 'reassessment_linked', 'outcome_measured']));
    expect(new Set(captured.map(event => event.properties.$insert_id)).size).toBe(captured.length);
    expect(JSON.stringify(captured)).not.toMatch(/private sentinel|Private|baselineResultId|followUpResultId|score|feedback|reflection|recommendationId/);
    const receipts = await context.client.query('select count(*)::integer count from internal.posthog_delivery receipt join internal.outbox_events event on event.id=receipt.event_id where event.school_id=$1 and receipt.state=$2', [context.school, 'ACCEPTED']);
    expect(receipts.rows[0].count).toBe(captured.length);
    expect((await context.client.query('select internal.posthog_delivery_due()as due')).rows[0].due).toBe(false);
  }, 60000);
});
