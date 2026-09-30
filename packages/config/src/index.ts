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
  SUPABASE_URL: httpOrigin.optional(), SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_').optional(),
  AI_PROVIDER: z.string().optional(), AI_MODEL: z.string().optional(), AI_DATA_POLICY_STATUS: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(), POSTHOG_PROJECT_KEY: z.string().optional(), POSTHOG_HOST: z.url().optional(),
});
export function parseServerConfig(input: Record<string, string | undefined>) {
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = envSchema.safeParse(values);
  if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && (!e.DATABASE_URL || !e.WORKER_DATABASE_URL || !e.API_ALLOWED_ORIGIN || !e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY)) throw new Error('Production configuration is incomplete.');
  if (e.NODE_ENV === 'production' && [e.API_ALLOWED_ORIGIN, e.SUPABASE_URL].some(value => value && new URL(value).protocol !== 'https:')) throw new Error('Production browser and authentication origins require HTTPS.');
  return { nodeEnv: e.NODE_ENV, apiPort: e.API_PORT, workerPort: e.WORKER_PORT, allowedOrigin: e.API_ALLOWED_ORIGIN ?? 'http://localhost:3000', databaseUrl: e.DATABASE_URL, workerDatabaseUrl: e.WORKER_DATABASE_URL, supabaseUrl: e.SUPABASE_URL, supabasePublishableKey: e.SUPABASE_PUBLISHABLE_KEY,
    aiEnabled: Boolean(e.AI_PROVIDER && e.AI_MODEL && e.OPENAI_API_KEY && e.AI_DATA_POLICY_STATUS === 'APPROVED'),
    analyticsEnabled: Boolean(e.POSTHOG_PROJECT_KEY && e.POSTHOG_HOST),
  };
}
export type ServerConfig = ReturnType<typeof parseServerConfig>;
