import type { SchoolPerson, SchoolRow } from './model.ts';
const copy = {
  en: { class: 'Class', group: 'Year group', year: 'Academic year', none: 'No current enrollment', unknown: 'Current identity context unavailable', ordinal: 'Year group order', roles: { student: 'Student', teacher: 'Teacher', parent: 'Parent or guardian', admin: 'Administrator', coordinator: 'Coordinator' } },
  ar: { class: 'الصف', group: 'المستوى الدراسي', year: 'العام الدراسي', none: 'لا يوجد تسجيل حالي', unknown: 'سياق الهوية الحالي غير متاح', ordinal: 'ترتيب المستوى الدراسي', roles: { student: 'طالب', teacher: 'معلم', parent: 'ولي أمر', admin: 'مسؤول المدرسة', coordinator: 'منسق' } },
};
export type SchoolSelectionChoice = { value: string; label: string; requiresReview: boolean };
function key(label: string) { return label.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); }
function checkDuplicates(choices: SchoolSelectionChoice[]) {
  const counts = new Map<string, number>(); for (const choice of choices) counts.set(key(choice.label), (counts.get(key(choice.label)) ?? 0) + 1);
  return choices.map(choice => ({ ...choice, requiresReview: choice.requiresReview || (counts.get(key(choice.label)) ?? 0) > 1 }));
}
export function schoolPersonChoices(people: SchoolPerson[], locale: 'en' | 'ar'): SchoolSelectionChoice[] {
  const t = copy[locale];
  return checkDuplicates(people.map(person => ({ value: person.id, requiresReview: person.selectionContext?.status !== 'READY', label: [person.displayName||t.unknown, t.roles[person.role], ...(person.selectionContext?.enrollmentState === 'CURRENT' ? person.selectionContext.classes.map(context => `${t.class}: ${context.className} · ${t.group}: ${context.yearGroupName} · ${t.year}: ${context.academicYearName}`) : [person.selectionContext?.enrollmentState === 'NONE' ? t.none : t.unknown])].join(' · ') })));
}
export function schoolRecordChoices(rows: SchoolRow[], resource: 'years' | 'year-groups' | 'classes' | 'terms' | 'subjects', locale: 'en' | 'ar'): SchoolSelectionChoice[] {
  const t = copy[locale]; const numbers = new Intl.NumberFormat(locale); const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : t.unknown;
  return checkDuplicates(rows.map(row => ({ value: row.id, requiresReview: row.selectionStatus !== 'READY', label: resource === 'classes' ? `${t.class}: ${row.name} · ${t.group}: ${row.yearGroupName ?? t.unknown} · ${t.year}: ${row.academicYearName ?? t.unknown}` : [String(row.name ?? t.unknown), ...(resource === 'years' || resource === 'terms' ? [...(resource === 'terms' ? [`${t.year}: ${row.academicYearName ?? t.unknown}`] : []), `${date(row.startsOn)} – ${date(row.endsOn)}`] : resource === 'year-groups' ? [`${t.ordinal}: ${typeof row.ordinal === 'number' ? numbers.format(row.ordinal) : t.unknown}`] : [])].join(' · ') })));
}
