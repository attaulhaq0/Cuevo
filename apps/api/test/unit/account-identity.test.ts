import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@cuevo/domain';
import { AccountIdentityService } from '../../src/platform/identity/identity.service';

const account = {
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000003',
  email: 'new.learner@example.test',
  emailConfirmedAt: '2026-10-01T12:00:00Z',
};
const dependencies = () => ({
  verifyAccount: vi.fn().mockResolvedValue(account),
  isCurrentSession: vi.fn().mockResolvedValue(true),
  currentMemberships: vi.fn().mockRejectedValue(new Error('Membership discovery must not run.')),
});
const resolve = (deps: ReturnType<typeof dependencies>, header: string | undefined) => {
  return new AccountIdentityService(deps).resolve(header);
};

describe('purpose-only account identity before school admission', () => {
  it('returns the verified current account without granting school authority or looking up memberships', async () => {
    const deps = dependencies();
    deps.verifyAccount.mockResolvedValue({ ...account, role: 'admin', entitlements: ['school.operations'], schoolId: 'foreign', user_metadata: { role: 'admin' } });
    const result = await resolve(deps, 'Bearer verified-token');
    expect(result).toEqual({
      userId: '00000000-0000-4000-8000-000000000001',
      sessionId: '00000000-0000-4000-8000-000000000003',
      email: 'new.learner@example.test',
      emailConfirmedAt: '2026-10-01T12:00:00Z',
    });
    expect(deps.currentMemberships).not.toHaveBeenCalled();
    expect(deps.verifyAccount).toHaveBeenCalledWith('verified-token');
    expect(deps.isCurrentSession).toHaveBeenCalledWith(account.userId, account.sessionId);
  });

  it.each([undefined, '', 'Basic value', 'Bearer ', 'Bearer a b', 'Bearer'])('denies malformed authorization %s before any provider or session work', async header => {
    const deps = dependencies();
    await expect(resolve(deps, header)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    expect(deps.verifyAccount).not.toHaveBeenCalled();
    expect(deps.isCurrentSession).not.toHaveBeenCalled();
  });

  it.each([
    { userId: undefined }, { userId: 'other' }, { sessionId: undefined }, { sessionId: 'other' },
  ])('denies missing or malformed provider subject/session %j', async change => {
    const deps = dependencies();
    deps.verifyAccount.mockResolvedValue({ ...account, ...change });
    await expect(resolve(deps, 'Bearer verified-token')).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401 });
    expect(deps.isCurrentSession).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'not-an-email', ' new.learner@example.test', 'x'.repeat(255) + '@example.test'])('denies unavailable or malformed provider email %s', async email => {
    const deps = dependencies();
    deps.verifyAccount.mockResolvedValue({ ...account, email });
    await expect(resolve(deps, 'Bearer verified-token')).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_REQUIRED', status: 403 });
    expect(deps.currentMemberships).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'not-a-time'])('denies unconfirmed account email %s', async emailConfirmedAt => {
    const deps = dependencies();
    deps.verifyAccount.mockResolvedValue({ ...account, emailConfirmedAt });
    await expect(resolve(deps, 'Bearer verified-token')).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_UNCONFIRMED', status: 403 });
  });

  it.each([false, undefined, 'true'])('requires an affirmative current-session result %s', async active => {
    const deps = dependencies();
    deps.isCurrentSession.mockResolvedValue(active);
    await expect(resolve(deps, 'Bearer verified-token')).rejects.toMatchObject({ code: 'SESSION_REVOKED', status: 401 });
    expect(deps.currentMemberships).not.toHaveBeenCalled();
  });

  it('preserves sanitized authentication dependency outages', async () => {
    const deps = dependencies();
    deps.verifyAccount.mockRejectedValue(new DomainError('AUTH_UNAVAILABLE', 503, 'Authentication is temporarily unavailable.'));
    await expect(resolve(deps, 'Bearer verified-token')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503 });
    expect(deps.isCurrentSession).not.toHaveBeenCalled();
  });

  it('does not treat an unavailable session authority as an active account', async () => {
    const deps = dependencies();
    deps.isCurrentSession.mockRejectedValue(new DomainError('DATABASE_UNAVAILABLE', 503, 'School services are temporarily unavailable.'));
    await expect(resolve(deps, 'Bearer verified-token')).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE', status: 503 });
    expect(deps.currentMemberships).not.toHaveBeenCalled();
  });
});
