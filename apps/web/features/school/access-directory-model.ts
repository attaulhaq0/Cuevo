import type { SchoolPerson, SchoolRow } from './model';

export type AccessDirectoryKind = 'person' | 'enrollment' | 'assignment' | 'guardian';
export type AccessDirectoryRow = { id: string; title: string; context: string; status: unknown; source: SchoolRow };
function known(value: unknown, unavailable: string) { return typeof value === 'string' && value.trim() ? value.trim() : unavailable; }
export function accessDirectoryRows(kind: AccessDirectoryKind, rows: SchoolRow[], names: Record<string, string>, roles: Record<string, string>, unavailable: string): AccessDirectoryRow[] {
  return rows.map(source => {
    if (kind === 'person') return { id: source.id, title: known(source.displayName, unavailable), context: known(roles[String(source.role)], unavailable), status: source.status, source };
    const primary = kind === 'guardian' ? source.parentId : kind === 'assignment' ? source.teacherId : source.studentId;
    const secondary = kind === 'guardian' ? source.studentId : source.classId;
    const title = known(names[String(primary)], unavailable);
    const context = [known(names[String(secondary)], unavailable), ...(kind === 'assignment' ? [known(names[String(source.subjectId)], unavailable)] : [])].join(' · ');
    return { id: source.id, title, context, status: source.status, source };
  });
}
export function filterAccessDirectory(rows: AccessDirectoryRow[], query: string, locale: 'en' | 'ar') {
  const text = query.trim().toLocaleLowerCase(locale);
  return text ? rows.filter(row => `${row.title} ${row.context}`.toLocaleLowerCase(locale).includes(text)) : rows;
}
export function currentAccessDirectoryRow(rows: AccessDirectoryRow[], id: string | null) {
  const matches = id ? rows.filter(row => row.id === id) : [];
  return matches.length === 1 ? matches[0] : null;
}
export function recoveredAccessRelationship(kind: Exclude<AccessDirectoryKind, 'person'>, body: Record<string, unknown>, rows: SchoolRow[]) {
  const keys = kind === 'guardian' ? ['parentId', 'studentId'] : kind === 'assignment' ? ['classId', 'subjectId', 'teacherId'] : ['classId', 'studentId'];
  const matches = rows.filter(row => keys.every(key => typeof body[key] === 'string' && row[key] === body[key]));
  return matches.length === 1 ? matches[0] : null;
}
export function currentAccessPerson(people: SchoolPerson[], id: string) { const rows = people.filter(row => row.id === id); return rows.length === 1 ? rows[0] : undefined; }
