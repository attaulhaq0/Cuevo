'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningApiError } from '../../../shared/api/client';
import { academicAr, academicEn } from '../messages';
import { currentResultPublication, parseCurrentResultPublication, resultPublicationScope, validateResultPublicationReceipt, publicationDecisionCurrent, parsePublicationMutationBasis, recoverPublicationBasis } from '../publication-model';
import type { PublicationMutationBasis } from '../publication-model';

export function ResultPublication({ resultId }: { resultId: string }) {
  const { membership } = useApp();
  return <CurrentResultPublication key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}:${resultId}`} resultId={resultId} />;
}
function CurrentResultPublication({ resultId }: { resultId: string }) {
  const app = useApp(); const { locale, commandJournal, formDrafts, membership } = app;
  const t = locale === 'ar' ? academicAr : academicEn;
  const path = `/v1/results/${resultId}/publication`;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const retained = commandJournal.get(path);
  const recoveredBasis = recoverPublicationBasis(retained, resultId);
  const decisionKey = `${path}:decision`;
  const decisionSlot = `${membership?.schoolId}:${membership?.userId}:${decisionKey}`;
  const [open, setOpen] = useState(() => !!commandJournal.get(path) || !!formDrafts.get(decisionSlot)); const [refresh, setRefresh] = useState(0); const [locked, setLocked] = useState(false);
  const [basis, setBasis] = useState<PublicationMutationBasis | null>(() => {
    const original = commandJournal.get(path);
    return original ? recoverPublicationBasis(original, resultId) : parsePublicationMutationBasis(formDrafts.get(decisionSlot)?.basis);
  });
  const scope = resultPublicationScope(app, resultId, refresh);
  const parser = useCallback((value: unknown) => ({ scope, value: parseCurrentResultPublication(value, resultId) }), [scope, resultId]);
  const query = useApiQuery(open && scope ? path : null, parser, refresh);
  const publication = currentResultPublication(query.data, scope);
  const decisionBasis = retained ? recoveredBasis : basis;
  const onLockedChange = useCallback((value: boolean) => setLocked(value), []);
  useEffect(() => { if (query.error || !scope) { formDrafts.remove(decisionSlot); setBasis(null); } }, [query.error, scope, formDrafts, decisionSlot]);
  function closeDecision() { formDrafts.remove(decisionSlot); setBasis(null); }
  if (!scope) return null;
  return <section><Button type="button" variant="quiet" disabled={locked || !!commandJournal.get(path)} aria-expanded={open} onClick={() => setOpen(value => !value)}>{t.parentPublication}</Button>{open ? query.loading || !publication && !query.error ? <p role="status">{t.loading}</p> : query.error ? <><LearningError error={query.error}/><Button type="button" variant="secondary" onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button></> : publication ? <>
    <Status tone={publication.parentVisible ? 'positive' : 'neutral'}>{publication.parentVisible ? t.sharedWithParents : t.privateFromParents}</Status><p className="notice">{t.publicationNote}</p>
    {decisionBasis ? <CommandForm title={decisionBasis.parentVisible ? t.sharePublication : t.revokePublication} path={path} draftKey={decisionKey} fields={[{ name: 'reason', label: t.publicationReason, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmPublication', label: t.publicationConfirm, type: 'checkbox', required: true }]} body={values => { if (!publicationDecisionCurrent(publication, resultId, decisionBasis)) throw new LearningApiError('conflict'); return { ...decisionBasis, reason: String(values.get('reason')), confirmPublication: values.get('confirmPublication') === 'on' }; }} validateReceipt={validateResultPublicationReceipt} onLockedChange={onLockedChange} onSaved={() => { setRefresh(value => value + 1); closeDecision(); }} onCancel={closeDecision} actionLabel={decisionBasis.parentVisible ? t.sharePublication : t.revokePublication} /> : retained ? <LearningError error={new LearningApiError('invalid', true)} /> : <Button type="button" variant="secondary" onClick={() => { const original = { parentVisible: !publication.parentVisible, expectedPublicationRevision: publication.publicationRevision, expectedResultRevision: publication.resultRevision }; formDrafts.save(decisionSlot, {}, original); setBasis(original); }}>{publication.parentVisible ? t.revokePublication : t.sharePublication}</Button>}
  </> : null : null}</section>;
}
