'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, CuevoIcon, WorkspaceTabs, WorkspacePageHeading } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { parseCurrentSchoolContext, currentSchoolRead, parseSchoolRow, parseSchoolPerson, parseCurrentAttendance, parseSchedule, parseTimetable } from '../model';
import { schoolAr, schoolEn } from '../messages';
import { SchoolSetup } from './setup';
import { SchoolAccess } from './access';
import { SchoolDaily } from './daily';
import { SchoolDayRecords } from './school-day-records';
import { schoolDayAr, schoolDayEn } from '../day-messages';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { SchoolPolicyForm } from './policy';
import { SchoolRecords } from './records';
import { SchoolAudit } from './audit';
import { SchoolAccounts } from './accounts';
import { SchoolAutomationReview,type AutomationControl } from './automation';
import{ApprovedSchoolContext}from'./approved-context';
import { ParentLearningSupport } from './parent-learning-support';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import { attendanceRecovery } from '../daily-review-model';
import { parseParentCalendarEvent, parentCalendarSourceDenied } from '../parent-calendar-model';
import { SchoolSourceContinuation } from './source-continuation';
import { schoolRecordChoices } from '../selection';

type Tab = 'setup' | 'people' | 'daily' | 'policies' | 'audit' | 'approvedContext' | 'automation' | 'parentSupport' | 'accounts' | 'observationPolicy';
export function SchoolPageHeading({ locale, section, caption }: { locale: 'en' | 'ar'; section: Tab; caption?: string }) {
  const t = locale === 'ar' ? schoolAr : schoolEn;
  return <WorkspacePageHeading title={t[section]} caption={caption} />;
}
type SchoolWorkspaceProps = { onAutomationControl?: (control: Exclude<AutomationControl, 'policies' | 'observationPolicy'>) => void; observationPolicyPanel?: ReactNode };
export function SchoolWorkspace({onAutomationControl, observationPolicyPanel}: SchoolWorkspaceProps = {}) {
  const { membership } = useApp();
  return <CurrentSchoolWorkspace key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}`} onAutomationControl={onAutomationControl} observationPolicyPanel={observationPolicyPanel} />;
}
function CurrentSchoolWorkspace({onAutomationControl, observationPolicyPanel}: SchoolWorkspaceProps) {
  const { membership, locale, status, online, apiUrl, accessGeneration, accessToken, commandJournal } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn;
  const admin = membership?.role === 'admin'; const staff = admin || membership?.role === 'coordinator' || membership?.role === 'teacher'; const directory = admin || membership?.role === 'coordinator';
  const observationAdmin = admin && !!observationPolicyPanel && ['school.context', 'learner.state'].every(code => membership?.entitlements.includes(code));
  const permitted = status === 'ready' && online && !!membership && canOpenWorkspace('school', membership.entitlements, membership.role);
  const [tab, setTab] = useState<Tab>(admin ? 'setup' : 'daily'); const [refresh, setRefresh] = useState(0);
  const [selectedClass, setSelectedClass] = useState(()=>attendanceRecovery(commandJournal.get('/v1/school/attendance'))?.input.classId??'');
  const [selectedDay, setSelectedDay] = useState(()=>attendanceRecovery(commandJournal.get('/v1/school/attendance'))?.input.occurredOn??'');
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const attendanceLocked=!!commandJournal.get('/v1/school/attendance');
  useEffect(() => { const current = new Date(); setSelectedDay(value=>value||`${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`); }, []);
  const childContext = useChildContext(refresh);
  const childCurrent = childContext.query.loaded && !childContext.query.loading && !childContext.query.error && !childContext.query.moreError && !childContext.query.nextCursor;
  const dailyScope = childContext.parent ? childCurrent && childContext.child ? `&learnerId=${encodeURIComponent(childContext.child.id)}` : null : selectedClass ? `&classId=${encodeURIComponent(selectedClass)}` : membership?.role === 'student' ? `&learnerId=${encodeURIComponent(membership.userId)}` : '';
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken ?? ''}:${online}:${accessGeneration}:${refresh}`;
  const parseContext = useCallback((value: unknown) => ({ scope, value: parseCurrentSchoolContext(value, membership?.schoolId ?? '') }), [scope, membership?.schoolId]);
  const contextRead = useApiQuery(permitted ? '/v1/school/context' : null, parseContext, refresh);
  const context = { ...contextRead, data: currentSchoolRead(contextRead.data, scope) };
  const dailyLearnerId = childContext.parent ? childCurrent ? childContext.child?.id : undefined : membership?.role === 'student' ? membership.userId : undefined;
  const parseAttendance = useCallback((value: unknown) => { const row=parseCurrentAttendance(value, dailyLearnerId);if(selectedClass&&row.classId!==selectedClass)throw new Error('Current attendance class mismatch');return row; }, [dailyLearnerId, selectedClass]);
  const parseDailyTimetable=useCallback((value:unknown)=>{const row=parseTimetable(value);if(selectedClass&&row.classId!==selectedClass)throw new Error('Current timetable class mismatch');return row;},[selectedClass]);
  const readDaily = permitted && tab === 'daily' && dailyScope !== null;
  const structures = staff && permitted && ['setup', 'people', 'daily'].includes(tab);
  const years = usePaginatedLearningQuery(structures ? '/v1/school/years?limit=100' : null, parseSchoolRow, refresh);
  const terms = usePaginatedLearningQuery(structures && (tab !== 'daily' || admin) ? '/v1/school/terms?limit=100' : null, parseSchoolRow, refresh);
  const groups = usePaginatedLearningQuery(structures ? '/v1/school/year-groups?limit=100' : null, parseSchoolRow, refresh);
  const classes = usePaginatedLearningQuery(structures ? '/v1/school/classes?limit=100' : null, parseSchoolRow, refresh);
  const subjects = usePaginatedLearningQuery(structures ? '/v1/school/subjects?limit=100' : null, parseSchoolRow, refresh);
  const people = usePaginatedLearningQuery(directory && permitted && (tab === 'people' || tab === 'daily' && admin) ? '/v1/school/people?limit=100' : null, parseSchoolPerson, refresh);
  const enrollments = usePaginatedLearningQuery(directory && permitted && tab === 'people' ? '/v1/school/enrollments?limit=100' : null, parseSchoolRow, refresh);
  const assignments = usePaginatedLearningQuery(directory && permitted && tab === 'people' ? '/v1/school/teacher-assignments?limit=100' : null, parseSchoolRow, refresh);
  const guardians = usePaginatedLearningQuery(directory && tab === 'people' ? '/v1/school/guardian-relationships?limit=100' : null, parseSchoolRow, refresh);
  const entitlements = usePaginatedLearningQuery(directory && permitted && tab === 'policies' ? '/v1/school/entitlements?limit=100' : null, parseSchoolRow, refresh);
  const attendance = usePaginatedLearningQuery(readDaily ? `/v1/school/attendance?limit=100${dailyScope}` : null, parseAttendance, refresh);
  const timetable = usePaginatedLearningQuery(readDaily ? `/v1/school/timetable?limit=100${dailyScope}` : null, parseDailyTimetable, refresh);
  const calendar = usePaginatedLearningQuery(readDaily ? `/v1/school/calendar?limit=100${staff?'':dailyScope}` : null, childContext.parent ? parseParentCalendarEvent : parseSchedule, refresh);
  const periods = usePaginatedLearningQuery(structures && tab === 'daily' ? '/v1/school/report-periods?limit=100' : null, parseSchoolRow, refresh);
  function reload() { setRefresh(value => value + 1); }
  if (!permitted) return null;
  if (context.loading || !context.data && !context.error) return <><SchoolPageHeading locale={locale} section={tab}/><WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/></>;
  if (context.error) return <><SchoolPageHeading locale={locale} section={tab}/><LearningError error={context.error} /><Button type="button" variant="secondary" onClick={reload}>{locale === 'ar' ? 'المحاولة مجددًا' : 'Try again'}</Button></>;
  if (!context.data) return <SchoolPageHeading locale={locale} section={tab}/>;
  const tabs: Tab[] = [...(staff ? ['setup' as const,'approvedContext'as const] : []), ...(directory ? ['people' as const, 'policies' as const, ...(admin ? ['accounts' as const,'audit' as const,'automation'as const,...(observationAdmin ? ['observationPolicy' as const] : [])] : [])] : []), ...(childContext.parent ? ['parentSupport' as const] : []), 'daily'];
  if (!tabs.includes(tab)) { setTab(tabs[0]); return <SchoolPageHeading locale={locale} section={tabs[0]}/>; }
  const labelledClasses = classes.data.map(row => ({ ...row, yearGroupName: row.yearGroupName ?? groups.data.find(value => value.id === row.yearGroupId)?.name ?? null, academicYearName: row.academicYearName ?? years.data.find(value => value.id === row.academicYearId)?.name ?? null }));
  const completeChoices = [classes, subjects, ...(tab === 'setup' ? [years, groups] : [])].every(query => query.loaded && !query.loading && !query.nextCursor && !query.error && !query.moreError);
  const relationshipsComplete = [people, enrollments, assignments, guardians].every(query => query.loaded && !query.loading && !query.nextCursor && !query.error && !query.moreError);
  const activeQueries = tab==='approvedContext'||tab==='automation'||tab==='parentSupport'||tab==='accounts'||tab==='observationPolicy'?[]:tab === 'setup' ? [years, terms, groups, classes, subjects] : tab === 'people' ? [people, enrollments, assignments, guardians, classes, subjects] : tab === 'daily' ? [attendance, timetable, calendar, ...(staff ? [periods, classes, subjects, years, groups] : []), ...(admin ? [people, terms] : [])] : [entitlements];
  const activeError = activeQueries.find(query => query.error || query.moreError && (tab !== 'people' || ['denied', 'unauthorized'].includes(query.moreError.kind)));
  const activeFailure = activeError?.error ?? activeError?.moreError;
  const activeLoading = activeQueries.some(query => query.loading);
  const dailyClassControl=tab==='daily'&&staff?<div className="field"><label htmlFor="daily-class-filter">{t.dailyClass}</label><select id="daily-class-filter" value={selectedClass} disabled={attendanceLocked} onChange={event => {if(!attendanceLocked)setSelectedClass(event.target.value);}}><option value="">{t.allCurrentClasses}</option>{schoolRecordChoices(labelledClasses, 'classes', locale).map(choice => <option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select><div className="school-daily-choice-continuation">{[{query:classes,label:t.classes},{query:years,label:t.years},{query:groups,label:t.yearGroups}].map(({query,label})=><div key={label}>{query.error?<LearningError error={query.error}/>:query.loading?<WorkspaceState kind="loading" icon="refresh" description={<>{label} · {t.loading}</>} role="status"/>:null}{query.nextCursor||query.moreError||query.loadingMore?<><WorkspaceState kind="review" icon="school" description={<>{label} · {t.dailyPartial}</>}/><LoadMore query={query} label={label}/></>:null}</div>)}</div></div>:null;
  return <div className={`school-workspace ${staff ? 'school-workspace--staff' : 'school-workspace--learner'} ${childContext.parent?'school-workspace--parent':''}`}><SchoolPageHeading locale={locale} section={tab} caption={childContext.parent ? childContext.child?.displayName : tab === 'daily' && selectedClass ? schoolRecordChoices(labelledClasses, 'classes', locale).find(choice => choice.value === selectedClass && !choice.requiresReview)?.label : undefined}/><ChildSelector context={childContext} /><WorkspaceTabs label={t.school} selected={tab} items={tabs.map(value=>({id:value,label:t[value],icon:({setup:'settings',people:'people',daily:'calendar',policies:'shield',audit:'shield',approvedContext:'learning',automation:'progress',parentSupport:'parent',accounts:'person',observationPolicy:'progress'}as const)[value]}))} onChange={value=>setTab(value as Tab)} actions={<Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><CuevoIcon name="refresh" /><span className="school-workspace-refresh-label">{t.refresh}</span></Button>}/>{!completeChoices && staff && ['setup', 'people'].includes(tab) ? <WorkspaceState kind="review" icon="school" description={locale === 'ar' ? 'حمّل خيارات السجلات الحالية وتحقق من سياقها قبل إجراء تغييرات.' : 'Load current record choices and verify their context before making changes.'}/> : null}{tab==='observationPolicy' ? observationAdmin ? observationPolicyPanel : null : tab==='accounts' ? <SchoolAccounts /> : tab==='parentSupport'&&childContext.parent?childCurrent&&childContext.child?<ParentLearningSupport pageHeading key={childContext.child.id} learnerId={childContext.child.id} learnerName={childContext.child.displayName} refresh={refresh}/>:<WorkspaceState kind="unknown" icon="person" description={t.chooseParentSupportChild}/>:tab==='automation'?<SchoolAutomationReview pageHeading onControl={control=>{if(control==='policies')setTab('policies');else if(control==='observationPolicy'){if(observationAdmin)setTab('observationPolicy');}else onAutomationControl?.(control);}}/>:tab==='approvedContext'?<ApprovedSchoolContext pageHeading key={refresh}/>:tab === 'audit' ? <SchoolAudit pageHeading /> : activeFailure && !(staff&&tab==='daily') && !(childContext.parent&&tab==='daily') ? <LearningError error={activeFailure} /> : activeLoading && !(staff&&tab==='daily') && !(childContext.parent&&tab==='daily') ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : tab === 'setup' ? <SchoolSetup context={context.data} years={years.data} terms={terms.data} groups={groups.data} classes={labelledClasses} subjects={subjects.data} canManage={admin&&completeChoices} onChanged={reload} /> : tab === 'people' ? <SchoolAccess directorySources={{person:people,enrollment:enrollments,assignment:assignments,guardian:guardians}} relationshipsComplete={relationshipsComplete} people={people.data} enrollments={enrollments.data} assignments={assignments.data} guardians={guardians.data} classes={labelledClasses} subjects={subjects.data} canManage={admin&&completeChoices} onChanged={reload} /> : tab === 'policies' ? <><SchoolPolicyForm pageHeading key={context.data.policy.version} context={context.data} canManage={admin} onChanged={reload} /><SchoolRecords title={t.entitlements} rows={entitlements.data} columns={[{ key: 'code', label: t.name }, { key: 'enabled', label: t.status }]} /></> : !staff ? childContext.parent && (!childCurrent || !childContext.child) ? <WorkspaceState kind="unknown" icon="person" description={locale === 'ar' ? schoolDayAr.chooseChild : schoolDayEn.chooseChild}/> : <>{!childContext.parent?<header className="school-day-intro"><CuevoIcon name="school" variant="filled" size={36} /><div><h2>{locale === 'ar'?schoolDayAr.title:schoolDayEn.title}</h2><p>{locale === 'ar'?schoolDayAr.body:schoolDayEn.body}</p></div></header>:null}<SchoolDayRecords key={`${membership?.userId}:${childContext.child?.id ?? ''}`} attendance={attendance.data} timetable={timetable.data} calendar={calendar.data} policy={context.data.policy} day={selectedDay} onDayChange={setSelectedDay} partial={[attendance, timetable, calendar].some(query => !!query.nextCursor)} parentChildId={childContext.parent?childContext.child?.id:undefined} parentSources={childContext.parent?{calendar,timetable,attendance}:undefined} calendarContinuation={childContext.parent?<LoadMore query={calendar} label={locale==='ar'?'سجلات التقويم المنشورة':'Shared calendar records'}/>:undefined} /></> : <SchoolDaily pageHeading classControl={dailyClassControl} attendance={attendance.data} timetable={timetable.data} calendar={calendar.data} periods={periods.data} terms={terms.data} classes={labelledClasses} subjects={subjects.data} people={people.data} canAdmin={admin} canAttend={admin || membership?.role === 'teacher'} onChanged={reload} selectedClass={selectedClass} day={selectedDay} onDayChange={setSelectedDay} onClassChange={setSelectedClass} sources={{attendance,timetable,calendar,periods,classes,subjects,terms,people}} />}{(tab === 'setup' ? [{ query: years, label: t.years }, { query: terms, label: t.terms }, { query: groups, label: t.yearGroups }, { query: classes, label: t.classes }, { query: subjects, label: t.subjects }] : tab === 'people' ? [{ query: classes, label: t.classes }, { query: subjects, label: t.subjects }] : tab === 'daily' && staff ? [] : tab === 'daily' ? [{ query: attendance, label: t.attendance }, { query: timetable, label: t.timetable }, ...(!childContext.parent?[{ query: calendar, label: t.calendar }]:[]), { query: periods, label: t.periods }, { query: classes, label: t.classes }, { query: subjects, label: t.subjects }, { query: terms, label: t.terms }, { query: people, label: t.people }] : [{ query: entitlements, label: t.entitlements }]).map(({ query, label }, index) => <SchoolSourceContinuation key={index} query={query} label={label} allowPage={!childContext.parent||!parentCalendarSourceDenied(query)}/>)}</div>;
}
