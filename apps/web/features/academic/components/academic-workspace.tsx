'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseReference, parseMarkingItem, parseReleasedResult, parseRubric } from '../model';
import { parseCourse, parseAssessment } from '../../learning/model';
import { academicAr, academicEn } from '../messages';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { ReferenceList } from './references';
import { MarkingQueue } from './marking';
import { ReleasedResults } from './results';
import { RubricList } from './rubrics';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import{ClassGradebook}from'./gradebook';
import type{NavigationIntent}from'../../../shared/session/navigation-intent';
import{useApiQuery}from'../../../shared/hooks/use-api';
import{LearningApiError}from'../../../shared/api/client';
import{nativeAcademicSourceSchema}from'@cuevo/contracts';
import{NativeResultView}from'./native-result';
import{ResultHistory}from'./result-history';

type Tab = 'references' | 'rubrics' | 'marking' | 'results' | 'gradebook';
const parseExactResult=(value:unknown)=>{const parsed=nativeAcademicSourceSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};

export function AcademicWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'academic'}>|null}={}) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const staff = membership?.role === 'teacher' || membership?.role === 'admin' || membership?.role === 'coordinator';
  const grader = membership?.role === 'teacher' || membership?.role === 'admin';
  const [tab, setTab] = useState<Tab>(grader ? 'marking' : 'results');
  const [refresh, setRefresh] = useState(0);
  const childContext = useChildContext(refresh);
  const [selected, setSelected] = useState<string | null>(null);
  const exactMark=useApiQuery(intent?.source==='marking'&&grader?`/v1/marking/${intent.id}`:null,parseMarkingItem,refresh);
  const exactResult=useApiQuery(intent?.source==='result'?`/v1/results/${intent.id}/source`:null,parseExactResult,refresh);
  const references = usePaginatedLearningQuery(staff && tab==='references' ? '/v1/academic-references?limit=100' : null, parseReference, refresh);
  const marking = usePaginatedLearningQuery(grader ? '/v1/marking?limit=100' : null, parseMarkingItem, refresh);
  const results = usePaginatedLearningQuery(childContext.parent ? childContext.child ? '/v1/learners/' + childContext.child.id + '/academic-report?limit=100' : null : '/v1/results?limit=100', parseReleasedResult, refresh);
  const rubrics = usePaginatedLearningQuery(staff ? '/v1/rubrics?limit=100' : null, parseRubric, refresh);
  const courses = usePaginatedLearningQuery(grader && tab === 'rubrics' ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const assessments = usePaginatedLearningQuery(grader && tab === 'rubrics' ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const tabs: Tab[] = [...(staff ? ['references' as const, 'rubrics' as const] : []), ...(grader ? ['marking' as const,'gradebook'as const] : []), 'results'];
  const active = tab==='gradebook'?null:tab === 'references' ? references : tab === 'rubrics' ? rubrics : tab === 'marking' ? marking : results;
  const loading = active?.loading || (tab === 'rubrics' && grader && (courses.loading || assessments.loading || !courses.loaded || !assessments.loaded));
  const error = active?.error ?? (tab === 'rubrics' && grader ? courses.error ?? assessments.error : null);
  function reload() { setRefresh((value) => value + 1); }
  if(intent?.source==='marking'&&!grader)return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{locale==='ar'?'العودة إلى الخطوة السابقة':'Back to the previous step'}</Button><LearningError error={new LearningApiError('denied')}/></section>;
  if(intent)return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{locale==='ar'?'العودة إلى الخطوة السابقة':'Back to the previous step'}</Button>{intent.source==='marking'?exactMark.error?<><LearningError error={exactMark.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exactMark.loading?<p role="status">{t.loading}</p>:exactMark.data?<MarkingQueue items={[exactMark.data]} selected={exactMark.data.id} onSelected={setSelected} onChanged={reload}/>:null:exactResult.error?<><LearningError error={exactResult.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exactResult.loading?<p role="status">{t.loading}</p>:exactResult.data?<><h2>{t.results}</h2><NativeResultView result={exactResult.data.nativeResult}/><ResultHistory resultId={exactResult.data.id}/></>:null}</section>;
  return <div className="academic-workspace"><ChildSelector context={childContext} /><aside className="synthetic-notice"><strong>{t.customNotice}</strong><p>{t.customBody}</p></aside><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.academic}>{tabs.map((value) => <button key={value} type="button" aria-pressed={value === tab} onClick={() => setTab(value)}>{t[value]}</button>)}</div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><RefreshCw size={15} aria-hidden="true" /></Button></div>{error ? <LearningError error={error} /> : loading ? <p role="status" className="learning-empty">{t.loading}</p> : tab==='gradebook'?<ClassGradebook key={refresh}/>:tab === 'references' ? <ReferenceList references={references.data ?? []} onChanged={reload} /> : tab === 'rubrics' ? <RubricList rubrics={rubrics.data} courses={courses.data} assessments={assessments.data} canCreate={grader} onChanged={reload} /> : tab === 'marking' ? <MarkingQueue items={marking.data ?? []} onChanged={reload} selected={selected} onSelected={setSelected} /> : childContext.parent && !childContext.child ? null : <ReleasedResults results={results.data ?? []} />}{!error && active && (!childContext.parent || childContext.child) ? <LoadMore query={active} /> : null}{tab === 'rubrics' && grader && !error ? <>{courses.nextCursor ? <div className="notice"><p>{t.course}</p><LoadMore query={courses} /></div> : null}{assessments.nextCursor ? <div className="notice"><p>{t.assessment}</p><LoadMore query={assessments} /></div> : null}</> : null}</div>;
}
