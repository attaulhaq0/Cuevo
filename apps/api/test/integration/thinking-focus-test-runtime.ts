import { isAbsolute } from 'node:path';
import { parseServerConfig } from '@cuevo/config';

export type ThinkingFocusRuntime = { config: ReturnType<typeof parseServerConfig>; ownerDatabaseUrl: string; accounts: { actorId: string; email: string; password: string }[] };
export async function readThinkingFocusJson(read: () => Promise<string>): Promise<unknown> {
  try { return JSON.parse(await read()) as unknown; }
  catch { throw Error('Thinking-focus synthetic runtime data cannot be read or parsed; contents withheld.'); }
}
export function thinkingFocusTestMode(env: Record<string, string | undefined>): 'STANDARD' | 'ISOLATED' | null {
  return env.CUEVO_REQUIRE_THINKING_FOCUS_INTEGRATION === '1' ? 'ISOLATED' : env.CUEVO_REQUIRE_INTEGRATION === '1' ? 'STANDARD' : null;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function configTarget(input: Record<string, string | undefined>, apiPort: string, databasePort: string) {
  try {
    const config = parseServerConfig({ DATABASE_URL: input.DATABASE_URL, SUPABASE_URL: input.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: input.SUPABASE_PUBLISHABLE_KEY, NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'local', AI_GENERATION_MODE: 'DISABLED', AI_FIXTURE_ENABLED: 'false', POSTHOG_CAPTURE_MODE: 'DISABLED' });
    if (!config.databaseUrl || !config.supabaseUrl || !config.supabasePublishableKey) throw Error();
    const db = new URL(config.databaseUrl), api = new URL(config.supabaseUrl);
    const local = (url: URL) => ['127.0.0.1', 'localhost'].includes(url.hostname);
    const allowedDatabase = db.pathname === '/postgres' || databasePort === '57422' && db.pathname === '/cuevo_integration_20261004';
    if (!local(db) || !['postgres:', 'postgresql:'].includes(db.protocol) || db.port !== databasePort || db.username !== 'cuevo_api' || !allowedDatabase || db.search || db.hash
      || !local(api) || api.protocol !== 'http:' || api.port !== apiPort || api.username || api.password || api.pathname !== '/' || api.search || api.hash) throw Error();
    db.username = 'postgres'; db.password = 'postgres';
    return { config, ownerDatabaseUrl: db.toString() };
  } catch { throw Error('Thinking-focus tests require a guarded local runtime target.'); }
}
export function standardThinkingFocusRuntime(env: Record<string, string | undefined>, manifest: unknown, secrets: unknown, actors: Record<string, string>): ThinkingFocusRuntime {
  const target = configTarget(env, '56321', '56322');
  if (!record(manifest) || manifest.synthetic !== true || !Array.isArray(manifest.actors) || !record(secrets) || typeof secrets.syntheticPassword !== 'string' || !secrets.syntheticPassword.trim()) throw Error('Verified synthetic identity manifest and credentials required.');
  const accounts = Object.entries(actors).map(([role, actorId]) => {
    const candidates = manifest.actors as unknown[];
    const matches = candidates.filter(row => record(row) && row.actorId === actorId);
    const actor = matches[0];
    if (matches.length !== 1 || !record(actor) || actor.role !== (role === 'wrongTeacher' ? 'teacher' : role) || typeof actor.email !== 'string' || !/^synthetic-\d+@cuevo\.test$/.test(actor.email)) throw Error('Verified synthetic identity is missing, duplicated or mismatched.');
    return { actorId, email: actor.email, password: secrets.syntheticPassword as string };
  });
  return { ...target, accounts };
}
export function isolatedThinkingFocusRuntime(path: string | undefined, runtime: unknown, actors: Record<string, string>): ThinkingFocusRuntime {
  if (!path || !isAbsolute(path)) throw Error('Explicit absolute isolated thinking-focus runtime file required.');
  if (!record(runtime) || !record(runtime.config) || !Array.isArray(runtime.accounts)) throw Error('Explicit isolated runtime and synthetic identity records required.');
  const target = configTarget(runtime.config as Record<string, string | undefined>, '57421', '57422');
  const accounts = Object.values(actors).map(actorId => {
    const matches = (runtime.accounts as unknown[]).filter(row => record(row) && row.actorId === actorId);
    const actor = matches[0];
    if (matches.length !== 1 || !record(actor) || typeof actor.email !== 'string' || !actor.email.trim() || typeof actor.password !== 'string' || !actor.password.trim()) throw Error('Isolated synthetic identity is missing, duplicated or invalid.');
    return { actorId, email: actor.email, password: actor.password };
  });
  return { ...target, accounts };
}
