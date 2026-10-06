'use client';

import { CommandForm } from '../../../shared/components/command-form';
import { useApp } from '../../../shared/session/providers';
import type { MarkingItem } from '../model';
import { academicAr, academicEn } from '../messages';
import { validateAcademicMarkReceipt } from '../receipt-model';

/** The existing immutable draft command, separated from its reading layout. */
export function MarkingDraftForm({ item, onChanged, onCancel }: { item: MarkingItem; onChanged: () => void; onCancel?: () => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const current = item.currentResult;
  return <CommandForm title={current ? t.correctMark : t.saveMark} path={`/v1/submissions/${item.id}/results`} fields={[
    ...(item.model === 'numeric' ? [{ name: 'score', label: `${t.score} (0–${item.maxScore})`, type: 'number' as const, min: 0, max: item.maxScore, step: 'any' as const, required: true, defaultValue: current?.model === 'numeric' ? current.score : undefined }] : item.rubric.criteria.map(criterion => ({ name: `criterion:${criterion.key}`, label: criterion.title, type: 'select' as const, required: true, options: criterion.levels.map(level => ({ value: level.key, label: `${level.label} — ${level.description}` })), defaultValue: current?.model === 'rubric' ? current.nativeResult.criteria.find(choice => choice.criterionKey === criterion.key)?.levelKey : undefined }))),
    { name: 'feedback', label: t.feedback, type: 'textarea', required: true, defaultValue: current?.feedback, maxLength: 10000 },
  ]} body={values => ({ ...(item.model === 'numeric' ? { score: Number(values.get('score')) } : { nativeResult: { type: 'rubric', rubricId: item.rubric.id, criteria: item.rubric.criteria.map(criterion => ({ criterionKey: criterion.key, levelKey: String(values.get(`criterion:${criterion.key}`)) })) } }), feedback: String(values.get('feedback')), expectedPolicyVersion: item.policyVersion, expectedRevision: current?.revision ?? 0, sourceEvidence: true })} validateReceipt={(receipt, originalCommand) => { validateAcademicMarkReceipt(receipt, originalCommand, item); }} onSaved={onChanged} onCancel={onCancel} actionLabel={current ? t.correctMark : t.saveMark} note={item.model === 'rubric' ? t.rubricNote : t.nativeNote} />;
}
