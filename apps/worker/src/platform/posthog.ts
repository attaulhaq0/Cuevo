import { analyticsSourceNames, diagnosticCategories, diagnosticFeatures, diagnosticStatuses, diagnosticTimings, diagnosticLocales, diagnosticViewports, intelligenceAnalyticsFailureCodes, intelligenceAnalyticsCostBases, intelligenceAnalyticsUsefulness, intelligenceAnalyticsGrounding, intelligenceAnalyticsPrivacy, intelligenceAnalyticsToolSafety, type AnalyticsEnvironment, type AnalyticsEventName, type BrowserDiagnosticObservation, type IntelligenceAnalyticsContext, type IntelligenceAnalyticsProperties } from '@cuevo/contracts/analytics';

import { hostedSyntheticRuntime, requireSyntheticAnalyticsSources } from '@cuevo/config/synthetic-runtime';
export type WorkerAnalyticsConfig = { mode: 'DISABLED' } | { mode: 'LIVE_SYNTHETIC'; projectId: 393668; host: 'https://us.i.posthog.com'; projectKey: string; pseudonymKey: string; keyVersion: number; environment: AnalyticsEnvironment };
export type LiveAnalyticsConfig = Extract<WorkerAnalyticsConfig, { mode: 'LIVE_SYNTHETIC' }>;
export type PosthogEvent = { event: AnalyticsEventName; timestamp: string; properties: { distinct_id: string; $insert_id: string; $process_person_profile: false; $ip: null; school: string; schema_version: 2; cuevo_source: 'cuevo-repository'; data_class: 'SYNTHETIC'; synthetic_environment: true; environment: AnalyticsEnvironment; pseudonym_key_version: number; actor_role: string; decision?: 'APPROVED' | 'REJECTED'; native_kind?: 'NUMERIC' | 'RUBRIC' } & Partial<BrowserDiagnosticObservation> & Partial<IntelligenceAnalyticsProperties> };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const technicalToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const member = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T);
const boundedInteger = (value: unknown, maximum: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const nullableInteger = (value: unknown, maximum: number): value is number | null => value === null || boundedInteger(value, maximum);
const boundedCost = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
const intelligenceContextKeys = ['runId', 'purpose', 'generationMode', 'provider', 'model', 'promptVersion', 'promptDigest', 'evaluationVersion', 'contextDigest', 'contextCounts', 'runState', 'outputObservation', 'failureCode', 'inputTokens', 'outputTokens', 'latencyMs', 'costBasis', 'cost', 'reservedBudget'] as const;
const intelligenceStageTypes = ['intelligence.run_observed', 'intelligence.quality.reviewed', 'recommendation.approved', 'recommendation.rejected', 'intervention.created', 'intervention.completed', 'reassessment.linked', 'outcome.measured'] as const;
const decisionTypes = ['recommendation.approved', 'recommendation.rejected'] as const;

/** Edge reads only the same explicit operator settings as Node, without server package imports. */
export function parseWorkerAnalyticsConfig(input: Record<string, string | undefined>): WorkerAnalyticsConfig {
  const mode = input.POSTHOG_CAPTURE_MODE || 'DISABLED';
  if (mode === 'DISABLED') return { mode };
  const hosted = hostedSyntheticRuntime(input);
  requireSyntheticAnalyticsSources(input, hosted);
  const production = input.NODE_ENV === 'production' || input.CUEVO_DEPLOYMENT_ENVIRONMENT === 'production';
  const version = Number(input.POSTHOG_PSEUDONYM_KEY_VERSION);
  const projectKey = input.POSTHOG_PROJECT_KEY;
  if (mode !== 'LIVE_SYNTHETIC' || production && !hosted || hosted && input.POSTHOG_ENVIRONMENT !== 'STAGING' || input.POSTHOG_PROJECT_ID !== '393668' || input.POSTHOG_HOST !== 'https://us.i.posthog.com' || !projectKey || projectKey.length > 200 || /\s/.test(projectKey) || [...projectKey].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || !/^[a-fA-F0-9]{64}$/.test(input.POSTHOG_PSEUDONYM_KEY ?? '') || !Number.isSafeInteger(version) || version < 1 || !['QA', 'DEMO', 'STAGING'].includes(input.POSTHOG_ENVIRONMENT ?? '')) throw new Error('Invalid synthetic PostHog configuration.');
  return { mode, projectId: 393668, host: 'https://us.i.posthog.com', projectKey, pseudonymKey: input.POSTHOG_PSEUDONYM_KEY!, keyVersion: version, environment: input.POSTHOG_ENVIRONMENT as AnalyticsEnvironment };
}
function diagnostic(value: unknown): BrowserDiagnosticObservation | null {
  if (!object(value) || Object.keys(value).sort().join('|') !== 'category|feature|locale|status|timing|viewport') return null;
  const allowed: Record<string, readonly string[]> = { category: diagnosticCategories, feature: diagnosticFeatures, status: diagnosticStatuses, timing: diagnosticTimings, locale: diagnosticLocales, viewport: diagnosticViewports };
  if (!Object.entries(allowed).every(([key, values]) => typeof value[key] === 'string' && values.includes(value[key]))) return null;
  return { category: value.category, feature: value.feature, status: value.status, timing: value.timing, locale: value.locale, viewport: value.viewport } as BrowserDiagnosticObservation;
}
/** Validate the constructed private projection; SQL retains source/binding/actor authority. */
function intelligenceContext(value: unknown, sourceType: string): IntelligenceAnalyticsContext | null {
  if (!member(sourceType, intelligenceStageTypes) || !object(value) || !exactKeys(value, intelligenceContextKeys, ['review', 'decisionOverride', 'outcome'])) return null;
  if (typeof value.runId !== 'string' || !uuid.test(value.runId) || value.purpose !== 'NEXT_LEARNING_ACTION'
    || !member(value.generationMode, ['FIXTURE', 'LIVE']) || typeof value.provider !== 'string' || !technicalToken.test(value.provider) || typeof value.model !== 'string' || !technicalToken.test(value.model)
    || !member(value.promptVersion, ['1', '2', '3']) || typeof value.promptDigest !== 'string' || !digest.test(value.promptDigest) || value.evaluationVersion !== 'source-78-checked-evidence-1'
    || typeof value.contextDigest !== 'string' || !digest.test(value.contextDigest) || !member(value.runState, ['PROPOSAL_READY', 'FAILED']) || !member(value.outputObservation, ['ACCEPTED', 'REJECTED', 'NOT_EVALUATED'])
    || !(value.failureCode === null || member(value.failureCode, intelligenceAnalyticsFailureCodes)) || !member(value.costBasis, intelligenceAnalyticsCostBases)
    || !nullableInteger(value.inputTokens, 1_000_000) || !nullableInteger(value.outputTokens, 4000) || !nullableInteger(value.latencyMs, 31_000)
    || !(value.cost === null || boundedCost(value.cost)) || !boundedCost(value.reservedBudget)) return null;
  if (!object(value.contextCounts) || !exactKeys(value.contextCounts, ['results', 'observations', 'priorInterventions', 'activities'])
    || !nullableInteger(value.contextCounts.results, 10) || !nullableInteger(value.contextCounts.observations, 20) || !nullableInteger(value.contextCounts.priorInterventions, 10) || !nullableInteger(value.contextCounts.activities, 10)) return null;
  if (value.runState === 'PROPOSAL_READY') {
    if (value.outputObservation !== 'ACCEPTED' || value.failureCode !== null || value.outputTokens === null || value.latencyMs === null || value.cost === null
      || value.costBasis !== 'LEGACY_UNSPECIFIED' && value.inputTokens === null) return null;
  } else if (value.outputObservation === 'ACCEPTED' || value.failureCode === null || value.outputObservation === 'REJECTED' && value.failureCode !== 'INTELLIGENCE_REQUIRES_REVIEW') return null;
  if (value.generationMode === 'FIXTURE') {
    if (value.provider !== 'deterministic-fixture' || value.model !== 'source-locked-v1' || value.costBasis !== 'DETERMINISTIC_FIXTURE' || value.reservedBudget !== 0
      || value.inputTokens !== null && value.inputTokens !== 0 || value.outputTokens !== null && value.outputTokens !== 0 || value.cost !== null && value.cost !== 0) return null;
  } else if (value.costBasis === 'DETERMINISTIC_FIXTURE') return null;
  if (value.runState === 'PROPOSAL_READY' && value.costBasis === 'BUDGET_RESERVATION' && value.cost !== value.reservedBudget) return null;
  if (sourceType !== 'intelligence.run_observed' && value.runState !== 'PROPOSAL_READY') return null;
  if (Object.hasOwn(value, 'review')) {
    if (sourceType !== 'intelligence.quality.reviewed' || !object(value.review) || !exactKeys(value.review, ['usefulness', 'grounding', 'privacy', 'toolSafety'])
      || !member(value.review.usefulness, intelligenceAnalyticsUsefulness) || !member(value.review.grounding, intelligenceAnalyticsGrounding)
      || !member(value.review.privacy, intelligenceAnalyticsPrivacy) || !member(value.review.toolSafety, intelligenceAnalyticsToolSafety)) return null;
  } else if (sourceType === 'intelligence.quality.reviewed') return null;
  if (Object.hasOwn(value, 'decisionOverride') && (!member(sourceType, decisionTypes) || !(value.decisionOverride === null || typeof value.decisionOverride === 'boolean'))) return null;
  if (Object.hasOwn(value, 'outcome')) {
    if (sourceType !== 'outcome.measured' || !object(value.outcome) || !exactKeys(value.outcome, ['status', 'model', 'comparability'])
      || !member(value.outcome.status, ['improved', 'no_meaningful_change', 'inconclusive']) || !member(value.outcome.model, ['numeric', 'rubric']) || !member(value.outcome.comparability, ['COMPARABLE', 'UNKNOWN'])
      || value.outcome.model === 'rubric' && (value.outcome.comparability !== 'UNKNOWN' || value.outcome.status !== 'inconclusive')
      || value.outcome.model === 'numeric' && value.outcome.comparability !== 'COMPARABLE') return null;
  } else if (sourceType === 'outcome.measured') return null;
  return value as IntelligenceAnalyticsContext;
}
async function intelligenceProperties(context: IntelligenceAnalyticsContext, schoolId: string, sourceType: string, config: LiveAnalyticsConfig, hash: (value: string) => Promise<string>): Promise<IntelligenceAnalyticsProperties> {
  return {
    ai_purpose: context.purpose, generation_mode: context.generationMode, ai_provider: context.provider, ai_model: context.model,
    prompt_version: context.promptVersion, prompt_digest: context.promptDigest, evaluation_version: context.evaluationVersion,
    intelligence_run: await hash(`posthog:393668:v${config.keyVersion}:intelligence-run:${schoolId}:${context.runId}`),
    context_reference: await hash(`posthog:393668:v${config.keyVersion}:intelligence-context:${schoolId}:${context.contextDigest}`),
    context_results_count: context.contextCounts.results, context_observations_count: context.contextCounts.observations,
    context_prior_interventions_count: context.contextCounts.priorInterventions, context_activities_count: context.contextCounts.activities,
    output_observation: context.outputObservation, run_state: context.runState, failure_code: context.failureCode,
    input_tokens: context.inputTokens, output_tokens: context.outputTokens, ai_latency_ms: context.latencyMs, cost_basis: context.costBasis,
    estimated_cost_usd: context.runState === 'PROPOSAL_READY' && (context.costBasis === 'DETERMINISTIC_FIXTURE' || context.costBasis === 'CONFIGURED_TOKEN_RATES') ? context.cost : null,
    reserved_budget_usd: context.reservedBudget, billed_cost_status: 'UNKNOWN',
    ...(context.review ? { quality_usefulness: context.review.usefulness, quality_grounding: context.review.grounding, quality_privacy: context.review.privacy, quality_tool_safety: context.review.toolSafety } : {}),
    ...(member(sourceType, decisionTypes) ? { decision_override: context.decisionOverride ?? null } : {}),
    ...(context.outcome ? { outcome_status: context.outcome.status, outcome_model: context.outcome.model, outcome_comparability: context.outcome.comparability } : {}),
  };
}
export async function createPosthogEvent(row: unknown, config: LiveAnalyticsConfig): Promise<PosthogEvent | null> {
  if (!object(row) || typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.school_id !== 'string' || !uuid.test(row.school_id) || typeof row.actor_id !== 'string' || !uuid.test(row.actor_id) || typeof row.type !== 'string' || !Object.hasOwn(analyticsSourceNames, row.type) || row.environment !== config.environment || row.key_version !== config.keyVersion || typeof row.actor_role !== 'string' || !['admin', 'coordinator', 'teacher', 'student', 'parent'].includes(row.actor_role)) return null;
  const timestamp = row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at;
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) return null;
  const observations = row.type === 'diagnostic.browser' ? diagnostic(row.diagnostics) : null;
  if (row.type === 'diagnostic.browser' && !observations) return null;
  const hasIntelligence = Object.hasOwn(row, 'ai_context') && row.ai_context !== null;
  const intelligence = hasIntelligence ? intelligenceContext(row.ai_context, row.type) : null;
  if (hasIntelligence && !intelligence || (row.type === 'intelligence.run_observed' || row.type === 'intelligence.quality.reviewed') && !intelligence) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.pseudonymKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
  const aiProperties = intelligence ? await intelligenceProperties(intelligence, row.school_id, row.type, config, hash) : {};
  return { event: analyticsSourceNames[row.type as keyof typeof analyticsSourceNames], timestamp, properties: { distinct_id: await hash(`${row.school_id}:${row.actor_id}`), $insert_id: await hash(`posthog:393668:v${config.keyVersion}:${row.id}`), $process_person_profile: false, $ip: null, school: await hash(row.school_id), schema_version: 2, cuevo_source: 'cuevo-repository', data_class: 'SYNTHETIC', synthetic_environment: true, environment: config.environment, pseudonym_key_version: config.keyVersion, actor_role: row.actor_role,
    ...(row.type === 'recommendation.approved' ? { decision: 'APPROVED' as const } : row.type === 'recommendation.rejected' ? { decision: 'REJECTED' as const } : {}),
    ...(row.type === 'result.released' ? { native_kind: 'NUMERIC' as const } : row.type === 'rubric.result.released' ? { native_kind: 'RUBRIC' as const } : {}), ...(observations ?? {}), ...aiProperties } };
}
