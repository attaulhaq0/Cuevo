'use client';
import { WorkspaceState } from '@cuevo/ui';

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
import { markingNavigationLocked } from '../marking-navigation-model';
import { markingNavigationCopy } from '../marking-navigation-copy';

export function MarkingQueue({ items, onChanged, selected, onSelected, exact = false, pageHeading = false, sourceComplete = false }: { items: MarkingItem[]; onChanged: () => void; selected: string | null; onSelected: (id: string) => void; exact?: boolean; pageHeading?: boolean; sourceComplete?:boolean }) {
  const { locale, commandJournal, membership, accessToken, accessGeneration } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const locked = markingNavigationLocked(commandJournal.pending());
  const heading = useRef<HTMLHeadingElement>(null), intent = useRef<{ id: string; opener: HTMLElement; scope: string } | null>(null);
  const scope = `${membership?.schoolId}:${membership?.userId}:${accessToken}:${accessGeneration}`;
  const currentItems=items.filter(value=>value.id===selected);
  const item = currentItems.length===1?currentItems[0]:null;
  const root=useRef<HTMLDivElement>(null),browseId=useRef<string|null>(null),returnToBrowse=useRef(false);
  function backToDirectory() { if(exact||!item||markingNavigationLocked(commandJournal.pending()))return;browseId.current=item.id;returnToBrowse.current=true;onSelected(''); }
  useEffect(()=>{if(!returnToBrowse.current||item)return;const frame=requestAnimationFrame(()=>{returnToBrowse.current=false;const target=root.current?.querySelector<HTMLElement>(`[data-marking-choice="${browseId.current}"]`)??root.current?.querySelector<HTMLElement>('.marking-queue h2,.marking-queue summary');target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',behavior:'instant'});});return()=>cancelAnimationFrame(frame);},[item]);
  useEffect(() => {
    const pending = intent.current;
    if (!pending) return;
    if (pending.scope !== scope || pending.id !== item?.id) { intent.current = null; return; }
    const active = document.activeElement;
    if (heading.current && (active === pending.opener || active === document.body || active === document.documentElement)) { intent.current = null; heading.current.focus({ preventScroll: true }); heading.current.scrollIntoView({ block: 'start', behavior: 'instant' }); }
    else intent.current = null;
  }, [item?.id, scope]);
  return <div ref={root} className={`marking-workspace${exact ? ' marking-workspace--exact' : item ? ' marking-workspace--selected' : ''}`}>{!exact ? <MarkingChoices sourceComplete={sourceComplete} pageHeading={pageHeading} items={items} selected={selected} disabled={locked} onSelected={(id, opener) => { if (markingNavigationLocked(commandJournal.pending())) return; intent.current = opener ? { id, opener, scope } : null; onSelected(id); }} /> : null}{!exact&&item?<Button type="button" variant="quiet" className="marking-back-to-directory" disabled={locked} onClick={backToDirectory}>{markingNavigationCopy[locale].back}</Button>:null}{item ? <MarkingDetail key={`${item.id}-${item.policyVersion}-${item.currentResult?.revision ?? 0}-${item.currentResult?.status ?? 'none'}`} headingRef={heading} item={item} onChanged={onChanged} /> : exact ? <WorkspaceState kind="unavailable" icon="assessment" description={t.chooseSubmission}/> : null}</div>;
}

export function MarkingDetail({ item, onChanged, headingRef }: { item: MarkingItem; onChanged: () => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { locale, membership, formDrafts, apiUrl, accessToken, accessGeneration, online, commandJournal } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const prefix = `${membership?.schoolId}:${membership?.userId}:`;
  const [editing, setEditing] = useState(!item.currentResult || !!commandJournal.get(`/v1/submissions/${item.id}/results`) || !!formDrafts.get(`${prefix}/v1/submissions/${item.id}/results`));
  const [releasing, setReleasing] = useState(!!item.currentResult && (!!commandJournal.get(`/v1/results/${item.currentResult.id}/release`) || !!formDrafts.get(`${prefix}/v1/results/${item.currentResult.id}/release`)));
  const modesLocked=markingNavigationLocked(commandJournal.pending());
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
    {!item.referenceId && !current ? choices.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:choices.error?<LearningError error={choices.error}/>:approved.length ? <CommandForm title={t.link} path={`/v1/assessments/${item.assessmentId}/reference`} fields={[{ name: 'referenceId', label: t.reference, type: 'select', required: true, options: approved.map((value) => ({ value: value.id, label: academicReferenceChoice(value,locale) })) }]} body={(values) => ({ referenceId: String(values.get('referenceId')), expectedPolicyVersion: item.policyVersion })} onSaved={onChanged} note={t.linkNote} actionLabel={t.link} /> : <WorkspaceState kind="review" icon="curriculum" description={t.noApproved} role="status"/> : null}
    {!item.referenceId?<LoadMore query={choices}/>:null}
    {currentReference.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:currentReference.error?<LearningError error={currentReference.error}/>:null}
    </>} work={<><div className="marking-original-work">{item.responseKind === 'FILE' || (item.artifactCount ?? 0) > 0 ? <SubmittedDocumentWork submissionId={item.id} /> : <p className="lesson-content" dir="auto">{item.content}</p>}<p className="learning-form__note">{t.sourceEvidence}</p></div><TeacherSubmissionActions submission={{ id: item.id, revision: item.submissionRevision, status: item.submissionStatus }} onChanged={onChanged} /></>} decision={<>
    {item.submissionStatus==='CLOSED'&&reference?.status==='APPROVED'?<ClosedCorrection item={item} onChanged={onChanged}/>:null}
    {!canMark ? <WorkspaceState kind={item.submissionStatus === 'RETURNED' || item.submissionStatus === 'CLOSED'?'unavailable':'review'} icon="help" description={item.submissionStatus === 'RETURNED' || item.submissionStatus === 'CLOSED' ? t.sourceUnavailable : t.referenceMissing} role="status"/> : editing ? <MarkingDraftForm item={item} onChanged={onChanged} onCancel={current ? () => setEditing(false) : undefined} /> : current ? <>
      <section className={`mark-review ${current.status === 'RELEASED' ? 'mark-review--released' : ''}`}><Status tone={current.status === 'RELEASED' ? 'positive' : 'warning'}>{current.status === 'RELEASED' ? t.published : t.review}</Status><NativeResultView result={current.model === 'numeric' ? { type: 'numeric', score: current.score, maxScore: current.maxScore, policyVersion: item.policyVersion } : current.nativeResult} /><p>{current.feedback}</p><p className="learning-form__note">{t.revision}: {current.revision} · {current.status === 'RELEASED' ? t.historyNote : rubric ? t.rubricReviewBody : t.reviewBody}</p></section>
      <div className="learning-actions"><Button type="button" variant="secondary" disabled={modesLocked} onClick={() => { if(!markingNavigationLocked(commandJournal.pending()))setEditing(true); }}>{t.correctMark}</Button>{current.status === 'REVIEW' && reference?.status === 'APPROVED' ? <Button type="button" disabled={modesLocked} onClick={() => { if(!markingNavigationLocked(commandJournal.pending()))setReleasing(true); }}>{t.release}</Button> : null}</div>{current.status === 'REVIEW' && reference?.status !== 'APPROVED' ? <WorkspaceState kind="review" icon="curriculum" description={t.referenceMissing}/> : null}
      {releasing && current.status === 'REVIEW' ? <CommandForm title={t.release} path={`/v1/results/${current.id}/release`} fields={[{ name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }]} body={(values) => ({ expectedRevision: current.revision, parentVisible: values.get('parentVisible') === 'on' })} validateReceipt={(receipt, originalCommand) => { validateAcademicReleaseReceipt(receipt, originalCommand, item, current); }} onSaved={onChanged} onCancel={() => setReleasing(false)} actionLabel={t.release} note={`${t.releaseNote} ${t.parentNote}`} /> : null}
    </> : null}
  </>} />;
}
