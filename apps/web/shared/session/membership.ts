export type Role = 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent';
export type Membership = {
  userId: string;
  schoolId: string;
  membershipId: string;
  role: Role;
  entitlements: string[];
  school: { id: string; name: string };
  displayName: string;
};
export type MembershipFailure = 'unauthorized' | 'denied' | 'multiple-schools' | 'unavailable' | 'invalid-response';
export class MembershipError extends Error {
  kind: MembershipFailure;
  requestId?: string;
  constructor(kind: MembershipFailure, requestId?: string) {
    super('School access could not be verified.');
    this.name = 'MembershipError';
    this.kind = kind;
    this.requestId = requestId;
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
export function parseMembership(value: unknown): Membership {
  const roles: readonly string[] = ['admin', 'coordinator', 'teacher', 'student', 'parent'];
  if (!object(value) || !text(value.userId) || !text(value.schoolId) || !text(value.membershipId)
    || !text(value.role) || !roles.includes(value.role) || !text(value.displayName)
    || !Array.isArray(value.entitlements) || !value.entitlements.every(text)
    || !object(value.school) || value.school.id !== value.schoolId || !text(value.school.name)) {
    throw new MembershipError('invalid-response');
  }
  return {
    userId: value.userId,
    schoolId: value.schoolId,
    membershipId: value.membershipId,
    role: value.role as Role,
    displayName: value.displayName,
    entitlements: [...value.entitlements] as string[],
    school: { id: value.schoolId, name: value.school.name },
  };
}
export async function fetchMembership(options: { apiUrl: string; accessToken: string; schoolId?: string; signal?: AbortSignal }): Promise<Membership> {
  const headers: Record<string, string> = { Authorization: `Bearer ${options.accessToken}`, Accept: 'application/json' };
  if (options.schoolId) headers['x-school-id'] = options.schoolId;
  let response: Response;
  try {
    response = await fetch(`${options.apiUrl.replace(/\/$/, '')}/v1/me`, {
      headers,
      cache: 'no-store',
      credentials: 'omit',
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
    });
  } catch {
    throw new MembershipError('unavailable');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = object(body) && text(body.requestId) ? body.requestId : undefined;
    const code = object(body) && text(body.code) ? body.code : '';
    const kind: MembershipFailure = ['MULTIPLE_SCHOOLS', 'SCHOOL_SELECTION_REQUIRED'].includes(code) ? 'multiple-schools'
      : response.status === 401 ? 'unauthorized'
        : response.status === 403 ? 'denied'
          : response.status >= 500 ? 'unavailable' : 'invalid-response';
    throw new MembershipError(kind, requestId);
  }
  const membership = parseMembership(body);
  if (options.schoolId && membership.schoolId !== options.schoolId) throw new MembershipError('invalid-response');
  return membership;
}
