'use client';

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { academicReadingAr, academicReadingEn } from '../reference-result-messages';
import { currentSelectedResult, resultSelection, type ResultSelection } from '../reference-result-reading-model';

export function ExactReleasedResult({ source, pageHeading = false }: { source: ReturnType<typeof parseCurrentNativeSource>; pageHeading?: boolean }) {
  const { locale, membership, apiUrl, accessToken, accessGeneration, online } = useApp();
  const t = locale === 'ar' ? academicAr : academicEn;
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${source.id}:${source.revision}`;
  const parse = useCallback((value: unknown) => ({ ...parseAcademicHistoryResult(value, source, membership?.role ?? ''), scope }), [scope, source.submissionId, source.assessmentId, source.learnerId, membership?.role]);
  const history = usePaginatedLearningQuery(`/v1/results/${source.id}/history?limit=25`, parse, 0);
  const exact = history.data.find(row => row.scope === scope && row.id === source.id);
  const matches = exact && exact.submissionId === source.submissionId && exact.learnerId === source.learnerId && exact.referenceId === source.referenceId && exact.referenceVersion === source.referenceVersion && exact.evidenceId === source.evidenceId && exact.revision === source.revision && exact.policyVersion === source.policyVersion && sameNativeResult(exact.nativeResult, source.nativeResult);
  return <section aria-label={t.results}>{history.loading ? <p role="status">{t.loading}</p> : history.error ? <LearningError error={history.error} /> : exact ? matches ? <ReleasedResults exact pageHeading={pageHeading} results={[exact]} /> : <LearningError error={new LearningApiError('invalid')} /> : <><p className="notice">{t.learnerUnavailable}</p><NativeResultView result={source.nativeResult} /></>}<LoadMore query={history} label={t.resultHistory} /></section>;
}

export function ReleasedResults({ results, pageHeading = false, exact = false }: { results: ReleasedResult[]; pageHeading?: boolean; exact?: boolean }) {
  const { locale, membership, commandJournal, apiUrl, accessToken, online } = useApp();
  const t = locale === 'ar' ? academicAr : academicEn, r = locale === 'ar' ? academicReadingAr : academicReadingEn;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const pending = commandJournal.pending().find(command => /^\/v1\/results\/[^/]+\/publication$/.test(command.path));
  const pendingId = pending?.path.split('/')[3];
  const scope = `${membership?.schoolId}:${membership?.userId}:${membership?.role}:${apiUrl}:${accessToken}:${online}`;
  const [selection, setSelection] = useState<{ scope: string; value: ResultSelection } | null>(null);
  const selected = exact ? results[0] ?? null : selection?.scope === scope ? currentSelectedResult(results, selection.value) : null;
  const heading = useRef<HTMLHeadingElement>(null), directory = useRef<HTMLElement>(null), opener = useRef<HTMLElement | null>(null), focusReader = useRef(false), focusDirectory = useRef(false);
  useLayoutEffect(() => {
    if (focusReader.current && heading.current) { focusReader.current = false; heading.current.focus({ preventScroll: true }); (heading.current.closest('.academic-result-selected') ?? heading.current).scrollIntoView({ block: 'start', behavior: 'instant' }); }
    if (focusDirectory.current) { focusDirectory.current = false; const target = opener.current?.isConnected && opener.current.getClientRects().length ? opener.current : directory.current; target?.focus({ preventScroll: true }); }
  });
  function back() { if (pending) return; setSelection(null); focusDirectory.current = true; }
  return <section className={`academic-result-workspace${selected || selection?.scope === scope ? ' academic-result-workspace--selected' : ''}`}>
    {pageHeading ? null : <h2>{t.results}</h2>}
    <div className="academic-reading-grid">
      {!exact ? <section ref={directory} tabIndex={-1} className="academic-result-directory" aria-label={r.resultDirectory}>{results.length ? results.map(result => <Button key={result.id} type="button" variant="quiet" data-result-choice={result.id} disabled={!!pending} aria-pressed={selected?.id === result.id} onClick={event => { if (pending) return; opener.current = event.currentTarget; focusReader.current = true; setSelection({ scope, value: resultSelection(result) }); }}><CuevoIcon name="assessment" size={24} /><span><strong>{result.assessmentTitle ?? t.assessment}</strong>{membership && ['admin', 'teacher', 'coordinator'].includes(membership.role) ? <small>{result.learnerName ?? t.learnerUnavailable}</small> : null}<small>{result.referenceTitle ?? t.referenceMissing} · {t.revision} {new Intl.NumberFormat(locale).format(result.revision)} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(result.createdAt))} UTC</bdi></small></span><Status tone="positive">{t.published}</Status></Button>) : <p className="learning-empty">{t.emptyResults}</p>}</section> : null}
      {selected || selection?.scope === scope ? <section className="academic-result-selected">{!exact ? <Button type="button" variant="quiet" disabled={!!pending} onClick={back}>{r.resultBack}</Button> : null}{selected ? <ReleasedResultReading key={`${selected.id}:${selected.revision}`} result={selected} pageHeading={pageHeading} headingRef={heading} /> : <p role="status">{r.resultChanged}</p>}</section> : null}
    </div>
    {pendingId && pendingId !== selected?.id ? <section><p>{r.original}</p><ResultPublication resultId={pendingId} /></section> : null}
  </section>;
}

function ReleasedResultReading({ result, pageHeading, headingRef }: { result: ReleasedResult; pageHeading: boolean; headingRef: React.Ref<HTMLHeadingElement> }) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const RecordHeading = pageHeading ? 'h2' : 'h3', FeedbackHeading = pageHeading ? 'h3' : 'h4';
  return <article key={result.id} className="academic-row released-result" data-result-id={result.id}><header className="released-result__heading"><span className="released-result__symbol"><CuevoIcon name="assessment" variant="filled" size={28} /></span><div><RecordHeading ref={headingRef} tabIndex={-1}>{result.assessmentTitle ?? t.assessment}</RecordHeading>{membership && ['admin', 'teacher', 'coordinator'].includes(membership.role) ? <p className="academic-learner"><bdi>{result.learnerName ?? t.learnerUnavailable}</bdi></p> : null}<p>{result.referenceTitle ?? t.referenceMissing}</p></div><Status tone="positive">{t.published}</Status></header><div className="released-result__body"><section><NativeResultView result={result.nativeResult} /><p className="learning-form__note">{t.revision}: {new Intl.NumberFormat(locale).format(result.revision)} · <bdi>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(result.createdAt))} UTC</bdi></p>{result.model === 'numeric' ? <p className="learning-form__note">{t.nativeNote}</p> : null}</section><section className="released-result__feedback"><FeedbackHeading><CuevoIcon name="feedback" variant="filled" size={22} />{t.feedback}</FeedbackHeading><p className="lesson-content" dir="auto">{result.feedback}</p></section></div><div className="learning-actions"><ResultHistory resultId={result.id} anchor={result} /><ResultPublication resultId={result.id}/><Button type="button" variant="secondary" onClick={() => setEvidenceId(evidenceId === result.evidenceId ? null : result.evidenceId)} aria-expanded={evidenceId === result.evidenceId}><CuevoIcon name="assessment" size={18} />{evidenceId === result.evidenceId ? t.closeEvidence : t.evidence}</Button></div>{evidenceId === result.evidenceId ? <EvidenceDetail evidenceId={result.evidenceId} learnerId={result.learnerId} /> : null}<ThinkingFocusSnapshot type="result" sourceId={result.id}/><details><summary>{t.technicalDetails}</summary><p>{t.reference}: <bdi>{result.referenceId}</bdi> · <bdi>{result.referenceVersion}</bdi></p><p>{t.policy}: {new Intl.NumberFormat(locale).format(result.policyVersion)}</p></details></article>;
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
