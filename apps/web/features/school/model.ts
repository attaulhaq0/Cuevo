import { LearningApiError } from '../../shared/api/client.ts';
import { learnerProfileSchema, schoolPersonSelectionContextSchema, schoolPersonSelectionSchema, schoolAttendanceRosterSelectionSchema, type SchoolPersonSelectionContext } from '@cuevo/contracts';

export type SchoolRead<T> = { scope: string; value: T };
export function currentSchoolRead<T>(read: SchoolRead<T> | null, scope: string): T | null { return read?.scope === scope ? read.value : null; }
export type LearnerProfileRecord = ReturnType<typeof learnerProfileSchema.parse>;
export function parseCurrentLearnerProfile(value: unknown, learnerId: string): LearnerProfileRecord {
  const parsed = learnerProfileSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== learnerId || parsed.data.enrollments.some(enrollment => enrollment.effectiveTo !== null && Date.parse(enrollment.effectiveTo) <= Date.parse(enrollment.effectiveFrom))) throw new LearningApiError('invalid');
  return parsed.data;
}
export function parseCurrentSchoolContext(value: unknown, schoolId: string): SchoolContext {
  const context = parseSchoolContext(value);
  if (context.school.id !== schoolId) throw new LearningApiError('invalid');
  return context;
}
export function parseCurrentAttendance(value: unknown, learnerId?: string): AttendanceRow {
  const record = parseAttendance(value);
  if (learnerId && record.learnerId !== learnerId) throw new LearningApiError('invalid');
  return record;
}
/** A chosen calendar date selects an existing timetable window only. This
 * does not claim a class happened or infer attendance from its schedule. */
export function schoolTimetableForDate(rows: readonly SchoolRow[], day: string): SchoolRow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) return [];
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return rows.filter(row => row.dayOfWeek === weekday && typeof row.effectiveFrom === 'string' && typeof row.effectiveTo === 'string' && row.effectiveFrom <= day && row.effectiveTo >= day).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)) || a.id.localeCompare(b.id));
}
export type SchoolPolicy = { version: number; parentAttendanceVisible: boolean; parentUpcomingVisible: boolean; studentMessagingEnabled: false; recognitionEnabled: boolean; leaderboardEnabled: boolean; analyticsEnabled: boolean };
export type SchoolContext = { school: { id: string; name: string; countryCode: string; languages: ('en' | 'ar')[] }; policy: SchoolPolicy; intelligence: { fixtureSchoolApproved: boolean; liveSchoolApproved: boolean; availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } };
export type SchoolRow = { id: string; [field: string]: string | number | boolean | null | SchoolPersonSelectionContext };
export type Campus={id:string;name:string;location:string|null;retired:boolean};
export type ClassCampus={id:string;revision:number;campusId:string|null;campusName:string|null};
export type LearningSupport={id:string;learnerId:string;learnerName:string;courseId:string;courseTitle:string;assessmentId:string|null;assessmentTitle:string|null;title:string;instructions:string;effectiveFrom:string;effectiveTo:string;revision:1|2;state:'ACTIVE'|'UPCOMING'|'EXPIRED'|'REVOKED';approvalReason?:string};
export function parseCampus(value:unknown):Campus{if(!object(value)||!text(value.id)||!text(value.name)||!(value.location===null||typeof value.location==='string')||typeof value.retired!=='boolean')throw new LearningApiError('invalid');return value as Campus;}
export function parseClassCampus(value:unknown):ClassCampus{if(!object(value)||!text(value.id)||!Number.isInteger(value.revision)||Number(value.revision)<0||!(value.campusId===null||text(value.campusId))||!(value.campusName===null||text(value.campusName)))throw new LearningApiError('invalid');return value as ClassCampus;}
export function parseLearningSupport(value:unknown):LearningSupport{if(!object(value)||!['id','learnerId','learnerName','courseId','courseTitle','title','instructions'].every(key=>text(value[key]))||!date(value.effectiveFrom)||!date(value.effectiveTo)||![1,2].includes(Number(value.revision))||!['ACTIVE','UPCOMING','EXPIRED','REVOKED'].includes(String(value.state))||!(value.assessmentId===null||text(value.assessmentId))||!(value.assessmentTitle===null||text(value.assessmentTitle))||value.approvalReason!==undefined&&typeof value.approvalReason!=='string')throw new LearningApiError('invalid');return value as LearningSupport;}
export function schoolAccessRevision(action: 'person' | 'enrollment' | 'assignment' | 'guardian', input: Record<string, unknown>, rows: SchoolRow[], personId?: string): number | undefined {
  const keys = action === 'person' ? [] : action === 'enrollment' ? ['classId', 'studentId'] : action === 'assignment' ? ['classId', 'subjectId', 'teacherId'] : ['parentId', 'studentId'];
  if (action === 'person' && !personId || keys.some(key => !input[key])) return undefined;
  const row = rows.find(candidate => action === 'person' ? candidate.id === personId : keys.every(key => candidate[key] === input[key]));
  return row ? Number.isInteger(row.revision) && Number(row.revision) > 0 ? Number(row.revision) : undefined : 0;
}
export function schoolAccessBasis(action: 'person' | 'enrollment' | 'assignment' | 'guardian', input: Record<string, unknown>, rows: SchoolRow[], previous?: { values: Record<string, string | boolean>; basis: Record<string, unknown> }, personId?: string): number | undefined {
  const keys=action==='person'?[]:action==='enrollment'?['classId','studentId']:action==='assignment'?['classId','subjectId','teacherId']:['parentId','studentId'];
  const key=JSON.stringify([action,personId??null,...keys.map(key=>input[key])]);
  const same=!!previous&&(previous.basis.accessSourceKey!==undefined?previous.basis.accessSourceKey===key:keys.every(key=>previous.values[key]===input[key]));
  return same&&Number.isInteger(previous.basis.expectedRevision)?Number(previous.basis.expectedRevision):schoolAccessRevision(action,input,rows,personId);
}
export function schoolAccessSourceKey(action: 'person' | 'enrollment' | 'assignment' | 'guardian', input: Record<string, unknown>, personId?: string): string {
 const keys=action==='person'?[]:action==='enrollment'?['classId','studentId']:action==='assignment'?['classId','subjectId','teacherId']:['parentId','studentId'];
 return JSON.stringify([action,personId??null,...keys.map(key=>input[key])]);
}
export type SchoolPerson = SchoolRow & { displayName: string; role: 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent'; status: 'active' | 'suspended' | 'revoked'; effectiveFrom: string; effectiveTo: string | null; synthetic: boolean; selectionContext: SchoolPersonSelectionContext };
export type AttendanceRow = SchoolRow & { classId: string; learnerId: string; occurredOn: string; revision: number; status: 'present' | 'absent' | 'late' | 'excused'; note: string | null; recordedAt: string };
export type ScheduleRow = SchoolRow & { classId: string | null; startsAt: string; endsAt: string };
export type SchoolAuditRow = { id: string; actorName: string | null; action: string; objectType: string; objectId: string; objectName: string | null; outcome: 'succeeded' | 'denied' | 'failed'; occurredAt: string; requestId: string };
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' && value.length > 0; }
function date(value: unknown) { return text(value) && Number.isFinite(Date.parse(String(value))); }
export function parseSchoolAudit(value: unknown): SchoolAuditRow { if (!object(value) || !['id', 'action', 'objectType', 'objectId', 'requestId'].every(key => text(value[key])) || !date(value.occurredAt) || !['succeeded', 'denied', 'failed'].includes(String(value.outcome)) || !(value.actorName === null || text(value.actorName)) || !(value.objectName === null || text(value.objectName))) throw new LearningApiError('invalid'); return value as SchoolAuditRow; }
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
  if(object(value)&&value.selectionContext!==undefined){const parsed=schoolPersonSelectionSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return {...parsed.data,displayName:parsed.data.displayName??''}as SchoolPerson;}
  if (!object(value) || !text(value.id) || !text(value.displayName) || !['admin', 'coordinator', 'teacher', 'student', 'parent'].includes(String(value.role)) || !['active', 'suspended', 'revoked'].includes(String(value.status)) || !date(value.effectiveFrom) || !(value.effectiveTo === null || date(value.effectiveTo) && Date.parse(String(value.effectiveTo)) > Date.parse(String(value.effectiveFrom))) || typeof value.synthetic !== 'boolean') throw new LearningApiError('invalid');
  const selection = schoolPersonSelectionContextSchema.safeParse(value.selectionContext ?? { status: 'REQUIRES_REVIEW', enrollmentState: 'UNAVAILABLE', classes: [] });
  if (!selection.success) throw new LearningApiError('invalid');
  return { ...value, selectionContext: selection.data } as SchoolPerson;
}
export function parseSchoolRosterPerson(value: unknown): SchoolPerson {
 const parsed=schoolAttendanceRosterSelectionSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');
 return {...parsed.data,displayName:parsed.data.displayName??'',role:'student',status:'active',effectiveFrom:'',effectiveTo:null,synthetic:false} as SchoolPerson;
}
export function parseAttendance(value: unknown): AttendanceRow {
  if (!object(value) || !text(value.id) || !text(value.classId) || !text(value.learnerId) || !date(value.occurredOn) || !Number.isInteger(value.revision) || Number(value.revision) < 1 || !['present', 'absent', 'late', 'excused'].includes(String(value.status)) || !(value.note === null || typeof value.note === 'string') || !date(value.recordedAt)) throw new LearningApiError('invalid');
  return value as AttendanceRow;
}
export function parseSchedule(value: unknown): ScheduleRow {
  if (!object(value) || !text(value.id) || !(value.classId === null || text(value.classId)) || !date(value.startsAt) || !date(value.endsAt) || Date.parse(String(value.endsAt)) <= Date.parse(String(value.startsAt))) throw new LearningApiError('invalid');
  return value as ScheduleRow;
}
