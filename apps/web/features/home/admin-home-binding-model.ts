import { schoolAutomationSchema, type SchoolAutomation } from '@cuevo/contracts';
import { LearningApiError } from '../../shared/api/client.ts';
import { parsePage } from '../../shared/api/pagination.ts';
import { parseCurrentSchoolContext, parseAttendance, parseTimetable, parseSchedule, parseSchoolPerson, parseSchoolAudit, parseSchoolRow, type SchoolContext } from '../school/model.ts';

export type AdminHomeReadContext = { apiUrl: string; membership: { schoolId: string; userId: string; role: string; entitlements: string[] } | null; accessToken: string | null; accessGeneration: number; online: boolean; status: string };
export type AdminHomeRead<T> = { scope: string | null; value: T };
export function adminHomeReadScope(context: AdminHomeReadContext, path: string, refresh: number): string | null {
  if (!context.online || context.status !== 'ready' || !context.accessToken || context.membership?.role !== 'admin' || !context.membership.entitlements.includes('school.operations')) return null;
  return JSON.stringify([context.apiUrl, context.membership.schoolId, context.membership.userId, context.membership.role, context.accessToken, context.online, context.accessGeneration, path, refresh]);
}
export function currentAdminHomeRead<T>(read: AdminHomeRead<T> | null | undefined, scope: string | null): T | null { return scope && read?.scope === scope ? read.value : null; }
const fieldsOnly = (value: object, fields: string[]) => Object.keys(value).every(key => fields.includes(key));
export function parseAdminHomePerson(value: unknown) {
  const person = parseSchoolPerson(value);
  if (!fieldsOnly(person, ['id','displayName','role','status','effectiveFrom','effectiveTo','synthetic','revision','selectionContext']) || person.revision !== undefined && (!Number.isSafeInteger(person.revision) || Number(person.revision) < 1)) throw new LearningApiError('invalid');
  return person;
}
export function adminHomePersonName(people: readonly { id: string; displayName: string }[], id: unknown, unavailable: string): string {
  const name = people.find(person => person.id === id)?.displayName;
  return name?.trim() ? name : unavailable;
}
export function parseAdminHomeAudit(value: unknown) {
  const audit = parseSchoolAudit(value);
  if (!fieldsOnly(audit, ['id','actorName','action','objectType','objectId','objectName','outcome','occurredAt','requestId'])) throw new LearningApiError('invalid');
  return audit;
}
export function parseAdminHomeRelationship(value: unknown, kind: 'enrollment' | 'assignment' | 'guardian') {
  const row = parseSchoolRow(value);
  const identifiers = kind === 'enrollment' ? ['classId','studentId'] : kind === 'assignment' ? ['classId','subjectId','teacherId'] : ['parentId','studentId','relationshipType'];
  if (!fieldsOnly(row, ['id',...identifiers,'status','effectiveFrom','effectiveTo','revision']) || identifiers.some(key => typeof row[key] !== 'string' || !row[key]) || !['active','revoked','completed','pending'].includes(String(row.status)) || typeof row.effectiveFrom !== 'string' || row.effectiveTo !== null && typeof row.effectiveTo !== 'string' || row.revision !== undefined && (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1)) throw new LearningApiError('invalid');
  return row;
}
export function parseAdminHomeContext(value: unknown, schoolId: string): SchoolContext {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['school', 'policy', 'intelligence', 'attendance', 'timetable', 'calendar'].includes(key))) throw new LearningApiError('invalid');
  const context = parseCurrentSchoolContext(value, schoolId);
  const exact = (row: object, keys: string[]) => Object.keys(row).length === keys.length && Object.keys(row).every(key => keys.includes(key));
  if (!exact(context.school, ['id','name','countryCode','languages']) || !exact(context.policy, ['version','parentAttendanceVisible','parentUpcomingVisible','studentMessagingEnabled','recognitionEnabled','leaderboardEnabled','analyticsEnabled']) || !exact(context.intelligence, ['fixtureSchoolApproved','liveSchoolApproved','availability'])) throw new LearningApiError('invalid');
  for (const [key, parser] of [['attendance', parseAttendance], ['timetable', parseTimetable], ['calendar', parseSchedule]] as const) {
    if (key in value) parsePage((value as Record<string, unknown>)[key], parser);
  }
  return { school: context.school, policy: context.policy, intelligence: context.intelligence };
}
export function parseAdminHomeAutomation(value: unknown): SchoolAutomation {
  const result = schoolAutomationSchema.safeParse(value);
  if (!result.success || Date.parse(result.data.windowEnd) <= Date.parse(result.data.windowStart)) throw new LearningApiError('invalid');
  return result.data;
}
/** This is only returned handler state; reviewed does not imply system health,
 * an outcome, academic attainment or an XP award. */
export function adminAutomationState(value: SchoolAutomation | null): 'unavailable' | 'requires-review' | 'processing' | 'reviewed' {
  if (!value) return 'unavailable';
  if (value.execution.failed > 0) return 'requires-review';
  if (value.execution.pending > 0 || value.execution.processing > 0) return 'processing';
  return 'reviewed';
}
