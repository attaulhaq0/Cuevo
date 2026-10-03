'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseRecommendation, parseIntervention, parseOutcome } from '../model';
import { parseReleasedResult } from '../../academic/model';
import { parseAssessment } from '../../learning/model';
import { improvementAr, improvementEn } from '../messages';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { ProposalList } from './proposals';
import { InterventionList } from './interventions';
import { OutcomeList } from './outcomes';
import { IntelligenceRunStatusPanel } from './run-status';
import { IntelligenceBudgetPanel } from './budget-policy';
import { SchoolIntelligencePolicyPanel } from './school-policy';
import { IntelligenceEvaluationMetrics } from './evaluation-metrics';
import { IntelligenceExecutionRegistry } from './execution-registry';
import type{NavigationIntent}from'../../../shared/session/navigation-intent';
import{useApiQuery}from'../../../shared/hooks/use-api';

type Tab = 'proposals' | 'interventions' | 'outcomes' | 'runs' | 'budget' | 'policy' | 'evaluation' | 'execution';
export function ImprovementWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'improvement'}>|null}={}) {
  const { membership, locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  const manager = membership?.role === 'teacher' || membership?.role === 'admin';
  const student = membership?.role === 'student';
  const permitted = !!membership && membership.role !== 'parent';
  const [tab, setTab] = useState<Tab>(student ? 'interventions' : 'proposals');
  const [refresh, setRefresh] = useState(0);
  const exact=useApiQuery(intent?`/v1/interventions/${intent.id}`:null,parseIntervention,refresh);
  const proposals = usePaginatedLearningQuery(!permitted || student ? null : '/v1/recommendations?limit=100', parseRecommendation, refresh);
  const interventions = usePaginatedLearningQuery(permitted ? '/v1/interventions?limit=100' : null, parseIntervention, refresh);
  const outcomes = usePaginatedLearningQuery(permitted ? '/v1/outcomes?limit=100' : null, parseOutcome, refresh);
  const results = usePaginatedLearningQuery(manager ? '/v1/results?limit=100' : null, parseReleasedResult, refresh);
  const assessments = usePaginatedLearningQuery(manager ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const active = tab === 'proposals' ? proposals : tab === 'interventions' ? interventions : outcomes;
  const tabs: Tab[] = [...(!student ? ['proposals' as const] : []), 'interventions', 'outcomes',...(manager?['runs' as const,'evaluation' as const,'execution' as const]:[]),...(membership?.role==='admin'?['budget' as const,'policy' as const]:[])];
  function reload() { setRefresh((value) => value + 1); }
  if (!permitted) return <p className="notice">{t.parentRestricted}</p>;
  if(intent)return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{locale==='ar'?'العودة إلى الخطوة السابقة':'Back to the previous step'}</Button>{exact.error?<><LearningError error={exact.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exact.loading?<p role="status">{t.loading}</p>:exact.data?<InterventionList interventions={[exact.data]} assessments={assessments.data} results={results.data} canManage={manager} onChanged={reload}/>:null}{manager?<section aria-label={t.followUpAssessment}>{assessments.error?<LearningError error={assessments.error}/>:assessments.loading?<p role="status">{t.loading}</p>:null}<LoadMore query={assessments} label={t.followUpAssessment}/></section>:null}</section>;
  return <div className="improvement-workspace"><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.improvement}>{tabs.map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{value === 'execution' ? (locale === 'ar' ? 'اعتماد التنفيذ' : 'Execution approval') : value === 'evaluation' ? (locale === 'ar' ? 'ملاحظات التقييم' : 'Evaluation observations') : value === 'policy' ? (locale === 'ar' ? 'سياسة التحليل' : 'Analysis policy') : value === 'budget' ? (locale === 'ar' ? 'حدود الميزانية' : 'Budget limits') : value === 'runs' ? (locale === 'ar' ? 'حالة التحليلات' : 'Analysis run status') : t[value]}</button>)}</div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><RefreshCw size={16} aria-hidden="true" /></Button></div>{tab === 'execution' ? <IntelligenceExecutionRegistry /> : tab === 'evaluation' ? <IntelligenceEvaluationMetrics /> : tab === 'policy' ? <SchoolIntelligencePolicyPanel /> : tab === 'budget' ? <IntelligenceBudgetPanel /> : tab === 'runs' ? <IntelligenceRunStatusPanel /> : active.loading ? <p className="learning-empty" role="status">{t.loading}</p> : active.error ? <LearningError error={active.error} /> : tab === 'proposals' ? <ProposalList proposals={proposals.data} baselines={results.data} canDecide={manager} onChanged={reload} /> : tab === 'interventions' ? <InterventionList interventions={interventions.data} assessments={assessments.data} results={results.data} canManage={manager} onChanged={reload} /> : <OutcomeList outcomes={outcomes.data} />}{tab !== 'runs' && tab !== 'budget' && tab !== 'policy' && tab !== 'evaluation' && tab !== 'execution' ? <LoadMore query={active} /> : null}{manager && results.nextCursor ? <div className="notice"><p>{t.baseline}</p><LoadMore query={results} /></div> : null}{manager && tab === 'interventions' ? <section aria-label={t.followUpAssessment}>{assessments.error?<LearningError error={assessments.error}/>:assessments.loading?<p role="status">{t.loading}</p>:null}<LoadMore query={assessments} label={t.followUpAssessment}/></section> : null}</div>;
}
