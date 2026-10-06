import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Database } from '../../src/platform/database/database';
import type { PoolClient } from 'pg';
import { SchoolAccountService } from '../../src/modules/school/account.service';
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`; const account = { userId: id(1), sessionId: id(2), email: 'member@example.test', emailConfirmedAt: '2026-10-03T00:00:00Z' };
const actor = { userId: id(3), schoolId: id(4), membershipId: id(5), role: 'admin' as const, entitlements: ['school.operations'] };
function fixture(output: unknown, code?: string) {
  const queries: { sql: string; args?: unknown[] }[] = []; const transactions: { actor: string; school?: string }[] = [];
  const database = { actorTransaction: async (actor: string, school: string | undefined, run: (client: PoolClient) => Promise<unknown>) => { transactions.push({ actor, school }); return run({ query: async (sql: string, args?: unknown[]) => { queries.push({ sql, args }); if (sql.includes('set_config')) return { rows: [] }; if (sql.includes('is_current_session')) return { rows: [{ active: true }] }; if (code) throw { code }; return { rows: [{ receipt: output }] }; } } as unknown as PoolClient); } } as unknown as Database;
  return { service: new SchoolAccountService(database), queries, transactions };
}
describe('protected account recovery boundaries', () => {
  it('authorizes only exact own recovery without caller-selected school and persists only a digest', async () => {
    const receipt = { id: id(6), schoolId: actor.schoolId, userId: account.userId, status: 'AUTHORIZED', revision: 1 }; const state = fixture(receipt); const secret = 'a'.repeat(64);
    expect(await state.service.recovery(account, { id: id(6), admissionSecret: secret, confirmRecovery: true }, 'original-recovery-key', 'request')).toEqual(receipt);
    expect(state.transactions).toEqual([{ actor: account.userId, school: undefined }]); const call = state.queries.at(-1)!; expect(call.sql).toContain('authorize_school_account_recovery'); expect(call.args?.[1]).toBe(createHash('sha256').update(secret).digest('hex')); expect(JSON.stringify(state.queries)).not.toContain(secret);
  });
  it('requires current administrator and exact member revision to request recovery', async () => {
    const receipt = { id: id(6), schoolId: actor.schoolId, revision: 1, status: 'REQUESTED', createdAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z' }; const state = fixture(receipt);
    expect(await state.service.requestRecovery(actor, account.userId, { expectedMembershipRevision: 1, reason: 'Verified school member', confirmRecovery: true }, 'original-recovery-key', 'request')).toEqual(receipt);
    await expect(state.service.requestRecovery({ ...actor, role: 'teacher' }, account.userId, { expectedMembershipRevision: 1, reason: 'Verified school member', confirmRecovery: true }, 'original-recovery-key', 'request')).rejects.toMatchObject({ status: 403 });
  });
  it('marks only an exact completed receipt as complete and makes unchanged password actionable', async () => {
    const receipt = { id: id(6), schoolId: actor.schoolId, userId: account.userId, status: 'COMPLETED', revision: 1 }; const state = fixture(receipt);
    expect(await state.service.recovery(account, { id: id(6), confirmCompletion: true }, 'original-recovery-key', 'request', true)).toEqual(receipt);
    const unchanged = fixture(null, 'P0002'); await expect(unchanged.service.recovery(account, { id: id(6), confirmCompletion: true }, 'original-recovery-key', 'request', true)).rejects.toMatchObject({ code: 'RECOVERY_PASSWORD_UNCHANGED', status: 409 });
    await expect(fixture({ ...receipt, userId: actor.userId }).service.recovery(account, { id: id(6), confirmCompletion: true }, 'original-recovery-key', 'request', true)).rejects.toMatchObject({ status: 503 });
  });
});
