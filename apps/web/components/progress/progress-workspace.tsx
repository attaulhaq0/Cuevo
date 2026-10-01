'use client';

import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { RefreshCw } from 'lucide-react';
import { useApp } from '../providers';
import { parseLearnerState, parseObservation, parseSignal, type LearnerState, type Observation, type Signal } from '../../lib/learner-state';
import { parseList } from '../../lib/learning-types';
import { LearningApiError } from '../../lib/learning-api';
import { progressAr, progressEn } from '../../messages/progress';
import { useLearningQuery } from '../learning/use-learning';
import { usePaginatedLearningQuery } from '../learning/use-paginated-query';
import { LearningError } from '../learning/feedback';
import { LoadMore } from '../learning/load-more';
import { EvidenceDetail } from '../academic/results';

type Person = { userId: string; displayName: string; role: string };
function parsePeople(value: unknown): Person[] { return parseList(value, (item) => { if (!item || typeof item !== 'object' || !('userId' in item) || typeof item.userId !== 'string' || !('displayName' in item) || typeof item.displayName !== 'string' || !('role' in item) || typeof item.role !== 'string') throw new LearningApiError('invalid'); return item as Person; }); }

export function ProgressWorkspace() {
  const { membership, locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const own = membership?.role === 'student';
  const parent = membership?.role === 'parent';
  const [learnerId, setLearnerId] = useState<string | null>(own ? membership.userId : null);
  const [refresh, setRefresh] = useState(0);
  const people = useLearningQuery(own ? null : '/v1/people?limit=100', parsePeople, refresh);
  const learners = people.data?.filter((person) => person.role === 'student') ?? [];
  return <section className="progress-workspace"><div className="progress-toolbar">{!own ? <div className="field"><label htmlFor="learner-selection">{t.learner}</label><select id="learner-selection" value={learnerId ?? ''} onChange={(event) => setLearnerId(event.target.value || null)}><option value="">{t.chooseLearner}</option>{learners.map((learner) => <option key={learner.userId} value={learner.userId}>{learner.displayName}</option>)}</select><p className="learning-form__note">{t.selectorLimit}</p></div> : null}<Button type="button" variant="secondary" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" />{t.refresh}</Button></div>{people.error ? <LearningError error={people.error} /> : !own && people.loading ? <p role="status">{t.loading}</p> : !own && !learners.length ? <p className="learning-empty">{t.noLearners}</p> : null}{parent ? <p className="notice">{t.parentSafe}</p> : null}{learnerId ? <LearnerDetail key={learnerId} learnerId={learnerId} refresh={refresh} parent={parent} /> : null}</section>;
}

function LearnerDetail({ learnerId, refresh, parent }: { learnerId: string; refresh: number; parent: boolean }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const state = useLearningQuery(`/v1/learners/${learnerId}/state`, parseLearnerState, refresh);
  const observations = usePaginatedLearningQuery(parent ? null : `/v1/observations?limit=100&learnerId=${learnerId}`, parseObservation, refresh);
  const signals = usePaginatedLearningQuery(parent ? null : `/v1/signals?limit=100&learnerId=${learnerId}`, parseSignal, refresh);
  if (state.loading) return <p role="status" className="learning-empty">{t.loading}</p>;
  if (state.error) return <LearningError error={state.error} />;
  if (!state.data || state.data.learnerId !== learnerId) return <LearningError error={new LearningApiError('invalid')} />;
  return <div>{state.data.status === 'UNKNOWN' ? <div className="notice" role="status"><strong>{t.unknown}</strong><p>{t.unknownBody}</p></div> : state.data.freshness === 'STALE' ? <div className="notice" role="status"><strong>{t.stale}</strong><p>{t.staleBody}</p><p>{t.snapshotAsOf}: <bdi>{dateLabel(state.data.generatedAt, locale, t.unknown)}</bdi></p></div> : state.data.freshness === 'APPROVED_PROJECTION' ? <p className="learning-form__note">{t.parentSafe}</p> : <p className="learning-form__note">{t.snapshot} · {t.version}: {state.data.version} · {t.generatedAt}: <bdi>{dateLabel(state.data.generatedAt, locale, t.unknown)}</bdi></p>}<AcademicRows state={state.data} />{!parent ? <>
    <section className="progress-section"><h2>{t.development}</h2><p className="learning-form__note">{t.developmentBody}</p>{state.data.development.completeness === 'RECORDED_ONLY' ? <p className="learning-form__note"><strong>{t.recordedOnly}.</strong> {t.recordedOnlyBody}</p> : null}<p className="learning-form__note">{t.window}: <bdi>{dateLabel(state.data.development.windowStart, locale, t.unknown)} – {dateLabel(state.data.development.windowEnd, locale, t.unknown)}</bdi></p><dl className="observation-counts">{(['practice', 'revision', 'reflection'] as const).map((kind) => <div key={kind}><dt>{t[kind]}</dt><dd>{countLabel(state.data!.development[kind].count, locale, t.unknown)}{state.data!.development[kind].observationIds.length ? <details><summary>{t.sourceIds}</summary><ul className="source-id-list">{state.data!.development[kind].observationIds.map((id) => <li key={id}><bdi>{id}</bdi></li>)}</ul></details> : null}</dd></div>)}</dl></section>
    <section className="progress-section"><h2>{t.engagement}</h2><p className="learning-form__note">{t.engagementBody}</p><dl className="academic-facts"><div><dt>{t.completionCount}</dt><dd>{countLabel(state.data.engagement.completedActivityCount, locale, t.unknown)}</dd></div><div><dt>{t.lastCompleted}</dt><dd><bdi>{dateLabel(state.data.engagement.lastCompletedAt, locale, t.unknown)}</bdi></dd></div></dl></section>
    <section className="progress-section"><h2>{t.observations}</h2>{observations.loading ? <p role="status">{t.loading}</p> : observations.error ? <LearningError error={observations.error} /> : <ObservationRows observations={observations.data} />}<LoadMore query={observations} /></section>
    <section className="progress-section"><h2>{t.signals}</h2>{signals.loading ? <p role="status">{t.loading}</p> : signals.error ? <LearningError error={signals.error} /> : <SignalRows signals={signals.data} />}<LoadMore query={signals} /></section>
    <section className="progress-section"><h2>{t.support}</h2><p className="learning-form__note">{t.noSupport}</p><h2 className="progress-subheading">{t.impact}</h2><p className="learning-form__note">{t.unmeasured}</p></section>
  </> : null}</div>;
}

function AcademicRows({ state }: { state: LearnerState }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  return <section className="progress-section"><h2>{t.academic}</h2>{state.academic.length ? state.academic.map((row) => <article key={row.resultId} className="academic-row"><div className="learning-section-heading"><div><h3>{t.native}</h3><p>{t.reference}: <bdi>{row.referenceId}</bdi> · <bdi>{row.referenceVersion}</bdi></p></div><bdi className="learning-form__note">{dateLabel(row.observedAt, locale, t.unknown)}</bdi></div><div className="native-score"><strong>{new Intl.NumberFormat(locale).format(row.nativeResult.score)}</strong><span> / {new Intl.NumberFormat(locale).format(row.nativeResult.maxScore)}</span></div><p className="learning-form__note">{t.policy}: {row.nativeResult.policyVersion}</p><Button type="button" variant="quiet" aria-expanded={evidenceId === row.evidenceId} onClick={() => setEvidenceId(evidenceId === row.evidenceId ? null : row.evidenceId)}>{evidenceId === row.evidenceId ? t.closeEvidence : t.evidence}</Button>{evidenceId === row.evidenceId ? <EvidenceDetail evidenceId={row.evidenceId} /> : null}</article>) : <p className="learning-empty">{t.noAcademic}</p>}</section>;
}
function ObservationRows({ observations }: { observations: Observation[] }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  return observations.length ? <div>{observations.map((observation) => <article key={observation.id} className="observation-row"><div><h3>{t[observation.kind]}</h3><p><bdi>{dateLabel(observation.occurredAt, locale, t.unknown)}</bdi></p></div><details><summary>{t.sources}</summary><dl className="academic-facts"><div><dt>{t.sourceType}</dt><dd>{t.activityCompletion}</dd></div><div><dt>{t.sourceObject}</dt><dd><bdi>{observation.sourceObjectId}</bdi></dd></div><div><dt>{t.sources}</dt><dd><bdi>{observation.sourceEventId}</bdi></dd></div></dl></details></article>)}</div> : <p className="learning-empty">{t.noObservations}</p>;
}
function SignalRows({ signals }: { signals: Signal[] }) {
  const { locale } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  return signals.length ? <div>{signals.map((signal) => <article key={signal.id} className="academic-row"><div className="learning-section-heading"><h3>{t.practiceObserved}</h3><Status>{t.observationOnly}</Status></div><p>{t.count}: {new Intl.NumberFormat(locale).format(signal.count)}</p><p className="learning-form__note">{t.signalBody}</p><p className="learning-form__note">{t.window}: <bdi>{dateLabel(signal.windowStart, locale, t.unknown)} – {dateLabel(signal.windowEnd, locale, t.unknown)}</bdi></p><details><summary>{t.sources}</summary><p className="learning-form__note">{t.ruleVersion}: <bdi>{signal.ruleVersion}</bdi></p><ul className="source-id-list">{signal.sourceEventIds.map((id) => <li key={id}><bdi>{id}</bdi></li>)}</ul></details></article>)}</div> : <p className="learning-empty">{t.noSignals}</p>;
}
function dateLabel(value: string | null, locale: string, unknown: string) { return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : unknown; }
function countLabel(value: number | null, locale: string, unknown: string) { return value === null ? unknown : new Intl.NumberFormat(locale).format(value); }
