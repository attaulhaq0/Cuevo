import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { intelligenceAnalyticsFailureCodes, intelligenceAnalyticsUsefulness, intelligenceAnalyticsGrounding, intelligenceAnalyticsPrivacy, intelligenceAnalyticsToolSafety, type IntelligenceAnalyticsContext } from '@cuevo/contracts/analytics';
import { createPosthogEvent } from '../src/platform/posthog';

// Pure proposed mapper cases only: no SQL, server, live provider or remote capture.
const live = { mode: 'LIVE_SYNTHETIC' as const, projectId: 393668 as const, host: 'https://us.i.posthog.com' as const, projectKey: 'project-test-only', pseudonymKey: 'c'.repeat(64), keyVersion: 1, environment: 'QA' as const };
const source = { id: '71000000-0000-4000-8000-000000000001', school_id: '10000000-0000-4000-8000-000000000001', actor_id: '20000000-0000-4000-8000-000000000012', type: 'intelligence.run_observed', occurred_at: '2026-10-02T18:30:00Z', lease_token: '71000000-0000-4000-8000-000000000002', environment: 'QA', key_version: 1, actor_role: 'teacher', diagnostics: null };
const fixture: IntelligenceAnalyticsContext = {
  runId: '72000000-0000-4000-8000-000000000001', purpose: 'NEXT_LEARNING_ACTION', generationMode: 'FIXTURE',
  provider: 'deterministic-fixture', model: 'source-locked-v1', promptVersion: '3', promptDigest: 'a'.repeat(64),
  evaluationVersion: 'source-78-checked-evidence-1', contextDigest: 'b'.repeat(64),
  contextCounts: { results: 1, observations: 0, priorInterventions: 0, activities: 2 },
  runState: 'PROPOSAL_READY', outputObservation: 'ACCEPTED', failureCode: null,
  inputTokens: 0, outputTokens: 0, latencyMs: 15, costBasis: 'DETERMINISTIC_FIXTURE', cost: 0, reservedBudget: 0,
};
const estimated: IntelligenceAnalyticsContext = { ...fixture, generationMode: 'LIVE', provider: 'azure-foundry', model: 'gpt-5-mini', inputTokens: 350, outputTokens: 100, costBasis: 'CONFIGURED_TOKEN_RATES', cost: 0.003, reservedBudget: 1 };
const review: NonNullable<IntelligenceAnalyticsContext['review']> = { usefulness: 'UNKNOWN', grounding: 'SUPPORTED', privacy: 'NO_ISSUE_OBSERVED', toolSafety: 'UNKNOWN' };
const basePropertyNames = ['distinct_id', '$insert_id', '$process_person_profile', '$ip', 'school', 'schema_version', 'cuevo_source', 'data_class', 'synthetic_environment', 'environment', 'pseudonym_key_version', 'actor_role'];
const aiPropertyNames = ['ai_purpose', 'generation_mode', 'ai_provider', 'ai_model', 'prompt_version', 'prompt_digest', 'evaluation_version', 'intelligence_run', 'context_reference', 'context_results_count', 'context_observations_count', 'context_prior_interventions_count', 'context_activities_count', 'output_observation', 'run_state', 'failure_code', 'input_tokens', 'output_tokens', 'ai_latency_ms', 'cost_basis', 'estimated_cost_usd', 'reserved_budget_usd', 'billed_cost_status'];
const hmac = (value: string, key = live.pseudonymKey) => createHmac('sha256', key).update(value).digest('hex');
const capture = (ai_context: unknown, type = source.type) => createPosthogEvent({ ...source, type, ai_context }, live);
const failed = (overrides: Partial<IntelligenceAnalyticsContext> = {}): IntelligenceAnalyticsContext => ({ ...estimated, runState: 'FAILED', outputObservation: 'NOT_EVALUATED', failureCode: 'INTELLIGENCE_PROVIDER_FAILED', inputTokens: null, outputTokens: null, latencyMs: null, cost: null, ...overrides });

describe('custom intelligence analytics projection', () => {
  it('maps one terminal fixture observation to the exact bounded custom field set', async () => {
    const event = await capture(fixture);
    expect(event?.event).toBe('cuevo_intelligence_run_observed');
    expect(Object.keys(event!.properties).sort()).toEqual([...basePropertyNames, ...aiPropertyNames].sort());
    expect(event?.properties).toMatchObject({ ai_purpose: 'NEXT_LEARNING_ACTION', generation_mode: 'FIXTURE', ai_provider: 'deterministic-fixture', ai_model: 'source-locked-v1', prompt_version: '3', prompt_digest: fixture.promptDigest, evaluation_version: fixture.evaluationVersion, run_state: 'PROPOSAL_READY', output_observation: 'ACCEPTED', failure_code: null, input_tokens: 0, output_tokens: 0, ai_latency_ms: 15, cost_basis: 'DETERMINISTIC_FIXTURE', estimated_cost_usd: 0, reserved_budget_usd: 0, billed_cost_status: 'UNKNOWN', context_results_count: 1, context_observations_count: 0, context_prior_interventions_count: 0, context_activities_count: 2 });
    expect(event?.properties).toMatchObject({ schema_version: 2, data_class: 'SYNTHETIC', cuevo_source: 'cuevo-repository', synthetic_environment: true, environment: 'QA', actor_role: 'teacher', $process_person_profile: false, $ip: null });
    expect(event?.properties.$insert_id).toBe(hmac(`posthog:393668:v1:${source.id}`));
  });
  it('uses distinct tenant/destination/version run and context HMAC namespaces and stable retry identity', async () => {
    const first = (await capture(fixture))!;
    expect(first.properties.intelligence_run).toBe(hmac(`posthog:393668:v1:intelligence-run:${source.school_id}:${fixture.runId}`));
    expect(first.properties.context_reference).toBe(hmac(`posthog:393668:v1:intelligence-context:${source.school_id}:${fixture.contextDigest}`));
    expect(first.properties.intelligence_run).not.toBe(first.properties.context_reference);
    expect(await capture(fixture)).toEqual(first);
    const nextSource = await createPosthogEvent({ ...source, id: '71000000-0000-4000-8000-000000000003', ai_context: fixture }, live);
    expect(nextSource?.properties.intelligence_run).toBe(first.properties.intelligence_run);
    expect(nextSource?.properties.context_reference).toBe(first.properties.context_reference);
    expect(nextSource?.properties.$insert_id).not.toBe(first.properties.$insert_id);
    const otherActor = await createPosthogEvent({ ...source, actor_id: '20000000-0000-4000-8000-000000000013', ai_context: fixture }, live);
    expect(otherActor?.properties.intelligence_run).toBe(first.properties.intelligence_run);
    expect(otherActor?.properties.distinct_id).not.toBe(first.properties.distinct_id);
    const otherSchool = await createPosthogEvent({ ...source, school_id: '10000000-0000-4000-8000-000000000002', ai_context: fixture }, live);
    expect(otherSchool?.properties.intelligence_run).not.toBe(first.properties.intelligence_run);
    expect(otherSchool?.properties.context_reference).not.toBe(first.properties.context_reference);
    const nextVersion = await createPosthogEvent({ ...source, key_version: 2, ai_context: fixture }, { ...live, keyVersion: 2 });
    expect(nextVersion?.properties.intelligence_run).not.toBe(first.properties.intelligence_run);
    expect(nextVersion?.properties.context_reference).not.toBe(first.properties.context_reference);
    const nextKey = await createPosthogEvent({ ...source, ai_context: fixture }, { ...live, pseudonymKey: 'd'.repeat(64) });
    expect(nextKey?.properties.intelligence_run).not.toBe(first.properties.intelligence_run);
  });
  it('drops raw row metadata and every run/context identity while retaining only the allowed prompt digest', async () => {
    const sentinel = 'PRIVATE_RAW_SENTINEL';
    const event = await createPosthogEvent({ ...source, ai_context: fixture, metadata: { learnerId: sentinel, learnerName: sentinel, email: sentinel, prompt: sentinel, output: sentinel, evidence: sentinel, context: sentinel, recommendation: sentinel, reason: sentinel, providerUrl: sentinel, credential: sentinel }, raw_context: sentinel, runId: fixture.runId, contextDigest: fixture.contextDigest }, live);
    expect(event).not.toBeNull();
    const serialized = JSON.stringify(event);
    for (const forbidden of [sentinel, fixture.runId, fixture.contextDigest, source.school_id, source.actor_id, source.id, source.lease_token, live.projectKey, live.pseudonymKey]) expect(serialized).not.toContain(forbidden);
    for (const forbidden of ['ai_context', 'runId', 'contextDigest', 'cost', 'metadata', 'reason', '$ai_input', '$ai_output', '$ai_total_cost_usd']) expect(event!.properties).not.toHaveProperty(forbidden);
    expect(serialized).toContain(fixture.promptDigest);
  });
  it('requires valid context for both new events and preserves absent/null context for legacy source events', async () => {
    for (const type of ['intelligence.run_observed', 'intelligence.quality.reviewed']) {
      expect(await createPosthogEvent({ ...source, type }, live)).toBeNull();
      expect(await capture(null, type)).toBeNull();
    }
    for (const type of ['activity.complete', 'recommendation.approved', 'intervention.completed', 'outcome.measured']) {
      const absent = await createPosthogEvent({ ...source, type }, live);
      expect(absent).not.toBeNull();
      expect(await capture(null, type)).toEqual(absent);
      expect(absent?.properties).not.toHaveProperty('intelligence_run');
      expect(await capture({}, type)).toBeNull();
      expect(await capture(undefined, type)).toBeNull();
    }
    expect(await capture(fixture, 'activity.complete')).toBeNull();
    expect(await capture(fixture, 'diagnostic.browser')).toBeNull();
  });
  it('rejects extra fields and missing baseline fields before pseudonymizing the context', async () => {
    for (const key of Object.keys(fixture)) {
      const incomplete = { ...fixture } as Record<string, unknown>;
      delete incomplete[key];
      expect(await capture(incomplete)).toBeNull();
    }
    for (const context of [[], 'PRIVATE_RAW_SENTINEL', { ...fixture, reason: 'PRIVATE_RAW_SENTINEL' }, { ...fixture, runId: 'not-a-uuid' }, { ...fixture, contextCounts: { ...fixture.contextCounts, learnerIds: ['PRIVATE_RAW_SENTINEL'] } }]) expect(await capture(context)).toBeNull();
  });
  it.each(['private model', 'child@private.test', 'https://private.test', 'private/model', 'private\nmodel', 'private\u007fmodel', '.starts-with-dot', 'a'.repeat(101)])('rejects unsafe provider/model technical value %s', async value => {
    expect(await capture({ ...estimated, provider: value })).toBeNull();
    expect(await capture({ ...estimated, model: value })).toBeNull();
  });
  it('accepts bounded technical tokens and only source-locked prompt/evaluation markers', async () => {
    expect(await capture({ ...estimated, provider: 'Azure-Foundry:v1', model: 'gpt.5_mini:1' })).not.toBeNull();
    for (const promptVersion of ['1', '2', '3']) expect(await capture({ ...fixture, promptVersion })).not.toBeNull();
    for (const promptVersion of [1, '4', 'source-3', null]) expect(await capture({ ...fixture, promptVersion })).toBeNull();
    for (const bad of ['A'.repeat(64), 'a'.repeat(63), 'not-sha256', null]) {
      expect(await capture({ ...fixture, promptDigest: bad })).toBeNull();
      expect(await capture({ ...fixture, contextDigest: bad })).toBeNull();
    }
    expect(await capture({ ...fixture, evaluationVersion: 'private-evaluation' })).toBeNull();
    expect(await capture({ ...fixture, purpose: 'GENERAL_CHAT' })).toBeNull();
  });
  it('preserves zero and unknown context counts with source limits', async () => {
    const event = await capture({ ...fixture, contextCounts: { results: null, observations: 20, priorInterventions: 10, activities: null } });
    expect(event?.properties).toMatchObject({ context_results_count: null, context_observations_count: 20, context_prior_interventions_count: 10, context_activities_count: null });
    for (const [key, maximum] of [['results', 10], ['observations', 20], ['priorInterventions', 10], ['activities', 10]] as const) {
      for (const value of [-1, 0.5, maximum + 1, '0', undefined, Number.NaN]) expect(await capture({ ...fixture, contextCounts: { ...fixture.contextCounts, [key]: value } })).toBeNull();
    }
  });
  it.each([['inputTokens', 1_000_000], ['outputTokens', 4000], ['latencyMs', 31_000]] as const)('keeps %s nullable and bounded to %i', async (key, maximum) => {
    expect(await capture(failed({ [key]: maximum }))).not.toBeNull();
    expect(await capture(failed({ [key]: 0 }))).not.toBeNull();
    for (const value of [-1, 0.5, maximum + 1, '0', undefined, Number.NaN, Number.POSITIVE_INFINITY]) expect(await capture({ ...failed(), [key]: value })).toBeNull();
  });
  it('requires exact terminal observation and failure code combinations', async () => {
    for (const failureCode of intelligenceAnalyticsFailureCodes) expect(await capture(failed({ failureCode }))).not.toBeNull();
    expect((await capture(failed({ outputObservation: 'REJECTED', failureCode: 'INTELLIGENCE_REQUIRES_REVIEW' })))?.properties.output_observation).toBe('REJECTED');
    for (const context of [{ ...fixture, runState: 'REASONING' }, { ...fixture, outputObservation: 'NOT_EVALUATED' }, { ...fixture, failureCode: 'INTELLIGENCE_TIMEOUT' }, { ...failed(), outputObservation: 'ACCEPTED' }, { ...failed(), failureCode: null }, { ...failed(), failureCode: 'PRIVATE_ERROR_TEXT' }, { ...failed(), outputObservation: 'REJECTED' }]) expect(await capture(context)).toBeNull();
    for (const field of ['outputTokens', 'latencyMs', 'cost', 'inputTokens']) expect(await capture({ ...estimated, [field]: null })).toBeNull();
    expect(await capture(failed(), 'intervention.completed')).toBeNull();
  });
});

describe('persisted accounting basis without billed-cost inference', () => {
  it('exports configured token-rate estimates only for a retained successful run', async () => {
    expect((await capture(estimated))?.properties).toMatchObject({ generation_mode: 'LIVE', cost_basis: 'CONFIGURED_TOKEN_RATES', input_tokens: 350, output_tokens: 100, estimated_cost_usd: 0.003, reserved_budget_usd: 1, billed_cost_status: 'UNKNOWN' });
    expect((await capture(failed({ inputTokens: 350, outputTokens: 100, latencyMs: 18, cost: 0.003 })))?.properties).toMatchObject({ input_tokens: 350, output_tokens: 100, ai_latency_ms: 18, estimated_cost_usd: null, reserved_budget_usd: 1, billed_cost_status: 'UNKNOWN' });
  });
  it('keeps a budget reservation distinct from consumption and billing', async () => {
    const context = { ...estimated, costBasis: 'BUDGET_RESERVATION', cost: 1 };
    const event = await capture(context);
    expect(event?.properties).toMatchObject({ cost_basis: 'BUDGET_RESERVATION', estimated_cost_usd: null, reserved_budget_usd: 1, billed_cost_status: 'UNKNOWN' });
    expect(event?.properties).not.toHaveProperty('cost');
    expect(await capture({ ...context, cost: 0.2 })).toBeNull();
    expect((await capture(failed({ costBasis: 'BUDGET_RESERVATION', cost: null })))?.properties).toMatchObject({ input_tokens: null, output_tokens: null, ai_latency_ms: null, estimated_cost_usd: null, reserved_budget_usd: 1 });
  });
  it('does not assign configured or billed cost to legacy accounting', async () => {
    const event = await capture({ ...estimated, costBasis: 'LEGACY_UNSPECIFIED', inputTokens: null });
    expect(event?.properties).toMatchObject({ cost_basis: 'LEGACY_UNSPECIFIED', input_tokens: null, estimated_cost_usd: null, reserved_budget_usd: 1, billed_cost_status: 'UNKNOWN' });
    expect((await capture(failed({ costBasis: 'LEGACY_UNSPECIFIED' })))?.properties.estimated_cost_usd).toBeNull();
  });
  it('preserves absent failure usage without inventing zero or a completed provider call', async () => {
    const event = await capture(failed({ failureCode: 'INTELLIGENCE_TIMEOUT' }));
    expect(event?.properties).toMatchObject({ generation_mode: 'LIVE', run_state: 'FAILED', output_observation: 'NOT_EVALUATED', failure_code: 'INTELLIGENCE_TIMEOUT', input_tokens: null, output_tokens: null, ai_latency_ms: null, estimated_cost_usd: null, reserved_budget_usd: 1, billed_cost_status: 'UNKNOWN' });
    expect(event?.properties).not.toHaveProperty('provider_call_completed');
  });
  it('requires fixed fixture provider/model/basis and exact known zero usage/cost', async () => {
    const failedFixture = failed({ ...fixture, runState: 'FAILED', outputObservation: 'NOT_EVALUATED', failureCode: 'INTELLIGENCE_TIMEOUT', inputTokens: null, outputTokens: null, latencyMs: null, cost: null });
    expect((await capture(failedFixture))?.properties).toMatchObject({ generation_mode: 'FIXTURE', input_tokens: null, output_tokens: null, ai_latency_ms: null, estimated_cost_usd: null, reserved_budget_usd: 0 });
    expect(await capture({ ...failedFixture, inputTokens: 0, outputTokens: 0, cost: 0 })).not.toBeNull();
    for (const context of [{ ...fixture, provider: 'azure-foundry' }, { ...fixture, model: 'gpt-5-mini' }, { ...fixture, costBasis: 'CONFIGURED_TOKEN_RATES' }, { ...fixture, costBasis: 'LEGACY_UNSPECIFIED' }, { ...fixture, inputTokens: 1 }, { ...fixture, outputTokens: 1 }, { ...fixture, cost: 0.01 }, { ...fixture, reservedBudget: 1 }, { ...estimated, costBasis: 'DETERMINISTIC_FIXTURE' }, { ...failedFixture, outputTokens: 1 }]) expect(await capture(context)).toBeNull();
  });
  it('rejects unknown accounting bases and invalid cost/reservation values', async () => {
    expect(await capture({ ...estimated, costBasis: 'BILLED' })).toBeNull();
    for (const value of [-1, 10.001, '0', undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await capture({ ...estimated, cost: value })).toBeNull();
      expect(await capture({ ...estimated, reservedBudget: value })).toBeNull();
    }
    expect(await capture({ ...estimated, reservedBudget: null })).toBeNull();
    expect(await capture({ ...estimated, cost: 10, reservedBudget: 10 })).not.toBeNull();
  });
});

describe('explicit observed quality, decision and support outcomes', () => {
  it('requires the complete review only on the quality event and exports no human reason', async () => {
    const event = await capture({ ...fixture, review }, 'intelligence.quality.reviewed');
    expect(event?.event).toBe('cuevo_intelligence_quality_reviewed');
    expect(Object.keys(event!.properties).sort()).toEqual([...basePropertyNames, ...aiPropertyNames, 'quality_usefulness', 'quality_grounding', 'quality_privacy', 'quality_tool_safety'].sort());
    expect(event?.properties).toMatchObject({ quality_usefulness: 'UNKNOWN', quality_grounding: 'SUPPORTED', quality_privacy: 'NO_ISSUE_OBSERVED', quality_tool_safety: 'UNKNOWN' });
    expect(await capture(fixture, 'intelligence.quality.reviewed')).toBeNull();
    for (const type of ['intelligence.run_observed', 'recommendation.approved', 'intervention.completed', 'outcome.measured']) expect(await capture({ ...fixture, review }, type)).toBeNull();
    for (const bad of [null, { ...review, reason: 'PRIVATE_RAW_SENTINEL' }, { ...review, usefulness: true }, { ...review, toolSafety: 'SAFE' }]) expect(await capture({ ...fixture, review: bad }, 'intelligence.quality.reviewed')).toBeNull();
    for (const key of Object.keys(review)) {
      const incomplete = { ...review } as Record<string, unknown>; delete incomplete[key];
      expect(await capture({ ...fixture, review: incomplete }, 'intelligence.quality.reviewed')).toBeNull();
    }
  });
  it('retains every actual human category including UNKNOWN without automatic quality judgments', async () => {
    const categories = { usefulness: intelligenceAnalyticsUsefulness, grounding: intelligenceAnalyticsGrounding, privacy: intelligenceAnalyticsPrivacy, toolSafety: intelligenceAnalyticsToolSafety };
    for (const [key, values] of Object.entries(categories)) for (const value of values) expect(await capture({ ...fixture, review: { ...review, [key]: value } }, 'intelligence.quality.reviewed')).not.toBeNull();
  });
  it('links actual decision status and recorded overrides, with absence remaining null', async () => {
    for (const [type, decision] of [['recommendation.approved', 'APPROVED'], ['recommendation.rejected', 'REJECTED']] as const) {
      for (const decisionOverride of [true, false, null]) expect((await capture({ ...fixture, decisionOverride }, type))?.properties).toMatchObject({ decision, decision_override: decisionOverride });
      expect((await capture(fixture, type))?.properties.decision_override).toBeNull();
      expect(await capture({ ...fixture, decisionOverride: 'true' }, type)).toBeNull();
      expect(Object.keys((await capture({ ...fixture, decisionOverride: false }, type))!.properties).sort()).toEqual([...basePropertyNames, ...aiPropertyNames, 'decision', 'decision_override'].sort());
    }
    for (const type of ['intelligence.run_observed', 'intelligence.quality.reviewed', 'intervention.completed']) expect(await capture({ ...fixture, decisionOverride: false }, type)).toBeNull();
    expect((await createPosthogEvent({ ...source, type: 'recommendation.approved' }, live))?.properties).not.toHaveProperty('decision_override');
  });
  it('links support stages to the same run and does not manufacture a second proposal event', async () => {
    const terminal = (await capture(fixture))!;
    for (const type of ['intervention.created', 'intervention.completed', 'reassessment.linked']) {
      const event = await capture(fixture, type);
      expect(event?.properties.intelligence_run).toBe(terminal.properties.intelligence_run);
      expect(event?.properties.context_reference).toBe(terminal.properties.context_reference);
      expect(Object.keys(event!.properties).sort()).toEqual([...basePropertyNames, ...aiPropertyNames].sort());
    }
    expect(await capture(fixture, 'recommendation.created')).toBeNull();
  });
  it('exports numeric recorded statuses/comparability without scalar results or causal claims', async () => {
    for (const status of ['improved', 'no_meaningful_change', 'inconclusive']) {
      const event = await capture({ ...fixture, outcome: { status, model: 'numeric', comparability: 'COMPARABLE' } }, 'outcome.measured');
      expect(event?.properties).toMatchObject({ outcome_status: status, outcome_model: 'numeric', outcome_comparability: 'COMPARABLE' });
      expect(Object.keys(event!.properties).sort()).toEqual([...basePropertyNames, ...aiPropertyNames, 'outcome_status', 'outcome_model', 'outcome_comparability'].sort());
      for (const forbidden of ['score', 'difference', 'minimum_change', 'attainment', 'ai_caused_improvement']) expect(event!.properties).not.toHaveProperty(forbidden);
    }
    expect(await capture(fixture, 'outcome.measured')).toBeNull();
    expect(await capture({ ...fixture, outcome: { status: 'improved', model: 'numeric', comparability: 'UNKNOWN' } }, 'outcome.measured')).toBeNull();
  });
  it('retains rubric UNKNOWN/inconclusive and rejects unsupported comparisons or extra outcome facts', async () => {
    const outcome = { status: 'inconclusive', model: 'rubric', comparability: 'UNKNOWN' };
    expect((await capture({ ...fixture, outcome }, 'outcome.measured'))?.properties).toMatchObject({ outcome_status: 'inconclusive', outcome_model: 'rubric', outcome_comparability: 'UNKNOWN' });
    for (const bad of [null, { ...outcome, status: 'improved' }, { ...outcome, comparability: 'COMPARABLE' }, { ...outcome, model: 'unknown' }, { ...outcome, difference: 5 }, { ...outcome, reason: 'PRIVATE_RAW_SENTINEL' }]) expect(await capture({ ...fixture, outcome: bad }, 'outcome.measured')).toBeNull();
    for (const key of Object.keys(outcome)) {
      const incomplete = { ...outcome } as Record<string, unknown>; delete incomplete[key];
      expect(await capture({ ...fixture, outcome: incomplete }, 'outcome.measured')).toBeNull();
    }
    expect(await capture({ ...fixture, outcome }, 'intelligence.run_observed')).toBeNull();
  });
  it('still rejects current environment/key/source/actor drift for valid AI metadata', async () => {
    for (const changed of [{ environment: 'DEMO' }, { key_version: 2 }, { actor_role: 'PRIVATE_RAW_SENTINEL' }, { type: 'intelligence.run_failed' }, { school_id: 'not-a-school' }, { actor_id: 'not-an-actor' }]) expect(await createPosthogEvent({ ...source, ...changed, ai_context: fixture }, live)).toBeNull();
  });
});
