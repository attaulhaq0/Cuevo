'use client';

import { CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { Evidence } from '../model';
import { academicAr, academicEn } from '../messages';

/** Only the exact evidence reader may supply this read-only projection. */
export function EvidenceReading({ evidence }: { evidence: Evidence }) {
  const { locale } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const number = new Intl.NumberFormat(locale);
  return <section className="evidence-reading" aria-label={t.evidence}>
    <h4><CuevoIcon name="assessment" size={24} />{t.evidence}</h4>
    <dl className="academic-facts evidence-provenance"><div><dt>{t.sourceType}</dt><dd>{t.submissionSource}</dd></div><div><dt>{t.recordedAt}</dt><dd><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(evidence.createdAt))} · UTC</bdi></dd></div><div><dt>{t.evidenceQuality}</dt><dd>{t.teacherEntered}</dd></div><div><dt>{t.visibility}</dt><dd>{evidence.visibility === 'PARENT_APPROVED' ? t.parentApproved : t.learnerPrivate}</dd></div><div><dt>{t.recordedBy}</dt><dd>{t.recorderUnavailable}</dd></div><div><dt>{t.reviewStatus}</dt><dd>{t.approved}</dd></div></dl>
    <p className="learning-form__note">{t.evidenceReadingNote}</p>
    <details><summary>{t.source}</summary><dl className="academic-facts"><div><dt>{t.sourceObject}</dt><dd><bdi>{evidence.sourceObjectId}</bdi></dd></div><div><dt>{t.recordedBy}</dt><dd><bdi>{evidence.actorId}</bdi></dd></div><div><dt>{t.referenceVersion}</dt><dd><bdi>{evidence.referenceVersion}</bdi></dd></div><div><dt>{t.policy}</dt><dd>{number.format(evidence.policyVersion)}</dd></div><div><dt>{t.revision}</dt><dd>{number.format(evidence.revision)}</dd></div></dl></details>
  </section>;
}
