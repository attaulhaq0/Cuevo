'use client';

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Status, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { academicReferenceChoice, type AcademicReference } from '../model';
import { academicAr, academicEn } from '../messages';
import { academicReadingAr, academicReadingEn } from '../reference-result-messages';
import { currentSelectedReference, parseReferenceSelection, referenceSelection, validateReferenceReceipt, type ReferenceSelection } from '../reference-result-reading-model';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningApiError } from '../../../shared/api/client';

export function ReferenceList({ references, onChanged, pageHeading = false }: { references: AcademicReference[]; onChanged: () => void; pageHeading?: boolean }) {
  const { membership, locale, commandJournal, formDrafts, apiUrl, accessToken, online } = useApp();
  const t = locale === 'ar' ? academicAr : academicEn, r = locale === 'ar' ? academicReadingAr : academicReadingEn;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const scope = `${membership?.schoolId}:${membership?.userId}:${membership?.role}:${apiUrl}:${accessToken}:${online}`;
  const prefix = `${membership?.schoolId}:${membership?.userId}:`;
  const pending = commandJournal.pending().find(command => /^\/v1\/academic-references(?:\/[^/]+\/approve)?$/.test(command.path));
  const pendingBasis = pending ? parseReferenceSelection(formDrafts.get(`${prefix}${pending.path}`)?.basis) : null;
  const [create, setCreate] = useState(() => !!formDrafts.get(`${prefix}/v1/academic-references`));
  const [selection, setSelection] = useState<{ scope: string; value: ReferenceSelection } | null>(null);
  const [approve, setApprove] = useState<ReferenceSelection | null>(null);
  const [formLocked, setFormLocked] = useState(false);
  const locked = !!pending || formLocked;
  const onLockedChange = useCallback((value: boolean) => setFormLocked(value), []);
  const source = selection?.scope === scope ? selection.value : pendingBasis;
  const selected = currentSelectedReference(references, source);
  const canCreate = membership?.role === 'teacher' || membership?.role === 'admin';
  const canApprove = membership?.role === 'coordinator' || membership?.role === 'admin';
  const RecordHeading = pageHeading ? 'h2' : 'h3';
  const heading = useRef<HTMLHeadingElement>(null), directory = useRef<HTMLElement>(null), opener = useRef<HTMLElement | null>(null), focusReader = useRef(false), focusDirectory = useRef(false);
  useLayoutEffect(() => {
    if (focusReader.current && heading.current) { focusReader.current = false; heading.current.focus({ preventScroll: true }); (heading.current.closest('.academic-reference-selected') ?? heading.current).scrollIntoView({ block: 'start', behavior: 'instant' }); }
    if (focusDirectory.current) { focusDirectory.current = false; const target = opener.current?.isConnected && opener.current.getClientRects().length ? opener.current : directory.current; target?.focus({ preventScroll: true }); }
  });
  function saved() { setCreate(false); setApprove(null); onChanged(); }
  function back() { if (locked) return; setSelection(null); setApprove(null); focusDirectory.current = true; }
  const approvalPath = selected ? `/v1/academic-references/${selected.id}/approve` : null;
  const pendingApproval = pending?.path.endsWith('/approve') ? pending : null;
  const originalSource = pendingApproval ? pendingBasis : approve;
  const currentApproval = selected && canApprove && selected.status === 'DRAFT' && originalSource && selected.id === originalSource.id && selected.version === originalSource.version && selected.createdBy === originalSource.createdBy;
  return <section className={`academic-reference-workspace${source ? ' academic-reference-workspace--selected' : ''}`}>
    <header className="academic-section-header">{pageHeading ? null : <h2>{t.references}</h2>}{canCreate ? <Button type="button" disabled={locked} onClick={() => { setCreate(true); setSelection(null); setApprove(null); }}>{t.createReference}</Button> : null}</header>
    {canCreate && (create || pending?.path === '/v1/academic-references') ? <CommandForm title={t.createReference} path="/v1/academic-references" fields={[{ name: 'title', label: t.title, required: true }, { name: 'version', label: t.version, required: true }, { name: 'description', label: t.description, type: 'textarea', required: true, maxLength: 4000 }]} body={values => ({ title: String(values.get('title')), version: String(values.get('version')), description: String(values.get('description')) })} validateReceipt={(value, original) => validateReferenceReceipt(value, original, membership?.userId ?? '')} onLockedChange={onLockedChange} onSaved={saved} onCancel={() => setCreate(false)} note={t.customBody} /> : null}
    <div className="academic-reading-grid">
      <section ref={directory} tabIndex={-1} className="academic-reference-directory" aria-label={r.referenceDirectory}>{references.length ? references.map(reference => <Button key={reference.id} data-reference-choice={reference.id} type="button" variant="quiet" disabled={locked} aria-pressed={selected?.id === reference.id} onClick={event => { if (locked) return; opener.current = event.currentTarget; focusReader.current = true; setApprove(null); setCreate(false); setSelection({ scope, value: referenceSelection(reference) }); }}><CuevoIcon name="learning" size={24} /><span><strong>{reference.title}</strong><small>{academicReferenceChoice(reference, locale)}</small></span><Status tone={reference.status === 'APPROVED' ? 'positive' : 'neutral'}>{reference.status === 'APPROVED' ? t.approved : t.draft}</Status></Button>) : <p className="learning-empty">{t.emptyReferences}</p>}</section>
      {source ? <section className="academic-reference-selected"><Button type="button" variant="quiet" disabled={locked} onClick={back}>{r.referenceBack}</Button>{selected ? <article className="academic-row cuevo-record"><div className="learning-section-heading"><div><div className="cuevo-record-heading"><CuevoIcon name="learning" size={28} /><RecordHeading ref={heading} tabIndex={-1}>{selected.title}</RecordHeading></div><p>{t.schoolAuthored}{selected.createdAt ? <> · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(selected.createdAt))} UTC</bdi></> : null}</p></div><Status tone={selected.status === 'APPROVED' ? 'positive' : 'neutral'}>{selected.status === 'APPROVED' ? t.approved : t.draft}</Status></div><p className="lesson-content" dir="auto">{selected.description}</p><details><summary>{t.evidence}</summary><p>{t.version}: <bdi>{selected.version}</bdi></p><dl className="academic-facts"><div><dt>{t.code}</dt><dd><bdi>{selected.code ?? t.noCode}</bdi></dd></div><div><dt>{t.createdBy}</dt><dd><bdi>{selected.createdBy}</bdi></dd></div>{selected.approvedBy ? <div><dt>{t.reviewedBy}</dt><dd><bdi>{selected.approvedBy}</bdi></dd></div> : null}</dl></details>{currentApproval && approvalPath ? <CommandForm title={t.approve} path={approvalPath} fields={[]} body={() => { if (!canApprove || selected.status !== 'DRAFT') throw new LearningApiError('conflict'); return {}; }} validateReceipt={(value, original) => validateReferenceReceipt(value, original, membership?.userId ?? '', originalSource)} onLockedChange={onLockedChange} onSaved={saved} onCancel={() => setApprove(null)} note={t.approvalNote} actionLabel={t.approve} /> : canApprove && selected.status === 'DRAFT' && !pendingApproval ? <Button type="button" variant="secondary" disabled={locked} onClick={() => { const basis = referenceSelection(selected); formDrafts.save(`${prefix}${approvalPath}`, {}, basis); setApprove(basis); }}>{t.approve}</Button> : null}</article> : <p role="status">{r.referenceChanged}</p>}</section> : null}
    </div>
    {pendingApproval && !currentApproval && canApprove ? pendingBasis && currentSelectedReference(references, pendingBasis) ? <CommandForm title={t.approve} path={pendingApproval.path} fields={[]} body={() => { throw new LearningApiError('conflict'); }} validateReceipt={(value, original) => validateReferenceReceipt(value, original, membership?.userId ?? '', pendingBasis)} onLockedChange={onLockedChange} onSaved={saved} note={r.original} actionLabel={t.approve} /> : <p role="status">{r.referenceChanged}</p> : null}
  </section>;
}
