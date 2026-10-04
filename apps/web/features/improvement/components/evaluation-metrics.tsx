'use client';
import {Button} from '@cuevo/ui';
import { useState } from 'react';
import { intelligenceMetricsSchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { improvementAr, improvementEn } from '../messages';

const parseMetrics = (value: unknown) => intelligenceMetricsSchema.parse(value);
export function IntelligenceEvaluationMetrics({refreshKey=0}:{refreshKey?:number}={}) {
  const { locale } = useApp(); const ar = locale === 'ar'; const [mode, setMode] = useState<'FIXTURE' | 'LIVE'>('FIXTURE');
  const [refresh,setRefresh]=useState(0);
  const current = useApiQuery(`/v1/intelligence/metrics?windowDays=30&mode=${mode}`, parseMetrics, refresh+refreshKey);
  const title = ar ? 'ملاحظات تقييم التحليل' : 'Analysis evaluation observations';
  const evaluation = current.data?.evaluation;
  const format = new Intl.NumberFormat(ar ? 'ar' : 'en', { maximumFractionDigits: 1 });
  return <section className="evaluation-observations" aria-label={title}><header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2>{title}</h2><p>{ar ? improvementAr.evaluationScope : improvementEn.evaluationScope}</p></div><label className="cuevo-section-header__filter">{ar ? improvementAr.analysisMode : improvementEn.analysisMode}<select value={mode} onChange={event => setMode(event.target.value as 'FIXTURE' | 'LIVE')}><option value="FIXTURE">{ar ? improvementAr.fixtureAnalysis : improvementEn.fixtureAnalysis}</option><option value="LIVE">{ar ? 'نموذج حي' : 'Live model'}</option></select></label></header>{current.loading ? <p role="status">{ar ? 'جارٍ تحميل الملاحظات…' : 'Loading observations…'}</p> : current.error ? <><LearningError error={current.error}/><Button type="button" variant="secondary" onClick={()=>setRefresh(value=>value+1)}>{ar?'المحاولة مجددًا':'Try again'}</Button></> : !evaluation ? <p className="notice">{ar ? 'لم تُنشأ سجلات تقييم لهذا السياق بعد.' : 'Evaluation observations are not established for this context yet.'}</p> : <><div className="cuevo-table-scroll" role="region" aria-label={ar ? 'جدول الملاحظات المسجّلة — تمرير الأعمدة' : 'Recorded observation table — scroll columns'} tabIndex={0}><table><caption>{ar ? 'البسط والمقام لكل ملاحظة مسجلة' : 'Numerator and denominator for each recorded observation'}</caption><thead><tr><th scope="col">{ar ? 'الملاحظة' : 'Observation'}</th><th scope="col">{ar ? 'العدد / المُقيّم' : 'Count / assessed'}</th><th scope="col">{ar ? 'النسبة' : 'Rate'}</th></tr></thead><tbody>{[
    { label: ar ? 'مخرجات اجتازت التحقق البنيوي' : 'Outputs accepted by structural checks', value: evaluation.structuralAcceptance },
    { label: ar ? 'خطوة مفيدة بحسب المراجعين' : 'Useful steps observed by reviewers', value: evaluation.usefulness },
    { label: ar ? 'ادعاء غير مدعوم لوحظ' : 'Unsupported claims observed', value: evaluation.unsupportedClaim },
    { label: ar ? 'مشكلة خصوصية لوحظت' : 'Privacy issues observed', value: evaluation.privacyIssue },
    { label: ar ? 'طلب أداة غير صالح لوحظ' : 'Invalid tool requests observed', value: evaluation.invalidTool },
    { label: ar ? 'رفض أو تعديل بشري مسجل' : 'Recorded human rejection or edit', value: evaluation.humanOverride },
  ].map(row => <tr key={row.label}><th scope="row">{row.label}</th><td><bdi>{format.format(row.value.numerator)} / {format.format(row.value.denominator)}</bdi></td><td>{row.value.rate === null ? (ar ? 'غير معروف' : 'Unknown') : <bdi>{format.format(row.value.rate * 100)}%</bdi>}</td></tr>)}</tbody></table></div><p>{ar ? 'محاولات لم تُقيّم مخرجاتها' : 'Attempts with output not assessed'}: <bdi>{format.format(evaluation.unevaluatedAttempts)}</bdi>. {ar ? 'سجلات قديمة بلا ملاحظة' : 'Legacy runs without an observation'}: <bdi>{format.format(evaluation.legacyUnobservedRuns)}</bdi>. {ar ? 'مراجعات بشرية مسجلة' : 'Recorded human reviews'}: <bdi>{format.format(evaluation.humanReviewCount)}</bdi>.</p></>}</section>;
}
