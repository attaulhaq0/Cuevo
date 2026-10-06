import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { Pool } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { assertCuevoLocalConfig, assertCuevoLocalTarget } from '../configure-local';

export type LocalPosthogConfig = { projectId: 393668; host: 'https://us.i.posthog.com'; projectKey: string; pseudonymKey: string; keyVersion: number; environment: 'QA' | 'DEMO'; schoolId: '10000000-0000-4000-8000-000000000001' };
export type LocalPosthogDependencies = { projectConfig: string; status: { API_URL: string; DB_URL: string }; appsStopped(): Promise<boolean>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; writeOverlay(value: string): Promise<void> };
const overlayKeys = ['POSTHOG_CAPTURE_MODE', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST', 'POSTHOG_PROJECT_KEY', 'POSTHOG_PSEUDONYM_KEY', 'POSTHOG_PSEUDONYM_KEY_VERSION', 'POSTHOG_ENVIRONMENT'] as const;
export function parseLocalPosthogConfig(input: unknown): LocalPosthogConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join('|') !== 'environment|host|keyVersion|projectId|projectKey|pseudonymKey|schoolId') throw Error('Invalid local PostHog metadata.');
  const config = input as Record<string, unknown>;
  if (config.projectId !== 393668 || config.host !== 'https://us.i.posthog.com' || config.schoolId !== '10000000-0000-4000-8000-000000000001' || !['QA', 'DEMO'].includes(String(config.environment)) || typeof config.projectKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(config.projectKey) || typeof config.pseudonymKey !== 'string' || !/^[a-fA-F0-9]{64}$/.test(config.pseudonymKey) || !Number.isSafeInteger(config.keyVersion) || Number(config.keyVersion) < 1) throw Error('Invalid local PostHog metadata.');
  return { projectId: 393668, host: 'https://us.i.posthog.com', schoolId: '10000000-0000-4000-8000-000000000001', projectKey: config.projectKey, pseudonymKey: config.pseudonymKey, keyVersion: Number(config.keyVersion), environment: config.environment as 'QA' | 'DEMO' };
}
function environment(config: LocalPosthogConfig): Record<string, string> {
  return { POSTHOG_CAPTURE_MODE: 'LIVE_SYNTHETIC', POSTHOG_PROJECT_ID: String(config.projectId), POSTHOG_HOST: config.host, POSTHOG_PROJECT_KEY: config.projectKey, POSTHOG_PSEUDONYM_KEY: config.pseudonymKey, POSTHOG_PSEUDONYM_KEY_VERSION: String(config.keyVersion), POSTHOG_ENVIRONMENT: config.environment };
}
export function parsePosthogOverlay(input: string): Record<string, string> {
  const parsed = parseEnv(input);
  if (Object.keys(parsed).some(key => !overlayKeys.includes(key as typeof overlayKeys[number])) || parsed.POSTHOG_CAPTURE_MODE === 'DISABLED' && Object.keys(parsed).length !== 1 || parsed.POSTHOG_CAPTURE_MODE === 'LIVE_SYNTHETIC' && Object.keys(parsed).length !== overlayKeys.length || !['DISABLED', 'LIVE_SYNTHETIC'].includes(parsed.POSTHOG_CAPTURE_MODE ?? '')) throw Error('Invalid local analytics overlay.');
  try { parseServerConfig({ ...parsed, NODE_ENV: 'development' }, 'worker'); } catch { throw Error('Invalid local analytics overlay.'); }
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
/** Only the interactive development launcher opts in. Verification keeps its original environment. */
export async function loadDevelopmentEnvironment(base: Record<string, string | undefined>, read: () => Promise<string>): Promise<Record<string, string | undefined>> {
  if (base.CI || base.CUEVO_REQUIRE_INTEGRATION === '1' || base.CUEVO_POSTHOG_LOCAL_OVERLAY === 'false') return { ...base };
  let bytes: string;
  try { bytes = await read(); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...base }; throw Error('Local analytics overlay is unreadable.'); }
  if (base.NODE_ENV === 'production') throw Error('Local analytics overlay is forbidden in production.');
  return { ...base, ...parsePosthogOverlay(bytes) };
}
export async function configureLocalPosthog(input: unknown, disabled: boolean, deps: LocalPosthogDependencies): Promise<{ mode: 'DISABLED' | 'LIVE_SYNTHETIC' }> {
  const config = parseLocalPosthogConfig(input); assertCuevoLocalConfig(deps.projectConfig);
  try { assertCuevoLocalTarget(deps.status); } catch { throw Error('Refusing a non-Cuevo local analytics target.'); }
  if (!await deps.appsStopped()) throw Error('Stop local Cuevo applications before configuring analytics.');
  let transaction = false; let committed = false;
  try {
    const runtime = (await deps.query('select current_database()as database,inet_server_port()as port,current_user as role /* runtime_guard */')).rows[0];
    if (runtime?.database !== 'postgres' || runtime.port !== 5432 || runtime.role !== 'postgres') throw Error('Local analytics requires the verified database owner target.');
    await deps.query('BEGIN'); transaction = true;
    await deps.query("set local statement_timeout='5s'");
    const school = (await deps.query(`select school.status='active'as active,
      (select count(*)::integer from app.people person where person.school_id=school.id)as population,
      (select count(*)::integer from app.memberships member where member.school_id=school.id and member.status='active'and member.effective_from<=clock_timestamp()and(member.effective_to is null or member.effective_to>clock_timestamp()))as active_memberships,
      (select count(*)::integer from app.memberships member left join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id where member.school_id=school.id and person.synthetic is distinct from true)as unsafe,
      (select policy.analytics_enabled from app.school_policy_versions policy where policy.school_id=school.id order by policy.version desc limit 1)as analytics_enabled
      from app.schools school where school.id=$1 /* school_guard */`, [config.schoolId])).rows[0];
    if (school?.active !== true || !Number.isInteger(school.population) || Number(school.population) < 1 || !Number.isInteger(school.active_memberships) || Number(school.active_memberships) < 1 || school.unsafe !== 0 || !disabled && school.analytics_enabled !== true) throw Error('Current approved all-synthetic school policy is required.');
    await deps.query("select set_config('app.runtime_env','local',true)");
    const receipt = (await deps.query('select internal.configure_posthog_school($1,$2,$3,$4)as activated', [config.schoolId, !disabled, config.environment, config.keyVersion])).rows[0]?.activated;
    if (receipt !== true) throw Error('Local analytics activation outcome requires review.');
    await deps.query('COMMIT'); transaction = false; committed = true;
    const overlay = disabled ? 'POSTHOG_CAPTURE_MODE=DISABLED\n' : Object.entries(environment(config)).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
    parsePosthogOverlay(overlay);
    await deps.writeOverlay(overlay);
    return { mode: disabled ? 'DISABLED' : 'LIVE_SYNTHETIC' };
  } catch (error) {
    if (transaction) await deps.query('ROLLBACK').catch(() => undefined);
    if (committed) throw Error('Local analytics activation was saved but the local overlay could not be written. Stop applications and rerun configuration.');
    if (error instanceof Error && ['Local analytics requires the verified database owner target.', 'Current approved all-synthetic school policy is required.', 'Local analytics activation outcome requires review.'].includes(error.message)) throw error;
    throw Error('Local analytics configuration could not be completed; retained keys and receipts are unchanged.');
  }
}
async function stopped() {
  const open = await Promise.all([3000, 4000, 4001].map(port => new Promise<boolean>(done => {
    const socket = createConnection({ host: '127.0.0.1', port }); const finish = (connected: boolean) => { socket.destroy(); done(connected); };
    socket.setTimeout(800); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(true));
  })));
  return open.every(connected => !connected);
}
async function main() {
  if (process.argv.slice(2).some(argument => argument !== '--disable') || process.argv.slice(2).length > 1 || process.env.NODE_ENV === 'production') throw Error('Use the local analytics command with optional --disable.');
  let input: unknown;
  try { input = JSON.parse(await readFile(resolve('.local/posthog/config.json'), 'utf8')); } catch { throw Error('Reviewed local PostHog metadata is unavailable.'); }
  const config = parseLocalPosthogConfig(input); const projectConfig = await readFile(resolve('supabase/config.toml'), 'utf8'); assertCuevoLocalConfig(projectConfig);
  let status: LocalPosthogDependencies['status'];
  try { status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); assertCuevoLocalTarget(status); } catch { throw Error('Verified local Cuevo services are unavailable.'); }
  const database = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  database.on('error', () => { /* Queries surface a sanitized failure. */ });
  try {
    const result = await configureLocalPosthog(config, process.argv.includes('--disable'), { projectConfig, status, appsStopped: stopped, query: (sql, values) => database.query(sql, values), writeOverlay: async value => {
      const target = resolve('.env.posthog.local'); const pending = resolve('.env.posthog.local.pending');
      await writeFile(pending, value, { mode: 0o600 }); await rename(pending, target);
    } });
    console.log(result.mode === 'DISABLED' ? 'Local Cuevo analytics disabled; retained credentials and receipts were preserved.' : 'Local Cuevo synthetic analytics configured. Run npm run dev to use the reviewed worker connection.');
  } finally { await database.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main().catch(error => {
  const safe = ['Use the local analytics command with optional --disable.', 'Reviewed local PostHog metadata is unavailable.', 'Invalid local PostHog metadata.', 'Verified local Cuevo services are unavailable.', 'Stop local Cuevo applications before configuring analytics.', 'Local analytics requires the verified database owner target.', 'Current approved all-synthetic school policy is required.', 'Local analytics activation outcome requires review.', 'Local analytics activation was saved but the local overlay could not be written. Stop applications and rerun configuration.', 'Local analytics configuration could not be completed; retained keys and receipts are unchanged.'];
  console.error(error instanceof Error && safe.includes(error.message) ? error.message : 'Local analytics configuration requires review.'); process.exitCode = 1;
});
