'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { resourceStageSchema, submissionArtifactSchema, submissionWorkSourceSchema, type SubmissionArtifact } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { currentSubmissionWorkDraft, currentSubmissionWorkReceipt, currentWorkArtifact, type Submission } from '../model';
import { SubmissionHistory } from './submission-lifecycle';
import { useLearningApi } from '../api';
import { LearningSourceContext } from './source-context';

type WorkingDocuments = { artifacts: SubmissionArtifact[]; responseKind: 'TEXT' | 'FILE' };
const parseWork = (value: unknown) => { const parsed = submissionWorkSourceSchema.safeParse(value); if (!parsed.success) throw new LearningApiError('invalid'); return parsed.data; };
export function SubmissionDocuments({ assessmentId, submission, available = true, onChanged }: { assessmentId: string; submission?: Submission; available?: boolean; onChanged: () => void }) {
  const { t: learning } = useLearningApi();
  const { membership, locale, accessToken, online, accessGeneration, formDrafts } = useApp(); const { request, journal } = useApi();
  const t = locale === 'ar' ? { heading: 'تسليم عمل بمستندات', choose: 'اختيار مستند العمل', upload: 'رفع المستند والتحقق', retry: 'إعادة الرفع نفسه', kind: 'نوع الإجابة', text: 'نص مع مستندات اختيارية', file: 'مستندات فقط', response: 'إجابتك', save: 'حفظ مسودة العمل', submit: 'تسليم العمل بالمستندات', confirm: 'اختر مستندات متحققًا منها للعمل فقط.', note: 'TXT وPDF وPNG وJPEG حتى 512 كيلوبايت لكل مستند، وبحد أقصى خمسة مستندات.', loading: 'جارٍ تحميل العمل…', refresh: 'تحديث مسودة العمل', remove: 'إزالة من هذا العمل', empty: 'لم تُحدّد مستندات. تتطلب الإجابة بالمستندات فقط مستندًا واحدًا على الأقل.' } : { heading: 'Submit work with documents', choose: 'Choose work document', upload: 'Upload and verify work document', retry: 'Retry the same work upload', kind: 'Response type', text: 'Text with optional documents', file: 'Documents only', response: 'Your response', save: 'Save work draft', submit: 'Submit document work', confirm: 'Select only verified documents that belong to this work.', note: 'TXT, PDF, PNG and JPEG up to 512 KiB each; at most five documents.', loading: 'Loading work…', refresh: 'Refresh work draft', remove: 'Remove from this work', empty: 'No documents selected. A documents-only response needs at least one document.' };
  const path = `/v1/assessments/${assessmentId}`; const submitPath = submission ? path + `/work-submissions/${submission.id}/resubmit` : path + '/work-submissions';
  const slot = `${membership?.schoolId}:${membership?.userId}:submission-documents:${assessmentId}`;
  const [refresh, setRefresh] = useState(0); const editable = available && (!submission || submission.status === 'RETURNED');
  const parseDraft = useCallback((value: unknown) => currentSubmissionWorkDraft(value, assessmentId), [assessmentId]);
  const draft = useApiQuery(editable ? path + '/work-draft' : null, parseDraft, refresh);
  const previous = useApiQuery(editable && submission?.status === 'RETURNED' ? `/v1/submissions/${submission.id}/source-work` : null, parseWork, refresh);
  const [receipt, setReceipt] = useState<ReturnType<typeof parseDraft> | null>(null);
  const [working, setWorking] = useState<WorkingDocuments | null>(() => formDrafts.model<WorkingDocuments>(slot) ?? null);
  const [file, setFile] = useState<File | null>(null); const [pending, setPending] = useState(false); const [commandLocked, setCommandLocked] = useState(false); const [error, setError] = useState<LearningApiError | null>(null);
  const [mode, setMode] = useState<'draft' | 'submit'>(() => journal.get(path + '/work-draft') ? 'draft' : 'submit');
  const scope = `${membership?.schoolId}:${membership?.userId}:${accessToken ?? ''}:${online}:${accessGeneration}:${assessmentId}`; const current = useRef(scope); current.current = scope; const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const serverDraft = receipt && receipt.assessmentId === assessmentId && receipt.revision >= (draft.data?.revision ?? 0) ? receipt : draft.data;
  const previousMatches = !previous.data || previous.data.submissionId === submission?.id && previous.data.assessmentId === assessmentId && previous.data.learnerId === membership?.userId;
  const chosen = working?.artifacts ?? (serverDraft?.revision ? serverDraft.artifacts : previous.data?.artifacts) ?? [];
  const responseKind = working?.responseKind ?? (serverDraft?.revision ? serverDraft.responseKind : previous.data?.responseKind) ?? 'TEXT';
  const retainedWork = journal.get(path + '/work-draft') ?? journal.get(submitPath);
  const uploadLocked = pending || !!journal.get(path + ':work-stage');
  const controlsLocked = commandLocked || !!retainedWork || uploadLocked || draft.loading || !!draft.error || previous.loading || !!previous.error;
  function saveWorking(artifacts: SubmissionArtifact[], kind = responseKind) { const next = { artifacts, responseKind: kind }; setWorking(next); formDrafts.saveModel(slot, next); }
  async function upload() {
    if (pending || commandLocked || retainedWork || chosen.length >= 5 || (!file && !journal.get(path + ':work-stage'))) return;
    setPending(true); setError(null); const expected = scope; const keys = new Map<string, string>();
    const valid = () => mounted.current && current.current === expected && [...keys].every(([key, value]) => journal.get(key)?.key === value);
    try {
      let stage = journal.get(path + ':work-stage'); let bytesCommand = journal.get(path + ':work-bytes');
      if (!stage && file) {
        if (file.size < 1 || file.size > 524288) throw new LearningApiError('invalid');
        const bytes = new Uint8Array(await file.arrayBuffer()); if (!valid()) return;
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''); if (!valid()) return;
        const metadata = resourceStageSchema.safeParse({ name: file.name, contentType: file.type, byteSize: bytes.length, sha256: hash }); if (!metadata.success) throw new LearningApiError('invalid');
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        stage = journal.prepare(path + ':work-stage', path + '/work-assets', metadata.data); bytesCommand = journal.prepare(path + ':work-bytes', path + '/work-assets', { contentBase64: btoa(binary) });
      }
      if (!stage || !bytesCommand) throw new LearningApiError('invalid');
      keys.set(path + ':work-stage', stage.key); keys.set(path + ':work-bytes', bytesCommand.key);
      const staged = await request(stage.path, { command: stage }); if (!valid()) return;
      if (!staged || typeof staged !== 'object' || !('id' in staged) || typeof staged.id !== 'string') throw new LearningApiError('invalid', true);
      const finalize = journal.prepare(path + ':work-finalize', path + `/work-assets/${staged.id}/finalize`, bytesCommand.body); keys.set(path + ':work-finalize', finalize.key);
      const result = await request(finalize.path, { command: finalize }); if (!valid()) return;
      const confirmed = currentWorkArtifact(result, staged.id, stage.body);
      saveWorking([...chosen.filter(asset => asset.id !== confirmed.id), confirmed]);
      for (const [key, value] of keys) journal.confirm(key, value); setFile(null);
    } catch (failure) {
      if (valid()) { const safe = failure instanceof LearningApiError ? failure : new LearningApiError('invalid', true); if (!safe.uncertain) for (const [key, value] of keys) journal.confirm(key, value); setError(safe); }
    } finally { if (mounted.current && current.current === expected) setPending(false); }
  }
  if (!editable) return submission ? <div className="submission-work"><div className="submission-work-heading"><CuevoIcon name="assessment" variant="filled" size={26} /><h4>{learning.currentWork}</h4><Status>{submission.status === 'RETURNED' ? learning.returned : submission.status === 'CLOSED' ? learning.closed : submission.status === 'RESUBMITTED' ? learning.resubmitted : learning.submitted}</Status></div>{submission.returnFeedback ? <div className="submission-revision-feedback"><h4>{learning.returnFeedback}</h4><p className="lesson-content" dir="auto">{submission.returnFeedback}</p></div> : null}<SubmittedDocumentWork submissionId={submission.id} /><SubmissionHistory submissionId={submission.id} /></div> : <p className="notice">{learning.unavailableNow}</p>;
  return <section className="submission-documents" aria-label={t.heading}><div className="submission-work-heading"><CuevoIcon name="portfolio" variant="filled" size={26} /><h3>{t.heading}</h3></div>{submission?.returnFeedback ? <div className="submission-revision-feedback"><h4>{learning.returnFeedback}</h4><p className="lesson-content" dir="auto">{submission.returnFeedback}</p></div> : null}<p className="learning-form__note">{t.note}</p><Button type="button" variant="quiet" disabled={controlsLocked} onClick={()=>{const answerSlot=`${membership?.schoolId}:${membership?.userId}:submission-document-answer:${assessmentId}`;const answer=formDrafts.get(answerSlot);if(answer)formDrafts.save(answerSlot,answer.values,{});setReceipt(null);setRefresh(value=>value+1);}}><CuevoIcon name="refresh" size={18} />{t.refresh}</Button>{(draft.loading && !receipt) || previous.loading ? <p role="status" data-work-loading="true">{t.loading}</p> : draft.error || previous.error ? <><LearningError error={draft.error ?? previous.error!} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.retry}</Button></> : !previousMatches ? <LearningError error={new LearningApiError('invalid')} /> : <>
    <fieldset disabled={controlsLocked || chosen.length >= 5}><div className="field"><label htmlFor={`work-file-${assessmentId}`}>{t.choose}</label><input id={`work-file-${assessmentId}`} type="file" accept=".txt,.pdf,.png,.jpg,.jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div></fieldset>
    <Button type="button" disabled={pending || commandLocked || !!retainedWork || chosen.length >= 5 || (!file && !journal.get(path + ':work-stage'))} onClick={() => void upload()}>{journal.get(path + ':work-stage') ? t.retry : t.upload}</Button>{error ? <LearningError error={error} /> : null}
    {chosen.length ? <ul className="submission-document-list">{chosen.map(asset => <li key={asset.id}><CuevoIcon name="portfolio" size={20} /><bdi>{asset.name}</bdi> <Button type="button" variant="quiet" disabled={controlsLocked} onClick={() => saveWorking(chosen.filter(selected => selected.id !== asset.id))}>{t.remove}</Button></li>)}</ul> : <p className="learning-form__note">{t.empty}</p>}
    <fieldset disabled={controlsLocked}><div className="field"><label htmlFor={`work-kind-${assessmentId}`}>{t.kind}</label><select id={`work-kind-${assessmentId}`} value={responseKind} onChange={event => saveWorking(chosen, event.target.value as 'TEXT' | 'FILE')}><option value="TEXT">{t.text}</option><option value="FILE">{t.file}</option></select></div><div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setMode('draft')}>{t.save}</Button><Button type="button" onClick={() => setMode('submit')}>{t.submit}</Button></div></fieldset>
    {!uploadLocked ? <CommandForm key={`${assessmentId}:${responseKind}:${mode}:${serverDraft?.revision ?? 0}`} draftKey={`submission-document-answer:${assessmentId}`} title={mode === 'draft' ? t.save : t.submit} path={mode === 'draft' ? path + '/work-draft' : submitPath} fields={responseKind === 'TEXT' ? [{ name: 'content', label: t.response, type: 'textarea', required: true, defaultValue: serverDraft?.revision ? serverDraft.content : submission?.content, maxLength: 50000 }] : []} body={values => ({ responseKind, content: responseKind === 'TEXT' ? String(values.get('content')) : '', assetIds: chosen.map(asset => asset.id), ...(mode === 'draft' ? { expectedRevision: serverDraft?.revision ?? 0 } : submission ? { returnId: submission.returnId, expectedRevision: submission.revision } : {}) })} onLockedChange={setCommandLocked} onSaved={result => { const command = journal.get(mode === 'draft' ? path + '/work-draft' : submitPath); if (!command) throw new LearningApiError('invalid', true); if (mode === 'draft') { const saved = currentSubmissionWorkDraft(result, assessmentId, command.body); setReceipt(saved); saveWorking(saved.artifacts, saved.responseKind); setMode('submit'); } else { currentSubmissionWorkReceipt(result, assessmentId, membership?.userId, command.body, chosen); setWorking(null); formDrafts.remove(slot); onChanged(); } }} actionLabel={mode === 'draft' ? t.save : t.submit} note={t.confirm} /> : null}
  </>}</section>;
}
export function SubmittedDocumentWork({ submissionId }: { submissionId: string }) {
  const { locale, membership } = useApp(); const [refresh, setRefresh] = useState(0); const [retiring, setRetiring] = useState<string | null>(null); const parse = useCallback((value: unknown) => { const parsed = submissionWorkSourceSchema.safeParse(value); if (!parsed.success || parsed.data.submissionId !== submissionId) throw new LearningApiError('invalid'); return parsed.data; }, [submissionId]);
  const query = useApiQuery(`/v1/submissions/${submissionId}/source-work`, parse, refresh);
  return <section aria-label={locale === 'ar' ? 'العمل المسلّم' : 'Submitted work'}>{query.loading ? <p role="status">{locale === 'ar' ? 'جارٍ تحميل العمل…' : 'Loading work…'}</p> : query.error ? <LearningError error={query.error} /> : query.data ? <><LearningSourceContext type="submission" sourceId={submissionId} />{query.data.responseKind === 'TEXT' ? <p className="lesson-content" dir="auto">{query.data.content}</p> : null}{query.data.artifacts.map(asset => <div className="submitted-document" key={asset.id}><ArtifactDownload asset={asset} path={`/v1/submissions/${submissionId}/artifacts/${asset.id}/download`} />{membership?.role === 'student' && query.data?.learnerId === membership.userId && asset.state === 'AVAILABLE' ? <><Button type="button" variant="quiet" onClick={() => setRetiring(asset.id)}>{locale === 'ar' ? 'إيقاف مستند العمل المسلّم' : 'Retire submitted document'}</Button>{retiring === asset.id ? <CommandForm title={locale === 'ar' ? 'إيقاف مستند العمل المسلّم' : 'Retire submitted document'} path={`/v1/assessments/${query.data.assessmentId}/work-assets/${asset.id}/retire`} fields={[{name:'reason',label:locale==='ar'?'السبب':'Reason',type:'textarea',required:true,maxLength:1000},{name:'confirmRetirement',label:locale==='ar'?'أؤكد إيقاف هذا المستند وإلغاء تنزيله مستقبلًا':'I confirm this document should no longer be available',type:'checkbox',required:true}]} body={values=>({reason:String(values.get('reason')),confirmRetirement:values.get('confirmRetirement')==='on'})} onSaved={result=>{const receipt=submissionArtifactSchema.safeParse(result);if(!receipt.success||receipt.data.id!==asset.id||receipt.data.state!=='RETIRED')throw new LearningApiError('invalid',true);setRetiring(null);setRefresh(value=>value+1);}} onCancel={()=>setRetiring(null)}/> : null}</> : null}</div>)}</> : null}</section>;
}
export function ArtifactDownload({ asset, path }: { asset: SubmissionArtifact; path: string }) {
  const { membership, locale, apiUrl, accessToken, online, accessGeneration } = useApp(); const [error, setError] = useState<LearningApiError | null>(null);
  const scope = `${membership?.schoolId}:${membership?.userId}:${accessToken ?? ''}:${online}:${accessGeneration}:${path}:${asset.id}:${asset.sha256}`; const current = useRef(scope); current.current = scope; const controller = useRef<AbortController | null>(null); const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => () => controller.current?.abort(), [scope]);
  async function download() {
    if (!membership || !accessToken || !online) return; const expected = scope; const active = new AbortController(); controller.current?.abort(); controller.current = active; setError(null);
    try {
      const response = await fetch(apiUrl + path, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': membership.schoolId }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([active.signal, AbortSignal.timeout(15000)]) }); if (!response.ok) throw new LearningApiError(response.status === 403 ? 'denied' : 'unavailable');
      const bytes = await response.arrayBuffer(); const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''); if (bytes.byteLength !== asset.byteSize || hash !== asset.sha256) throw new LearningApiError('invalid');
      if (!mounted.current || active.signal.aborted || current.current !== expected) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: asset.contentType })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = asset.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { if (mounted.current && !active.signal.aborted && current.current === expected) setError(failure instanceof LearningApiError ? failure : new LearningApiError('unavailable')); }
  }
  return <div className="submission-document-download"><CuevoIcon name="portfolio" size={20} /><bdi>{asset.name}</bdi>{asset.state === 'AVAILABLE' ? <Button type="button" variant="quiet" onClick={() => void download()}>{locale === 'ar' ? 'تنزيل مستند العمل' : 'Download work document'}</Button> : <p>{locale === 'ar' ? 'المستند غير متاح' : 'Document unavailable'}</p>}{error ? <LearningError error={error} /> : null}</div>;
}
