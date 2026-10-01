'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseRecommendation, parseIntervention, parseOutcome } from '../model';
import { parseReleasedResult, isNumericResult } from '../../academic/model';
import { parseAssessment } from '../../learning/model';
import { improvementAr, improvementEn } from '../messages';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { ProposalList } from './proposals';
import { InterventionList } from './interventions';
import { OutcomeList } from './outcomes';

type Tab = 'proposals' | 'interventions' | 'outcomes';
export function ImprovementWorkspace() {
  const { membership, locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  const manager = membership?.role === 'teacher' || membership?.role === 'admin';
  const student = membership?.role === 'student';
  const permitted = !!membership && membership.role !== 'parent';
  const [tab, setTab] = useState<Tab>(student ? 'interventions' : 'proposals');
  const [refresh, setRefresh] = useState(0);
  const proposals = usePaginatedLearningQuery(!permitted || student ? null : '/v1/recommendations?limit=100', parseRecommendation, refresh);
  const interventions = usePaginatedLearningQuery(permitted ? '/v1/interventions?limit=100' : null, parseIntervention, refresh);
  const outcomes = usePaginatedLearningQuery(permitted ? '/v1/outcomes?limit=100' : null, parseOutcome, refresh);
  const results = usePaginatedLearningQuery(manager ? '/v1/results?limit=100' : null, parseReleasedResult, refresh);
  const assessments = usePaginatedLearningQuery(manager ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const numericResults = results.data.filter(isNumericResult);
  const numericAssessments = assessments.data.filter((assessment) => assessment.model === 'numeric');
  const active = tab === 'proposals' ? proposals : tab === 'interventions' ? interventions : outcomes;
  const tabs: Tab[] = [...(!student ? ['proposals' as const] : []), 'interventions', 'outcomes'];
  function reload() { setRefresh((value) => value + 1); }
  if (!permitted) return <p className="notice">{t.parentRestricted}</p>;
  return <div className="improvement-workspace"><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.improvement}>{tabs.map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{t[value]}</button>)}</div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><RefreshCw size={16} aria-hidden="true" /></Button></div>{active.loading ? <p className="learning-empty" role="status">{t.loading}</p> : active.error ? <LearningError error={active.error} /> : tab === 'proposals' ? <ProposalList proposals={proposals.data} baselines={numericResults} canDecide={manager} onChanged={reload} /> : tab === 'interventions' ? <InterventionList interventions={interventions.data} assessments={numericAssessments} results={numericResults} canManage={manager} onChanged={reload} /> : <OutcomeList outcomes={outcomes.data} />}<LoadMore query={active} />{manager && results.nextCursor ? <div className="notice"><p>{t.baseline}</p><LoadMore query={results} /></div> : null}{manager && assessments.nextCursor && tab === 'interventions' ? <div className="notice"><p>{t.followUpAssessment}</p><LoadMore query={assessments} /></div> : null}</div>;
}
