'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { NativeResultView } from '../../academic/ui';
import { parsePortfolioCommandReceipt, parsePortfolioOrganizationReceipt, parsePortfolioOrganizationSelection, parsePortfolioCollection, parsePortfolioCollectionPage, parsePortfolioPlacement, parsePortfolioFeedbackRequest, parsePortfolioRequestedReview, portfolioWorkChoices, portfolioCollectionChoices, portfolioReadScope, currentPortfolioRead, portfolioRequestedReviewMatchesRequest, portfolioArtifactReviewKey, type PortfolioItem, type PortfolioFeedbackRequest, type PortfolioRead, type PortfolioOrganizationSelection } from '../model';
import { portfolioAr, portfolioEn, portfolioTrailAr, portfolioTrailEn } from '../messages';
import { PortfolioArtifactDownload } from './artifact-download';
import { trailAssets } from '../../../shared/characters/assets';

type RequestedIdentity = Pick<PortfolioFeedbackRequest,'id'|'itemId'|'revisionId'>;
function RequestedReview({ request, sourceRefresh, onSaved, onCancel, onLockedChange, locked }: { request: PortfolioFeedbackRequest|RequestedIdentity; sourceRefresh: number; onSaved: () => void; onCancel: () => void; onLockedChange: (locked: boolean) => void; locked: boolean }) {
  const app = useApp(); const t = app.locale === 'ar' ? portfolioAr : portfolioEn;
  const [refresh, setRefresh] = useState(0); const [reviewReceipt, setReviewReceipt] = useState<PortfolioRead<string[]> | null>(null);
  const path = `/v1/portfolio/feedback-requests/${request.id}/source-work`;
  const queryRefresh = refresh + sourceRefresh;
  const scope = portfolioReadScope(app, path, queryRefresh);
  const parse = useCallback((value: unknown) => ({ scope, value: parsePortfolioRequestedReview(value) }), [scope]);
  const read = useApiQuery(scope ? path : null, parse, queryRefresh);
  const source = currentPortfolioRead(read.data, scope);
  const reviewed = currentPortfolioRead(reviewReceipt, scope) ?? [];
  const matches = source && 'learnerId' in request && portfolioRequestedReviewMatchesRequest(source, request);
  const reviewPath = `/v1/portfolio/items/${request.itemId}/review`;
  const original = app.commandJournal.get(reviewPath);
  const originalCurrent = !original || !!source && original.body.expectedRevision === source.revision;
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current && !read.loading && (source || read.error) && heading.current) { heading.current.focus(); focused.current = true; } }, [read.loading, source, read.error]);
  const docsNeedReview = !!source?.work?.source.artifacts?.some(asset => asset.state !== 'AVAILABLE' || !reviewed.includes(portfolioArtifactReviewKey(asset)));
  return <section aria-label={t.openRequestedWork} className="portfolio-requested-review"><Button type="button" variant="quiet" disabled={locked} onClick={onCancel}>{t.backToRequests}</Button><h3 ref={heading} tabIndex={-1}>{t.openRequestedWork}</h3>{read.loading || !read.error && !source ? <p role="status">{t.loadingWork}</p> : read.error ? <><LearningError error={read.error} /><Button type="button" variant="quiet" onClick={() => { setReviewReceipt(null); setRefresh(value => value + 1); }}>{t.retryWork}</Button></> : !matches ? <LearningError error={new LearningApiError('invalid')} /> : <>
    <header className="portfolio-request-heading"><CuevoIcon name="reflection" size={26} /><div><h4><bdi>{source.title}</bdi></h4><p><bdi>{source.learnerName}</bdi> · <bdi>{source.assessmentTitle}</bdi> · <bdi>{source.referenceTitle}</bdi></p></div></header>
    <div className="portfolio-request-review-layout"><div><NativeResultView result={source.nativeResult} /><h4>{t.reflection}</h4><p className="portfolio-reflection-text" dir="auto">{source.reflection}</p>{source.work ? <><h4>{t.sourceWork}</h4><p>{t.submissionRevision}: {new Intl.NumberFormat(app.locale).format(source.work.source.submissionRevision)} · <bdi>{new Intl.DateTimeFormat(app.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(source.work.source.submittedAt))}</bdi></p>{source.work.source.kind === 'TEXT' ? <p className="portfolio-submitted-text" dir="auto">{source.work.source.content}</p> : null}{source.work.source.artifacts?.map(asset => <PortfolioArtifactDownload key={portfolioArtifactReviewKey(asset)} itemId={source.itemId} revisionId={source.revisionId} asset={asset} onReviewed={() => { const key = portfolioArtifactReviewKey(asset); setReviewReceipt(current => ({ scope, value: [...new Set([...(currentPortfolioRead(current, scope) ?? []), key])] })); }} />)}</> : null}</div>
    <div>{docsNeedReview ? <p className="notice">{t.reviewDocuments}</p> : originalCurrent ? <CommandForm key={source.revisionId} title={t.reviewRequestedWork} path={reviewPath} draftKey={`/v1/portfolio/organization/review/${source.itemId}/${source.revisionId}`} fields={[{ name: 'feedback', label: t.feedback, type: 'textarea', required: true, maxLength: 10000 }, { name: 'confirmSourceReview', label: t.confirmRequestedReview, type: 'checkbox', required: true }]} body={values => ({ expectedRevision: source.revision, feedback: String(values.get('feedback')), featured: false, parentVisible: false, confirmParentApproval: false, confirmSourceReview: values.get('confirmSourceReview') === 'on' })} validateReceipt={(receipt,command)=>{parsePortfolioCommandReceipt(receipt,'review',{id:source.itemId,revisionId:source.revisionId,revision:Number(command.body.expectedRevision)});}} onLockedChange={onLockedChange} onSaved={onSaved} onCancel={onCancel} /> : null}</div></div>
  </>}{original && (!matches || !originalCurrent || docsNeedReview) ? <CommandForm title={t.reviewRequestedWork} path={reviewPath} fields={[]} body={() => { throw new LearningApiError('conflict'); }} note={t.originalRequestRecovery} onLockedChange={onLockedChange} validateReceipt={(receipt,command) => { parsePortfolioCommandReceipt(receipt,'review',{id:request.itemId,revisionId:request.revisionId,revision:Number(command.body.expectedRevision)}); }} onSaved={onSaved} /> : null}</section>;
}

export function PortfolioOrganization({ items, refresh, onChanged, reviewPathOwned }: { items: PortfolioItem[]; refresh: number; onChanged: () => void; reviewPathOwned?: string }) {
  const app = useApp();
  return <CurrentPortfolioOrganization key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`} items={items} refresh={refresh} onChanged={onChanged} reviewPathOwned={reviewPathOwned} />;
}

function CurrentPortfolioOrganization({ items, refresh, onChanged, reviewPathOwned }: { items: PortfolioItem[]; refresh: number; onChanged: () => void; reviewPathOwned?: string }) {
  const app = useApp(); const { locale, membership } = app;
  const t = locale === 'ar' ? portfolioAr : portfolioEn; const trail = locale === 'ar' ? portfolioTrailAr : portfolioTrailEn;
  const student = membership?.role === 'student'; const allowed = ['student', 'teacher', 'admin'].includes(membership?.role ?? '');
  const selectionSlot = `${membership?.schoolId}:${membership?.userId}:/v1/portfolio/organization:selection`;
  const [initial] = useState<PortfolioOrganizationSelection|null>(() => { try { return parsePortfolioOrganizationSelection(app.formDrafts.model(selectionSlot)); } catch { return null; } });
  const initialAction = initial && (initial.kind==='placement'||initial.kind==='feedback-request') ? initial : null;
  const [create, setCreate] = useState(student && initial?.kind==='create'); const [itemId, setItemId] = useState(initialAction?.itemId??''); const [collectionId, setCollectionId] = useState(''); const [requestId, setRequestId] = useState<string | null>(!student&&initial?.kind==='review'?initial.requestId:null); const [cursor, setCursor] = useState<string | null>(null);
  const [requestIntent, setRequestIntent] = useState<RequestedIdentity|null>(!student&&initial?.kind==='review'?{id:initial.requestId,itemId:initial.itemId,revisionId:initial.revisionId}:null);
  const [action, setAction] = useState<{type:'placement'|'feedback-request';itemId:string;revisionId:string;revision:number;placementRevision:number}|null>(student&&initialAction?{type:initialAction.kind,itemId:initialAction.itemId,revisionId:initialAction.revisionId,revision:initialAction.revision,placementRevision:initialAction.kind==='placement'?initialAction.placementRevision:0}:null);
  const [locked, setLocked] = useState(false);
  useSyncExternalStore(app.commandJournal.subscribe, app.commandJournal.getSnapshot, app.commandJournal.getSnapshot);
  const pending = app.commandJournal.pending().some(command => command.path === '/v1/portfolio/collections' || /^\/v1\/portfolio\/items\/[^/]+\/(placement|feedback-request|review)$/.test(command.path));
  const selectionLocked = locked || pending;
  const onLocked = useCallback((value:boolean) => setLocked(value), []);
  const heading = useRef<HTMLHeadingElement>(null), reader = useRef<HTMLElement>(null), opener = useRef<HTMLElement>(null), focusReader = useRef(false), focusDirectory = useRef(false);
  const collections = usePaginatedLearningQuery(student ? '/v1/portfolio/collections?limit=25' : null, parsePortfolioCollection, refresh);
  const requests = usePaginatedLearningQuery(allowed ? '/v1/portfolio/feedback-requests?limit=25' : null, parsePortfolioFeedbackRequest, refresh);
  const placementPath = student && itemId ? `/v1/portfolio/items/${itemId}/placement` : null;
  const placementScope = portfolioReadScope(app, placementPath, refresh);
  const parsePlacement = useCallback((value: unknown) => ({ scope: placementScope, value: parsePortfolioPlacement(value) }), [placementScope]);
  const placement = useApiQuery(placementPath, parsePlacement, refresh);
  const placementValue = currentPortfolioRead(placement.data, placementScope);
  const choices = portfolioWorkChoices(items, locale);
  const selected = items.find(item => item.id === itemId && choices.some(choice => choice.value === item.id && !choice.ambiguous && !choice.unavailable));
  const currentPlacement = placementValue?.id === itemId ? placementValue : null;
  const collectionChoices = portfolioCollectionChoices(collections.data, locale);
  const usableCollections = collectionChoices.filter(choice => !choice.ambiguous && !choice.unavailable);
  const selectedCollection = usableCollections.find(choice => choice.value === collectionId);
  const placementContextReady = !collections.loading && !collections.error && (currentPlacement?.collectionId === null || usableCollections.some(choice => choice.value === currentPlacement?.collectionId));
  const collectionPath = student && selectedCollection ? `/v1/portfolio/collections/${selectedCollection.value}/items?limit=25${cursor ? `&cursor=${cursor}` : ''}` : null;
  const collectionScope = portfolioReadScope(app, collectionPath, refresh);
  const parseCollection = useCallback((value: unknown) => ({ scope: collectionScope, value: parsePortfolioCollectionPage(value) }), [collectionScope]);
  const collection = useApiQuery(collectionPath, parseCollection, refresh);
  const currentCollection = currentPortfolioRead(collection.data, collectionScope);
  const currentRequest = requests.data.find(request => request.id === requestId);
  const retainedReview = requestIntent && app.commandJournal.get(`/v1/portfolio/items/${requestIntent.itemId}/review`);
  // A pending original command keeps its recovery owner even after its queue
  // row disappears. Private source content still needs a fresh scoped read.
  const requestStillCurrent = !!currentRequest && !!requestIntent && currentRequest.id === requestIntent.id && currentRequest.itemId === requestIntent.itemId && currentRequest.revisionId === requestIntent.revisionId;
  const selectedRequest = retainedReview && !requestStillCurrent ? requestIntent : currentRequest;
  const actionPath = action ? `/v1/portfolio/items/${action.itemId}/${action.type}` : null;
  const original = actionPath ? app.commandJournal.get(actionPath) : undefined;
  const actionCurrent = !!action && !!selected && selected.id === action.itemId && selected.revisionId === action.revisionId && selected.revision === action.revision && (action.type !== 'placement' || !!currentPlacement && currentPlacement.revision === action.placementRevision && placementContextReady);
  const reading = student ? create || !!action : !!selectedRequest;
  const orphaned = !reading ? app.commandJournal.pending().find(command => command.path !== reviewPathOwned && (command.path === '/v1/portfolio/collections' || /^\/v1\/portfolio\/items\/[^/]+\/(placement|feedback-request|review)$/.test(command.path))) : undefined;
  useEffect(() => { if (focusReader.current && reader.current) { reader.current.focus(); focusReader.current = false; } if (focusDirectory.current) { const target=opener.current?.isConnected && opener.current.getClientRects().length ? opener.current : heading.current; target?.focus(); focusDirectory.current=false; } }, [reading]);
  function saved() { app.formDrafts.remove(selectionSlot); setCreate(false); setAction(null); setCursor(null); onChanged(); }
  function close() { if(selectionLocked)return; app.formDrafts.remove(selectionSlot); setCreate(false); setAction(null); setRequestId(null); focusDirectory.current=true; }
  function chooseAction(type:'placement'|'feedback-request',element:HTMLElement) { if(selectionLocked||!selected||!currentPlacement)return; opener.current=element; focusReader.current=true; const intent={itemId:selected.id,revisionId:selected.revisionId,revision:selected.revision};app.formDrafts.saveModel(selectionSlot,type==='placement'?{kind:type,...intent,placementRevision:currentPlacement.revision}:{kind:type,...intent});setAction({type,...intent,placementRevision:currentPlacement.revision}); }
  if (!allowed) return null;
  return <section className="portfolio-organization" aria-label={t.organizeWork}>
    <header className="portfolio-section-heading cuevo-section-header cuevo-section-header--illustrated"><img src={trailAssets.portfolio} width={56} height={56} alt="" aria-hidden="true" /><div className="cuevo-section-header__context"><h2 ref={heading} tabIndex={-1}>{t.organizeWork}</h2>{student ? <p>{trail.collectionStory}</p> : null}</div>{student && !create ? <Button type="button" variant="secondary" disabled={selectionLocked || !!action} onClick={event => { opener.current=event.currentTarget;focusReader.current=true;app.formDrafts.saveModel(selectionSlot,{kind:'create'});setCreate(true); }}><CuevoIcon name="portfolio" size={18} />{t.createCollection}</Button> : null}</header>
    <div data-selected={reading} className={`portfolio-organization-layout${student ? '' : ' portfolio-organization-layout--reviewer'}`}>
      {student ? <div className="portfolio-collection-controls">
        {collections.loading ? <p role="status">{t.loading}</p> : collections.error ? <LearningError error={collections.error} /> : <>
          <div className="field"><label htmlFor="portfolio-collection">{t.collectionTitle}</label><select id="portfolio-collection" value={collectionId} disabled={selectionLocked} onChange={event => { if(selectionLocked)return;setCollectionId(event.target.value); setCursor(null); }}><option value="">{t.chooseCollection}</option>{collectionChoices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.ambiguous || choice.unavailable}>{choice.label}</option>)}</select></div>
          <div className="field"><label htmlFor="portfolio-organize-item">{t.selectedWork}</label><select id="portfolio-organize-item" value={itemId} disabled={selectionLocked} onChange={event => {if(selectionLocked)return;setAction(null);setItemId(event.target.value);}}><option value="">{t.selectedWork}</option>{choices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.ambiguous || choice.unavailable}>{choice.label}</option>)}</select></div>{choices.some(choice => choice.ambiguous) ? <p className="notice">{t.ambiguousWork}</p> : null}{choices.some(choice => choice.unavailable) ? <p className="notice">{t.identityUnknown}</p> : null}{collectionChoices.some(choice => choice.ambiguous || choice.unavailable) ? <p className="notice">{t.collectionChoicesReview}</p> : null}
        </>}
        <LoadMore query={{...collections,loadingMore:collections.loadingMore||selectionLocked,loadMore:()=>{if(!selectionLocked)collections.loadMore();}}} />
        {placement.loading || placementPath && !placement.error && !placementValue ? <p role="status">{t.loading}</p> : placement.error ? <LearningError error={placement.error} /> : selected && currentPlacement && !collections.loading && !collections.error ? <>
          {!placementContextReady ? <p className="notice">{t.collectionChoicesReview}</p> : !action && !create ? <Button type="button" variant="secondary" disabled={selectionLocked} onClick={event=>chooseAction('placement',event.currentTarget)}>{t.moveSelectedWork}</Button> : null}
          {!action && !create && selected.approvalState === 'AWAITING_REVIEW' && requests.loaded && !requests.loading && !requests.error && !requests.data.some(request => request.itemId === itemId && request.revisionId === selected.revisionId) ? <Button type="button" variant="secondary" disabled={selectionLocked} onClick={event=>chooseAction('feedback-request',event.currentTarget)}>{t.requestFeedback}</Button> : null}
        </> : placementValue && !currentPlacement ? <LearningError error={new LearningApiError('invalid')} /> : null}
        {collection.loading || collectionPath && !collection.error && !currentCollection ? <p role="status">{t.loading}</p> : collection.error ? <LearningError error={collection.error} /> : selectedCollection && currentCollection?.id === selectedCollection.value ? <section className="portfolio-collection-story"><h3><bdi>{selectedCollection.label}</bdi></h3>{!currentCollection.items.length ? <p>{t.emptyCollection}</p> : currentCollection.items.map(item => <article key={item.id}><h4><bdi>{item.title}</bdi></h4><p dir="auto">{item.reflection}</p><p className="portfolio-help">{t.collectionPosition}: {new Intl.NumberFormat(locale).format(item.position)}</p></article>)}<div className="learning-actions">{cursor ? <Button type="button" variant="quiet" disabled={selectionLocked} onClick={() => setCursor(null)}>{t.firstCollectionPage}</Button> : null}{currentCollection.nextCursor ? <Button type="button" variant="secondary" disabled={selectionLocked} onClick={() => setCursor(currentCollection.nextCursor)}>{t.nextCollectionPage}</Button> : null}</div></section> : currentCollection ? <LearningError error={new LearningApiError('invalid')} /> : null}
      </div> : null}
      {student && reading ? <section ref={reader} tabIndex={-1} className="portfolio-organization-reader"><Button type="button" variant="quiet" disabled={selectionLocked} onClick={close}>{t.backToOrganization}</Button>
        {actionCurrent && selected ? <header className="portfolio-request-heading"><CuevoIcon name="reflection" size={24}/><div><h3><bdi>{selected.title}</bdi></h3><p><bdi>{selected.assessmentTitle}</bdi> · <bdi>{selected.referenceTitle}</bdi></p></div></header> : null}
        {create ? <CommandForm title={t.createCollection} path="/v1/portfolio/collections" fields={[{name:'title',label:t.collectionTitle,required:true,maxLength:200},{name:'description',label:t.collectionDescription,type:'textarea',maxLength:2000}]} body={values=>({title:String(values.get('title')),description:String(values.get('description')??'')})} validateReceipt={(receipt,command)=>{parsePortfolioOrganizationReceipt(receipt,'collection.create',Number(command.body.expectedRevision));}} onLockedChange={onLocked} onSaved={saved} onCancel={close} /> : action && actionPath ? original && (!actionCurrent || placement.loading || !!placement.error) ? <CommandForm title={action.type==='placement'?t.moveSelectedWork:t.requestFeedback} path={actionPath} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.originalRequestRecovery} validateReceipt={(receipt,command)=>{parsePortfolioOrganizationReceipt(receipt,action.type==='placement'?'placement.create':'feedback.request',Number(command.body.expectedRevision));}} onLockedChange={onLocked} onSaved={saved} /> : !actionCurrent ? <p className="notice">{t.organizationSourceChanged}</p> : action.type==='placement' ? <CommandForm key={`${actionPath}:${action.placementRevision}`} title={t.moveSelectedWork} path={actionPath} draftKey={`/v1/portfolio/organization/placement/${action.itemId}/${action.revisionId}/${action.placementRevision}`} fields={[{name:'collectionId',label:t.collectionTitle,type:'select',defaultValue:currentPlacement!.collectionId??'',options:[{value:'',label:t.uncollected},...usableCollections]},{name:'position',label:t.collectionPosition,type:'number',required:true,min:1,max:10000,defaultValue:currentPlacement!.position}]} body={values=>{if(!actionCurrent)throw new LearningApiError('conflict');const target=String(values.get('collectionId')??'');if(target&&!usableCollections.some(choice=>choice.value===target))throw new LearningApiError('invalid');return{collectionId:target||null,position:Number(values.get('position')),expectedRevision:action.placementRevision};}} validateReceipt={(receipt,command)=>{parsePortfolioOrganizationReceipt(receipt,'placement.create',Number(command.body.expectedRevision));}} onLockedChange={onLocked} onSaved={saved} onCancel={close}/> : <CommandForm key={`${actionPath}:${action.revisionId}`} title={t.requestFeedback} path={actionPath} draftKey={`/v1/portfolio/organization/feedback-request/${action.itemId}/${action.revisionId}`} fields={[{name:'message',label:t.feedbackRequestMessage,type:'textarea',required:true,maxLength:2000},{name:'confirmRequest',label:t.confirmFeedbackRequest,type:'checkbox',required:true}]} body={values=>{if(!actionCurrent||selected!.approvalState!=='AWAITING_REVIEW'||requests.loading||requests.error||requests.data.some(request=>request.itemId===action.itemId&&request.revisionId===action.revisionId))throw new LearningApiError('conflict');return{revisionId:action.revisionId,expectedRevision:action.revision,message:String(values.get('message')),confirmRequest:values.get('confirmRequest')==='on'};}} validateReceipt={(receipt)=>{parsePortfolioOrganizationReceipt(receipt,'feedback.request');}} onLockedChange={onLocked} onSaved={saved} onCancel={close}/> : null}
      </section> : null}
      {!student || !reading ? <section className="portfolio-feedback-requests"><h3><CuevoIcon name="feedback" size={24} variant="filled" />{t.feedbackRequests}</h3>{requests.loading ? <p role="status">{t.loading}</p> : requests.error ? <LearningError error={requests.error} /> : requests.loaded && !requests.data.length ? <p>{t.noRequests}</p> : requests.data.map(request => <article key={request.id} data-portfolio-request-id={request.id}><h4><bdi>{request.title}</bdi> · <bdi>{request.learnerName}</bdi></h4><p className="portfolio-request-message" dir="auto">{request.message}</p><p className="portfolio-help">{t.pendingFeedback} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.requestedAt))}</bdi></p>{!student ? <Button type="button" variant="secondary" disabled={selectionLocked} aria-expanded={requestId === request.id} onClick={event => {if(selectionLocked)return;opener.current=event.currentTarget;app.formDrafts.saveModel(selectionSlot,{kind:'review',requestId:request.id,itemId:request.itemId,revisionId:request.revisionId});setRequestIntent({id:request.id,itemId:request.itemId,revisionId:request.revisionId});setRequestId(request.id);}}><CuevoIcon name="learning" size={18} />{t.openRequestedWork}</Button> : null}</article>)}<LoadMore query={{...requests,loadingMore:requests.loadingMore||selectionLocked,loadMore:()=>{if(!selectionLocked)requests.loadMore();}}} /></section> : null}
      {!student && selectedRequest ? <RequestedReview key={selectedRequest.id} request={selectedRequest} sourceRefresh={refresh} locked={selectionLocked} onLockedChange={onLocked} onSaved={() => { setRequestId(null); setRequestIntent(null); saved(); }} onCancel={close} /> : null}
    </div>
    {orphaned ? <CommandForm title={t.previousPortfolioAction} path={orphaned.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.originalRequestRecovery} validateReceipt={(receipt,command)=>{
      if(command.path.endsWith('/review')) {
        // Cleared navigation intent cannot establish the former request ID.
        // Validate the original item/revision and receipt syntax only; the
        // replay stays server-authorized and no source content is restored.
        const revisionId=receipt&&typeof receipt==='object'&&'revisionId' in receipt?String(receipt.revisionId):'';
        parsePortfolioCommandReceipt(receipt,'review',{id:command.path.split('/')[4],revisionId,revision:Number(command.body.expectedRevision)});
      } else parsePortfolioOrganizationReceipt(receipt,command.path==='/v1/portfolio/collections'?'collection.create':command.path.endsWith('/placement')?'placement.create':'feedback.request',Number(command.body.expectedRevision));
    }} onSaved={saved} /> : null}
  </section>;
}
