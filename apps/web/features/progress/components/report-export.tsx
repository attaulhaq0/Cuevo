'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { parseAcademicReport, renderAcademicReport } from '../report';
import { progressAr, progressEn } from '../messages';
export function ReportExport({ learnerId }: { learnerId: string }) {
  const { locale, membership } = useApp(); const { request } = useApi(); const t = locale === 'ar' ? progressAr : progressEn; const [pending, setPending] = useState(false); const [error, setError] = useState<LearningApiError | null>(null);
  async function download() { if (pending || !membership) return; setPending(true); setError(null); try { const report = parseAcademicReport(await request(`/v1/learners/${learnerId}/academic-report?limit=25`)); if (report.learnerId !== learnerId || report.schoolId !== membership.schoolId) throw new LearningApiError('invalid'); const url = URL.createObjectURL(new Blob([renderAcademicReport(report, locale)], { type: 'text/html;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `cuevo-current-results-${learnerId}-${locale}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (failure) { setError(failure instanceof LearningApiError ? failure : new LearningApiError('invalid')); } finally { setPending(false); } }
  return <section className="progress-section"><Button type="button" variant="secondary" disabled={pending} onClick={() => void download()}>{pending ? t.loading : t.exportReport}</Button><p className="learning-form__note">{t.reportNote}</p>{error ? <LearningError error={error} /> : null}</section>;
}
