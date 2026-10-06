'use client';


import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, CuevoIcon, IconButton, Status, WorkspaceNavigationContent, WorkspacePageHeading, WorkspaceState, type CuevoIconName } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { currentLearnerState, parseLearnerState, parseLearnerObservation, parseLearnerSignal, progressLearnerChoices, type LearnerState, type Observation, type Signal, type LearnerStateSource } from '../model';
import { LearningApiError } from '../../../shared/api/client';
import { parsePersonChoice } from '../../../shared/api/people';
import { progressAr, progressEn } from '../messages';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { EvidenceDetail, NativeResultView } from '../../academic/ui';
import { OutcomeList } from '../../improvement/ui';
import { AttentionSection } from './attention';
import { ReportExport } from './report-export';
import { ClassLearningSummaryPanel } from './class-learning-summary';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import { trailAssets } from '../../../shared/characters/assets';
import { CompanionView } from '../../../shared/characters/ui';
import { companionPoses } from '../../../shared/characters/companion-assets';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { LearningObservationPolicyPanel } from './observation-policy';

type ProgressRecordPage = { loaded: boolean; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null; context: string };
function progressRecordsComplete(source: ProgressRecordPage) {
  return source.loaded === true && source.loading === false && source.loadingMore === false && source.error === null && source.moreError === null && source.nextCursor === null;
}
function useProgressRecordRefusal(source: ProgressRecordPage) {
  const failure = [source.error, source.moreError].find(error => error && ['denied', 'unauthorized', 'invalid'].includes(error.kind)) ?? null;
  const [refusal, setRefusal] = useState<{ context: string; error: LearningApiError } | null>(null);
  const current = failure ? { context: source.context, error: failure } : refusal?.context === source.context ? refusal : null;
  if (current?.context !== refusal?.context || current?.error !== refusal?.error) setRefusal(current);
  return current?.error ?? null;
}

export function ProgressWorkspace() {
  const { membership, status, online, locale } = useApp();
  const t = locale === 'ar' ? progressAr : progressEn;
  if (!online) return <><WorkspacePageHeading title={t.progress} /><WorkspaceState kind="unavailable" description={t.offline} role="status" /></>;
  if (status !== 'ready' || !membership || !canOpenWorkspace('progress', membership.entitlements, membership.role)) return <WorkspacePageHeading title={t.progress} />;
  return <CurrentProgressWorkspace key={`${membership.schoolId}:${membership.userId}:${membership.role}`} />;
}

function CurrentProgressWorkspace() {
  const { membership, locale, accessGeneration } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const own = membership?.role === 'student';
  const parent = membership?.role === 'parent';
  const coordinator = membership?.role === 'coordinator';
  const classReviewer = membership?.role === 'teacher' || membership?.role === 'coordinator' || membership?.role === 'admin';
  const [learnerId, setLearnerId] = useState<string | null>(own ? membership.userId : null);
  const [detailSelection, setDetailSelection] = useState<{ id: string; label: string; request: number; context: string; source: 'class' | 'directory' } | null>(null);
  const [classLearnerLabel, setClassLearnerLabel] = useState<{ id: string; label: string | null; context: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [showCompanion, setShowCompanion] = useState(true);
  const browseOpener = useRef<HTMLElement | null>(null), returnToBrowse = useRef(false);
  const childContext = useChildContext(refresh);
  const people = usePaginatedLearningQuery(own || parent ? null : '/v1/people?limit=100', parsePersonChoice, refresh);
  const peopleCurrent = people.loaded && !people.loading && !people.loadingMore && !people.error && !people.moreError && !people.nextCursor;
  const choices=progressLearnerChoices(people.data,t.learnerContextUnavailable,peopleCurrent);
  const classSelected=learnerId&&detailSelection?.id===learnerId&&detailSelection.source==='class';
  const labelContext = `${membership?.schoolId}:${membership?.userId}:${accessGeneration}:${refresh}`;
  const coordinatorClassCurrent=classLearnerLabel?.id===learnerId&&classLearnerLabel.context===labelContext&&classLearnerLabel.label!==null;
  const activeLearnerId = own ? membership?.userId ?? null : parent ? childContext.child?.id ?? null : coordinator&&classSelected?coordinatorClassCurrent?learnerId:null:classSelected||choices.some(choice=>choice.value===learnerId&&!choice.requiresReview)?learnerId:null;
  const learners = people.data.filter((person) => person.role === 'student') ?? [];
  const selectedLearner = learners.find(learner => learner.userId === activeLearnerId);
  const currentClassLabel = classLearnerLabel?.id === activeLearnerId && classLearnerLabel.context === labelContext ? classLearnerLabel.label : null;
  const selectedLabel = own ? membership?.displayName ?? t.learnerContextUnavailable : parent ? childContext.child?.displayName ?? t.learnerContextUnavailable : currentClassLabel ?? (peopleCurrent && selectedLearner ? [selectedLearner.displayName, ...selectedLearner.classLabels].join(' · ') : detailSelection?.id === activeLearnerId && detailSelection.context === labelContext ? detailSelection.label : t.learnerContextUnavailable);
  const receiveClassLearnerLabel = useCallback((id: string, label: string | null, context: string) => {
    setClassLearnerLabel(previous => previous?.id === id && previous.label === label && previous.context === context ? previous : { id, label, context });
  }, []);
  const reviewLearner = (id: string, label?: string) => {
    if(id&&!label&&!choices.some(choice=>choice.value===id&&!choice.requiresReview))return;
    if (id) browseOpener.current = label ? document.activeElement instanceof HTMLElement ? document.activeElement : null : document.getElementById('learner-selection');
    setLearnerId(id || null);
    const learner = learners.find(learner => learner.userId === id);
    if (id) setDetailSelection(previous => ({ id, label: label ?? (learner ? [learner.displayName, ...learner.classLabels].join(' · ') : t.learnerContextUnavailable), request: (previous?.request ?? 0) + 1, context: labelContext, source:label?'class':'directory' }));
  };
  function backToLearners() { setLearnerId(null); setDetailSelection(null); setClassLearnerLabel(null); returnToBrowse.current = true; }
  useEffect(() => {
    if (!returnToBrowse.current || activeLearnerId) return;
    const frame = requestAnimationFrame(() => {
      returnToBrowse.current = false;
      const previous = browseOpener.current;
      const picker = document.getElementById('learner-selection') as HTMLSelectElement | null;
      const target = previous?.isConnected && previous.matches('button,input,select,textarea,a,summary,[tabindex]') && previous.getClientRects().length && !previous.matches(':disabled') ? previous
        : picker?.getClientRects().length && !picker.disabled ? picker : document.querySelector<HTMLElement>('.class-summary-heading');
      target?.focus({ preventScroll: true });
      const classHeading = document.querySelector<HTMLElement>('.class-summary-heading');
      if (target && document.activeElement !== target) classHeading?.focus({ preventScroll: true });
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focused?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeLearnerId]);
  const utilities = <>{own ? <div className="progress-companion"><CompanionView registry={companionPoses} character="foxi" state="read" visible={showCompanion} /><Button type="button" variant="quiet" onClick={() => setShowCompanion(value => !value)}>{showCompanion ? t.hideCompanion : t.showCompanion}</Button></div> : null}<IconButton icon="refresh" label={t.refresh} onClick={() => setRefresh(value => value + 1)} /></>;
  return <section className="progress-workspace" data-role={membership?.role}>
    <WorkspacePageHeading title={t.progress} />
    {!activeLearnerId ? <ProgressNavigation utilities={utilities} /> : null}
    <details className="progress-help"><summary>{t.aboutProgress}</summary><p>{t.progressGuide}</p></details>
    {membership?.role === 'admin' ? <LearningObservationPolicyPanel /> : null}
    <ChildSelector context={childContext} />
    <div className={classReviewer?`progress-review-layout${coordinator?' coordinator-progress-layout':''}`:undefined} data-selected={classReviewer&&!!activeLearnerId}>
    {classReviewer ? <ClassLearningSummaryPanel refresh={refresh} onReviewLearner={reviewLearner} selectedLearnerId={coordinator?learnerId:activeLearnerId} labelContext={labelContext} onLearnerContext={receiveClassLearnerLabel} /> : null}
    <div className={classReviewer?`progress-review-reading${coordinator?' coordinator-progress-reading':''}`:undefined}>
    {classReviewer && activeLearnerId ? <Button type="button" variant="quiet" className="progress-back-to-learners" onClick={backToLearners}><CuevoIcon name="arrow" size={18} className="directional-icon"/>{t.backToLearners}</Button> : null}
    <div className="progress-toolbar">{!own && !parent ? <div className="field"><label htmlFor="learner-selection">{t.learner}</label><select id="learner-selection" value={choices.some(choice=>choice.value===learnerId&&!choice.requiresReview)?learnerId??'':''} disabled={!peopleCurrent} onChange={(event) => reviewLearner(event.target.value)}><option value="">{t.chooseLearner}</option>{choices.map(choice=><option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select><LoadMore query={people} />{learners.length>0&&!people.error&&!people.loading&&(people.nextCursor||choices.some(choice=>choice.requiresReview))?<WorkspaceState kind="review" icon="people" description={t.learnerChoicesReview} role="status"/>:null}</div> : null}</div>
    {people.error ? <LearningError error={people.error} /> : !own && !parent && people.loading ? <WorkspaceState kind="loading" description={t.loading} role="status" /> : !own && !parent && !people.moreError && !learners.length ? <WorkspaceState kind={peopleCurrent?'empty':'unknown'} icon="people" description={peopleCurrent?t.noLearners:t.learnerChoicesReview} role="status"/> : null}
    {parent && !activeLearnerId ? <p className="learning-form__note">{t.parentSafe}</p> : null}
    {activeLearnerId ? <LearnerDetail key={`${activeLearnerId}:${detailSelection?.id === activeLearnerId ? detailSelection.request : 0}`} learnerId={activeLearnerId} learnerLabel={selectedLabel} focusRequest={detailSelection?.id === activeLearnerId ? detailSelection.request : 0} refresh={refresh} parent={parent} utilities={utilities} /> : null}
    </div></div>
  </section>;
}

function ProgressNavigation({ utilities, chapters = false, parent = false, onChapter }: { utilities: ReactNode; chapters?: boolean; parent?: boolean; onChapter?: (id: string) => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  return <WorkspaceNavigationContent><div className="cuevo-workspace-section-navigation progress-navigation">
    {chapters ? <nav className="cuevo-workspace-links" aria-label={t.exploreProgress}><a href="#progress-academic" onClick={() => onChapter?.('progress-academic')}><CuevoIcon name="assessment" size={18} />{t.academic}</a>{!parent ? <><a href="#progress-actions" onClick={() => onChapter?.('progress-actions')}><CuevoIcon name="development" size={18} />{t.development}</a><a href="#progress-support" onClick={() => onChapter?.('progress-support')}><CuevoIcon name="help" size={18} />{t.support}</a></> : null}<a href="#progress-reports" onClick={() => onChapter?.('progress-reports')}><CuevoIcon name="portfolio" size={18} />{t.resultPages}</a></nav> : null}
    <div className="cuevo-workspace-section-actions">{utilities}</div>
  </div></WorkspaceNavigationContent>;
}

function LearnerDetail({ learnerId, learnerLabel, focusRequest, refresh, parent, utilities }: { learnerId: string; learnerLabel: string; focusRequest: number; refresh: number; parent: boolean; utilities: ReactNode }) {
  const { locale, membership, accessToken, online, accessGeneration } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null); const focusedRequest = useRef(0);
  const scope = `${membership?.schoolId}:${membership?.userId}:${membership?.role}:${learnerId}:${accessToken ?? ''}:${online}:${accessGeneration}:${refresh}`;
  const parseState = useCallback((value: unknown): LearnerStateSource => {
    const current = parseLearnerState(value);
    if (current.learnerId !== learnerId) throw new LearningApiError('invalid');
    return { scope, value: current };
  }, [scope, learnerId]);
  const parseObservation = useCallback((value: unknown) => parseLearnerObservation(value, learnerId), [learnerId]);
  const parseSignal = useCallback((value: unknown) => parseLearnerSignal(value, learnerId), [learnerId]);
  const state = useApiQuery(`/v1/learners/${learnerId}/state`, parseState, refresh);
  const current = currentLearnerState(state.data, scope, learnerId);
  const observations = usePaginatedLearningQuery(parent ? null : `/v1/observations?limit=100&learnerId=${learnerId}`, parseObservation, refresh);
  const signals = usePaginatedLearningQuery(parent ? null : `/v1/signals?limit=100&learnerId=${learnerId}`, parseSignal, refresh);
  const observationRefusal = useProgressRecordRefusal(observations), signalRefusal = useProgressRecordRefusal(signals);
  useEffect(() => {
    if (!focusRequest || focusedRequest.current === focusRequest || state.loading || !current && !state.error) return;
    focusedRequest.current = focusRequest;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [focusRequest, state.loading, state.error, current]);
  const detailHeading = <h2 className="learner-detail-heading" ref={heading} tabIndex={-1} aria-label={`${t.currentLearnerEvidence} · ${learnerLabel}`}><bdi>{learnerLabel}</bdi></h2>;
  const label = `${t.currentLearnerEvidence} · ${learnerLabel}`;
  if (state.loading || !current && !state.error) return <section aria-label={label}><ProgressNavigation utilities={utilities} />{detailHeading}<WorkspaceState kind="loading" description={t.loading} role="status" /></section>;
  if (state.error) return <section aria-label={label}><ProgressNavigation utilities={utilities} />{detailHeading}<LearningError error={state.error} /></section>;
  if (!current) return <section aria-label={label}><ProgressNavigation utilities={utilities} />{detailHeading}<LearningError error={new LearningApiError('invalid')} /></section>;
  const focusChapter = (id: string) => root.current?.querySelector<HTMLElement>(`#${id}`)?.focus({ preventScroll: true });
  return <section ref={root} className="progress-detail" aria-label={label}><ProgressNavigation utilities={utilities} chapters parent={parent} onChapter={focusChapter} />{detailHeading}
    <div className="progress-source-context">
      {current.status === 'UNKNOWN' ? <WorkspaceState kind="unknown" title={t.unknown} description={t.unknownBody} role="status" /> : current.freshness === 'STALE' ? <WorkspaceState kind="review" title={t.stale} description={t.staleBody} role="status"><p>{t.snapshotAsOf}: <bdi>{dateLabel(current.generatedAt, locale, t.unknown)}</bdi></p></WorkspaceState> : current.freshness === 'APPROVED_PROJECTION' ? <p className="learning-form__note">{t.parentSafe}</p> : <p className="progress-updated">{t.snapshot} · {t.generatedAt}: <bdi>{dateLabel(current.generatedAt, locale, t.unknown)}</bdi></p>}
      {!parent && current.projection ? <p className="learning-form__note">{t.snapshotBasis} <a href="#progress-reports" onClick={() => focusChapter('progress-reports')}>{t.resultPages}</a></p> : null}
      {current.projection ? <p className="learning-form__note">{t.academic}: {countLabel(current.projection.academic.returnedCount, locale, t.unknown)} / {countLabel(current.projection.academic.totalCount, locale, t.unknown)} {parent ? t.recordsShown : t.snapshotRecordsShown}. {current.projection.academic.truncated ? t.moreClassSources : t.coverageUnknown}</p> : null}
    </div>
    <div className="progress-story-grid" data-parent={parent} data-teacher={membership?.role === 'teacher'}>
      <AcademicRows state={current} />
      {membership?.role === 'teacher' ? <AttentionSection learnerId={learnerId} refresh={refresh}/> : null}
      {!parent ? <section className="progress-section" id="progress-actions" tabIndex={-1} aria-label={t.development}><ProgressSectionHeading title={t.development} icon="development" /><p className="learning-form__note">{t.developmentBody}</p>{current.development.completeness === 'RECORDED_ONLY' ? <p className="learning-form__note"><strong>{t.recordedOnly}.</strong> {t.recordedOnlyBody}</p> : null}<p className="learning-form__note">{t.window}: <bdi>{dateLabel(current.development.windowStart, locale, t.unknown)} – {dateLabel(current.development.windowEnd, locale, t.unknown)}</bdi></p><dl className="observation-counts">{(['practice', 'revision', 'reflection'] as const).map(kind => <div key={kind}><dt><CuevoIcon name={kind === 'revision' ? 'feedback' : kind === 'reflection' ? 'reflection' : 'practice'} size={20} />{t[kind]}</dt><dd><strong>{countLabel(current.development[kind].count, locale, t.unknown)}</strong>{current.development[kind].observationIds.length ? <details><summary>{t.sourceIds}</summary>{current.projection?.observations[kind].truncated ? <p>{countLabel(current.projection.observations[kind].returnedCount, locale, t.unknown)} / {countLabel(current.projection.observations[kind].totalCount, locale, t.unknown)} {t.recordsShown}</p> : null}<ul className="source-id-list">{current.development[kind].observationIds.map(id => <li key={id}><bdi>{id}</bdi></li>)}</ul></details> : null}</dd></div>)}</dl>
        <div className="progress-completion"><h3>{t.engagement}</h3><p className="learning-form__note">{t.engagementBody}</p><dl className="academic-facts"><div><dt>{t.completionCount}</dt><dd>{countLabel(current.engagement.completedActivityCount, locale, t.unknown)}</dd></div><div><dt>{t.lastCompleted}</dt><dd><bdi>{dateLabel(current.engagement.lastCompletedAt, locale, t.unknown)}</bdi></dd></div></dl></div>
      </section> : null}
    </div>
    {!parent ? <>
      <div className="progress-follow-up-grid">
        <section className="progress-section" id="progress-support" tabIndex={-1} aria-label={t.support}><ProgressSectionHeading title={t.support} icon="help" /><p className="learning-form__note">{t.supportBody}</p>{current.projection?.support ? <p>{countLabel(current.projection.support.returnedCount, locale, t.unknown)} / {countLabel(current.projection.support.totalCount, locale, t.unknown)} {parent ? t.recordsShown : t.snapshotRecordsShown}</p> : null}<SupportRows state={current} /></section>
        <section className="progress-section" aria-label={t.impact}><ProgressSectionHeading title={t.impact} icon="assessment" />{current.projection?.outcomes ? <p>{countLabel(current.projection.outcomes.returnedCount, locale, t.unknown)} / {countLabel(current.projection.outcomes.totalCount, locale, t.unknown)} {parent ? t.recordsShown : t.snapshotRecordsShown}</p> : null}{current.impact.status === 'measured' ? <OutcomeList outcomes={current.impact.outcomes} /> : <WorkspaceState kind="unknown" description={t.unmeasured} />}</section>
      </div>
      <details className="progress-record-history"><summary><CuevoIcon name="reflection" size={20} />{t.recordHistory}</summary>
      <section className="progress-section"><ProgressSectionHeading title={t.observations} icon="reflection" />{observationRefusal ? <LearningError error={observationRefusal}/> : observations.loading ? <WorkspaceState kind="loading" description={t.loading} role="status" /> : observations.error ? <LearningError error={observations.error} /> : <ObservationRows observations={observations.data} sourceComplete={progressRecordsComplete(observations)}/>}{!observationRefusal?<LoadMore query={observations}/>:null}</section>
      {membership?.role !== 'teacher' ? <AttentionSection learnerId={learnerId} refresh={refresh} /> : null}
      <section className="progress-section"><ProgressSectionHeading title={t.signals} icon="progress" />{signalRefusal ? <LearningError error={signalRefusal}/> : signals.loading ? <WorkspaceState kind="loading" description={t.loading} role="status" /> : signals.error ? <LearningError error={signals.error} /> : <SignalRows signals={signals.data} sourceComplete={progressRecordsComplete(signals)}/>}{!signalRefusal?<LoadMore query={signals}/>:null}</section>
      </details>
    </> : null}
    <section id="progress-reports" tabIndex={-1} aria-label={t.resultPages}><ProgressSectionHeading title={t.resultPages} icon="portfolio" /><ReportExport learnerId={learnerId} /></section>
  </section>;
}

function ProgressSectionHeading({ title, icon }: { title: string; icon: CuevoIconName }) {
  const { membership } = useApp();
  const art = icon === 'assessment' ? trailAssets.work : icon === 'development' ? trailAssets.grow : icon === 'help' ? trailAssets.practice : icon === 'reflection' ? trailAssets.reflect : null;
  return <div className="progress-section-heading"><span>{membership?.role === 'student' && art ? <img src={art} width={48} height={48} alt="" /> : <CuevoIcon name={icon} size={24} variant="filled" />}</span><h2>{title}</h2></div>;
}

function SupportRows({ state }: { state: LearnerState }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const status = { ASSIGNED: t.assigned, COMPLETED: t.completed, MEASURED: t.measured };
  return state.support.items.length ? <div>{state.support.items.map((item) => <article className="academic-row support-row" key={item.id} data-intervention-id={item.id}><div className="learning-section-heading"><h3>{item.title}</h3><Status tone={item.status === 'ASSIGNED' ? 'neutral' : 'positive'}>{status[item.status]}</Status></div><p className="lesson-content">{item.instructions}</p>{item.requiresReview ? <WorkspaceState kind="review" icon="refresh" description={t.sourceChanged} role="status"/> : null}{item.completedAt ? <p className="learning-form__note">{t.completedAt}: <bdi>{dateLabel(item.completedAt, locale, t.unknown)}</bdi></p> : null}<details><summary>{t.sources}</summary><dl className="academic-facts"><div><dt>{t.supportSource}</dt><dd><bdi>{item.id}</bdi></dd></div><div><dt>{t.recommendationSource}</dt><dd><bdi>{item.recommendationId}</bdi></dd></div><div><dt>{t.baselineSource}</dt><dd><bdi>{item.baselineResultId}</bdi></dd></div>{item.followUpAssessmentId ? <div><dt>{t.followUpAssessment}</dt><dd><bdi>{item.followUpAssessmentId}</bdi></dd></div> : null}</dl></details></article>)}</div> : <WorkspaceState kind="empty" description={t.noSupport} />;
}

function AcademicRows({ state }: { state: LearnerState }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  return <section className="progress-section progress-academic" id="progress-academic" tabIndex={-1} aria-label={t.academic}><ProgressSectionHeading title={t.academic} icon="assessment" />{state.academic.length ? state.academic.map(row => <article key={row.resultId} className="academic-row" data-result-id={row.resultId}><div className="learning-section-heading"><div><h3>{row.assessmentTitle ?? t.assessmentNameUnavailable}</h3><p>{row.referenceTitle ?? t.objectiveUnavailable}</p></div><bdi className="learning-form__note">{dateLabel(row.observedAt, locale, t.unknown)}</bdi></div><NativeResultView result={row.nativeResult} /><div className="learning-actions"><Button type="button" variant="secondary" aria-expanded={evidenceId === row.evidenceId} onClick={() => setEvidenceId(evidenceId === row.evidenceId ? null : row.evidenceId)}><CuevoIcon name="assessment" size={18} />{evidenceId === row.evidenceId ? t.closeEvidence : t.evidence}</Button><details><summary>{t.sources}</summary><dl className="academic-facts"><div><dt>{t.reference}</dt><dd><bdi>{row.referenceId}</bdi></dd></div><div><dt>{t.referenceVersion}</dt><dd><bdi>{row.referenceVersion}</bdi></dd></div><div><dt>{t.policy}</dt><dd>{new Intl.NumberFormat(locale).format(row.nativeResult.policyVersion)}</dd></div></dl></details></div>{evidenceId === row.evidenceId ? <EvidenceDetail evidenceId={row.evidenceId} learnerId={state.learnerId} /> : null}</article>) : <WorkspaceState kind="empty" description={t.noAcademic} />}</section>;
}
function ObservationRows({ observations, sourceComplete }: { observations: Observation[]; sourceComplete: boolean }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  return observations.length ? <div>{observations.map((observation) => <article key={observation.id} className="observation-row"><div><h3>{t[observation.kind]}</h3><p><bdi>{dateLabel(observation.occurredAt, locale, t.unknown)}</bdi></p></div><details><summary>{t.sources}</summary><dl className="academic-facts"><div><dt>{t.sourceType}</dt><dd>{observation.kind === 'revision' ? t.submissionRevision : t.activityCompletion}</dd></div><div><dt>{observation.kind === 'revision' ? t.sourceSubmissionRevision : t.sourceObject}</dt><dd><bdi>{observation.sourceObjectId}</bdi></dd></div><div><dt>{t.sources}</dt><dd><bdi>{observation.sourceEventId}</bdi></dd></div></dl></details></article>)}</div> : <WorkspaceState kind={sourceComplete?'empty':'unknown'} icon="reflection" description={sourceComplete?t.noObservations:t.historyIncomplete} role="status"/>;
}
function SignalRows({ signals, sourceComplete }: { signals: Signal[]; sourceComplete: boolean }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  return signals.length ? <div>{signals.map((signal) => <article key={signal.id} className="academic-row"><div className="learning-section-heading"><h3>{t.practiceObserved}</h3><Status>{t.observationOnly}</Status></div><p>{t.count}: {new Intl.NumberFormat(locale).format(signal.count)}</p><p className="learning-form__note">{t.signalBody}</p><p className="learning-form__note">{t.window}: <bdi>{dateLabel(signal.windowStart, locale, t.unknown)} – {dateLabel(signal.windowEnd, locale, t.unknown)}</bdi></p>{signal.sourceCoverage?.truncated ? <p className="learning-form__note">{new Intl.NumberFormat(locale).format(signal.sourceCoverage.returnedCount)} / {new Intl.NumberFormat(locale).format(signal.sourceCoverage.totalCount)} {t.recordsShown}</p> : null}<details><summary>{t.sources}</summary><p className="learning-form__note">{t.ruleVersion}: <bdi>{signal.ruleVersion}</bdi></p><ul className="source-id-list">{signal.sourceEventIds.map((id) => <li key={id}><bdi>{id}</bdi></li>)}</ul></details></article>)}</div> : <WorkspaceState kind={sourceComplete?'empty':'unknown'} icon="progress" description={sourceComplete?t.noSignals:t.historyIncomplete} role="status"/>;
}
function dateLabel(value: string | null, locale: string, unknown: string) { return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : unknown; }
function countLabel(value: number | null, locale: string, unknown: string) { return value === null ? unknown : new Intl.NumberFormat(locale).format(value); }
