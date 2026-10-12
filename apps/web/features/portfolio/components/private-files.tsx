'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningApiError } from '../../../shared/api/client';
import { deliverVerifiedDownload, fetchVerifiedDownload } from '../../../shared/api/verified-download';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { currentPortfolioRead, parsePrivateAsset, parsePrivateAssetReceipt, portfolioReadScope, type PrivateAsset, type PortfolioRead } from '../model';
import { portfolioAr, portfolioEn, portfolioTrailAr, portfolioTrailEn } from '../messages';
import { CommandForm } from '../../../shared/components/command-form';
export function PrivateFiles() {
  const app=useApp();const { membership, locale, apiUrl, accessToken, online } = app; const { request, journal } = useApi(); const t = locale === 'ar' ? portfolioAr : portfolioEn;const trail=locale==='ar'?portfolioTrailAr:portfolioTrailEn;
  const [refresh, setRefresh] = useState(0);const scope=portfolioReadScope(app,'/v1/assets',0);const listScope=portfolioReadScope(app,'/v1/assets?limit=100',refresh);
  const [chosenFile,setChosenFile]=useState<PortfolioRead<File>|null>(null);const file=currentPortfolioRead(chosenFile,scope);
  const [pendingScope,setPendingScope]=useState<string|null>(null);const pending=!!scope&&pendingScope===scope;
  const [failure,setFailure]=useState<PortfolioRead<LearningApiError>|null>(null);const error=currentPortfolioRead(failure,scope);
  const [retirement,setRetirement]=useState<PortfolioRead<string>|null>(null);const retiring=currentPortfolioRead(retirement,scope);
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const downloadController = useRef<AbortController | null>(null);
  const downloadCurrent=useRef<(()=>boolean)|null>(null);
  useEffect(() => () => { downloadController.current?.abort(); }, [scope,app.readLifecycle]);
  const parse=useCallback((value:unknown)=>{const asset=parsePrivateAsset(value);if(asset.ownerId!==membership?.userId)throw new LearningApiError('invalid');return {id:asset.id,scope:listScope,value:asset};},[listScope,membership?.userId]);
  const assets = usePaginatedLearningQuery(membership?.role === 'student'&&listScope ? '/v1/assets?limit=100' : null, parse, refresh);
  const currentAssets=assets.data.flatMap(response=>{const asset=currentPortfolioRead(response,listScope);return asset?[asset]:[];});
  const downloadSource=useRef({listScope,ready:false,rows:currentAssets,lifecycle:app.readLifecycle});
  downloadSource.current={listScope,ready:assets.loaded&&!assets.loading&&!assets.loadingMore&&!assets.error&&!assets.moreError,rows:currentAssets,lifecycle:app.readLifecycle};
  useEffect(()=>{if(downloadCurrent.current&&!downloadCurrent.current())downloadController.current?.abort();});
  if (membership?.role !== 'student') return null;
  async function upload() {
    if ((!file && !journal.get('/v1/assets')) || pending || !membership||!scope) return; setPendingScope(scope); setFailure(null);
    const expectedScope = scope; const commandKeys = new Map<string, string>();
    const ownsScope = () => mounted.current && currentScope.current === expectedScope;
    const ownsCommands = () => ownsScope() && [...commandKeys].every(([path, key]) => journal.get(path)?.key === key);
    try {
      let stage = journal.get('/v1/assets'); let content = journal.get('/v1/assets/content');
      if (!stage && file) { const bytes = new Uint8Array(await file.arrayBuffer()); if (!ownsScope()) return; if (!bytes.length || bytes.length > 524288 || !['text/plain', 'image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) throw new LearningApiError('invalid'); const hash = await crypto.subtle.digest('SHA-256', bytes); if (!ownsScope()) return; const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); stage = journal.prepare('/v1/assets', '/v1/assets', { ownerId: membership.userId, name: file.name, contentType: file.type, byteSize: bytes.length, sha256 }); content = journal.prepare('/v1/assets/content', '/v1/assets/content', { contentBase64: btoa(binary) }); }
      if (!stage || !content) throw new LearningApiError('invalid'); commandKeys.set('/v1/assets', stage.key); commandKeys.set('/v1/assets/content', content.key); const response = await request('/v1/assets', { command: stage }); if (!ownsCommands()) return; const receipt=parsePrivateAssetReceipt(response,stage.body,'stage');if(receipt.ownerId!==membership.userId)throw new LearningApiError('invalid',true);
      const path = `/v1/assets/${receipt.id}/finalize`; const finalize = journal.prepare(path, path, content.body); commandKeys.set(path, finalize.key); const confirmed = await request(path, { command: finalize }); if (!ownsCommands()) return;parsePrivateAssetReceipt(confirmed,stage.body,'finalize',receipt.id);
      journal.confirm('/v1/assets', stage.key); journal.confirm('/v1/assets/content', content.key); journal.confirm(path, finalize.key); setChosenFile(null); setRefresh(value => value + 1);
    } catch (failure) { if (!ownsCommands()) return; const safe = failure instanceof LearningApiError ? failure : new LearningApiError('invalid', true); if (!safe.uncertain) for (const [path, key] of commandKeys) journal.confirm(path, key); setFailure({scope,value:safe}); } finally { if (ownsScope()) setPendingScope(null); }
  }
  async function download(asset: PrivateAsset) {
    if (!accessToken || !membership || !online||!scope||!downloadSource.current.ready||asset.ownerId!==membership.userId||asset.state!=='AVAILABLE') return; setFailure(null);
    const expectedScope = scope; const controller = new AbortController(); downloadController.current?.abort(); downloadController.current = controller;
    const expectedListScope=listScope,readLifecycle=app.readLifecycle,frame=readLifecycle?.capture();
    const isCurrent=()=>{const source=downloadSource.current,row=source.rows.find(value=>value.id===asset.id);return mounted.current&&!controller.signal.aborted&&downloadController.current===controller&&currentScope.current===expectedScope&&source.listScope===expectedListScope&&source.ready&&source.lifecycle===readLifecycle&&(!frame||!!readLifecycle?.isCurrent(frame))&&!!row&&row.ownerId===asset.ownerId&&row.state==='AVAILABLE'&&row.name===asset.name&&row.contentType===asset.contentType&&row.byteSize===asset.byteSize&&row.sha256===asset.sha256;};
    downloadCurrent.current=isCurrent;
    try { const verified=await fetchVerifiedDownload({config:{apiUrl,accessToken,schoolId:membership.schoolId},path:`/v1/assets/${asset.id}/download`,metadata:asset,signal:controller.signal,isCurrent,readLifecycle});deliverVerifiedDownload(verified); } catch (failure) { if (isCurrent()) setFailure({scope,value:failure instanceof LearningApiError ? failure : new LearningApiError('unavailable')}); }
  }
  return <section className="portfolio-item"><h2><CuevoIcon name="portfolio" variant="filled" size={24} />{t.files}</h2><p>{trail.privateFilesPurpose}</p><p className="learning-form__note">{t.filesNote}</p><div className="field"><label htmlFor="portfolio-file">{t.chooseFile}</label><input key={scope} id="portfolio-file" type="file" accept=".txt,.png,.jpg,.jpeg,.pdf" disabled={!scope||pending || !!journal.get('/v1/assets')} onChange={event => {const value=event.target.files?.[0];setChosenFile(value?{scope,value}:null);}} /></div><Button type="button" disabled={!scope||pending || !file && !journal.get('/v1/assets')} onClick={() => void upload()}>{pending ? t.loading : journal.get('/v1/assets') ? t.retryUpload : t.upload}</Button>{error ? <LearningError error={error} /> : null}{assets.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:assets.error ? <LearningError error={assets.error} /> : currentAssets.map(asset => <article key={asset.id}><h3>{asset.name}</h3><Status>{asset.state === 'AVAILABLE' ? t.availableFile : asset.state === 'STAGED' ? t.stagedFile : t.retiredFile}</Status>{asset.state === 'AVAILABLE' ? <Button type="button" variant="quiet" onClick={() => void download(asset)}>{t.download}</Button> : null}{asset.state !== 'RETIRED' ? <Button type="button" variant="quiet" onClick={() => setRetirement({scope,value:asset.id})}>{t.retireFile}</Button> : null}{retiring === asset.id ? <CommandForm key={`${scope}:${asset.id}`} title={t.retireFile} path={`/v1/assets/${asset.id}/retire`} fields={[{ name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmRetirement', label: t.confirmRetirement, type: 'checkbox', required: true }]} body={values => ({ reason: String(values.get('reason')), confirmRetirement: values.get('confirmRetirement') === 'on' })} onSaved={() => { setRetirement(null); setRefresh(value => value + 1); }} onCancel={() => setRetirement(null)} /> : null}</article>)}{assets.loaded&&!assets.loading&&!assets.error&&!currentAssets.length?<WorkspaceState kind={assets.nextCursor||assets.moreError||assets.loadingMore?"unknown":"empty"} icon="portfolio" description={assets.nextCursor||assets.moreError||assets.loadingMore?trail.filesPartial:trail.filesEmpty}/>:null}<LoadMore query={assets} /></section>;
}
