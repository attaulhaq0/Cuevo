'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseReference, parseMarkingItem, parseReleasedResult, parseRubric, parseCurrentMarking, parseCurrentNativeSource, parseLearnerReleasedResult, parseCurrentAcademicReport } from '../model';
import { parseCourse, parseAssessment } from '../../learning/model';
import { academicAr, academicEn } from '../messages';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { ReferenceList } from './references';
import { MarkingQueue } from './marking';
import { ExactReleasedResult, ReleasedResults } from './results';
import { RubricList } from './rubrics';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import{ClassGradebook}from'./gradebook';
import type{NavigationIntent}from'../../../shared/session/navigation-intent';
import{useApi,useApiQuery}from'../../../shared/hooks/use-api';
import{LearningApiError}from'../../../shared/api/client';
import { canOpenWorkspace } from '../../../shared/session/capabilities';

type Tab = 'references' | 'rubrics' | 'marking' | 'results' | 'gradebook';
type ParentResultState = { scope: string; data: ReturnType<typeof parseCurrentAcademicReport>['items']; nextCursor: string | null; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; loaded: boolean };
function useParentAcademicResults(enabled: boolean, learnerId: string | undefined, scope: string) {
  const { request } = useApi(); const { membership } = useApp();
  const schoolId = membership?.schoolId;
  const [state, setState] = useState<ParentResultState | null>(null);
  const currentScope = useRef(scope); currentScope.current = scope;
  const controller = useRef<AbortController | null>(null);
  const paging = useRef(false); const seen = useRef(new Set<string>());
  const empty: ParentResultState = { scope, data: [], nextCursor: null, loading: enabled, loadingMore: false, error: null, moreError: null, loaded: false };
  const data = state?.scope === scope ? state : empty;
  const path = enabled && learnerId ? `/v1/learners/${learnerId}/academic-report?limit=100` : null;
  useEffect(() => {
    controller.current?.abort(); seen.current.clear(); paging.current = false;
    if (!path || !schoolId || !learnerId) { setState(null); return; }
    const active = new AbortController(); controller.current = active; setState({ ...empty, loading: true });
    void request(path, { signal: active.signal }).then(value => {
      const page = parseCurrentAcademicReport(value, schoolId, learnerId, true);
      if (!active.signal.aborted && currentScope.current === scope) setState({ ...empty, data: page.items, nextCursor: page.nextCursor, loading: false, loaded: true });
    }).catch(error => { if (!active.signal.aborted && currentScope.current === scope) setState({ ...empty, loading: false, error: error instanceof LearningApiError ? error : new LearningApiError('invalid') }); });
    return () => active.abort();
  }, [path, schoolId, learnerId, scope, request]);
  function loadMore() {
    if (!path || !schoolId || !learnerId || !data.nextCursor || paging.current) return;
    const cursor = data.nextCursor; const active = new AbortController(); controller.current = active; paging.current = true;
    setState({ ...data, loadingMore: true, moreError: null });
    void request(`${path}&cursor=${cursor}`, { signal: active.signal }).then(value => {
      const page = parseCurrentAcademicReport(value, schoolId, learnerId, true);
      if (page.nextCursor === cursor || page.nextCursor && seen.current.has(page.nextCursor) || page.items.some(row => data.data.some(previous => previous.id === row.id))) throw new LearningApiError('invalid');
      if (!active.signal.aborted && currentScope.current === scope) { seen.current.add(cursor); setState({ ...data, data: [...data.data, ...page.items], nextCursor: page.nextCursor, loadingMore: false }); }
    }).catch(error => { if (!active.signal.aborted && currentScope.current === scope) setState({ ...data, loadingMore: false, moreError: error instanceof LearningApiError ? error : new LearningApiError('invalid') }); }).finally(() => { if (currentScope.current === scope) paging.current = false; });
  }
  return { ...data, loadMore };
}
export function AcademicWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'academic'}>|null}={}) {
  const app = useApp();
  if (!app.online || app.status !== 'ready' || !app.membership || !canOpenWorkspace('academic', app.membership.entitlements, app.membership.role)) return null;
  return <CurrentAcademicWorkspace key={`${app.membership.schoolId}:${app.membership.userId}:${app.membership.role}`} intent={intent} />;
}
function CurrentAcademicWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'academic'}>|null}) {
  const { locale, membership, accessToken, accessGeneration, apiUrl, online } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const staff = membership?.role === 'teacher' || membership?.role === 'admin' || membership?.role === 'coordinator';
  const grader = membership?.role === 'teacher' || membership?.role === 'admin';
  const [tab, setTab] = useState<Tab>(grader ? 'marking' : 'results');
  const [refresh, setRefresh] = useState(0);
  const childContext = useChildContext(refresh);
  const learnerId = membership?.role === 'student' ? membership.userId : childContext.parent ? childContext.child?.id : undefined;
  const sourceScope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${learnerId}:${intent?.source}:${intent?.id}:${refresh}`;
  const parseExactMark = useCallback((value: unknown) => ({ scope: sourceScope, value: parseCurrentMarking(value, intent?.id ?? '') }), [sourceScope, intent?.id]);
  const parseExactResult = useCallback((value: unknown) => ({ scope: sourceScope, value: parseCurrentNativeSource(value, intent?.id ?? '', learnerId) }), [sourceScope, intent?.id, learnerId]);
  const parseResult = useCallback((value: unknown) => learnerId ? parseLearnerReleasedResult(value, learnerId, childContext.parent) : parseReleasedResult(value), [learnerId, childContext.parent]);
  const [selected, setSelected] = useState<string | null>(null);
  const exactMarkRead=useApiQuery(intent?.source==='marking'&&grader?`/v1/marking/${intent.id}`:null,parseExactMark,refresh);
  const exactMark = { ...exactMarkRead, data: exactMarkRead.data?.scope === sourceScope ? exactMarkRead.data.value : null };
  const exactResultRead=useApiQuery(intent?.source==='result'&&(!childContext.parent||!!learnerId)?`/v1/results/${intent.id}/source`:null,parseExactResult,refresh);
  const exactResult = { ...exactResultRead, data: exactResultRead.data?.scope === sourceScope ? exactResultRead.data.value : null };
  const references = usePaginatedLearningQuery(staff && !intent && tab==='references' ? '/v1/academic-references?limit=100' : null, parseReference, refresh);
  const marking = usePaginatedLearningQuery(grader && !intent && tab === 'marking' ? '/v1/marking?limit=100' : null, parseMarkingItem, refresh);
  const ownResults = usePaginatedLearningQuery(!intent && tab === 'results' && !childContext.parent ? '/v1/results?limit=100' : null, parseResult, refresh);
  const parentResults = useParentAcademicResults(!intent && tab === 'results' && childContext.parent && !!learnerId, learnerId, sourceScope);
  const results = childContext.parent ? parentResults : ownResults;
  const rubrics = usePaginatedLearningQuery(staff && !intent && tab === 'rubrics' ? '/v1/rubrics?limit=100' : null, parseRubric, refresh);
  const courses = usePaginatedLearningQuery(grader && tab === 'rubrics' ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const assessments = usePaginatedLearningQuery(grader && tab === 'rubrics' ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const tabs: Tab[] = [...(staff ? ['references' as const, 'rubrics' as const] : []), ...(grader ? ['marking' as const,'gradebook'as const] : []), 'results'];
  const active = tab==='gradebook'?null:tab === 'references' ? references : tab === 'rubrics' ? rubrics : tab === 'marking' ? marking : results;
  const loading = active?.loading || (tab === 'rubrics' && grader && (courses.loading || assessments.loading || !courses.loaded || !assessments.loaded));
  const error = active?.error ?? (tab === 'rubrics' && grader ? courses.error ?? assessments.error : null);
  function reload() { setRefresh((value) => value + 1); }
  if(intent&&childContext.parent&&!learnerId)return <section><ChildSelector context={childContext}/><Button type="button" variant="secondary" onClick={reload}>{t.refresh}</Button></section>;
  if(intent?.source==='marking'&&!grader)return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{locale==='ar'?'العودة إلى الخطوة السابقة':'Back to the previous step'}</Button><LearningError error={new LearningApiError('denied')}/></section>;
  if(intent)return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{locale==='ar'?'العودة إلى الخطوة السابقة':'Back to the previous step'}</Button>{intent.source==='marking'?exactMark.error?<><LearningError error={exactMark.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exactMark.loading?<p role="status">{t.loading}</p>:exactMark.data?<MarkingQueue exact items={[exactMark.data]} selected={exactMark.data.id} onSelected={setSelected} onChanged={reload}/>:null:exactResult.error?<><LearningError error={exactResult.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exactResult.loading?<p role="status">{t.loading}</p>:exactResult.data?<ExactReleasedResult source={exactResult.data} />:null}</section>;
  return <div className="academic-workspace"><ChildSelector context={childContext} /><aside className="synthetic-notice"><strong>{t.customNotice}</strong><p>{t.customBody}</p></aside><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.academic}>{tabs.map((value) => <button key={value} type="button" aria-pressed={value === tab} onClick={() => setTab(value)}>{t[value]}</button>)}</div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><CuevoIcon name="refresh" size={18} /></Button></div>{error ? <LearningError error={error} /> : loading ? <p role="status" className="learning-empty">{t.loading}</p> : tab==='gradebook'?<ClassGradebook key={refresh}/>:tab === 'references' ? <ReferenceList references={references.data ?? []} onChanged={reload} /> : tab === 'rubrics' ? <RubricList rubrics={rubrics.data} courses={courses.data} assessments={assessments.data} canCreate={grader} onChanged={reload} /> : tab === 'marking' ? <MarkingQueue items={marking.data ?? []} onChanged={reload} selected={selected} onSelected={setSelected} /> : childContext.parent && !childContext.child ? null : <ReleasedResults results={results.data ?? []} />}{!error && active && (!childContext.parent || childContext.child) ? <LoadMore query={active} /> : null}{tab === 'rubrics' && grader && !error ? <>{courses.nextCursor ? <div className="notice"><p>{t.course}</p><LoadMore query={courses} /></div> : null}{assessments.nextCursor ? <div className="notice"><p>{t.assessment}</p><LoadMore query={assessments} /></div> : null}</> : null}</div>;
}
