'use client';

import { useCallback, useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import type { Assessment, Submission, SubmissionDraft } from '../model';
import { assessmentWorkAvailable, currentSubmissionActionReceipt, currentSubmissionDraft, currentTeacherSubmissionEditor, currentTextDraftReceipt, currentSubmissionReceipt, parseSubmission, preferredSubmissionDraft } from '../model';
import { useLearningApi } from '../api';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningSourceContext } from './source-context';

export function LearnerSubmission({ assessment, submission, onChanged }: { assessment: Assessment; submission?: Submission; onChanged: () => void }) {
  const { t } = useLearningApi();
  const { membership, locale } = useApp();
  const { journal } = useApi();
  const [action, setAction] = useState<'draft' | 'submit' | null>(() => journal.get(`/v1/assessments/${assessment.id}/draft`) ? 'draft' : 'submit');
  const [commandLocked, setCommandLocked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [draftOpened, setDraftOpened] = useState(true);
  const [savedDraft, setSavedDraft] = useState<SubmissionDraft | null>(null);
  const parseCurrentDraft = useCallback((value: unknown) => currentSubmissionDraft(value, assessment.id), [assessment.id]);
  const draft = useApiQuery(draftOpened && !submission && assessment.submissionKind === 'TEXT' ? `/v1/assessments/${assessment.id}/draft` : null, parseCurrentDraft, refresh);
  const currentDraft = preferredSubmissionDraft(assessment.id, draft.data, savedDraft);
  const available = assessmentWorkAvailable(assessment, Date.now());
  const modesLocked = commandLocked || !!journal.get(`/v1/assessments/${assessment.id}/draft`) || !!journal.get(`/v1/assessments/${assessment.id}/submissions`);
  function saved(result: unknown) {
    if (action === 'draft') {
      setSavedDraft(result as SubmissionDraft); setAction('submit'); setDraftOpened(true);
    } else {
      setAction(null); setSavedDraft(null); setRefresh(value => value + 1); onChanged();
    }
  }
  if (submission) return <div className="submission-work">
    <div className="submission-work-heading"><CuevoIcon name={submission.status === 'RETURNED' ? 'feedback' : 'assessment'} variant="filled" size={26} /><div><h4>{t.currentWork}</h4><p><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt))}</bdi></p></div><Status tone={submission.status === 'RETURNED' ? 'warning' : 'neutral'}>{submission.status === 'RETURNED' ? t.returned : submission.status === 'CLOSED' ? t.closed : submission.status === 'RESUBMITTED' ? t.resubmitted : t.submitted}</Status></div>
    {submission.returnFeedback ? <div className="submission-revision-feedback"><h4><CuevoIcon name="feedback" variant="filled" size={22} />{t.returnFeedback}</h4><p className="lesson-content" dir="auto">{submission.returnFeedback}</p></div> : null}
    {submission.status === 'RETURNED' && available ? <CommandForm title={t.resubmit} path={`/v1/submissions/${submission.id}/resubmit`} fields={[{ name: 'content', label: t.content, type: 'textarea', required: true, defaultValue: submission.content, maxLength: 50000 }]} body={values => ({ content: String(values.get('content')), returnId: submission.returnId, expectedRevision: submission.revision })} validateReceipt={(result, originalCommand) => { currentSubmissionReceipt(result, assessment.id, membership?.userId, originalCommand.body, submission.id); }} onSaved={saved} actionLabel={t.resubmit} note={t.draftNote} /> : <section className="submission-response" aria-label={t.response}><h4>{t.response}</h4><p className="lesson-content" dir="auto">{submission.content}</p><p className="learning-form__note">{t.evidenceNote}</p></section>}
    <LearningSourceContext type="submission" sourceId={submission.id} />
    <SubmissionHistory submissionId={submission.id} />
  </div>;
  if (!available) return <p className="notice">{t.unavailableNow}</p>;
  return <div className="submission-work submission-work--draft">
    <div className="submission-work-heading"><CuevoIcon name="practice" variant="filled" size={26} /><div><h4>{t.draftStage}</h4><p>{t.draftStageBody}</p></div></div>
    {draft.error ? <LearningError error={draft.error} /> : null}
    <div className="learning-actions submission-work-modes">{action !== 'draft' ? <Button type="button" variant="secondary" disabled={modesLocked} onClick={() => { setAction('draft'); setDraftOpened(true); }}><CuevoIcon name="assessment" size={18} />{t.saveDraft}</Button> : null}{action !== 'submit' ? <Button type="button" disabled={modesLocked} onClick={() => { setAction('submit'); setDraftOpened(true); }}><CuevoIcon name="arrow" size={18} />{t.submit}</Button> : null}</div>
    {draftOpened && (!currentDraft || draft.loading) && !draft.error ? <p role="status" data-work-loading="true">{t.loading}</p> : draft.error ? null : action ? <CommandForm key={`${action}:${currentDraft?.revision ?? 0}`} draftKey={`assessment-response:${assessment.id}`} title={action === 'draft' ? t.saveDraft : t.submit} path={`/v1/assessments/${assessment.id}/${action === 'draft' ? 'draft' : 'submissions'}`} fields={[{ name: 'content', label: t.content, type: 'textarea', required: action === 'submit', defaultValue: currentDraft?.content, maxLength: 50000 }]} body={values => ({ content: String(values.get('content')), ...(action === 'draft' ? { expectedRevision: currentDraft?.revision ?? 0 } : {}) })} validateReceipt={(result, originalCommand) => { if (action === 'draft') currentTextDraftReceipt(result, assessment.id, originalCommand.body); else currentSubmissionReceipt(result, assessment.id, membership?.userId, originalCommand.body); }} onSaved={saved} onLockedChange={setCommandLocked} onCancel={() => setAction(null)} actionLabel={action === 'draft' ? t.saveDraft : t.submit} note={t.draftNote} /> : null}
  </div>;
}

export function SubmissionHistory({ submissionId }: { submissionId: string }) {
  const { t } = useLearningApi();
  const { locale } = useApp();
  const [open, setOpen] = useState(false);
  const history = usePaginatedLearningQuery(open ? `/v1/submissions/${submissionId}/history?limit=100` : null, parseSubmission, 0);
  return <div className="submission-history"><Button type="button" variant="quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}><CuevoIcon name="assessment" size={18} />{t.history}</Button>{open ? <section aria-label={t.history}>{history.loading ? <p role="status">{t.loading}</p> : history.error ? <LearningError error={history.error} /> : history.data.map(item => <article className="submission-history-row" key={item.id}><div className="submission-work-heading"><h4>{t.revisionNumber} {new Intl.NumberFormat(locale).format(item.revision)}</h4><p><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.submittedAt))}</bdi></p></div><p className="lesson-content" dir="auto">{item.content}</p>{item.returnFeedback ? <div className="submission-revision-feedback"><h4>{t.returnFeedback}</h4><p className="lesson-content" dir="auto">{item.returnFeedback}</p></div> : null}<LearningSourceContext type="submission" sourceId={item.id} /><details className="assessment-disclosure"><summary>{t.evidenceNote}</summary><p className="learning-form__note">{t.previousSource}: <bdi>{item.previousSubmissionId ?? '—'}</bdi> · {t.sourceReturn}: <bdi>{item.sourceReturnId ?? '—'}</bdi></p></details></article>)}<LoadMore query={history} /></section> : null}</div>;
}

export function TeacherSubmissionActions({ submission, onChanged }: { submission: Pick<Submission, 'id' | 'revision' | 'status'>; onChanged: () => void }) {
  const { t } = useLearningApi();
  const { membership, formDrafts } = useApp();
  const { journal } = useApi();
  const intentSlot=`${membership?.schoolId}:${membership?.userId}:/v1/submissions/${submission.id}/editor-intent`;
  const [action, setAction] = useState<'return' | 'close' | null>(() => journal.get(`/v1/submissions/${submission.id}/return`) ? 'return' : journal.get(`/v1/submissions/${submission.id}/close`) ? 'close' : currentTeacherSubmissionEditor(formDrafts.model(intentSlot),submission));
  function chooseAction(value:'return'|'close'|null) {
    setAction(value);
    if(value) formDrafts.saveModel(intentSlot,{id:submission.id,revision:submission.revision,action:value});
    else formDrafts.remove(intentSlot);
  }
  const [commandLocked, setCommandLocked] = useState(false);
  const modesLocked = commandLocked || !!journal.get(`/v1/submissions/${submission.id}/return`) || !!journal.get(`/v1/submissions/${submission.id}/close`);
  return <div>{submission.status !== 'RETURNED' && submission.status !== 'CLOSED' ? <div className="learning-actions"><Button type="button" variant="secondary" disabled={modesLocked} onClick={() => chooseAction('return')}><CuevoIcon name="feedback" size={18} />{t.returnWork}</Button><Button type="button" variant="quiet" disabled={modesLocked} onClick={() => chooseAction('close')}>{t.closeWork}</Button></div> : null}{action ? <CommandForm title={action === 'return' ? t.returnWork : t.closeWork} path={`/v1/submissions/${submission.id}/${action}`} fields={action === 'return' ? [{ name: 'feedback', label: t.returnFeedback, type: 'textarea', required: true, maxLength: 10000 }] : []} body={values => ({ expectedRevision: submission.revision, ...(action === 'return' ? { feedback: String(values.get('feedback')) } : {}) })} onLockedChange={setCommandLocked} validateReceipt={(result, originalCommand) => { currentSubmissionActionReceipt(result, action, submission.id, membership?.userId, originalCommand.body); }} onSaved={() => { chooseAction(null); onChanged(); }} onCancel={() => chooseAction(null)} actionLabel={action === 'return' ? t.returnWork : t.closeWork} /> : null}<SubmissionHistory submissionId={submission.id} /></div>;
}
