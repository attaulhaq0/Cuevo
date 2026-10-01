import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@cuevo/domain';
import { IdentityService, type IdentityDependencies } from '../../src/platform/identity/identity.service';

const membership = { membership_id: '00000000-0000-4000-8000-000000000004', actor_id: '00000000-0000-4000-8000-000000000001', school_id: '00000000-0000-4000-8000-000000000002', school_name: 'Synthetic school', display_name: 'Synthetic learner', role: 'student', entitlement_codes: ['school.context'] };
const deps = (): IdentityDependencies => ({
  verifyUser: vi.fn().mockResolvedValue({ userId: membership.actor_id, sessionId: '00000000-0000-4000-8000-000000000003' }),
  currentMemberships: vi.fn().mockResolvedValue([membership]),
  isCurrentSession: vi.fn().mockResolvedValue(true),
});

describe('identity authorization boundary', () => {
  it('rejects absent authorization before resolving protected data', async () => {
    const d = deps();
    await expect(new IdentityService(d).resolve(undefined, undefined)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    expect(d.currentMemberships).not.toHaveBeenCalled();
  });
  it('does not accept malformed authorization or token claims as role', async () => {
    for (const header of ['Basic value', 'Bearer ', 'Bearer a b', 'Bearer']) {
      await expect(new IdentityService(deps()).resolve(header, undefined)).rejects.toMatchObject({ status: 401 });
    }
  });
  it('uses a current stored membership and requested school only after user verification', async () => {
    const result = await new IdentityService(deps()).resolve('Bearer verified-token', membership.school_id);
    expect(result).toMatchObject({ userId: membership.actor_id, role: 'student', schoolId: membership.school_id, school: { name: 'Synthetic school' } });
  });
  it('rejects a foreign school even with valid authentication', async () => {
    await expect(new IdentityService(deps()).resolve('Bearer verified-token', '00000000-0000-4000-8000-000000000099')).rejects.toMatchObject({ status: 403 });
  });
  it('rejects revoked sessions and memberships', async () => {
    const d = deps(); d.isCurrentSession = vi.fn().mockResolvedValue(false);
    await expect(new IdentityService(d).resolve('Bearer verified-token', undefined)).rejects.toMatchObject({ status: 401 });
    const e = deps(); e.currentMemberships = vi.fn().mockResolvedValue([]);
    await expect(new IdentityService(e).resolve('Bearer verified-token', undefined)).rejects.toMatchObject({ status: 403 });
  });
  it('requires an explicit school selection when current memberships differ', async () => {
    const d = deps(); d.currentMemberships = vi.fn().mockResolvedValue([membership, { ...membership, school_id: '00000000-0000-4000-8000-000000000099' }]);
    await expect(new IdentityService(d).resolve('Bearer verified-token', undefined)).rejects.toMatchObject({ code: 'SCHOOL_SELECTION_REQUIRED', status: 409 });
  });
  it('denies missing entitlements and malformed persisted role', async () => {
    for (const bad of [{ ...membership, entitlement_codes: [] }, { ...membership, role: 'superadmin' }]) {
      const d = deps(); d.currentMemberships = vi.fn().mockResolvedValue([bad]);
      await expect(new IdentityService(d).resolve('Bearer verified-token', undefined)).rejects.toBeInstanceOf(DomainError);
    }
  });
  it('does not mislabel an auth dependency outage as invalid credentials', async () => {
    const d = deps(); d.verifyUser = vi.fn().mockRejectedValue(new DomainError('AUTH_UNAVAILABLE', 503, 'Authentication is unavailable.'));
    await expect(new IdentityService(d).resolve('Bearer verified-token', undefined)).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503 });
  });
});
