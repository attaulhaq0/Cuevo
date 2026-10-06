import type { SchoolPerson, SchoolRow } from './model';
import { schoolPersonChoices } from './selection';
import { schoolRelationshipDisplays, type SchoolRelationshipDisplay } from './relationship-display';
import type { LearningApiError } from '../../shared/api/client';

export type AccessDirectoryKind = 'person' | 'enrollment' | 'assignment' | 'guardian';
export type AccessDirectoryRow = { id: string; title: string; context: string; status: unknown; source: SchoolRow; requiresReview?: boolean; relationship?: SchoolRelationshipDisplay };
export type AccessDirectorySource = { context: string; loaded: boolean; loading: boolean; loadingMore: boolean; nextCursor: string | null; error: LearningApiError | null; moreError: LearningApiError | null; loadMore?: () => void };
export type AccessDirectoryPage = { scope: string; sourceContext: string; index: number; pendingCursor: string | null; loadedCount: number; denied: LearningApiError | null };
export const accessDirectoryPageSize = 25;
/** Private browse intent only. Current source rows remain owned by the existing query. */
export function currentAccessDirectoryPage(previous: AccessDirectoryPage | null, scope: string, count: number, source?: AccessDirectorySource): AccessDirectoryPage {
  const sourceContext=source?.context??scope;
  const current = previous?.scope === scope ? previous : { scope, sourceContext, index: 0, pendingCursor: null, loadedCount: count, denied: previous?.sourceContext===sourceContext?previous.denied:null };
  const denied = [source?.error, source?.moreError].find(error => error?.kind === 'denied' || error?.kind === 'unauthorized') ?? current.denied;
  if (denied || source && (!source.loaded || source.loading || source.error)) return current.index===0&&!current.pendingCursor&&current.loadedCount===count&&current.denied===denied?current:{ ...current, index: 0, pendingCursor: null, loadedCount: count, denied };
  const maxIndex = Math.max(0, Math.ceil(count / accessDirectoryPageSize) - 1);
  const settled = current.pendingCursor && source && !source.loadingMore && !source.moreError && source.nextCursor !== current.pendingCursor;
  const index = Math.min(maxIndex, settled && count > current.loadedCount ? current.index + 1 : current.index);
  const pendingCursor = current.pendingCursor && (source?.moreError || settled) ? null : current.pendingCursor;
  return index === current.index && pendingCursor === current.pendingCursor && count === current.loadedCount ? current : { ...current, index, pendingCursor, loadedCount: count };
}
export function navigateAccessDirectoryPage(state: AccessDirectoryPage, direction: 'previous' | 'next', count: number, source?: AccessDirectorySource): AccessDirectoryPage {
  if (state.pendingCursor || state.denied || source?.loading || source?.loadingMore || source?.error) return state;
  if (direction === 'previous') return state.index ? { ...state, index: state.index - 1 } : state;
  if ((state.index + 1) * accessDirectoryPageSize < count) return { ...state, index: state.index + 1 };
  return source?.nextCursor ? { ...state, pendingCursor: source.nextCursor, loadedCount: count } : state;
}
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
