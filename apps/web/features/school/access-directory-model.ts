import type { SchoolPerson, SchoolRow } from './model';
import { schoolPersonChoices } from './selection';
import { schoolRelationshipDisplays, type SchoolRelationshipDisplay } from './relationship-display';

export type AccessDirectoryKind = 'person' | 'enrollment' | 'assignment' | 'guardian';
export type AccessDirectoryRow = { id: string; title: string; context: string; status: unknown; source: SchoolRow; requiresReview?: boolean; relationship?: SchoolRelationshipDisplay };
function known(value: unknown, unavailable: string) { return typeof value === 'string' && value.trim() ? value.trim() : unavailable; }
/** The visible directory and change controls share the complete source identity rules. */
export function schoolAccessDirectoryRows(kind: AccessDirectoryKind, rows: SchoolRow[], people: SchoolPerson[], classes: SchoolRow[], subjects: SchoolRow[], locale: 'en' | 'ar', complete: boolean): AccessDirectoryRow[] {
  const unavailable = locale === 'ar' ? 'سياق الهوية الحالي غير متاح' : 'Current identity context unavailable';
  if (kind === 'person') {
    const choices = schoolPersonChoices(people, locale);
    return rows.map(source => ({ id: source.id, title: known(source.displayName, unavailable), context: choices.find(choice => choice.value === source.id)?.label ?? unavailable, status: source.status, source, requiresReview: choices.find(choice => choice.value === source.id)?.requiresReview !== false }));
  }
  const displays = schoolRelationshipDisplays(kind, rows, people, classes, subjects, locale);
  const t = locale === 'ar' ? { class: 'الصف', group: 'المستوى الدراسي', year: 'العام الدراسي', subject: 'المادة', relationship: 'العلاقة' } : { class: 'Class', group: 'Year group', year: 'Academic year', subject: 'Subject', relationship: 'Relationship' };
  return rows.map((source, index) => {
    const display = displays[index];
    const context = [kind === 'guardian' ? `${t.relationship}: ${display.relationshipType ?? unavailable}` : `${t.class}: ${display.className ?? unavailable} · ${t.group}: ${display.yearGroupName ?? unavailable} · ${t.year}: ${display.academicYearName ?? unavailable}`, ...(kind === 'assignment' ? [`${t.subject}: ${display.subjectName ?? unavailable}`] : []), `${display.effectiveFrom ?? unavailable} – ${display.effectiveTo ?? '—'}`].join(' · ');
    return { id: source.id, title: display.title, context, status: display.status, source, requiresReview: !complete || display.requiresReview, relationship: display };
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
