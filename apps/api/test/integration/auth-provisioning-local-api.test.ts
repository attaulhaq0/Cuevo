import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createAuthProvisioning, type AuthProvisioningAdapter } from '../../src/platform/identity/provisioning';
import { assertCuevoLocalTarget, type LocalStatus } from '../../../../scripts/configure-local';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('supported local Auth account creation and invitation link sequence', () => {
  const userId = randomUUID(); const requestId = randomUUID();
  const email = `cuevo-auth-proof-${userId}@example.test`;
  let adapter: AuthProvisioningAdapter; let admin: ReturnType<typeof createClient>;
  beforeAll(() => {
    const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
    assertCuevoLocalTarget(status);
    if (!status.SERVICE_ROLE_KEY || status.API_URL !== 'http://127.0.0.1:56321') throw Error('Verified local Auth proof credential required.');
    // Dedicated test-only provider credential, never borrowed from application Storage config.
    const target = { url: status.API_URL, projectRef: 'LOCAL_CUEVO', webOrigin: 'http://localhost:3000', redirects: { invite: 'http://localhost:3000/account/admission', recovery: 'http://localhost:3000/account/recovery' }, key: status.SERVICE_ROLE_KEY };
    adapter = createAuthProvisioning(target);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  afterAll(async () => {
    if (!admin) return;
    const found = await admin.auth.admin.getUserById(userId);
    if (!found.data.user) { if (found.error?.status === 404 && found.error.code === 'user_not_found') return; throw Error('Owned Auth proof cleanup cannot confirm identity absence.'); }
    if (found.data.user.id !== userId || found.data.user.email !== email) throw Error('Auth proof cleanup refuses an unowned identity.');
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw Error('Owned Auth proof cleanup failed.');
    const absent = await admin.auth.admin.getUserById(userId);
    if (absent.data.user || absent.error?.status !== 404 || absent.error.code !== 'user_not_found') throw Error('Owned Auth proof cleanup did not confirm removal.');
  });
  it('creates one exact unconfirmed UUID and generates its invite without changing identity or claiming delivery', async () => {
    const operation = { requestId, userId, email, priorState: 'NOT_ATTEMPTED' };
    const created = await adapter.createUnconfirmed(operation);
    if (created.state !== 'CONFIRMED') {
      const actual = await admin.auth.admin.getUserById(userId);
      const user = actual.data.user;
      const safe = { state: created.state, code: 'code' in created ? created.code : null, userFound: Boolean(user), idMatches: user?.id === userId, emailMatches: user?.email === email, anonymous: user?.is_anonymous ?? 'MISSING', confirmation: user?.email_confirmed_at === undefined ? 'MISSING' : user?.email_confirmed_at === null ? 'NULL' : 'VALUE', deleted: user?.deleted_at ?? 'MISSING', banned: user?.banned_until ?? 'MISSING' };
      throw Error('Local Auth identity characterization: ' + JSON.stringify(safe));
    }
    expect(created).toMatchObject({ state: 'CONFIRMED', requestId, userId, emailConfirmed: null });
    const replay = await adapter.createUnconfirmed({ ...operation, priorState: 'OUTCOME_UNKNOWN' });
    expect(replay).toEqual(created);
    let secretConsumed = false;
    const generated = await adapter.generateLink({ ...operation, purpose: 'invite' }, async secret => {
      const link = new URL(secret.actionLink); expect(link.origin).toBe('http://127.0.0.1:56321');
      expect(link.searchParams.get('type')).toBe('invite'); expect(link.searchParams.get('token')).toEqual(expect.any(String));
      secretConsumed = true; // No email delivery, logging or token persistence.
    });
    expect(generated).toEqual({ state: 'GENERATED', requestId, userId, purpose: 'invite' });
    expect(secretConsumed).toBe(true);
    expect(JSON.stringify(generated)).not.toContain('token');
    const current = await admin.auth.admin.getUserById(userId);
    expect(current.data.user?.id).toBe(userId); expect(current.data.user?.email).toBe(email);
    expect(current.data.user?.email_confirmed_at ?? null).toBeNull();
  }, 30000);
});
