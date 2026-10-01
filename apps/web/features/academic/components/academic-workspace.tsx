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

type Tab = 'references' | 'rubrics' | 'marking' | 'results';

export function AcademicWorkspace() {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const staff = membership?.role === 'teacher' || membership?.role === 'admin' || membership?.role === 'coordinator';
  const grader = membership?.role === 'teacher' || membership?.role === 'admin';
  const [tab, setTab] = useState<Tab>(grader ? 'marking' : 'results');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const references = usePaginatedLearningQuery(staff ? '/v1/academic-references?limit=100' : null, parseReference, refresh);
  const marking = usePaginatedLearningQuery(grader ? '/v1/marking?limit=100' : null, parseMarkingItem, refresh);
  const results = usePaginatedLearningQuery('/v1/results?limit=100', parseReleasedResult, refresh);
  const rubrics = usePaginatedLearningQuery(staff ? '/v1/rubrics?limit=100' : null, parseRubric, refresh);
  const courses = usePaginatedLearningQuery(grader && tab === 'rubrics' ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const assessments = usePaginatedLearningQuery(grader && tab === 'rubrics' ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const tabs: Tab[] = [...(staff ? ['references' as const, 'rubrics' as const] : []), ...(grader ? ['marking' as const] : []), 'results'];
  const active = tab === 'references' ? references : tab === 'rubrics' ? rubrics : tab === 'marking' ? marking : results;
  const loading = active.loading || (tab === 'marking' && references.loading);
  const error = active.error ?? (tab === 'marking' ? references.error : null);
  function reload() { setRefresh((value) => value + 1); }
  return <div className="academic-workspace"><aside className="synthetic-notice"><strong>{t.customNotice}</strong><p>{t.customBody}</p></aside><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.academic}>{tabs.map((value) => <button key={value} type="button" aria-pressed={value === tab} onClick={() => setTab(value)}>{t[value]}</button>)}</div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><RefreshCw size={15} aria-hidden="true" /></Button></div>{loading ? <p role="status" className="learning-empty">{t.loading}</p> : error ? <LearningError error={error} /> : tab === 'references' ? <ReferenceList references={references.data ?? []} onChanged={reload} /> : tab === 'rubrics' ? <RubricList rubrics={rubrics.data} courses={courses.data} assessments={assessments.data} canCreate={grader} onChanged={reload} /> : tab === 'marking' ? <MarkingQueue items={marking.data ?? []} references={references.data ?? []} onChanged={reload} selected={selected} onSelected={setSelected} /> : <ReleasedResults results={results.data ?? []} />}{!error ? <LoadMore query={active} /> : null}{tab === 'rubrics' && grader ? <>{courses.error ? <LearningError error={courses.error} /> : null}{assessments.error ? <LearningError error={assessments.error} /> : null}{courses.nextCursor ? <div className="notice"><p>{t.course}</p><LoadMore query={courses} /></div> : null}{assessments.nextCursor ? <div className="notice"><p>{t.assessment}</p><LoadMore query={assessments} /></div> : null}</> : null}</div>;
}
