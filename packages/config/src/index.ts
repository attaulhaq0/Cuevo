import { z } from 'zod';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase, requireSyntheticAnalyticsSources } from './synthetic-runtime';
import { parseAuthProvisioningConfig } from './auth-provisioning';
const httpOrigin = z.url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    && url.pathname === '/' && !url.search && !url.hash;
}).transform(value => new URL(value).origin);
const databaseConnection = z.url().refine(value => {
  const url = new URL(value);
  return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.username)
    && url.pathname.length > 1 && !url.hash;
});
const foundryEndpoint = z.url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (url.hostname.endsWith('.services.ai.azure.com') || url.hostname.endsWith('.openai.azure.com')) && /^\/openai\/v1\/?$/.test(url.pathname); }).transform(value => value.replace(/\/$/, ''));
const liveAnalyticsSchema = z.object({
  POSTHOG_PROJECT_ID: z.literal('393668'), POSTHOG_HOST: z.literal('https://us.i.posthog.com'),
  POSTHOG_PROJECT_KEY: z.string().min(1).max(200).refine(value => !/\s/.test(value) && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)),
  POSTHOG_PSEUDONYM_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  POSTHOG_PSEUDONYM_KEY_VERSION: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  POSTHOG_ENVIRONMENT: z.enum(['QA', 'DEMO', 'STAGING']),
});
export type AnalyticsConfig = { mode: 'DISABLED' } | {
  mode: 'LIVE_SYNTHETIC'; projectId: 393668; host: 'https://us.i.posthog.com';
  projectKey: string; pseudonymKey: string; keyVersion: number; environment: 'QA' | 'DEMO' | 'STAGING';
};
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CUEVO_DEPLOYMENT_ENVIRONMENT: z.enum(['local', 'production', 'synthetic-staging']).optional(),
  CUEVO_SYNTHETIC_PROJECT_REF: z.string().optional(), CUEVO_SYNTHETIC_WEB_ORIGIN: httpOrigin.optional(), CUEVO_DATABASE_TLS_CA: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  API_ALLOWED_ORIGIN: httpOrigin.optional(), DATABASE_URL: databaseConnection.optional(), WORKER_DATABASE_URL: databaseConnection.optional(),
  SUPABASE_URL: httpOrigin.optional(), SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_').optional(), SUPABASE_SERVICE_ROLE_KEY:z.string().optional(),
  AI_PROVIDER: z.string().optional(), AI_MODEL: z.string().optional(), AI_DATA_POLICY_STATUS: z.string().optional(),
  AI_BASE_URL: foundryEndpoint.optional(), AZURE_OPENAI_API_KEY: z.string().min(1).optional(),
  AI_INPUT_COST_PER_MILLION: z.coerce.number().positive().optional(), AI_OUTPUT_COST_PER_MILLION: z.coerce.number().positive().optional(),
  AI_GENERATION_MODE: z.enum(['DISABLED', 'FIXTURE', 'LIVE']).default('DISABLED'),
  AI_FIXTURE_ENABLED: z.enum(['true', 'false']).default('false'),
  AI_PROMPT_ID: z.string().min(1).max(100).default('next-learning-action'), AI_PROMPT_VERSION: z.string().min(1).max(100).default('2'),
  AI_POLICY_VERSION: z.coerce.number().int().positive().default(1),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(30000).default(10000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(4000).default(1000),
  AI_MAX_COST: z.coerce.number().positive().max(10).default(1),
  AI_GLOBAL_DAILY_BUDGET:z.coerce.number().positive().max(1000000).optional(),
  OPENAI_API_KEY: z.string().optional(), POSTHOG_CAPTURE_MODE: z.enum(['DISABLED', 'LIVE_SYNTHETIC']).default('DISABLED'),
});
/** This server-only fixture profile is an exact operator-selected local target.
 * It changes no school/session/source policy and never admits a live provider. */
function localPresentationProfile(input: Record<string, string | undefined>, consumer: 'all' | 'api' | 'worker'): 'INTEGRATION_PRESENTATION' | undefined {
  if (input.CUEVO_LOCAL_DEMO_MODE === undefined) return undefined;
  const failure = () => { throw new Error('Integration presentation requires the exact isolated API fixture configuration.'); };
  if (input.CUEVO_LOCAL_DEMO_MODE !== 'INTEGRATION_PRESENTATION' || consumer !== 'api'
    || input.VERCEL !== undefined || input.VERCEL_ENV !== undefined || input.VERCEL_URL !== undefined
    || !['development', 'test'].includes(input.NODE_ENV ?? '')
    || input.CUEVO_DEPLOYMENT_ENVIRONMENT !== undefined && input.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'local'
    || input.SUPABASE_URL !== 'http://127.0.0.1:57421'
    || input.API_ALLOWED_ORIGIN !== 'http://127.0.0.1:54131' || input.API_PORT !== '54132'
    || input.AI_GENERATION_MODE !== 'FIXTURE' || input.AI_FIXTURE_ENABLED !== 'true'
    || input.POSTHOG_CAPTURE_MODE !== 'DISABLED') return failure();
  const hasForbiddenAuthority = Object.entries(input).some(([key, value]) => value !== undefined && value !== '' && (
    key === 'AI_BASE_URL' || key === 'AI_PROVIDER' || key === 'AI_MODEL' || key === 'OPENAI_API_KEY' || /^AZURE.*(?:KEY|TOKEN|SECRET)$/.test(key)
    || key === 'CUEVO_SYNTHETIC_PROJECT_REF' || key === 'CUEVO_SYNTHETIC_WEB_ORIGIN'
    || key.startsWith('CUEVO_AUTH_PROVISIONING_') && !(key === 'CUEVO_AUTH_PROVISIONING_MODE' && value === 'DISABLED')
  ));
  if (hasForbiddenAuthority) return failure();
  try {
    if (!input.DATABASE_URL) return failure();
    const database = new URL(input.DATABASE_URL), password = decodeURIComponent(database.password);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.hostname !== '127.0.0.1' || database.port !== '57422'
      || database.username !== 'cuevo_api' || database.pathname !== '/cuevo_integration_20261004' || database.search || database.hash
      || !password || password.length > 4096 || [...password].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return failure();
  } catch { return failure(); }
  return 'INTEGRATION_PRESENTATION';
}
export function parseServerConfig(input: Record<string, string | undefined>, consumer: 'all' | 'api' | 'worker' = 'all') {
  const localDemoMode = localPresentationProfile(input, consumer);
  const authProvisioning = parseAuthProvisioningConfig(input, consumer);
  const values = Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== undefined && value !== '' && (consumer !== 'api' || !key.startsWith('POSTHOG_'))));
  const parsed = envSchema.safeParse(values);
  if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const hosted = hostedSyntheticRuntime(values);
  const production = e.NODE_ENV === 'production' || e.CUEVO_DEPLOYMENT_ENVIRONMENT === 'production';
  if (hosted) {
    if (consumer !== 'worker' && e.API_ALLOWED_ORIGIN !== hosted.webOrigin) throw new Error('Hosted synthetic API requires the exact reviewed web origin.');
    if (consumer !== 'worker') requireHostedSyntheticDatabase(e.DATABASE_URL, hosted, 'cuevo_api');
    if (consumer !== 'api') requireHostedSyntheticDatabase(e.WORKER_DATABASE_URL, hosted, 'cuevo_worker');
    if (e.AI_GENERATION_MODE === 'LIVE') throw new Error('Live intelligence is unavailable in hosted synthetic staging.');
  }
  let analytics: AnalyticsConfig = { mode: 'DISABLED' };
  if (consumer !== 'api' && e.POSTHOG_CAPTURE_MODE === 'LIVE_SYNTHETIC') {
    if (production && !hosted) throw new Error('Live synthetic analytics is forbidden in production.');
    requireSyntheticAnalyticsSources(values, hosted);
    const validated = liveAnalyticsSchema.safeParse(values);
    if (!validated.success) throw new Error(`Invalid analytics configuration: ${validated.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
    const a = validated.data;
    if (hosted && a.POSTHOG_ENVIRONMENT !== 'STAGING') throw new Error('Hosted synthetic analytics requires STAGING classification.');
    analytics = { mode: 'LIVE_SYNTHETIC', projectId: 393668, host: a.POSTHOG_HOST, projectKey: a.POSTHOG_PROJECT_KEY,
      pseudonymKey: a.POSTHOG_PSEUDONYM_KEY, keyVersion: a.POSTHOG_PSEUDONYM_KEY_VERSION, environment: a.POSTHOG_ENVIRONMENT };
  }
  const localAuth = e.SUPABASE_URL && new URL(e.SUPABASE_URL).protocol === 'http:' && ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(new URL(e.SUPABASE_URL).hostname) && new URL(e.SUPABASE_URL).port === '56321';
  if (e.AI_GENERATION_MODE === 'FIXTURE' && (e.AI_FIXTURE_ENABLED !== 'true' || !hosted && (production || !localAuth && !localDemoMode))) throw new Error('Fixture intelligence requires explicit local or hosted synthetic configuration and is forbidden in production.');
  if (e.AI_FIXTURE_ENABLED === 'true' && production && !hosted) throw new Error('Fixture intelligence is forbidden in production.');
  const foundry = e.AI_PROVIDER === 'azure-foundry';
  const syntheticLive = e.AI_DATA_POLICY_STATUS === 'SYNTHETIC_ONLY' && !production && localAuth;
  const hasRates = Boolean(e.AI_INPUT_COST_PER_MILLION && e.AI_OUTPUT_COST_PER_MILLION);
  const liveApproved = Boolean(e.AI_PROVIDER && e.AI_MODEL && (foundry ? e.AZURE_OPENAI_API_KEY && e.AI_BASE_URL && (syntheticLive || e.AI_DATA_POLICY_STATUS === 'APPROVED' && hasRates) : e.OPENAI_API_KEY && e.AI_DATA_POLICY_STATUS === 'APPROVED'));
  if (e.AI_DATA_POLICY_STATUS === 'SYNTHETIC_ONLY' && !syntheticLive) throw new Error('Synthetic live intelligence requires non-production local Cuevo context.');
  if (production && ((consumer !== 'worker' && (!e.DATABASE_URL || !e.API_ALLOWED_ORIGIN || !e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY)) || (consumer !== 'api' && !e.WORKER_DATABASE_URL))) throw new Error('Production configuration is incomplete.');
  if (production && [e.API_ALLOWED_ORIGIN, e.SUPABASE_URL].some(value => value && new URL(value).protocol !== 'https:')) throw new Error('Production browser and authentication origins require HTTPS.');
  const databaseTls = production || Boolean(hosted);
  if (databaseTls && [e.DATABASE_URL, e.WORKER_DATABASE_URL].some(value => value && new URL(value).search)) throw new Error('Production TLS database connections forbid URL options.');
  return { nodeEnv: e.NODE_ENV, localDemoMode, deploymentEnvironment: e.CUEVO_DEPLOYMENT_ENVIRONMENT ?? (e.NODE_ENV === 'production' ? 'production' : 'local'), syntheticProjectRef: hosted?.projectRef, databaseTls, databaseTlsCa: e.CUEVO_DATABASE_TLS_CA, apiPort: e.API_PORT, workerPort: e.WORKER_PORT, allowedOrigin: e.API_ALLOWED_ORIGIN ?? 'http://localhost:3000', databaseUrl: e.DATABASE_URL, workerDatabaseUrl: e.WORKER_DATABASE_URL, supabaseUrl: e.SUPABASE_URL, supabasePublishableKey: e.SUPABASE_PUBLISHABLE_KEY,
    aiEnabled: e.AI_GENERATION_MODE === 'FIXTURE' || (e.AI_GENERATION_MODE === 'LIVE' && liveApproved),
    intelligence: { mode: e.AI_GENERATION_MODE, provider: e.AI_GENERATION_MODE === 'FIXTURE' ? 'deterministic-fixture' : e.AI_PROVIDER,
      model: e.AI_GENERATION_MODE === 'FIXTURE' ? 'source-locked-v1' : e.AI_MODEL,
      approved: e.AI_GENERATION_MODE === 'FIXTURE' || liveApproved, promptId: e.AI_PROMPT_ID, promptVersion: e.AI_PROMPT_VERSION,
      policyVersion: e.AI_POLICY_VERSION, timeoutMs: e.AI_TIMEOUT_MS, maxTokens: e.AI_MAX_OUTPUT_TOKENS, maxCost: e.AI_MAX_COST,globalDailyBudget:e.AI_GLOBAL_DAILY_BUDGET },
    foundry: foundry ? { endpoint: e.AI_BASE_URL, apiKey: e.AZURE_OPENAI_API_KEY, syntheticOnly: Boolean(syntheticLive), inputCostPerMillion: e.AI_INPUT_COST_PER_MILLION, outputCostPerMillion: e.AI_OUTPUT_COST_PER_MILLION } : undefined,
    analytics, analyticsEnabled: analytics.mode === 'LIVE_SYNTHETIC', storageSecret:e.SUPABASE_SERVICE_ROLE_KEY, authProvisioning,
  };
}
export type ServerConfig = ReturnType<typeof parseServerConfig>;
export * from './analytics';
export * from './auth-provisioning';
