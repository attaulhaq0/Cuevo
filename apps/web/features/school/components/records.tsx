'use client';
import type { SchoolRow } from '../model';
import { useApp } from '../../../shared/session/providers';
import { schoolAr, schoolEn } from '../messages';

export function SchoolRecords({ title, rows, columns, names = {} }: { title: string; rows: SchoolRow[]; columns: { key: string; label: string }[]; names?: Record<string, string> }) {
  const { locale, dictionary } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn;
  const labels: Record<string, string> = { active: t.active, suspended: t.suspended, revoked: t.revoked, pending: t.pending, completed: t.completed, present: t.present, absent: t.absent, late: t.late, excused: t.excused };
  function display(row: SchoolRow, key: string) {
    const value = row[key]; if (value === null || value === undefined) return '—';
    if (key.endsWith('Id')) {
      const labelKey = key === 'learnerId' || key === 'studentId' ? 'learnerName' : key.replace(/Id$/, 'Name');
      const sourceLabel = row[labelKey];
      return typeof sourceLabel === 'string' && sourceLabel.trim() ? [sourceLabel, ...(key === 'classId' && row.academicYearName ? [row.academicYearName] : [])].join(' · ') : names[String(value)] ?? t.nameUnavailable;
    }
    if (typeof value === 'boolean') return value ? t.approved : t.notEnabled;
    if (key === 'role' && ['admin', 'coordinator', 'teacher', 'student', 'parent'].includes(String(value))) return dictionary.roles[value as keyof typeof dictionary.roles];
    if (key === 'dayOfWeek' && typeof value === 'number') return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + value)));
    if (typeof value === 'number') return new Intl.NumberFormat(locale).format(value);
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\d(?:T|$)/.test(value) && Number.isFinite(Date.parse(value))) return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...(value.includes('T') ? { timeStyle: 'short' as const } : { timeZone: 'UTC' }) }).format(new Date(value));
    return labels[String(value)] ?? String(value);
  }
  return <section className="school-section" aria-label={title}><h2>{title}</h2>{rows.length ? <div className="school-table-scroll" tabIndex={0} role="region" aria-label={`${title} — ${t.scrollTable}`}><table><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{columns.map(column => <td key={column.key}><bdi>{display(row, column.key)}</bdi></td>)}</tr>)}</tbody></table></div> : <p className="learning-empty">{t.empty}</p>}</section>;
}
