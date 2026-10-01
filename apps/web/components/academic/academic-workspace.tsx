'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { useApp } from '../providers';
import { parseReference, parseMarkingItem, parseReleasedResult } from '../../lib/academic-types';
import { academicAr, academicEn } from '../../messages/academic';
import { usePaginatedLearningQuery } from '../learning/use-paginated-query';
import { LoadMore } from '../learning/load-more';
import { LearningError } from '../learning/feedback';
import { ReferenceList } from './references';
import { MarkingQueue } from './marking';
import { ReleasedResults } from './results';

type Tab = 'references' | 'marking' | 'results';

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
  const tabs: Tab[] = [...(staff ? ['references' as const] : []), ...(grader ? ['marking' as const] : []), 'results'];
  const active = tab === 'references' ? references : tab === 'marking' ? marking : results;
  const loading = active.loading || (tab === 'marking' && references.loading);
  const error = active.error ?? (tab === 'marking' ? references.error : null);
  function reload() { setRefresh((value) => value + 1); }
  return <div className="academic-workspace"><aside className="synthetic-notice"><strong>{t.customNotice}</strong><p>{t.customBody}</p></aside><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.academic}>{tabs.map((value) => <button key={value} type="button" aria-pressed={value === tab} onClick={() => setTab(value)}>{t[value]}</button>)}</div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><RefreshCw size={15} aria-hidden="true" /></Button></div>{loading ? <p role="status" className="learning-empty">{t.loading}</p> : error ? <LearningError error={error} /> : tab === 'references' ? <ReferenceList references={references.data ?? []} onChanged={reload} /> : tab === 'marking' ? <MarkingQueue items={marking.data ?? []} references={references.data ?? []} onChanged={reload} selected={selected} onSelected={setSelected} /> : <ReleasedResults results={results.data ?? []} />}{!error ? <LoadMore query={active} /> : null}</div>;
}
