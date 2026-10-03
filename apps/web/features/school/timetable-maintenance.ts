import type { SchoolRow } from './model.ts';
import { schoolAr, schoolEn } from './messages.ts';

export type TimetableMaintenanceContext = { status: 'READY' | 'REQUIRES_REVIEW'; classLabel: string; subjectName: string; teacherName: string; weekday: string; timeRange: string; window: string; location: string; revision: number | null; accessibleLabel: string };
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
function human(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.trim()); }
function validDate(value: unknown): value is string { return typeof value === 'string' && date.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }

export function timetableMaintenanceContext(row: SchoolRow | Record<string, unknown>, locale: 'en' | 'ar'): TimetableMaintenanceContext {
  const t = locale === 'ar' ? schoolAr : schoolEn;
  const namesReady = [row.className, row.academicYearName, row.subjectName, row.teacherName].every(human);
  const weekdayReady = typeof row.dayOfWeek === 'number' && Number.isInteger(row.dayOfWeek) && row.dayOfWeek >= 0 && row.dayOfWeek <= 6;
  const timeReady = typeof row.startsAt === 'string' && clock.test(row.startsAt) && typeof row.endsAt === 'string' && clock.test(row.endsAt) && row.endsAt > row.startsAt;
  const windowReady = validDate(row.effectiveFrom) && validDate(row.effectiveTo) && row.effectiveTo >= row.effectiveFrom;
  const revision = typeof row.revision === 'number' && Number.isInteger(row.revision) && row.revision > 0 ? row.revision : null;
  const classLabel = [human(row.className) ? row.className : t.timetableContextUnavailable, human(row.academicYearName) ? row.academicYearName : t.timetableContextUnavailable].join(' · ');
  const subjectName = human(row.subjectName) ? row.subjectName : t.timetableContextUnavailable;
  const teacherName = human(row.teacherName) ? row.teacherName : t.timetableContextUnavailable;
  const weekday = weekdayReady ? new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + Number(row.dayOfWeek)))) : t.timetableContextUnavailable;
  const timeRange = timeReady ? `${row.startsAt}–${row.endsAt}` : t.timetableContextUnavailable;
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const window = windowReady ? `${formatter.format(new Date(String(row.effectiveFrom)))} – ${formatter.format(new Date(String(row.effectiveTo)))}` : t.timetableContextUnavailable;
  const location = human(row.location) ? row.location : t.timetableLocationMissing;
  return { status: namesReady && weekdayReady && timeReady && windowReady && revision !== null ? 'READY' : 'REQUIRES_REVIEW', classLabel, subjectName, teacherName, weekday, timeRange, window, location, revision,
    accessibleLabel: [classLabel, subjectName, teacherName, weekday, timeRange, window, location].join(' · ') };
}
