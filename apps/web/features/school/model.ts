import { LearningApiError } from '../../shared/api/client.ts';
export type SchoolPolicy = { version: number; parentAttendanceVisible: boolean; parentUpcomingVisible: boolean; studentMessagingEnabled: false; recognitionEnabled: boolean; leaderboardEnabled: boolean; analyticsEnabled: boolean };
export type SchoolContext = { school: { id: string; name: string; countryCode: string; languages: ('en' | 'ar')[] }; policy: SchoolPolicy; intelligence: { fixtureSchoolApproved: boolean; liveSchoolApproved: boolean; availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } };
export type SchoolRow = { id: string; [field: string]: string | number | boolean | null };
export type SchoolPerson = SchoolRow & { displayName: string; role: 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent'; status: 'active' | 'suspended' | 'revoked'; effectiveFrom: string; effectiveTo: string | null; synthetic: boolean };
export type AttendanceRow = SchoolRow & { classId: string; learnerId: string; occurredOn: string; revision: number; status: 'present' | 'absent' | 'late' | 'excused'; note: string | null; recordedAt: string };
export type ScheduleRow = SchoolRow & { classId: string | null; startsAt: string; endsAt: string };
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' && value.length > 0; }
function date(value: unknown) { return text(value) && Number.isFinite(Date.parse(String(value))); }
export function parseSchoolContext(value: unknown): SchoolContext {
  if (!object(value) || !object(value.school) || !text(value.school.id) || !text(value.school.name) || typeof value.school.countryCode !== 'string' || !/^[A-Z]{2}$/.test(value.school.countryCode) || !Array.isArray(value.school.languages) || !value.school.languages.length || value.school.languages.some(language => !['en', 'ar'].includes(String(language))) || !object(value.policy) || !Number.isInteger(value.policy.version) || Number(value.policy.version) < 0 || ['parentAttendanceVisible', 'parentUpcomingVisible', 'recognitionEnabled', 'leaderboardEnabled', 'analyticsEnabled'].some(key => typeof (value.policy as Record<string, unknown>)[key] !== 'boolean') || value.policy.studentMessagingEnabled !== false || value.policy.leaderboardEnabled && !value.policy.recognitionEnabled || !object(value.intelligence) || typeof value.intelligence.fixtureSchoolApproved !== 'boolean' || typeof value.intelligence.liveSchoolApproved !== 'boolean' || value.intelligence.availability !== 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED') throw new LearningApiError('invalid');
  return value as SchoolContext;
}
export function parseSchoolRow(value: unknown): SchoolRow {
  if (!object(value) || !text(value.id) || Object.values(value).some(field => field !== null && !['string', 'number', 'boolean'].includes(typeof field)) || ['parentAttendanceVisible', 'parentUpcomingVisible', 'studentMessagingEnabled', 'recognitionEnabled', 'leaderboardEnabled', 'analyticsEnabled', 'parentVisible', 'enabled'].some(key => value[key] !== undefined && typeof value[key] !== 'boolean') || value.status !== undefined && !['active', 'suspended', 'revoked', 'pending', 'completed', 'archived'].includes(String(value.status)) || value.effectiveFrom !== undefined && value.dayOfWeek === undefined && (!date(value.effectiveFrom) || !(value.effectiveTo === null || date(value.effectiveTo) && Date.parse(String(value.effectiveTo)) > Date.parse(String(value.effectiveFrom)))) || value.startsOn !== undefined && (!date(value.startsOn) || !date(value.endsOn) || String(value.endsOn) <= String(value.startsOn))) throw new LearningApiError('invalid');
  return value as SchoolRow;
}
export function parseTimetable(value: unknown): SchoolRow {
  const row = parseSchoolRow(value);
  if (!text(row.classId) || !text(row.subjectId) || !text(row.teacherId) || !Number.isInteger(row.dayOfWeek) || Number(row.dayOfWeek) < 0 || Number(row.dayOfWeek) > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(row.startsAt)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(row.endsAt)) || String(row.endsAt) <= String(row.startsAt) || !date(row.effectiveFrom) || !date(row.effectiveTo) || String(row.effectiveTo) < String(row.effectiveFrom)) throw new LearningApiError('invalid');
  return row;
}
export function parseSchoolPerson(value: unknown): SchoolPerson {
  if (!object(value) || !text(value.id) || !text(value.displayName) || !['admin', 'coordinator', 'teacher', 'student', 'parent'].includes(String(value.role)) || !['active', 'suspended', 'revoked'].includes(String(value.status)) || !date(value.effectiveFrom) || !(value.effectiveTo === null || date(value.effectiveTo) && Date.parse(String(value.effectiveTo)) > Date.parse(String(value.effectiveFrom))) || typeof value.synthetic !== 'boolean') throw new LearningApiError('invalid');
  return value as SchoolPerson;
}
export function parseAttendance(value: unknown): AttendanceRow {
  if (!object(value) || !text(value.id) || !text(value.classId) || !text(value.learnerId) || !date(value.occurredOn) || !Number.isInteger(value.revision) || Number(value.revision) < 1 || !['present', 'absent', 'late', 'excused'].includes(String(value.status)) || !(value.note === null || typeof value.note === 'string') || !date(value.recordedAt)) throw new LearningApiError('invalid');
  return value as AttendanceRow;
}
export function parseSchedule(value: unknown): ScheduleRow {
  if (!object(value) || !text(value.id) || !(value.classId === null || text(value.classId)) || !date(value.startsAt) || !date(value.endsAt) || Date.parse(String(value.endsAt)) <= Date.parse(String(value.startsAt))) throw new LearningApiError('invalid');
  return value as ScheduleRow;
}
