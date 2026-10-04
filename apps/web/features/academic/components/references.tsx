'use client';

import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { AcademicReference } from '../model';
import { academicAr, academicEn } from '../messages';
import { CommandForm } from '../../../shared/components/command-form';

export function ReferenceList({ references, onChanged }: { references: AcademicReference[]; onChanged: () => void }) {
  const { membership, locale } = useApp();
  const t = locale === 'ar' ? academicAr : academicEn;
  const [create, setCreate] = useState(false);
  const [approveId, setApproveId] = useState<string | null>(null);
  const canCreate = membership?.role === 'teacher' || membership?.role === 'admin';
  const canApprove = membership?.role === 'coordinator' || membership?.role === 'admin';
  function saved() { setCreate(false); setApproveId(null); onChanged(); }
  return <section className="academic-reference-workspace"><header className="academic-section-header"><h2>{t.references}</h2>{canCreate ? <Button type="button" onClick={() => setCreate(true)}>{t.createReference}</Button> : null}</header>{create ? <CommandForm title={t.createReference} path="/v1/academic-references" fields={[{ name: 'title', label: t.title, required: true }, { name: 'version', label: t.version, required: true }, { name: 'description', label: t.description, type: 'textarea', required: true, maxLength: 4000 }]} body={(values) => ({ title: String(values.get('title')), version: String(values.get('version')), description: String(values.get('description')) })} onSaved={saved} onCancel={() => setCreate(false)} note={t.customBody} /> : null}{references.length ? <div className="academic-reference-list">{references.map((reference) => <article key={reference.id} className="academic-row"><div className="learning-section-heading"><div><h3>{reference.title}</h3><p>{t.schoolAuthored}{reference.createdAt ? <> · <bdi>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(reference.createdAt))} UTC</bdi></> : null}</p></div><Status tone={reference.status === 'APPROVED' ? 'positive' : 'neutral'}>{reference.status === 'APPROVED' ? t.approved : t.draft}</Status></div><p className="lesson-content" dir="auto">{reference.description}</p><details><summary>{t.evidence}</summary><p>{t.version}: <bdi>{reference.version}</bdi></p><dl className="academic-facts"><div><dt>{t.code}</dt><dd><bdi>{reference.code ?? t.noCode}</bdi></dd></div><div><dt>{t.createdBy}</dt><dd><bdi>{reference.createdBy}</bdi></dd></div>{reference.approvedBy ? <div><dt>{t.reviewedBy}</dt><dd><bdi>{reference.approvedBy}</bdi></dd></div> : null}</dl></details>{canApprove && reference.status === 'DRAFT' ? approveId === reference.id ? <CommandForm title={t.approve} path={`/v1/academic-references/${reference.id}/approve`} fields={[]} body={() => ({})} onSaved={saved} onCancel={() => setApproveId(null)} note={t.approvalNote} actionLabel={t.approve} /> : <Button type="button" variant="secondary" onClick={() => setApproveId(reference.id)}>{t.approve}</Button> : null}</article>)}</div> : <p className="learning-empty">{t.emptyReferences}</p>}</section>;
}
