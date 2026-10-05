'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { currentPortfolioRead, parsePortfolioCommandReceipt, parsePortfolioSourceWork, portfolioArtifactReviewKey, portfolioReadScope, portfolioSourceMatchesItem, type PortfolioItem, type PortfolioRead } from '../model';
import { portfolioAr, portfolioEn } from '../messages';
import { PortfolioArtifactDownload } from './artifact-download';
import { portfolioReviewFocus } from '../presentation-model';

export function PortfolioSourceWork({ item, reviewing = false, focusOnLoad = true, onLoaded, onSaved, onCancel }: { item: PortfolioItem; reviewing?: boolean; focusOnLoad?: boolean; onLoaded?: () => void; onSaved: () => void; onCancel: () => void }) {
  const app = useApp(); const { locale } = app; const t = locale === 'ar' ? portfolioAr : portfolioEn;
  const [refresh, setRefresh] = useState(0); const [artifactReceipt, setArtifactReceipt] = useState<PortfolioRead<string[]> | null>(null);
  const path = `/v1/portfolio/items/${item.id}/revisions/${item.revisionId}/source-work`; const scope = portfolioReadScope(app, path, refresh);
  const parse = useCallback((value: unknown) => ({ scope, value: parsePortfolioSourceWork(value) }), [scope]);
  const query = useApiQuery(scope ? path : null, parse, refresh);
  const work = currentPortfolioRead(query.data, scope);
  const reviewedArtifacts = currentPortfolioRead(artifactReceipt, scope) ?? [];
  const matches = portfolioSourceMatchesItem(work, item);
  const loading = query.loading || !!scope && !!query.data && !work;
  const detail = useRef<HTMLElement | null>(null); const focused = useRef(false);const reviewedFocus=useRef(false);
  useEffect(() => {
    if(!reviewing)reviewedFocus.current=false;
    const alreadyFocused=reviewing?reviewedFocus.current:focused.current;
    if (!loading && !alreadyFocused && (work || query.error)) {
      const intent=document.activeElement===document.body||document.activeElement?.getAttribute('data-portfolio-focus')===item.id;
      const move=portfolioReviewFocus({reviewing:reviewing&&app.membership?.role==='teacher',focusOnLoad,alreadyFocused,loading,settled:!!work||!!query.error,activeIntent:intent});
      if(move!=='none'){detail.current?.focus({preventScroll:true});if(move==='scroll')detail.current?.scrollIntoView({block:'start',behavior:'instant'});}
      focused.current = true;
      if(reviewing)reviewedFocus.current=true;
      onLoaded?.();
    }
  }, [loading, work, query.error, item.id, focusOnLoad, onLoaded, reviewing, app.membership?.role]);
  const documentsNeedReview = work?.source.artifacts?.some(asset => !reviewedArtifacts.includes(portfolioArtifactReviewKey(asset)) || asset.state !== 'AVAILABLE');
  const original=app.commandJournal.get(`/v1/portfolio/items/${item.id}/review`);
  return <section ref={detail} tabIndex={-1} aria-label={t.sourceWork} className={`portfolio-source-work${reviewing ? ' portfolio-source-work--reviewing' : ''}`}>
    {loading ? <p role="status">{t.loadingWork}</p> : query.error ? <><LearningError error={query.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.retryWork}</Button></> : !matches ? <LearningError error={new LearningApiError('invalid')} /> : <div className="portfolio-source-review-layout">
      <div className="portfolio-source-reading"><h3><CuevoIcon name="assessment" size={25} variant="filled" />{t.sourceWork}</h3><p><bdi>{work.learnerName}</bdi> · {work.source.assessmentTitle}</p><p className="learning-form__note">{t.submissionRevision}: {new Intl.NumberFormat(locale).format(work.source.submissionRevision)} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(work.source.submittedAt))}</bdi></p>{work.source.kind === 'TEXT' ? <p className="lesson-content" dir="auto">{work.source.content}</p> : null}{work.source.artifacts?.map(asset => <PortfolioArtifactDownload key={portfolioArtifactReviewKey(asset)} itemId={item.id} revisionId={item.revisionId} asset={asset} onReviewed={reviewing ? () => setArtifactReceipt(current => ({ scope, value: [...new Set([...(currentPortfolioRead(current, scope) ?? []), portfolioArtifactReviewKey(asset)])] })) : undefined} />)}</div>
      {reviewing ? <aside className="portfolio-source-review"><h3><CuevoIcon name="feedback" size={25} variant="filled" />{t.feedback}</h3>{documentsNeedReview ? <p className="notice">{t.reviewDocuments}</p> : <CommandForm key={`${scope}:${item.revisionId}`} title={t.review} path={`/v1/portfolio/items/${item.id}/review`} fields={[{ name: 'feedback', label: t.feedback, type: 'textarea', required: true, maxLength: 10000 }, { name: 'confirmSourceReview', label: t.confirmSourceReview, type: 'checkbox', required: true }, { name: 'featured', label: t.featured, type: 'checkbox', defaultChecked: item.featured }, { name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }, { name: 'confirmParentApproval', label: t.confirmParentApproval, type: 'checkbox' }]} body={values => ({ feedback: String(values.get('feedback')), confirmSourceReview: values.get('confirmSourceReview') === 'on', featured: values.get('featured') === 'on', parentVisible: values.get('parentVisible') === 'on', confirmParentApproval: values.get('confirmParentApproval') === 'on', expectedRevision: item.revision })} validateReceipt={(receipt, command) => { parsePortfolioCommandReceipt(receipt, 'review', { ...item, revision: Number(command.body.expectedRevision) }); }} onSaved={onSaved} onCancel={onCancel} note={t.reviewNote} />}</aside> : null}
    </div>}
    {reviewing && !matches ? <Button type="button" variant="quiet" disabled={!!original} onClick={onCancel}>{t.cancelReview}</Button> : null}
    {reviewing&&original&&(!matches||loading||documentsNeedReview)?<CommandForm title={t.review} path={original.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.originalRequestRecovery} validateReceipt={(receipt,command)=>parsePortfolioCommandReceipt(receipt,'review',{id:item.id,revisionId:item.revisionId,revision:Number(command.body.expectedRevision)})} onSaved={onSaved}/>:null}
  </section>;
}
