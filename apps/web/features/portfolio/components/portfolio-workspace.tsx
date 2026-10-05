'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status, WorkspacePageHeading } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { EvidenceDetail, NativeResultView } from '../../academic/ui';
import { parsePortfolioItem, parsePortfolioItemForLearner, parsePortfolioReleasedResultForLearner, parsePortfolioHistoryForItem, parsePortfolioCommandReceipt, portfolioEvidenceChoices, portfolioIdentityLabel, portfolioWorkChoices, portfolioReadScope, parsePortfolioReadingSelection, currentPortfolioReading, portfolioNavigationLocked, portfolioPendingReadingContexts, parsePortfolioOrganizationSelection, type PortfolioReadingSelection } from '../model';
import { portfolioAr, portfolioEn, portfolioTrailAr, portfolioTrailEn } from '../messages';
import { PrivateFiles } from './private-files';
import { PortfolioSourceWork } from './source-work';
import { PortfolioDocumentSelection } from './document-selection';
import { PortfolioOrganization } from './organization';
import { ParentPortfolioReading } from './parent-reading';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import { trailAssets } from '../../../shared/characters/assets';

export function PortfolioWorkspace() {
  const app = useApp();
  const actor=`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`;
  const pendingSources=portfolioPendingReadingContexts(app.commandJournal,actor);
  const trail = app.locale === 'ar' ? portfolioTrailAr : portfolioTrailEn;
  if (!app.online) return <><WorkspacePageHeading title={app.locale==='ar'?portfolioAr.portfolio:portfolioEn.portfolio}/><p className="notice" role="status">{trail.offline}</p></>;
  if (app.status !== 'ready') return <WorkspacePageHeading title={app.locale==='ar'?portfolioAr.portfolio:portfolioEn.portfolio}/>;
  return <CurrentPortfolioWorkspace key={actor} pendingSources={pendingSources} />;
}

function CurrentPortfolioWorkspace({pendingSources}:{pendingSources:Map<string,PortfolioReadingSelection>}) {
  const app=useApp();const { locale, membership, formDrafts, commandJournal, accessGeneration } = app;
  const t = locale === 'ar' ? portfolioAr : portfolioEn;
  const trail = locale === 'ar' ? portfolioTrailAr : portfolioTrailEn;
  const student = membership?.role === 'student';
  const parent = membership?.role === 'parent';
  const coordinator = membership?.role === 'coordinator';
  const reviewer = membership?.role === 'teacher' || membership?.role === 'admin';
  const [refresh, setRefresh] = useState(0);
  const prefix = `${membership?.schoolId}:${membership?.userId}:/v1/portfolio/items`;
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const navigationLocked=portfolioNavigationLocked(commandJournal.pending());
  const readingSlot=`${prefix}:reading`;
  const [reading,setReading]=useState<PortfolioReadingSelection|null>(()=>parsePortfolioReadingSelection(formDrafts.model(readingSlot)));
  const readingOpener=useRef<HTMLElement|null>(null),readingBrowseId=useRef<string|null>(null),returnToDirectory=useRef(false);
  const retained = formDrafts.first(prefix + '/');
  const retainedParts = retained?.slice(prefix.length + 1).split('/');
  const retainedType = retainedParts?.[1] === 'reflection' ? 'edit' : retainedParts?.[1] === 'review' ? 'review' : 'revoke';
  const [action, setAction] = useState<{ id: string; type: 'edit' | 'review' | 'revoke' } | null>(retainedParts ? { id: retainedParts[0], type: retainedType } : null);
  const [workRevision, setWorkRevision] = useState<string | null>(null);
  const [creating, setCreating] = useState(!!formDrafts.get(prefix));
  const sourceSelectionSlot = `${prefix}:released-source`;
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(() => {
    const retainedSource = commandJournal.get('/v1/portfolio/items')?.body.evidenceId ?? formDrafts.get(prefix)?.values.evidenceId ?? formDrafts.model<string>(sourceSelectionSlot);
    return typeof retainedSource === 'string' ? retainedSource : null;
  });
  const [createLocked, setCreateLocked] = useState(false);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<string | null>(null);
  const focusedDetails = useRef(new Set<string>());
  const focusedControl = useRef<{ context: string; element: HTMLElement; form?: string; name?: string; button?: string } | null>(null);
  const focusToRestore = useRef<typeof focusedControl.current>(null);
  const childContext = useChildContext(refresh);
  const expectedLearnerId = student ? membership?.userId ?? null : parent ? childContext.child?.id ?? null : null;
  const itemPath=parent?childContext.child?'/v1/portfolio/items?limit=100&learnerId='+childContext.child.id:null:'/v1/portfolio/items?limit=100';
  const parentScope=parent?portfolioReadScope(app,itemPath,refresh):null;
  const parseItems = useCallback((value:unknown) => {const item=student || parent ? parsePortfolioItemForLearner(value, expectedLearnerId, parent) : parsePortfolioItem(value);return parent?{...item,parentSourceScope:parentScope}:item;}, [student, parent, expectedLearnerId,parentScope]);
  const parseResults = useCallback((value:unknown) => parsePortfolioReleasedResultForLearner(value, membership?.userId ?? null), [membership?.userId]);
  const items = usePaginatedLearningQuery(parent&&!parentScope?null:itemPath, parseItems, refresh);
  const itemsCurrent=items.loaded&&!items.loading&&!items.error&&!items.moreError;
  const selectedItem=currentPortfolioReading(items.data,reading,itemsCurrent);
  const captureSource=useRef<PortfolioReadingSelection|null>(null);
  captureSource.current=selectedItem?{itemId:selectedItem.id,revisionId:selectedItem.revisionId,revision:selectedItem.revision}:null;
  useEffect(()=>commandJournal.subscribe(()=>{const source=captureSource.current;if(!source)return;for(const command of commandJournal.pending()){if(command.path.startsWith(`/v1/portfolio/items/${source.itemId}/`)&&/\/(reflection|review|parent-revoke)$/.test(command.path)&&(command.path.endsWith('/parent-revoke')||command.body.expectedRevision===source.revision)&&!pendingSources.has(command.key))pendingSources.set(command.key,{...source});}}),[commandJournal,pendingSources]);
  const results = usePaginatedLearningQuery(student ? '/v1/results?limit=100' : null, parseResults, refresh);
  const historyAnchor = selectedItem?.id===historyId?selectedItem:null;
  const parseHistory = useCallback((value:unknown) => { if (!historyAnchor) throw new LearningApiError('invalid'); return parsePortfolioHistoryForItem(value, historyAnchor); }, [historyAnchor]);
  const history = usePaginatedLearningQuery(!parent && historyId && historyAnchor ? `/v1/portfolio/items/${historyId}/history?limit=100` : null, parseHistory, refresh);
  const sourceChoices = portfolioEvidenceChoices(results.data, locale);
  const availableChoices = sourceChoices.filter(choice => !choice.ambiguous && !choice.unavailable);
  const selectedSource = results.data.find(result => result.evidenceId === selectedSourceId && availableChoices.some(choice => choice.value === result.evidenceId));
  const workChoices = portfolioWorkChoices(items.data, locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const number = new Intl.NumberFormat(locale);
  const currentSourcesUnavailable = creating && (results.loading || !!results.error);
  const selectionContext = `${reading?.itemId}:${reading?.revisionId}:${creating}:${action?.id}:${action?.type}:${workRevision}:${historyId}`;
  let organizationReviewPath:string|undefined;
  try{const intent=parsePortfolioOrganizationSelection(formDrafts.model(`${membership?.schoolId}:${membership?.userId}:/v1/portfolio/organization:selection`));if(intent.kind==='review')organizationReviewPath=`/v1/portfolio/items/${intent.itemId}/review`;}catch{/* An absent organization intent grants no selected-source authority. */}
  const originalItemCommand=commandJournal.pending().find(command=>command.path!==organizationReviewPath&&/^\/v1\/portfolio\/items\/[^/]+\/(reflection|review|parent-revoke)$/.test(command.path));
  const originalItemId=originalItemCommand?.path.match(/^\/v1\/portfolio\/items\/([^/]+)\//)?.[1];
  const originalAction=originalItemCommand?.path.endsWith('/reflection')?'edit':originalItemCommand?.path.endsWith('/review')?'review':originalItemCommand?'revoke':null;
  const originalReading=originalItemCommand?pendingSources.get(originalItemCommand.key):null;
  const originalSourceCurrent=!originalItemCommand||!!selectedItem&&selectedItem.id===originalItemId&&(originalAction==='revoke'||originalItemCommand.body.expectedRevision===selectedItem.revision)&&(originalAction!=='review'||selectedItem.identity.status==='READY'&&!workChoices.find(choice=>choice.value===selectedItem.id)?.ambiguous);
  const setItemAction=(id:string,type:'edit'|'review'|'revoke')=>{if(portfolioNavigationLocked(commandJournal.pending()))return;focusItem(id);setAction({id,type});};

  useEffect(() => {
    const focused = focusedControl.current;
    if (focused?.context === selectionContext && !focused.element.isConnected && (document.activeElement === document.body || document.activeElement === document.documentElement)) focusToRestore.current = focused;
  }, [refresh, items.loading, results.loading, selectionContext]);
  useEffect(() => {
    const restore = focusToRestore.current;
    if (!restore || items.loading || results.loading || items.error || results.error) return;
    if (restore.context !== selectionContext || focusTarget.current || document.activeElement !== document.body && document.activeElement !== document.documentElement) { focusToRestore.current = null; return; }
    const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('input, textarea, select, button') ?? []);
    const target = controls.find(element => (!restore.form || element.closest('section[aria-label]')?.getAttribute('aria-label') === restore.form) && (restore.name ? element.getAttribute('name') === restore.name : restore.button ? element.tagName === 'BUTTON' && (element.getAttribute('aria-label') || element.textContent?.trim()) === restore.button : false));
    if (target && !target.matches(':disabled')) { target.focus(); focusToRestore.current = null; }
  }, [items.loading, results.loading, items.error, results.error, selectionContext]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new MutationObserver(() => {
      const restore = focusToRestore.current;
      if (!restore || restore.context !== selectionContext || document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
      const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('input, textarea, select, button') ?? []);
      const target = controls.find(element => (!restore.form || element.closest('section[aria-label]')?.getAttribute('aria-label') === restore.form) && (restore.name ? element.getAttribute('name') === restore.name : restore.button ? element.tagName === 'BUTTON' && (element.getAttribute('aria-label') || element.textContent?.trim()) === restore.button : false));
      if (target && !target.matches(':disabled')) { target.focus(); focusToRestore.current = null; }
    });
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selectionContext]);

  useEffect(() => {
    if (!focusTarget.current || items.loading || results.loading) return;
    const target = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-portfolio-focus]') ?? []).find(element => element.dataset.portfolioFocus === focusTarget.current);
    if (target) { target.focus(); focusTarget.current = null; }
  }, [reading, action, workRevision, creating, historyId, items.loading, results.loading]);

  useEffect(()=>{if(!returnToDirectory.current||reading)return;const frame=requestAnimationFrame(()=>{returnToDirectory.current=false;const opener=readingOpener.current;const target=opener?.isConnected&&!opener.matches(':disabled')?opener:root.current?.querySelector<HTMLElement>(`[data-portfolio-choice="${readingBrowseId.current}"] button`)??root.current?.querySelector<HTMLElement>('.portfolio-reading-directory h2')??root.current?.querySelector<HTMLElement>('h1');target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',behavior:'instant'});});return()=>cancelAnimationFrame(frame);},[reading]);
  function saved() { setAction(null); setWorkRevision(null); setCreating(false); setReading(null);formDrafts.remove(readingSlot);formDrafts.remove(sourceSelectionSlot); setRefresh(value => value + 1); }
  function chooseItem(item:typeof items.data[number]){if(portfolioNavigationLocked(commandJournal.pending()))return;const selection=parsePortfolioReadingSelection({itemId:item.id,revisionId:item.revisionId,revision:item.revision});if(!selection)return;const focused=document.activeElement;readingOpener.current=focused instanceof HTMLElement&&focused.matches('button,a,input,select,textarea,[tabindex]')?focused:null;readingBrowseId.current=item.id;setReading(selection);formDrafts.saveModel(readingSlot,selection);setCreating(false);const retainedAction=['reflection','review','parent-revoke'].find(path=>{const draft=formDrafts.get(`${prefix}/${item.id}/${path}`);return draft&&(path==='parent-revoke'||draft.basis.expectedRevision===item.revision)});setAction(retainedAction?{id:item.id,type:retainedAction==='reflection'?'edit':retainedAction==='review'?'review':'revoke'}:null);setEvidenceId(null);setHistoryId(null);setWorkRevision(null);focusItem(item.id);}
  function closeReading(){if(portfolioNavigationLocked(commandJournal.pending()))return;returnToDirectory.current=true;setReading(null);formDrafts.remove(readingSlot);setAction(null);setEvidenceId(null);setHistoryId(null);setWorkRevision(null);}
  function focusItem(id: string) { focusTarget.current = id; }

  return <div ref={root} onFocusCapture={event => {
    const element = event.target as HTMLElement;
    focusedControl.current = element.matches('input, textarea, select, button') ? { context: selectionContext, element, form: element.closest('section[aria-label]')?.getAttribute('aria-label') ?? undefined, name: element.getAttribute('name') ?? undefined, button: element.tagName === 'BUTTON' ? element.getAttribute('aria-label') || element.textContent?.trim() : undefined } : null;
  }} className={`portfolio-workspace portfolio-workspace--${student ? 'student' : parent ? 'parent' : 'staff'}`}>
    <ChildSelector context={childContext} />
    <header className="portfolio-journey-heading">
      <img src={creating ? trailAssets.owl : trailAssets.portfolio} width={88} height={88} alt="" aria-hidden="true" />
      <WorkspacePageHeading title={creating ? trail.reflectionTitle : student ? trail.journeyTitle : parent ? trail.parentTitle : trail.reviewTitle} caption={parent ? childContext.child?.displayName : undefined} description={creating ? trail.reflectionSubtitle : student ? trail.journeyBody : parent ? trail.parentBody : coordinator ? trail.coordinatorBody : trail.reviewBody}/>
      {student ? <Button type="button" disabled={navigationLocked||results.loading || !!results.error || !availableChoices.length} onClick={() => {if(portfolioNavigationLocked(commandJournal.pending()))return;setReading(null);formDrafts.remove(readingSlot);setAction(null); focusTarget.current = 'create'; setCreating(true); }}><CuevoIcon name="reflection" size={20} />{t.selectWork}</Button> : null}
    </header>
    <div className="portfolio-toolbar"><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}><CuevoIcon name="refresh" size={18} />{t.refresh}</Button>{parent ? <p className="portfolio-privacy-note"><CuevoIcon name="shield" size={18} />{t.parentNote}</p> : null}</div>
    {results.error ? <LearningError error={results.error} /> : null}
    {student && sourceChoices.some(choice => choice.ambiguous) ? <p className="notice">{trail.sourceChoicesReview}</p> : null}{student && sourceChoices.some(choice => choice.unavailable) ? <p className="notice">{t.identityUnknown}</p> : null}
    {currentSourcesUnavailable ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : creating ? <section className="portfolio-create" tabIndex={-1} data-portfolio-focus="create" aria-label={t.selectWork}>
      <section className="portfolio-create-picker"><h2><CuevoIcon name="portfolio" size={26} variant="filled" />{trail.chooseYourWork}</h2><p>{trail.chooseWorkHelp}</p><div className="field"><label htmlFor="portfolio-released-source">{t.evidence}</label><select id="portfolio-released-source" value={selectedSourceId ?? ''} disabled={createLocked||navigationLocked} onChange={event => { const value = event.currentTarget.value; setSelectedSourceId(value); formDrafts.saveModel(sourceSelectionSlot, value); }}><option value="">{trail.chooseYourWork}</option>{availableChoices.map(choice => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></div>{selectedSource ? <div className="portfolio-task-card"><Status tone="positive">{trail.resultRecordedOn}: {date.format(new Date(selectedSource.createdAt))}</Status><h3><bdi>{selectedSource.assessmentTitle}</bdi></h3><p><bdi>{selectedSource.referenceTitle ?? t.unknownSource}</bdi></p><p>{trail.resultRevision}: {number.format(selectedSource.revision)}</p></div> : null}{results.nextCursor ? <LoadMore query={results} /> : null}</section>
      <section className="portfolio-create-preview"><h2><CuevoIcon name="assessment" size={26} variant="filled" />{trail.workPreview}</h2>{selectedSource ? <><div className="portfolio-source-preview"><h3><bdi>{selectedSource.assessmentTitle}</bdi></h3><p><bdi>{selectedSource.referenceTitle ?? t.unknownSource}</bdi></p><NativeResultView result={selectedSource.nativeResult} /><details className="portfolio-preview-provenance" key={`${selectedSource.evidenceId}:${accessGeneration}`}><summary><CuevoIcon name="shield" size={18} />{t.source}</summary><EvidenceDetail evidenceId={selectedSource.evidenceId} /></details></div></> : <p className="notice">{trail.sourcePreviewPrompt}</p>}</section>
      <div className="portfolio-create-reflection"><h2><CuevoIcon name="practice" size={26} variant="filled" />{trail.reflectionHeading}</h2><p className="notice">{trail.reflectionStartNote}</p><h3>{trail.reflectionPrompt}</h3><p>{trail.reflectionHelp}</p><CommandForm title={t.selectWork} asRegion={false} path="/v1/portfolio/items" fields={[{ name: 'title', label: t.title, required: true }, { name: 'reflection', label: t.reflection, type: 'textarea', required: true, maxLength: 10000 }]} body={values => {
        const source = results.data.find(result => result.evidenceId === selectedSourceId && availableChoices.some(choice => choice.value === result.evidenceId));
        if (!source) throw new LearningApiError('invalid');
        return { evidenceId: source.evidenceId, sourceModel: source.model, title: String(values.get('title')), reflection: String(values.get('reflection')) };
      }} onLockedChange={setCreateLocked} validateReceipt={receipt => { parsePortfolioCommandReceipt(receipt, 'create'); }} onSaved={saved} onCancel={() => { setCreating(false); formDrafts.remove(sourceSelectionSlot); }} /></div>
    </section> : null}
    {!parent ? <div className="portfolio-reading-layout" data-selected={!!reading}><section className="portfolio-reading-directory"><h2 tabIndex={-1}>{t.readingDirectory}</h2>{items.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:items.error||items.moreError?<LearningError error={items.error??items.moreError!}/>:items.data.length?<ul>{items.data.map(item=>{const choice=workChoices.find(value=>value.value===item.id);return<li key={item.id} data-portfolio-choice={item.id}><Button type="button" variant="quiet" aria-current={selectedItem?.id===item.id?'true':undefined} disabled={navigationLocked||!!choice?.ambiguous} onClick={()=>chooseItem(item)}><strong><bdi>{item.title}</bdi></strong><span><bdi>{portfolioIdentityLabel(item.identity,locale)}</bdi></span><span>{t.revision}: {number.format(item.revision)} · {item.approvalState==='REVIEWED'?t.reviewed:t.awaiting}</span></Button>{choice?.ambiguous?<p className="notice">{t.ambiguousWork}</p>:null}</li>;})}</ul>:null}{itemsCurrent?<LoadMore query={items}/>:null}</section><div className="portfolio-reading-detail">
      {reading&&!selectedItem?<section className="portfolio-reading-recovery" aria-label={t.readingUnavailable}><Button type="button" variant="quiet" disabled={navigationLocked} onClick={closeReading}>{t.backToWork}</Button><h2 tabIndex={-1}>{t.readingUnavailable}</h2><p className="notice">{items.loading?t.loading:t.readingSourceChanged}</p><Button type="button" variant="secondary" onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button>{items.moreError?<LearningError error={items.moreError}/>:null}{items.nextCursor&&!items.loading?<LoadMore query={items}/>:null}</section>:null}
      {originalItemCommand&&!originalSourceCurrent?<CommandForm title={t.previousItemAction} path={originalItemCommand.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.originalRequestRecovery} validateReceipt={(receipt,command)=>{if(!originalReading)throw new LearningApiError('invalid',true);const kind=command.path.endsWith('/reflection')?'reflection':command.path.endsWith('/review')?'review':'revoke';parsePortfolioCommandReceipt(receipt,kind,{id:originalReading.itemId,revisionId:originalReading.revisionId,revision:kind==='revoke'?originalReading.revision:Number(command.body.expectedRevision)});}} onSaved={saved}/>:null}
    {itemsCurrent&&originalSourceCurrent ? <div className="portfolio-work-list">{selectedItem?[selectedItem].map(item => {
      const canReadWork = membership?.role !== 'coordinator' && item.submissionKind === 'TEXT' && (!parent || item.sourceWorkApproved === true);
      const canReview = reviewer && item.identity.status === 'READY' && !workChoices.find(choice => choice.value === item.id)?.ambiguous;
      const activeAction = originalSourceCurrent&&originalItemId===item.id?originalAction:action?.id === item.id ? action.type : null;
      return <article className="portfolio-item" key={`${item.id}:${item.revisionId}`} data-portfolio-id={item.id}>
        <Button type="button" variant="quiet" disabled={navigationLocked} onClick={closeReading}>{t.backToWork}</Button><header className="portfolio-item-heading"><CuevoIcon name="portfolio" size={28} variant="filled" /><div><h2 tabIndex={-1} data-portfolio-focus={item.id}><bdi>{item.title}</bdi></h2><p><bdi>{portfolioIdentityLabel(item.identity,locale)}</bdi></p></div><Status tone={item.approvalState === 'REVIEWED' ? 'positive' : 'warning'}>{item.approvalState === 'REVIEWED' ? t.reviewed : t.awaiting}</Status></header>
        {item.identity.status !== 'READY' ? <p className="notice">{t.identityUnknown}</p> : null}
        {reviewer && !canReview && item.identity.status === 'READY' ? <p className="notice">{t.ambiguousWork}</p> : null}
        <div className="portfolio-item-layout">
          <section className="portfolio-work-context"><h3><CuevoIcon name="assessment" size={25} variant="filled" />{trail.selectedHeading}</h3><div className="portfolio-task-card"><p className="eyebrow">{item.identity.courseTitle ?? t.unknownSource}</p><h4><bdi>{item.identity.assessmentTitle ?? item.assessmentTitle}</bdi></h4>{item.identity.submittedAt ? <p>{t.submittedOn}: <bdi>{date.format(new Date(item.identity.submittedAt))}</bdi> · {t.submissionRevision}: {number.format(item.identity.submissionRevision!)}</p> : null}{canReadWork ? <Button type="button" variant="secondary" disabled={navigationLocked} aria-expanded={workRevision === item.revisionId} onClick={() => { focusItem(item.id); setWorkRevision(workRevision === item.revisionId ? null : item.revisionId); }}><CuevoIcon name="learning" size={18} />{t.sourceWork}</Button> : null}</div><h4>{trail.taskContext}</h4><dl className="portfolio-context-list"><div><dt>{trail.schoolContext}</dt><dd><bdi>{membership?.school.name}</bdi></dd></div><div><dt>{trail.learningContext}</dt><dd><bdi>{item.referenceTitle}</bdi></dd></div></dl><NativeResultView result={item.nativeResult} /><Button type="button" variant="quiet" onClick={() => { focusItem(item.id); setEvidenceId(evidenceId === item.evidenceId ? null : item.evidenceId); }} aria-expanded={evidenceId === item.evidenceId}><CuevoIcon name="shield" size={18} />{t.source}</Button></section>
          <section className="portfolio-reflection"><h3><CuevoIcon name="reflection" size={25} />{parent ? trail.approvedReflection : student ? trail.reflectionHeading : t.reflection}</h3><p className="portfolio-revision-label">{t.revision}: {number.format(item.revision)}</p><div className="portfolio-reflection-text"><p dir="auto">{item.reflection}</p></div>{student ? <><p className="portfolio-help">{trail.reflectionHelp}</p><Button type="button" variant="secondary" disabled={navigationLocked} onClick={() => { setItemAction(item.id,'edit'); }}><CuevoIcon name="practice" size={18} />{t.edit}</Button></> : null}{!parent ? <Button type="button" variant="quiet" disabled={navigationLocked} aria-expanded={historyId === item.id} onClick={() => { focusItem(item.id); setHistoryId(historyId === item.id ? null : item.id); }}>{t.history}</Button> : null}</section>
          <section className="portfolio-feedback"><h3><CuevoIcon name="feedback" size={25} variant="filled" />{trail.feedbackHeading}</h3>{item.feedback ? <><blockquote><p dir="auto">{item.feedback}</p></blockquote>{item.reviewedAt ? <p className="portfolio-help">{trail.reviewedOn}: <bdi>{date.format(new Date(item.reviewedAt))}</bdi></p> : null}</> : <p className="portfolio-help">{student ? trail.feedbackWaiting : trail.noFeedback}</p>}{parent && item.submissionKind === 'TEXT' && !item.sourceWorkApproved ? <p className="notice">{t.workNeedsReview}</p> : null}{(student || reviewer) && item.approvalState === 'REVIEWED' && !item.parentVisible ? <p className="notice">{student ? t.learnerSharingOff : t.sharingOff}</p> : null}{!parent ? <p className="portfolio-privacy-note"><CuevoIcon name="lock" size={18} />{item.parentVisible ? trail.sharedRevision : trail.privateRevision}</p> : null}{reviewer ? <div className="portfolio-review-actions">{canReview && item.approvalState === 'AWAITING_REVIEW' ? <Button type="button" variant="secondary" disabled={navigationLocked} onClick={() => { setItemAction(item.id,'review'); }}><CuevoIcon name="check" size={18} />{t.review}</Button> : null}<Button type="button" variant="quiet" disabled={navigationLocked} onClick={() => { setItemAction(item.id,'revoke'); }}>{t.revoke}</Button></div> : null}</section>
        </div>
        {evidenceId === item.evidenceId ? <div className="portfolio-detail"><EvidenceDetail key={`${item.evidenceId}:${accessGeneration}`} evidenceId={item.evidenceId} /></div> : null}
        {canReadWork && (workRevision === item.revisionId || activeAction === 'review' && canReview) ? <PortfolioSourceWork key={item.revisionId} item={item} reviewing={activeAction === 'review' && canReview} focusOnLoad={activeAction === 'review' || !focusedDetails.current.has(item.revisionId)} onLoaded={() => focusedDetails.current.add(item.revisionId)} onSaved={saved} onCancel={() => setAction(null)} /> : null}
        {activeAction === 'edit' && item.submissionKind === 'TEXT' && student ? <PortfolioDocumentSelection key={item.revisionId} item={item} onSaved={saved} onCancel={() => setAction(null)} /> : null}
        {activeAction && (student && activeAction === 'edit' || reviewer && (activeAction === 'revoke' || canReview)) && !(activeAction === 'review' && item.submissionKind === 'TEXT') && !(activeAction === 'edit' && item.submissionKind === 'TEXT') ? <CommandForm title={activeAction === 'edit' ? t.edit : activeAction === 'review' ? t.review : t.revoke} path={`/v1/portfolio/items/${item.id}/${activeAction === 'edit' ? 'reflection' : activeAction === 'review' ? 'review' : 'parent-revoke'}`} fields={activeAction === 'edit' ? [{ name: 'title', label: t.title, required: true, defaultValue: item.title }, { name: 'reflection', label: t.reflection, type: 'textarea', required: true, defaultValue: item.reflection, maxLength: 10000 }] : activeAction === 'review' ? [{ name: 'feedback', label: t.feedback, type: 'textarea', required: true, defaultValue: item.feedback ?? undefined }, { name: 'featured', label: t.featured, type: 'checkbox', defaultChecked: item.featured }, { name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }, { name: 'confirmParentApproval', label: t.confirmParentApproval, type: 'checkbox' }] : [{ name: 'reason', label: t.reason, type: 'textarea', required: true }]} body={values => activeAction === 'edit' ? { title: String(values.get('title')), reflection: String(values.get('reflection')), expectedRevision: item.revision } : activeAction === 'review' ? { feedback: String(values.get('feedback')), featured: values.get('featured') === 'on', parentVisible: values.get('parentVisible') === 'on', confirmParentApproval: values.get('confirmParentApproval') === 'on', expectedRevision: item.revision } : { reason: String(values.get('reason')) }} validateReceipt={(receipt, command) => { parsePortfolioCommandReceipt(receipt, activeAction === 'edit' ? 'reflection' : activeAction, { ...item, revision: activeAction === 'revoke' ? item.revision : Number(command.body.expectedRevision) }); }} onSaved={saved} onCancel={() => setAction(null)} note={activeAction === 'edit' ? t.editNote : t.reviewNote} /> : null}
        {historyId === item.id && !parent ? <section className="portfolio-history" aria-label={t.history}><h3>{t.history}</h3>{history.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : history.error ? <LearningError error={history.error} /> : history.data.map(row => <article key={row.revisionId}><h4>{t.revision} {number.format(row.revision)}</h4><p dir="auto">{row.reflection}</p></article>)}<LoadMore query={history} /></section> : null}
      </article>;
    }):null}</div>:null}</div></div> : items.loading ? <p role="status" className="portfolio-loading">{t.loading}</p> : items.error ? <LearningError error={items.error} /> : <ParentPortfolioReading key={expectedLearnerId??'unselected'} items={items.moreError?[]:items.data.filter(item=>!!parentScope&&'parentSourceScope'in item&&item.parentSourceScope===parentScope)} childId={expectedLearnerId} current={!!parentScope&&items.loaded&&!items.loading&&!items.error&&!items.moreError}/>}
    {items.loaded && !items.loading && !items.error && !items.moreError && !items.nextCursor && !items.data.length && (!parent || !!childContext.child) ? <WorkspaceState kind="empty" icon="portfolio" title={parent ? trail.parentEmptyTitle : coordinator ? trail.coordinatorEmptyTitle : trail.emptyTitle} description={parent ? trail.parentEmptyBody : student ? trail.emptyBody : t.noItems}>{student && results.loaded && !results.loading && !results.error && !results.moreError && !results.nextCursor && !results.data.length ? <p>{t.noSources}</p> : null}</WorkspaceState> : null}
    {parent&&childContext.child ? <LoadMore query={items} /> : null}
    {student && results.nextCursor ? <div className="notice"><p>{t.evidence}</p><LoadMore query={results} /></div> : null}
    {(student || reviewer) ? <PortfolioOrganization items={!itemsCurrent ? [] : items.data} refresh={refresh} onChanged={saved} reviewPathOwned={originalAction==='review'?originalItemCommand?.path:action?.type==='review'?`/v1/portfolio/items/${action.id}/review`:undefined} /> : null}
    {student ? <div className="portfolio-private-files"><PrivateFiles /></div> : null}
  </div>;
}
