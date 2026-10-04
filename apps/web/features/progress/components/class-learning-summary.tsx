'use client';
import { useCallback, useEffect, useState } from 'react';
import { type ClassLearningSummary } from '@cuevo/contracts';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import {usePaginatedLearningQuery} from '../../../shared/hooks/use-paginated-query';
import {LoadMore} from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { parseChoice,choiceLabel } from '../../learning/model';
import { EvidenceDetail, NativeResultView } from '../../academic/ui';
import { progressAr, progressEn } from '../messages';
import { coordinatorClassChoices, currentClassSummary, currentCoordinatorClasses, parseCurrentClassSummary } from '../model';
import { CoordinatorClassDirectoryRow } from './coordinator-class-directory';

export function ClassLearningSummaryPanel({ refresh, onReviewLearner, selectedLearnerId, labelContext, onLearnerContext }: { refresh: number; onReviewLearner: (id: string, label: string) => void; selectedLearnerId: string | null; labelContext: string; onLearnerContext: (id: string, label: string | null, context: string) => void }) {
  const { locale, membership, accessToken, accessGeneration, apiUrl, online } = useApp(); const t = locale === 'ar' ? progressAr : progressEn;
  const coordinator=membership?.role==='coordinator';
  const [classId, setClassId] = useState(''); const [cursor, setCursor] = useState<string | null>(null);
  const [expandedIntent, setExpandedIntent] = useState<{id:string;scope:string}|null>(null); const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const classScope=`${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken??''}:${online}:${accessGeneration}:${refresh}`;
  const parseCoordinatorChoice=useCallback((value:unknown)=>({...parseChoice(value),scope:classScope}),[classScope]);
  const classes = usePaginatedLearningQuery('/v1/classes?limit=100', coordinator?parseCoordinatorChoice:parseChoice, refresh);
  const classRows=coordinator?currentCoordinatorClasses(classes.data,classScope):classes.data;
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken ?? ''}:${online}:${classId}:${cursor}:${refresh}:${accessGeneration}`;
  const expanded=expandedIntent&&(!coordinator||expandedIntent.scope===scope)?expandedIntent.id:null;
  const setExpanded=(id:string|null)=>setExpandedIntent(id?{id,scope}:null);
  const summaryParser = useCallback((value: unknown): { scope: string; value: ClassLearningSummary } => {
    return { scope, value: parseCurrentClassSummary(value,membership?.schoolId??'',classId) };
  }, [scope, membership?.schoolId, classId]);
  const classesComplete=classes.loaded&&!classes.loading&&!classes.loadingMore&&!classes.error&&!classes.moreError&&!classes.nextCursor&&(!coordinator||classRows.length===classes.data.length);
  const classChoices=coordinatorClassChoices(classRows,classesComplete,t.classContextUnavailable);
  const classCurrent=!coordinator||classChoices.some(row=>row.value===classId&&!row.requiresReview);
  const summary = useApiQuery(classId&&classCurrent ? `/v1/classes/${classId}/learning-summary?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}` : null, summaryParser, refresh);
  const number = (value: number | null) => value === null ? t.unknown : new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const data = classCurrent?currentClassSummary(summary.data,scope,summary.loading,!!summary.error):null;
  const selectedCandidate = !classes.loading && !classes.error && !summary.loading && !summary.error ? data?.items.find(item => item.learnerId === selectedLearnerId) : null;
  const selected=selectedCandidate&&(!coordinator||selectedCandidate.learnerName.trim()&&data?.items.filter(item=>item.learnerName===selectedCandidate.learnerName).length===1)?selectedCandidate:null;
  const currentClass = classRows.find(item => item.id === classId);
  const currentLabel = selected && currentClass ? [selected.learnerName, choiceLabel(currentClass)].join(' · ') : null;
  useEffect(() => {
    if (selectedLearnerId) onLearnerContext(selectedLearnerId, currentLabel, labelContext);
  }, [selectedLearnerId, currentLabel, labelContext, onLearnerContext]);
  const resetSelection=()=>{setExpanded(null);setEvidenceId(null);if(coordinator)onReviewLearner('','');};
  return <section className="progress-section class-learning-summary" data-coordinator={coordinator} aria-label={t.classSummary}><header className="class-summary-header"><div><h2>{t.classSummary}</h2><p className="learning-form__note">{coordinator?t.coordinatorClassGuide:t.classSummaryBody}</p></div>
    <div className="field"><label htmlFor="summary-class">{t.class}</label><select id="summary-class" value={classCurrent?classId:''} disabled={coordinator&&!classesComplete} onChange={event => { setClassId(event.target.value); setCursor(null); resetSelection(); }}><option value="">{t.chooseClass}</option>{coordinator?classChoices.map(item=><option value={item.value} key={item.value} disabled={item.requiresReview}>{item.label}</option>):classes.data.map(item => <option value={item.id} key={item.id}>{choiceLabel(item)}</option>)}</select><LoadMore query={classes}/>{coordinator&&!classes.error&&(!classesComplete||classChoices.some(row=>row.requiresReview))?<p className="learning-form__note">{t.classChoicesReview}</p>:null}</div>
    {classes.loading ? <p role="status">{t.loading}</p> : classes.error ? <LearningError error={classes.error} /> : !classes.data?.length ? <p className="learning-empty">{t.noClasses}</p> : null}</header>
    {summary.loading ? <p role="status">{t.loading}</p> : summary.error ? <LearningError error={summary.error} /> : classId&&classCurrent&&!data ? <LearningError error={new LearningApiError('invalid')} /> : data ? <>
      {coordinator?<details className="coordinator-class-context"><summary>{t.coverageUnknown} · {t.recordedClassActions}</summary><p>{t.classCoverageNote}</p><p>{t.recordedOnlyBody}</p></details>:<><p className="notice"><strong>{t.coverageUnknown}</strong><br />{t.classCoverageNote}</p><p className="learning-form__note"><strong>{t.recordedClassActions}</strong>. {t.recordedOnlyBody}</p></>}
      <p className="learning-form__note">{t.generatedAt}: <bdi>{date(data.generatedAt)}</bdi> · {t.window}: <bdi>{data.windowStart && data.windowEnd ? `${date(data.windowStart)} – ${date(data.windowEnd)}` : t.unknown}</bdi></p>
      {data.items.map(item => {const review=()=>onReviewLearner(item.learnerId,[item.learnerName,choiceLabel(currentClass??{id:classId,name:t.classContextUnavailable})].join(' · '));const sources=()=>{setExpanded(expanded===item.learnerId?null:item.learnerId);setEvidenceId(null);};const reading=expanded===item.learnerId?<ClassRecordSources item={item} locale={locale} evidenceId={evidenceId} onEvidence={setEvidenceId}/>:null;return coordinator?<CoordinatorClassDirectoryRow key={item.learnerId} item={item} locale={locale} reviewAllowed={!!item.learnerName.trim()&&data.items.filter(row=>row.learnerName===item.learnerName).length===1} selected={selectedLearnerId===item.learnerId} onReview={review} onSources={sources} sourcesOpen={expanded===item.learnerId}>{reading}</CoordinatorClassDirectoryRow>:<article className="academic-row class-summary-row" key={item.learnerId} data-class-learner-id={item.learnerId}><div className="learning-section-heading"><h3><bdi>{item.learnerName}</bdi></h3><Button type="button" variant="secondary" onClick={review}>{t.reviewLearner}</Button></div>
        <dl className="academic-facts"><div><dt>{t.numericRecords}</dt><dd>{number(item.academic.numericCount)}</dd></div><div><dt>{t.rubricRecords}</dt><dd>{number(item.academic.rubricCount)}</dd></div>{(['practice', 'revision', 'reflection'] as const).map(kind => <div key={kind}><dt>{t[kind]}</dt><dd>{number(item.observed[kind].count)}</dd></div>)}<div><dt>{t.assigned}</dt><dd>{number(item.support.assignedCount)}</dd></div><div><dt>{t.completed}</dt><dd>{number(item.support.completedCount)}</dd></div><div><dt>{t.measured}</dt><dd>{number(item.support.measuredCount)}</dd></div><div><dt>{t.improvedOutcomes}</dt><dd>{number(item.outcomes.improvedCount)}</dd></div><div><dt>{t.unchangedOutcomes}</dt><dd>{number(item.outcomes.noMeaningfulChangeCount)}</dd></div><div><dt>{t.inconclusiveOutcomes}</dt><dd>{number(item.outcomes.inconclusiveCount)}</dd></div></dl>
        {!item.academic.numericCount && !item.academic.rubricCount ? <Status tone="warning">{t.noClassEvidence}</Status> : null}<Button type="button" variant="quiet" aria-expanded={expanded === item.learnerId} onClick={() => { setExpanded(expanded === item.learnerId ? null : item.learnerId); setEvidenceId(null); }}>{t.classSources}</Button>
        {reading}
      </article>})}{!data.items.length ? <p className="learning-empty">{t.noClassLearners}</p> : null}<div className="learning-actions">{cursor ? <Button type="button" variant="quiet" onClick={() => { setCursor(null); resetSelection(); }}>{t.firstClassPage}</Button> : null}{data.nextCursor ? <Button type="button" variant="secondary" onClick={() => { setCursor(data.nextCursor); resetSelection(); }}>{t.nextClassPage}</Button> : null}</div>
    </> : null}
  </section>;
}

function ClassRecordSources({item,locale,evidenceId,onEvidence}:{item:ClassLearningSummary['items'][number];locale:'en'|'ar';evidenceId:string|null;onEvidence:(id:string|null)=>void}){const t=locale==='ar'?progressAr:progressEn,date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));return <section aria-label={t.classSources}>{item.academic.sources.map(source=><article className="class-native-source" key={source.resultId}><NativeResultView result={source.nativeResult}/><p className="learning-form__note">{t.occurredAt}: <bdi>{date(source.observedAt)}</bdi></p><Button type="button" variant="quiet" aria-expanded={evidenceId===source.evidenceId} onClick={()=>onEvidence(evidenceId===source.evidenceId?null:source.evidenceId)}>{t.evidence}</Button>{evidenceId===source.evidenceId?<EvidenceDetail evidenceId={source.evidenceId} learnerId={item.learnerId}/>:null}<details><summary>{t.technicalDetails}</summary><p>{t.reference}: <bdi>{source.referenceId}</bdi> · <bdi>{source.referenceVersion}</bdi></p><p>{t.resultId}: <bdi>{source.resultId}</bdi></p></details></article>)}{!item.academic.sources.length?<p>{t.noClassEvidence}</p>:null}{item.academic.moreSources?<p className="learning-form__note">{t.moreClassSources}</p>:null}<details><summary>{t.technicalDetails}</summary><dl className="academic-facts">{(['practice','revision','reflection']as const).map(kind=><div key={kind}><dt>{t[kind]} · {t.sourceIds}</dt><dd>{item.observed[kind].observationIds.map(id=><p key={id}><bdi>{id}</bdi></p>)}{item.observed[kind].moreSourceIds?<p>{t.moreClassSources}</p>:null}</dd></div>)}<div><dt>{t.supportSource}</dt><dd>{item.support.interventionIds.map(id=><p key={id}><bdi>{id}</bdi></p>)}{item.support.assignedCount+item.support.completedCount+item.support.measuredCount>item.support.interventionIds.length?<p>{t.moreClassSources}</p>:null}</dd></div><div><dt>{t.measurementSources}</dt><dd>{item.outcomes.measurementIds.map(id=><p key={id}><bdi>{id}</bdi></p>)}{item.outcomes.improvedCount+item.outcomes.noMeaningfulChangeCount+item.outcomes.inconclusiveCount>item.outcomes.measurementIds.length?<p>{t.moreClassSources}</p>:null}</dd></div></dl></details></section>;}
