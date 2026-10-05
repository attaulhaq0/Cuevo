'use client';
import { WorkspaceState } from '@cuevo/ui';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { assessmentSubmissionContext, assessmentWorkAvailable, assessmentWorkPresentation, currentLearningSelection, learningTitle, learningNavigationLocked, parseAssessment, parseLifecycleAvailability, type Assessment, type Submission } from '../model';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { useLearningApi } from '../api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearnerSubmission, TeacherSubmissionActions } from './submission-lifecycle';
import { QuizWorkspace } from './quiz';
import { LearningResources } from './resources';
import { SubmissionDocuments, SubmittedDocumentWork } from './submission-documents';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { AssessmentPreparation } from './assessment-preparation';
import { TaskLearningSupport } from '../../school/ui';
import { trailAssets } from '../../../shared/characters/assets';
import { StaffAssessmentDirectory, StaffSubmissionDirectory } from './staff-navigation';
import { LoadMore } from '../../../shared/components/load-more';
import { ThinkingFocusSummary, ThinkingFocusEditor, AssessmentCriterionThinkingFocus } from './thinking-focus';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AssessmentList({ assessments, submissions, submissionsComplete, onSubmitted, initiallySelectedId, compactLinked = false, pageHeading = false, sourceComplete = false }: { assessments: Assessment[]; submissions: Submission[]; submissionsComplete: boolean; onSubmitted: () => void; initiallySelectedId?: string; compactLinked?: boolean; pageHeading?: boolean;sourceComplete?:boolean }) {
  const { t } = useLearningApi();
  const { membership, locale, formDrafts, accessGeneration, online, status } = useApp();
  const { journal } = useApi();
  useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const [configureId, setConfigureId] = useState<string | null>(() => assessments.find(item => journal.get(`/v1/assessments/${item.id}/availability`) || formDrafts.get(`${membership?.schoolId}:${membership?.userId}:/v1/assessments/${item.id}/availability`))?.id ?? null);
  const availabilityPath = assessments.length ? `/v1/curriculum/learning-availability?courseIds=${[...new Set(assessments.map(item => item.courseId))].join(',')}` : null;
  const availabilityScope = `${membership?.schoolId}:${membership?.userId}:${accessGeneration}:${online}:${status}:${availabilityPath}`;
  const parseCurrentAvailability = useCallback((value: unknown) => ({ scope: availabilityScope, availability: parseLifecycleAvailability(value) }), [availabilityScope]);
  const availabilityRead = useApiQuery(availabilityPath, parseCurrentAvailability, 0);
  const availability = { ...availabilityRead, data: availabilityRead.data?.scope === availabilityScope ? availabilityRead.data.availability : null };
  const selectedSlot = `${membership?.schoolId}:${membership?.userId}:selected-assessment-detail`;
  const documentSlot = `${membership?.schoolId}:${membership?.userId}:selected-document-assessment`;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => initiallySelectedId ?? journal.pending().map(command => command.path.match(/^\/v1\/assessments\/([^/]+)\//)?.[1]).find(id => assessments.some(item => item.id === id)) ?? assessments.find(item=>formDrafts.first(`${membership?.schoolId}:${membership?.userId}:/v1/assessments/${item.id}/`))?.id ?? formDrafts.model<string>(selectedSlot) ?? formDrafts.model<string>(documentSlot) ?? null);
  const [documentAssessmentId, setDocumentAssessmentId] = useState<string | null>(() => formDrafts.model<string>(documentSlot) ?? null);
  const taskRoot=useRef<HTMLDivElement>(null),taskOpener=useRef<HTMLElement|null>(null),returnToTasks=useRef(false),taskBrowseId=useRef<string|null>(null);
  useEffect(()=>{if(!returnToTasks.current||selectedTaskId)return;const frame=requestAnimationFrame(()=>{returnToTasks.current=false;const target=taskOpener.current?.isConnected&&taskOpener.current.matches('button,a,input,select,textarea,[tabindex]')&&!taskOpener.current.matches(':disabled')?taskOpener.current:taskRoot.current?.querySelector<HTMLElement>(`[data-assessment-choice="${taskBrowseId.current}"] button`)??taskRoot.current?.querySelector<HTMLElement>('.learning-staff-directory h2');target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',behavior:'instant'});});return()=>cancelAnimationFrame(frame);},[selectedTaskId]);
  const student = membership?.role === 'student';
  const author = membership?.role === 'teacher' || membership?.role === 'admin';
  const readOnly = membership?.role === 'coordinator' || membership?.role === 'parent';
  if (!assessments.length) return <WorkspaceState kind={sourceComplete?'empty':'unknown'} icon="learning" description={sourceComplete?t.noAssessments:t.courseChoicesLoading}/>;
  if (availability.error) return <LearningError error={availability.error} />;
  if (availability.loading || !availability.data) return <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>;
  if ((author || readOnly) && !initiallySelectedId) {
    const selected = currentLearningSelection(assessments, selectedTaskId);
    const locked = learningNavigationLocked(journal.pending());
    return <div ref={taskRoot} className="learning-staff-workspace" data-selected={!!selected}><StaffAssessmentDirectory assessments={assessments} selectedId={selected?.id ?? null} disabled={locked} onSelect={id => { if (learningNavigationLocked(journal.pending())) return; taskOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;taskBrowseId.current=id;setSelectedTaskId(id); formDrafts.saveModel(selectedSlot,id); }}/>{selected ? <div className="learning-staff-selected"><><Button type="button" variant="quiet" disabled={locked} onClick={() => { if(learningNavigationLocked(journal.pending()))return;returnToTasks.current=true;setSelectedTaskId(null); formDrafts.remove(selectedSlot); }}>{t.closeTask}</Button><SelectedStaffAssessment key={`${membership?.schoolId}:${membership?.userId}:${selected.id}`} assessmentId={selected.id} onChanged={onSubmitted}/></></div> : null}</div>;
  }
  return <div className={`assessment-list${student ? ' assessment-list--student' : ''}${initiallySelectedId ? ' assessment-list--exact' : ''}`}>
    {!pageHeading && student && !initiallySelectedId ? <header className="assessment-path-heading"><div><p className="eyebrow">{t.assessments}</p><h2>{t.assessmentPath}</h2><p>{t.assessmentPathBody}</p></div><img src={trailAssets.work} alt="" width={96} height={96} /></header> : !pageHeading && !student && !initiallySelectedId ? <h2>{t.assessments}</h2> : null}
    {assessments.map(assessment => {
      const { submission, known: sourceKnown, mismatch: sourceMismatch } = assessmentSubmissionContext(assessment, submissions, submissionsComplete, membership?.userId);
      const presentation = assessmentWorkPresentation(assessment, submission);
      const stageHeading = { quiz: t.quizStage, revise: t.reviseStage, submitted: t.submittedStage, write: t.workStage }[presentation.stage];
      const stageBody = { quiz: t.quizStageBody, revise: t.reviseStageBody, submitted: t.submittedStageBody, write: t.workStageBody }[presentation.stage];
      const responseLabel = { quiz: t.quizQuestions, file: t.fileTask, text: t.textTask }[presentation.response];
      const detailOpen = !student || selectedTaskId === assessment.id;
      const available = assessmentWorkAvailable(assessment, Date.now());
      const textCommandLocked = !!journal.get(`/v1/assessments/${assessment.id}/draft`) || !!journal.get(`/v1/assessments/${assessment.id}/submissions`) || !!submission && !!journal.get(`/v1/submissions/${submission.id}/resubmit`);
      const title = learningTitle(assessment.title, t.assessmentUnavailable);
      const courseTitle = learningTitle(assessment.courseTitle ?? '', t.courseUnavailable);
      const instructions = learningTitle(assessment.instructions, t.taskInstructionsUnavailable);
      const ContextHeading=initiallySelectedId || pageHeading ? 'h3' : 'h4';
      const workKey = `${membership?.schoolId}:${membership?.userId}:${assessment.id}`;
      const closed = assessment.assignmentState === 'CLOSED';
      if (availability.data?.items.some(course => course.id === assessment.courseId)) return <article className="assessment-section" data-assessment-id={assessment.id} key={assessment.id}>{initiallySelectedId || pageHeading ? <h2 tabIndex={-1}>{title}</h2> : <h3 tabIndex={-1}>{title}</h3>}<WorkspaceState kind="unavailable" icon="learning" description={t.retiredCourseNote}/><p className="lesson-content" dir="auto">{instructions}</p></article>;
      if (assessment.status === 'DRAFT') return author ? <article className="assessment-section" data-assessment-id={assessment.id} key={assessment.id}><div className="learning-section-heading"><h2 tabIndex={-1}>{title}</h2><Status>{t.draftStage}</Status></div><p className="learning-form__note"><bdi>{courseTitle}</bdi></p><AssessmentPreparation assessment={assessment} onChanged={onSubmitted} />{assessment.intendedSubmissionKind === 'QUIZ' ? <QuizWorkspace assessment={assessment} author onChanged={onSubmitted} /> : null}<LearningResources courseId={assessment.courseId} targetKind="assessment" targetId={assessment.id} canManage labelContext={title}/></article> : null;
      if (student && sourceMismatch) return <article className="assessment-section" data-assessment-id={assessment.id} key={assessment.id}>{initiallySelectedId || pageHeading ? <h2 tabIndex={-1}>{title}</h2> : <h3 tabIndex={-1}>{title}</h3>}<LearningError error={new LearningApiError('invalid')} /></article>;
      return <article className={`assessment-section${detailOpen ? ' assessment-section--open' : ''}`} data-assessment-id={assessment.id} key={assessment.id}>
        <header className="assessment-task-heading">
          {student ? <img src={trailAssets.work} alt="" width={64} height={64} /> : <CuevoIcon name="assessment" variant="filled" size={28} />}
          <div><p className="eyebrow">{student ? courseTitle : t.assessments}</p>{initiallySelectedId || pageHeading ? <h2 tabIndex={-1}>{title}</h2> : <h3 tabIndex={-1}>{title}</h3>}<Status tone="neutral">{closed ? t.closed : t.published}</Status></div>
          {student ? <Button type="button" variant="secondary" aria-expanded={detailOpen} onClick={() => { const next = detailOpen ? null : assessment.id; setSelectedTaskId(next); if (next) formDrafts.saveModel(selectedSlot, next); else formDrafts.remove(selectedSlot); }}><CuevoIcon name={detailOpen ? 'close' : 'arrow'} size={18} />{detailOpen ? t.closeTask : t.openTask}</Button> : null}
        </header>
        {!detailOpen ? <div className="assessment-task-summary"><p className="lesson-content" dir="auto">{instructions}</p><dl className="assessment-metadata"><div><dt>{t.taskType}</dt><dd>{responseLabel}</dd></div><div><dt>{assessment.model === 'numeric' ? t.maxScore : t.assessmentModel}</dt><dd>{assessment.model === 'numeric' ? new Intl.NumberFormat(locale).format(assessment.maxScore) : t.rubricModel}</dd></div>{assessment.dueAt ? <div><dt>{t.dueAt}</dt><dd><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assessment.dueAt))}</bdi></dd></div> : null}</dl>{submission ? <Status>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.submitted}</Status> : <p className="learning-form__note">{sourceKnown ? t.notSubmitted : t.submissionUnknown}</p>}</div> : null}
        {detailOpen ? <section className={student ? 'assessment-task-layout' : 'assessment-staff-detail'} aria-label={student ? t.taskDetails : undefined}>
          <div className="assessment-task-main">
            {student ? compactLinked?<details className="assessment-stage-context"><summary>{stageHeading}</summary><p>{stageBody}</p></details>:<div className="assessment-stage-heading"><p className="eyebrow">{t.selectedTask}</p>{initiallySelectedId || pageHeading ? <h3>{stageHeading}</h3> : <h4>{stageHeading}</h4>}<p>{stageBody}</p></div> : null}
            {compactLinked?<details className="assessment-instruction-disclosure" open><summary><h3>{t.instructions}</h3></summary><p className="lesson-content" dir="auto">{instructions}</p></details>:<section className="assessment-instructions" aria-label={t.instructions}>{author || pageHeading || initiallySelectedId ? <h3><CuevoIcon name="assessment" variant="filled" size={22} />{t.instructions}</h3> : <h4><CuevoIcon name="assessment" variant="filled" size={22} />{t.instructions}</h4>}<p className="lesson-content" dir="auto">{instructions}</p></section>}
            <ThinkingFocusSummary value={assessment.thinkingFocus} locale={locale}/>{author ? <ThinkingFocusEditor kind="assessment" id={assessment.id} courseId={assessment.courseId} onChanged={onSubmitted}/> : null}{author && assessment.model === 'rubric' ? <AssessmentCriterionThinkingFocus assessment={assessment} onChanged={onSubmitted}/> : null}{author ? <><Button type="button" variant="quiet" aria-expanded={configureId === assessment.id} onClick={() => setConfigureId(configureId === assessment.id ? null : assessment.id)}>{t.availability}</Button>{configureId === assessment.id ? <CommandForm title={t.availability} path={`/v1/assessments/${assessment.id}/availability`} fields={[{ name: 'availableFrom', label: t.availableFrom, type: 'datetime-local', defaultValue: localDateTime(assessment.availableFrom) }, { name: 'availableUntil', label: t.availableUntil, type: 'datetime-local', defaultValue: localDateTime(assessment.availableUntil) }, { name: 'allowLate', label: t.allowLate, type: 'checkbox', defaultChecked: assessment.allowLate }, { name: 'state', label: t.assignmentState, type: 'select', required: true, defaultValue: assessment.assignmentState, options: [{ value: 'OPEN', label: t.open }, { value: 'CLOSED', label: t.closed }] }]} body={values => ({ availableFrom: values.get('availableFrom') ? new Date(String(values.get('availableFrom'))).toISOString() : null, availableUntil: values.get('availableUntil') ? new Date(String(values.get('availableUntil'))).toISOString() : null, allowLate: values.get('allowLate') === 'on', state: String(values.get('state')), expectedAvailabilityVersion: assessment.availabilityVersion })} onSaved={() => { setConfigureId(null); onSubmitted(); }} onCancel={() => setConfigureId(null)} note={t.availabilityNote} /> : null}<QuizWorkspace assessment={assessment} author onChanged={onSubmitted} /></> : student ? <div className="assessment-response-panel" key={workKey}>{sourceMismatch ? <LearningError error={new LearningApiError('invalid')} /> : assessment.submissionKind === 'QUIZ' ? <QuizWorkspace assessment={assessment} author={false} onChanged={onSubmitted} /> : sourceKnown ? <>{available && (!submission || submission.status === 'RETURNED') ? <Button type="button" variant="quiet" disabled={textCommandLocked} onClick={() => { setDocumentAssessmentId(assessment.id); formDrafts.saveModel(documentSlot, assessment.id); }}><CuevoIcon name="portfolio" size={18} />{t.attachWork}</Button> : null}{documentAssessmentId === assessment.id || submission?.responseKind === 'FILE' || (submission?.artifactCount ?? 0) > 0 ? <SubmissionDocuments assessmentId={assessment.id} submission={submission} available={available} onChanged={onSubmitted} /> : <LearnerSubmission assessment={assessment} submission={submission} onChanged={onSubmitted} />}</> : <WorkspaceState kind="unknown" icon="help" description={t.submissionUnknown}/>}</div> : null}
          </div>
          <aside className="assessment-task-context" aria-label={t.taskContext}>
            <section className="assessment-task-facts"><ContextHeading><CuevoIcon name="learning" variant="filled" size={22} />{t.taskContext}</ContextHeading><dl className="assessment-metadata"><div><dt>{t.course}</dt><dd><bdi>{courseTitle}</bdi></dd></div><div><dt>{t.taskType}</dt><dd>{responseLabel}</dd></div><div><dt>{t.dueAt}</dt><dd>{assessment.dueAt ? <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assessment.dueAt))}</bdi> : t.taskDeadlineUnknown}</dd></div></dl><details className="assessment-disclosure"><summary>{t.taskSource}</summary><dl className="assessment-metadata"><div><dt>{assessment.model === 'numeric' ? t.maxScore : t.assessmentModel}</dt><dd>{assessment.model === 'numeric' ? new Intl.NumberFormat(locale).format(assessment.maxScore) : t.rubricModel}</dd></div></dl><p className="learning-form__note">{assessment.model === 'numeric' ? t.numericNote : t.rubricNote}</p></details></section>
            <details className="assessment-disclosure assessment-resources" open><summary><CuevoIcon name="portfolio" variant="filled" size={22} />{t.taskResources}</summary><LearningResources courseId={assessment.courseId} targetKind="assessment" targetId={assessment.id} canManage={author} labelContext={title} /></details>
            {student ? <details className="assessment-disclosure assessment-support"><summary><CuevoIcon name="help" size={22} />{t.taskSupport}</summary><p>{t.taskSupportBody}</p><TaskLearningSupport courseId={assessment.courseId} assessmentId={assessment.id} /></details> : null}
          </aside>
        </section> : null}
      </article>;
    })}
  </div>;
}

function SelectedStaffAssessment({ assessmentId, onChanged }: { assessmentId: string; onChanged: () => void }) {
  const { membership, accessGeneration, online, status } = useApp(); const { t } = useLearningApi();
  const [refresh,setRefresh] = useState(0); const root = useRef<HTMLDivElement>(null); const focused = useRef(false);
  const path = `/v1/assessments/${assessmentId}`;
  const scope = `${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessGeneration}:${online}:${status}:${path}:${refresh}`;
  const parse = useCallback((value: unknown) => { const source = parseAssessment(value); if (source.id !== assessmentId) throw new LearningApiError('invalid'); return { scope, source }; },[scope,assessmentId]);
  const read = useApiQuery(path,parse,refresh); const source = read.data?.scope === scope ? read.data.source : null;
  useEffect(() => { if (focused.current || read.loading || !source && !read.error) return; const focus = () => { const heading=root.current?.querySelector<HTMLElement>('h2[tabindex="-1"]');if(!focused.current&&heading){heading.focus();focused.current=true;} };focus();const observer=new MutationObserver(focus);if(root.current)observer.observe(root.current,{childList:true,subtree:true});return()=>observer.disconnect(); },[source,read.loading,read.error]);
  function changed() { setRefresh(value=>value+1); onChanged(); }
  return <div ref={root}>{read.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : read.error ? <><h2 tabIndex={-1}>{t.assessments}</h2><LearningError error={read.error}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button></> : source ? <AssessmentList initiallySelectedId={source.id} assessments={[source]} submissions={[]} submissionsComplete={false} onSubmitted={changed}/> : null}</div>;
}

/** Current private page frame from the existing query owner; never persist or render its context. */
type CurrentSubmissionPage = { context: string; loading: boolean; loaded: boolean; loadingMore: boolean; nextCursor: string | null; error: LearningApiError | null; moreError: LearningApiError | null; loadMore: () => void };

export function SubmissionList({ submissions, onChanged, currentPage }: { submissions: Submission[]; onChanged: () => void; currentPage?: CurrentSubmissionPage }) {
  const { t } = useLearningApi();
  const { locale, membership, formDrafts, commandJournal } = useApp();
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const slot = `${membership?.schoolId}:${membership?.userId}:selected-staff-submission`;
  const [selectedId,setSelectedId] = useState<string|null>(()=>commandJournal.pending().map(command=>command.path.match(/^\/v1\/submissions\/([^/]+)\//)?.[1]).find(id=>!!id) ?? formDrafts.model<string>(slot) ?? null);
  const author = membership?.role === 'teacher' || membership?.role === 'admin';
  const continuationDenied = currentPage?.moreError?.kind === 'denied' || currentPage?.moreError?.kind === 'unauthorized';
  const selected = currentPage && (!currentPage.loaded || currentPage.loading || currentPage.error || continuationDenied) ? null : currentLearningSelection(submissions, selectedId);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const recovery = useRef({ key: '', requests: 0, cursor: null as string | null });
  const recoveryKey = `${currentPage?.context}:${selectedId}:${recoveryAttempt}`;
  const recoveryLimitReached = recovery.current.key === recoveryKey && recovery.current.requests >= 30;
  useEffect(() => {
    if (recovery.current.key !== recoveryKey) recovery.current = { key: recoveryKey, requests: 0, cursor: null };
    if (!author || !selectedId || selected || !currentPage?.loaded || currentPage.loading || currentPage.loadingMore || currentPage.error || currentPage.moreError || !currentPage.nextCursor || recovery.current.requests >= 30 || recovery.current.cursor === currentPage.nextCursor) return;
    recovery.current.requests++;
    recovery.current.cursor = currentPage.nextCursor;
    currentPage.loadMore();
  }, [author, selectedId, selected, recoveryKey, currentPage]);
  useEffect(() => { if (author && continuationDenied) formDrafts.clearRead(`${membership?.schoolId}:${membership?.userId}:`, '/v1/submissions'); }, [author, continuationDenied, currentPage?.context, formDrafts, membership?.schoolId, membership?.userId]);
  const submissionRoot=useRef<HTMLDivElement>(null),submissionOpener=useRef<HTMLElement|null>(null),returnToSubmissions=useRef(false),submissionBrowseId=useRef<string|null>(null);
  useEffect(()=>{if(!returnToSubmissions.current||selectedId)return;const frame=requestAnimationFrame(()=>{returnToSubmissions.current=false;const target=submissionOpener.current?.isConnected&&submissionOpener.current.matches('button,a,input,select,textarea,[tabindex]')&&!submissionOpener.current.matches(':disabled')?submissionOpener.current:submissionRoot.current?.querySelector<HTMLElement>(`[data-submission-choice="${submissionBrowseId.current}"] button`)??submissionRoot.current?.querySelector<HTMLElement>('.learning-staff-directory h2')??submissionRoot.current?.closest('.learning-workspace')?.querySelector<HTMLElement>('h1');target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',behavior:'instant'});});return()=>cancelAnimationFrame(frame);},[selectedId]);
  const heading = useRef<HTMLHeadingElement>(null); const lastFocused = useRef<string|null>(null);
  useEffect(()=>{if(selectedId&&heading.current&&lastFocused.current!==selectedId){heading.current.focus();lastFocused.current=selectedId;}},[selectedId,submissions]);
  if (author) {
    const locked = learningNavigationLocked(commandJournal.pending());
    const restoring = !!currentPage && !currentPage.error && !continuationDenied && (currentPage.loading || !currentPage.loaded || currentPage.loadingMore || !!currentPage.nextCursor && !currentPage.moreError && !recoveryLimitReached);
    function closeSelection() { if(learningNavigationLocked(commandJournal.pending()))return;returnToSubmissions.current=true;lastFocused.current=null;setSelectedId(null);formDrafts.remove(slot); }
    function retrySelection() {
      if (!currentPage || currentPage.loading || currentPage.loadingMore || !currentPage.nextCursor) return;
      const attempt = recoveryAttempt + 1;
      recovery.current = { key: `${currentPage.context}:${selectedId}:${attempt}`, requests: 1, cursor: currentPage.nextCursor };
      setRecoveryAttempt(attempt);
      currentPage.loadMore();
    }
    return <><div ref={submissionRoot} className="learning-staff-workspace" data-selected={!!selectedId}>
      {currentPage?.loading ? !selectedId ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : null : currentPage?.error || continuationDenied ? !selectedId ? <LearningError error={currentPage?.error ?? currentPage!.moreError!}/> : null : submissions.length ? <StaffSubmissionDirectory submissions={submissions} selectedId={selected?.id??null} disabled={locked} onSelect={id=>{if(learningNavigationLocked(commandJournal.pending()))return;submissionOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;submissionBrowseId.current=id;setSelectedId(id);formDrafts.saveModel(slot,id);}}/> : !selectedId ? <WorkspaceState kind={currentPage&&(!currentPage.loaded||currentPage.loadingMore||currentPage.nextCursor||currentPage.moreError)?'unknown':'empty'} icon="learning" description={currentPage&&(!currentPage.loaded||currentPage.loadingMore||currentPage.nextCursor||currentPage.moreError)?t.submissionUnknown:t.noSubmissions}/> : null}
      {selected ? <section className="learning-staff-selected" aria-label={t.currentWork}><article className="submission-section" key={`${selected.id}:${selected.revision}`}><Button type="button" variant="quiet" disabled={locked} onClick={closeSelection}>{t.closeSubmission}</Button><h2 ref={heading} tabIndex={-1}>{learningTitle(selected.assessmentTitle,t.assessmentUnavailable)}</h2><p><bdi>{selected.learnerName}</bdi> · <bdi>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(selected.submittedAt))}</bdi></p><p>{selected.responseKind==='FILE'?t.fileTask:selected.responseKind==='TEXT'?t.textTask:t.submissionTypeUnknown}</p><SubmittedDocumentWork submissionId={selected.id}/><p className="learning-form__note">{t.evidenceNote}</p><TeacherSubmissionActions submission={selected} onChanged={onChanged}/></article></section> : selectedId && currentPage ? <section className="learning-staff-selected" aria-label={t.currentWork}><Button type="button" variant="quiet" disabled={locked} onClick={closeSelection}>{t.closeSubmission}</Button><h2 tabIndex={-1}>{t.currentWork}</h2>{currentPage.error || continuationDenied ? <LearningError error={currentPage.error ?? currentPage.moreError!}/> : <WorkspaceState kind={restoring?'loading':currentPage.nextCursor?'unknown':'unavailable'} icon={restoring?'refresh':'help'} role={restoring ? 'status' : undefined} description={restoring ? t.restoringSubmission : currentPage.nextCursor ? t.selectedSubmissionUnknown : t.selectedSubmissionUnavailable}/>}{!restoring ? <Button type="button" variant="secondary" onClick={currentPage.nextCursor ? retrySelection : onChanged}>{currentPage.nextCursor ? t.retrySubmissionSource : t.refresh}</Button> : null}</section> : null}
    </div>{currentPage && !currentPage.error && !continuationDenied && (!selectedId || selected) ? <LoadMore query={currentPage}/> : null}</>;
  }
  return <section><p className="learning-form__note">{t.markingLater}</p>{submissions.length ? <div className="submission-list">{submissions.map(submission => <article className="submission-section" key={submission.id}><div className="learning-section-heading"><div><h2>{learningTitle(submission.assessmentTitle, t.assessmentUnavailable)}</h2><p><bdi>{submission.learnerName}</bdi> · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt))}</bdi></p></div><Status>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.pending}</Status></div><h3>{t.response}</h3><p className="lesson-content" dir="auto">{submission.content}</p><p className="learning-form__note">{t.evidenceNote}</p>{membership?.role === 'teacher' || membership?.role === 'admin' ? <TeacherSubmissionActions submission={submission} onChanged={onChanged} /> : null}</article>)}</div> : <WorkspaceState kind={currentPage&&(!currentPage.loaded||currentPage.loadingMore||currentPage.nextCursor||currentPage.moreError)?'unknown':'empty'} icon="learning" description={currentPage&&(!currentPage.loaded||currentPage.loadingMore||currentPage.nextCursor||currentPage.moreError)?t.submissionUnknown:t.noSubmissions}/>}</section>;
}
