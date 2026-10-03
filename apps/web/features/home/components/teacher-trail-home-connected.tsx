'use client';

import { useCallback, useEffect, useState, type Ref } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { parseMarkingItem } from '../../academic/model';
import { parseIntervention, parseRecommendation } from '../../improvement/model';
import { parsePortfolioItem } from '../../portfolio/model';
import { parseSchedule } from '../../school/model';
import { parseAnnouncement } from '../../community/model';
import type { HomeDestination, HomeTarget } from '../model';
import { currentTeacherHomeRows, teacherHomeNextWork, teacherHomeWork } from '../teacher-home-binding-model';
import { teacherHomeAr, teacherHomeEn } from '../teacher-home-binding-messages';
import type { TeacherTrailContext } from '../teacher-trail-model';
import { TeacherTrailHomeView } from './teacher-trail-home';

export function TeacherTrailHome({ onNavigate, headingRef }: { onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { membership } = useApp();
  return <CurrentTeacherHome key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}`} onNavigate={onNavigate} headingRef={headingRef} />;
}

function CurrentTeacherHome({ onNavigate, headingRef }: { onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { membership, locale, online, status, accessGeneration, accessToken, apiUrl } = useApp();
  const t = locale === 'ar' ? teacherHomeAr : teacherHomeEn;
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, [refresh, accessGeneration]);
  const can = (target: HomeTarget) => !!membership && membership.role === 'teacher' && status === 'ready' && online && canOpenWorkspace(target, membership.entitlements, membership.role);
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${status}:${accessGeneration}:${refresh}`;
  const markingParser = useCallback((value: unknown) => ({ ...parseMarkingItem(value), sourceScope: scope }), [scope]);
  const practiceParser = useCallback((value: unknown) => ({ ...parseIntervention(value), sourceScope: scope }), [scope]);
  const portfolioParser = useCallback((value: unknown) => ({ ...parsePortfolioItem(value), sourceScope: scope }), [scope]);
  const proposalParser = useCallback((value: unknown) => ({ ...parseRecommendation(value), sourceScope: scope }), [scope]);
  const calendarParser = useCallback((value: unknown) => ({ ...parseSchedule(value), title: parseSchedule(value).title, sourceScope: scope }), [scope]);
  const announcementParser = useCallback((value: unknown) => ({ ...parseAnnouncement(value), sourceScope: scope }), [scope]);
  const marking = usePaginatedLearningQuery(can('academic') ? '/v1/marking?limit=25' : null, markingParser, refresh);
  const practices = usePaginatedLearningQuery(can('improvement') ? '/v1/interventions?limit=25' : null, practiceParser, refresh);
  const portfolio = usePaginatedLearningQuery(can('portfolio') ? '/v1/portfolio/items?limit=25' : null, portfolioParser, refresh);
  const proposals = usePaginatedLearningQuery(can('improvement') ? '/v1/recommendations?limit=25' : null, proposalParser, refresh);
  const calendar = usePaginatedLearningQuery(can('school') ? '/v1/school/calendar?limit=25' : null, calendarParser, refresh);
  const announcements = usePaginatedLearningQuery(can('community') ? '/v1/community/announcements?limit=25' : null, announcementParser, refresh);
  const workPages = [marking, practices, portfolio];
  const noWorkAccess = !can('academic') && !can('improvement') && !can('portfolio');
  const failed = workPages.some(query => query.error || query.moreError);
  const pending = workPages.some(query => query.loading);
  const partial = workPages.some(query => query.nextCursor);
  const work = teacherHomeWork(marking.error ? [] : currentTeacherHomeRows(marking.data, scope), practices.error ? [] : currentTeacherHomeRows(practices.data, scope), portfolio.error ? [] : currentTeacherHomeRows(portfolio.data, scope));
  const proposal = proposals.error || proposals.loading ? null : currentTeacherHomeRows(proposals.data, scope).find(row => row.status === 'AWAITING_HUMAN') ?? null;
  const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null;
  const action = (label: string, target: HomeDestination) => ({ label, onClick: () => onNavigate(target) });
  const workActionLabel = (kind: typeof work[number]['kind']) => kind === 'marking' ? t.work : kind === 'reassessment' ? t.followUp : kind === 'support' ? t.reviewPractice : t.portfolio;
  const nextWork = teacherHomeNextWork(work);
  const sourceNextActions = nextWork.map(row => ({ key: row.key, title: row.learnerName ? `${row.title} · ${row.learnerName}` : row.title, icon: row.kind === 'portfolio' ? 'portfolio' as const : row.kind === 'marking' ? 'assessment' as const : 'help' as const, action: action(workActionLabel(row.kind), row.destination) }));
  if (proposal) sourceNextActions.push({ key: `proposal:${proposal.id}`, title: proposal.activityTitle, icon: 'help', action: action(t.support, 'improvement') });
  const areas = [
    { target: 'academic', title: t.marking, description: t.markingBody, icon: 'assessment' },
    { target: 'learning', title: t.learning, description: t.learningBody, icon: 'learning' },
    { target: 'progress', title: t.evidence, description: t.evidenceBody, icon: 'progress' },
    { target: 'improvement', title: t.support, description: t.supportBody, icon: 'help' },
    { target: 'portfolio', title: t.portfolio, description: t.portfolioBody, icon: 'portfolio' },
    { target: 'school', title: t.school, description: t.schoolBody, icon: 'school' },
    { target: 'community', title: t.community, description: t.communityBody, icon: 'community' },
  ] as const;
  const context: TeacherTrailContext = {
    availability: !online ? 'offline' : status !== 'ready' || membership?.role !== 'teacher' ? 'denied' : failed || partial ? 'partial' : pending ? 'loading' : 'ready',
    dateLabel: now === null ? null : new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date(now)),
    notice: failed ? t.noSource : partial ? t.currentPages : undefined,
    recovery: { label: t.reload, onClick: () => setRefresh(value => value + 1) },
    attention: {
      status: failed || noWorkAccess ? 'unavailable' : pending ? 'loading' : partial ? 'partial' : 'ready',
      items: work.map(row => ({
        key: row.key, kind: row.kind, title: row.title, learnerName: row.learnerName, classLabel: row.classLabel,
        state: row.state, statusLabel: row.kind === 'marking' ? row.state === 'in-progress' ? (locale === 'ar' ? 'مراجعة محفوظة' : 'Review saved') : t.work : row.kind === 'reassessment' ? t.followUp : row.kind === 'support' ? t.waitingPractice : t.portfolio,
        nativeKind: row.nativeKind, dateLabel: date(row.date),
        action: { ...action(workActionLabel(row.kind), row.destination), accessibleLabel: `${workActionLabel(row.kind)}: ${row.title}${row.learnerName ? ` · ${row.learnerName}` : ''}` },
        ...(row.currentText ? { currentSubmission: { text: row.currentText, dateLabel: null, action: action(`${t.work}: ${row.title}`, row.destination) } } : {}),
      })),
      ...(can('academic') ? { viewAll: action(t.allWork, 'academic') } : {}),
    },
    workspaces: areas.filter(area => can(area.target)).map(area => ({ key: area.target, title: area.title, description: area.description, icon: area.icon, action: action(area.title, area.target) })),
    insight: proposal ? {
      mode: proposal.generationMode === 'FIXTURE' ? 'fixture' : proposal.generationMode === 'LIVE' ? 'live' : 'human',
      approval: 'awaiting-review', sourceTitle: proposal.observation, sourceContext: proposal.activityTitle,
      interpretation: proposal.interpretation, limitation: proposal.uncertainty,
      sourceAction: action(t.support, 'improvement'), reviewAction: action(t.support, 'improvement'),
    } : null,
    insightStatus: proposals.error ? 'unavailable' : proposals.loading ? 'loading' : proposals.nextCursor || proposals.moreError ? 'partial' : 'ready',
    nextActions: sourceNextActions.length ? sourceNextActions : areas.filter(area => ['school', 'community'].includes(area.target) && can(area.target)).map(area => ({ key: area.target, title: area.title, icon: area.icon, action: action(area.title, area.target) })),
    calendar: {
      status: calendar.error ? 'unavailable' : calendar.loading ? 'loading' : calendar.nextCursor ? 'partial' : 'ready',
      items: calendar.error || now === null ? [] : currentTeacherHomeRows(calendar.data, scope).filter(row => Date.parse(row.endsAt) >= now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 3).map(row => ({ key: row.id, title: typeof row.title === 'string' && row.title.trim() ? row.title : t.noSource, dateLabel: date(row.startsAt), contextLabel: null, action: action(t.school, 'school') })),
      ...(can('school') ? { action: action(t.school, 'school') } : {}),
    },
    ...(can('community') ? { updates: {
      status: announcements.error ? 'unavailable' as const : announcements.loading ? 'loading' as const : announcements.nextCursor || announcements.moreError ? 'partial' as const : 'ready' as const,
      items: announcements.error || announcements.loading ? [] : currentTeacherHomeRows(announcements.data, scope).map(row => ({ key: row.id, title: row.title, body: row.body, dateLabel: date(row.createdAt) })),
      action: action(t.community, 'community'),
      continuation: <>{announcements.error ? <LearningError error={announcements.error} /> : null}<LoadMore query={announcements} label={t.updates} /></>,
    } } : {}),
  };
  return <div className="teacher-home-connected"><TeacherTrailHomeView context={context} locale={locale} headingRef={headingRef} /><div className="teacher-home-records"><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.reload}</Button>{[{ query: marking, label: t.submissions }, { query: practices, label: t.practiceRecords }, { query: portfolio, label: t.portfolioRecords }, { query: proposals, label: t.proposals }, { query: calendar, label: t.school }].map(({ query, label }) => query.error || query.moreError || query.nextCursor ? <section key={label} aria-label={label}><p>{label}</p>{query.error ? <LearningError error={query.error} /> : null}<LoadMore query={query} label={label} /></section> : null)}</div></div>;
}
