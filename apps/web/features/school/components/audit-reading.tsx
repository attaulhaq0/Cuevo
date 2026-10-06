'use client';
import { Status, CuevoIcon } from '@cuevo/ui';
import type { SchoolAuditRow } from '../model';
import { auditPresentation } from '../audit-presentation';
import { auditEn, auditAr } from '../audit-messages';

/** One stateless reader; source admission, denial and pagination stay with SchoolAudit. */
export function SchoolAuditReading({ rows, locale, pageHeading = false }: { rows: SchoolAuditRow[]; locale: 'en' | 'ar'; pageHeading?: boolean }) {
  const RecordHeading = pageHeading ? 'h2' : 'h3';
  const t = locale === 'ar' ? auditAr : auditEn;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return <div className="school-audit-records">{rows.map(row => {
    const view = auditPresentation(row, locale);
    return <article className="academic-row school-audit-row cuevo-record" key={row.id}><header><div className="cuevo-record-heading"><CuevoIcon name="shield" size={28}/><RecordHeading>{view.title}</RecordHeading></div><Status tone={row.outcome === 'succeeded' ? 'neutral' : 'warning'}>{view.status}</Status></header><p className="school-audit-source"><bdi>{view.source}</bdi> · {view.kind}</p><dl className="school-audit-context"><div><dt>{t.actor}</dt><dd><bdi>{view.actor}</bdi></dd></div><div><dt>{t.date}</dt><dd><time dateTime={row.occurredAt}>{date.format(new Date(row.occurredAt))}</time></dd></div></dl><details className="school-audit-technical"><summary>{t.technical}</summary><dl><div><dt>{t.actionCode}</dt><dd><bdi>{row.action}</bdi></dd></div><div><dt>{t.typeCode}</dt><dd><bdi>{row.objectType}</bdi></dd></div><div><dt>{t.objectId}</dt><dd><bdi>{row.objectId}</bdi></dd></div><div><dt>{t.requestId}</dt><dd><bdi>{row.requestId}</bdi></dd></div></dl></details></article>;
  })}</div>;
}
