'use client';
import {CuevoIcon,Status} from '@cuevo/ui';
import type {ReactNode} from 'react';
import type {Outcome} from '../model';
import {improvementAr,improvementEn} from '../messages';

/** Recorded measurement facts only; no comparison is computed in the view. */
export function OutcomeReadingView({outcome,locale,nativeBaseline,nativeFollowUp}:{outcome:Outcome;locale:'en'|'ar';nativeBaseline?:ReactNode;nativeFollowUp?:ReactNode}) {
  const t=locale==='ar'?improvementAr:improvementEn;
  const number=new Intl.NumberFormat(locale,{maximumFractionDigits:20});
  const statuses={improved:t.improved,no_meaningful_change:t.noMeaningfulChange,inconclusive:t.inconclusive};
  return <article className="outcome-row outcome-reading" data-outcome-id={outcome.id}>
    <header><CuevoIcon name="progress" size={30}/><h2>{t.observedChange}</h2><Status tone={outcome.status==='improved'?'positive':'neutral'}>{statuses[outcome.status]}</Status></header>
    <div className="outcome-reading__sources">
      <section><h3>{t.baselineScore}</h3>{'difference' in outcome?<p className="outcome-reading__ratio" dir="ltr">{number.format(outcome.baseline.score)} / {number.format(outcome.baseline.maxScore)}</p>:nativeBaseline}</section>
      <section><h3>{t.followUpScore}</h3>{'difference' in outcome?<p className="outcome-reading__ratio" dir="ltr">{number.format(outcome.followUp.score)} / {number.format(outcome.followUp.maxScore)}</p>:nativeFollowUp}</section>
    </div>
    {'difference' in outcome?<dl className="outcome-reading__measure"><div><dt>{t.difference}</dt><dd><bdi>{number.format(outcome.difference)}</bdi></dd></div><div><dt>{t.threshold}</dt><dd><bdi>{number.format(outcome.minimumChange)}</bdi></dd></div></dl>:<p>{locale==='ar'?'قابلية المقارنة مجهولة؛ لم تُعتمد قاعدة لمقارنة مستويات المعيار.':'Comparability is unknown; no rubric level comparison rule is approved.'}</p>}
    {outcome.reason==='FOLLOW_UP_LOWER'?<p>{t.lowerFollowUp}</p>:null}{outcome.requiresReview?<p className="notice" role="status">{t.sourceChanged}</p>:null}
    <p className="outcome-reading__limit">{t.causalLimit}</p><p>{t.measuredAt}: <time dateTime={outcome.measuredAt}><bdi>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(outcome.measuredAt))} · UTC</bdi></time></p>
    <details><summary>{t.evidence}</summary><dl className="academic-facts"><div><dt>{t.interventionSource}</dt><dd><bdi>{outcome.interventionId}</bdi></dd></div><div><dt>{t.baselineId}</dt><dd><bdi>{outcome.baselineResultId}</bdi></dd></div><div><dt>{t.followUpResult}</dt><dd><bdi>{outcome.followUpResultId}</bdi></dd></div></dl></details>
  </article>;
}
