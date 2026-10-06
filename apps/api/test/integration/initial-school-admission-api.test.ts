import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { createAuthProvisioning } from '../../src/platform/identity/provisioning';
import { createApp } from '../../src/app';
import { assertCuevoLocalTarget, type LocalStatus } from '../../../../scripts/configure-local';
import { admitInitialSchool } from '../../../../scripts/runtime/initial-school';
import { cleanupCustomerTenant } from './customer-test-context';
import { withFixtureCleanup } from './fixture-cleanup';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('initial school with a real newly verified administrator', () => {
  it('admits one approved school through the owner command and operates it through the normal restricted API', async () => {
    const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus; assertCuevoLocalTarget(status);
    for (const port of [3000, 4000, 4001]) { try { await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(800) }); } catch (error) { if ((error as Error & { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') continue; throw Error('Stopped state unconfirmed.'); } throw Error('Initial admission fixture requires stopped applications.'); }
    const userId = randomUUID(); const schoolId = randomUUID(); const email = `first-admin-${userId}@example.test`;
    const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const provider = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions); const administrator = createClient(status.API_URL, status.PUBLISHABLE_KEY, authOptions); const operator = createClient(status.API_URL, status.PUBLISHABLE_KEY, authOptions);
    const owner = new Pool({ connectionString: status.DB_URL, max: 1 }); const client = await owner.connect();
    const runtime = await createApp(parseServerConfig({ ...process.env, AI_GENERATION_MODE: 'DISABLED', AI_FIXTURE_ENABLED: 'false', CUEVO_AUTH_PROVISIONING_MODE: 'DISABLED' }, 'api'));
    let administratorToken = ''; let originalCounts: { auth: number; people: number; schools: number; admissions: number }; let enabledRevision: number | undefined;
    const counts = async () => (await client.query('select(select count(*)::integer from auth.users)auth,(select count(*)::integer from app.people)people,(select count(*)::integer from app.schools)schools,(select count(*)::integer from internal.initial_school_admissions)admissions')).rows[0];
    const configure = async (enabled: boolean) => { await client.query('BEGIN'); try { await client.query("select set_config('app.runtime_env','local',true)"); const version = (await client.query('select revision from internal.school_account_runtime_control')).rows[0].revision; const result = (await client.query('select internal.configure_local_school_account_runtime($1,(select oid from pg_catalog.pg_database where datname=current_database()),$2,$3,$4,$5,true)revision', [enabled, 'LOCAL_CUEVO', '20000000-0000-4000-8000-000000000001', 'Explicit initial school synthetic fixture', version])).rows[0].revision; await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } };
    await withFixtureCleanup(async () => {
      originalCounts = await counts(); expect(originalCounts.auth).toBe(133); expect(originalCounts.people).toBe(133); expect((await client.query('select enabled from internal.school_account_runtime_control')).rows[0].enabled).toBe(false);
      const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[]; const account = accounts.find(row => row.role === 'admin')!;
      const signed = await operator.auth.signInWithPassword({ email: account.email, password: account.password }); if (!signed.data.session) throw Error('Current operator identity unavailable.'); const operatorToken = signed.data.session.access_token;
      enabledRevision = await configure(true);
      const adapter = createAuthProvisioning({ url: status.API_URL, projectRef: 'LOCAL_CUEVO', webOrigin: 'http://localhost:3000', redirects: { invite: 'http://localhost:3000/account/admission', recovery: 'http://localhost:3000/account/recovery' }, key: status.SERVICE_ROLE_KEY }); const requestId = randomUUID(); const operation = { requestId, userId, email, priorState: 'NOT_ATTEMPTED' as const };
      expect((await adapter.createUnconfirmed(operation)).state).toBe('CONFIRMED'); let redemption = '';
      expect((await adapter.generateLink({ ...operation, purpose: 'invite' }, async value => { redemption = new URL(value.actionLink).searchParams.get('token') ?? ''; })).state).toBe('GENERATED');
      const verified = await administrator.auth.verifyOtp({ token_hash: redemption, type: 'invite' }); redemption = ''; if (!verified.data.session || verified.data.user?.id !== userId) throw Error('First administrator identity control unconfirmed.'); administratorToken = verified.data.session.access_token;
      const request = (method: 'GET' | 'POST', url: string, body?: Record<string, unknown>) => runtime.app.inject({ method, url, headers: { authorization: `Bearer ${administratorToken}`, 'x-school-id': schoolId, 'idempotency-key': randomUUID() }, payload: body });
      expect((await request('GET', '/v1/me')).statusCode).toBe(403);
      const source = { schoolId, name: 'Customer acceptance synthetic school', countryCode: 'QA', languages: ['en', 'ar'], adminId: userId, adminEmail: email, adminDisplayName: 'New initial administrator', controlRevision: enabledRevision, entitlements: ['school.context', 'school.operations', 'learning', 'assessment', 'curriculum'], reason: 'Explicit reviewed initial synthetic school admission', confirmApproval: true };
      const key = randomUUID(); const ports = { operatorToken, administratorToken, verify: async (token: string) => { const value = await operator.auth.getUser(token); if (value.error) throw Error('Current verified identity unavailable.'); return value.data.user; }, query: (sql: string, args?: unknown[]) => client.query(sql, args) };
      const admitted = await admitInitialSchool(source, key, ports); expect(admitted).toMatchObject({ id: schoolId, administratorId: userId, status: 'ADMITTED' }); expect(await admitInitialSchool(source, key, ports)).toEqual(admitted);
      const me = await request('GET', '/v1/me'); expect(me.statusCode).toBe(200); expect(me.json()).toMatchObject({ userId, role: 'admin', schoolId, displayName: source.adminDisplayName });
      const year = await request('POST', '/v1/school/years', { name: 'First reviewed school year', startsOn: '2026-09-01', endsOn: '2027-08-31' }); expect(year.statusCode).toBe(200);
      expect((await client.query('select count(*)::integer count from internal.initial_school_admissions where school_id=$1', [schoolId])).rows[0].count).toBe(1);
      await expect(runtime.database.pool!.query('select internal.admit_initial_school(null,null,null,null)')).rejects.toMatchObject({ code: '42501' });
    }, [
      () => runtime.close(),
      async () => { const found = (await client.query('select id from app.schools where id=$1', [schoolId])).rows; if (found.length) await cleanupCustomerTenant(client, schoolId); },
      async () => { const found = await provider.auth.admin.getUserById(userId); if (found.data.user) { if (found.data.user.id !== userId || found.data.user.email !== email) throw Error('Unowned initial identity cleanup refused.'); if (administratorToken && (await client.query('select count(*)::integer count from auth.sessions where user_id=$1', [userId])).rows[0].count) await provider.auth.admin.signOut(administratorToken, 'global'); const result = await provider.auth.admin.deleteUser(userId); if (result.error) throw Error('Owned administrator cleanup failed.'); } else if (found.error?.status !== 404) throw Error('Owned administrator absence unconfirmed.'); },
      async () => { await administrator.auth.signOut(); await operator.auth.signOut(); if (enabledRevision !== undefined) await configure(false); },
      async () => { if (originalCounts!) expect(await counts()).toEqual(originalCounts!); },
      () => client.release(), () => owner.end(),
    ]);
  }, 60000);
});
