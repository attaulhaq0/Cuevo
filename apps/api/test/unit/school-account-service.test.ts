import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { SchoolAccountService } from '../../src/modules/school/account.service';

const actor = { userId: '00000000-0000-4000-8000-000000000001', schoolId: '00000000-0000-4000-8000-000000000002', membershipId: '00000000-0000-4000-8000-000000000003', role: 'admin' as const, entitlements: ['school.operations'] };
const account = { userId: '00000000-0000-4000-8000-000000000004', sessionId: '00000000-0000-4000-8000-000000000005', email: 'learner@example.test', emailConfirmedAt: '2026-10-03T00:00:00Z' };
const invitationId = '00000000-0000-4000-8000-000000000006';
const invite = { displayName: 'New learner', email: account.email, role: 'student', reason: 'Reviewed school admission', confirmInvitation: true };
const receipt = { id: invitationId, schoolId: actor.schoolId, revision: 1, status: 'REQUESTED', createdAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z' };
const claimed = { id: invitationId, schoolId: actor.schoolId, userId: account.userId, role: 'student', status: 'CLAIMED', revision: 2 };
const key = 'school-account-command-0001';
const secret = 'a'.repeat(64);
const digest = createHash('sha256').update(secret).digest('hex');
function store(result: unknown = receipt, options: { session?: unknown; failure?: unknown } = {}) {
  const transactions: { user: string; school: string | undefined }[] = []; const queries: { sql: string; args: unknown[] | undefined }[] = [];
  const database = { actorTransaction: async (user: string, school: string | undefined, callback: (client: PoolClient) => Promise<unknown>) => {
    transactions.push({ user, school });
    return callback({ query: async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.includes('is_current_session')) return { rows: [{ active: Object.hasOwn(options, 'session') ? options.session : true }] };
      if (sql.includes('set_config')) return { rows: [] };
      if (options.failure) throw options.failure;
      return { rows: [{ receipt: result, page: result }] };
    } } as unknown as PoolClient);
  } } as unknown as Database;
  return { service: new SchoolAccountService(database), transactions, queries };
}

describe('school account protected SQL boundary', () => {
  it('saves only the reviewed admin invitation through its exact parameterized private function', async () => {
    const state = store();
    expect(await state.service.invite(actor, invite, key, 'request')).toEqual(receipt);
    expect(state.transactions).toEqual([{ user: actor.userId, school: actor.schoolId }]);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]).toEqual({ sql: 'select internal.create_school_account_invitation($1::jsonb,$2,$3,$4) as receipt', args: [JSON.stringify(invite), key, expect.stringMatching(/^[a-f0-9]{64}$/), 'request'] });
  });
  it.each(['teacher', 'student', 'parent', 'coordinator'] as const)('denies %s invitation management before any database work', async role => {
    const state = store(); await expect(state.service.invite({ ...actor, role }, invite, key, 'request')).rejects.toMatchObject({ status: 403 }); expect(state.queries).toEqual([]);
  });
  it('denies missing entitlement and broad caller-owned identity inputs', async () => {
    const state = store(); await expect(state.service.invite({ ...actor, entitlements: [] }, invite, key, 'request')).rejects.toMatchObject({ status: 403 });
    await expect(state.service.invite(actor, { ...invite, userId: account.userId }, key, 'request')).rejects.toMatchObject({ code: 'INVALID_INPUT' }); expect(state.queries).toEqual([]);
  });
  it('rejects missing original key and unconfirmed invitation before SQL', async () => {
    const state = store(); await expect(state.service.invite(actor, invite, undefined, 'request')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(state.service.invite(actor, { ...invite, confirmInvitation: false }, key, 'request')).rejects.toMatchObject({ code: 'INVALID_INPUT' }); expect(state.queries).toEqual([]);
  });
  it('binds the request fingerprint to the entire reviewed invitation', async () => {
    const state = store(); await state.service.invite(actor, invite, key, 'request'); await state.service.invite(actor, { ...invite, role: 'teacher' }, key, 'request');
    expect(state.queries[0].args?.[2]).not.toBe(state.queries[1].args?.[2]);
  });
  it('does not return malformed, foreign-school or secret-bearing provider receipts', async () => {
    for (const result of [null, { ...receipt, schoolId: invitationId }, { ...receipt, admissionSecret: secret }]) await expect(store(result).service.invite(actor, invite, key, 'request')).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN', status: 503 });
  });
  it('reads only a bounded administrator page scoped to the resolved school', async () => {
    const row = { ...receipt, displayName: invite.displayName, email: invite.email, role: 'student', userId: null }; const state = store({ items: [row], nextCursor: null });
    expect(await state.service.list(actor, {})).toEqual({ items: [row], nextCursor: null });
    expect(state.queries).toEqual([{ sql: 'select internal.read_school_account_invitations($1,$2::uuid) as page', args: [25, null] }]);
    await expect(state.service.list(actor, { limit: 26 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('does not confirm an invitation listing wider than the requested page', async () => {
    const row = { ...receipt, displayName: invite.displayName, email: invite.email, role: 'student', userId: null };
    const second = { ...row, id: actor.userId };
    await expect(store({ items: [row, second], nextCursor: null }).service.list(actor, { limit: 1 })).rejects.toMatchObject({ code: 'REQUEST_UNAVAILABLE', status: 503 });
  });
  it('revokes an exact current request using the original key and reviewed revision', async () => {
    const state = store({ ...receipt, revision: 2, status: 'REVOKED' }); const body = { expectedRevision: 1, reason: 'Recipient cancelled', confirmRevocation: true };
    expect((await state.service.revoke(actor, invitationId, body, key, 'request')).status).toBe('REVOKED');
    expect(state.queries[0].sql).toBe('select internal.revoke_school_account_invitation($1::uuid,$2::jsonb,$3,$4,$5) as receipt');
    expect(state.queries[0].args).toEqual([invitationId, JSON.stringify(body), key, expect.stringMatching(/^[a-f0-9]{64}$/), 'request']);
  });
  it('claims through the account actor without manufacturing school context or passing the raw admission secret', async () => {
    const state = store(claimed);
    expect(await state.service.claim(account, { id: invitationId, admissionSecret: secret, confirmAdmission: true }, key, 'request')).toEqual(claimed);
    expect(state.transactions).toEqual([{ user: account.userId, school: undefined }]);
    expect(state.queries.map(query => query.sql)).toEqual(["select set_config('app.session_id',$1,true)", 'select "authorization".is_current_session($1::uuid) as active', 'select internal.claim_school_account_invitation($1::uuid,$2,$3,$4,$5) as receipt']);
    expect(state.queries[2].args).toEqual([invitationId, digest, key, expect.stringMatching(/^[a-f0-9]{64}$/), 'request']);
    expect(JSON.stringify(state.queries)).not.toContain(secret);
    expect(JSON.stringify(state.queries)).not.toContain(account.email);
  });
  it.each([false, undefined, 'true'])('does not claim on an unconfirmed current SQL session %s', async session => {
    const state = store(claimed, { session }); await expect(state.service.claim(account, { id: invitationId, admissionSecret: secret, confirmAdmission: true }, key, 'request')).rejects.toMatchObject({ code: 'SESSION_REVOKED', status: 401 });
    expect(state.queries.some(query => query.sql.includes('claim_school'))).toBe(false);
  });
  it('does not accept a claim receipt for another account or request', async () => {
    for (const result of [{ ...claimed, userId: actor.userId }, { ...claimed, id: actor.userId }, { ...claimed, admissionSecret: secret }]) await expect(store(result).service.claim(account, { id: invitationId, admissionSecret: secret, confirmAdmission: true }, key, 'request')).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN', status: 503 });
  });
  it('requires a complete provider-confirmed account before any claim transaction', async () => {
    const state = store(claimed);
    await expect(state.service.claim({ ...account, emailConfirmedAt: undefined } as unknown as typeof account, { id: invitationId, admissionSecret: secret, confirmAdmission: true }, key, 'request')).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_UNCONFIRMED', status: 403 });
    expect(state.transactions).toEqual([]);
  });
  it.each([{ code: '42501' }, { code: '22023' }, { code: '57014', message: secret }])('sanitizes private SQL failure %j', async failure => {
    const state = store(receipt, { failure });
    await expect(state.service.invite(actor, invite, key, 'request')).rejects.toMatchObject({ code: failure.code === '42501' ? 'FORBIDDEN' : failure.code === '22023' ? 'ACCOUNT_REQUIRES_REVIEW' : 'ACCOUNT_OUTCOME_UNKNOWN', status: failure.code === '42501' ? 403 : failure.code === '22023' ? 409 : 503 });
  });
});
