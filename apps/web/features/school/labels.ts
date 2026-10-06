import type { SchoolRow } from './model.ts';
export function schoolRecordName(id: unknown, rows: SchoolRow[], unknown: string): string {
  const row = rows.find(item => item.id === id);
  return row && typeof (row.displayName ?? row.name) === 'string' ? String(row.displayName ?? row.name) : unknown;
}
export function schoolClassName(row: SchoolRow, years: SchoolRow[], groups: SchoolRow[], unknown: string): string {
  return [String(row.name ?? unknown), typeof row.yearGroupName==='string'?row.yearGroupName:schoolRecordName(row.yearGroupId, groups, unknown), typeof row.academicYearName==='string'?row.academicYearName:schoolRecordName(row.academicYearId, years, unknown)].join(' · ');
}
