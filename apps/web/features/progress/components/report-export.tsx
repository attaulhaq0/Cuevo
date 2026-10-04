'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { parseAcademicReport, renderAcademicReport, type AcademicReport } from '../report';
import { currentReportTheme } from '../report-theme';
import { NativeResultView } from '../../academic/ui';
import { progressAr, progressEn } from '../messages';
import{usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';
import{parseSchoolRow}from'../../school/model';
import{LoadMore}from'../../../shared/components/load-more';
export function ReportExport({ learnerId }: { learnerId: string }) {
  const { locale, membership, accessToken, online, accessGeneration } = useApp(); const { request } = useApi(); const t = locale === 'ar' ? progressAr : progressEn; const [pending, setPending] = useState(false); const [error, setError] = useState<LearningApiError | null>(null);
  const [report, setReport] = useState<AcademicReport | null>(null); const [cursor, setCursor] = useState<string | null>(null); const [previous, setPrevious] = useState<(string | null)[]>([]);
  const[periodId,setPeriodId]=useState('');const periods=usePaginatedLearningQuery(membership?.entitlements.includes('school.operations')?`/v1/learners/${learnerId}/report-periods?limit=25`:null,parseSchoolRow,accessGeneration);
  const scope = `${membership?.schoolId}:${membership?.userId}:${learnerId}:${periodId}:${accessToken ?? ''}:${online}:${accessGeneration}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const controller = useRef<AbortController | null>(null);
  const root = useRef<HTMLElement>(null);
  const [combined, setCombined] = useState(false);
  useEffect(() => { setPending(false); setError(null); setReport(null); setCursor(null); setPrevious([]); setCombined(false); return () => { controller.current?.abort(); }; }, [scope]);
  async function operate(mode: 'show' | 'download' | 'next' | 'previous' | 'combined') {
    if (pending || !membership || !accessToken || !online) return;
    setPending(true); setError(null); setReport(null); setCombined(false);
    const expectedScope = scope; const active = new AbortController(); controller.current?.abort(); controller.current = active;
    try {
      const desiredCursor = mode === 'combined' ? null : mode === 'next' ? report?.nextCursor ?? null : mode === 'previous' ? previous.at(-1) ?? null : cursor;
      const periodFilter=periodId?`&periodId=${periodId}`:'';
      const context = { schoolId: membership.schoolId, learnerId, periodId, parent: membership.role === 'parent' };
      let current = parseAcademicReport(await request(`/v1/learners/${learnerId}/academic-report?limit=25${desiredCursor ? `&cursor=${desiredCursor}` : ''}${periodFilter}`, { signal: active.signal }), context);
      if (active.signal.aborted || currentScope.current !== expectedScope) return;
      let combinedItems = current.items;
      if (mode === 'combined') {
        const seen = new Set<string>();
        for (let page = 1; current.nextCursor && page < 40; page++) {
          if (seen.has(current.nextCursor)) throw new LearningApiError('invalid');
          seen.add(current.nextCursor);
          const next = parseAcademicReport(await request(`/v1/learners/${learnerId}/academic-report?limit=25&cursor=${current.nextCursor}${periodFilter}`, { signal: active.signal }), context);
          if (active.signal.aborted || currentScope.current !== expectedScope) return;
          if (JSON.stringify(next.period)!==JSON.stringify(current.period) || next.items.some(item => combinedItems.some(previous => previous.id === item.id))) throw new LearningApiError('invalid');
          combinedItems = [...combinedItems, ...next.items]; current = next;
        }
      }
      if (mode === 'next') setPrevious(values => [...values, cursor]);
      if (mode === 'previous') setPrevious(values => values.slice(0, -1));
      if (mode !== 'combined') { setCursor(desiredCursor); setReport(current); setCombined(false); }
      if (mode === 'download' || mode === 'combined') {
        const workspace = root.current?.closest('.workspace');
        const rendered = renderAcademicReport(mode === 'combined' ? { ...current, items: combinedItems } : current, locale, workspace ? currentReportTheme(workspace) : undefined);
        const url = URL.createObjectURL(new Blob([rendered], { type: 'text/html;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `cuevo-current-results-${locale}-page-${previous.length + 1}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (mode === 'combined') setCombined(true);
      }
    } catch (failure) { if (!active.signal.aborted && currentScope.current === expectedScope) { setReport(null); setCursor(null); setPrevious([]); setCombined(false); setError(failure instanceof LearningApiError ? failure : new LearningApiError('invalid')); } }
    finally { if (!active.signal.aborted && currentScope.current === expectedScope) setPending(false); }
  }
  return <section ref={root} className="progress-section" aria-label={t.currentResultPages}><header className="cuevo-section-header"><div className="cuevo-section-header__context"><div className="field"><label htmlFor="report-period">{locale==='ar'?'فترة التقرير':'Report period'}</label><select id="report-period" value={periodId} disabled={pending} onChange={event=>setPeriodId(event.target.value)}><option value="">{locale==='ar'?'كل النتائج الحالية':'All current results'}</option>{periods.data.map(period=><option key={period.id} value={period.id}>{String(period.name)} · {String(period.startsOn)}–{String(period.endsOn)}</option>)}</select><LoadMore query={periods}/>{periods.error?<LearningError error={periods.error}/>:null}</div><p className="learning-form__note">{t.reportNote}</p></div><div className="learning-actions"><Button type="button" variant="secondary" disabled={pending} onClick={() => void operate('download')}>{pending ? t.loading : t.exportReport}</Button><Button type="button" variant="quiet" disabled={pending} onClick={() => void operate('show')}>{t.currentResultPages}</Button><Button type="button" variant="quiet" disabled={pending} onClick={() => void operate('combined')}>{t.exportCombined}</Button></div></header>{combined ? <p className="notice">{t.combinedReportNote}</p> : null}{error ? <LearningError error={error} /> : null}{report ? <><h3><bdi>{report.learnerName ?? t.learner}</bdi></h3>{report.period?<p>{report.period.name} · {report.period.startsOn}–{report.period.endsOn}</p>:null}<p><bdi>{report.schoolName}</bdi> · {t.reportPage} {new Intl.NumberFormat(locale).format(previous.length + 1)}</p>{report.items.map(item => <article className="academic-row" key={item.id}><h4>{item.assessmentTitle}</h4><NativeResultView result={item.nativeResult} /><p>{item.feedback}</p><p>{item.referenceTitle} · <bdi>{item.referenceVersion}</bdi></p></article>)}{!report.items.length ? <p>{t.noAcademic}</p> : null}<div className="learning-actions">{previous.length ? <Button type="button" variant="secondary" disabled={pending} onClick={() => void operate('previous')}>{t.previousReportPage}</Button> : null}{report.nextCursor ? <Button type="button" variant="secondary" disabled={pending} onClick={() => void operate('next')}>{t.nextReportPage}</Button> : <p>{t.currentPagesFinished}</p>}</div></> : null}</section>;
}
