import { DomainError, requireCapability, validateActorContext } from '@cuevo/domain';
import { membershipSchema, type MembershipResponse } from '@cuevo/contracts';
import { z } from 'zod';

export interface MembershipRow { membership_id: string; actor_id: string; school_id: string; school_name: string; display_name: string; role: string; entitlement_codes: string[] }
export interface VerifiedUser { userId: string; sessionId: string }
export interface VerifiedAccount extends VerifiedUser { email: string; emailConfirmedAt: string }
export interface AccountIdentityDependencies {
  verifyAccount(token: string): Promise<VerifiedAccount>;
  isCurrentSession(userId: string, sessionId: string): Promise<boolean>;
}
export function parseVerifiedAccount(input: unknown): VerifiedAccount {
  const session = z.object({ userId: z.uuid(), sessionId: z.uuid() }).safeParse(input);
  if (!session.success) throw new DomainError('INVALID_SESSION', 401, 'Sign in again to continue.');
  const candidate = input as Record<string, unknown>;
  const email = z.email().max(254).safeParse(candidate.email);
  if (!email.success) throw new DomainError('ACCOUNT_EMAIL_REQUIRED', 403, 'A verified account email is required to continue.');
  const confirmed = z.iso.datetime({ offset: true }).safeParse(candidate.emailConfirmedAt);
  if (!confirmed.success) throw new DomainError('ACCOUNT_EMAIL_UNCONFIRMED', 403, 'Confirm your account email before continuing.');
  return { ...session.data, email: email.data, emailConfirmedAt: confirmed.data };
}
/** Identifies only the current account; it supplies no school or membership authority. */
export class AccountIdentityService {
  constructor(private readonly deps: AccountIdentityDependencies) {}
  async resolve(header: string | undefined): Promise<VerifiedAccount> {
    if (!header || !/^Bearer [^\s]+$/i.test(header)) throw new DomainError('AUTHENTICATION_REQUIRED', 401, 'Sign in to continue.');
    const account = parseVerifiedAccount(await this.deps.verifyAccount(header.slice(7)));
    if (await this.deps.isCurrentSession(account.userId, account.sessionId) !== true) throw new DomainError('SESSION_REVOKED', 401, 'Sign in again to continue.');
    return account;
  }
}
export interface IdentityDependencies {
  verifyUser(token: string): Promise<VerifiedUser>;
  currentMemberships(userId: string): Promise<MembershipRow[]>;
  isCurrentSession(userId: string, sessionId: string): Promise<boolean>;
}
export class IdentityService {
  constructor(private readonly deps: IdentityDependencies) {}
  async resolve(header: string | undefined, schoolId: string | undefined): Promise<MembershipResponse> {
    if (!header || !/^Bearer [^\s]+$/i.test(header)) throw new DomainError('AUTHENTICATION_REQUIRED', 401, 'Sign in to continue.');
    if (schoolId && !z.uuid().safeParse(schoolId).success) throw new DomainError('INVALID_SCHOOL', 400, 'School selection is invalid.');
    const user = await this.deps.verifyUser(header.slice(7));
    if (!await this.deps.isCurrentSession(user.userId, user.sessionId)) throw new DomainError('SESSION_REVOKED', 401, 'Sign in again to continue.');
    const memberships = await this.deps.currentMemberships(user.userId);
    if (!schoolId && memberships.length > 1) throw new DomainError('SCHOOL_SELECTION_REQUIRED', 409, 'Select a current school to continue.');
    const row = schoolId ? memberships.find(m => m.school_id === schoolId) : memberships[0];
    if (!row || row.actor_id !== user.userId) throw new DomainError('ACCESS_DENIED', 403, 'Your current access does not permit this request.');
    const actor = validateActorContext({ userId: user.userId, schoolId: row.school_id, membershipId: row.membership_id, role: row.role, entitlements: row.entitlement_codes });
    requireCapability(actor, row.school_id, 'school.context', ['admin', 'coordinator', 'teacher', 'student', 'parent']);
    return membershipSchema.parse({ ...actor, displayName: row.display_name, school: { id: row.school_id, name: row.school_name } });
  }
}
