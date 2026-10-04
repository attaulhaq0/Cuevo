'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { parseSchoolAudit } from '../model';
import { schoolAr, schoolEn } from '../messages';
import { currentAuditDenial, admittedAuditRows, type AuditDenial } from '../audit-read-model';

export function SchoolAudit() {
  const { locale } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn; const [refresh, setRefresh] = useState(0);
  const query = usePaginatedLearningQuery('/v1/school/audit?limit=25', parseSchoolAudit, refresh);
  const scope = query.context;
  const [denial, setDenial] = useState<AuditDenial | null>(null);
  const currentDenial = currentAuditDenial(denial, scope, query);
  if (currentDenial !== denial) setDenial(currentDenial);
  const rows = admittedAuditRows(query, currentDenial), error = currentDenial?.error ?? query.error;
  return <section aria-label={t.audit}><header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2>{t.audit}</h2><p>{t.auditNote}</p></div><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button></header>{query.loading ? <p role="status">{t.loading}</p> : error ? <LearningError error={error} /> : rows.map(row => <article className="academic-row" key={row.id}><h3>{row.actorName ?? t.nameUnavailable}</h3><p>{row.objectName ?? t.auditSource}</p><p>{t[row.outcome]} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.occurredAt))}</bdi></p><details><summary>{t.auditSource}</summary><p><bdi>{row.action}</bdi> · <bdi>{row.objectType}</bdi></p><p><bdi>{row.objectId}</bdi> · <bdi>{row.requestId}</bdi></p></details></article>)}{!query.loading && !error && !rows.length ? <p>{t.empty}</p> : null}<LoadMore query={{ ...query, moreError: currentDenial ? null : query.moreError }} label={t.audit} /></section>;
}
