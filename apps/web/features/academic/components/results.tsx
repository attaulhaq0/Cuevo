'use client';

import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseEvidence, type ReleasedResult } from '../model';
import { academicAr, academicEn } from '../messages';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { NativeResultView } from './native-result';
import{ResultHistory}from'./result-history';
import{ResultPublication}from'./publication';

export function ReleasedResults({ results }: { results: ReleasedResult[] }) {
  const { locale, membership } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  return results.length ? <section><h2>{t.results}</h2>{results.map((result) => <article key={result.id} className="academic-row" data-result-id={result.id}><div className="learning-section-heading"><div><h3>{result.assessmentTitle ?? (result.model === 'rubric' ? t.nativeRubric : t.native)}</h3>{membership && ['admin', 'teacher', 'coordinator'].includes(membership.role) ? <p className="academic-learner"><bdi>{result.learnerName ?? t.learnerUnavailable}</bdi></p> : null}<p>{t.reference}: {result.referenceTitle ?? t.contextUnavailable}</p></div><Status tone="positive">{t.published}</Status></div><NativeResultView result={result.nativeResult} /><p className="lesson-content">{result.feedback}</p><p className="learning-form__note">{t.revision}: {result.revision} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(result.createdAt))}</bdi></p><details><summary>{t.sourceDetails}</summary><p>{t.referenceVersion}: <bdi>{result.referenceVersion}</bdi> · {t.policy}: {result.policyVersion}</p></details>{result.model === 'numeric' ? <p className="learning-form__note">{t.nativeNote}</p> : null}<ResultHistory resultId={result.id} /><ResultPublication resultId={result.id}/><Button type="button" variant="quiet" onClick={() => setEvidenceId(evidenceId === result.evidenceId ? null : result.evidenceId)} aria-expanded={evidenceId === result.evidenceId}>{evidenceId === result.evidenceId ? t.closeEvidence : t.evidence}</Button>{evidenceId === result.evidenceId ? <EvidenceDetail evidenceId={result.evidenceId} /> : null}</article>)}</section> : <p className="learning-empty">{t.emptyResults}</p>;
}

export function EvidenceDetail({ evidenceId }: { evidenceId: string }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const query = useApiQuery(`/v1/evidence/${evidenceId}`, parseEvidence, 0);
  if (query.loading) return <p role="status">{t.evidence}…</p>;
  if (query.error) return <LearningError error={query.error} />;
  if (!query.data) return <p>{t.evidenceMissing}</p>;
  const evidence = query.data;
  return <section className="evidence-provenance"><div className="evidence-context"><h4>{evidence.context.assessmentTitle ?? t.contextUnavailable}</h4><p>{[evidence.context.courseTitle,evidence.context.className,evidence.context.yearGroupName,evidence.context.academicYearName].filter(Boolean).join(' · ')}</p><p>{t.reference}: {evidence.context.referenceTitle ?? t.contextUnavailable}</p><dl className="academic-facts"><div><dt>{t.recordedBy}</dt><dd><bdi>{evidence.context.recordedByName ?? t.nameUnavailable}</bdi></dd></div><div><dt>{t.recordedAt}</dt><dd><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(evidence.createdAt))}</bdi></dd></div><div><dt>{t.evidenceQuality}</dt><dd>{t.teacherEntered}</dd></div><div><dt>{t.visibility}</dt><dd>{evidence.visibility === 'PARENT_APPROVED' ? t.parentApproved : t.learnerPrivate}</dd></div><div><dt>{t.reviewStatus}</dt><dd>{t.approved}</dd></div></dl><p className="learning-form__note">{t.currentSourceNames}</p>{evidence.context.status==='REQUIRES_REVIEW'?<p className="notice" role="status">{t.contextReview}</p>:null}</div><details><summary>{t.sourceDetails}</summary><dl className="academic-facts"><div><dt>{t.sourceType}</dt><dd>{t.submissionSource}</dd></div><div><dt>{t.sourceObject}</dt><dd><bdi>{evidence.sourceObjectId}</bdi></dd></div><div><dt>{t.recordedBy}</dt><dd><bdi>{evidence.actorId}</bdi></dd></div><div><dt>{t.referenceVersion}</dt><dd><bdi>{evidence.referenceVersion}</bdi></dd></div><div><dt>{t.policy}</dt><dd>{evidence.policyVersion}</dd></div><div><dt>{t.revision}</dt><dd>{evidence.revision}</dd></div></dl></details></section>;
}
