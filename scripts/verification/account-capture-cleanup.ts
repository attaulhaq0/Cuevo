import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
import { requireLocalInvitationCapture } from '../runtime/local-school-accounts';

const requestSchema = z.object({ id: z.uuid(), email: z.email().max(254), purpose: z.enum(['invite', 'recovery']) }).strict();
export type AccountPhaseRequest = z.infer<typeof requestSchema>;
const rowsSchema = z.array(requestSchema).max(1000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length);
const unavailable = () => Error('Exact account capture cleanup is not confirmed.');
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

/** Preserve baseline identities; only newly approved exact requests belong to this phase. */
export function accountPhaseRequestDelta(before: AccountPhaseRequest[], after: AccountPhaseRequest[]): AccountPhaseRequest[] {
  const baseline = rowsSchema.parse(before); const current = rowsSchema.parse(after); const previous = new Map(baseline.map(row => [row.id, row])); const next = new Map(current.map(row => [row.id, row]));
  if (baseline.some(row => JSON.stringify(next.get(row.id)) !== JSON.stringify(row))) throw unavailable();
  return current.filter(row => !previous.has(row.id));
}

/** Message text cannot broaden cleanup beyond the already-owned exact request. */
export function isOwnedAccountCapture(row: AccountPhaseRequest, input: unknown): boolean {
  if (!requestSchema.safeParse(row).success || !object(input) || !Array.isArray(input.To) || input.To.length !== 1 || !object(input.To[0]) || input.To[0].Address !== row.email || typeof input.Text !== 'string') return false;
  const target = row.purpose === 'recovery' ? '/account/recovery' : '/account/admission';
  for (const line of input.Text.split(/\r?\n/)) {
    try {
      const url = new URL(line); const fragment = new URLSearchParams(url.hash.slice(1)); const keys = [...fragment.keys()];
      if (url.origin === 'http://localhost:3000' && url.pathname === target && !url.username && !url.password && !url.search && keys.length === 4 && new Set(keys).size === 4 && keys.every(key => ['id', 'type', 'token_hash', 'admission_secret'].includes(key))
        && fragment.get('id') === row.id && fragment.get('type') === row.purpose && fragment.get('token_hash') && fragment.get('token_hash')!.length <= 4096 && /^[a-f0-9]{64}$/.test(fragment.get('admission_secret') ?? '')) return true;
    } catch { /* Bilingual non-link text carries no cleanup authority. */ }
  }
  return false;
}

export async function cleanupOwnedAccountCaptures(rows: AccountPhaseRequest[], ports: { search(email: string): Promise<string[]>; message(id: string): Promise<unknown>; remove(ids: string[]): Promise<void> }): Promise<{ requests: number; removed: number }> {
  const requests = rowsSchema.parse(rows); let removed = 0; let failed = false;
  for (const row of requests) {
    try {
      const inspect = async (removedIds: string[] = []) => {
        const ids = await ports.search(row.email);
        if (!Array.isArray(ids) || ids.length >= 100 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) throw unavailable();
        if (ids.some(id => removedIds.includes(id))) throw unavailable();
        const owned: string[] = []; for (const id of ids) if (isOwnedAccountCapture(row, await ports.message(id))) owned.push(id); return owned;
      };
      const owned = await inspect(); if (owned.length) { await ports.remove(owned); removed += owned.length; }
      if ((await inspect(owned)).length) throw unavailable();
    } catch { failed = true; }
  }
  if (failed) throw unavailable(); return { requests: requests.length, removed };
}

async function localStatus() {
  const config = await readFile('supabase/config.toml', 'utf8'); assertCuevoLocalConfig(config);
  const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus & { INBUCKET_URL?: string };
  assertCuevoLocalTarget(status); requireLocalInvitationCapture(config, status); return status;
}
export async function snapshotAccountPhaseRequests(): Promise<AccountPhaseRequest[]> {
  const status = await localStatus(); const pool = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  try {
    const result = await pool.query(`select request.id,request.email,request.purpose from internal.school_account_requests request
      where request.school_id='10000000-0000-4000-8000-000000000001'and request.requested_by='20000000-0000-4000-8000-000000000001'
      and exists(select 1 from internal.school_account_request_revisions original where original.request_id=request.id and original.revision=1
      and original.reason in('Reviewed synthetic school admission through the actual administrator screen.','Verified school-assisted synthetic account recovery.'))order by request.id limit 1001`);
    return rowsSchema.parse(result.rows);
  } finally { await pool.end(); }
}
async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw unavailable();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 1024 * 1024) throw unavailable(); chunks.push(item.value); } }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function cleanupAccountPhaseCaptures(rows: AccountPhaseRequest[]) {
  await localStatus();
  return cleanupOwnedAccountCaptures(rows, {
    search: async email => {
      const result = await responseJson(await fetch(`http://127.0.0.1:56324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=100`, { signal: AbortSignal.timeout(3000), redirect: 'error' }));
      if (!object(result) || !Array.isArray(result.messages)) throw unavailable(); return result.messages.map(item => { if (!object(item) || typeof item.ID !== 'string') throw unavailable(); return item.ID; });
    },
    message: async id => responseJson(await fetch(`http://127.0.0.1:56324/api/v1/message/${id}`, { signal: AbortSignal.timeout(3000), redirect: 'error' })),
    remove: async ids => { const response = await fetch('http://127.0.0.1:56324/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: ids }), signal: AbortSignal.timeout(3000), redirect: 'error' }); if (!response.ok) throw unavailable(); },
  });
}

export async function verifyRestoredAccountReference(): Promise<void> {
  const status = await localStatus(); const pool = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  try {
    const result = (await pool.query(`select (select count(*)::integer from auth.users)as auth_count,(select count(*)::integer from app.people)as people_count,
      (select count(*)::integer from internal.school_account_requests)as request_count,(select enabled from internal.school_account_runtime_control where singleton)as enabled,
      (select count(*)::integer from internal.outbox_events where state in('PENDING','PROCESSING','FAILED'))as unresolved`)).rows[0];
    if (result?.auth_count !== 133 || result.people_count !== 133 || result.request_count !== 0 || result.enabled !== false || result.unresolved !== 0) throw Error('Reference account restoration is not confirmed.');
    const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[]; const student = accounts.find(account => account.role === 'student');
    if (!student) throw Error('Reference account restoration is not confirmed.');
    const response = await fetch('http://127.0.0.1:56321/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: status.PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: student.email, password: student.password }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    const value = await responseJson(response); if (!object(value) || typeof value.access_token !== 'string' || !object(value.user) || value.user.email !== student.email) throw Error('Reference login restoration is not confirmed.');
    const logout = await fetch('http://127.0.0.1:56321/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: status.PUBLISHABLE_KEY, Authorization: `Bearer ${value.access_token}` }, signal: AbortSignal.timeout(5000), redirect: 'error' }); if (!logout.ok) throw Error('Reference verification session cleanup is not confirmed.');
  } finally { await pool.end(); }
}
