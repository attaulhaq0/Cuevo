import { z } from 'zod';
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
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  API_ALLOWED_ORIGIN: httpOrigin.optional(), DATABASE_URL: databaseConnection.optional(), WORKER_DATABASE_URL: databaseConnection.optional(),
  SUPABASE_URL: httpOrigin.optional(), SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_').optional(), SUPABASE_SERVICE_ROLE_KEY:z.string().optional(),
  AI_PROVIDER: z.string().optional(), AI_MODEL: z.string().optional(), AI_DATA_POLICY_STATUS: z.string().optional(),
  AI_GENERATION_MODE: z.enum(['DISABLED', 'FIXTURE', 'LIVE']).default('DISABLED'),
  AI_FIXTURE_ENABLED: z.enum(['true', 'false']).default('false'),
  AI_PROMPT_ID: z.string().min(1).max(100).default('next-learning-action'), AI_PROMPT_VERSION: z.string().min(1).max(100).default('1'),
  AI_POLICY_VERSION: z.coerce.number().int().positive().default(1),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(30000).default(10000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(4000).default(1000),
  AI_MAX_COST: z.coerce.number().positive().max(10).default(1),
  OPENAI_API_KEY: z.string().optional(), POSTHOG_PROJECT_KEY: z.string().optional(), POSTHOG_HOST: z.url().optional(),
});
export function parseServerConfig(input: Record<string, string | undefined>) {
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = envSchema.safeParse(values);
  if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const localAuth = e.SUPABASE_URL && new URL(e.SUPABASE_URL).protocol === 'http:' && ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(new URL(e.SUPABASE_URL).hostname) && new URL(e.SUPABASE_URL).port === '56321';
  if (e.AI_GENERATION_MODE === 'FIXTURE' && (e.NODE_ENV === 'production' || e.AI_FIXTURE_ENABLED !== 'true' || !localAuth)) throw new Error('Fixture intelligence requires explicit local configuration and is forbidden in production.');
  if (e.AI_FIXTURE_ENABLED === 'true' && e.NODE_ENV === 'production') throw new Error('Fixture intelligence is forbidden in production.');
  const liveApproved = Boolean(e.AI_PROVIDER && e.AI_MODEL && e.OPENAI_API_KEY && e.AI_DATA_POLICY_STATUS === 'APPROVED');
  if (e.NODE_ENV === 'production' && (!e.DATABASE_URL || !e.WORKER_DATABASE_URL || !e.API_ALLOWED_ORIGIN || !e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY)) throw new Error('Production configuration is incomplete.');
  if (e.NODE_ENV === 'production' && [e.API_ALLOWED_ORIGIN, e.SUPABASE_URL].some(value => value && new URL(value).protocol !== 'https:')) throw new Error('Production browser and authentication origins require HTTPS.');
  return { nodeEnv: e.NODE_ENV, apiPort: e.API_PORT, workerPort: e.WORKER_PORT, allowedOrigin: e.API_ALLOWED_ORIGIN ?? 'http://localhost:3000', databaseUrl: e.DATABASE_URL, workerDatabaseUrl: e.WORKER_DATABASE_URL, supabaseUrl: e.SUPABASE_URL, supabasePublishableKey: e.SUPABASE_PUBLISHABLE_KEY,
    aiEnabled: e.AI_GENERATION_MODE === 'FIXTURE' || (e.AI_GENERATION_MODE === 'LIVE' && liveApproved),
    intelligence: { mode: e.AI_GENERATION_MODE, provider: e.AI_GENERATION_MODE === 'FIXTURE' ? 'deterministic-fixture' : e.AI_PROVIDER,
      model: e.AI_GENERATION_MODE === 'FIXTURE' ? 'source-locked-v1' : e.AI_MODEL,
      approved: e.AI_GENERATION_MODE === 'FIXTURE' || liveApproved, promptId: e.AI_PROMPT_ID, promptVersion: e.AI_PROMPT_VERSION,
      policyVersion: e.AI_POLICY_VERSION, timeoutMs: e.AI_TIMEOUT_MS, maxTokens: e.AI_MAX_OUTPUT_TOKENS, maxCost: e.AI_MAX_COST },
    analyticsEnabled: Boolean(e.POSTHOG_PROJECT_KEY && e.POSTHOG_HOST), storageSecret:e.SUPABASE_SERVICE_ROLE_KEY,
  };
}
export type ServerConfig = ReturnType<typeof parseServerConfig>;
export * from './analytics';
