export const quickLoginRoles = ['admin', 'coordinator', 'teacher', 'student', 'parent'] as const;
export type QuickLoginRole = typeof quickLoginRoles[number];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function availableQuickLogin(value: unknown): boolean {
  if (!object(value) || Object.keys(value).length !== 2 || value.available !== true || !Array.isArray(value.roles)) return false;
  const returned = value.roles;
  return returned.length === quickLoginRoles.length && quickLoginRoles.every((role, index) => returned[index] === role);
}
export function quickLoginSession(value: unknown, role: QuickLoginRole): { access_token: string; refresh_token: string } | null {
  if (!object(value) || Object.keys(value).length !== 2 || value.role !== role || !object(value.session) || Object.keys(value.session).length !== 2 || typeof value.session.access_token !== 'string' || !value.session.access_token || value.session.access_token.length > 16384 || typeof value.session.refresh_token !== 'string' || !value.session.refresh_token || value.session.refresh_token.length > 4096) return null;
  return { access_token: value.session.access_token, refresh_token: value.session.refresh_token };
}
