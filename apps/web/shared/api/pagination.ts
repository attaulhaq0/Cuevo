import { LearningApiError } from './client.ts';

export type Page<T> = { items: T[]; nextCursor: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePage<T>(value: unknown, parse: (item: unknown) => T): Page<T> {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || value.items.length > 100 || !('nextCursor' in value) || (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !uuid.test(value.nextCursor)))) throw new LearningApiError('invalid');
  return { items: value.items.map(parse), nextCursor: value.nextCursor as string | null };
}
export function pagePath(path: string, cursor: string | null): string {
  if (!cursor) return path;
  if (!uuid.test(cursor)) throw new LearningApiError('invalid');
  const url = new URL(path, 'https://cuevo.invalid');
  url.searchParams.set('cursor', cursor);
  return `${url.pathname}${url.search}`;
}
export class PageAccumulator<T extends { id: string }> {
  context = '';
  private seenCursors = new Set<string>();
  items: T[] = [];
  nextCursor: string | null = null;
  reset(context: string) { this.context = context; this.items = []; this.nextCursor = null; this.seenCursors.clear(); }
  apply(context: string, cursor: string | null, page: Page<T>) {
    if (context !== this.context || (cursor !== null && cursor !== this.nextCursor)) return false;
    if (cursor && (page.nextCursor === cursor || (page.nextCursor !== null && this.seenCursors.has(page.nextCursor)))) throw new LearningApiError('invalid');
    const records = new Map((cursor === null ? [] : this.items).map((item) => [item.id, item]));
    for (const item of page.items) records.set(item.id, item);
    if (cursor) this.seenCursors.add(cursor);
    this.items = [...records.values()]; this.nextCursor = page.nextCursor; return true;
  }
}
