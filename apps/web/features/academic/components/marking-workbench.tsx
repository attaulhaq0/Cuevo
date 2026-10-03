'use client';

import type { ReactNode } from 'react';
import { CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { AcademicReference, MarkingItem } from '../model';
import { academicAr, academicEn } from '../messages';

/** Presentation only: the marking owner supplies its current reads and original commands. */
export function MarkingWorkbench({ item, reference, work, decision, context }: { item: MarkingItem; reference: AcademicReference | null; work: ReactNode; decision: ReactNode; context?: ReactNode }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  return <section className="marking-detail" aria-label={`${item.assessmentTitle} · ${item.learnerName}`}>
    <header className="marking-detail__heading"><span className="marking-detail__symbol"><CuevoIcon name="assessment" variant="filled" size={30} /></span><div><h2>{item.assessmentTitle}</h2><p className="academic-learner"><bdi>{item.learnerName}</bdi></p></div><Status>{item.currentResult?.status === 'RELEASED' ? t.published : item.currentResult ? t.review : t.response}</Status></header>
    <div className="marking-workbench">
      <section className="marking-workbench__source" aria-label={t.response}><h3><CuevoIcon name="portfolio" size={24} />{t.response}</h3>{work}</section>
      <div className="marking-workbench__review"><section className="marking-workbench__context" aria-label={t.markingContext}>
        <h3><CuevoIcon name="curriculum" size={24} />{t.markingContext}</h3>
        <dl className="academic-facts">{item.model === 'numeric' ? <div><dt>{t.maxScore}</dt><dd>{new Intl.NumberFormat(locale).format(item.maxScore)}</dd></div> : <div><dt>{t.rubric}</dt><dd>{item.rubric.title}</dd></div>}<div><dt>{t.reference}</dt><dd>{reference?.title ?? t.referenceMissing}</dd></div></dl>
        {reference ? <p className="marking-objective-description" dir="auto">{reference.description}</p> : null}
        {item.model === 'rubric' ? <div className="marking-rubric-source"><p>{t.rubricNote}</p>{item.rubric.criteria.map(criterion => <section key={criterion.key}><h4>{criterion.title}</h4><dl>{criterion.levels.map(level => <div key={level.key}><dt>{level.label}</dt><dd dir="auto">{level.description}</dd></div>)}</dl></section>)}</div> : null}
        {context}<details><summary>{t.source}</summary><dl className="academic-facts"><div><dt>{t.policy}</dt><dd>{new Intl.NumberFormat(locale).format(item.policyVersion)}</dd></div><div><dt>{t.submissionRevision}</dt><dd>{new Intl.NumberFormat(locale).format(item.submissionRevision)}</dd></div>{reference ? <div><dt>{t.referenceVersion}</dt><dd><bdi>{reference.version}</bdi></dd></div> : null}{item.model === 'rubric' ? <div><dt>{t.rubricVersion}</dt><dd><bdi>{item.rubric.version}</bdi></dd></div> : null}</dl></details>
      </section><section className="marking-workbench__decision" aria-label={t.markingDecision}><h3><CuevoIcon name="feedback" size={24} />{t.markingDecision}</h3>{decision}</section></div>
    </div>
  </section>;
}

export function MarkingChoices({ items, selected, onSelected }: { items: MarkingItem[]; selected: string | null; onSelected: (id: string) => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  return <section className="marking-queue" aria-label={t.marking}><header><h2>{t.marking}</h2><p>{t.chooseSubmission}</p></header>{items.length ? items.map(item => <button type="button" className={`marking-queue__item ${item.id === selected ? 'marking-queue__item--active' : ''}`} aria-pressed={item.id === selected} key={item.id} onClick={() => onSelected(item.id)}><strong>{item.assessmentTitle}</strong><span><bdi>{item.learnerName}</bdi></span><span>{item.currentResult?.status === 'RELEASED' ? t.published : item.currentResult ? t.review : t.openMarking}</span></button>) : <p className="learning-empty">{t.emptyMarking}</p>}</section>;
}
