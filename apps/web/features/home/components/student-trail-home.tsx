'use client';

import { useCallback, useEffect, useId, useState, type Ref } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { trailAssets } from '../../../shared/characters/assets';
import { parseAssessment, parseSubmission } from '../../learning/model';
import { parseReleasedResult } from '../../academic/model';
import { NativeResultView } from '../../academic/ui';
import { parseIntervention } from '../../improvement/model';
import { parseAnnouncement } from '../../community/model';
import { parseSchedule } from '../../school/model';
import { parseAchievement, parseLearnerGoal, parseLedger, parsePeriod, parseSummary } from '../../development/model';
import { homeAr, homeEn } from '../messages';
import { studentHomeAr, studentHomeEn } from '../student-home-messages';
import { scheduledUpcoming, type HomeDestination, type HomeTarget } from '../model';
import { currentNativeFeedbackDisclosure, currentStudentHomeSummary, selectStudentHomeSources, studentRecognition, type NativeFeedbackDisclosure, type StudentHomeItem, type HomeSourcePage } from '../student-home-model';
import type { StudentTrailAction, StudentTrailContext } from '../trail-model';
import { StudentTrailView } from './student-trail';

const actionLabel = (item: StudentHomeItem, t: typeof studentHomeEn) => item.kind === 'practice' ? t.practiceAction : item.kind === 'revision' ? t.reviseAction : item.kind === 'submitted' || item.kind === 'submitted-unresolved' ? t.submittedAction : t.taskAction;
const disabledPage: HomeSourcePage<never> = { data: [], loaded: true, loading: false, error: null, moreError: null, nextCursor: null };

/** Home selects current facts; destination owners retain every command and receipt. */
export function StudentTrailHome({ onNavigate, headingRef }: { onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { membership, online, status } = useApp();
  const preferenceScope = `${membership?.schoolId}:${membership?.userId}:${membership?.role}:${membership?.entitlements.join(',')}:${status}:${online}`;
  return <StudentHomePresentation key={preferenceScope} onNavigate={onNavigate} headingRef={headingRef} />;
}

function StudentHomePresentation({ onNavigate, headingRef }: { onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const [refresh, setRefresh] = useState(0);
  const [periodId, setPeriodId] = useState('');
  const [presentation, setPresentation] = useState<'standard' | 'quiet' | 'hidden'>('standard');
  const [nativeDisclosure, setNativeDisclosure] = useState<NativeFeedbackDisclosure | null>(null);
  const clearPresentation = useCallback(() => { setPeriodId(''); setPresentation('standard'); setNativeDisclosure(null); }, []);
  return <CurrentStudentTrailHome onNavigate={onNavigate} headingRef={headingRef} refresh={refresh} reload={() => setRefresh(value => value + 1)} periodId={periodId} setPeriodId={value => { setPeriodId(value); setNativeDisclosure(null); }} presentation={presentation} setPresentation={setPresentation} clearPresentation={clearPresentation} nativeDisclosure={nativeDisclosure} setNativeDisclosure={setNativeDisclosure} />;
}

function CurrentStudentTrailHome({ onNavigate, headingRef, refresh, reload, periodId, setPeriodId, presentation, setPresentation, clearPresentation, nativeDisclosure, setNativeDisclosure }: {
  onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement>;
  refresh: number; reload: () => void;
  periodId: string; setPeriodId: (value: string) => void; presentation: 'standard' | 'quiet' | 'hidden'; setPresentation: (update: (value: 'standard' | 'quiet' | 'hidden') => 'standard' | 'quiet' | 'hidden') => void;
  clearPresentation: () => void;
  nativeDisclosure: NativeFeedbackDisclosure | null; setNativeDisclosure: (value: NativeFeedbackDisclosure | null) => void;
}) {
  const { membership, locale, online, status, accessGeneration } = useApp();
  const t = locale === 'ar' ? studentHomeAr : studentHomeEn; const home = locale === 'ar' ? homeAr : homeEn;
  const [now, setNow] = useState<number | null>(null);
  const id = useId(); const learnerId = membership?.userId ?? '';
  const can = (target: HomeTarget) => !!membership && status === 'ready' && online && membership.role === 'student' && canOpenWorkspace(target, membership.entitlements, membership.role);
  const canLearn = can('academic'); const canImprove = can('improvement'); const canDevelop = can('development');
  useEffect(() => { setNow(Date.now()); }, [refresh, accessGeneration]);
  const assessments = usePaginatedLearningQuery(canLearn ? '/v1/assessments?limit=25' : null, parseAssessment, refresh);
  const submissionsNeeded = assessments.loaded && assessments.data.some(item => item.currentSubmission === undefined);
  const submissions = usePaginatedLearningQuery(canLearn && submissionsNeeded ? '/v1/submissions?limit=100' : null, parseSubmission, refresh);
  const results = usePaginatedLearningQuery(canLearn ? '/v1/results?limit=25' : null, parseReleasedResult, refresh);
  const interventions = usePaginatedLearningQuery(canImprove ? '/v1/interventions?limit=25' : null, parseIntervention, refresh);
  const goals = usePaginatedLearningQuery(canDevelop ? `/v1/development/goals?learnerId=${encodeURIComponent(learnerId)}&limit=25` : null, parseLearnerGoal, refresh);
  const periods = usePaginatedLearningQuery(canDevelop ? '/v1/development/periods?limit=100' : null, parsePeriod, refresh);
  const calendar = usePaginatedLearningQuery(can('school') ? '/v1/school/calendar?limit=25' : null, parseSchedule, refresh);
  const announcements = usePaginatedLearningQuery(can('community') ? '/v1/community/announcements?limit=25' : null, parseAnnouncement, refresh);
  const activePeriod = canDevelop && periods.loaded && !periods.loading && !periods.error && !periods.moreError ? periods.data.find(item => item.id === periodId) ?? null : null;
  const filter = activePeriod ? `&learnerId=${encodeURIComponent(learnerId)}&periodId=${encodeURIComponent(activePeriod.id)}` : '';
  const summaryScope = `${membership?.schoolId}:${learnerId}:${activePeriod?.id}:${accessGeneration}:${refresh}`;
  const parseCurrentSummary = useCallback((value: unknown) => ({ scope: summaryScope, summary: parseSummary(value) }), [summaryScope]);
  const summaryRead = useApiQuery(activePeriod ? `/v1/development/summary?limit=100${filter}` : null, parseCurrentSummary, refresh);
  const summary = { ...summaryRead, data: currentStudentHomeSummary(summaryRead.data, summaryScope) };
  const ledger = usePaginatedLearningQuery(activePeriod ? `/v1/development/ledger?limit=100${filter}` : null, parseLedger, refresh);
  const achievements = usePaginatedLearningQuery(activePeriod ? `/v1/development/achievements?limit=100${filter}` : null, parseAchievement, refresh);
  const queries = [assessments, ...(submissionsNeeded ? [submissions] : []), results, interventions, goals, periods, calendar, announcements, summary, ledger, achievements];
  const denied = queries.some(query => query.error?.kind === 'denied' || query.error?.kind === 'unauthorized' || 'moreError' in query && (query.moreError?.kind === 'denied' || query.moreError?.kind === 'unauthorized'));
  useEffect(() => { if (denied) clearPresentation(); }, [denied, clearPresentation]);
  const available = online && status === 'ready' && membership?.role === 'student' && !denied;
  const selected = selectStudentHomeSources({ learnerId, now: now ?? 0, assessments: canLearn ? assessments : disabledPage, submissions, interventions: canImprove ? interventions : disabledPage, results, goals });
  const queue = available && now !== null ? selected.queue.filter(item => can(item.destination.view)) : [];
  const first = queue[0] ?? (available && now !== null ? selected.submittedTask : null); const next = queue[1]; const result = available ? selected.results[0] : null;
  const nativeSource = result ? `${result.id}:${result.revision}` : null;
  useEffect(() => { if (nativeSource && nativeDisclosure && nativeSource !== nativeDisclosure.resultId) setNativeDisclosure(null); }, [nativeSource, nativeDisclosure, setNativeDisclosure]);
  const action = (label: string, destination: HomeDestination): StudentTrailAction => ({ label, onClick: () => onNavigate(destination) });
  const recovery = { label: t.refresh, onClick: reload };
  const recognition = studentRecognition({ learnerId, period: activePeriod, summary, ledger, achievements });
  recognition.entries = recognition.entries.slice(0, 3).map(entry => ({ ...entry, label: `${entry.kind === 'practice' ? t.recordedPractice : entry.kind === 'revision' ? t.recordedRevision : t.recordedReflection} · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(entry.label))}` }));
  recognition.action = canDevelop ? action(t.recognition, 'development') : undefined;
  const hasError = queries.some(query => !!query.error || 'moreError' in query && !!query.moreError);
  const partial = queries.some(query => 'nextCursor' in query && !!query.nextCursor) || selected.unresolvedWork && (canLearn || canImprove);
  const context: StudentTrailContext = {
    displayName: available ? membership.displayName : null, schoolName: available ? membership.school.name : null,
    availability: !online ? 'offline' : !available ? 'denied' : now === null || queries.some(query => query.loading) ? 'loading' : hasError ? 'error' : partial ? 'partial' : 'ready', recovery,
    goal: available && canDevelop ? { text: selected.goal ? `${selected.goal.title} · ${selected.goal.courseTitle}: ${selected.goal.plannedStep}` : t.goalUnavailable, action: action(t.goals, 'development') } : null,
    task: first ? { title: first.title, description: first.kind === 'submitted' ? t.submittedBody : first.kind === 'submitted-unresolved' ? t.submittedUnknownBody : first.description, course: first.course, unit: null, state: first.kind === 'revision' ? 'revision' : first.kind === 'submitted' ? 'submitted' : first.kind === 'submitted-unresolved' ? 'unknown' : 'available', primaryAction: action(actionLabel(first, t), first.destination) } : canLearn && !hasError && !partial && selected.workKnown && available && now !== null ? { title: t.workEmpty, description: home.nothing, course: null, unit: null, state: 'empty', primaryAction: can('learning') ? action(home.continueLearning, 'learning') : null } : null,
    stages: [
      { key: 'lesson', title: t.lesson, description: t.lessonBody, state: can('learning') ? 'available' : 'unknown', action: can('learning') ? action(t.lesson, 'learning') : undefined },
      { key: 'feedback', title: t.feedbackStage, description: t.feedbackBody, state: result ? 'available' : 'unknown', action: result ? action(home.feedback, { view: 'academic', source: 'result', id: result.id }) : undefined },
      { key: 'practice', title: t.practice, description: t.practiceBody, state: queue.some(item => item.kind === 'practice') ? 'available' : 'unknown', action: queue.find(item => item.kind === 'practice') ? action(t.practiceAction, queue.find(item => item.kind === 'practice')!.destination) : undefined },
      { key: 'reflect', title: t.reflect, description: t.reflectBody, state: can('portfolio') ? 'available' : 'unknown', action: can('portfolio') ? action(t.portfolio, 'portfolio') : undefined },
      { key: 'grow', title: t.grow, description: t.growBody, state: recognition.status === 'recorded' ? 'available' : 'unknown', action: canDevelop ? action(t.recognition, 'development') : undefined },
    ],
    feedback: result ? { teacherName: null, teacherContext: result.assessmentTitle || null, dateLabel: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(result.createdAt)), text: result.feedback, action: action(home.evidence, { view: 'academic', source: 'result', id: result.id }) } : null,
    upcoming: next ? { title: next.title, description: next.description, availabilityLabel: next.dueAt ? `${t.due} · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(next.dueAt))}` : null, action: action(actionLabel(next, t), next.destination), viewAll: action(t.tasks, 'learning') } : null,
    recognition, classChallenge: canDevelop && activePeriod && !summary.loading && !summary.error && summary.data?.learnerId === learnerId && summary.data?.periodId === activePeriod.id && summary.data.leaderboardEnabled ? { title: t.challenge, description: t.challengeBody, periodLabel: activePeriod.title, alias: null, participating: null, participationLabel: t.challengeUnknown, action: action(t.recognition, 'development') } : null,
    help: null, companion: { visible: available && presentation !== 'hidden', name: 'Foxi', hideAction: available ? { label: presentation === 'hidden' ? t.show : t.hide, onClick: () => setPresentation(value => value === 'hidden' ? 'standard' : 'hidden') } : undefined },
  };
  const currentCalendar = available && now !== null && calendar.loaded && !calendar.loading && !calendar.error && !calendar.moreError ? scheduledUpcoming(calendar.data, now) : [];
  const currentAnnouncements = available && announcements.loaded && !announcements.loading && !announcements.error && !announcements.moreError ? announcements.data : [];
  return <div className="student-home" data-presentation={presentation}>
    <StudentTrailView context={context} assets={trailAssets} locale={locale} headingRef={headingRef} nativeFeedback={result && nativeSource ? <details className="student-home__native" open={currentNativeFeedbackDisclosure(nativeDisclosure, nativeSource)} onToggle={event => setNativeDisclosure({ resultId: nativeSource, open: event.currentTarget.open })}><summary>{t.nativeFeedback}</summary><NativeResultView result={result.nativeResult} /></details> : null} />
    {available ? <div className="student-home__records">
      {canDevelop ? <section className="student-home__section" aria-labelledby={`${id}-period`}><h2 id={`${id}-period`}>{t.period}</h2><p>{t.periodNeeded}</p><div className="field"><label htmlFor={`${id}-period-choice`}>{t.period}</label><select id={`${id}-period-choice`} value={activePeriod?.id ?? ''} onChange={event => setPeriodId(event.currentTarget.value)}><option value="">{t.choosePeriod}</option>{!periods.error && !periods.moreError ? periods.data.map(period => <option key={period.id} value={period.id}>{period.title} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(period.startsAt))} – {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(period.endsAt))}</option>) : null}</select></div><LoadMore query={periods} label={t.periods} />{activePeriod ? <><details><summary>{t.ledger}</summary>{recognition.status === 'recorded' && ledger.loaded && !ledger.loading && !ledger.error && !ledger.moreError ? <ul>{ledger.data.filter(item => item.learnerId === learnerId && item.periodId === activePeriod.id && item.policyId === activePeriod.policyId).map(item => <li key={item.id}>{item.kind === 'practice' ? t.recordedPractice : item.kind === 'revision' ? t.recordedRevision : t.recordedReflection} · {new Intl.NumberFormat(locale).format(item.points)} · <time dateTime={item.occurredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(item.occurredAt))}</time></li>)}</ul> : null}<LoadMore query={ledger} label={t.ledger} /></details>{recognition.earnedMilestones.length || achievements.error || achievements.moreError || achievements.nextCursor ? <details><summary>{t.achievements}</summary>{recognition.earnedMilestones.map(item => <article key={item.id}><h4>{item.title}</h4><p><time dateTime={item.earnedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(item.earnedAt))}</time></p></article>)}<LoadMore query={achievements} label={t.achievements} /></details> : null}</> : null}</section> : null}
      <details className="student-home__section"><summary id={`${id}-tasks`}>{t.tasks}</summary>{queue.length ? <ul className="home-action-list">{queue.map(item => <li key={`${item.destination.source}:${item.destination.id}`}><div><h3>{item.title}</h3><p dir="auto">{item.description}</p>{item.course ? <p><bdi>{item.course}</bdi></p> : null}</div><Button type="button" variant="secondary" onClick={() => onNavigate(item.destination)}>{actionLabel(item, t)}</Button></li>)}</ul> : <p>{canLearn && assessments.loading || canImprove && interventions.loading ? home.loading : selected.unresolvedWork ? home.more : home.nothing}</p>}{canLearn ? <><LoadMore query={assessments} label={t.tasks} />{submissionsNeeded ? <LoadMore query={submissions} label={t.tasks} /> : null}<Button type="button" variant="quiet" onClick={() => onNavigate('learning')}>{home.continueLearning}</Button></> : null}{canImprove ? <LoadMore query={interventions} label={t.practice} /> : null}</details>
      {canLearn ? <details className="student-home__section"><summary id={`${id}-feedback`}>{t.feedback}</summary>{selected.results.map(item => <article key={item.id}><h3>{item.assessmentTitle || t.resultUnavailable}</h3><p><time dateTime={item.createdAt}><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(item.createdAt))}</bdi> · UTC</time></p><NativeResultView result={item.nativeResult} /><p dir="auto">{item.feedback}</p><Button type="button" variant="quiet" onClick={() => onNavigate({ view: 'academic', source: 'result', id: item.id })}>{home.evidence}</Button></article>)}<LoadMore query={results} label={t.feedback} /></details> : null}
      {canDevelop && (goals.error || goals.moreError || goals.nextCursor) ? <details className="student-home__section"><summary id={`${id}-goals`}>{t.goals}</summary><p>{t.chooseGoal}</p><LoadMore query={goals} label={t.goals} /><Button type="button" variant="secondary" onClick={() => onNavigate('development')}>{t.goals}</Button></details> : null}
      {can('school') && (currentCalendar.length || calendar.loading || calendar.error || calendar.moreError || calendar.nextCursor) ? <details className="student-home__section"><summary id={`${id}-events`}>{home.upcoming}</summary>{currentCalendar.map(event => <article key={event.id}><h3>{typeof event.title === 'string' && event.title ? event.title : t.eventUnavailable}</h3><p><time dateTime={event.startsAt}><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(event.startsAt))}</bdi> · UTC</time></p></article>)}<LoadMore query={calendar} label={home.upcoming} /><Button type="button" variant="quiet" onClick={() => onNavigate('school')}>{home.upcoming}</Button></details> : null}
      {can('community') && (currentAnnouncements.length || announcements.loading || announcements.error || announcements.moreError || announcements.nextCursor) ? <details className="student-home__section"><summary id={`${id}-announcements`}>{home.communication}</summary>{currentAnnouncements.map(item => <article key={item.id}><h3>{item.title}</h3><p dir="auto">{item.body}</p></article>)}<LoadMore query={announcements} label={home.communication} /><Button type="button" variant="secondary" onClick={() => onNavigate('community')}>{t.community}</Button></details> : null}
      {queries.filter(query => query.error).map((query, index) => <LearningError key={index} error={query.error!} />)}
      <div className="student-home__presentation"><Button type="button" variant="quiet" onClick={() => setPresentation(value => value === 'quiet' ? 'standard' : 'quiet')}>{presentation === 'quiet' ? t.standard : t.quiet}</Button><Button type="button" variant="quiet" onClick={recovery.onClick}>{t.refresh}</Button></div>
    </div> : null}
  </div>;
}
