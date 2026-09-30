import { describe, expect, it } from 'vitest';
import {
  DomainError,
  isActiveMembership,
  isActiveRelationship,
  requireCapability,
  requireLearnerScope,
  validateActorContext,
  type ActorContext,
  type LearnerScope,
  type Role,
} from '../src/index';

const actor: ActorContext = {
  userId: 'teacher-a',
  schoolId: 'school-a',
  role: 'teacher',
  membershipId: 'membership-a',
  entitlements: ['school.context', 'assessment'],
};

const scope: LearnerScope = {
  schoolId: 'school-a',
  learnerId: 'learner-a',
  teacherAssigned: true,
  parentApproved: false,
  relationshipActive: true,
};

function expectDenied(action: () => unknown, status = 403) {
  try {
    action();
    expect.fail('Protected operation was allowed');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ status });
  }
}

describe('capability authorization', () => {
  it('allows a current server-resolved actor with the exact entitlement and role', () => {
    expect(() => requireCapability(actor, 'school-a', 'assessment', ['teacher'])).not.toThrow();
  });

  it('denies another school even when the actor is an admin', () => {
    expectDenied(() => requireCapability({ ...actor, role: 'admin' }, 'school-b', 'assessment', ['admin']));
  });

  it('denies a disabled entitlement instead of giving admins an implicit bypass', () => {
    expectDenied(() => requireCapability({ ...actor, role: 'admin', entitlements: [] }, 'school-a', 'assessment', ['admin']));
  });

  it('denies a role outside the operation policy', () => {
    expectDenied(() => requireCapability(actor, 'school-a', 'assessment', ['coordinator']));
  });

  it('does not treat an entitlement prefix as permission', () => {
    expectDenied(() => requireCapability({ ...actor, entitlements: ['assessment.read'] }, 'school-a', 'assessment', ['teacher']));
  });

  it.each(['superadmin', 'Teacher', '', null])('rejects malformed role %s', (role) => {
    expectDenied(() => requireCapability({ ...actor, role } as unknown as ActorContext, 'school-a', 'assessment', ['teacher']), 401);
  });

  it.each(['userId', 'schoolId', 'membershipId', 'entitlements'])('rejects missing actor field %s', (field) => {
    const incomplete: Record<string, unknown> = { ...actor };
    delete incomplete[field];
    expectDenied(() => validateActorContext(incomplete), 401);
  });

  it('returns a detached context so later mutation of query results does not alter permission', () => {
    const input = { ...actor, entitlements: ['assessment'] };
    const validated = validateActorContext(input);
    input.entitlements.length = 0;
    expect(() => requireCapability(validated, 'school-a', 'assessment', ['teacher'])).not.toThrow();
  });

  it('rejects an empty operation policy instead of broadening it', () => {
    expectDenied(() => requireCapability(actor, 'school-a', 'assessment', []), 500);
  });
});

describe('learner scope from trusted current queries', () => {
  it.each(['admin', 'coordinator'] satisfies Role[])('allows %s within the validated school', (role) => {
    expect(() => requireLearnerScope({ ...actor, role }, 'learner-a', scope)).not.toThrow();
  });

  it('allows an assigned teacher', () => {
    expect(() => requireLearnerScope(actor, 'learner-a', scope)).not.toThrow();
  });

  it('denies an unassigned teacher', () => {
    expectDenied(() => requireLearnerScope(actor, 'learner-a', { ...scope, teacherAssigned: false }));
  });

  it('denies a revoked teacher assignment', () => {
    expectDenied(() => requireLearnerScope(actor, 'learner-a', { ...scope, relationshipActive: false }));
  });

  it('allows a parent only through an approved active relationship', () => {
    expect(() => requireLearnerScope({ ...actor, role: 'parent' }, 'learner-a', { ...scope, parentApproved: true })).not.toThrow();
  });

  it.each([
    { parentApproved: false, relationshipActive: true },
    { parentApproved: true, relationshipActive: false },
  ])('denies an unapproved or revoked parent relationship %j', (relationship) => {
    expectDenied(() => requireLearnerScope({ ...actor, role: 'parent' }, 'learner-a', { ...scope, ...relationship }));
  });

  it('allows a student only for their own auth subject and current enrollment', () => {
    expect(() => requireLearnerScope({ ...actor, userId: 'learner-a', role: 'student' }, 'learner-a', scope)).not.toThrow();
  });

  it('denies another learner to a student', () => {
    expectDenied(() => requireLearnerScope({ ...actor, role: 'student' }, 'learner-a', scope));
  });

  it('denies a student after enrollment revocation', () => {
    expectDenied(() => requireLearnerScope({ ...actor, userId: 'learner-a', role: 'student' }, 'learner-a', { ...scope, relationshipActive: false }));
  });

  it('denies a mismatched resolved object identifier', () => {
    expectDenied(() => requireLearnerScope(actor, 'learner-b', scope));
  });

  it('denies cross-school scope for every role', () => {
    for (const role of ['admin', 'coordinator', 'teacher', 'student', 'parent'] satisfies Role[]) {
      expectDenied(() => requireLearnerScope({ ...actor, userId: 'learner-a', role }, 'learner-a', { ...scope, schoolId: 'school-b', parentApproved: true }));
    }
  });

  it('denies unknown relationship state instead of assuming it is active', () => {
    expectDenied(() => requireLearnerScope(actor, 'learner-a', { ...scope, relationshipActive: undefined } as unknown as LearnerScope));
  });
});

describe.each([
  ['membership', isActiveMembership],
  ['relationship', isActiveRelationship],
] as const)('current %s window', (_label, isActive) => {
  const now = new Date('2026-10-01T09:00:00.000Z');

  it.each([
    { status: 'active', validFrom: null, validUntil: null, expected: true },
    { status: 'active', validFrom: '2026-10-01T09:00:00.000Z', validUntil: '2026-10-02T09:00:00.000Z', expected: true },
    { status: 'active', validFrom: null, validUntil: '2026-10-01T09:00:00.000Z', expected: false },
    { status: 'active', validFrom: '2026-10-02T09:00:00.000Z', validUntil: null, expected: false },
    { status: 'revoked', validFrom: null, validUntil: null, expected: false },
    { status: 'suspended', validFrom: null, validUntil: null, expected: false },
    { status: 'active', validFrom: 'invalid', validUntil: null, expected: false },
    { status: 'active', validFrom: '2026-10-02T09:00:00.000Z', validUntil: '2026-09-30T09:00:00.000Z', expected: false },
    { status: 'active', validFrom: undefined, validUntil: null, expected: false },
    { status: 'active', validFrom: null, validUntil: undefined, expected: false },
  ])('resolves %j', ({ expected, ...window }) => {
    expect(isActive(window, now)).toBe(expected);
  });

  it('rejects an unknown evaluation time', () => {
    expect(isActive({ status: 'active', validFrom: null, validUntil: null }, new Date('invalid'))).toBe(false);
  });
});
