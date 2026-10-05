'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningApiError } from '../../../shared/api/client';
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
  useEffect(() => () => { downloadController.current?.abort(); }, [scope]);
  const parse=useCallback((value:unknown)=>{const asset=parsePrivateAsset(value);if(asset.ownerId!==membership?.userId)throw new LearningApiError('invalid');return {id:asset.id,scope:listScope,value:asset};},[listScope,membership?.userId]);
  const assets = usePaginatedLearningQuery(membership?.role === 'student'&&listScope ? '/v1/assets?limit=100' : null, parse, refresh);
  const currentAssets=assets.data.flatMap(response=>{const asset=currentPortfolioRead(response,listScope);return asset?[asset]:[];});
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
    if (!accessToken || !membership || !online||!scope||asset.ownerId!==membership.userId||asset.state!=='AVAILABLE') return; setFailure(null);
    const expectedScope = scope; const controller = new AbortController(); downloadController.current?.abort(); downloadController.current = controller;
    try { const response = await fetch(`${apiUrl}/v1/assets/${asset.id}/download`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': membership.schoolId }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }); if (!response.ok) throw new LearningApiError(response.status === 403 ? 'denied' : 'unavailable'); const bytes = await response.arrayBuffer(); const hash = await crypto.subtle.digest('SHA-256', bytes); const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''); if (bytes.byteLength !== asset.byteSize || sha256 !== asset.sha256) throw new LearningApiError('invalid'); if (!mounted.current||controller.signal.aborted || currentScope.current !== expectedScope) return; const url = URL.createObjectURL(new Blob([bytes], { type: asset.contentType })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = asset.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (failure) { if (mounted.current&&!controller.signal.aborted && currentScope.current === expectedScope) setFailure({scope,value:failure instanceof LearningApiError ? failure : new LearningApiError('unavailable')}); }
  }
  return <section className="portfolio-item"><h2><CuevoIcon name="portfolio" variant="filled" size={24} />{t.files}</h2><p>{trail.privateFilesPurpose}</p><p className="learning-form__note">{t.filesNote}</p><div className="field"><label htmlFor="portfolio-file">{t.chooseFile}</label><input key={scope} id="portfolio-file" type="file" accept=".txt,.png,.jpg,.jpeg,.pdf" disabled={!scope||pending || !!journal.get('/v1/assets')} onChange={event => {const value=event.target.files?.[0];setChosenFile(value?{scope,value}:null);}} /></div><Button type="button" disabled={!scope||pending || !file && !journal.get('/v1/assets')} onClick={() => void upload()}>{pending ? t.loading : journal.get('/v1/assets') ? t.retryUpload : t.upload}</Button>{error ? <LearningError error={error} /> : null}{assets.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:assets.error ? <LearningError error={assets.error} /> : currentAssets.map(asset => <article key={asset.id}><h3>{asset.name}</h3><Status>{asset.state === 'AVAILABLE' ? t.availableFile : asset.state === 'STAGED' ? t.stagedFile : t.retiredFile}</Status>{asset.state === 'AVAILABLE' ? <Button type="button" variant="quiet" onClick={() => void download(asset)}>{t.download}</Button> : null}{asset.state !== 'RETIRED' ? <Button type="button" variant="quiet" onClick={() => setRetirement({scope,value:asset.id})}>{t.retireFile}</Button> : null}{retiring === asset.id ? <CommandForm key={`${scope}:${asset.id}`} title={t.retireFile} path={`/v1/assets/${asset.id}/retire`} fields={[{ name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmRetirement', label: t.confirmRetirement, type: 'checkbox', required: true }]} body={values => ({ reason: String(values.get('reason')), confirmRetirement: values.get('confirmRetirement') === 'on' })} onSaved={() => { setRetirement(null); setRefresh(value => value + 1); }} onCancel={() => setRetirement(null)} /> : null}</article>)}{assets.loaded&&!assets.loading&&!assets.error&&!currentAssets.length?<WorkspaceState kind="empty" icon="portfolio" description={trail.filesEmpty}/>:null}<LoadMore query={assets} /></section>;
}
