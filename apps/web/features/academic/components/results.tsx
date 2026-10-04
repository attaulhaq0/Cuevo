'use client';

import { useCallback, useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseEvidence, parseAcademicHistoryResult, parseCurrentNativeSource, sameNativeResult, type ReleasedResult } from '../model';
import { academicAr, academicEn } from '../messages';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { NativeResultView } from './native-result';
import{ResultHistory}from'./result-history';
import{ResultPublication}from'./publication';
import { LearningApiError } from '../../../shared/api/client';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { EvidenceReading } from './evidence-reading';
import { ThinkingFocusSnapshot } from '../../learning/ui';

export function ExactReleasedResult({ source }: { source: ReturnType<typeof parseCurrentNativeSource> }) {
  const { locale, membership, apiUrl, accessToken, accessGeneration, online } = useApp();
  const t = locale === 'ar' ? academicAr : academicEn;
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${source.id}:${source.revision}`;
  const parse = useCallback((value: unknown) => ({ ...parseAcademicHistoryResult(value, source, membership?.role ?? ''), scope }), [scope, source.submissionId, source.assessmentId, source.learnerId, membership?.role]);
  const history = usePaginatedLearningQuery(`/v1/results/${source.id}/history?limit=25`, parse, 0);
  const exact = history.data.find(row => row.scope === scope && row.id === source.id);
  const matches = exact && exact.submissionId === source.submissionId && exact.learnerId === source.learnerId && exact.referenceId === source.referenceId && exact.referenceVersion === source.referenceVersion && exact.evidenceId === source.evidenceId && exact.revision === source.revision && exact.policyVersion === source.policyVersion && sameNativeResult(exact.nativeResult, source.nativeResult);
  return <section aria-label={t.results}>{history.loading ? <p role="status">{t.loading}</p> : history.error ? <LearningError error={history.error} /> : exact ? matches ? <ReleasedResults results={[exact]} /> : <LearningError error={new LearningApiError('invalid')} /> : <><p className="notice">{t.learnerUnavailable}</p><NativeResultView result={source.nativeResult} /></>}<LoadMore query={history} label={t.resultHistory} /></section>;
}

export function ReleasedResults({ results }: { results: ReleasedResult[] }) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  return results.length ? <section className="released-results"><h2>{t.results}</h2>{results.map(result => <article key={result.id} className="academic-row released-result" data-result-id={result.id}><header className="released-result__heading"><span className="released-result__symbol"><CuevoIcon name="assessment" variant="filled" size={28} /></span><div><h3>{result.assessmentTitle ?? t.assessment}</h3>{membership && ['admin', 'teacher', 'coordinator'].includes(membership.role) ? <p className="academic-learner"><bdi>{result.learnerName ?? t.learnerUnavailable}</bdi></p> : null}<p>{result.referenceTitle ?? t.referenceMissing}</p></div><Status tone="positive">{t.published}</Status></header><div className="released-result__body"><section><NativeResultView result={result.nativeResult} /><p className="learning-form__note">{t.revision}: {new Intl.NumberFormat(locale).format(result.revision)}</p>{result.model === 'numeric' ? <p className="learning-form__note">{t.nativeNote}</p> : null}</section><section className="released-result__feedback"><h4><CuevoIcon name="feedback" variant="filled" size={22} />{t.feedback}</h4><p className="lesson-content" dir="auto">{result.feedback}</p></section></div><div className="learning-actions"><ResultHistory resultId={result.id} anchor={result} /><ResultPublication resultId={result.id}/><Button type="button" variant="secondary" onClick={() => setEvidenceId(evidenceId === result.evidenceId ? null : result.evidenceId)} aria-expanded={evidenceId === result.evidenceId}><CuevoIcon name="assessment" size={18} />{evidenceId === result.evidenceId ? t.closeEvidence : t.evidence}</Button></div>{evidenceId === result.evidenceId ? <EvidenceDetail evidenceId={result.evidenceId} learnerId={result.learnerId} /> : null}<ThinkingFocusSnapshot type="result" sourceId={result.id}/><details><summary>{t.technicalDetails}</summary><p>{t.reference}: <bdi>{result.referenceId}</bdi> · <bdi>{result.referenceVersion}</bdi></p><p>{t.policy}: {new Intl.NumberFormat(locale).format(result.policyVersion)}</p></details></article>)}</section> : <p className="learning-empty">{t.emptyResults}</p>;
}

export function EvidenceDetail({ evidenceId, learnerId }: { evidenceId: string; learnerId?: string }) {
  const { locale, membership, apiUrl, accessToken, accessGeneration, online } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${evidenceId}`;
  const parse = useCallback((value: unknown) => {
    const evidence = parseEvidence(value);
    if (evidence.id !== evidenceId || learnerId !== undefined && evidence.learnerId !== learnerId || membership?.role === 'student' && evidence.learnerId !== membership.userId || membership?.role === 'parent' && evidence.visibility !== 'PARENT_APPROVED') throw new LearningApiError('invalid');
    return { scope, value: evidence };
  }, [scope, evidenceId, learnerId, membership?.role, membership?.userId]);
  const query = useApiQuery(`/v1/evidence/${evidenceId}`, parse, 0);
  if (query.loading) return <p role="status">{t.evidence}…</p>;
  if (query.error) return <LearningError error={query.error} />;
  if (!query.data || query.data.scope !== scope) return <p>{t.evidenceMissing}</p>;
  const evidence = query.data.value;
  return <EvidenceReading evidence={evidence} />;
}
