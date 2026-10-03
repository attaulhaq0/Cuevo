'use client';
import { useId, type ReactNode } from 'react';
import { CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { schoolTimetableForDate, type AttendanceRow, type ScheduleRow, type SchoolPolicy, type SchoolRow } from '../model';
import { schoolAr, schoolEn } from '../messages';
import { schoolDayAr, schoolDayEn } from '../day-messages';
import { ParentCalendar } from './parent-calendar';
import { parentCalendarSourceDenied, type ParentCalendarSource } from '../parent-calendar-model';
import { LearningError } from '../../../shared/components/feedback';
type ParentDaySources = { calendar: ParentCalendarSource; timetable: ParentCalendarSource; attendance: ParentCalendarSource };

/** Read-only daily anatomy. Server-authorized records supply every fact. */
export function SchoolDayRecords({ attendance, timetable, calendar, policy, day, onDayChange, partial = false, parentSources, parentChildId, calendarContinuation }: { attendance: AttendanceRow[]; timetable: SchoolRow[]; calendar: ScheduleRow[]; policy: SchoolPolicy; day: string; onDayChange: (day: string) => void; partial?: boolean; parentSources?: ParentDaySources; parentChildId?: string; calendarContinuation?: ReactNode }) {
  const { locale, membership, accessGeneration } = useApp(); const t = locale === 'ar' ? schoolDayAr : schoolDayEn; const school = locale === 'ar' ? schoolAr : schoolEn;
  const id = useId(); const parent = membership?.role === 'parent';
  const timetableDenied=!!parentSources&&parentCalendarSourceDenied(parentSources.timetable),attendanceDenied=!!parentSources&&parentCalendarSourceDenied(parentSources.attendance);
  const sessions = parent&&timetableDenied?[]:schoolTimetableForDate(timetable, day); const records = parent&&attendanceDenied?[]:attendance.filter(row => row.occurredOn === day);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...(value.includes('T') ? { timeStyle: 'short' as const } : { timeZone: 'UTC' }) }).format(new Date(value));
  const label = (row: SchoolRow, key: string) => typeof row[key] === 'string' && String(row[key]).trim() ? String(row[key]) : t.unknown;
  if (parent) return <div className="school-day-records parent-school-dates">
    {policy.parentUpcomingVisible && parentChildId && parentSources ? <ParentCalendar key={`${parentChildId}:${accessGeneration}`} childId={parentChildId} locale={locale} events={calendar} day={day} onDayChange={onDayChange} source={parentSources.calendar} continuation={calendarContinuation} /> : <section className="school-day-panel"><h2>{t.calendar}</h2><p>{policy.parentUpcomingVisible ? t.chooseChild : t.upcomingDisabled}</p></section>}
    <div className="parent-school-day-context">
      <section className="school-day-panel" aria-label={school.timetable}><div className="school-day-heading"><CuevoIcon name="calendar" variant="filled" size={28} /><h2>{t.timetable}</h2></div><p className="school-day-note">{t.timetableNote}</p>
        {!policy.parentUpcomingVisible ? <p>{t.upcomingDisabled}</p> : parentSources?.timetable.loading ? <p role="status">{school.loading}</p> : parentSources?.timetable.error || timetableDenied ? <LearningError error={(parentSources!.timetable.error??parentSources!.timetable.moreError)!} /> : !day ? <p>{t.dayUnknown}</p> : sessions.length ? <ol className="school-day-timeline">{sessions.map(row => <li key={row.id}><div className="school-day-time"><bdi>{String(row.startsAt)}–{String(row.endsAt)}</bdi></div><article><h3><bdi>{label(row, 'subjectName')}</bdi></h3><p><bdi>{label(row, 'className')}</bdi>{row.academicYearName ? <> · <bdi>{String(row.academicYearName)}</bdi></> : null}</p><p>{t.teacher}: <bdi>{label(row, 'teacherName')}</bdi></p><p>{t.location}: <bdi>{label(row, 'location')}</bdi></p><details><summary>{t.dates}</summary><p>{String(row.effectiveFrom)}–{String(row.effectiveTo)}</p></details></article></li>)}</ol> : <p className="school-day-empty">{t.noTimetable}</p>}
        {parentSources?.timetable.nextCursor || parentSources?.timetable.moreError ? <p className="notice">{t.partial}</p> : null}
      </section>
      <section className="school-day-panel" aria-label={school.attendance}><div className="school-day-heading"><CuevoIcon name="check" size={28} /><h2>{t.attendance}</h2></div><p className="school-day-note">{t.note}</p>
        {!policy.parentAttendanceVisible ? <p>{t.attendanceDisabled}</p> : parentSources?.attendance.loading ? <p role="status">{school.loading}</p> : parentSources?.attendance.error || attendanceDenied ? <LearningError error={(parentSources!.attendance.error??parentSources!.attendance.moreError)!} /> : !day ? <p>{t.dayUnknown}</p> : records.length ? <ul className="school-attendance-list">{records.map(row => <li key={row.id}><div><h3><bdi>{label(row, 'className')}</bdi></h3><p><bdi>{label(row, 'learnerName')}</bdi> · <time dateTime={row.occurredOn}>{date(row.occurredOn)}</time></p></div><Status>{school[row.status]}</Status></li>)}</ul> : <p className="school-day-empty">{t.noAttendance}</p>}
        {parentSources?.attendance.nextCursor || parentSources?.attendance.moreError ? <p className="notice">{t.partial}</p> : null}
      </section>
    </div>
  </div>;
  return <div className="school-day-records">
    <div className="school-day-filter"><div className="field"><label htmlFor={`${id}-day`}>{t.date}</label><input id={`${id}-day`} type="date" value={day} onChange={event => onDayChange(event.target.value)} /></div><p>{school.timezone}</p></div>
    {partial ? <p className="notice">{t.partial}</p> : null}
    <div className="school-day-layout">
      <section className="school-day-panel school-day-timetable" aria-label={school.timetable}><div className="school-day-heading"><CuevoIcon name="calendar" variant="filled" size={30} /><div><h2>{t.timetable}</h2>{day ? <p><time dateTime={day}>{date(day)}</time></p> : null}</div></div><p className="school-day-note">{t.timetableNote}</p>
        {parent && !policy.parentUpcomingVisible ? <p>{t.upcomingDisabled}</p> : !day ? <p>{t.dayUnknown}</p> : sessions.length ? <ol className="school-day-timeline">{sessions.map(row => <li key={row.id}><div className="school-day-time"><bdi>{String(row.startsAt)}–{String(row.endsAt)}</bdi></div><article><h3><bdi>{label(row, 'subjectName')}</bdi></h3><p><bdi>{label(row, 'className')}</bdi>{row.academicYearName ? <> · <bdi>{String(row.academicYearName)}</bdi></> : null}</p><p>{t.teacher}: <bdi>{label(row, 'teacherName')}</bdi></p><p>{t.location}: <bdi>{label(row, 'location')}</bdi></p><details><summary>{t.dates}</summary><p><time dateTime={String(row.effectiveFrom)}>{date(String(row.effectiveFrom))}</time>–<time dateTime={String(row.effectiveTo)}>{date(String(row.effectiveTo))}</time></p></details></article></li>)}</ol> : <p className="school-day-empty">{t.noTimetable}</p>}
      </section>
      <div className="school-day-side"><section className="school-day-panel" aria-label={school.calendar}><div className="school-day-heading"><CuevoIcon name="calendar" variant="filled" size={28} /><h2>{t.calendar}</h2></div>
        {parent && !policy.parentUpcomingVisible ? <p>{t.upcomingDisabled}</p> : calendar.length ? <ul className="school-calendar-list">{[...calendar].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(event => <li key={event.id}><article><h3 dir="auto">{label(event, 'title')}</h3><p><time dateTime={event.startsAt}>{date(event.startsAt)}</time>–<time dateTime={event.endsAt}>{date(event.endsAt)}</time></p><p><bdi>{event.classId === null ? t.schoolWide : label(event, 'className')}</bdi></p>{event.description ? <p dir="auto">{String(event.description)}</p> : null}</article></li>)}</ul> : <p className="school-day-empty">{t.noCalendar}</p>}
      </section>
      <section className="school-day-panel" aria-label={school.attendance}><div className="school-day-heading"><CuevoIcon name="check" size={28} /><h2>{t.attendance}</h2></div><p className="school-day-note">{t.note}</p>{parent && !policy.parentAttendanceVisible ? <p>{t.attendanceDisabled}</p> : !day ? <p>{t.dayUnknown}</p> : records.length ? <ul className="school-attendance-list">{records.map(row => <li key={row.id}><div><h3><bdi>{label(row, 'className')}</bdi></h3><p><bdi>{label(row, 'learnerName')}</bdi> · <time dateTime={row.occurredOn}>{date(row.occurredOn)}</time></p></div><Status>{school[row.status]}</Status></li>)}</ul> : <p className="school-day-empty">{t.noAttendance}</p>}</section></div>
    </div>
  </div>;
}
