'use client';

import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../providers';
import { canMarkSubmission, type AcademicReference, type MarkingItem } from '../../lib/academic-types';
import { academicAr, academicEn } from '../../messages/academic';
import { CommandForm } from '../learning/command-form';

export function MarkingQueue({ items, references, onChanged, selected, onSelected }: { items: MarkingItem[]; references: AcademicReference[]; onChanged: () => void; selected: string | null; onSelected: (id: string) => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const item = items.find((value) => value.id === selected);
  return <div className="marking-workspace"><section className="marking-queue" aria-label={t.marking}>{items.length ? items.map((value) => <button type="button" className={`marking-queue__item ${value.id === selected ? 'marking-queue__item--active' : ''}`} key={value.id} onClick={() => onSelected(value.id)}><strong>{value.assessmentTitle}</strong><span><bdi>{value.learnerName}</bdi></span><span>{value.currentResult?.status === 'RELEASED' ? t.published : value.currentResult ? t.review : t.openMarking}</span></button>) : <p className="learning-empty">{t.emptyMarking}</p>}</section>{item ? <MarkingDetail key={`${item.id}-${item.policyVersion}-${item.currentResult?.revision ?? 0}-${item.currentResult?.status ?? 'none'}`} item={item} references={references} onChanged={onChanged} /> : <p className="learning-empty">{t.chooseSubmission}</p>}</div>;
}

function MarkingDetail({ item, references, onChanged }: { item: MarkingItem; references: AcademicReference[]; onChanged: () => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const [editing, setEditing] = useState(!item.currentResult);
  const [releasing, setReleasing] = useState(false);
  const approved = references.filter((reference) => reference.status === 'APPROVED');
  const reference = references.find((value) => value.id === item.referenceId);
  const current = item.currentResult;
  const canMark = canMarkSubmission(item.referenceId, references);
  return <section className="marking-detail"><h3>{item.assessmentTitle}</h3><p className="academic-learner"><bdi>{item.learnerName}</bdi></p><dl className="academic-facts"><div><dt>{t.maxScore}</dt><dd>{new Intl.NumberFormat(locale).format(item.maxScore)}</dd></div><div><dt>{t.policy}</dt><dd>{item.policyVersion}</dd></div><div><dt>{t.reference}</dt><dd>{reference ? <>{reference.title} · <bdi>{reference.version}</bdi></> : t.referenceMissing}</dd></div></dl>
    {!item.referenceId && !current ? approved.length ? <CommandForm title={t.link} path={`/v1/assessments/${item.assessmentId}/reference`} fields={[{ name: 'referenceId', label: t.reference, type: 'select', required: true, options: approved.map((value) => ({ value: value.id, label: `${value.title} (${value.version})` })) }]} body={(values) => ({ referenceId: String(values.get('referenceId')), expectedPolicyVersion: item.policyVersion })} onSaved={onChanged} note={t.linkNote} actionLabel={t.link} /> : <p className="notice" role="status">{t.noApproved}</p> : null}
    <details className="evidence-details" open><summary>{t.response}</summary><p className="lesson-content">{item.content}</p><p className="learning-form__note">{t.sourceEvidence}</p></details>
    {!canMark ? <p className="notice" role="status">{t.referenceMissing}</p> : editing ? <CommandForm title={current ? t.correctMark : t.saveMark} path={`/v1/submissions/${item.id}/results`} fields={[{ name: 'score', label: `${t.score} (0–${item.maxScore})`, type: 'number', min: 0, max: item.maxScore, step: 'any', required: true, defaultValue: current?.score }, { name: 'feedback', label: t.feedback, type: 'textarea', required: true, defaultValue: current?.feedback, maxLength: 10000 }]} body={(values) => ({ score: Number(values.get('score')), feedback: String(values.get('feedback')), expectedPolicyVersion: item.policyVersion, expectedRevision: current?.revision ?? 0, sourceEvidence: true })} onSaved={onChanged} onCancel={current ? () => setEditing(false) : undefined} actionLabel={current ? t.correctMark : t.saveMark} note={t.nativeNote} /> : current ? <>
      <section className={`mark-review ${current.status === 'RELEASED' ? 'mark-review--released' : ''}`}><Status tone={current.status === 'RELEASED' ? 'positive' : 'warning'}>{current.status === 'RELEASED' ? t.published : t.review}</Status><div className="native-score"><strong>{new Intl.NumberFormat(locale).format(current.score)}</strong><span> / {new Intl.NumberFormat(locale).format(current.maxScore)}</span></div><p>{current.feedback}</p><p className="learning-form__note">{t.revision}: {current.revision} · {current.status === 'RELEASED' ? t.historyNote : t.reviewBody}</p></section>
      <div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setEditing(true)}>{t.correctMark}</Button>{current.status === 'REVIEW' && reference?.status === 'APPROVED' ? <Button type="button" onClick={() => setReleasing(true)}>{t.release}</Button> : null}</div>{current.status === 'REVIEW' && reference?.status !== 'APPROVED' ? <p className="notice">{t.referenceMissing}</p> : null}
      {releasing && current.status === 'REVIEW' ? <CommandForm title={t.release} path={`/v1/results/${current.id}/release`} fields={[{ name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }]} body={(values) => ({ expectedRevision: current.revision, parentVisible: values.get('parentVisible') === 'on' })} onSaved={onChanged} onCancel={() => setReleasing(false)} actionLabel={t.release} note={`${t.releaseNote} ${t.parentNote}`} /> : null}
    </> : null}
  </section>;
}
