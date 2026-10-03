'use client';

import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { canMarkSubmission, type MarkingItem } from '../model';
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

export function MarkingQueue({ items, onChanged, selected, onSelected }: { items: MarkingItem[]; onChanged: () => void; selected: string | null; onSelected: (id: string) => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const item = items.find((value) => value.id === selected);
  return <div className="marking-workspace"><section className="marking-queue" aria-label={t.marking}>{items.length ? items.map((value) => <button type="button" className={`marking-queue__item ${value.id === selected ? 'marking-queue__item--active' : ''}`} key={value.id} onClick={() => onSelected(value.id)}><strong>{value.assessmentTitle}</strong><span><bdi>{value.learnerName}</bdi></span><span>{value.currentResult?.status === 'RELEASED' ? t.published : value.currentResult ? t.review : t.openMarking}</span></button>) : <p className="learning-empty">{t.emptyMarking}</p>}</section>{item ? <MarkingDetail key={`${item.id}-${item.policyVersion}-${item.currentResult?.revision ?? 0}-${item.currentResult?.status ?? 'none'}`} item={item} onChanged={onChanged} /> : <p className="learning-empty">{t.chooseSubmission}</p>}</div>;
}

export function MarkingDetail({ item, onChanged }: { item: MarkingItem; onChanged: () => void }) {
  const { locale, membership, formDrafts } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const prefix = `${membership?.schoolId}:${membership?.userId}:`;
  const [editing, setEditing] = useState(!item.currentResult || !!formDrafts.get(`${prefix}/v1/submissions/${item.id}/results`));
  const [releasing, setReleasing] = useState(!!item.currentResult && !!formDrafts.get(`${prefix}/v1/results/${item.currentResult.id}/release`));
  const choices=usePaginatedLearningQuery(!item.referenceId?`/v1/assessments/${item.assessmentId}/academic-references?limit=100`:null,parseReference,item.policyVersion);
  const currentReference=useApiQuery(item.referenceId?`/v1/assessments/${item.assessmentId}/academic-reference`:null,parseOptionalReference,item.policyVersion);
  const approved = choices.data.filter((reference) => reference.status === 'APPROVED');
  const reference = currentReference.data??undefined;
  const current = item.currentResult;
  const canMark = canMarkSubmission(item.referenceId, reference?[reference]:[]) && ['SUBMITTED', 'RESUBMITTED'].includes(item.submissionStatus);
  const rubric = item.model === 'rubric' ? item.rubric : null;
  return <section className="marking-detail"><h3>{item.assessmentTitle}</h3><p className="academic-learner"><bdi>{item.learnerName}</bdi></p><dl className="academic-facts">{item.model === 'numeric' ? <div><dt>{t.maxScore}</dt><dd>{new Intl.NumberFormat(locale).format(item.maxScore)}</dd></div> : <div><dt>{t.rubric}</dt><dd>{item.rubric.title} · <bdi>{item.rubric.version}</bdi></dd></div>}<div><dt>{t.policy}</dt><dd>{item.policyVersion}</dd></div><div><dt>{t.reference}</dt><dd>{reference ? <>{reference.title} · <bdi>{reference.version}</bdi></> : t.referenceMissing}</dd></div></dl>
    {!item.referenceId && !current ? choices.loading?<p role="status">{t.loading}</p>:choices.error?<LearningError error={choices.error}/>:approved.length ? <CommandForm title={t.link} path={`/v1/assessments/${item.assessmentId}/reference`} fields={[{ name: 'referenceId', label: t.reference, type: 'select', required: true, options: approved.map((value) => ({ value: value.id, label: academicReferenceChoice(value) })) }]} body={(values) => ({ referenceId: String(values.get('referenceId')), expectedPolicyVersion: item.policyVersion })} onSaved={onChanged} note={t.linkNote} actionLabel={t.link} /> : <p className="notice" role="status">{t.noApproved}</p> : null}
    {!item.referenceId?<LoadMore query={choices}/>:null}
    {currentReference.loading?<p role="status">{t.loading}</p>:currentReference.error?<LearningError error={currentReference.error}/>:null}
    <details className="evidence-details" open><summary>{t.response}</summary>{item.responseKind === 'FILE' || (item.artifactCount ?? 0) > 0 ? <SubmittedDocumentWork submissionId={item.id} /> : <p className="lesson-content">{item.content}</p>}<p className="learning-form__note">{t.sourceEvidence}</p></details>
    <TeacherSubmissionActions submission={{ id: item.id, revision: item.submissionRevision, status: item.submissionStatus }} onChanged={onChanged} />
    {item.submissionStatus==='CLOSED'&&reference?.status==='APPROVED'?<ClosedCorrection item={item} onChanged={onChanged}/>:null}
    {!canMark ? <p className="notice" role="status">{item.submissionStatus === 'RETURNED' || item.submissionStatus === 'CLOSED' ? t.sourceUnavailable : t.referenceMissing}</p> : editing ? <CommandForm title={current ? t.correctMark : t.saveMark} path={`/v1/submissions/${item.id}/results`} fields={[...(item.model === 'numeric' ? [{ name: 'score', label: `${t.score} (0–${item.maxScore})`, type: 'number' as const, min: 0, max: item.maxScore, step: 'any' as const, required: true, defaultValue: current?.model === 'numeric' ? current.score : undefined }] : item.rubric.criteria.map((criterion) => ({ name: `criterion:${criterion.key}`, label: criterion.title, type: 'select' as const, required: true, options: criterion.levels.map((level) => ({ value: level.key, label: `${level.label} — ${level.description}` })), defaultValue: current?.model === 'rubric' ? current.nativeResult.criteria.find((choice) => choice.criterionKey === criterion.key)?.levelKey : undefined }))), { name: 'feedback', label: t.feedback, type: 'textarea', required: true, defaultValue: current?.feedback, maxLength: 10000 }]} body={(values) => ({ ...(item.model === 'numeric' ? { score: Number(values.get('score')) } : { nativeResult: { type: 'rubric', rubricId: item.rubric.id, criteria: item.rubric.criteria.map((criterion) => ({ criterionKey: criterion.key, levelKey: String(values.get(`criterion:${criterion.key}`)) })) } }), feedback: String(values.get('feedback')), expectedPolicyVersion: item.policyVersion, expectedRevision: current?.revision ?? 0, sourceEvidence: true })} onSaved={onChanged} onCancel={current ? () => setEditing(false) : undefined} actionLabel={current ? t.correctMark : t.saveMark} note={rubric ? t.rubricNote : t.nativeNote} /> : current ? <>
      <section className={`mark-review ${current.status === 'RELEASED' ? 'mark-review--released' : ''}`}><Status tone={current.status === 'RELEASED' ? 'positive' : 'warning'}>{current.status === 'RELEASED' ? t.published : t.review}</Status><NativeResultView result={current.model === 'numeric' ? { type: 'numeric', score: current.score, maxScore: current.maxScore, policyVersion: item.policyVersion } : current.nativeResult} /><p>{current.feedback}</p><p className="learning-form__note">{t.revision}: {current.revision} · {current.status === 'RELEASED' ? t.historyNote : rubric ? t.rubricReviewBody : t.reviewBody}</p></section>
      <div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setEditing(true)}>{t.correctMark}</Button>{current.status === 'REVIEW' && reference?.status === 'APPROVED' ? <Button type="button" onClick={() => setReleasing(true)}>{t.release}</Button> : null}</div>{current.status === 'REVIEW' && reference?.status !== 'APPROVED' ? <p className="notice">{t.referenceMissing}</p> : null}
      {releasing && current.status === 'REVIEW' ? <CommandForm title={t.release} path={`/v1/results/${current.id}/release`} fields={[{ name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }]} body={(values) => ({ expectedRevision: current.revision, parentVisible: values.get('parentVisible') === 'on' })} onSaved={onChanged} onCancel={() => setReleasing(false)} actionLabel={t.release} note={`${t.releaseNote} ${t.parentNote}`} /> : null}
    </> : null}
  </section>;
}
