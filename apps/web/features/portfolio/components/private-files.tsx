'use client';
import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { parsePrivateAsset, type PrivateAsset } from '../model';
import { portfolioAr, portfolioEn } from '../messages';
export function PrivateFiles() {
  const { membership, locale, apiUrl, accessToken } = useApp(); const { request, journal } = useApi(); const t = locale === 'ar' ? portfolioAr : portfolioEn;
  const [refresh, setRefresh] = useState(0); const [file, setFile] = useState<File | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState<LearningApiError | null>(null);
  const assets = usePaginatedLearningQuery(membership?.role === 'student' ? '/v1/assets?limit=100' : null, parsePrivateAsset, refresh);
  if (membership?.role !== 'student') return null;
  async function upload() {
    if ((!file && !journal.get('/v1/assets')) || pending || !membership) return; setPending(true); setError(null); let finalizePath: string | null = null;
    try {
      let stage = journal.get('/v1/assets'); let content = journal.get('/v1/assets/content');
      if (!stage && file) { const bytes = new Uint8Array(await file.arrayBuffer()); if (!bytes.length || bytes.length > 524288 || !['text/plain', 'image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) throw new LearningApiError('invalid'); const hash = await crypto.subtle.digest('SHA-256', bytes); const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); stage = journal.prepare('/v1/assets', '/v1/assets', { ownerId: membership.userId, name: file.name, contentType: file.type, byteSize: bytes.length, sha256 }); content = journal.prepare('/v1/assets/content', '/v1/assets/content', { contentBase64: btoa(binary) }); }
      if (!stage || !content) throw new LearningApiError('invalid'); const receipt = await request('/v1/assets', { command: stage }); if (!receipt || typeof receipt !== 'object' || !('id' in receipt) || typeof receipt.id !== 'string') throw new LearningApiError('invalid', true);
      const path = `/v1/assets/${receipt.id}/finalize`; finalizePath = path; const finalize = journal.prepare(path, path, content.body); const confirmed = await request(path, { command: finalize }); if (!confirmed || typeof confirmed !== 'object' || !('id' in confirmed)) throw new LearningApiError('invalid', true);
      journal.confirm('/v1/assets'); journal.confirm('/v1/assets/content'); journal.confirm(path); setFile(null); setRefresh(value => value + 1);
    } catch (failure) { const safe = failure instanceof LearningApiError ? failure : new LearningApiError('invalid', true); if (!safe.uncertain) { journal.confirm('/v1/assets'); journal.confirm('/v1/assets/content'); if (finalizePath) journal.confirm(finalizePath); } setError(safe); } finally { setPending(false); }
  }
  async function download(asset: PrivateAsset) {
    if (!accessToken || !membership) return; setError(null);
    try { const response = await fetch(`${apiUrl}/v1/assets/${asset.id}/download`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': membership.schoolId }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new LearningApiError(response.status === 403 ? 'denied' : 'unavailable'); const bytes = await response.arrayBuffer(); const hash = await crypto.subtle.digest('SHA-256', bytes); const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''); if (bytes.byteLength !== asset.byteSize || sha256 !== asset.sha256) throw new LearningApiError('invalid'); const url = URL.createObjectURL(new Blob([bytes], { type: asset.contentType })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = asset.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (failure) { setError(failure instanceof LearningApiError ? failure : new LearningApiError('unavailable')); }
  }
  return <section className="portfolio-item"><h2>{t.files}</h2><p className="learning-form__note">{t.filesNote}</p><div className="field"><label htmlFor="portfolio-file">{t.chooseFile}</label><input id="portfolio-file" type="file" accept=".txt,.png,.jpg,.jpeg,.pdf" disabled={pending || !!journal.get('/v1/assets')} onChange={event => setFile(event.target.files?.[0] ?? null)} /></div><Button type="button" disabled={pending || !file && !journal.get('/v1/assets')} onClick={() => void upload()}>{pending ? t.loading : journal.get('/v1/assets') ? t.retryUpload : t.upload}</Button>{error ? <LearningError error={error} /> : null}{assets.error ? <LearningError error={assets.error} /> : assets.data.map(asset => <article key={asset.id}><h3>{asset.name}</h3><Status>{asset.state}</Status>{asset.state === 'AVAILABLE' ? <Button type="button" variant="quiet" onClick={() => void download(asset)}>{t.download}</Button> : null}</article>)}<LoadMore query={assets} /></section>;
}
