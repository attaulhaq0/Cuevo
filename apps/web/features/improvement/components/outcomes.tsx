'use client';

import { Button, CuevoIcon, WorkspaceState } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { currentImprovementRead, currentStudentOutcome, improvementReadScope, parseCurrentIntervention, type Outcome } from '../model';
import { useCallback, useState } from 'react';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { improvementAr, improvementEn } from '../messages';
import { NativeResultView } from '../../academic/ui';
import { OutcomeReadingView } from './outcome-reading';

export function OutcomeList({ outcomes, headingLevel=2 }: { outcomes: Outcome[];headingLevel?:2|4 }) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  if(membership?.role==='student')return outcomes.length?<section>{outcomes.map(outcome=><CurrentStudentOutcome key={outcome.id} outcome={outcome}/>)}</section>:<WorkspaceState kind="empty" icon="progress" title={t.noOutcomes} description={t.emptyOutcomesBody}/>;
  return <OutcomeRows outcomes={outcomes} headingLevel={headingLevel}/>;
}
function CurrentStudentOutcome({outcome}:{outcome:Outcome}) {
 const app=useApp();const [open,setOpen]=useState(false);const path=`/v1/interventions/${outcome.interventionId}`;const scope=improvementReadScope(app,open?path:null,0);
 const parse=useCallback((value:unknown)=>({scope,value:parseCurrentIntervention(value,app.membership?.userId??null,outcome.interventionId)}),[scope,app.membership?.userId,outcome.interventionId]);
 const read=useApiQuery(scope?path:null,parse,0);const task=currentImprovementRead(read.data,scope);const t=app.locale==='ar'?improvementAr:improvementEn;
 let matches=false;if(task){try{currentStudentOutcome(outcome,[task],app.membership!.userId);matches=true;}catch{matches=false;}}
 return <article className="support-outcome-disclosure"><Button type="button" variant="secondary" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><CuevoIcon name="progress" size={20}/>{t.observedChange} · <bdi>{new Intl.DateTimeFormat(app.locale,{dateStyle:'medium',timeStyle:'medium'}).format(new Date(outcome.measuredAt))}</bdi></Button>{open?read.loading||!read.error&&!task?<WorkspaceState kind="loading" icon="refresh" title={t.loading} role="status"/>:read.error?<LearningError error={read.error}/>:matches?<><h3>{task!.title}</h3><OutcomeRows outcomes={[outcome]} headingLevel={4}/></>:<WorkspaceState kind="review" icon="shieldAlert" description={t.sourceChanged} role="status"/>:null}</article>;
}
function OutcomeRows({outcomes,headingLevel=2}:{outcomes:Outcome[];headingLevel?:2|4}) {
  const { locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  return outcomes.length ? <section className="outcome-readings">{outcomes.map(outcome=><OutcomeReadingView key={outcome.id} outcome={outcome} locale={locale} headingLevel={headingLevel} nativeBaseline={'difference'in outcome?undefined:<NativeResultView result={outcome.baseline}/>} nativeFollowUp={'difference'in outcome?undefined:<NativeResultView result={outcome.followUp}/>}/>)}</section> : <WorkspaceState kind="empty" icon="progress" title={t.noOutcomes} description={t.emptyOutcomesBody}/>;
}
