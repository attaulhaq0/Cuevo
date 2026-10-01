'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { EvidenceDetail } from '../../academic/ui';
import { parseInsightContextEnvelope } from '../model';
import { improvementAr, improvementEn } from '../messages';

export function InsightContextDisclosure({ runId, learnerId, referenceId, baselineResultId }: { runId: string; learnerId: string; referenceId: string; baselineResultId: string }) {
  const { locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const query = useApiQuery(`/v1/intelligence/runs/${runId}/context`, parseInsightContextEnvelope, 0);
  if (query.loading) return <p role="status">{t.loading}</p>;
  if (query.error) return <LearningError error={query.error} />;
  if (!query.data || query.data.runId !== runId) return <LearningError error={new LearningApiError('invalid')} />;
  if (!query.data.context) return <p className="notice">{t.legacyContext}</p>;
  const context = query.data.context;
  if (context.learnerId !== learnerId || context.reference.id !== referenceId || !context.recentResults.some(result => result.resultId === baselineResultId)) return <LearningError error={new LearningApiError('invalid')} />;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const status = { ASSIGNED: t.assigned, COMPLETED: t.completed, MEASURED: t.measured, improved: t.improved, no_meaningful_change: t.noMeaningfulChange, inconclusive: t.inconclusive };
  return <section className="insight-context" aria-label={t.analysisContext}><h4>{t.analysisContext}</h4><p className="learning-form__note">{t.contextCoverage}</p><dl className="academic-facts"><div><dt>{t.referenceContext}</dt><dd>{context.reference.title} · <bdi>{context.reference.version}</bdi></dd></div><div><dt>{t.classContext}</dt><dd><bdi>{context.classId}</bdi></dd></div><div><dt>{t.courseContext}</dt><dd><bdi>{context.courseId}</bdi></dd></div></dl>
    <h5>{t.sourceResults}</h5>{context.recentResults.map(result => <article key={result.resultId}><p>{number(result.score)} / {number(result.maxScore)}</p><p className="learning-form__note">{t.baselineId}: <bdi>{result.resultId}</bdi> · <bdi>{result.referenceVersion}</bdi></p><Button type="button" variant="quiet" aria-expanded={evidenceId === result.evidenceId} onClick={() => setEvidenceId(evidenceId === result.evidenceId ? null : result.evidenceId)}>{t.evidence}</Button>{evidenceId === result.evidenceId ? <EvidenceDetail evidenceId={result.evidenceId} /> : null}</article>)}
    <h5>{t.recordedContext}</h5>{context.observations.length ? <ul>{context.observations.map(item => <li key={item.id}>{t.contextKinds[item.kind]} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.occurredAt))}</bdi><p><bdi>{item.id}</bdi> · <bdi>{item.sourceObjectId}</bdi> · <bdi>{item.sourceEventId}</bdi></p></li>)}</ul> : <p>{t.noRecordedContext}</p>}
    <h5>{t.priorContext}</h5>{context.priorInterventions.length ? context.priorInterventions.map(item => <article key={item.id}><p>{status[item.status]} · <bdi>{item.id}</bdi></p><p>{t.baselineId}: <bdi>{item.baselineResultId}</bdi></p>{item.outcome ? <><p>{status[item.outcome.status]} · {t.difference}: {number(item.outcome.difference)} · {t.threshold}: {number(item.outcome.minimumChange)}</p><p><bdi>{item.outcome.id}</bdi> · <bdi>{item.outcome.baselineResultId}</bdi> → <bdi>{item.outcome.followUpResultId}</bdi></p><p className="learning-form__note">{t.causalLimit}</p></> : <p>{t.unmeasured}</p>}</article>) : <p>{t.noPriorContext}</p>}
    <h5>{t.availableOptions}</h5>{context.learningOptions.length ? context.learningOptions.map(option => <article key={option.activityId}><h6>{option.title}</h6><p className="lesson-content">{option.instructions}</p><p className="learning-form__note">{t.contextKinds[option.kind]} · <bdi>{option.activityId}</bdi></p></article>) : <p>{t.noOptionsContext}</p>}
  </section>;
}
