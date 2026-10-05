import type { ReactNode } from 'react';
import type { ClassLearningSummary } from '@cuevo/contracts';
import { Button, Status, WorkspaceState } from '@cuevo/ui';
import { progressAr, progressEn } from '../messages';

export function CoordinatorClassDirectoryRow({item,locale,selected,onReview,onSources,sourcesOpen,children,reviewAllowed=true}:{item:ClassLearningSummary['items'][number];locale:'en'|'ar';selected:boolean;onReview:()=>void;onSources:()=>void;sourcesOpen:boolean;children:ReactNode;reviewAllowed?:boolean}){
 const t=locale==='ar'?progressAr:progressEn,number=(value:number|null)=>value===null?t.unknown:new Intl.NumberFormat(locale).format(value);
 return <article className="academic-row class-summary-row coordinator-class-row" data-class-learner-id={item.learnerId} data-selected={selected}>
  <div className="learning-section-heading"><h3><bdi>{item.learnerName.trim()||t.learnerContextUnavailable}</bdi></h3><Button type="button" variant={selected?'primary':'secondary'} aria-pressed={selected} disabled={!reviewAllowed} onClick={onReview}>{t.reviewLearner}</Button></div>
  <dl className="coordinator-record-counts"><div><dt>{t.numericRecords}</dt><dd>{number(item.academic.numericCount)}</dd></div><div><dt>{t.rubricRecords}</dt><dd>{number(item.academic.rubricCount)}</dd></div></dl>
  {!item.academic.numericCount&&!item.academic.rubricCount?<Status tone="warning">{t.noClassEvidence}</Status>:null}
  <Button type="button" variant="quiet" aria-expanded={sourcesOpen} disabled={!reviewAllowed} onClick={onSources}>{t.classSources}</Button>{!reviewAllowed?<WorkspaceState kind="review" icon="people" description={t.learnerChoicesReview} role="status"/>:null}
  {selected||sourcesOpen?<div className="coordinator-domain-counts"><section><h4>{t.development}</h4><dl className="academic-facts">{(['practice','revision','reflection']as const).map(kind=><div key={kind}><dt>{t[kind]}</dt><dd>{number(item.observed[kind].count)}</dd></div>)}</dl></section><section><h4>{t.support}</h4><dl className="academic-facts"><div><dt>{t.assigned}</dt><dd>{number(item.support.assignedCount)}</dd></div><div><dt>{t.completed}</dt><dd>{number(item.support.completedCount)}</dd></div><div><dt>{t.measured}</dt><dd>{number(item.support.measuredCount)}</dd></div></dl></section><section><h4>{t.impact}</h4><dl className="academic-facts"><div><dt>{t.improvedOutcomes}</dt><dd>{number(item.outcomes.improvedCount)}</dd></div><div><dt>{t.unchangedOutcomes}</dt><dd>{number(item.outcomes.noMeaningfulChangeCount)}</dd></div><div><dt>{t.inconclusiveOutcomes}</dt><dd>{number(item.outcomes.inconclusiveCount)}</dd></div></dl></section></div>:null}
  {children}
 </article>;
}
