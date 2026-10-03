'use client';
import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import type { Assessment, Submission, SubmissionDraft } from '../model';
import { parseDraft, parseSubmission } from '../model';
import { useLearningApi } from '../api';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';

export function LearnerSubmission({ assessment, submission, onChanged }: { assessment: Assessment; submission?: Submission; onChanged: () => void }) {
  const { t } = useLearningApi(); const [action, setAction] = useState<'draft' | 'submit' | null>('submit'); const [refresh, setRefresh] = useState(0);
  const [draftOpened, setDraftOpened] = useState(true);
  const [savedDraft, setSavedDraft] = useState<SubmissionDraft | null>(null);
  const draft = useApiQuery(draftOpened && !submission && assessment.submissionKind === 'TEXT' ? `/v1/assessments/${assessment.id}/draft` : null, parseDraft, refresh);
  const currentDraft = savedDraft && savedDraft.assessmentId === assessment.id && savedDraft.revision >= (draft.data?.revision ?? 0) ? savedDraft : draft.data;
  const now = Date.now(); const available = assessment.assignmentState === 'OPEN' && (!assessment.availableFrom || Date.parse(assessment.availableFrom) <= now) && (!assessment.availableUntil || Date.parse(assessment.availableUntil) > now) && (assessment.allowLate || !assessment.dueAt || Date.parse(assessment.dueAt) >= now);
  function saved(result: unknown) { if (action === 'draft') { let receipt: SubmissionDraft; try { receipt = parseDraft(result); if (receipt.assessmentId !== assessment.id) throw new LearningApiError('invalid'); } catch { throw new LearningApiError('invalid', true); } setSavedDraft(receipt); setAction('submit'); setDraftOpened(true); } else { setAction(null); setSavedDraft(null); setRefresh(value => value + 1); onChanged(); } }
  if (submission) return <div><Status tone={submission.status === 'RETURNED' ? 'warning' : 'positive'}>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.submitted}</Status>{submission.returnFeedback ? <p className="notice"><strong>{t.returnFeedback}</strong>: {submission.returnFeedback}</p> : null}{submission.status === 'RETURNED' && available ? <CommandForm title={t.resubmit} path={`/v1/submissions/${submission.id}/resubmit`} fields={[{ name: 'content', label: t.content, type: 'textarea', required: true, defaultValue: submission.content, maxLength: 50000 }]} body={values => ({ content: String(values.get('content')), returnId: submission.returnId, expectedRevision: submission.revision })} onSaved={saved} actionLabel={t.resubmit} note={t.draftNote} /> : null}<SubmissionHistory submissionId={submission.id} /></div>;
  if (!available) return <p className="notice">{t.unavailableNow}</p>;
  return <div>{draft.error ? <LearningError error={draft.error} /> : null}<p className="learning-form__note">{t.draftNote}</p><div className="learning-actions">{action !== 'draft' ? <Button type="button" variant="secondary" onClick={() => { setAction('draft'); setDraftOpened(true); }}>{t.saveDraft}</Button> : null}{action !== 'submit' ? <Button type="button" onClick={() => { setAction('submit'); setDraftOpened(true); }}>{t.submit}</Button> : null}</div>{draftOpened && (!currentDraft || draft.loading) && !draft.error ? <p role="status">{t.loading}</p> : draft.error ? null : action ? <CommandForm key={`${action}:${currentDraft?.revision ?? 0}`} draftKey={`assessment-response:${assessment.id}`} title={action === 'draft' ? t.saveDraft : t.submit} path={`/v1/assessments/${assessment.id}/${action === 'draft' ? 'draft' : 'submissions'}`} fields={[{ name: 'content', label: t.content, type: 'textarea', required: action === 'submit', defaultValue: currentDraft?.content, maxLength: 50000 }]} body={values => ({ content: String(values.get('content')), ...(action === 'draft' ? { expectedRevision: currentDraft?.revision ?? 0 } : {}) })} onSaved={saved} onCancel={() => setAction(null)} actionLabel={action === 'draft' ? t.saveDraft : t.submit} /> : null}</div>;
}

export function SubmissionHistory({ submissionId }: { submissionId: string }) {
  const { t } = useLearningApi(); const [open, setOpen] = useState(false);
  const history = usePaginatedLearningQuery(open ? `/v1/submissions/${submissionId}/history?limit=100` : null, parseSubmission, 0);
  return <div><Button type="button" variant="quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t.history}</Button>{open ? <section aria-label={t.history}>{history.loading ? <p role="status">{t.loading}</p> : history.error ? <LearningError error={history.error} /> : history.data.map(item => <article className="submission-history-row" key={item.id}><h4>{t.revisionNumber} {item.revision}</h4><p className="lesson-content">{item.content}</p>{item.returnFeedback ? <p>{t.returnFeedback}: {item.returnFeedback}</p> : null}<details><summary>{t.evidenceNote}</summary><p className="learning-form__note">{t.previousSource}: <bdi>{item.previousSubmissionId ?? '—'}</bdi> · {t.sourceReturn}: <bdi>{item.sourceReturnId ?? '—'}</bdi></p></details></article>)}<LoadMore query={history} /></section> : null}</div>;
}

export function TeacherSubmissionActions({ submission, onChanged }: { submission: Pick<Submission, 'id' | 'revision' | 'status'>; onChanged: () => void }) {
  const { t } = useLearningApi(); const [action, setAction] = useState<'return' | 'close' | null>(null);
  return <div>{submission.status !== 'RETURNED' && submission.status !== 'CLOSED' ? <div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setAction('return')}>{t.returnWork}</Button><Button type="button" variant="quiet" onClick={() => setAction('close')}>{t.closeWork}</Button></div> : null}{action ? <CommandForm title={action === 'return' ? t.returnWork : t.closeWork} path={`/v1/submissions/${submission.id}/${action}`} fields={action === 'return' ? [{ name: 'feedback', label: t.returnFeedback, type: 'textarea', required: true, maxLength: 10000 }] : []} body={values => ({ expectedRevision: submission.revision, ...(action === 'return' ? { feedback: String(values.get('feedback')) } : {}) })} onSaved={() => { setAction(null); onChanged(); }} onCancel={() => setAction(null)} actionLabel={action === 'return' ? t.returnWork : t.closeWork} /> : null}<SubmissionHistory submissionId={submission.id} /></div>;
}
