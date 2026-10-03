import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';

const capability = z.enum(['school.context', 'school.operations', 'learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'community', 'portfolio', 'restricted.records']);
export const initialSchoolApprovalSchema = z.object({ schoolId: z.uuid(), name: z.string().trim().min(1).max(200), countryCode: z.string().regex(/^[A-Z]{2}$/), languages: z.array(z.enum(['en', 'ar'])).min(1).max(2), adminId: z.uuid(), adminEmail: z.email().max(254).transform(value => value.toLowerCase()), adminDisplayName: z.string().trim().min(1).max(200), controlRevision: z.number().int().positive(), entitlements: z.array(capability).min(2).max(10), reason: z.string().trim().min(1).max(1000), confirmApproval: z.literal(true) }).strict().refine(value => new Set(value.languages).size === value.languages.length && new Set(value.entitlements).size === value.entitlements.length && value.entitlements.includes('school.context') && value.entitlements.includes('school.operations'));
export type InitialSchoolApproval = z.infer<typeof initialSchoolApprovalSchema>;
const receiptSchema = z.object({ id: z.uuid(), administratorId: z.uuid(), admissionId: z.uuid(), status: z.literal('ADMITTED') }).strict();
function verifiedIdentity(input: unknown) {
  const parsed = z.object({ id: z.uuid(), email: z.email().max(254), email_confirmed_at: z.iso.datetime({ offset: true }), is_anonymous: z.literal(false) }).safeParse(input);
  if (!parsed.success) throw Error('Current confirmed identity required.'); return parsed.data;
}

/** Owner-only local operation. Tokens come from current verified Auth, never metadata or file roles. */
export async function admitInitialSchool(approval: unknown, key: string, ports: { operatorToken: string; administratorToken: string; verify(token: string): Promise<unknown>; query(sql: string, args?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }) {
  const source = initialSchoolApprovalSchema.parse(approval);
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(key)) throw Error('Original admission request key required.');
  const [operator, administrator] = await Promise.all([ports.verify(ports.operatorToken), ports.verify(ports.administratorToken)]);
  const operatorIdentity = verifiedIdentity(operator); const adminIdentity = verifiedIdentity(administrator);
  if (adminIdentity.id !== source.adminId || adminIdentity.email !== source.adminEmail || operatorIdentity.id === adminIdentity.id) throw Error('Exact consenting first administrator required.');
  const operatorSessionId = z.uuid().parse(decodeJwt(ports.operatorToken).session_id); const adminSessionId = z.uuid().parse(decodeJwt(ports.administratorToken).session_id);
  const payload = { ...source, operatorSessionId, adminSessionId }; const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  await ports.query('BEGIN');
  try {
    await ports.query("select set_config('app.actor_id',$1,true),set_config('app.runtime_env','local',true)", [operatorIdentity.id]);
    const output = (await ports.query('select internal.admit_initial_school($1::jsonb,$2,$3,$4) as receipt', [JSON.stringify(payload), key, fingerprint, 'initial-school-admission'])).rows[0]?.receipt;
    const receipt = receiptSchema.parse(output);
    if (receipt.id !== source.schoolId || receipt.administratorId !== source.adminId) throw Error('Initial admission receipt is not confirmed.');
    await ports.query('COMMIT'); return receipt;
  } catch { await ports.query('ROLLBACK').catch(() => undefined); throw Error('Initial school admission is not confirmed. Reconcile the original request.'); }
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw Error('Initial local school approval required.');
  const [sourcePath, key] = process.argv.slice(2); if (!sourcePath || !key) throw Error('Approved source file and original key required.');
  await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
  const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus; assertCuevoLocalTarget(status);
  for (const port of [3000, 4000, 4001]) { try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000) }); } catch (error) { if ((error as Error & { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') continue; throw Error('Stopped application state unconfirmed.'); } throw Error('Stop Cuevo applications before initial admission.'); }
  const operatorToken = process.env.CUEVO_OPERATOR_ACCESS_TOKEN; const administratorToken = process.env.CUEVO_INITIAL_ADMIN_ACCESS_TOKEN;
  if (!operatorToken || !administratorToken) throw Error('Current verified operator and administrator tokens required.');
  const auth = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) }) } });
  const pool = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  try { const client = await pool.connect(); try { const result = await admitInitialSchool(JSON.parse(await readFile(resolve(sourcePath), 'utf8')), key, { operatorToken, administratorToken, verify: async token => { const result = await auth.auth.getUser(token); if (result.error) throw Error('Current Auth identity unavailable.'); return result.data.user; }, query: (sql, args) => client.query(sql, args) }); console.log(JSON.stringify(result)); } finally { client.release(); } } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { await main(); } catch { console.error('Initial school admission requires review; diagnostic data withheld.'); process.exitCode = 1; } }
