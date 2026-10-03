import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rename, unlink, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
export function localSchoolAccountOverlay(status: Pick<LocalStatus, 'SERVICE_ROLE_KEY'>, enabled: boolean): string {
  if (!enabled) return 'CUEVO_AUTH_PROVISIONING_MODE=DISABLED\n';
  if (!status.SERVICE_ROLE_KEY || /\s/.test(status.SERVICE_ROLE_KEY)) throw Error('Dedicated local provisioning credential unavailable.');
  return `CUEVO_AUTH_PROVISIONING_MODE=LOCAL_SYNTHETIC\nCUEVO_AUTH_PROVISIONING_URL=http://127.0.0.1:56321\nCUEVO_AUTH_PROVISIONING_PROJECT_REF=LOCAL_CUEVO\nCUEVO_AUTH_PROVISIONING_WEB_ORIGIN=http://localhost:3000\nCUEVO_AUTH_PROVISIONING_KEY=${status.SERVICE_ROLE_KEY}\n`;
}
export function requireLocalInvitationCapture(config: string, status: { INBUCKET_URL?: string }) {
  const smtp = config.match(/\[local_smtp\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  if (!smtp || !/^\s*enabled\s*=\s*true\s*$/m.test(smtp) || !/^\s*port\s*=\s*56324\s*$/m.test(smtp) || status.INBUCKET_URL !== 'http://127.0.0.1:56324') throw Error('Exact local Cuevo invitation capture required.');
}

type Operation = { mode: 'enable' | 'disable'; operatorId: string; reason: string } | { mode: 'repair-overlay'; operatorId: string };
type StagedOverlay = { publish(): Promise<void>; discard(): Promise<void> };
type ConfigurationDependencies = { projectConfig: string; status: Pick<LocalStatus, 'API_URL' | 'DB_URL' | 'SERVICE_ROLE_KEY'> & { INBUCKET_URL?: string }; appsStopped(): Promise<boolean>; query(sql: string, args?: unknown[]): Promise<{ rows: unknown[] }>; prepareOverlay(text: string): Promise<StagedOverlay> };
const failureMessages = {
  OVERLAY_PREPARATION_FAILED: 'The local overlay could not be prepared. Database approval was not changed.',
  DB_APPROVAL_REQUIRES_REVIEW: 'Local school account approval could not be confirmed. The previous overlay was preserved.',
  DB_APPROVAL_OUTCOME_UNKNOWN: 'Database approval outcome is unknown. Keep applications stopped and inspect current approval before using repair-overlay.',
  DB_APPROVED_OVERLAY_UNAVAILABLE: 'Database approval was saved but the overlay is unavailable. Keep applications stopped and use repair-overlay without renewing approval.',
  OVERLAY_REPAIR_REQUIRES_REVIEW: 'The current exact operator approval does not permit overlay repair.',
  OVERLAY_REPAIR_UNAVAILABLE: 'The existing approval was preserved but its overlay could not be repaired.',
} as const;
function failure(code: keyof typeof failureMessages) { return Object.assign(Error(failureMessages[code]), { code }); }

/** Stages one uniquely owned sibling. Publication renames it; discard never removes target. */
export async function prepareLocalSchoolAccountOverlay(text: string, target = resolve('.local/school-account.env')): Promise<StagedOverlay> {
  const exactTarget = resolve(target); const pending = exactTarget + '.' + randomUUID() + '.pending'; let published = false; let created = false;
  await mkdir(dirname(exactTarget), { recursive: true });
  try {
    const handle = await open(pending, 'wx', 0o600); created = true;
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  } catch { if (created) await unlink(pending).catch(() => undefined); throw failure('OVERLAY_PREPARATION_FAILED'); }
  return {
    publish: async () => { if (published) throw failure('OVERLAY_REPAIR_UNAVAILABLE'); await rename(pending, exactTarget); published = true; },
    discard: async () => { if (!published) await unlink(pending).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure('OVERLAY_REPAIR_UNAVAILABLE'); }); },
  };
}

const repairRead = `select control.revision,control.enabled,control.mode,control.database_oid,control.project_ref,control.approved_operator_id,
 (select oid from pg_catalog.pg_database where datname=current_database())as current_database_oid,
 exists(select 1 from internal.school_account_runtime_revisions history where history.revision=control.revision and history.enabled=control.enabled and history.mode=control.mode
  and history.database_oid=(select oid from pg_catalog.pg_database where datname=current_database())and history.project_ref='LOCAL_CUEVO'and history.approved_operator_id=$1::uuid
  and (not control.enabled or(history.database_oid=control.database_oid and history.project_ref=control.project_ref and history.approved_operator_id=control.approved_operator_id and history.approved_at=control.approved_at)))as history_matches,
 exists(select 1 from auth.users account where account.id=$1::uuid and account.email_confirmed_at is not null and account.is_anonymous is false and account.deleted_at is null and(account.banned_until is null or account.banned_until<=clock_timestamp()))as operator_verified
 from internal.school_account_runtime_control control where singleton for share`;

/** Repair reads existing approval and never calls its mutation or advances its revision. */
export async function runLocalSchoolAccountConfiguration(options: Operation, deps: ConfigurationDependencies): Promise<{ mode: 'LOCAL_SYNTHETIC' | 'DISABLED'; revision: number; repaired: boolean }> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(options.operatorId)
    || options.mode !== 'repair-overlay' && (options.reason.trim().length < 1 || options.reason.trim().length > 1000)) throw failure('DB_APPROVAL_REQUIRES_REVIEW');
  assertCuevoLocalConfig(deps.projectConfig); assertCuevoLocalTarget(deps.status);
  if (!await deps.appsStopped()) throw failure('DB_APPROVAL_REQUIRES_REVIEW');
  let staged: StagedOverlay | undefined; let transaction = false; let commitAttempted = false; let committed = false;
  let enabled = options.mode === 'enable'; let revision: number;
  try {
    if (options.mode === 'repair-overlay') {
      await deps.query('BEGIN'); transaction = true;
      const current = (await deps.query(repairRead, [options.operatorId])).rows[0] as Record<string, unknown> | undefined;
      if (!current || !Number.isInteger(current.revision) || Number(current.revision) < 1 || current.history_matches !== true || current.operator_verified !== true
        || !(current.enabled === true && current.mode === 'LOCAL_SYNTHETIC' && current.database_oid === current.current_database_oid && current.project_ref === 'LOCAL_CUEVO' && current.approved_operator_id === options.operatorId
          || current.enabled === false && current.mode === 'DISABLED' && current.database_oid === null && current.project_ref === null && current.approved_operator_id === null)) throw failure('OVERLAY_REPAIR_REQUIRES_REVIEW');
      enabled = current.enabled === true; revision = Number(current.revision);
      if (enabled) requireLocalInvitationCapture(deps.projectConfig, deps.status);
      staged = await deps.prepareOverlay(localSchoolAccountOverlay(deps.status, enabled));
      await staged.publish(); await deps.query('ROLLBACK'); transaction = false;
      return { mode: enabled ? 'LOCAL_SYNTHETIC' : 'DISABLED', revision, repaired: true };
    }
    if (enabled) requireLocalInvitationCapture(deps.projectConfig, deps.status);
    try { staged = await deps.prepareOverlay(localSchoolAccountOverlay(deps.status, enabled)); } catch { throw failure('OVERLAY_PREPARATION_FAILED'); }
    await deps.query('BEGIN'); transaction = true;
    await deps.query("select set_config('app.runtime_env','local',true)");
    const current = (await deps.query('select revision from internal.school_account_runtime_control where singleton for update')).rows[0] as { revision?: unknown } | undefined;
    if (!Number.isInteger(current?.revision)) throw failure('DB_APPROVAL_REQUIRES_REVIEW');
    const approved = (await deps.query('select internal.configure_local_school_account_runtime($1,(select oid from pg_catalog.pg_database where datname=current_database()),$2,$3,$4,$5,true)as revision', [enabled, 'LOCAL_CUEVO', options.operatorId, options.reason.trim(), current!.revision])).rows[0] as { revision?: unknown } | undefined;
    if (!approved || approved.revision !== Number(current!.revision) + 1) throw failure('DB_APPROVAL_REQUIRES_REVIEW');
    revision = Number(approved.revision); commitAttempted = true; await deps.query('COMMIT'); transaction = false; committed = true;
    await staged.publish();
    return { mode: enabled ? 'LOCAL_SYNTHETIC' : 'DISABLED', revision, repaired: false };
  } catch (error) {
    if (transaction) await deps.query('ROLLBACK').catch(() => undefined);
    if (committed) throw failure('DB_APPROVED_OVERLAY_UNAVAILABLE');
    if (options.mode === 'repair-overlay') { if (error instanceof Error && 'code' in error && error.code === 'OVERLAY_REPAIR_REQUIRES_REVIEW') throw error; throw failure('OVERLAY_REPAIR_UNAVAILABLE'); }
    if (commitAttempted) throw failure('DB_APPROVAL_OUTCOME_UNKNOWN');
    if (error instanceof Error && 'code' in error && error.code === 'OVERLAY_PREPARATION_FAILED') throw error;
    throw failure('DB_APPROVAL_REQUIRES_REVIEW');
  } finally { await staged?.discard().catch(() => undefined); }
}

/** Explicit local operator configuration. No seed reset, identity creation or external mail. */
export async function configureLocalSchoolAccounts(options: { enabled: boolean; operatorId: string; reason: string } | { mode: 'repair-overlay'; operatorId: string }) {
  if (process.env.NODE_ENV === 'production') throw failure('DB_APPROVAL_REQUIRES_REVIEW');
  const projectConfig = await readFile('supabase/config.toml', 'utf8'); assertCuevoLocalConfig(projectConfig);
  const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus & { INBUCKET_URL?: string };
  assertCuevoLocalTarget(status);
  const pool = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  try {
    const client = await pool.connect();
    try {
      const result = await runLocalSchoolAccountConfiguration('mode' in options ? options : { mode: options.enabled ? 'enable' : 'disable', operatorId: options.operatorId, reason: options.reason }, {
        projectConfig, status, query: (sql, args) => client.query(sql, args), prepareOverlay: text => prepareLocalSchoolAccountOverlay(text), appsStopped: async () => {
          for (const port of [3000, 4000, 4001]) {
            try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000) }); }
            catch (error) { const cause = error instanceof Error ? (error as Error & { cause?: { code?: string } }).cause : undefined; if (cause?.code === 'ECONNREFUSED') continue; return false; }
            return false;
          }
          return true;
        },
      });
      console.log(result.repaired ? 'Current local school account overlay repaired; database approval revision was preserved.' : result.mode === 'LOCAL_SYNTHETIC' ? 'Local synthetic account invitations approved; use the explicit account overlay when starting the API.' : 'Local synthetic account invitations disabled.');
      return result;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, operatorId, ...reason] = process.argv.slice(2);
    if (!['enable', 'disable', 'repair-overlay'].includes(mode) || mode === 'repair-overlay' && reason.length) throw failure('DB_APPROVAL_REQUIRES_REVIEW');
    await configureLocalSchoolAccounts(mode === 'repair-overlay' ? { mode, operatorId: operatorId ?? '' } : { enabled: mode === 'enable', operatorId: operatorId ?? '', reason: reason.join(' ') });
  } catch (error) { const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : ''; console.error(code in failureMessages ? `${code}: ${failureMessages[code as keyof typeof failureMessages]}` : 'Local school account configuration requires review; diagnostic data withheld.'); process.exitCode = 1; }
}
