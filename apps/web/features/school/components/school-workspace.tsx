'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { parseSchoolContext, parseSchoolRow, parseSchoolPerson, parseAttendance, parseSchedule, parseTimetable } from '../model';
import { schoolAr, schoolEn } from '../messages';
import { SchoolSetup } from './setup';
import { SchoolAccess } from './access';
import { SchoolDaily } from './daily';
import { SchoolPolicyForm } from './policy';
import { SchoolRecords } from './records';

type Tab = 'setup' | 'people' | 'daily' | 'policies';
export function SchoolWorkspace() {
  const { membership, locale } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn;
  const admin = membership?.role === 'admin'; const staff = admin || membership?.role === 'coordinator' || membership?.role === 'teacher'; const directory = admin || membership?.role === 'coordinator';
  const [tab, setTab] = useState<Tab>(admin ? 'setup' : 'daily'); const [refresh, setRefresh] = useState(0);
  const context = useApiQuery('/v1/school/context', parseSchoolContext, refresh);
  const years = usePaginatedLearningQuery(staff ? '/v1/school/years?limit=100' : null, parseSchoolRow, refresh);
  const terms = usePaginatedLearningQuery(staff ? '/v1/school/terms?limit=100' : null, parseSchoolRow, refresh);
  const groups = usePaginatedLearningQuery(staff ? '/v1/school/year-groups?limit=100' : null, parseSchoolRow, refresh);
  const classes = usePaginatedLearningQuery(staff ? '/v1/school/classes?limit=100' : null, parseSchoolRow, refresh);
  const subjects = usePaginatedLearningQuery(staff ? '/v1/school/subjects?limit=100' : null, parseSchoolRow, refresh);
  const people = usePaginatedLearningQuery(directory ? '/v1/school/people?limit=100' : null, parseSchoolPerson, refresh);
  const enrollments = usePaginatedLearningQuery(directory && tab === 'people' ? '/v1/school/enrollments?limit=100' : null, parseSchoolRow, refresh);
  const assignments = usePaginatedLearningQuery(directory && tab === 'people' ? '/v1/school/teacher-assignments?limit=100' : null, parseSchoolRow, refresh);
  const guardians = usePaginatedLearningQuery(directory && tab === 'people' ? '/v1/school/guardian-relationships?limit=100' : null, parseSchoolRow, refresh);
  const entitlements = usePaginatedLearningQuery(directory && tab === 'policies' ? '/v1/school/entitlements?limit=100' : null, parseSchoolRow, refresh);
  const attendance = usePaginatedLearningQuery('/v1/school/attendance?limit=100', parseAttendance, refresh);
  const timetable = usePaginatedLearningQuery('/v1/school/timetable?limit=100', parseTimetable, refresh);
  const calendar = usePaginatedLearningQuery('/v1/school/calendar?limit=100', parseSchedule, refresh);
  const periods = usePaginatedLearningQuery(staff ? '/v1/school/report-periods?limit=100' : null, parseSchoolRow, refresh);
  function reload() { setRefresh(value => value + 1); }
  if (context.loading) return <p role="status">{t.loading}</p>;
  if (context.error) return <LearningError error={context.error} />;
  if (!context.data) return null;
  const tabs: Tab[] = [...(staff ? ['setup' as const] : []), ...(directory ? ['people' as const, 'policies' as const] : []), 'daily'];
  const activeQueries = tab === 'setup' ? [years, terms, groups, classes, subjects] : tab === 'people' ? [people, enrollments, assignments, guardians, classes, subjects] : tab === 'daily' ? [attendance, timetable, calendar, ...(staff ? [periods, classes, subjects] : []), ...(admin ? [people, terms] : [])] : [entitlements];
  const activeError = activeQueries.find(query => query.error)?.error;
  const activeLoading = activeQueries.some(query => query.loading);
  return <div className="school-workspace"><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.school}>{tabs.map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{t[value]}</button>)}</div><Button type="button" variant="quiet" onClick={reload}>{t.refresh}</Button></div>{membership?.role === 'parent' ? <p className="notice">{t.parentNote}</p> : null}{activeLoading ? <p role="status">{t.loading}</p> : activeError ? <LearningError error={activeError} /> : tab === 'setup' ? <SchoolSetup context={context.data} years={years.data} terms={terms.data} groups={groups.data} classes={classes.data} subjects={subjects.data} canManage={admin} onChanged={reload} /> : tab === 'people' ? <SchoolAccess people={people.data} enrollments={enrollments.data} assignments={assignments.data} guardians={guardians.data} classes={classes.data} subjects={subjects.data} canManage={admin} onChanged={reload} /> : tab === 'policies' ? <><SchoolPolicyForm context={context.data} canManage={admin} onChanged={reload} /><SchoolRecords title={t.entitlements} rows={entitlements.data} columns={[{ key: 'code', label: t.name }, { key: 'enabled', label: t.status }]} /></> : <SchoolDaily attendance={attendance.data} timetable={timetable.data} calendar={calendar.data} periods={periods.data} terms={terms.data} classes={classes.data} subjects={subjects.data} people={people.data} canAdmin={admin} canAttend={admin || membership?.role === 'teacher'} onChanged={reload} />}{(tab === 'setup' ? [years, terms, groups, classes, subjects] : tab === 'people' ? [people, enrollments, assignments, guardians] : tab === 'daily' ? [attendance, timetable, calendar, periods] : [entitlements]).map((query, index) => <div key={index}>{query.error ? <LearningError error={query.error} /> : null}{query.nextCursor ? <LoadMore query={query} /> : null}</div>)}</div>;
}
