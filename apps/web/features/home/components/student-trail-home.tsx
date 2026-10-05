'use client';

import { useCallback, useEffect, useId, useRef, useState, type Ref } from 'react';
import { Button, WorkspaceState } from '@cuevo/ui';
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
import { portfolioReadScope } from '../../portfolio/model';
import { developmentPeriodChoices, parseAchievement, parseLearnerGoal, parseLedger, parsePeriod, parseSummary } from '../../development/model';
import { developmentAr, developmentEn } from '../../development/copy';
import { homeAr, homeEn } from '../messages';
import { studentHomeAr, studentHomeEn } from '../student-home-messages';
import { type HomeDestination, type HomeTarget } from '../model';
import { currentNativeFeedbackDisclosure, currentStudentHomeDenial, currentStudentHomePortfolioPage, currentStudentHomeSummary, parseStudentHomePortfolio, selectStudentHomeSources, studentHomePortfolio, studentHomeReadFrame, studentRecognition, type StudentHomeDenial, type NativeFeedbackDisclosure, type StudentHomeItem, type HomeSourcePage } from '../student-home-model';
import { parentHomeSourceDenial, type ParentHomeSourceDenial } from '../parent-home-binding-model';
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
  const app = useApp();
  const [refresh, setRefresh] = useState(0);
  const [periodId, setPeriodId] = useState('');
  const [presentation, setPresentation] = useState<'standard' | 'quiet' | 'hidden'>('standard');
  const [nativeDisclosure, setNativeDisclosure] = useState<NativeFeedbackDisclosure | null>(null);
  const clearPresentation = useCallback(() => { setPeriodId(''); setPresentation('standard'); setNativeDisclosure(null); }, []);
  return <CurrentStudentTrailHome key={studentHomeReadFrame(app)} onNavigate={onNavigate} headingRef={headingRef} refresh={refresh} reload={() => setRefresh(value => value + 1)} periodId={periodId} setPeriodId={value => { setPeriodId(value); setNativeDisclosure(null); }} presentation={presentation} setPresentation={setPresentation} clearPresentation={clearPresentation} nativeDisclosure={nativeDisclosure} setNativeDisclosure={setNativeDisclosure} />;
}

function CurrentStudentTrailHome({ onNavigate, headingRef, refresh, reload, periodId, setPeriodId, presentation, setPresentation, clearPresentation, nativeDisclosure, setNativeDisclosure }: {
  onNavigate: (target: HomeDestination) => void; headingRef?: Ref<HTMLHeadingElement>;
  refresh: number; reload: () => void;
  periodId: string; setPeriodId: (value: string) => void; presentation: 'standard' | 'quiet' | 'hidden'; setPresentation: (update: (value: 'standard' | 'quiet' | 'hidden') => 'standard' | 'quiet' | 'hidden') => void;
  clearPresentation: () => void;
  nativeDisclosure: NativeFeedbackDisclosure | null; setNativeDisclosure: (value: NativeFeedbackDisclosure | null) => void;
}) {
  const app = useApp(); const { membership, locale, online, status, accessGeneration } = app;
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
  const portfolioPath = can('portfolio') ? '/v1/portfolio/items?limit=25' : null;
  const portfolioScope = portfolioReadScope(app, portfolioPath, refresh);
  const parsePortfolio = useCallback((value: unknown) => parseStudentHomePortfolio(value, learnerId, portfolioScope), [learnerId, portfolioScope]);
  const portfolioRead = usePaginatedLearningQuery(portfolioScope ? portfolioPath : null, parsePortfolio, refresh);
  const portfolioReadScopeRef = useRef(portfolioScope);
  const portfolio = currentStudentHomePortfolioPage(portfolioRead, portfolioScope, portfolioReadScopeRef.current);
  useEffect(() => { portfolioReadScopeRef.current = portfolioScope; }, [portfolioScope]);
  const [portfolioDenial, setPortfolioDenial] = useState<ParentHomeSourceDenial | null>(null);
  const currentPortfolioDenial = parentHomeSourceDenial(portfolioDenial, portfolioScope, portfolio);
  if (currentPortfolioDenial !== portfolioDenial) setPortfolioDenial(currentPortfolioDenial);
  const portfolioPreview = studentHomePortfolio(portfolio, portfolioScope, learnerId, locale, currentPortfolioDenial);
  const periodChoices = developmentPeriodChoices(periods.data, locale);
  const selectedPeriodChoice = periodChoices.find(choice => choice.value === periodId && !choice.requiresReview);
  const activePeriod = canDevelop && selectedPeriodChoice && periods.loaded && !periods.loading && !periods.error && !periods.moreError ? periods.data.find(item => item.id === periodId) ?? null : null;
  const filter = activePeriod ? `&learnerId=${encodeURIComponent(learnerId)}&periodId=${encodeURIComponent(activePeriod.id)}` : '';
  const summaryScope = JSON.stringify([app.apiUrl, app.accessToken, membership?.schoolId, learnerId, membership?.role, activePeriod?.id, accessGeneration, status, online, refresh]);
  const parseCurrentSummary = useCallback((value: unknown) => ({ scope: summaryScope, summary: parseSummary(value) }), [summaryScope]);
  const summaryRead = useApiQuery(activePeriod ? `/v1/development/summary?limit=100${filter}` : null, parseCurrentSummary, refresh);
  const summary = { ...summaryRead, data: currentStudentHomeSummary(summaryRead.data, summaryScope) };
  const ledger = usePaginatedLearningQuery(activePeriod ? `/v1/development/ledger?limit=100${filter}` : null, parseLedger, refresh);
  const achievements = usePaginatedLearningQuery(activePeriod ? `/v1/development/achievements?limit=100${filter}` : null, parseAchievement, refresh);
  const queries = [assessments, ...(submissionsNeeded ? [submissions] : []), results, interventions, goals, periods, calendar, announcements, summary, ledger, achievements];
  const [homeDenial, setHomeDenial] = useState<StudentHomeDenial | null>(null);
  const currentHomeDenial = currentStudentHomeDenial(homeDenial, `${studentHomeReadFrame(app)}:${refresh}`, queries);
  if (currentHomeDenial !== homeDenial) setHomeDenial(currentHomeDenial);
  const denied = !!currentHomeDenial;
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
    portfolio: can('portfolio') ? { ...portfolioPreview, action: action(t.portfolio, 'portfolio') } : undefined,
    upcoming: next ? { title: next.title, description: next.description, availabilityLabel: next.dueAt ? `${t.due} · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(next.dueAt))}` : null, action: action(actionLabel(next, t), next.destination), viewAll: action(t.tasks, 'learning') } : null,
    recognition, classChallenge: canDevelop && activePeriod && !summary.loading && !summary.error && summary.data?.learnerId === learnerId && summary.data?.periodId === activePeriod.id && summary.data.leaderboardEnabled ? { title: t.challenge, description: t.challengeBody, periodLabel: activePeriod.title, alias: null, participating: null, participationLabel: t.challengeUnknown, action: action(t.recognition, 'development') } : null,
    help: null, companion: { visible: available && presentation !== 'hidden', name: 'Foxi', hideAction: available ? { label: presentation === 'hidden' ? t.show : t.hide, onClick: () => setPresentation(value => value === 'hidden' ? 'standard' : 'hidden') } : undefined },
  };
  const periodControl = available && canDevelop ? <div className="field"><label htmlFor={`${id}-period-choice`}>{t.period}</label><select id={`${id}-period-choice`} value={activePeriod?.id ?? ''} onChange={event => setPeriodId(event.currentTarget.value)}><option value="">{t.choosePeriod}</option>{!periods.error && !periods.moreError ? periodChoices.map(period => <option key={period.value} value={period.value} disabled={period.requiresReview}>{period.label}</option>) : null}</select><p>{t.periodNeeded}</p>{periodChoices.some(choice => choice.requiresReview) ? <WorkspaceState kind="review" description={(locale === 'ar' ? developmentAr : developmentEn).ambiguousPeriods}/> : null}{periods.nextCursor || periods.moreError ? <LoadMore query={periods} label={t.periods} /> : null}</div> : null;
  const portfolioFailure = currentPortfolioDenial?.error ?? portfolio.error ?? (portfolio.moreError?.kind === 'invalid' ? portfolio.moreError : null);
  const portfolioControls = available && can('portfolio') ? <>{portfolioFailure ? <><LearningError error={portfolioFailure} /><Button type="button" variant="quiet" onClick={reload}>{t.refresh}</Button></> : portfolio.nextCursor || portfolio.moreError ? <LoadMore query={portfolio} label={t.portfolio} /> : null}</> : null;
  const continuingSources = [{query:results,label:t.feedback},{query:interventions,label:t.practice},{query:goals,label:t.goals},{query:calendar,label:home.upcoming},{query:announcements,label:home.communication},{query:ledger,label:t.ledger},{query:achievements,label:t.achievements},...(submissionsNeeded?[{query:submissions,label:t.tasks}]:[])].filter(({query})=>query.nextCursor||query.moreError);
  const failedContinuations = continuingSources.filter(({query})=>query.moreError);
  const additionalSources = continuingSources.filter(({query})=>!query.moreError);
  return <div className="student-home" data-presentation={presentation}>
    <StudentTrailView context={context} assets={trailAssets} locale={locale} headingRef={headingRef} periodControl={periodControl} portfolioControls={portfolioControls} upcomingControls={available && (assessments.nextCursor || assessments.moreError) ? <LoadMore query={assessments} label={t.tasks} /> : null} presentationAction={available ? { label: presentation === 'quiet' ? t.standard : t.quiet, onClick: () => setPresentation(value => value === 'quiet' ? 'standard' : 'quiet') } : undefined} nativeFeedback={result && nativeSource ? <details className="student-home__native" open={currentNativeFeedbackDisclosure(nativeDisclosure, nativeSource)} onToggle={event => setNativeDisclosure({ resultId: nativeSource, open: event.currentTarget.open })}><summary>{t.nativeFeedback}</summary><NativeResultView result={result.nativeResult} /></details> : null} />
    {available ? <div className="student-home__records">
      {failedContinuations.length ? <div className="home-overview-continuations student-home__source-recovery">{failedContinuations.map(({query,label},index)=><section key={index} aria-label={label}><h2>{label}</h2><LoadMore query={query} label={label}/></section>)}</div> : null}
      {additionalSources.length ? <details className="student-home__source-continuations"><summary>{t.summarySources}</summary><p>{t.summarySourcesBody}</p><div className="home-overview-continuations">{additionalSources.map(({query,label},index)=><LoadMore key={index} query={query} label={label}/>)}</div></details> : null}
      {queries.filter(query => query.error).map((query, index) => <LearningError key={index} error={query.error!} />)}
    </div> : null}
  </div>;
}
