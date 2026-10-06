'use client';
import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { Button, Status, WorkspaceState } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import type { LearningApiError } from '../../../shared/api/client';
import type { Outcome } from '../model';
import { OutcomeList } from './outcomes';
import { coordinatorOutcomeChoices, coordinatorOutcomeDenied, coordinatorOutcomeSelection, currentCoordinatorOutcome, type CoordinatorOutcomeSelection } from '../coordinator-outcome-model';
import { currentImprovementDenial, type ImprovementSourceDenial } from '../source-page-model';
import { coordinatorOutcomeAr, coordinatorOutcomeEn, improvementAr, improvementEn } from '../messages';

type Source = { context?: string; data: Outcome[]; loaded: boolean; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null; loadMore: () => void };
export function CoordinatorOutcomes({ source, pageHeading=false }: { source: Source;pageHeading?:boolean }) {
  const { locale, accessGeneration } = useApp();
  const scope = `${source.context ?? ''}:${accessGeneration}`;
  const [selection, setSelection] = useState<{ scope: string; value: CoordinatorOutcomeSelection } | null>(null);
  const [denial, setDenial] = useState<ImprovementSourceDenial | null>(null);
  const currentDenial = currentImprovementDenial(denial, scope, source);
  if (denial !== currentDenial) setDenial(currentDenial);
  const currentSource = currentDenial ? { ...source, error: currentDenial.error } : source;
  const selected = selection?.scope === scope ? selection.value : null;
  const rows = !currentSource.loaded || currentSource.loading || currentSource.error || coordinatorOutcomeDenied(currentSource) ? [] : currentSource.data;
  const outcome = currentCoordinatorOutcome(selected, rows, currentSource);
  const heading = useRef<HTMLHeadingElement>(null), opener = useRef<HTMLButtonElement | null>(null);
  const focusReader = useRef(false), restoreOpener = useRef(false);
  useEffect(() => {
    opener.current = null; focusReader.current = false; restoreOpener.current = false;
  }, [scope]);
  useEffect(() => {
    if (focusReader.current && outcome && heading.current) {
      focusReader.current = false; heading.current.focus({ preventScroll: true });
      heading.current.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    if (restoreOpener.current && !selected) {
      restoreOpener.current = false;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    }
  }, [outcome, selected]);
  return <CoordinatorOutcomeView pageHeading={pageHeading} source={currentSource} rows={rows} outcome={outcome} hasSelection={!!selected} locale={locale} headingRef={heading}
    onOpen={(row, button) => { opener.current = button; focusReader.current = true; setSelection({ scope, value: coordinatorOutcomeSelection(row) }); }}
    onClose={() => { restoreOpener.current = true; setSelection(null); }} />;
}

/** The current source owner supplies selection; this view neither queries nor computes outcomes. */
export function CoordinatorOutcomeView({ source, rows, outcome, hasSelection, locale, onOpen, onClose, headingRef, pageHeading=false }: {
  source: Source; rows: Outcome[]; outcome: Outcome | null; hasSelection: boolean; locale: 'en' | 'ar';
  onOpen: (outcome: Outcome, button: HTMLButtonElement) => void; onClose: () => void; headingRef?: Ref<HTMLHeadingElement>;pageHeading?:boolean;
}) {
  const t = locale === 'ar' ? coordinatorOutcomeAr : coordinatorOutcomeEn, copy = locale === 'ar' ? improvementAr : improvementEn;
  const selectedHeading = useId(), denied = coordinatorOutcomeDenied(source);
  const admitted = source.loaded && !source.loading && !source.error && !denied;
  const currentRows = admitted ? rows : [], currentOutcome = admitted ? outcome : null;
  const choices = coordinatorOutcomeChoices(currentRows, locale, { unavailable: copy.outcomeTitleUnavailable, review: copy.outcomeContextReview });
  const status = (row: Outcome) => row.status === 'improved' ? copy.improved : row.status === 'no_meaningful_change' ? copy.noMeaningfulChange : copy.inconclusive;
  return <section className="coordinator-outcomes"><header>{pageHeading?null:<h2>{t.title}</h2>}<p>{t.note}</p></header>
    {source.loading || !source.loaded && !source.error && !denied ? <WorkspaceState kind="loading" icon="refresh" title={copy.loading} role="status"/> : source.error || denied ? <LearningError error={source.error ?? source.moreError!} /> :
      <div className="coordinator-outcome-layout" data-selected={!!currentOutcome}>
        <section className="coordinator-outcome-directory" aria-label={t.directory}>
          {currentRows.length?<h3>{t.directory}</h3>:null}{choices.some(row => row.requiresReview) ? <WorkspaceState kind="review" icon="help" description={copy.outcomeContextReview} role="status"/> : null}
          {currentRows.length ? <ul>{currentRows.map(row => {
            const choice = choices.find(choice => choice.id === row.id)!;
            return <li key={row.id}><div><h4>{row.context?.practiceTitle ?? copy.outcomeTitleUnavailable}</h4><p><bdi>{choice.label}</bdi></p><Status>{status(row)}</Status></div>
              <Button type="button" variant={currentOutcome?.id === row.id ? 'primary' : 'secondary'} aria-pressed={currentOutcome?.id === row.id} disabled={choice.requiresReview} onClick={event => onOpen(row, event.currentTarget)}>{t.open}</Button></li>;
          })}</ul> : <WorkspaceState kind={source.nextCursor||source.moreError||source.loadingMore?"unknown":"empty"} icon="progress" title={source.nextCursor||source.moreError||source.loadingMore?undefined:copy.noOutcomes} description={source.nextCursor||source.moreError||source.loadingMore?t.partial:copy.emptyOutcomesBody}/>}
          {hasSelection && !currentOutcome ? <WorkspaceState kind="review" icon="refresh" description={t.changed} role="status"/> : !currentOutcome && currentRows.length ? <WorkspaceState kind="review" icon="progress" description={t.choose}/> : null}
          {currentRows.length > 0 && (source.nextCursor || source.moreError || source.loadingMore) ? <WorkspaceState kind="unknown" icon="help" description={t.partial} role="status"/> : null}
          {source.nextCursor || source.moreError ? <LoadMore query={source} label={copy.outcomes} /> : null}
        </section>
        {currentOutcome ? <section className="coordinator-outcome-selected" aria-labelledby={selectedHeading}><div className="coordinator-outcome-selected-heading">
          <h3 id={selectedHeading} ref={headingRef} tabIndex={-1}>{t.selected}</h3><Button type="button" variant="quiet" onClick={onClose}>{t.close}</Button>
        </div>{source.nextCursor || source.moreError || source.loadingMore ? <div className="coordinator-outcome-selected-source-state"><WorkspaceState kind="unknown" icon="help" description={t.partial} role="status"/>{source.moreError ? <LearningError error={source.moreError} /> : null}</div> : null}<OutcomeList outcomes={[currentOutcome]} headingLevel={4} /></section> : null}
      </div>}
  </section>;
}
