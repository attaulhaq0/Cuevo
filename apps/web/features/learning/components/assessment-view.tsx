'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { assessmentSubmissionContext, assessmentWorkAvailable, assessmentWorkPresentation, learningTitle, parseLifecycleAvailability, type Assessment, type Submission } from '../model';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { useLearningApi } from '../api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearnerSubmission, TeacherSubmissionActions } from './submission-lifecycle';
import { QuizWorkspace } from './quiz';
import { LearningResources } from './resources';
import { SubmissionDocuments } from './submission-documents';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { AssessmentPreparation } from './assessment-preparation';
import { TaskLearningSupport } from '../../school/ui';
import { trailAssets } from '../../../shared/characters/assets';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AssessmentList({ assessments, submissions, submissionsComplete, onSubmitted, initiallySelectedId }: { assessments: Assessment[]; submissions: Submission[]; submissionsComplete: boolean; onSubmitted: () => void; initiallySelectedId?: string }) {
  const { t } = useLearningApi();
  const { membership, locale, formDrafts, accessGeneration, online, status } = useApp();
  const { journal } = useApi();
  useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const [configureId, setConfigureId] = useState<string | null>(null);
  const availabilityPath = assessments.length ? `/v1/curriculum/learning-availability?courseIds=${[...new Set(assessments.map(item => item.courseId))].join(',')}` : null;
  const availabilityScope = `${membership?.schoolId}:${membership?.userId}:${accessGeneration}:${online}:${status}:${availabilityPath}`;
  const parseCurrentAvailability = useCallback((value: unknown) => ({ scope: availabilityScope, availability: parseLifecycleAvailability(value) }), [availabilityScope]);
  const availabilityRead = useApiQuery(availabilityPath, parseCurrentAvailability, 0);
  const availability = { ...availabilityRead, data: availabilityRead.data?.scope === availabilityScope ? availabilityRead.data.availability : null };
  const selectedSlot = `${membership?.schoolId}:${membership?.userId}:selected-assessment-detail`;
  const documentSlot = `${membership?.schoolId}:${membership?.userId}:selected-document-assessment`;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => initiallySelectedId ?? formDrafts.model<string>(selectedSlot) ?? formDrafts.model<string>(documentSlot) ?? null);
  const [documentAssessmentId, setDocumentAssessmentId] = useState<string | null>(() => formDrafts.model<string>(documentSlot) ?? null);
  const student = membership?.role === 'student';
  const author = membership?.role === 'teacher' || membership?.role === 'admin';
  if (!assessments.length) return <p className="learning-empty">{t.noAssessments}</p>;
  if (availability.error) return <LearningError error={availability.error} />;
  if (availability.loading || !availability.data) return <p role="status">{t.loading}</p>;
  return <div className={`assessment-list${student ? ' assessment-list--student' : ''}${initiallySelectedId ? ' assessment-list--exact' : ''}`}>
    {student && !initiallySelectedId ? <header className="assessment-path-heading"><div><p className="eyebrow">{t.assessments}</p><h2>{t.assessmentPath}</h2><p>{t.assessmentPathBody}</p></div><img src={trailAssets.work} alt="" width={96} height={96} /></header> : !student ? <h2>{t.assessments}</h2> : null}
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
      const workKey = `${membership?.schoolId}:${membership?.userId}:${assessment.id}`;
      const closed = assessment.assignmentState === 'CLOSED';
      if (availability.data?.items.some(course => course.id === assessment.courseId)) return <article className="assessment-section" data-assessment-id={assessment.id} key={assessment.id}>{initiallySelectedId ? <h2 tabIndex={-1}>{title}</h2> : <h3 tabIndex={-1}>{title}</h3>}<p className="notice">{t.retiredCourseNote}</p><p className="lesson-content" dir="auto">{instructions}</p></article>;
      if (assessment.status === 'DRAFT') return author ? <article className="assessment-section" data-assessment-id={assessment.id} key={assessment.id}><div className="learning-section-heading"><h3 tabIndex={-1}>{title}</h3><Status>{t.draft}</Status></div><AssessmentPreparation assessment={assessment} onChanged={onSubmitted} />{assessment.intendedSubmissionKind === 'QUIZ' ? <QuizWorkspace assessment={assessment} author onChanged={onSubmitted} /> : null}</article> : null;
      if (student && sourceMismatch) return <article className="assessment-section" data-assessment-id={assessment.id} key={assessment.id}>{initiallySelectedId ? <h2 tabIndex={-1}>{title}</h2> : <h3 tabIndex={-1}>{title}</h3>}<LearningError error={new LearningApiError('invalid')} /></article>;
      return <article className={`assessment-section${detailOpen ? ' assessment-section--open' : ''}`} data-assessment-id={assessment.id} key={assessment.id}>
        <header className="assessment-task-heading">
          {student ? <img src={trailAssets.work} alt="" width={64} height={64} /> : <CuevoIcon name="assessment" variant="filled" size={28} />}
          <div><p className="eyebrow">{student ? courseTitle : t.assessments}</p>{initiallySelectedId ? <h2 tabIndex={-1}>{title}</h2> : <h3 tabIndex={-1}>{title}</h3>}<Status tone="neutral">{closed ? t.closed : t.published}</Status></div>
          {student ? <Button type="button" variant="secondary" aria-expanded={detailOpen} onClick={() => { const next = detailOpen ? null : assessment.id; setSelectedTaskId(next); if (next) formDrafts.saveModel(selectedSlot, next); else formDrafts.remove(selectedSlot); }}><CuevoIcon name={detailOpen ? 'close' : 'arrow'} size={18} />{detailOpen ? t.closeTask : t.openTask}</Button> : null}
        </header>
        {!detailOpen ? <div className="assessment-task-summary"><p className="lesson-content" dir="auto">{instructions}</p><dl className="assessment-metadata"><div><dt>{t.taskType}</dt><dd>{responseLabel}</dd></div><div><dt>{assessment.model === 'numeric' ? t.maxScore : t.assessmentModel}</dt><dd>{assessment.model === 'numeric' ? new Intl.NumberFormat(locale).format(assessment.maxScore) : t.rubricModel}</dd></div>{assessment.dueAt ? <div><dt>{t.dueAt}</dt><dd><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assessment.dueAt))}</bdi></dd></div> : null}</dl>{submission ? <Status>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.submitted}</Status> : <p className="learning-form__note">{sourceKnown ? t.notSubmitted : t.submissionUnknown}</p>}</div> : null}
        {detailOpen ? <section className={student ? 'assessment-task-layout' : 'assessment-staff-detail'} aria-label={student ? t.taskDetails : undefined}>
          <div className="assessment-task-main">
            {student ? <div className="assessment-stage-heading"><p className="eyebrow">{t.selectedTask}</p>{initiallySelectedId ? <h3>{stageHeading}</h3> : <h4>{stageHeading}</h4>}<p>{stageBody}</p></div> : null}
            <section className="assessment-instructions" aria-label={t.instructions}><h4><CuevoIcon name="assessment" variant="filled" size={22} />{t.instructions}</h4><p className="lesson-content" dir="auto">{instructions}</p></section>
            {author ? <><Button type="button" variant="quiet" aria-expanded={configureId === assessment.id} onClick={() => setConfigureId(configureId === assessment.id ? null : assessment.id)}>{t.availability}</Button>{configureId === assessment.id ? <CommandForm title={t.availability} path={`/v1/assessments/${assessment.id}/availability`} fields={[{ name: 'availableFrom', label: t.availableFrom, type: 'datetime-local', defaultValue: localDateTime(assessment.availableFrom) }, { name: 'availableUntil', label: t.availableUntil, type: 'datetime-local', defaultValue: localDateTime(assessment.availableUntil) }, { name: 'allowLate', label: t.allowLate, type: 'checkbox', defaultChecked: assessment.allowLate }, { name: 'state', label: t.assignmentState, type: 'select', required: true, defaultValue: assessment.assignmentState, options: [{ value: 'OPEN', label: t.open }, { value: 'CLOSED', label: t.closed }] }]} body={values => ({ availableFrom: values.get('availableFrom') ? new Date(String(values.get('availableFrom'))).toISOString() : null, availableUntil: values.get('availableUntil') ? new Date(String(values.get('availableUntil'))).toISOString() : null, allowLate: values.get('allowLate') === 'on', state: String(values.get('state')), expectedAvailabilityVersion: assessment.availabilityVersion })} onSaved={() => { setConfigureId(null); onSubmitted(); }} onCancel={() => setConfigureId(null)} note={t.availabilityNote} /> : null}<QuizWorkspace assessment={assessment} author onChanged={onSubmitted} /></> : student ? <div className="assessment-response-panel" key={workKey}>{sourceMismatch ? <LearningError error={new LearningApiError('invalid')} /> : assessment.submissionKind === 'QUIZ' ? <QuizWorkspace assessment={assessment} author={false} onChanged={onSubmitted} /> : sourceKnown ? <>{available && (!submission || submission.status === 'RETURNED') ? <Button type="button" variant="quiet" disabled={textCommandLocked} onClick={() => { setDocumentAssessmentId(assessment.id); formDrafts.saveModel(documentSlot, assessment.id); }}><CuevoIcon name="portfolio" size={18} />{t.attachWork}</Button> : null}{documentAssessmentId === assessment.id || submission?.responseKind === 'FILE' || (submission?.artifactCount ?? 0) > 0 ? <SubmissionDocuments assessmentId={assessment.id} submission={submission} available={available} onChanged={onSubmitted} /> : <LearnerSubmission assessment={assessment} submission={submission} onChanged={onSubmitted} />}</> : <p className="notice">{t.submissionUnknown}</p>}</div> : null}
          </div>
          <aside className="assessment-task-context" aria-label={t.taskContext}>
            <section className="assessment-task-facts"><h4><CuevoIcon name="learning" variant="filled" size={22} />{t.taskContext}</h4><dl className="assessment-metadata"><div><dt>{t.course}</dt><dd><bdi>{courseTitle}</bdi></dd></div><div><dt>{t.taskType}</dt><dd>{responseLabel}</dd></div><div><dt>{t.dueAt}</dt><dd>{assessment.dueAt ? <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assessment.dueAt))}</bdi> : t.taskDeadlineUnknown}</dd></div></dl><details className="assessment-disclosure"><summary>{t.taskSource}</summary><dl className="assessment-metadata"><div><dt>{assessment.model === 'numeric' ? t.maxScore : t.assessmentModel}</dt><dd>{assessment.model === 'numeric' ? new Intl.NumberFormat(locale).format(assessment.maxScore) : t.rubricModel}</dd></div></dl><p className="learning-form__note">{assessment.model === 'numeric' ? t.numericNote : t.rubricNote}</p></details></section>
            <details className="assessment-disclosure assessment-resources" open><summary><CuevoIcon name="portfolio" variant="filled" size={22} />{t.taskResources}</summary><LearningResources courseId={assessment.courseId} targetKind="assessment" targetId={assessment.id} canManage={author} labelContext={title} /></details>
            {student ? <details className="assessment-disclosure assessment-support"><summary><CuevoIcon name="help" size={22} />{t.taskSupport}</summary><p>{t.taskSupportBody}</p><TaskLearningSupport courseId={assessment.courseId} assessmentId={assessment.id} /></details> : null}
          </aside>
        </section> : null}
      </article>;
    })}
  </div>;
}

export function SubmissionList({ submissions, onChanged }: { submissions: Submission[]; onChanged: () => void }) {
  const { t } = useLearningApi();
  const { locale, membership } = useApp();
  return <section><p className="learning-form__note">{t.markingLater}</p>{submissions.length ? <div className="submission-list">{submissions.map(submission => <article className="submission-section" key={submission.id}><div className="learning-section-heading"><div><h3>{learningTitle(submission.assessmentTitle, t.assessmentUnavailable)}</h3><p><bdi>{submission.learnerName}</bdi> · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt))}</bdi></p></div><Status>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.pending}</Status></div><h4>{t.response}</h4><p className="lesson-content" dir="auto">{submission.content}</p><p className="learning-form__note">{t.evidenceNote}</p>{membership?.role === 'teacher' || membership?.role === 'admin' ? <TeacherSubmissionActions submission={submission} onChanged={onChanged} /> : null}</article>)}</div> : <p className="learning-empty">{t.noSubmissions}</p>}</section>;
}
