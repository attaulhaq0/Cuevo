'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon, WorkspaceTabs } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseRecommendation, parseIntervention, parseOutcome, parseCurrentIntervention, improvementReadScope, currentImprovementRead } from '../model';
import { parseReleasedResult } from '../../academic/model';
import { parseAssessment } from '../../learning/model';
import { improvementAr, improvementEn, supportTrailAr, supportTrailEn } from '../messages';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { ProposalList } from './proposals';
import { InterventionList } from './interventions';
import { OutcomeList } from './outcomes';
import { CoordinatorOutcomes } from './coordinator-outcomes';
import { IntelligenceRunStatusPanel } from './run-status';
import { IntelligenceBudgetPanel } from './budget-policy';
import { SchoolIntelligencePolicyPanel } from './school-policy';
import { IntelligenceEvaluationMetrics } from './evaluation-metrics';
import { IntelligenceExecutionRegistry } from './execution-registry';
import type{NavigationIntent}from'../../../shared/session/navigation-intent';
import{useApiQuery}from'../../../shared/hooks/use-api';
import { trailAssets } from '../../../shared/characters/assets';
import { admittedSourceRows, sourcePageDenied } from '../source-page-model';

type Tab = 'proposals' | 'interventions' | 'outcomes' | 'runs' | 'budget' | 'policy' | 'evaluation' | 'execution';
export function ImprovementWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'improvement'}>|null}={}) {
 const app=useApp();const trail=app.locale==='ar'?supportTrailAr:supportTrailEn;
 if(!app.online)return <p className="notice" role="status">{trail.offline}</p>;
 if(app.status!=='ready')return null;
 return <CurrentImprovementWorkspace key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`} intent={intent}/>;
}
function CurrentImprovementWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'improvement'}>|null}) {
  const app=useApp();const { membership, locale } = app; const t = locale === 'ar' ? improvementAr : improvementEn;const trail=locale==='ar'?supportTrailAr:supportTrailEn;
  const manager = membership?.role === 'teacher' || membership?.role === 'admin';
  const student = membership?.role === 'student';
  const coordinator=membership?.role==='coordinator';
  const permitted = !!membership && membership.role !== 'parent';
  const [tab, setTab] = useState<Tab>(student ? 'interventions' : coordinator?'outcomes':'proposals');
  const [refresh, setRefresh] = useState(0);
  const root=useRef<HTMLDivElement>(null);const focusContext=`${membership?.schoolId}:${membership?.userId}:${membership?.role}:${intent?.id??''}:${tab}`;
  const currentFocusContext=useRef(focusContext);currentFocusContext.current=focusContext;
  const focused=useRef<{context:string;element:HTMLElement;form:string|null;name:string|null}|null>(null);const restore=useRef<typeof focused.current>(null);
  useEffect(()=>{if(focused.current?.context!==focusContext)focused.current=null;if(restore.current?.context!==focusContext)restore.current=null;},[focusContext]);
  useEffect(()=>{
   if(!root.current)return;const observer=new MutationObserver(()=>{
    const previous=focused.current;if(previous?.context===currentFocusContext.current&&!previous.element.isConnected&&(document.activeElement===document.body||document.activeElement===document.documentElement))restore.current=previous;
    const pending=restore.current;if(!pending||pending.context!==currentFocusContext.current||document.activeElement!==document.body&&document.activeElement!==document.documentElement)return;
    const target=Array.from(root.current?.querySelectorAll<HTMLElement>('input,textarea,select')??[]).find(element=>element.getAttribute('name')===pending.name&&element.closest('section[aria-label]')?.getAttribute('aria-label')===pending.form);
    if(target&&!target.matches(':disabled')){target.focus();restore.current=null;}
   });observer.observe(root.current,{subtree:true,childList:true});return()=>observer.disconnect();
  },[]);
  function rememberFocus(element:HTMLElement){focused.current=element.matches('input,textarea,select')?{context:focusContext,element,name:element.getAttribute('name'),form:element.closest('section[aria-label]')?.getAttribute('aria-label')??null}:null;}
  const exactPath=intent?`/v1/interventions/${intent.id}`:null;const exactScope=improvementReadScope(app,exactPath,refresh);
  const parseExact=useCallback((value:unknown)=>({scope:exactScope,value:parseCurrentIntervention(value,student?membership?.userId??null:null,intent?.id)}),[exactScope,student,membership?.userId,intent?.id]);
  const exactRead=useApiQuery(exactScope?exactPath:null,parseExact,refresh);const exact={...exactRead,data:currentImprovementRead(exactRead.data,exactScope)};
  const proposals = usePaginatedLearningQuery(!permitted || student ? null : '/v1/recommendations?limit=100', parseRecommendation, refresh);
  const parsePractices=useCallback((value:unknown)=>student?parseCurrentIntervention(value,membership?.userId??null):parseIntervention(value),[student,membership?.userId]);
  const interventions = usePaginatedLearningQuery(permitted ? '/v1/interventions?limit=100' : null, parsePractices, refresh);
  const outcomePath=permitted?'/v1/outcomes?limit=100':null,outcomeScope=improvementReadScope(app,outcomePath,refresh);
  const parseCoordinatorOutcome=useCallback((value:unknown)=>({...parseOutcome(value),sourceScope:outcomeScope}),[outcomeScope]);
  const outcomeRead=usePaginatedLearningQuery(outcomePath,coordinator?parseCoordinatorOutcome:parseOutcome,refresh);
  const outcomes={...outcomeRead,data:coordinator?outcomeRead.data.filter(row=>'sourceScope'in row&&row.sourceScope===outcomeScope):outcomeRead.data};
  const results = usePaginatedLearningQuery(manager ? '/v1/results?limit=100' : null, parseReleasedResult, refresh);
  const assessments = usePaginatedLearningQuery(manager ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const active = tab === 'proposals' ? proposals : tab === 'interventions' ? interventions : outcomes;
  const tabs: Tab[] = [...(!student ? ['proposals' as const] : []), 'interventions', 'outcomes',...(manager?['runs' as const,'evaluation' as const,'execution' as const]:[]),...(membership?.role==='admin'?['budget' as const,'policy' as const]:[])];
  const choicesComplete=[results,assessments].every(query=>query.loaded&&!query.loading&&!query.loadingMore&&!query.error&&!query.moreError&&!query.nextCursor);
  function reload() { setRefresh((value) => value + 1); }
  if (!permitted) return <p className="notice">{t.parentRestricted}</p>;
  if(intent)return <div ref={root} className="improvement-workspace improvement-workspace--exact" onFocusCapture={event=>rememberFocus(event.target as HTMLElement)}><section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{locale==='ar'?'العودة إلى الخطوة السابقة':'Back to the previous step'}</Button>{exact.error?<><LearningError error={exact.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exact.loading||!exact.error&&!exact.data?<p role="status">{t.loading}</p>:exact.data?<InterventionList refresh={refresh} exact interventions={[exact.data]} assessments={admittedSourceRows(assessments)} results={admittedSourceRows(results)} canManage={manager} choicesComplete={choicesComplete} onChanged={reload}/>:null}{manager?<section aria-label={t.followUpResult}>{results.error?<LearningError error={results.error}/>:results.loading?<p role="status">{t.loading}</p>:null}<LoadMore query={results} label={t.followUpResult}/></section>:null}{manager?<section aria-label={t.followUpAssessment}>{assessments.error?<LearningError error={assessments.error}/>:assessments.loading?<p role="status">{t.loading}</p>:null}<LoadMore query={assessments} label={t.followUpAssessment}/></section>:null}</section></div>;
  return <div ref={root} onFocusCapture={event=>rememberFocus(event.target as HTMLElement)} className={`improvement-workspace${student?" improvement-workspace--student":""}`}>{student?<header className="support-trail-heading"><img src={trailAssets.practice} width={88} height={88} alt="" aria-hidden="true"/><div><h2>{trail.title}</h2><p>{trail.body}</p></div></header>:null}<div className="learning-toolbar"><WorkspaceTabs label={t.improvement} selected={tab} items={tabs.map(value=>({id:value,icon:({proposals:'feedback',interventions:'practice',outcomes:'progress',runs:'progress',budget:'settings',policy:'shield',evaluation:'assessment',execution:'shield'}as const)[value],label:value === 'execution' ? (locale === 'ar' ? 'اعتماد التنفيذ' : 'Execution approval') : value === 'evaluation' ? (locale === 'ar' ? 'ملاحظات التقييم' : 'Evaluation observations') : value === 'policy' ? (locale === 'ar' ? 'سياسة التحليل' : 'Analysis policy') : value === 'budget' ? (locale === 'ar' ? 'حدود الميزانية' : 'Budget limits') : value === 'runs' ? (locale === 'ar' ? 'حالة التحليلات' : 'Analysis run status') : t[value]}))} onChange={value=>setTab(value as Tab)}/><Button type="button" variant="quiet" aria-label={t.refresh} onClick={reload}><CuevoIcon name="refresh" size={18} /></Button></div>{tab === 'execution' ? <IntelligenceExecutionRegistry refreshKey={refresh} /> : tab === 'evaluation' ? <IntelligenceEvaluationMetrics refreshKey={refresh} /> : tab === 'policy' ? <SchoolIntelligencePolicyPanel refreshKey={refresh} /> : tab === 'budget' ? <IntelligenceBudgetPanel refreshKey={refresh} /> : tab === 'runs' ? <IntelligenceRunStatusPanel refreshKey={refresh} /> : coordinator&&tab==='outcomes'?<CoordinatorOutcomes source={outcomes}/> : active.loading ? <p className="learning-empty" role="status">{t.loading}</p> : active.error || sourcePageDenied(active) ? <LearningError error={(active.error ?? active.moreError)!} /> : tab === 'proposals' ? <ProposalList refresh={refresh} proposals={proposals.data} baselines={admittedSourceRows(results)} canDecide={manager} onChanged={reload} /> : tab === 'interventions' ? <>{coordinator?<h2>{t.interventions}</h2>:null}<InterventionList refresh={refresh} interventions={interventions.data} assessments={admittedSourceRows(assessments)} results={admittedSourceRows(results)} canManage={manager} choicesComplete={choicesComplete} onChanged={reload} /></> : <OutcomeList outcomes={outcomes.data} />}{!(coordinator&&tab==='outcomes')&&tab !== 'runs' && tab !== 'budget' && tab !== 'policy' && tab !== 'evaluation' && tab !== 'execution' ? <LoadMore query={active} /> : null}{manager && results.nextCursor ? <div className="notice"><p>{t.baseline}</p><LoadMore query={results} /></div> : null}{manager && tab === 'interventions' ? <section aria-label={t.followUpAssessment}>{assessments.error?<LearningError error={assessments.error}/>:assessments.loading?<p role="status">{t.loading}</p>:null}<LoadMore query={assessments} label={t.followUpAssessment}/></section> : null}</div>;
}
