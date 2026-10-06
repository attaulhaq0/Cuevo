import { z } from 'zod';
import { LearningApiError } from '../../shared/api/client.ts';
import { parseSchedule, type ScheduleRow } from './model.ts';

export function parentCalendarDay(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;
}
export function parentCalendarMoveMonth(day: string, offset: number): string | null {
  if (!parentCalendarDay(day) || !Number.isInteger(offset)) return null;
  const source = new Date(`${day}T00:00:00Z`), month = source.getUTCMonth() + offset;
  const last = new Date(Date.UTC(source.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(source.getUTCFullYear(), month, Math.min(source.getUTCDate(), last))).toISOString().slice(0, 10);
}
export function parentCalendarMonthDays(day: string): { day: string; inMonth: boolean }[] {
  if (!parentCalendarDay(day)) return [];
  const source = new Date(`${day}T00:00:00Z`), first = Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7, count = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => { const current = new Date(first + (index - offset) * 86400000).toISOString().slice(0, 10); return { day: current, inMonth: current.slice(0, 7) === day.slice(0, 7) }; });
}
export function parseParentCalendarEvent(value: unknown): ScheduleRow {
  const event = parseSchedule(value);
  if (!z.iso.datetime({ offset: true }).safeParse(event.startsAt).success || !z.iso.datetime({ offset: true }).safeParse(event.endsAt).success) throw new LearningApiError('invalid');
  return event;
}
/** Events are admitted current rows, never a source authorization. Calendar
 * windows are [start, end); midnight end does not add a later event date. */
export function parentCalendarEventsForDay(events: readonly ScheduleRow[], day: string): ScheduleRow[] {
  if (!parentCalendarDay(day)) return [];
  const start = Date.parse(`${day}T00:00:00Z`), end = start + 86400000;
  return events.map(parseParentCalendarEvent).filter(event => event.recordState !== 'CANCELLED' && event.parentVisible !== false && Date.parse(event.startsAt) < end && Date.parse(event.endsAt) > start).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
}
export function parentCalendarEventScope(event: ScheduleRow, labels: { schoolWide: string; unavailable: string }): string {
  return event.classId === null ? labels.schoolWide : typeof event.className === 'string' && event.className.trim() ? event.className : labels.unavailable;
}
export type ParentCalendarEventSelection = { childId: string; eventId: string; revision: number | null };
export function parentCalendarEventSelection(childId: string, event: ScheduleRow): ParentCalendarEventSelection {
  return { childId, eventId: event.id, revision: Number.isInteger(event.revision) && Number(event.revision) > 0 ? Number(event.revision) : null };
}
export function currentParentCalendarEvent(selection: ParentCalendarEventSelection | null, childId: string, events: readonly ScheduleRow[], day: string): ScheduleRow | null {
  if (!selection || selection.childId !== childId) return null;
  const matches = parentCalendarEventsForDay(events, day).filter(event => event.id === selection.eventId && parentCalendarEventSelection(childId, event).revision === selection.revision);
  return matches.length === 1 ? matches[0] : null;
}
export type ParentCalendarSource = { loaded: boolean; loading: boolean; loadingMore?: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null };
export function parentCalendarSourceDenied(source: Pick<ParentCalendarSource,'error'|'moreError'>): boolean {
  return [source.error,source.moreError].some(error=>error?.kind==='denied'||error?.kind==='unauthorized');
}
export function parentCalendarDayEvidence(source: ParentCalendarSource, events: readonly ScheduleRow[], day: string): { count: number | null; partial: boolean } {
  if (source.loading || !source.loaded || source.error || parentCalendarSourceDenied(source) || !parentCalendarDay(day)) return { count: null, partial: true };
  return { count: parentCalendarEventsForDay(events, day).length, partial: !!(source.nextCursor || source.moreError || source.loadingMore) };
}
export function parentCalendarDateState(source: ParentCalendarSource, events: readonly ScheduleRow[], day: string): 'loading' | 'unavailable' | 'choose-date' | 'events' | 'partial-empty' | 'empty' {
  if (source.loading || !source.loaded && !source.error) return 'loading';
  if (source.error || parentCalendarSourceDenied(source)) return 'unavailable';
  if (!parentCalendarDay(day)) return 'choose-date';
  if (parentCalendarEventsForDay(events, day).length) return 'events';
  return source.nextCursor || source.moreError || source.loadingMore ? 'partial-empty' : 'empty';
}
