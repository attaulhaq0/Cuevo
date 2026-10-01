'use client';
import { useState } from 'react';
import { classLearningSummarySchema, type ClassLearningSummary } from '@cuevo/contracts';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { parseList } from '../../../shared/api/responses';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { parseChoice } from '../../learning/model';
import { EvidenceDetail, NativeResultView } from '../../academic/ui';
import { progressAr, progressEn } from '../messages';

const classesParser = (value: unknown) => parseList(value, parseChoice);
function summaryParser(value: unknown): ClassLearningSummary {
  const parsed = classLearningSummarySchema.safeParse(value); if (!parsed.success) throw new LearningApiError('invalid'); return parsed.data;
}

export function ClassLearningSummaryPanel({ refresh, onReviewLearner }: { refresh: number; onReviewLearner: (id: string) => void }) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const [classId, setClassId] = useState(''); const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null); const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const classes = useApiQuery('/v1/classes?limit=100', classesParser, refresh);
  const summary = useApiQuery(classId ? `/v1/classes/${classId}/learning-summary?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}` : null, summaryParser, refresh);
  const number = (value: number | null) => value === null ? t.unknown : new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const data = summary.data?.classId === classId && summary.data.schoolId === membership?.schoolId ? summary.data : null;
  return <section className="progress-section class-learning-summary" aria-label={t.classSummary}><h2>{t.classSummary}</h2><p className="learning-form__note">{t.classSummaryBody}</p>
    <div className="field"><label htmlFor="summary-class">{t.class}</label><select id="summary-class" value={classId} onChange={event => { setClassId(event.target.value); setCursor(null); setExpanded(null); setEvidenceId(null); }}><option value="">{t.chooseClass}</option>{classes.data?.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
    {classes.loading ? <p role="status">{t.loading}</p> : classes.error ? <LearningError error={classes.error} /> : !classes.data?.length ? <p className="learning-empty">{t.noClasses}</p> : null}
    {summary.loading ? <p role="status">{t.loading}</p> : summary.error ? <LearningError error={summary.error} /> : classId && !data ? <LearningError error={new LearningApiError('invalid')} /> : data ? <>
      <p className="notice"><strong>{t.coverageUnknown}</strong><br />{t.classCoverageNote}</p><p className="learning-form__note"><strong>{t.recordedClassActions}</strong>. {t.recordedOnlyBody}</p>
      <p className="learning-form__note">{t.generatedAt}: <bdi>{date(data.generatedAt)}</bdi> · {t.window}: <bdi>{data.windowStart && data.windowEnd ? `${date(data.windowStart)} – ${date(data.windowEnd)}` : t.unknown}</bdi></p>
      {data.items.map(item => <article className="academic-row class-summary-row" key={item.learnerId} data-class-learner-id={item.learnerId}><div className="learning-section-heading"><h3><bdi>{item.learnerName}</bdi></h3><Button type="button" variant="secondary" onClick={() => onReviewLearner(item.learnerId)}>{t.reviewLearner}</Button></div>
        <dl className="academic-facts"><div><dt>{t.numericRecords}</dt><dd>{number(item.academic.numericCount)}</dd></div><div><dt>{t.rubricRecords}</dt><dd>{number(item.academic.rubricCount)}</dd></div>{(['practice', 'revision', 'reflection'] as const).map(kind => <div key={kind}><dt>{t[kind]}</dt><dd>{number(item.observed[kind].count)}</dd></div>)}<div><dt>{t.assigned}</dt><dd>{number(item.support.assignedCount)}</dd></div><div><dt>{t.completed}</dt><dd>{number(item.support.completedCount)}</dd></div><div><dt>{t.measured}</dt><dd>{number(item.support.measuredCount)}</dd></div><div><dt>{t.improvedOutcomes}</dt><dd>{number(item.outcomes.improvedCount)}</dd></div><div><dt>{t.unchangedOutcomes}</dt><dd>{number(item.outcomes.noMeaningfulChangeCount)}</dd></div><div><dt>{t.inconclusiveOutcomes}</dt><dd>{number(item.outcomes.inconclusiveCount)}</dd></div></dl>
        {!item.academic.numericCount && !item.academic.rubricCount ? <Status tone="warning">{t.noClassEvidence}</Status> : null}<Button type="button" variant="quiet" aria-expanded={expanded === item.learnerId} onClick={() => { setExpanded(expanded === item.learnerId ? null : item.learnerId); setEvidenceId(null); }}>{t.classSources}</Button>
        {expanded === item.learnerId ? <section aria-label={t.classSources}>{item.academic.sources.map(source => <article className="class-native-source" key={source.resultId}><NativeResultView result={source.nativeResult} /><p className="learning-form__note">{t.reference}: <bdi>{source.referenceId}</bdi> · <bdi>{source.referenceVersion}</bdi></p><p className="learning-form__note">{t.resultId}: <bdi>{source.resultId}</bdi> · {t.occurredAt}: <bdi>{date(source.observedAt)}</bdi></p><Button type="button" variant="quiet" aria-expanded={evidenceId === source.evidenceId} onClick={() => setEvidenceId(evidenceId === source.evidenceId ? null : source.evidenceId)}>{t.evidence}</Button>{evidenceId === source.evidenceId ? <EvidenceDetail evidenceId={source.evidenceId} /> : null}</article>)}{item.academic.moreSources ? <p className="learning-form__note">{t.moreClassSources}</p> : null}<dl className="academic-facts">{(['practice', 'revision', 'reflection'] as const).map(kind => <div key={kind}><dt>{t[kind]} · {t.sourceIds}</dt><dd>{item.observed[kind].observationIds.map(id => <p key={id}><bdi>{id}</bdi></p>)}{item.observed[kind].moreSourceIds ? <p>{t.moreClassSources}</p> : null}</dd></div>)}<div><dt>{t.supportSource}</dt><dd>{item.support.interventionIds.map(id => <p key={id}><bdi>{id}</bdi></p>)}{item.support.assignedCount + item.support.completedCount + item.support.measuredCount > item.support.interventionIds.length ? <p>{t.moreClassSources}</p> : null}</dd></div><div><dt>{t.measurementSources}</dt><dd>{item.outcomes.measurementIds.map(id => <p key={id}><bdi>{id}</bdi></p>)}{item.outcomes.improvedCount + item.outcomes.noMeaningfulChangeCount + item.outcomes.inconclusiveCount > item.outcomes.measurementIds.length ? <p>{t.moreClassSources}</p> : null}</dd></div></dl></section> : null}
      </article>)}{!data.items.length ? <p className="learning-empty">{t.noClassLearners}</p> : null}<div className="learning-actions">{cursor ? <Button type="button" variant="quiet" onClick={() => { setCursor(null); setExpanded(null); setEvidenceId(null); }}>{t.firstClassPage}</Button> : null}{data.nextCursor ? <Button type="button" variant="secondary" onClick={() => { setCursor(data.nextCursor); setExpanded(null); setEvidenceId(null); }}>{t.nextClassPage}</Button> : null}</div>
    </> : null}
  </section>;
}
