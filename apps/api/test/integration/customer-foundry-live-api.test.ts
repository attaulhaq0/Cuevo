import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { learnerStateSchema, intelligenceMetricsSchema } from '@cuevo/contracts';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';
import { withCustomerLiveAllowance } from './customer-live-allowance';

dotenv({ path: '.env.local', quiet: true });
// The normal integration suite remains repeatable fixture mode and never spends a model call.
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1' && process.env.CUEVO_REQUIRE_LIVE_INTELLIGENCE === '1';
describe.skipIf(!enabled)('Foundry synthetic real Auth API human approval measured-outcome journey', () => {
  let context: CustomerContext;
  const evidencePath = '.local/customer-readiness/foundry-smoke.json';
  beforeAll(async () => {
    context = await createCustomerContext({ liveIntelligence: true });
    await context.client.query('update app.intelligence_policies set live_enabled=true where school_id=$1', [context.school]);
    await context.command('admin','/v1/intelligence/budget',{currency:'USD',schoolDailyLimit:2,actorDailyLimit:2,maxConcurrentRuns:1,expectedVersion:0,confirmApproval:true,reason:'Explicit synthetic live reservation cap; billed cost remains unknown.'});
  }, 60_000);
  afterAll(async () => { await context?.close(); });
  it('reauthorizes source population before one model call, then closes the human-controlled native loop', async () => {
    const course = await customerCourse(context, 'Synthetic live improvement');
    const baseline = await customerReleased(context, 'improved', course.courseId, 'Synthetic live baseline', 3);
    await context.drain();
    const body = { baselineResultId: baseline.resultId };
    expect((await context.request('parent', '/v1/intelligence/analyze', body)).statusCode).toBe(403);
    expect((await context.request('improved', '/v1/intelligence/analyze', body)).statusCode).toBe(403);
    await context.client.query('update app.people set synthetic=false where school_id=$1 and actor_id=$2', [context.school, customerActor(17)]);
    try { expect((await context.request('teacher', '/v1/intelligence/analyze', body)).statusCode).toBe(403); }
    finally { await context.client.query('update app.people set synthetic=true where school_id=$1 and actor_id=$2', [context.school, customerActor(17)]); }
    await withCustomerLiveAllowance({ path: evidencePath, writer: 'AUTH_API_JOURNEY' }, async () => {
      const key = randomUUID();
      const response = await context.request('teacher', '/v1/intelligence/analyze', body, key);
      expect(response.statusCode, `Live proposal HTTP ${response.statusCode}`).toBe(200);
      const proposal = response.json();
      expect(proposal).toMatchObject({ origin: 'AI_GENERATED', generationMode: 'LIVE', status: 'AWAITING_HUMAN', baselineResultId: baseline.resultId, observation: 'The released numeric result is 3 / 10.' });
      expect((await context.client.query('select count(*)count from app.interventions where school_id=$1', [context.school])).rows[0].count).toBe('0');
      expect((await context.request('teacher', '/v1/intelligence/analyze', body, key)).json()).toEqual(proposal);
      expect((await context.request('parent', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'Unauthorized approval' })).statusCode).toBe(403);
      const decision = await context.command('teacher', `/v1/recommendations/${proposal.id}/decision`, { decision: 'APPROVE', reason: 'Human reviewed native source and learning option.' });
      const interventionId = String(decision.interventionId);
      expect((await context.request('strong', `/v1/interventions/${interventionId}/complete`, {})).statusCode).toBe(403);
      await context.command('improved', `/v1/interventions/${interventionId}/complete`, { reflection: 'Synthetic practice checked and explained.' });
      const followup = await customerReleased(context, 'improved', course.courseId, 'Synthetic live follow-up', 7);
      await context.command('teacher', `/v1/interventions/${interventionId}/reassessment`, { assessmentId: followup.assessmentId });
      const outcome = await context.command('teacher', `/v1/interventions/${interventionId}/measure`, { followUpResultId: followup.resultId, minimumChange: 1 });
      expect(outcome).toMatchObject({ status: 'improved', difference: 4, baseline: { score: 3, maxScore: 10 }, followUp: { score: 7, maxScore: 10 }, limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' });
      await context.drain();
      const stateResponse = await context.request('improved', `/v1/learners/${customerActor(17)}/state`);
      const state = learnerStateSchema.parse(stateResponse.json());
      expect(state.impact.outcomes.some(item => item.id === outcome.id)).toBe(true);
      const metricResponse = await context.request('teacher', '/v1/intelligence/metrics?mode=LIVE&windowDays=30');
      expect(metricResponse.statusCode).toBe(200);
      const metrics = intelligenceMetricsSchema.parse(metricResponse.json());
      expect(metrics).toMatchObject({ completedRuns: 1, totalCost: 0, costPerApprovedWorkflow: null, costAccounting: { reservedBudget: 1, unknownBilledCostRuns: 1, billedCost: null } });
      const run = (await context.client.query('select state,evaluation_status,input_tokens,output_tokens,cost_basis,cost,latency_ms,context_references,tool_trace from app.intelligence_runs where school_id=$1 and id=$2', [context.school, proposal.intelligenceRunId])).rows[0];
      expect(run).toMatchObject({ state: 'PROPOSAL_READY', evaluation_status: 'PASSED', cost_basis: 'BUDGET_RESERVATION', cost: '1' });
      expect(run.input_tokens).toBeGreaterThan(0); expect(run.output_tokens).toBeGreaterThan(0);
      expect(JSON.stringify(run.context_references)).not.toMatch(/Synthetic source explanation|Teacher-reviewed native evidence|email|password/);
      expect((await context.client.query('select count(*)count from app.intelligence_runs where school_id=$1', [context.school])).rows[0].count).toBe('1');
      return { result: undefined, receipt: { status: 'VERIFIED', integrationStatus: 'AUTH_MODEL_APPROVAL_COMPLETION_REASSESSMENT_OUTCOME_VERIFIED', provider: 'azure-foundry', model: 'gpt-6.1-sol', inputTokens: run.input_tokens, outputTokens: run.output_tokens, elapsedMs: run.latency_ms, costBasis: run.cost_basis, reservedBudget: 1, billedCost: null, observedDifference: 4, syntheticTenantCleanup: 'PENDING_AFTER_ALL', unauthorizedActorAndRealPopulationDenied: true, originalKeyReplaySingleRun: true } };
    });
  }, 60_000);
});
