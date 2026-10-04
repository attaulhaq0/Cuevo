'use client';

import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { AcademicReference, MarkingItem } from '../model';
import { academicAr, academicEn } from '../messages';

/** Presentation only: the marking owner supplies its current reads and original commands. */
export function MarkingWorkbench({ item, reference, work, decision, context, headingRef }: { item: MarkingItem; reference: AcademicReference | null; work: ReactNode; decision: ReactNode; context?: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  return <section className="marking-detail" aria-label={`${item.assessmentTitle} · ${item.learnerName}`}>
    <header className="marking-detail__heading"><span className="marking-detail__symbol"><CuevoIcon name="assessment" variant="filled" size={30} /></span><div><h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{item.assessmentTitle}</h2><p className="academic-learner"><bdi>{item.learnerName}</bdi></p></div><Status>{item.currentResult?.status === 'RELEASED' ? t.published : item.currentResult ? t.review : t.response}</Status></header>
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

export function MarkingChoices({ items, selected, onSelected, disabled = false }: { items: MarkingItem[]; selected: string | null; onSelected: (id: string, opener?: HTMLElement) => void; disabled?: boolean }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const selectedItem = items.find(item => item.id === selected);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const query = window.matchMedia('(max-width:767px)'); const update = () => setMobile(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  const change = locale === 'ar' ? 'اختيار تسليم آخر' : 'Choose another submission';
  return <section className="marking-queue" aria-label={t.marking} data-selected={!!selectedItem} data-expanded={expanded}><header><h2>{t.marking}</h2>{!selectedItem ? <p>{t.chooseSubmission}</p> : null}</header><details className="marking-queue__disclosure" open={!mobile || !selectedItem || expanded}><summary aria-disabled={disabled} onClick={event => { event.preventDefault(); if (!disabled) setExpanded(value => !value); }}>{selectedItem ? <><strong>{change}</strong><span><bdi>{selectedItem.assessmentTitle} · {selectedItem.learnerName}</bdi></span></> : t.chooseSubmission}</summary><div className="marking-queue__items">{items.length ? items.map(item => <button type="button" disabled={disabled} className={`marking-queue__item ${item.id === selected ? 'marking-queue__item--active' : ''}`} aria-pressed={item.id === selected} key={item.id} onClick={event => { setExpanded(false); onSelected(item.id, event.currentTarget); }}><strong>{item.assessmentTitle}</strong><span><bdi>{item.learnerName}</bdi></span><span>{item.currentResult?.status === 'RELEASED' ? t.published : item.currentResult ? t.review : t.openMarking}</span></button>) : <p className="learning-empty">{t.emptyMarking}</p>}</div></details></section>;
}
