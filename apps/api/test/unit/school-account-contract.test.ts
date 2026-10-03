import { describe, expect, it } from 'vitest';
import * as contracts from '@cuevo/contracts';

const id = '00000000-0000-4000-8000-000000000001';
const schoolId = '00000000-0000-4000-8000-000000000002';
const invitation = { displayName: 'New learner', email: 'new.learner@example.test', role: 'student', reason: 'Reviewed school admission', confirmInvitation: true };
const receipt = { id, schoolId, revision: 1, status: 'REQUESTED', createdAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z' };

describe('school account boundary contracts', () => {
  it('availability describes operator and delivery setup without granting account access', () => {
    const schema = (contracts as unknown as Record<string, { safeParse(value: unknown): { success: boolean } }>).schoolAccountAvailabilitySchema;
    expect(schema).toBeDefined();
    for (const value of [{ state: 'AVAILABLE', reason: null }, { state: 'SETUP_REQUIRED', reason: 'OPERATOR_APPROVAL_REQUIRED' }, { state: 'SETUP_REQUIRED', reason: 'DELIVERY_UNAVAILABLE' }]) expect(schema.safeParse(value).success).toBe(true);
    for (const value of [{ state: 'AVAILABLE', reason: 'OPERATOR_APPROVAL_REQUIRED' }, { state: 'SETUP_REQUIRED', reason: null }, { state: 'AVAILABLE', reason: null, token: 'private' }]) expect(schema.safeParse(value).success).toBe(false);
  });
  it.each(['admin', 'coordinator', 'teacher', 'student', 'parent'])('permits a reviewed school invitation for the established %s role', role => {
    expect(contracts.schoolAccountInviteSchema?.safeParse({ ...invitation, role }).success).toBe(true);
  });
  it.each([{ confirmInvitation: undefined }, { confirmInvitation: false }, { role: 'owner' }, { displayName: '' }, { email: 'invalid' }, { email: ' new.learner@example.test' }, { reason: '' }, { schoolId }, { userId: id }, { password: 'secret' }, { entitlements: ['all'] }, { metadata: { role: 'admin' } }])('rejects unconfirmed, invalid or privilege-bearing invitation fields %j', change => {
    expect(contracts.schoolAccountInviteSchema?.safeParse({ ...invitation, ...change }).success).toBe(false);
  });
  it('requires bounded human fields', () => {
    expect(contracts.schoolAccountInviteSchema?.safeParse({ ...invitation, displayName: 'x'.repeat(201) }).success).toBe(false);
    expect(contracts.schoolAccountInviteSchema?.safeParse({ ...invitation, reason: 'x'.repeat(1001) }).success).toBe(false);
    expect(contracts.schoolAccountInviteSchema?.safeParse({ ...invitation, email: 'x'.repeat(255) + '@example.test' }).success).toBe(false);
  });
  it('claims only an exact request with a purpose secret and deliberate acceptance', () => {
    expect(contracts.schoolAccountClaimSchema?.safeParse({ id, admissionSecret: 'a'.repeat(64), confirmAdmission: true }).success).toBe(true);
    for (const input of [{ id, admissionSecret: 'a'.repeat(64) }, { id, admissionSecret: 'A'.repeat(64), confirmAdmission: true }, { id, admissionSecret: 'a'.repeat(63), confirmAdmission: true }, { id, admissionSecret: 'a'.repeat(64), confirmAdmission: true, role: 'admin' }, { id, admissionSecret: 'a'.repeat(64), confirmAdmission: true, schoolId }]) expect(contracts.schoolAccountClaimSchema?.safeParse(input).success).toBe(false);
  });
  it('revokes only a reviewed current request revision', () => {
    expect(contracts.schoolAccountInvitationRevokeSchema?.safeParse({ expectedRevision: 1, reason: 'Recipient cancelled admission', confirmRevocation: true }).success).toBe(true);
    expect(contracts.schoolAccountInvitationRevokeSchema?.safeParse({ expectedRevision: 0, reason: 'Cancelled', confirmRevocation: true }).success).toBe(false);
    expect(contracts.schoolAccountInvitationRevokeSchema?.safeParse({ expectedRevision: 1, reason: 'Cancelled' }).success).toBe(false);
  });
  it('requires a bounded page and unique current request rows', () => {
    expect(contracts.schoolAccountInvitationQuerySchema?.safeParse({}).data).toEqual({ limit: 25 });
    expect(contracts.schoolAccountInvitationQuerySchema?.safeParse({ limit: 26 }).success).toBe(false);
    const row = { ...receipt, displayName: invitation.displayName, email: invitation.email, role: invitation.role, userId: null };
    expect(contracts.schoolAccountInvitationPageSchema?.safeParse({ items: [row], nextCursor: null }).success).toBe(true);
    expect(contracts.schoolAccountInvitationPageSchema?.safeParse({ items: [row, row], nextCursor: null }).success).toBe(false);
  });
  it('does not accept secrets, raw provider errors or inconsistent dates in receipts', () => {
    expect(contracts.schoolAccountInvitationReceiptSchema?.safeParse(receipt).success).toBe(true);
    for (const change of [{ token: 'private' }, { admissionSecret: 'a'.repeat(64) }, { error: 'private error' }, { expiresAt: '2026-10-01T00:00:00Z' }, { status: 'pending' }]) expect(contracts.schoolAccountInvitationReceiptSchema?.safeParse({ ...receipt, ...change }).success).toBe(false);
  });
  it('confirms admission without issuing a full membership, email or token response', () => {
    const claimed = { id, schoolId, userId: '00000000-0000-4000-8000-000000000003', role: 'student', status: 'CLAIMED', revision: 2 };
    expect(contracts.schoolAccountClaimReceiptSchema?.safeParse(claimed).success).toBe(true);
    expect(contracts.schoolAccountClaimReceiptSchema?.safeParse({ ...claimed, email: invitation.email }).success).toBe(false);
    expect(contracts.schoolAccountClaimReceiptSchema?.safeParse({ ...claimed, role: 'owner' }).success).toBe(false);
  });
});
