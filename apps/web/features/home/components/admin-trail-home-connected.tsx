'use client';
import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import type { SchoolRow } from '../../school/model';
import { adminHomeReadScope, currentAdminHomeRead, parseAdminHomeContext, parseAdminHomeAutomation, adminAutomationState, parseAdminHomePerson, parseAdminHomeAudit, parseAdminHomeRelationship, adminHomePersonName } from '../admin-home-binding-model';
import { adminHomeAr, adminHomeEn } from '../admin-home-binding-messages';
import type { HomeDestination, HomeTarget } from '../model';
import type { AdminTrailContext } from '../admin-trail-model';
import { AdminTrailHomeView } from './admin-trail-home';

export function AdminTrailHome({ onNavigate, headingRef }: { onNavigate: (destination: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { membership } = useApp();
  return <CurrentAdminHome key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}`} onNavigate={onNavigate} headingRef={headingRef} />;
}
function CurrentAdminHome({ onNavigate, headingRef }: { onNavigate: (destination: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const app = useApp(); const { membership, locale, online, status, accessGeneration } = app;
  const t = locale === 'ar' ? adminHomeAr : adminHomeEn; const [refresh, setRefresh] = useState(0); const [now, setNow] = useState<number | null>(null);
  const mountedHeading = useRef<HTMLHeadingElement | null>(null);
  const restoreHeadingFocus = useRef(false);
  const currentHeadingRef = useCallback((element: HTMLHeadingElement | null) => {
    if (!element) restoreHeadingFocus.current = !!mountedHeading.current && document.activeElement === mountedHeading.current;
    mountedHeading.current = element;
    if (typeof headingRef === 'function') headingRef(element);
    else if (headingRef) headingRef.current = element;
    if (element && restoreHeadingFocus.current) {
      restoreHeadingFocus.current = false;
      if (document.activeElement === document.body) element.focus({ preventScroll: true });
    }
  }, [headingRef]);
  useEffect(() => { setNow(Date.now()); }, [refresh, accessGeneration]);
  const can = (target: HomeTarget) => membership?.role === 'admin' && online && status === 'ready' && canOpenWorkspace(target, membership.entitlements, membership.role);
  const contextPath = '/v1/school/context'; const automationPath = '/v1/school/automation';
  const sourceScope = adminHomeReadScope(app, contextPath, refresh); const automationScope = adminHomeReadScope(app, automationPath, refresh);
  const parseContext = useCallback((value: unknown) => ({ scope: sourceScope, value: parseAdminHomeContext(value, membership?.schoolId ?? '') }), [sourceScope, membership?.schoolId]);
  const parseAutomation = useCallback((value: unknown) => ({ scope: automationScope, value: parseAdminHomeAutomation(value) }), [automationScope]);
  const source = useApiQuery(sourceScope ? contextPath : null, parseContext, refresh); const automation = useApiQuery(automationScope ? automationPath : null, parseAutomation, refresh);
  const context = currentAdminHomeRead(source.data, sourceScope); const execution = currentAdminHomeRead(automation.data, automationScope);
  const personParser = useCallback((value: unknown) => ({ ...parseAdminHomePerson(value), sourceScope }), [sourceScope]);
  const enrollmentParser = useCallback((value: unknown) => ({ ...parseAdminHomeRelationship(value, 'enrollment'), sourceScope } as SchoolRow & { sourceScope: string | null }), [sourceScope]);
  const assignmentParser = useCallback((value: unknown) => ({ ...parseAdminHomeRelationship(value, 'assignment'), sourceScope } as SchoolRow & { sourceScope: string | null }), [sourceScope]);
  const guardianParser = useCallback((value: unknown) => ({ ...parseAdminHomeRelationship(value, 'guardian'), sourceScope } as SchoolRow & { sourceScope: string | null }), [sourceScope]);
  const auditParser = useCallback((value: unknown) => ({ ...parseAdminHomeAudit(value), sourceScope }), [sourceScope]);
  const people = usePaginatedLearningQuery(sourceScope ? '/v1/school/people?limit=25' : null, personParser, refresh);
  const enrollments = usePaginatedLearningQuery(sourceScope ? '/v1/school/enrollments?limit=25' : null, enrollmentParser, refresh);
  const assignments = usePaginatedLearningQuery(sourceScope ? '/v1/school/teacher-assignments?limit=25' : null, assignmentParser, refresh);
  const guardians = usePaginatedLearningQuery(sourceScope ? '/v1/school/guardian-relationships?limit=25' : null, guardianParser, refresh);
  const audit = usePaginatedLearningQuery(sourceScope ? '/v1/school/audit?limit=25' : null, auditParser, refresh);
  const currentRows = <T extends { sourceScope: string | null },>(query: { data: T[]; error: unknown; moreError: unknown; loading: boolean }) => query.error || query.moreError || query.loading || !sourceScope ? [] : query.data.filter(row => row.sourceScope === sourceScope);
  const personRows = currentRows(people);
  const personName = (id: unknown) => adminHomePersonName(personRows, id, t.personUnknown);
  const auditRows = currentRows(audit);
  const queries = [source, automation, people, enrollments, assignments, guardians, audit];
  const denied = queries.some(query => query.error?.kind === 'denied' || query.error?.kind === 'unauthorized' || 'moreError' in query && (query.moreError?.kind === 'denied' || query.moreError?.kind === 'unauthorized'));
  const failed = queries.some(query => query.error || 'moreError' in query && query.moreError); const partial = [people, enrollments, assignments, guardians, audit].some(query => query.nextCursor);
  const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null;
  const action = (label: string, destination: HomeDestination) => ({ label, onClick: () => onNavigate(destination) });
  const schoolAction = can('school') ? action(t.configure, 'school') : undefined;
  const areas = [{ target: 'school', title: t.school, description: t.schoolBody, icon: 'school' }, { target: 'curriculum', title: t.programmes, description: t.programmesBody, icon: 'curriculum' }, { target: 'improvement', title: t.support, description: t.supportBody, icon: 'shield' }, { target: 'development', title: t.development, description: t.developmentBody, icon: 'development' }, { target: 'community', title: t.community, description: t.communityBody, icon: 'community' }] as const;
  const policies = context ? ([['parentAttendanceVisible',t.parentAttendance],['parentUpcomingVisible',t.parentUpcoming],['recognitionEnabled',t.recognition],['leaderboardEnabled',t.board],['analyticsEnabled',t.analytics],['studentMessagingEnabled',t.messaging]] as const).map(([key,title]) => ({ key, title, description: context.policy.version === 0 ? t.policyUnconfigured : t.policyBody, state: context.policy.version === 0 ? 'unknown' as const : context.policy[key] ? 'reviewed' as const : 'disabled' as const, action: schoolAction })) : [];
  const executionState = adminAutomationState(execution);
  const view: AdminTrailContext = {
    availability: !online ? 'offline' : denied || status !== 'ready' || membership?.role !== 'admin' ? 'denied' : sourceScope && source.loading && !context ? 'loading' : failed || partial ? 'partial' : 'ready',
    schoolName: context?.school.name ?? membership?.school.name ?? null, environmentLabel: null, dateLabel: now === null ? null : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(now)), notice: failed || partial ? t.partial : undefined, recovery: { label: t.refresh, onClick: () => setRefresh(value => value + 1) }, primaryAction: schoolAction,
    facts: context ? [{ key: 'country', label: t.country, value: context.school.countryCode, icon: 'school' }, { key: 'languages', label: t.languages, value: context.school.languages.map(value => value === 'ar' ? 'العربية' : 'English').join(' · '), icon: 'language' }, { key: 'policy', label: t.policyVersion, value: context.policy.version > 0 ? new Intl.NumberFormat(locale).format(context.policy.version) : null, icon: 'shield' }] : [],
    areas: areas.filter(area => can(area.target)).map(area => ({ key: area.target, title: area.title, description: area.description, icon: area.icon, action: action(area.title, area.target) })),
    people: { status: people.error || people.moreError || !sourceScope ? 'unavailable' : people.loading || !people.loaded || people.nextCursor || [enrollments,assignments,guardians].some(q=>q.loading||!q.loaded||q.nextCursor) ? 'partial' : 'ready', records: personRows.slice(0, 4).map(person => ({ key: person.id, name: personName(person.id), context: `${t.roles[person.role]} · ${t.statuses[person.status]}`, action: schoolAction })), action: schoolAction },
    policies, policyAction: schoolAction,
    governance: context ? { mode: context.intelligence.fixtureSchoolApproved && !context.intelligence.liveSchoolApproved ? 'fixture-only' : context.intelligence.liveSchoolApproved ? 'live-review-required' : 'unavailable', title: t.governance, description: t.governanceBody, action: can('improvement') ? action(t.support, 'improvement') : schoolAction } : null,
    execution: execution ? { state: executionState, title: t.execution, description: t.executionBody, receiptLabel: `${t.received}: ${new Intl.NumberFormat(locale).format(execution.execution.receiptCount)}`, action: schoolAction } : null,
    audit: { status: audit.error || audit.moreError || !sourceScope ? 'unavailable' : audit.loading || !audit.loaded || audit.nextCursor ? 'partial' : 'ready', records: auditRows.slice(0, 3).map(record => ({ key: record.id, actorName: record.actorName, targetName: record.objectName, description: t.audit, dateLabel: date(record.occurredAt), outcome: record.outcome })), action: schoolAction },
  };
  return <div className="admin-home-connected">
    <AdminTrailHomeView context={view} locale={locale} headingRef={currentHeadingRef} />
    <div className="home-overview-controls"><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button>{queries.map((query, index) => query.error ? <LearningError key={index} error={query.error} /> : null)}{!denied && sourceScope ? [{query: people,label:t.people},{query:enrollments,label:t.learner},{query:assignments,label:t.teacher},{query:guardians,label:t.guardian},{query:audit,label:t.audit}].map(({query,label}) => query.nextCursor || query.moreError ? <LoadMore key={label} query={query} label={label} /> : null) : null}</div>
  </div>;
}
