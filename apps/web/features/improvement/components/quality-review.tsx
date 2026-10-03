'use client';
import { useState } from 'react';
import { intelligenceQualityReviewStatusSchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';

const parseReview = (value: unknown) => intelligenceQualityReviewStatusSchema.parse(value);
export function IntelligenceQualityReview({ runId }: { runId: string }) {
  const { locale } = useApp(); const ar = locale === 'ar'; const [refresh, setRefresh] = useState(0);
  const current = useApiQuery(`/v1/intelligence/runs/${runId}/review`, parseReview, refresh);
  const title = ar ? 'مراجعة جودة المقترح' : 'Review proposal quality';
  if (current.loading) return <p role="status">{ar ? 'جارٍ تحميل المراجعة…' : 'Loading review…'}</p>;
  if (current.error) return <LearningError error={current.error} />;
  if (!current.data) return null;
  const unknown = { value: 'UNKNOWN', label: ar ? 'غير معروف / لم يُقيّم' : 'Unknown / not assessed' };
  const groups = [
    { name: 'usefulness', label: ar ? 'فائدة الخطوة المقترحة' : 'Usefulness of the proposed step', options: [unknown, { value: 'USEFUL', label: ar ? 'مفيدة بحسب المراجعة' : 'Useful in this review' }, { value: 'NOT_USEFUL', label: ar ? 'غير مفيدة بحسب المراجعة' : 'Not useful in this review' }] },
    { name: 'grounding', label: ar ? 'دعم الادعاءات بالشواهد' : 'Evidence support for claims', options: [unknown, { value: 'SUPPORTED', label: ar ? 'الادعاءات المراجعة مدعومة' : 'Reviewed claims supported' }, { value: 'UNSUPPORTED_CLAIM_OBSERVED', label: ar ? 'لوحظ ادعاء غير مدعوم' : 'Unsupported claim observed' }] },
    { name: 'privacy', label: ar ? 'ملاحظات الخصوصية' : 'Privacy observations', options: [unknown, { value: 'NO_ISSUE_OBSERVED', label: ar ? 'لم تُلاحظ مشكلة في المراجعة' : 'No issue observed in this review' }, { value: 'CONTEXT_ISSUE_OBSERVED', label: ar ? 'لوحظت مشكلة في السياق' : 'Context issue observed' }] },
    { name: 'toolSafety', label: ar ? 'ملاحظات سلامة الأدوات' : 'Tool safety observations', options: [unknown, { value: 'NO_ISSUE_OBSERVED', label: ar ? 'لم تُلاحظ مشكلة في المراجعة' : 'No issue observed in this review' }, { value: 'INVALID_TOOL_OBSERVED', label: ar ? 'لوحظ طلب أداة غير صالح' : 'Invalid tool request observed' }] },
  ];
  const review = current.data.review;
  return <section aria-label={title}>{review ? <><h3>{title}</h3><p>{ar ? 'سُجلت مراجعتك. هذه ملاحظات بشرية لعينة محددة وليست اعتمادًا لجودة النموذج.' : 'Your review is recorded. These are human observations of a specific sample, not a certification of model quality.'}</p><dl>{groups.map(group => <div key={group.name}><dt>{group.label}</dt><dd>{group.options.find(option => option.value === review[group.name as 'usefulness' | 'grounding' | 'privacy' | 'toolSafety'])?.label}</dd></div>)}</dl><p>{review.reason}</p></> : <CommandForm title={title} path={`/v1/intelligence/runs/${runId}/review`} fields={[...groups.map(group => ({ ...group, type: 'select' as const, required: true, defaultValue: 'UNKNOWN' })), { name: 'reason', label: ar ? 'سبب المراجعة' : 'Review reason', type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmReview', label: ar ? 'أؤكد أن هذه ملاحظاتي الصريحة' : 'I confirm these are my explicit observations', type: 'checkbox', required: true }]} body={values => ({ ...Object.fromEntries(groups.map(group => [group.name, String(values.get(group.name))])), reason: String(values.get('reason')), confirmReview: values.get('confirmReview') === 'on' })} onSaved={() => setRefresh(value => value + 1)} note={ar ? 'المراجعة منفصلة عن الموافقة أو الرفض. لا تغيّر الدرجات أو المقترح. اختر غير معروف عندما لا تكون المعلومة مُقيّمة.' : 'Review is separate from approval or rejection. It does not change grades or the proposal. Choose unknown when a category was not assessed.'} />}</section>;
}
