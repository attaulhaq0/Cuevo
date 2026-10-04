import type { SchoolAuditRow } from './model';
import { auditActions, auditFixtureActions, auditSourceTypes, auditEn, auditAr } from './audit-messages';

function caption(map: Readonly<Record<string, readonly [string, string]>>, value: string, locale: 'en' | 'ar', unavailable: string) {
  return Object.hasOwn(map, value) ? map[value][locale === 'ar' ? 1 : 0] : unavailable;
}
function human(value: string | null, unavailable: string) { return value?.trim() || unavailable; }
/** Format only admitted row facts. Unknown source context never becomes an identifier. */
export function auditPresentation(row: SchoolAuditRow, locale: 'en' | 'ar') {
  const t = locale === 'ar' ? auditAr : auditEn;
  const actions = row.objectType === 'reference_fixture' ? auditFixtureActions : auditActions;
  return { title: caption(actions, row.action, locale, t.actionUnavailable), actor: human(row.actorName, t.personUnavailable), source: human(row.objectName, t.sourceUnavailable), kind: caption(auditSourceTypes, row.objectType, locale, t.typeUnavailable), status: t[row.outcome] };
}
