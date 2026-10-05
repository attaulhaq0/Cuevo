'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, CuevoIcon, WorkspacePageHeading, WorkspaceState, type CuevoIconName } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { parsePersonChoice } from '../../../shared/api/people';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { trailAssets } from '../../../shared/characters/assets';
import { companionPoses } from '../../../shared/characters/companion-assets';
import { CompanionView } from '../../../shared/characters/ui';
import { parseSummary, parsePolicy, parsePeriod, parseLedger, parseAchievement, parseLeaderboard, developmentLearnerChoices, currentDevelopmentSummary, currentDevelopmentBoard, confirmDevelopmentCommandReceipt, developmentPeriodChoices, developmentRecordState, developmentPeriodPrerequisite, type DevelopmentRecordSource, type RecordedDayStreak } from '../model';
import { developmentAr, developmentEn } from '../messages';
import { choiceLabel, parseChoice } from '../../learning/model';
import { LearnerGoals } from './learner-goals';
import { DevelopmentPolicyReading } from './policy-reading';

export function ConsecutiveRecordedDays({ streak, locale, copy: t }: { streak: RecordedDayStreak; locale: 'en' | 'ar'; copy: typeof developmentEn }) {
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const state = { PERIOD_REQUIRED: t.streakPeriodRequired, DISABLED: t.streakDisabled, UNOBSERVED: t.streakUnobserved, REQUIRES_REVIEW: t.streakReview };
  return <section className="development-days" aria-label={t.consecutiveDays}>
    <div className="development-subheading"><CuevoIcon name="calendar" variant="filled" /><h3>{t.consecutiveDays}</h3></div><p className="development-meta">{t.recordedDayBasis}</p>
    {streak.status === 'RECORDED' ? <dl className="development-facts">
      <div><dt>{t.recordedDayCount}</dt><dd>{number(streak.days!)}</dd></div>
      <div><dt>{t.endingDay}</dt><dd><time dateTime={streak.endingOn!}><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${streak.endingOn}T00:00:00Z`))}</bdi> · UTC</time></dd></div>
      <div><dt>{t.recognizedDays}</dt><dd>{number(streak.recordedDays!)}</dd></div>
      <div><dt>{t.recognizedSources}</dt><dd>{number(streak.sourceCount!)}</dd></div>
    </dl> : <WorkspaceState kind={streak.status==='DISABLED'?'unavailable':streak.status==='REQUIRES_REVIEW'?'review':'unknown'} icon="calendar" description={state[streak.status]}/>}
    <p className="development-meta">{t.recordedDayLimit}</p>
  </section>;
}

export function DevelopmentRecordReading({query,current,locale,icon,emptyDescription,label,children}:{query:DevelopmentRecordSource&{error:LearningApiError|null;moreError:LearningApiError|null;loadMore:()=>void};current:boolean;locale:'en'|'ar';icon:CuevoIconName;emptyDescription:string;label:string;children:ReactNode}){
 const t=locale==='ar'?developmentAr:developmentEn,state=developmentRecordState(query);
 return <>
  {!current?query.error?<LearningError error={query.error}/>:null:state==='loading'?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:state==='error'?<LearningError error={query.error!}/>:state==='more-error'?null:query.data.length?children:state==='empty'?<WorkspaceState kind="empty" icon={icon} description={emptyDescription}/>:null}
  {state==='partial'?<WorkspaceState kind="review" icon="progress" description={t.partialRecords}/>:current&&state==='unknown'?<WorkspaceState kind="unknown" icon={icon} description={t.recordsChecking}/>:null}<LoadMore query={query} label={label}/>
 </>;
}

export function DevelopmentWorkspace() {
  const { membership } = useApp();
  return <CurrentDevelopmentWorkspace key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}:${membership?.entitlements.join(',')}`} />;
}

function CurrentDevelopmentWorkspace() {
  const { locale, membership, commandJournal, formDrafts, online, status, accessGeneration, apiUrl } = useApp();
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const t = locale === 'ar' ? developmentAr : developmentEn;
  const parent = membership?.role === 'parent'; const student = membership?.role === 'student'; const admin = membership?.role === 'admin';
  const permitted = !parent && status === 'ready' && online && !!membership && canOpenWorkspace('development', membership.entitlements, membership.role);
  const [learnerId, setLearnerId] = useState(student ? membership.userId : '');
  const [periodId, setPeriodId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [configure, setConfigure] = useState<'policy' | 'period' | null>(null);
  const [presentation, setPresentation] = useState<'standard' | 'quiet' | 'hidden'>('standard');
  const [commandLocked, setCommandLocked] = useState(false);
  const learnerPicker = useRef<HTMLSelectElement>(null), learnerHeading = useRef<HTMLHeadingElement>(null), contextPanel = useRef<HTMLDivElement>(null);
  const focusSelectedLearner = useRef<string | null>(null), returnToLearners = useRef(false);
  const id = useId();
  const periods = usePaginatedLearningQuery(permitted ? '/v1/development/periods?limit=100' : null, parsePeriod, refresh);
  const policies = usePaginatedLearningQuery(permitted && admin ? '/v1/development/policies?limit=100' : null, parsePolicy, refresh);
  const people = usePaginatedLearningQuery(permitted && !student ? '/v1/people?limit=100' : null, parsePersonChoice, refresh);
  const classes = usePaginatedLearningQuery(permitted && admin ? '/v1/classes?limit=100' : null, parseChoice, refresh);
  const learners = developmentLearnerChoices(people.data, t.unknownContext);
  const peopleCurrent = people.loaded && !people.loading && !people.error && !people.nextCursor && !people.moreError;
  const selectedLearner = learners.find(learner => learner.value === learnerId && !learner.requiresReview);
  const activeLearnerId = permitted ? student ? membership.userId : peopleCurrent && selectedLearner ? selectedLearner.value : '' : '';
  const periodChoices = developmentPeriodChoices(periods.data, locale);
  const chosenPeriod = periodChoices.find(choice => choice.value === periodId && !choice.requiresReview);
  const activePeriod = chosenPeriod && periods.loaded && !periods.loading && !periods.error && !periods.moreError ? periods.data.find(period => period.id === periodId) ?? null : null;
  const filter = activeLearnerId && activePeriod ? `&learnerId=${encodeURIComponent(activeLearnerId)}&periodId=${encodeURIComponent(activePeriod.id)}` : '';
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${activeLearnerId}:${activePeriod?.id}:${accessGeneration}:${refresh}`;
  const parseCurrentSummary = useCallback((value: unknown) => {
    const summary = parseSummary(value);
    if (summary.learnerId !== activeLearnerId || summary.periodId !== activePeriod?.id) throw new LearningApiError('invalid');
    return { scope, value: summary };
  }, [scope, activeLearnerId, activePeriod]);
  const summaryRead = useApiQuery(activeLearnerId && activePeriod ? `/v1/development/summary?limit=100${filter}` : null, parseCurrentSummary, refresh);
  const summary = currentDevelopmentSummary(summaryRead.data, scope, activeLearnerId, activePeriod?.id ?? null);
  const parseCurrentLedger = useCallback((value: unknown) => {
    const row = parseLedger(value);
    if (row.learnerId !== activeLearnerId || row.periodId !== activePeriod?.id || row.policyId !== activePeriod.policyId) throw new LearningApiError('invalid');
    return row;
  }, [activeLearnerId, activePeriod]);
  const parseCurrentAchievement = useCallback((value: unknown) => {
    const row = parseAchievement(value);
    if (row.learnerId !== activeLearnerId || row.periodId !== activePeriod?.id || row.policyId !== activePeriod.policyId) throw new LearningApiError('invalid');
    return row;
  }, [activeLearnerId, activePeriod]);
  const ledger = usePaginatedLearningQuery(activeLearnerId && activePeriod ? `/v1/development/ledger?limit=100${filter}` : null, parseCurrentLedger, refresh);
  const achievements = usePaginatedLearningQuery(activeLearnerId && activePeriod ? `/v1/development/achievements?limit=100${filter}` : null, parseCurrentAchievement, refresh);
  const parseCurrentBoard = useCallback((value: unknown) => {
    const board = parseLeaderboard(value);
    if (board.periodId !== activePeriod?.id) throw new LearningApiError('invalid');
    return { scope, value: board };
  }, [scope, activePeriod]);
  const boardRead = useApiQuery(activeLearnerId && activePeriod && summary?.leaderboardEnabled ? `/v1/development/leaderboard?periodId=${encodeURIComponent(activePeriod.id)}` : null, parseCurrentBoard, refresh);
  const board = activePeriod && summary?.leaderboardEnabled ? currentDevelopmentBoard(boardRead.data, scope, activePeriod.id) : null;
  const policyCurrent = policies.loaded && !policies.loading && !policies.nextCursor && !policies.error && !policies.moreError;
  const latestPolicy = policyCurrent ? policies.data.reduce<(typeof policies.data)[number] | null>((latest, value) => !latest || value.version > latest.version ? value : latest, null) : null;
  const periodPolicy = policyCurrent && activePeriod ? policies.data.find(policy => policy.id === activePeriod.policyId) ?? null : null;
  const retainedPeriodCommand = commandJournal.get('/v1/development/leaderboard/participation') || commandJournal.get('/v1/development/periods/backfill');
  const periodLocked = commandLocked || !!retainedPeriodCommand;
  const configurationLocked = commandLocked || !!commandJournal.get('/v1/development/policies') || !!commandJournal.get('/v1/development/periods');
  const learnerNavigationLocked = periodLocked || configurationLocked;
  const staffSelected = !student && !!activeLearnerId && !!selectedLearner;
  const policyFormVisible = admin && configure === 'policy' && policyCurrent;
  const periodFormVisible = admin && configure === 'period' && policies.loaded && !policies.error && !policies.moreError && classes.loaded && !classes.error && !classes.moreError;
  const backfillCommand = commandJournal.get('/v1/development/periods/backfill');
  const participationCommand = commandJournal.get('/v1/development/leaderboard/participation');
  const backfillFormVisible = admin && !!activePeriod && (!backfillCommand || backfillCommand.body.periodId === activePeriod.id);
  const participationFormVisible = student && !!activeLearnerId && !!activePeriod && !!summary && (!participationCommand || participationCommand.body.periodId === activePeriod.id);
  const recoveryCommand = [
    { path: '/v1/development/policies', allowed: admin, visible: policyFormVisible, title: t.approvePolicy },
    { path: '/v1/development/periods', allowed: admin, visible: periodFormVisible, title: t.createPeriod },
    { path: '/v1/development/periods/backfill', allowed: admin, visible: backfillFormVisible, title: t.backfill },
    { path: '/v1/development/leaderboard/participation', allowed: student, visible: participationFormVisible, title: t.participate },
  ].find(owner => owner.allowed && !owner.visible && commandJournal.get(owner.path));
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  const onLockedChange = useCallback((locked: boolean) => setCommandLocked(locked), []);
  const readFailed = [periods, policies, people, classes, ledger, achievements].some(query => !!query.error || !!query.moreError) || !!summaryRead.error || !!boardRead.error;
  useEffect(() => {
    if (readFailed) formDrafts.clearRead(`${membership?.schoolId}:${membership?.userId}:`, '/v1/development/summary');
  }, [readFailed, formDrafts, membership?.schoolId, membership?.userId]);
  useEffect(() => {
    if (!staffSelected || focusSelectedLearner.current !== activeLearnerId) { focusSelectedLearner.current = null; return; }
    const frame = requestAnimationFrame(() => {
      focusSelectedLearner.current = null;
      if (document.activeElement !== document.body && document.activeElement !== learnerPicker.current) return;
      learnerHeading.current?.focus({ preventScroll: true });
      learnerHeading.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [staffSelected, activeLearnerId]);
  useEffect(() => {
    if (!returnToLearners.current || staffSelected) return;
    const frame = requestAnimationFrame(() => {
      returnToLearners.current = false;
      const picker = learnerPicker.current;
      const target = picker?.isConnected && picker.getClientRects().length && !picker.disabled ? picker : contextPanel.current;
      target?.focus({ preventScroll: true });
      if (target && document.activeElement !== target) contextPanel.current?.focus({ preventScroll: true });
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focused?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [staffSelected]);
  function backToLearners() {
    if (learnerNavigationLocked || ['/v1/development/policies', '/v1/development/periods', '/v1/development/periods/backfill', '/v1/development/leaderboard/participation'].some(path => commandJournal.get(path))) return;
    focusSelectedLearner.current = null; returnToLearners.current = true; setLearnerId('');
  }
  function reload() { setRefresh(value => value + 1); }
  function saved() { setConfigure(null); reload(); }
  if (parent) return <><WorkspacePageHeading title={t.development} /><WorkspaceState kind="denied" icon="shieldAlert" description={t.parentDenied}/></>;
  if (!permitted) return <WorkspacePageHeading title={t.development} />;
  const currentRecords = !!activeLearnerId && !!activePeriod && !!summary && summary.status !== 'DISABLED' && !summaryRead.error;
  const periodPrerequisite=developmentPeriodPrerequisite(periodId,periods);
  return <div className={`development-workspace ${student ? 'development-workspace--student' : 'development-workspace--staff'}`} data-staff-selected={staffSelected}>
    <WorkspacePageHeading title={t.development} />
    {recoveryCommand ? <div className="development-command-recovery"><CommandForm key={commandJournal.get(recoveryCommand.path)!.key} title={recoveryCommand.title} path={recoveryCommand.path} fields={[]} body={() => { throw new LearningApiError('conflict', true); }} note={t.originalCommandRecovery} validateReceipt={confirmDevelopmentCommandReceipt} onSaved={recoveryCommand.path === '/v1/development/policies' || recoveryCommand.path === '/v1/development/periods' ? saved : reload} onLockedChange={onLockedChange} /></div> : null}
    {staffSelected ? <header className="development-selected-context"><h2 className="development-selected-heading" ref={learnerHeading} tabIndex={-1}><bdi>{selectedLearner.label}</bdi></h2><Button type="button" variant="quiet" className="development-back-to-learners" disabled={learnerNavigationLocked} onClick={backToLearners}><CuevoIcon name="arrow" size={18} className="directional-icon" />{t.backToLearners}</Button></header> : null}
    <div className="development-context development-panel" ref={contextPanel} tabIndex={-1}>
      <div className="development-selectors">
        {!student ? <div className="field development-learner-picker"><label htmlFor={`${id}-learner`}>{t.learner}</label><select ref={learnerPicker} id={`${id}-learner`} value={learnerId} disabled={periodLocked} onChange={event => { focusSelectedLearner.current = event.target.value || null; setLearnerId(event.target.value); }}><option value="">{t.chooseLearner}</option>{learners.map(learner => <option key={learner.value} value={learner.value} disabled={learner.requiresReview}>{learner.label}</option>)}</select>{people.nextCursor || people.moreError ? <LoadMore query={people} label={t.learner} /> : null}{people.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : !learners.length && !people.error ? <WorkspaceState kind={!people.loaded ? "loading" : people.nextCursor || people.moreError ? "review" : "empty"} icon="people" description={!people.loaded ? t.loading : people.nextCursor || people.moreError ? t.completeLearnerChoices : t.noLearners}/> : null}{people.nextCursor ? <p className="development-meta">{t.completeLearnerChoices}</p> : null}{learners.some(learner => learner.requiresReview) ? <WorkspaceState kind="review" icon="people" description={t.ambiguousLearners}/> : null}</div> : null}
        <div className="field"><label htmlFor={`${id}-period`}>{t.period}</label><select id={`${id}-period`} disabled={periodLocked} value={periodId} onChange={event => setPeriodId(event.target.value)}><option value="">{t.choosePeriod}</option>{periodChoices.map(period => <option key={period.value} value={period.value} disabled={period.requiresReview}>{period.label}</option>)}</select></div>
      </div>
      <Button type="button" variant="quiet" onClick={reload}><CuevoIcon name="refresh" />{t.refresh}</Button>
      {periods.error || people.error ? <LearningError error={(periods.error ?? people.error)!} /> : null}{periods.nextCursor || periods.moreError ? <LoadMore query={periods} label={t.period} /> : null}{periodChoices.some(choice => choice.requiresReview) ? <WorkspaceState kind="review" icon="calendar" description={t.ambiguousPeriods}/> : null}
      {periodId && !activePeriod && periods.loaded && !periods.loading && !periods.error && !periods.moreError ? <WorkspaceState kind="unavailable" icon="calendar" description={t.currentSourceUnavailable}/> : null}
    </div>
    {admin ? <div className="development-configuration">
      <section className="development-panel development-policy" aria-label={t.policies}><header className="cuevo-section-header"><div className="cuevo-section-header__context"><div className="development-subheading"><CuevoIcon name="shield" variant="filled" /><h2>{t.policies}</h2></div><p>{t.policyNote}</p>{latestPolicy ? <p>{t.expectedPolicyVersion}: {number(latestPolicy.version)}</p> : policyCurrent ? <WorkspaceState kind="empty" icon="shield" description={t.noPolicy}/> : null}</div><Button type="button" disabled={!policyCurrent || configurationLocked} onClick={() => setConfigure('policy')}>{t.approvePolicy}</Button></header>
      {latestPolicy ? <DevelopmentPolicyReading policy={latestPolicy} locale={locale} /> : policies.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : null}
      {policyFormVisible ? <CommandForm title={t.approvePolicy} path="/v1/development/policies" note={t.policyNote} fields={[{ name: 'practice', label: t.practice, type: 'number', min: 0, max: 1000, required: true }, { name: 'revision', label: t.revision, type: 'number', min: 0, max: 1000, required: true }, { name: 'reflection', label: t.reflection, type: 'number', min: 0, max: 1000, required: true }, { name: 'milestoneTitle', label: t.milestoneTitle, maxLength: 200 }, { name: 'minimumPoints', label: t.milestonePoints, type: 'number', min: 1, max: 100000 }, { name: 'confirmApproval', label: t.confirm, type: 'checkbox', required: true }]} body={values => ({ expectedVersion: latestPolicy?.version ?? 0, points: Object.fromEntries(['practice', 'revision', 'reflection'].map(key => [key, Number(values.get(key))])), milestones: values.get('milestoneTitle') ? [{ key: 'milestone', title: String(values.get('milestoneTitle')), minimumPoints: Number(values.get('minimumPoints')) }] : [], confirmApproval: values.get('confirmApproval') === 'on' })} validateReceipt={confirmDevelopmentCommandReceipt} onSaved={saved} onCancel={() => setConfigure(null)} onLockedChange={onLockedChange} /> : null}
      {policies.error ? <LearningError error={policies.error} /> : null}{policies.nextCursor || policies.moreError ? <LoadMore query={policies} label={t.policies} /> : null}
      </section>
      <section className="development-panel development-period" aria-label={t.period}><header className="cuevo-section-header"><div className="cuevo-section-header__context"><div className="development-subheading"><CuevoIcon name="calendar" variant="filled" /><h2>{t.period}</h2></div><p>{t.createPeriodNote}</p></div><Button type="button" disabled={configurationLocked || !policies.loaded || !!policies.error || !!policies.moreError || !policies.data.length} onClick={() => setConfigure('period')}>{t.createPeriod}</Button></header>
      {activePeriod ? <div className="development-period-reading"><h3><bdi>{activePeriod.title}</bdi></h3><p><time dateTime={activePeriod.startsAt}><bdi>{date(activePeriod.startsAt)}</bdi></time> – <time dateTime={activePeriod.endsAt}><bdi>{date(activePeriod.endsAt)}</bdi></time> · UTC</p><p>{t.periodPolicyVersion}: {periodPolicy ? number(periodPolicy.version) : t.unknown}</p></div> : periodPrerequisite ? <WorkspaceState kind={periodPrerequisite} icon={periodPrerequisite==='loading'?'refresh':'calendar'} description={periodPrerequisite==='loading'?t.loading:t.selectedPeriodRequired} role={periodPrerequisite==='loading'?'status':undefined}/> : null}
{periodFormVisible ? <CommandForm title={t.createPeriod} path="/v1/development/periods" note={t.createPeriodNote} fields={[{ name: 'classId', label: t.class, type: 'select', required: true, options: classes.data.map(row => ({ value: row.id, label: choiceLabel(row) })) }, { name: 'policyId', label: t.policy, type: 'select', required: true, options: policies.data.map(policy => ({ value: policy.id, label: `${t.policy} · ${number(policy.version)} · ${date(policy.approvedAt)}` })) }, { name: 'title', label: t.title, required: true, maxLength: 200 }, { name: 'startsAt', label: t.startsAt, type: 'datetime-local', required: true }, { name: 'endsAt', label: t.endsAt, type: 'datetime-local', required: true }, { name: 'confirmApproval', label: t.confirm, type: 'checkbox', required: true }]} body={values => ({ classId: String(values.get('classId')), policyId: String(values.get('policyId')), title: String(values.get('title')), startsAt: new Date(String(values.get('startsAt'))).toISOString(), endsAt: new Date(String(values.get('endsAt'))).toISOString(), confirmApproval: values.get('confirmApproval') === 'on' })} validateReceipt={confirmDevelopmentCommandReceipt} onSaved={saved} onCancel={() => setConfigure(null)} onLockedChange={onLockedChange} /> : null}

      {configure === 'period' ? <>{classes.nextCursor || classes.moreError ? <LoadMore query={classes} label={t.class} /> : null}{classes.error ? <LearningError error={classes.error} /> : null}</> : null}

      {backfillFormVisible ? <CommandForm key={`backfill:${activePeriod.id}`} title={t.backfill} path="/v1/development/periods/backfill" note={t.backfillNote} fields={[{ name: 'confirmApproval', label: t.confirm, type: 'checkbox', required: true }]} body={values => ({ periodId: activePeriod.id, confirmApproval: values.get('confirmApproval') === 'on' })} validateReceipt={confirmDevelopmentCommandReceipt} onSaved={reload} onLockedChange={onLockedChange} /> : null}

      </section>
    </div> : null}
    {activeLearnerId ? <LearnerGoals learnerId={activeLearnerId} /> : !student ? <WorkspaceState kind="unknown" icon="person" description={t.selectLearnerRequired}/> : null}
    {activeLearnerId ? <div className="development-journey">
      <div className="development-main">
        <section className="development-panel development-recognition" aria-label={t.personal}>
          <div className="development-heading">{student ? <img className="development-art" src={trailAssets.grow} width="80" height="80" alt="" aria-hidden="true" /> : <CuevoIcon name="development" variant="filled" size={32} />}<div><h2>{t.recordedTitle}</h2><p>{t.recordedBody}</p></div>{summary ? <p className="development-total">{t.points}<strong>{summary.totalPoints === null ? t.unknown : number(summary.totalPoints)}</strong></p> : null}</div>
          {!activePeriod ? !admin && periodPrerequisite ? <WorkspaceState kind={periodPrerequisite} icon={periodPrerequisite==='loading'?'refresh':'calendar'} description={periodPrerequisite==='loading'?t.loading:t.selectedPeriodRequired} role={periodPrerequisite==='loading'?'status':undefined}/> : null : !activeLearnerId ? <WorkspaceState kind="unknown" icon="person" description={t.selectLearnerRequired}/> : summaryRead.loading || !summary && !summaryRead.error ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : summaryRead.error ? <LearningError error={summaryRead.error} /> : summary ? <>{summary.status === 'DISABLED' ? <WorkspaceState kind="unknown" icon="milestones" description={t.disabled}/> : null}<p className="development-meta">{t.recordedOnly}</p><ConsecutiveRecordedDays streak={summary.streak} locale={locale} copy={t} /></> : null}
        </section>
        {currentRecords || ledger.error || ledger.moreError || ledger.nextCursor ? <section className="development-panel development-section" aria-label={t.ledger}>
          <div className="development-subheading"><CuevoIcon name="reflection" /><h2>{t.ledger}</h2></div>
          <DevelopmentRecordReading query={ledger} current={currentRecords} locale={locale} icon="reflection" emptyDescription={t.emptyLedger} label={t.ledger}><ul className="development-ledger">{ledger.data.map(item => <li key={item.id}><article className={`development-ledger__entry development-ledger__entry--${item.kind}`}>
            {student ? <img src={item.kind === 'practice' ? trailAssets.practice : item.kind === 'revision' ? trailAssets.feedback : trailAssets.reflect} width="64" height="64" alt="" aria-hidden="true" /> : <CuevoIcon name={item.kind === 'practice' ? 'practice' : item.kind === 'revision' ? 'feedback' : 'reflection'} variant="filled" size={28} />}
            <div><h3>{item.kind === 'practice' ? t.practiceAction : item.kind === 'revision' ? t.revisionAction : t.reflectionAction}</h3><p className="development-meta"><time dateTime={item.occurredAt}>{date(item.occurredAt)}</time> · UTC</p><details><summary>{t.sourceDetail}</summary><p>{t.sourceExplanation}</p><dl><div><dt>{t.source}</dt><dd><bdi>{item.observationId}</bdi></dd></div></dl></details></div><p className="development-ledger__points"><strong>{number(item.points)}</strong><span>{t.points}</span></p>
          </article></li>)}</ul></DevelopmentRecordReading>
        </section> : null}
      </div>
      <aside className="development-side">
        {student ? <section className="development-panel development-companion" aria-label={t.companion}><div className="development-subheading"><CuevoIcon name="school" variant="filled" /><h2>{t.companion}</h2></div><div className="development-companion__scene"><p>{t.companionBody}</p><CompanionView registry={companionPoses} character="foxi" state="ready" visible={presentation !== 'hidden'} quiet={presentation === 'quiet'} /></div><div className="field"><label htmlFor={`${id}-presentation`}>{t.presentation}</label><select id={`${id}-presentation`} disabled={periodLocked} value={presentation} onChange={event => setPresentation(event.target.value as typeof presentation)}><option value="standard">{t.standard}</option><option value="quiet">{t.quiet}</option><option value="hidden">{t.hidden}</option></select></div></section> : null}
        {currentRecords || achievements.error || achievements.moreError || achievements.nextCursor ? <section className="development-panel development-milestones" aria-label={t.achievements}><div className="development-heading">{student ? <img className="development-art" src={trailAssets.milestone} width="80" height="80" alt="" aria-hidden="true" /> : <CuevoIcon name="milestones" variant="filled" size={32} />}<div><h2>{t.achievements}</h2><p>{t.milestoneBasis}</p></div></div>
          <DevelopmentRecordReading query={achievements} current={currentRecords} locale={locale} icon="milestones" emptyDescription={t.emptyMilestones} label={t.achievements}><ul className="development-milestone-list">{achievements.data.map(item => <li key={item.id}><article><h3 dir="auto">{item.title}</h3><p>{t.threshold}: <strong>{number(item.minimumPoints)}</strong></p><p className="development-meta">{t.earnedOn}: <time dateTime={item.earnedAt}>{date(item.earnedAt)}</time></p></article></li>)}</ul></DevelopmentRecordReading>
        </section> : null}
        {activeLearnerId && activePeriod && summary ? <section className="development-panel development-board" aria-label={t.leaderboard}><div className="development-subheading"><CuevoIcon name="community" variant="filled" /><h2>{t.leaderboard}</h2></div><p>{t.noRanking}</p>
          {participationFormVisible ? <CommandForm key={`participation:${activePeriod.id}`} draftKey={`leaderboard-participation:${activePeriod.id}`} title={t.participate} path="/v1/development/leaderboard/participation" fields={[...(summary.leaderboardEnabled ? [{ name: 'optIn', label: t.optIn, type: 'checkbox' as const, defaultChecked: false }] : []), { name: 'alias', label: t.alias, maxLength: 50 }]} body={values => ({ periodId: activePeriod.id, optIn: summary.leaderboardEnabled && values.get('optIn') === 'on', alias: String(values.get('alias') ?? '') })} validateReceipt={confirmDevelopmentCommandReceipt} onSaved={reload} onLockedChange={onLockedChange} note={summary.leaderboardEnabled ? t.noRanking : t.boardUnavailable} /> : null}
          {boardRead.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : boardRead.error ? <LearningError error={boardRead.error} /> : board ? board.items.length ? <ol className="development-board-list">{board.items.map(item => <li key={`${item.rank}:${item.alias}`}><bdi>{item.alias}</bdi><span>{t.points}: {number(item.points)} · {t.rank}: {number(item.rank)}</span></li>)}</ol> : <WorkspaceState kind="empty" icon="community" description={t.boardEmpty}/> : !summary.leaderboardEnabled && !student ? <WorkspaceState kind="unavailable" icon="community" description={t.boardUnavailable}/> : null}
        </section> : null}
        <section className="development-panel development-about"><div className="development-subheading"><CuevoIcon name="help" /><h2>{t.about}</h2></div><p>{t.recordedOnly}</p></section>
      </aside>
    </div> : null}

  </div>;
}
