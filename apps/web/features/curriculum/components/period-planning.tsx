'use client';
import { IconButton } from '@cuevo/ui';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { parseCourse, parseAssessment, parseChoice } from '../../learning/model';
import { parseReference, academicReferenceChoice, type NativeResult } from '../../academic/model';
import { EvidenceDetail, NativeResultView } from '../../academic/ui';
import { periodPlanningReadScope, currentPeriodPlanningRead, parseCurrentPeriodCoverage, parsePlanningPeriod, periodPlanningChoices, periodPlanningCourseChoices, parsePlanningLessons, validatePeriodPlanningReceipt, parsePeriodPlanningIntent, parsePeriodPlanningSelection, emptyPeriodPlanningIntent, periodPlanningPendingPaths, periodPlanningPath, periodPlanningBody, type PeriodPlanningIntent, type PeriodPlanningEditor } from '../period-planning-model';
import { curriculumAr, curriculumEn } from '../messages';
import { periodPlanningRecovery } from '../period-planning-model';
import { useCurriculumSourceDenial } from '../source-recovery';
import { curriculumPageControlsVisible, curriculumPageConfirmedEmpty } from '../presentation-model';

function usePlanningPage<T extends { id: string }>(path: string | null, parse: (value: unknown) => T, refresh: number) {
  const app = useApp(), scope = periodPlanningReadScope(app, path ?? '', refresh);
  const parser = useCallback((value: unknown) => { const row = parse(value); return { id: row.id, scope, value: row }; }, [parse, scope]);
  const query = usePaginatedLearningQuery(path && scope ? path : null, parser, refresh);
  return { ...query, sourceRead: { path: path ?? '', scope, loading: query.loading || query.loadingMore, ready: query.loaded && !query.loading && !query.loadingMore && !query.error && !query.moreError, error: query.error ?? query.moreError }, data: query.loading || query.error || query.moreError ? [] : query.data.flatMap(row => { const current = currentPeriodPlanningRead(row, scope); return current ? [current] : []; }) };
}

export function PeriodPlanning({ onLockedChange, pageHeading=false }: { onLockedChange?: (locked: boolean) => void;pageHeading?:boolean } = {}) {
  const app = useApp();
  if (!periodPlanningReadScope(app, 'planning', 0)) return null;
  return <CurrentPeriodPlanning key={`${app.apiUrl}:${app.membership!.schoolId}:${app.membership!.userId}:${app.membership!.role}`} onLockedChange={onLockedChange} pageHeading={pageHeading} />;
}

function CurrentPeriodPlanning({ onLockedChange,pageHeading }: { onLockedChange?: (locked: boolean) => void;pageHeading:boolean }) {
  const app = useApp(), { locale, membership, formDrafts } = app, t = locale === 'ar' ? curriculumAr : curriculumEn;
  useSyncExternalStore(app.commandJournal.subscribe,app.commandJournal.getSnapshot,app.commandJournal.getSnapshot);
  const selectionSlot = `${membership!.schoolId}:${membership!.userId}:period-planning-selection`;
  const createRecovery = app.commandJournal.pending().flatMap(command => {
    const course = command.path.match(/^\/v1\/curriculum\/courses\/([^/]+)\/plans$/)?.[1];
    const period = typeof command.body.periodId === 'string' ? command.body.periodId : '';
    return course && periodPlanningRecovery([command], course, period, []) ? [{ courseId: course, periodId: period }] : [];
  });
  const selection = parsePeriodPlanningSelection(formDrafts.model(selectionSlot)) ?? (createRecovery.length === 1 ? createRecovery[0] : null);
  const [courseId, setCourseId] = useState(selection?.courseId ?? ''), [periodId, setPeriodId] = useState(selection?.periodId ?? ''), [locked, setLocked] = useState(false), [refresh, setRefresh] = useState(0);
  const originalCreate=app.commandJournal.get(`/v1/curriculum/courses/${courseId}/plans`),selectionLocked=locked||!!(originalCreate&&periodPlanningRecovery([originalCreate],courseId,periodId,[]));
  const selectionRef = useRef<{ courseId: string; periodId: string; revision: number } | null>(null);
  const courses = usePlanningPage('/v1/courses?limit=100', parseCourse, refresh), periods = usePlanningPage('/v1/school/report-periods?limit=100', parsePlanningPeriod, refresh);
  const classes = usePlanningPage('/v1/classes?limit=100', parseChoice, refresh), subjects = usePlanningPage('/v1/subjects?limit=100', parseChoice, refresh);
  const courseChoices = periodPlanningCourseChoices(courses.data, classes.data, subjects.data), periodChoices = periodPlanningChoices(periods.data);
  const selectedCourse = courses.data.find(row => row.id === courseId && courseChoices.some(choice => choice.value === row.id && !choice.requiresReview));
  const selectedPeriod = periods.data.find(row => row.id === periodId && periodChoices.some(choice => choice.value === row.id && !choice.requiresReview));
  if (selectedCourse && selectedPeriod) selectionRef.current = { courseId, periodId, revision: selectedPeriod.revision };
  const onLocked = useCallback((value: boolean) => { setLocked(value); }, []);
  useEffect(() => () => onLockedChange?.(false), [onLockedChange]);
  useEffect(()=>{onLockedChange?.(selectionLocked);},[selectionLocked,onLockedChange]);
  const queries = [courses, periods, classes, subjects], error = queries.find(query => query.error || query.moreError), loading = queries.some(query => query.loading), ready = queries.every(query => query.loaded && !query.error && !query.moreError);
  const choose = (nextCourse: string, nextPeriod: string) => { if (selectionLocked) return; selectionRef.current = null; formDrafts.saveModel(selectionSlot, { courseId: nextCourse, periodId: nextPeriod }, { workingInput: false }); setCourseId(nextCourse); setPeriodId(nextPeriod); };
  const sameSelection = selectionRef.current?.courseId === courseId && selectionRef.current.periodId === periodId ? selectionRef.current : null;
  const denied = useCurriculumSourceDenial(queries.map(query => query.sourceRead));
  const periodsEmpty=ready&&!loading&&!denied&&curriculumPageConfirmedEmpty(periods);
  return <section className="curriculum-planning" aria-label={t.periodPlanning}>
    <header className="curriculum-planning__heading">{pageHeading?null:<div><CuevoIcon name="calendar" variant="filled" size={28} /><h2>{t.periodPlanning}</h2></div>}
    <div className="curriculum-planning__context-controls">
    <div className="curriculum-planning__selectors">
      <div className="field"><label htmlFor="planning-course">{t.course}</label><select disabled={selectionLocked || loading} id="planning-course" value={selectedCourse ? courseId : ''} onChange={event => choose(event.target.value, periodId)}><option value="">{t.course}</option>{courseChoices.map(course => <option key={course.value} value={course.value} disabled={course.requiresReview}>{course.label}</option>)}</select></div>
      <div className="field"><label htmlFor="planning-period">{t.reportPeriod}</label><select disabled={selectionLocked || loading} id="planning-period" value={selectedPeriod ? periodId : ''} onChange={event => choose(courseId, event.target.value)}><option value="">{t.reportPeriod}</option>{periodChoices.map(period => <option key={period.value} value={period.value} disabled={period.requiresReview}>{period.label}</option>)}</select></div>
    </div><IconButton icon="refresh" label={t.refresh} type="button" onClick={() => setRefresh(value => value + 1)} /></div></header>
    {error ? <LearningError error={(error.error ?? error.moreError)!} /> : loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : null}
    {courseChoices.some(choice => choice.requiresReview) || periodChoices.some(choice => choice.requiresReview) ? <WorkspaceState kind="review" icon="help" description={t.planningChoiceReview}/> : null}
    {queries.some(curriculumPageControlsVisible) ? <fieldset className="curriculum-planning__pagination" disabled={selectionLocked}>{queries.map((query, index) => curriculumPageControlsVisible(query) ? <LoadMore key={index} query={query} label={[t.course, t.reportPeriod, t.class, t.subject][index]} /> : null)}</fieldset> : null}
    {periodsEmpty?<WorkspaceState kind="empty" icon="calendar" description={t.planningNoPeriods} role="status"/>:sameSelection && !denied ? <PlanningCourse key={`${courseId}:${periodId}`} courseId={courseId} periodId={periodId} periodRevision={sameSelection.revision} choicesReady={!!selectedCourse && !!selectedPeriod && ready} selectionRefresh={refresh} onLockedChange={onLocked} pageHeading={pageHeading} /> : !error&&!loading?<WorkspaceState kind={courseId || periodId?'unavailable':'review'} icon="calendar" description={courseId || periodId ? t.planningContextUnavailable : t.planningChooseContext} role="status"/>:null}
  </section>;
}

function PlanningCourse({ courseId, periodId, periodRevision, choicesReady, selectionRefresh, onLockedChange,pageHeading }: { courseId: string; periodId: string; periodRevision: number; choicesReady: boolean; selectionRefresh: number; onLockedChange: (locked: boolean) => void;pageHeading:boolean }) {
  const app = useApp(), { locale, membership, commandJournal, formDrafts } = app, t = locale === 'ar' ? curriculumAr : curriculumEn;
  const inputSlot = `${membership!.schoolId}:${membership!.userId}:/v1/curriculum/courses/${courseId}/plans:period:${periodId}:intent`;
  const [intent, setIntent] = useState<PeriodPlanningIntent>(() => {
    const saved = parsePeriodPlanningIntent(formDrafts.model(inputSlot));
    const recovered = periodPlanningRecovery(commandJournal.pending(), courseId, periodId, []);
    return saved ?? { ...emptyPeriodPlanningIntent(), editor: recovered?.editor ?? null };
  });
  const [locked, setLocked] = useState(false), [refresh, setRefresh] = useState(0), [evidenceId, setEvidenceId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), editorRef = useRef<HTMLElement>(null), focusEditor = useRef(false), focusHeading = useRef(false), inputFocus = useRef<{ element: HTMLElement; name: string | null } | null>(null);
  const SourceHeading=pageHeading?'h2':'h3';
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const editor = intent.editor, path = editor ? periodPlanningPath(courseId, editor) : null, retained = path ? commandJournal.get(path) : undefined;
  const pending = locked || periodPlanningPendingPaths(courseId, editor).some(slot => !!commandJournal.get(slot));
  const canPlan = membership!.role === 'teacher' || membership!.role === 'admin';
  const updateIntent = (patch: Partial<PeriodPlanningIntent>) => { const next = { ...intent, ...patch }; formDrafts.saveModel(inputSlot, next, { workingInput: next.editor !== null }); setIntent(next); };
  const readRevision = refresh + selectionRefresh;
  const coveragePath = `/v1/curriculum/courses/${courseId}/coverage?periodId=${periodId}&limit=25${intent.cursor ? `&cursor=${intent.cursor}` : ''}`, coverageScope = periodPlanningReadScope(app, coveragePath, readRevision);
  const coverageParser = useCallback((value: unknown) => ({ scope: coverageScope, value: parseCurrentPeriodCoverage(value, courseId, periodId, periodRevision, intent.cursor) }), [coverageScope, courseId, periodId, periodRevision, intent.cursor]);
  const coverageQuery = useApiQuery(choicesReady && coverageScope ? coveragePath : null, coverageParser, readRevision), coverage = !choicesReady || coverageQuery.loading || coverageQuery.error ? null : currentPeriodPlanningRead(coverageQuery.data, coverageScope);
  useEffect(() => {
    if (editor || !coverage || !canPlan) return;
    const recovery = periodPlanningRecovery(commandJournal.pending(), courseId, periodId, coverage.items);
    if (recovery) {
      const recovered = { ...emptyPeriodPlanningIntent(), cursor: intent.cursor, editor: recovery.editor };
      formDrafts.saveModel(inputSlot, recovered, { workingInput: recovered.editor !== null }); setIntent(recovered);
    }
  }, [editor,coverage,canPlan,commandJournal,courseId,periodId,formDrafts,inputSlot,intent.cursor]);
  const references = usePlanningPage(choicesReady && canPlan && editor?.kind === 'create' ? `/v1/courses/${courseId}/academic-references?limit=100` : null, parseReference, readRevision);
  const assessments = usePlanningPage(choicesReady && canPlan && editor?.kind === 'assessment' ? '/v1/assessments?limit=100' : null, parseAssessment, readRevision);
  const lessonPath = `/v1/courses/${courseId}?limit=10${intent.unitId ? `&unitId=${intent.unitId}` : ''}${intent.unitCursor ? `&unitCursor=${intent.unitCursor}` : ''}${intent.lessonCursor ? `&lessonCursor=${intent.lessonCursor}` : ''}`, lessonScope = periodPlanningReadScope(app, lessonPath, readRevision);
  const lessonParser = useCallback((value: unknown) => ({ scope: lessonScope, value: parsePlanningLessons(value, courseId, intent.unitId) }), [lessonScope, courseId, intent.unitId]);
  const lessonQuery = useApiQuery(choicesReady && canPlan && editor?.kind === 'taught' && lessonScope ? lessonPath : null, lessonParser, readRevision), lessons = !choicesReady || lessonQuery.loading || lessonQuery.error ? null : currentPeriodPlanningRead(lessonQuery.data, lessonScope);
  const availableLessons = lessons?.units.find(unit => unit.id === lessons.selectedUnitId)?.lessons ?? [];
  const referenceChoices = references.data.filter(reference => reference.status === 'APPROVED').map(reference => ({ value: reference.id, label: academicReferenceChoice(reference,locale) }));
  const availableAssessments = editor?.kind === 'assessment' ? assessments.data.filter(task => task.courseId === courseId && task.status === 'PUBLISHED' && task.referenceId === editor.referenceId) : [];
  const assessmentChoices = availableAssessments.map(task => ({ value: task.id, label: `${task.title}${task.dueAt ? ` · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(task.dueAt))}` : ''}` }));
  const safe = (rows: { value: string; label: string }[]) => rows.filter(row => rows.filter(other => other.label === row.label).length === 1);
  const safeReferences = safe(referenceChoices), safeAssessments = safe(assessmentChoices), safeLessons = safe(availableLessons.map(lesson => ({ value: lesson.id, label: `${lesson.title} · ${new Intl.NumberFormat(locale).format(lesson.sequence)}` })));
  const onLocked = useCallback((value: boolean) => setLocked(value), []);
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const observer = new window.MutationObserver(() => {
      const previous = inputFocus.current;
      if (!previous || previous.element.isConnected || document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
      const replacement = Array.from(root.querySelectorAll<HTMLElement>('input,select,textarea')).find(element => element.getAttribute('name') === previous.name);
      if (replacement && !replacement.matches(':disabled')) { replacement.focus({ preventScroll: true }); inputFocus.current = { element: replacement, name: previous.name }; }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editor?.kind]);
  useEffect(() => { onLockedChange(pending); return () => onLockedChange(false); }, [pending, onLockedChange]);
  useEffect(() => { if (focusEditor.current && editorRef.current) { focusEditor.current = false; editorRef.current.focus({ preventScroll: true }); } if (focusHeading.current && heading.current) { focusHeading.current = false; heading.current.focus({ preventScroll: true }); } }, [editor]);
  const close = () => { if (pending) return; formDrafts.remove(inputSlot); setIntent(emptyPeriodPlanningIntent()); inputFocus.current = null; focusHeading.current = true; };
  const saved = () => { formDrafts.remove(inputSlot); setIntent(emptyPeriodPlanningIntent()); setEvidenceId(null); setRefresh(value => value + 1); focusHeading.current = true; };
  const choose = (next: PeriodPlanningEditor) => { if (pending) return; updateIntent({ ...emptyPeriodPlanningIntent(), cursor: intent.cursor, editor: next }); focusEditor.current = true; };
  const sourceErrors = [coverageQuery.error, references.error, references.moreError, assessments.error, assessments.moreError, lessonQuery.error];
  const error = sourceErrors.find(error => error?.kind === 'denied' || error?.kind === 'unauthorized') ?? sourceErrors.find(Boolean);
  const sourceLoading = coverageQuery.loading || editor?.kind === 'create' && references.loading || editor?.kind === 'assessment' && assessments.loading || editor?.kind === 'taught' && lessonQuery.loading;
  const title = editor?.kind === 'replan' ? t.replanObjective : editor?.kind === 'taught' ? t.recordTaught : editor?.kind === 'assessment' ? t.includeAssessment : t.planObjective;
  let fields: FormField[] = [];
  if (editor?.kind === 'create') fields = [{ name: 'referenceId', label: t.reference, type: 'select', required: true, options: safeReferences }, { name: 'reason', label: t.planningReason, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmPlanning', label: t.confirmPlanning, type: 'checkbox', required: true }];
  if (editor?.kind === 'replan') fields = [{ name: 'reason', label: t.replanningReason, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmPlanning', label: t.confirmReplanning, type: 'checkbox', required: true }];
  if (editor?.kind === 'taught') fields = [{ name: 'lessonId', label: t.taughtLesson, type: 'select', required: true, options: safeLessons }, { name: 'taughtOn', label: t.taughtDate, type: 'date', required: true }, { name: 'note', label: t.teachingNote, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmTeaching', label: t.confirmTeaching, type: 'checkbox', required: true }];
  if (editor?.kind === 'assessment') fields = [{ name: 'reason', label: t.inclusionReason, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmInclusion', label: t.confirmInclusion, type: 'checkbox', required: true }];
  const draftKey = path ? `${path}:period:${periodId}${editor?.kind === 'taught' ? `:unit:${lessons?.selectedUnitId ?? intent.unitId ?? 'unavailable'}:page:${intent.lessonCursor ?? 'first'}` : editor?.kind === 'assessment' ? `:task:${intent.assessmentId ?? 'unselected'}:policy:${intent.assessmentVersion ?? 'unavailable'}` : ''}` : '';
  const body = (values: FormData) => {
    if (!editor) throw new LearningApiError('conflict');
    if (editor.kind === 'create' && String(values.get('referenceId')) === intent.referenceId && references.data.find(reference => reference.id === intent.referenceId)?.version !== intent.referenceVersion) throw new LearningApiError('conflict');
    const input = editor.kind === 'taught' ? { lessonId: String(values.get('lessonId')), taughtOn: String(values.get('taughtOn')), note: String(values.get('note')), confirmTeaching: values.get('confirmTeaching') === 'on' } : editor.kind === 'assessment' ? { assessmentId: intent.assessmentId, expectedPolicyVersion: intent.assessmentVersion, reason: String(values.get('reason')), confirmInclusion: values.get('confirmInclusion') === 'on' } : { ...(editor.kind === 'create' ? { referenceId: String(values.get('referenceId')) } : {}), reason: String(values.get('reason')), confirmPlanning: values.get('confirmPlanning') === 'on' };
    return periodPlanningBody(editor, coverage, input, { references: references.data, lessons: availableLessons, assessments: availableAssessments }, new Date().toISOString().slice(0, 10));
  };
  const denied = useCurriculumSourceDenial([
    { path: coveragePath, scope: coverageScope, loading: coverageQuery.loading, ready: !!coverage, error: coverageQuery.error },
    references.sourceRead, assessments.sourceRead,
    { path: editor?.kind === 'taught' ? lessonPath : '', scope: lessonScope, loading: lessonQuery.loading, ready: !!lessons, error: lessonQuery.error },
  ]);
  const formReady = !denied && !!editor && (retained || coverage && !error && !sourceLoading && (editor.kind !== 'assessment' || !!intent.assessmentId));
  const currentEvidence = evidenceId && coverage?.items.flatMap(plan => plan.evidence).some(record => record.id === evidenceId);
  return <section className="curriculum-planning__layout">
    <header className="curriculum-planning__heading"><SourceHeading className="curriculum-planning__source-title" ref={heading} tabIndex={-1}>{coverage?.periodName??t.reportPeriod}</SourceHeading><IconButton icon="refresh" label={t.refresh} type="button" onClick={() => setRefresh(value => value + 1)} /></header>
    {error ? <LearningError error={error} /> : coverageQuery.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : !coverage ? <WorkspaceState kind="unavailable" icon="help" description={t.planningContextUnavailable}/> : null}
    {coverage && !denied ? <>
      <section className="curriculum-planning__context"><h3><bdi>{coverage.courseTitle} · {coverage.className}</bdi></h3><p><bdi>{coverage.periodName} · {coverage.startsOn}–{coverage.endsOn}</bdi></p><p className="notice">{t.coverageLimit}</p><p>{t.plannedObjectives}: {coverage.plannedTotal === null ? t.unknown : new Intl.NumberFormat(locale).format(coverage.plannedTotal)} · {t.currentLearners}: {new Intl.NumberFormat(locale).format(coverage.learnerTotal)}</p>{coverage.planStatus === 'REQUIRES_REVIEW' ? <WorkspaceState kind="review" icon="calendar" description={t.periodChanged}/> : null}{canPlan && coverage.planStatus !== 'REQUIRES_REVIEW' ? <Button type="button" disabled={pending || !!editor} onClick={() => choose({ kind: 'create', periodRevision: coverage.periodRevision })}>{t.planObjective}</Button> : null}</section>
      <div className="curriculum-planning__plans">{coverage.items.length ? coverage.items.map(plan => <article className="curriculum-record curriculum-planning__plan" key={plan.id}>
        <header><h3><bdi>{plan.referenceTitle}</bdi></h3><Status tone={plan.sourceStatus === 'CURRENT' ? 'positive' : 'warning'}>{plan.sourceStatus === 'CURRENT' ? t.declaredPlan : t.requiresReview}</Status></header><p dir="auto">{plan.referenceDescription}</p><p dir="auto">{plan.reason}</p>
        <dl className="academic-facts curriculum-planning__facts"><div><dt>{t.recordedTeaching}</dt><dd>{new Intl.NumberFormat(locale).format(plan.taughtCount)}</dd></div><div><dt>{t.includedAssessments}</dt><dd>{new Intl.NumberFormat(locale).format(plan.assessmentCount)}</dd></div><div><dt>{t.learnersWithEvidence}</dt><dd>{new Intl.NumberFormat(locale).format(plan.evidenceLearnerCount)} / {new Intl.NumberFormat(locale).format(coverage.learnerTotal)}</dd></div></dl>
        <details className="curriculum-planning__sources"><summary>{t.planningRecords}</summary>{!plan.taught.length?<WorkspaceState kind={plan.taughtCount>0?"unknown":"empty"} icon="learning" description={plan.taughtCount>0?t.moreRecordedSources:t.planTeachingEmpty}/>:plan.taught.map(record => <section key={record.id}><h4><bdi>{record.lessonTitle}</bdi></h4><p><bdi>{record.taughtOn}</bdi></p><p dir="auto">{record.note}</p></section>)}{!plan.assessments.length?<WorkspaceState kind={plan.assessmentCount>0?"unknown":"empty"} icon="assessment" description={plan.assessmentCount>0?t.moreRecordedSources:t.planAssessmentsEmpty}/>:plan.assessments.map(task => <p key={task.id}><bdi>{task.title}</bdi></p>)}{!plan.evidence.length?<WorkspaceState kind={plan.evidenceCount>0?"unknown":"empty"} icon="assessment" description={plan.evidenceCount>0?t.moreRecordedSources:t.planEvidenceEmpty}/>:plan.evidence.map(record => <section key={record.id}><h4><bdi>{record.learnerName}</bdi></h4><NativeResultView result={record.nativeResult as NativeResult} /><Button type="button" variant="quiet" disabled={pending} onClick={() => setEvidenceId(record.id)}>{t.coverageEvidence}</Button></section>)}{plan.taught.length>0&&plan.taughtCount > plan.taught.length || plan.assessments.length>0&&plan.assessmentCount > plan.assessments.length || plan.evidence.length>0&&plan.evidenceCount > plan.evidence.length ? <WorkspaceState kind="unknown" icon="curriculum" description={t.moreRecordedSources}/> : null}</details>
        {canPlan ? <div className="learning-actions curriculum-planning__actions">{plan.sourceStatus === 'REQUIRES_REVIEW' ? <Button type="button" variant="secondary" disabled={pending || !!editor} onClick={() => choose({ kind: 'replan', planId: plan.id, referenceId: plan.referenceId, periodRevision: coverage.periodRevision, planRevision: plan.periodRevision })}>{t.replanObjective}</Button> : <><Button type="button" variant="secondary" disabled={pending || !!editor} onClick={() => choose({ kind: 'taught', planId: plan.id, referenceId: plan.referenceId, periodRevision: plan.periodRevision })}>{t.recordTaught}</Button><Button type="button" variant="secondary" disabled={pending || !!editor} onClick={() => choose({ kind: 'assessment', planId: plan.id, referenceId: plan.referenceId, periodRevision: plan.periodRevision })}>{t.includeAssessment}</Button></>}</div> : null}
      </article>) : <WorkspaceState kind={coverage.nextCursor?'unknown':'empty'} icon="curriculum" description={coverage.nextCursor?t.nextPlans:t.planningNoObjectives}/>}</div>
    </> : null}
    {editor && canPlan && !denied ? <section className="curriculum-planning__editor" ref={editorRef} tabIndex={-1} aria-label={title} onFocusCapture={event => { const target = event.target as HTMLElement; if (target.matches('input,select,textarea')) inputFocus.current = { element: target, name: target.getAttribute('name') }; }}>
      {retained ? <p className="notice">{t.planningRetry}</p> : editor.periodRevision !== coverage?.periodRevision ? <WorkspaceState kind="review" icon="help" description={t.planningSourceChanged}/> : null}
      {sourceLoading && !retained ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : null}
      {editor.kind === 'taught' && lessons ? <><div className="field"><label htmlFor="planning-unit">{t.lessonUnit}</label><select disabled={pending} id="planning-unit" value={lessons.selectedUnitId ?? ''} onChange={event => updateIntent({ unitId: event.target.value, lessonCursor: null })}>{lessons.units.map(unit => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></div>{!availableLessons.length ? <WorkspaceState kind="review" icon="learning" description={t.planningNoLessons}/> : null}</> : null}
      {editor.kind === 'assessment' ? <><div className="field"><label htmlFor="planning-assessment">{t.includedAssessment}</label><select disabled={pending || assessments.loading} id="planning-assessment" value={safeAssessments.some(choice => choice.value === intent.assessmentId) ? intent.assessmentId ?? '' : ''} onChange={event => updateIntent({ assessmentId: event.target.value || null, assessmentVersion: availableAssessments.find(task => task.id === event.target.value)?.policyVersion ?? null })}><option value="">{t.includedAssessment}</option>{safeAssessments.map(task => <option key={task.value} value={task.value}>{task.label}</option>)}</select></div>{!assessments.loading && !safeAssessments.length ? <WorkspaceState kind="review" icon="assessment" description={t.planningNoAssessments}/> : null}</> : null}
      {editor.kind === 'create' && !references.loading && !safeReferences.length ? <WorkspaceState kind="review" icon="curriculum" description={t.planningNoReferences}/> : null}
      {formReady && path ? <CommandForm key={draftKey} title={title} asRegion={false} path={path} draftKey={draftKey} fields={fields} body={body} validateReceipt={(receipt, original) => validatePeriodPlanningReceipt(receipt, original, courseId, editor)} onLockedChange={onLocked} onSaved={saved} onCancel={close} onValuesChange={editor.kind === 'create' ? values => { const reference = references.data.find(row => row.id === values.get('referenceId')); if (reference && reference.id !== intent.referenceId) updateIntent({ referenceId: reference.id, referenceVersion: reference.version }); } : undefined} note={editor.kind === 'replan' ? t.replanNote : editor.kind === 'taught' ? `${t.teacherRecordedNote} ${t.planningDateLimit}` : undefined} /> : !pending ? <Button type="button" variant="quiet" onClick={close}>{t.planningCancel}</Button> : null}
      <fieldset disabled={pending} className="curriculum-planning__pagination">{editor.kind === 'create' ? <LoadMore query={references} label={t.reference} /> : editor.kind === 'assessment' ? <LoadMore query={assessments} label={t.includedAssessment} /> : editor.kind === 'taught' ? <div className="learning-actions">{lessons?.nextUnitCursor ? <Button type="button" variant="quiet" onClick={() => updateIntent({ unitCursor: lessons.nextUnitCursor ?? null, unitId: null, lessonCursor: null })}>{t.nextUnits}</Button> : null}{lessons?.nextLessonCursor ? <Button type="button" variant="quiet" onClick={() => updateIntent({ lessonCursor: lessons.nextLessonCursor ?? null })}>{t.nextLessons}</Button> : null}</div> : null}</fieldset>
    </section> : null}
    {coverage && !denied ? <div className="learning-actions curriculum-planning__pagination">{intent.cursor ? <Button type="button" variant="quiet" disabled={pending || !!editor} onClick={() => updateIntent({ cursor: null })}>{t.firstPlans}</Button> : null}{coverage.nextCursor ? <Button type="button" variant="quiet" disabled={pending || !!editor} onClick={() => updateIntent({ cursor: coverage.nextCursor })}>{t.nextPlans}</Button> : null}</div> : null}
    {currentEvidence && evidenceId && !denied ? <EvidenceDetail key={`${coverageScope}:${evidenceId}`} evidenceId={evidenceId} /> : null}
  </section>;
}
