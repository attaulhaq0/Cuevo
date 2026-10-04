'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Ref } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { canMarkSubmission, currentMarkingReference, type MarkingItem } from '../model';
import { academicAr, academicEn } from '../messages';
import { CommandForm } from '../../../shared/components/command-form';
import { NativeResultView } from './native-result';
import { TeacherSubmissionActions, SubmittedDocumentWork } from '../../learning/ui';
import{ClosedCorrection}from'./closed-correction';
import{usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';
import{parseReference,parseOptionalReference,academicReferenceChoice}from'../model';
import{useApiQuery}from'../../../shared/hooks/use-api';
import{LearningError}from'../../../shared/components/feedback';
import{LoadMore}from'../../../shared/components/load-more';
import { validateAcademicReleaseReceipt } from '../receipt-model';
import { LearningApiError } from '../../../shared/api/client';
import { MarkingChoices, MarkingWorkbench } from './marking-workbench';
import { MarkingDraftForm } from './marking-draft';

export function MarkingQueue({ items, onChanged, selected, onSelected, exact = false }: { items: MarkingItem[]; onChanged: () => void; selected: string | null; onSelected: (id: string) => void; exact?: boolean }) {
  const { locale, commandJournal, membership, accessToken, accessGeneration } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const locked = commandJournal.pending().some(command => /^\/v1\/(?:submissions\/[^/]+\/results|results\/[^/]+\/release)$/.test(command.path));
  const heading = useRef<HTMLHeadingElement>(null), intent = useRef<{ id: string; opener: HTMLElement; scope: string } | null>(null);
  const scope = `${membership?.schoolId}:${membership?.userId}:${accessToken}:${accessGeneration}`;
  const item = items.find((value) => value.id === selected);
  useEffect(() => {
    const pending = intent.current;
    if (!pending) return;
    if (pending.scope !== scope || pending.id !== item?.id) { intent.current = null; return; }
    const active = document.activeElement;
    if (heading.current && (active === pending.opener || active === document.body || active === document.documentElement)) { intent.current = null; heading.current.focus({ preventScroll: true }); heading.current.scrollIntoView({ block: 'start', behavior: 'instant' }); }
    else intent.current = null;
  }, [item?.id, scope]);
  return <div className={`marking-workspace${exact ? ' marking-workspace--exact' : item ? ' marking-workspace--selected' : ''}`}>{!exact ? <MarkingChoices items={items} selected={selected} disabled={locked} onSelected={(id, opener) => { if (locked) return; intent.current = opener ? { id, opener, scope } : null; onSelected(id); }} /> : null}{item ? <MarkingDetail key={`${item.id}-${item.policyVersion}-${item.currentResult?.revision ?? 0}-${item.currentResult?.status ?? 'none'}`} headingRef={heading} item={item} onChanged={onChanged} /> : exact ? <p className="learning-empty">{t.chooseSubmission}</p> : null}</div>;
}

export function MarkingDetail({ item, onChanged, headingRef }: { item: MarkingItem; onChanged: () => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { locale, membership, formDrafts, apiUrl, accessToken, accessGeneration, online } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const prefix = `${membership?.schoolId}:${membership?.userId}:`;
  const [editing, setEditing] = useState(!item.currentResult || !!formDrafts.get(`${prefix}/v1/submissions/${item.id}/results`));
  const [releasing, setReleasing] = useState(!!item.currentResult && !!formDrafts.get(`${prefix}/v1/results/${item.currentResult.id}/release`));
  const choices=usePaginatedLearningQuery(!item.referenceId?`/v1/assessments/${item.assessmentId}/academic-references?limit=100`:null,parseReference,item.policyVersion);
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${item.id}:${item.assessmentId}:${item.referenceId}:${item.policyVersion}`;
  const parseCurrentReference = useCallback((value: unknown) => {
    const reference = parseOptionalReference(value);
    if (reference && reference.id !== item.referenceId) throw new LearningApiError('invalid');
    return { scope, value: reference };
  }, [scope, item.referenceId]);
  const currentReference=useApiQuery(item.referenceId?`/v1/assessments/${item.assessmentId}/academic-reference`:null,parseCurrentReference,item.policyVersion);
  const approved = choices.data.filter((reference) => reference.status === 'APPROVED');
  const reference = currentMarkingReference(currentReference, scope, item.referenceId);
  const current = item.currentResult;
  const canMark = canMarkSubmission(item.referenceId, reference?[reference]:[]) && ['SUBMITTED', 'RESUBMITTED'].includes(item.submissionStatus);
  const rubric = item.model === 'rubric' ? item.rubric : null;
  return <MarkingWorkbench item={item} reference={reference} headingRef={headingRef} context={<>
    {!item.referenceId && !current ? choices.loading?<p role="status">{t.loading}</p>:choices.error?<LearningError error={choices.error}/>:approved.length ? <CommandForm title={t.link} path={`/v1/assessments/${item.assessmentId}/reference`} fields={[{ name: 'referenceId', label: t.reference, type: 'select', required: true, options: approved.map((value) => ({ value: value.id, label: academicReferenceChoice(value,locale) })) }]} body={(values) => ({ referenceId: String(values.get('referenceId')), expectedPolicyVersion: item.policyVersion })} onSaved={onChanged} note={t.linkNote} actionLabel={t.link} /> : <p className="notice" role="status">{t.noApproved}</p> : null}
    {!item.referenceId?<LoadMore query={choices}/>:null}
    {currentReference.loading?<p role="status">{t.loading}</p>:currentReference.error?<LearningError error={currentReference.error}/>:null}
    </>} work={<><div className="marking-original-work">{item.responseKind === 'FILE' || (item.artifactCount ?? 0) > 0 ? <SubmittedDocumentWork submissionId={item.id} /> : <p className="lesson-content" dir="auto">{item.content}</p>}<p className="learning-form__note">{t.sourceEvidence}</p></div><TeacherSubmissionActions submission={{ id: item.id, revision: item.submissionRevision, status: item.submissionStatus }} onChanged={onChanged} /></>} decision={<>
    {item.submissionStatus==='CLOSED'&&reference?.status==='APPROVED'?<ClosedCorrection item={item} onChanged={onChanged}/>:null}
    {!canMark ? <p className="notice" role="status">{item.submissionStatus === 'RETURNED' || item.submissionStatus === 'CLOSED' ? t.sourceUnavailable : t.referenceMissing}</p> : editing ? <MarkingDraftForm item={item} onChanged={onChanged} onCancel={current ? () => setEditing(false) : undefined} /> : current ? <>
      <section className={`mark-review ${current.status === 'RELEASED' ? 'mark-review--released' : ''}`}><Status tone={current.status === 'RELEASED' ? 'positive' : 'warning'}>{current.status === 'RELEASED' ? t.published : t.review}</Status><NativeResultView result={current.model === 'numeric' ? { type: 'numeric', score: current.score, maxScore: current.maxScore, policyVersion: item.policyVersion } : current.nativeResult} /><p>{current.feedback}</p><p className="learning-form__note">{t.revision}: {current.revision} · {current.status === 'RELEASED' ? t.historyNote : rubric ? t.rubricReviewBody : t.reviewBody}</p></section>
      <div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setEditing(true)}>{t.correctMark}</Button>{current.status === 'REVIEW' && reference?.status === 'APPROVED' ? <Button type="button" onClick={() => setReleasing(true)}>{t.release}</Button> : null}</div>{current.status === 'REVIEW' && reference?.status !== 'APPROVED' ? <p className="notice">{t.referenceMissing}</p> : null}
      {releasing && current.status === 'REVIEW' ? <CommandForm title={t.release} path={`/v1/results/${current.id}/release`} fields={[{ name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }]} body={(values) => ({ expectedRevision: current.revision, parentVisible: values.get('parentVisible') === 'on' })} validateReceipt={(receipt, originalCommand) => { validateAcademicReleaseReceipt(receipt, originalCommand, item, current); }} onSaved={onChanged} onCancel={() => setReleasing(false)} actionLabel={t.release} note={`${t.releaseNote} ${t.parentNote}`} /> : null}
    </> : null}
  </>} />;
}
