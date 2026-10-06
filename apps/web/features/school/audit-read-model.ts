import type { LearningApiError } from '../../shared/api/client';

type AuditRead<T> = { data: T[]; loading: boolean; error: LearningApiError | null; moreError: LearningApiError | null };
export type AuditDenial = { scope: string; error: LearningApiError };
/** Local React ownership key only; never rendered or persisted as audit content. */
export function auditReadFrame(context: { apiUrl: string; membership: { schoolId: string; userId: string; role: string } | null; accessToken: string | null; accessGeneration: number; online: boolean; status: string }): string {
  return JSON.stringify([context.apiUrl, context.membership?.schoolId, context.membership?.userId, context.membership?.role, context.accessToken, context.accessGeneration, context.online, context.status]);
}

/** Retain refusal, never record content: clearing a continuation error does not renew source access. */
export function currentAuditDenial(previous: AuditDenial | null, scope: string, source: Pick<AuditRead<unknown>, 'error' | 'moreError'>): AuditDenial | null {
  const error = [source.error, source.moreError].find(value => value?.kind === 'denied' || value?.kind === 'unauthorized');
  if (error) return previous?.scope === scope && previous.error === error ? previous : { scope, error };
  return previous?.scope === scope ? previous : null;
}
export function admittedAuditRows<T>(source: AuditRead<T>, denial: AuditDenial | null): T[] {
  return source.loading || source.error || denial || source.moreError?.kind === 'denied' || source.moreError?.kind === 'unauthorized' ? [] : source.data;
}

type AuditPageRead<T> = AuditRead<T> & { loaded: boolean; loadingMore: boolean; nextCursor: string | null };
/** Page metadata only. The existing query retains the one admitted record source. */
export type AuditPages<T extends { id: string }> = {
  scope: string; pages: { ids: string[]; nextCursor: string | null }[];
  index: number; pendingNext: boolean; sourceData: T[] | null;
};
function emptyAuditPages<T extends { id: string }>(scope: string): AuditPages<T> {
  return { scope, pages: [], index: 0, pendingNext: false, sourceData: null };
}
export function currentAuditPages<T extends { id: string }>(previous: AuditPages<T> | null, scope: string, source: AuditPageRead<T>, denial: AuditDenial | null): AuditPages<T> {
  const current = previous?.scope === scope ? previous : emptyAuditPages<T>(scope);
  if (!source.loaded || source.loading || source.error || denial || source.moreError?.kind === 'denied' || source.moreError?.kind === 'unauthorized') {
    return current.pages.length || current.pendingNext || current.sourceData ? emptyAuditPages<T>(scope) : current;
  }
  if (!current.pages.length) {
    return { ...current, pages: [{ ids: source.data.map(row => row.id), nextCursor: source.nextCursor }], sourceData: source.data };
  }
  if (source.moreError) return current.pendingNext ? { ...current, pendingNext: false } : current;
  if (source.loadingMore || source.data === current.sourceData) return current;
  if (!current.pendingNext) return { ...current, sourceData: source.data };
  const admittedIds = new Set(current.pages.flatMap(page => page.ids));
  const page = { ids: source.data.filter(row => !admittedIds.has(row.id)).map(row => row.id), nextCursor: source.nextCursor };
  return { ...current, pages: [...current.pages, page], index: current.pages.length, pendingNext: false, sourceData: source.data };
}
export function navigateAuditPage<T extends { id: string }>(state: AuditPages<T>, direction: 'previous' | 'next'): AuditPages<T> {
  if (!state.pages.length || state.pendingNext) return state;
  if (direction === 'previous') return state.index ? { ...state, index: state.index - 1 } : state;
  if (state.index < state.pages.length - 1) return { ...state, index: state.index + 1 };
  return state.pages[state.index].nextCursor ? { ...state, pendingNext: true } : state;
}
export function auditPageRows<T extends { id: string }>(state: AuditPages<T>, rows: T[]): T[] {
  const ids = state.pages[state.index]?.ids ?? [];
  const source = new Map(rows.map(row => [row.id, row]));
  return ids.flatMap(id => source.has(id) ? [source.get(id)!] : []);
}
