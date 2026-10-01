'use client';

import { useState } from 'react';
import { Status } from '@cuevo/ui';
import { useApp } from '../providers';
import type { Assessment, Submission } from '../../lib/learning-types';
import { useLearningApi } from './use-learning';
import { CommandForm } from './command-form';

export function AssessmentList({ assessments, submissions, onSubmitted }: { assessments: Assessment[]; submissions: Submission[]; onSubmitted: () => void }) {
  const { t } = useLearningApi();
  const { membership, locale } = useApp();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  if (!assessments.length) return <p className="learning-empty">{t.noAssessments}</p>;
  return <div className="assessment-list">{assessments.map((assessment) => {
    const alreadySubmitted = confirmed.includes(assessment.id) || submissions.some((submission) => submission.assessmentId === assessment.id && submission.learnerId === membership?.userId);
    return <article className="assessment-section" key={assessment.id}><div className="learning-section-heading"><h3>{assessment.title}</h3><Status>{t.published}</Status></div><p className="lesson-content">{assessment.instructions}</p><dl className="assessment-metadata"><div><dt>{t.maxScore}</dt><dd>{new Intl.NumberFormat(locale).format(assessment.maxScore)}</dd></div>{assessment.dueAt ? <div><dt>{t.dueAt}</dt><dd><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assessment.dueAt))}</bdi></dd></div> : null}</dl><p className="learning-form__note">{t.numericNote}</p>{membership?.role === 'student' ? alreadySubmitted ? <Status tone="positive">{t.submitted}</Status> : <CommandForm title={t.submit} path={`/v1/assessments/${assessment.id}/submissions`} fields={[{ name: 'content', label: t.content, type: 'textarea', required: true, maxLength: 20_000 }]} body={(values) => ({ content: String(values.get('content')) })} actionLabel={t.submit} onSaved={() => { setConfirmed((value) => [...value, assessment.id]); onSubmitted(); }} /> : null}</article>;
  })}</div>;
}

export function SubmissionList({ submissions }: { submissions: Submission[] }) {
  const { t } = useLearningApi();
  const { locale } = useApp();
  return <section><p className="learning-form__note">{t.markingLater}</p>{submissions.length ? <div className="submission-list">{submissions.map((submission) => <article className="submission-section" key={submission.id}><div className="learning-section-heading"><div><h3>{submission.assessmentTitle}</h3><p><bdi>{submission.learnerName}</bdi> · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt))}</bdi></p></div><Status>{t.pending}</Status></div><h4>{t.response}</h4><p className="lesson-content">{submission.content}</p><p className="learning-form__note">{t.evidenceNote}</p></article>)}</div> : <p className="learning-empty">{t.noSubmissions}</p>}</section>;
}
