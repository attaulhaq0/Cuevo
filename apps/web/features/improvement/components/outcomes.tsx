'use client';

import { Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { Outcome } from '../model';
import { improvementAr, improvementEn } from '../messages';
import { NativeResultView } from '../../academic/ui';

export function OutcomeList({ outcomes }: { outcomes: Outcome[] }) {
  const { locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  const statuses = { improved: t.improved, no_meaningful_change: t.noMeaningfulChange, inconclusive: t.inconclusive };
  const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(locale).format(value);
  return outcomes.length ? <section>{outcomes.map((outcome) => <article className="academic-row outcome-row" key={outcome.id} data-outcome-id={outcome.id}><div className="learning-section-heading"><h3>{t.observedChange}</h3><Status tone={outcome.status === 'improved' ? 'positive' : 'neutral'}>{statuses[outcome.status]}</Status></div>{!('difference'in outcome) ? <><p>{locale==='ar'?'قابلية المقارنة مجهولة؛ لم تُعتمد قاعدة لمقارنة مستويات المعيار.':'Comparability is unknown; no rubric level comparison rule is approved.'}</p><NativeResultView result={outcome.baseline}/><NativeResultView result={outcome.followUp}/></> : <dl className="outcome-comparison"><div><dt>{t.baselineScore}</dt><dd><bdi dir="ltr">{number(outcome.baseline.score)} / {number(outcome.baseline.maxScore)}</bdi></dd></div><div><dt>{t.followUpScore}</dt><dd><bdi dir="ltr">{number(outcome.followUp.score)} / {number(outcome.followUp.maxScore)}</bdi></dd></div><div><dt>{t.difference}</dt><dd>{number(outcome.difference)}</dd></div><div><dt>{t.threshold}</dt><dd>{number(outcome.minimumChange)}</dd></div></dl>}{outcome.reason === 'FOLLOW_UP_LOWER' ? <p className="learning-form__note">{t.lowerFollowUp}</p> : null}{outcome.requiresReview ? <p className="notice" role="status">{t.sourceChanged}</p> : null}<p className="learning-form__note">{t.causalLimit}</p><p className="learning-form__note">{t.measuredAt}: <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(outcome.measuredAt))}</bdi></p><details><summary>{t.evidence}</summary><dl className="academic-facts"><div><dt>{t.interventionSource}</dt><dd><bdi>{outcome.interventionId}</bdi></dd></div><div><dt>{t.baselineId}</dt><dd><bdi>{outcome.baselineResultId}</bdi></dd></div><div><dt>{t.followUpResult}</dt><dd><bdi>{outcome.followUpResultId}</bdi></dd></div></dl></details></article>)}</section> : <p className="learning-empty">{t.noOutcomes}</p>;
}
