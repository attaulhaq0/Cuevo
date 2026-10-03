'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { NativeResultView } from '../../academic/ui';
import { parsePortfolioCommandReceipt, parsePortfolioCollection, parsePortfolioCollectionPage, parsePortfolioPlacement, parsePortfolioFeedbackRequest, parsePortfolioRequestedReview, portfolioWorkChoices, portfolioReadScope, currentPortfolioRead, portfolioRequestedReviewMatchesRequest, portfolioArtifactReviewKey, type PortfolioItem, type PortfolioFeedbackRequest, type PortfolioRead } from '../model';
import { portfolioAr, portfolioEn, portfolioTrailAr, portfolioTrailEn } from '../messages';
import { PortfolioArtifactDownload } from './artifact-download';
import { trailAssets } from '../../../shared/characters/assets';

function RequestedReview({ request, onSaved, onCancel }: { request: PortfolioFeedbackRequest; onSaved: () => void; onCancel: () => void }) {
  const app = useApp(); const t = app.locale === 'ar' ? portfolioAr : portfolioEn;
  const [refresh, setRefresh] = useState(0); const [reviewReceipt, setReviewReceipt] = useState<PortfolioRead<string[]> | null>(null);
  const path = `/v1/portfolio/feedback-requests/${request.id}/source-work`;
  const scope = portfolioReadScope(app, path, refresh);
  const parse = useCallback((value: unknown) => ({ scope, value: parsePortfolioRequestedReview(value) }), [scope]);
  const read = useApiQuery(scope ? path : null, parse, refresh);
  const source = currentPortfolioRead(read.data, scope);
  const reviewed = currentPortfolioRead(reviewReceipt, scope) ?? [];
  const matches = source && portfolioRequestedReviewMatchesRequest(source, request);
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current && !read.loading && (source || read.error) && heading.current) { heading.current.focus(); focused.current = true; } }, [read.loading, source, read.error]);
  const docsNeedReview = !!source?.work?.source.artifacts?.some(asset => asset.state !== 'AVAILABLE' || !reviewed.includes(portfolioArtifactReviewKey(asset)));
  return <section aria-label={t.openRequestedWork} className="portfolio-requested-review"><h3 ref={heading} tabIndex={-1}>{t.openRequestedWork}</h3>{read.loading || !read.error && !source ? <p role="status">{t.loadingWork}</p> : read.error ? <><LearningError error={read.error} /><Button type="button" variant="quiet" onClick={() => { setReviewReceipt(null); setRefresh(value => value + 1); }}>{t.retryWork}</Button></> : !matches ? <><LearningError error={new LearningApiError('invalid')} /><Button type="button" variant="quiet" onClick={onCancel}>{t.cancelReview}</Button></> : <>
    <header className="portfolio-request-heading"><CuevoIcon name="reflection" size={26} /><div><h4><bdi>{source.title}</bdi></h4><p><bdi>{source.learnerName}</bdi> · <bdi>{source.assessmentTitle}</bdi> · <bdi>{source.referenceTitle}</bdi></p></div></header>
    <div className="portfolio-request-review-layout"><div><NativeResultView result={source.nativeResult} /><h4>{t.reflection}</h4><p className="portfolio-reflection-text" dir="auto">{source.reflection}</p>{source.work ? <><h4>{t.sourceWork}</h4><p>{t.submissionRevision}: {new Intl.NumberFormat(app.locale).format(source.work.source.submissionRevision)} · <bdi>{new Intl.DateTimeFormat(app.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(source.work.source.submittedAt))}</bdi></p>{source.work.source.kind === 'TEXT' ? <p className="portfolio-submitted-text" dir="auto">{source.work.source.content}</p> : null}{source.work.source.artifacts?.map(asset => <PortfolioArtifactDownload key={portfolioArtifactReviewKey(asset)} itemId={source.itemId} revisionId={source.revisionId} asset={asset} onReviewed={() => { const key = portfolioArtifactReviewKey(asset); setReviewReceipt(current => ({ scope, value: [...new Set([...(currentPortfolioRead(current, scope) ?? []), key])] })); }} />)}</> : null}</div>
    <div>{docsNeedReview ? <p className="notice">{t.reviewDocuments}</p> : <CommandForm key={source.revisionId} title={t.reviewRequestedWork} path={`/v1/portfolio/items/${source.itemId}/review`} fields={[{ name: 'feedback', label: t.feedback, type: 'textarea', required: true, maxLength: 10000 }, { name: 'confirmSourceReview', label: t.confirmRequestedReview, type: 'checkbox', required: true }]} body={values => ({ expectedRevision: source.revision, feedback: String(values.get('feedback')), featured: false, parentVisible: false, confirmParentApproval: false, confirmSourceReview: values.get('confirmSourceReview') === 'on' })} validateReceipt={(receipt,command)=>{parsePortfolioCommandReceipt(receipt,'review',{id:source.itemId,revisionId:source.revisionId,revision:Number(command.body.expectedRevision)});}} onSaved={onSaved} onCancel={onCancel} />}</div></div>
  </>}</section>;
}

export function PortfolioOrganization({ items, refresh, onChanged }: { items: PortfolioItem[]; refresh: number; onChanged: () => void }) {
  const app = useApp(); const { locale, membership } = app;
  const t = locale === 'ar' ? portfolioAr : portfolioEn; const trail = locale === 'ar' ? portfolioTrailAr : portfolioTrailEn;
  const student = membership?.role === 'student'; const allowed = ['student', 'teacher', 'admin'].includes(membership?.role ?? '');
  const [create, setCreate] = useState(false); const [itemId, setItemId] = useState(''); const [collectionId, setCollectionId] = useState(''); const [requestId, setRequestId] = useState<string | null>(null); const [cursor, setCursor] = useState<string | null>(null);
  const collections = usePaginatedLearningQuery(student ? '/v1/portfolio/collections?limit=25' : null, parsePortfolioCollection, refresh);
  const requests = usePaginatedLearningQuery(allowed ? '/v1/portfolio/feedback-requests?limit=25' : null, parsePortfolioFeedbackRequest, refresh);
  const placementPath = student && itemId ? `/v1/portfolio/items/${itemId}/placement` : null;
  const placementScope = portfolioReadScope(app, placementPath, refresh);
  const parsePlacement = useCallback((value: unknown) => ({ scope: placementScope, value: parsePortfolioPlacement(value) }), [placementScope]);
  const placement = useApiQuery(placementPath, parsePlacement, refresh);
  const placementValue = currentPortfolioRead(placement.data, placementScope);
  const choices = portfolioWorkChoices(items, locale);
  const selected = items.find(item => item.id === itemId && !choices.find(choice => choice.value === item.id)?.ambiguous);
  const currentPlacement = placementValue?.id === itemId ? placementValue : null;
  const collectionPath = student && collectionId ? `/v1/portfolio/collections/${collectionId}/items?limit=25${cursor ? `&cursor=${cursor}` : ''}` : null;
  const collectionScope = portfolioReadScope(app, collectionPath, refresh);
  const parseCollection = useCallback((value: unknown) => ({ scope: collectionScope, value: parsePortfolioCollectionPage(value) }), [collectionScope]);
  const collection = useApiQuery(collectionPath, parseCollection, refresh);
  const currentCollection = currentPortfolioRead(collection.data, collectionScope);
  const selectedRequest = requests.data.find(request => request.id === requestId);
  function saved() { setCreate(false); setCursor(null); onChanged(); }
  if (!allowed) return null;
  return <section className="portfolio-organization" aria-label={t.organizeWork}>
    <header className="portfolio-section-heading"><img src={trailAssets.portfolio} width={56} height={56} alt="" aria-hidden="true" /><div><h2>{t.organizeWork}</h2>{student ? <p>{trail.collectionStory}</p> : null}</div></header>
    <div className={`portfolio-organization-layout${student ? '' : ' portfolio-organization-layout--reviewer'}`}>
      {student ? <div className="portfolio-collection-controls">
        <Button type="button" variant="secondary" onClick={() => setCreate(true)}><CuevoIcon name="portfolio" size={18} />{t.createCollection}</Button>
        {create ? <CommandForm title={t.createCollection} path="/v1/portfolio/collections" fields={[{ name: 'title', label: t.collectionTitle, required: true, maxLength: 200 }, { name: 'description', label: t.collectionDescription, type: 'textarea', maxLength: 2000 }]} body={values => ({ title: String(values.get('title')), description: String(values.get('description') ?? '') })} onSaved={saved} onCancel={() => setCreate(false)} /> : null}
        {collections.loading ? <p role="status">{t.loading}</p> : collections.error ? <LearningError error={collections.error} /> : <>
          <div className="field"><label htmlFor="portfolio-collection">{t.collectionTitle}</label><select id="portfolio-collection" value={collectionId} onChange={event => { setCollectionId(event.target.value); setCursor(null); }}><option value="">{t.chooseCollection}</option>{collections.data.map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select></div>
          <div className="field"><label htmlFor="portfolio-organize-item">{t.selectedWork}</label><select id="portfolio-organize-item" value={itemId} onChange={event => setItemId(event.target.value)}><option value="">{t.selectedWork}</option>{choices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.ambiguous}>{choice.label}</option>)}</select></div>{choices.some(choice => choice.ambiguous) ? <p className="notice">{t.ambiguousWork}</p> : null}
        </>}
        <LoadMore query={collections} />
        {placement.loading || placementPath && !placement.error && !placementValue ? <p role="status">{t.loading}</p> : placement.error ? <LearningError error={placement.error} /> : selected && currentPlacement && !collections.loading && !collections.error ? <>
          <CommandForm key={`${itemId}:${currentPlacement.revision}`} title={t.moveSelectedWork} path={`/v1/portfolio/items/${itemId}/placement`} fields={[{ name: 'collectionId', label: t.collectionTitle, type: 'select', defaultValue: currentPlacement.collectionId ?? '', options: [{ value: '', label: t.uncollected }, ...collections.data.map(collection => ({ value: collection.id, label: collection.title }))] }, { name: 'position', label: t.collectionPosition, type: 'number', required: true, min: 1, max: 10000, defaultValue: currentPlacement.position }]} body={values => ({ collectionId: values.get('collectionId') ? String(values.get('collectionId')) : null, position: Number(values.get('position')), expectedRevision: currentPlacement.revision })} onSaved={saved} />
          {selected.approvalState === 'AWAITING_REVIEW' && requests.loaded && !requests.loading && !requests.error && !requests.data.some(request => request.itemId === itemId && request.revisionId === selected.revisionId) ? <CommandForm key={selected.revisionId} title={t.requestFeedback} path={`/v1/portfolio/items/${itemId}/feedback-request`} fields={[{ name: 'message', label: t.feedbackRequestMessage, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmRequest', label: t.confirmFeedbackRequest, type: 'checkbox', required: true }]} body={values => ({ revisionId: selected.revisionId, expectedRevision: selected.revision, message: String(values.get('message')), confirmRequest: values.get('confirmRequest') === 'on' })} onSaved={saved} /> : null}
        </> : placementValue && !currentPlacement ? <LearningError error={new LearningApiError('invalid')} /> : null}
        {collection.loading || collectionPath && !collection.error && !currentCollection ? <p role="status">{t.loading}</p> : collection.error ? <LearningError error={collection.error} /> : currentCollection?.id === collectionId ? <section className="portfolio-collection-story"><h3><bdi>{currentCollection.title}</bdi></h3>{!currentCollection.items.length ? <p>{t.emptyCollection}</p> : currentCollection.items.map(item => <article key={item.id}><h4><bdi>{item.title}</bdi></h4><p dir="auto">{item.reflection}</p><p className="portfolio-help">{t.collectionPosition}: {new Intl.NumberFormat(locale).format(item.position)}</p></article>)}<div className="learning-actions">{cursor ? <Button type="button" variant="quiet" onClick={() => setCursor(null)}>{t.firstCollectionPage}</Button> : null}{currentCollection.nextCursor ? <Button type="button" variant="secondary" onClick={() => setCursor(currentCollection.nextCursor)}>{t.nextCollectionPage}</Button> : null}</div></section> : currentCollection ? <LearningError error={new LearningApiError('invalid')} /> : null}
      </div> : null}
      <section className="portfolio-feedback-requests"><h3><CuevoIcon name="feedback" size={24} variant="filled" />{t.feedbackRequests}</h3>{requests.loading ? <p role="status">{t.loading}</p> : requests.error ? <LearningError error={requests.error} /> : requests.loaded && !requests.data.length ? <p>{t.noRequests}</p> : requests.data.map(request => <article key={request.id} data-portfolio-request-id={request.id}><h4><bdi>{request.title}</bdi> · <bdi>{request.learnerName}</bdi></h4><p className="portfolio-request-message" dir="auto">{request.message}</p><p className="portfolio-help">{t.pendingFeedback} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.requestedAt))}</bdi></p>{!student ? <Button type="button" variant="secondary" aria-expanded={requestId === request.id} onClick={() => setRequestId(request.id)}><CuevoIcon name="learning" size={18} />{t.openRequestedWork}</Button> : null}</article>)}<LoadMore query={requests} /></section>
    </div>
    {!student && selectedRequest ? <RequestedReview key={`${selectedRequest.id}:${refresh}`} request={selectedRequest} onSaved={() => { setRequestId(null); saved(); }} onCancel={() => setRequestId(null)} /> : null}
  </section>;
}
