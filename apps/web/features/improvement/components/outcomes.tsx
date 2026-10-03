'use client';

import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { currentImprovementRead, currentStudentOutcome, improvementReadScope, parseCurrentIntervention, type Outcome } from '../model';
import { useCallback, useState } from 'react';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { improvementAr, improvementEn } from '../messages';
import { NativeResultView } from '../../academic/ui';

export function OutcomeList({ outcomes }: { outcomes: Outcome[] }) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  if(membership?.role==='student')return outcomes.length?<section>{outcomes.map(outcome=><CurrentStudentOutcome key={outcome.id} outcome={outcome}/>)}</section>:<p className="learning-empty">{t.noOutcomes}</p>;
  return <OutcomeRows outcomes={outcomes}/>;
}
function CurrentStudentOutcome({outcome}:{outcome:Outcome}) {
 const app=useApp();const [open,setOpen]=useState(false);const path=`/v1/interventions/${outcome.interventionId}`;const scope=improvementReadScope(app,open?path:null,0);
 const parse=useCallback((value:unknown)=>({scope,value:parseCurrentIntervention(value,app.membership?.userId??null,outcome.interventionId)}),[scope,app.membership?.userId,outcome.interventionId]);
 const read=useApiQuery(scope?path:null,parse,0);const task=currentImprovementRead(read.data,scope);const t=app.locale==='ar'?improvementAr:improvementEn;
 let matches=false;if(task){try{currentStudentOutcome(outcome,[task],app.membership!.userId);matches=true;}catch{matches=false;}}
 return <article className="support-outcome-disclosure"><Button type="button" variant="secondary" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><CuevoIcon name="progress" size={20}/>{t.observedChange} · <bdi>{new Intl.DateTimeFormat(app.locale,{dateStyle:'medium',timeStyle:'medium'}).format(new Date(outcome.measuredAt))}</bdi></Button>{open?read.loading||!read.error&&!task?<p role="status">{t.loading}</p>:read.error?<LearningError error={read.error}/>:matches?<><h3>{task!.title}</h3><OutcomeRows outcomes={[outcome]}/></>:<p className="notice">{t.sourceChanged}</p>:null}</article>;
}
function OutcomeRows({outcomes}:{outcomes:Outcome[]}) {
  const { locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  const statuses = { improved: t.improved, no_meaningful_change: t.noMeaningfulChange, inconclusive: t.inconclusive };
  const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(locale).format(value);
  return outcomes.length ? <section>{outcomes.map((outcome) => <article className="academic-row outcome-row" key={outcome.id} data-outcome-id={outcome.id}><div className="learning-section-heading"><h3>{t.observedChange}</h3><Status tone={outcome.status === 'improved' ? 'positive' : 'neutral'}>{statuses[outcome.status]}</Status></div>{!('difference'in outcome) ? <><p>{locale==='ar'?'قابلية المقارنة مجهولة؛ لم تُعتمد قاعدة لمقارنة مستويات المعيار.':'Comparability is unknown; no rubric level comparison rule is approved.'}</p><NativeResultView result={outcome.baseline}/><NativeResultView result={outcome.followUp}/></> : <dl className="outcome-comparison"><div><dt>{t.baselineScore}</dt><dd>{number(outcome.baseline.score)} / {number(outcome.baseline.maxScore)}</dd></div><div><dt>{t.followUpScore}</dt><dd>{number(outcome.followUp.score)} / {number(outcome.followUp.maxScore)}</dd></div><div><dt>{t.difference}</dt><dd>{number(outcome.difference)}</dd></div><div><dt>{t.threshold}</dt><dd>{number(outcome.minimumChange)}</dd></div></dl>}{outcome.reason === 'FOLLOW_UP_LOWER' ? <p className="learning-form__note">{t.lowerFollowUp}</p> : null}{outcome.requiresReview ? <p className="notice" role="status">{t.sourceChanged}</p> : null}<p className="learning-form__note">{t.causalLimit}</p><p className="learning-form__note">{t.measuredAt}: <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(outcome.measuredAt))}</bdi></p><details><summary>{t.evidence}</summary><dl className="academic-facts"><div><dt>{t.interventionSource}</dt><dd><bdi>{outcome.interventionId}</bdi></dd></div><div><dt>{t.baselineId}</dt><dd><bdi>{outcome.baselineResultId}</bdi></dd></div><div><dt>{t.followUpResult}</dt><dd><bdi>{outcome.followUpResultId}</bdi></dd></div></dl></details></article>)}</section> : <p className="learning-empty">{t.noOutcomes}</p>;
}
