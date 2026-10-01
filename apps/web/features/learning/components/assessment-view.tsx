'use client';

import { useState } from 'react';
import { Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { Assessment, Submission } from '../model';
import { useLearningApi } from '../api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearnerSubmission, TeacherSubmissionActions } from './submission-lifecycle';
import { QuizWorkspace } from './quiz';
function localDateTime(value: string | null) { if (!value) return ''; const date = new Date(value); const pad = (part: number) => String(part).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }

export function AssessmentList({ assessments, submissions, onSubmitted }: { assessments: Assessment[]; submissions: Submission[]; onSubmitted: () => void }) {
  const { t } = useLearningApi();
  const { membership, locale } = useApp();
  const [configureId, setConfigureId] = useState<string | null>(null);
  if (!assessments.length) return <p className="learning-empty">{t.noAssessments}</p>;
  return <div className="assessment-list">{assessments.map((assessment) => {
    const submission = submissions.find((item) => item.assessmentId === assessment.id && item.learnerId === membership?.userId);
    const author = membership?.role === 'teacher' || membership?.role === 'admin';
    return <article className="assessment-section" key={assessment.id}><div className="learning-section-heading"><h3>{assessment.title}</h3><Status>{assessment.assignmentState === 'CLOSED' ? t.closed : t.published}</Status></div><p className="lesson-content">{assessment.instructions}</p><dl className="assessment-metadata">{assessment.model === 'numeric' ? <div><dt>{t.maxScore}</dt><dd>{new Intl.NumberFormat(locale).format(assessment.maxScore)}</dd></div> : <div><dt>{t.assessmentModel}</dt><dd>{t.rubricModel}</dd></div>}{assessment.dueAt ? <div><dt>{t.dueAt}</dt><dd><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assessment.dueAt))}</bdi></dd></div> : null}</dl><p className="learning-form__note">{assessment.model === 'numeric' ? t.numericNote : t.rubricNote}</p>{author ? <><button type="button" className="text-action" onClick={() => setConfigureId(configureId === assessment.id ? null : assessment.id)}>{t.availability}</button>{configureId === assessment.id ? <CommandForm title={t.availability} path={`/v1/assessments/${assessment.id}/availability`} fields={[{ name: 'availableFrom', label: t.availableFrom, type: 'datetime-local', defaultValue: localDateTime(assessment.availableFrom) }, { name: 'availableUntil', label: t.availableUntil, type: 'datetime-local', defaultValue: localDateTime(assessment.availableUntil) }, { name: 'allowLate', label: t.allowLate, type: 'checkbox', defaultChecked: assessment.allowLate }, { name: 'state', label: t.assignmentState, type: 'select', required: true, defaultValue: assessment.assignmentState, options: [{ value: 'OPEN', label: t.open }, { value: 'CLOSED', label: t.closed }] }]} body={values => ({ availableFrom: values.get('availableFrom') ? new Date(String(values.get('availableFrom'))).toISOString() : null, availableUntil: values.get('availableUntil') ? new Date(String(values.get('availableUntil'))).toISOString() : null, allowLate: values.get('allowLate') === 'on', state: String(values.get('state')), expectedAvailabilityVersion: assessment.availabilityVersion })} onSaved={() => { setConfigureId(null); onSubmitted(); }} onCancel={() => setConfigureId(null)} note={t.availabilityNote} /> : null}<QuizWorkspace assessment={assessment} author onChanged={onSubmitted} /></> : membership?.role === 'student' ? assessment.submissionKind === 'QUIZ' ? <QuizWorkspace assessment={assessment} author={false} onChanged={onSubmitted} /> : <LearnerSubmission assessment={assessment} submission={submission} onChanged={onSubmitted} /> : null}</article>;
  })}</div>;
}

export function SubmissionList({ submissions, onChanged }: { submissions: Submission[]; onChanged: () => void }) {
  const { t } = useLearningApi();
  const { locale, membership } = useApp();
  return <section><p className="learning-form__note">{t.markingLater}</p>{submissions.length ? <div className="submission-list">{submissions.map((submission) => <article className="submission-section" key={submission.id}><div className="learning-section-heading"><div><h3>{submission.assessmentTitle}</h3><p><bdi>{submission.learnerName}</bdi> · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt))}</bdi></p></div><Status>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.pending}</Status></div><h4>{t.response}</h4><p className="lesson-content">{submission.content}</p><p className="learning-form__note">{t.evidenceNote}</p>{membership?.role === 'teacher' || membership?.role === 'admin' ? <TeacherSubmissionActions submission={submission} onChanged={onChanged} /> : null}</article>)}</div> : <p className="learning-empty">{t.noSubmissions}</p>}</section>;
}
