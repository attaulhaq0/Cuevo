import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database';
import type { PoolClient } from 'pg';
import { SchoolAccountEffectsService } from '../../src/modules/school/account-effects.service';
import type { AuthProvisioningAdapter } from '../../src/platform/identity/provisioning';

const id = (n: number) => `39000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(1), schoolId: id(2), membershipId: id(3), role: 'admin' as const, entitlements: ['school.operations'] }; const now = Date.parse('2026-10-03T00:00:00Z');
const source = { purpose: 'recovery', requestId: id(4), eventId: id(5), leaseToken: id(6), schoolId: actor.schoolId, userId: id(7), email: 'existing@example.test', requestRevision: 1, state: 'ADMITTED', expiresAt: '2026-10-04T00:00:00Z', leaseExpiresAt: '2026-10-03T00:01:00Z', priorCreateState: 'NOT_ATTEMPTED', priorLinkState: 'NOT_ATTEMPTED', priorDeliveryState: 'NOT_ATTEMPTED' };
function fixture(confirmed: boolean | null = true) {
  const calls: string[] = []; const messages: string[] = [];
  const database = { actorTransaction: async (_user: string, _school: string, run: (client: PoolClient) => Promise<unknown>) => run({ query: async (sql: string) => {
    calls.push(sql); if (sql.includes('claim_school')) return { rows: [{ context: source }] };
    if (sql.includes('begin_school')) return { rows: [{ admitted: true }] }; if (sql.includes('effect_step')) return { rows: [{ recorded: true }] };
    return { rows: [{ receipt: { id: source.requestId, schoolId: source.schoolId, eventId: source.eventId, requestRevision: 1, status: 'AWAITING_CLAIM', providerState: 'CONFIRMED', deliveryState: 'ACCEPTED' } }] };
  } } as unknown as PoolClient) } as unknown as Database;
  const provider: Pick<AuthProvisioningAdapter, 'createUnconfirmed' | 'reconcileUser' | 'generateLink'> = { createUnconfirmed: async () => { throw Error('Recovery cannot create a user.'); }, reconcileUser: async () => ({ state: 'CONFIRMED', requestId: source.requestId, userId: source.userId, emailConfirmed: confirmed }), generateLink: async (input, sink) => { expect(input).toMatchObject({ purpose: 'recovery', userId: source.userId }); await sink({ purpose: 'recovery', actionLink: 'http://127.0.0.1:56321/auth/v1/verify?type=recovery&token=one-use-token&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Faccount%2Frecovery' }); return { state: 'GENERATED', requestId: source.requestId, userId: source.userId, purpose: 'recovery' }; } };
  return { calls, messages, service: new SchoolAccountEffectsService(database, provider, async message => { messages.push(message.admissionUrl); return { state: 'ACCEPTED' }; }, { admissionUrl: 'http://localhost:3000/account/admission', now: () => now }) };
}
describe('purpose-bound recovery on the same account effect engine', () => {
  it('reconciles an existing confirmed identity and captures only the recovery continuation', async () => {
    const test = fixture(); expect((await test.service.execute(actor, source.requestId)).status).toBe('AWAITING_CLAIM'); expect(test.messages).toHaveLength(1);
    const url = new URL(test.messages[0]); expect(url.pathname).toBe('/account/recovery'); expect(new URLSearchParams(url.hash.slice(1)).get('type')).toBe('recovery');
    expect(JSON.stringify(test.calls)).not.toContain('one-use-token');
  });
  it.each([false, null])('refuses recovery when provider email confirmation is %s without generating or sending a link', async confirmed => {
    const test = fixture(confirmed); await expect(test.service.execute(actor, source.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.messages).toEqual([]);
  });
});
