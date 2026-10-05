import type { LearningApiError } from '../../shared/api/client';
type SourcePage<T> = { data: T[]; error: LearningApiError | null; moreError: LearningApiError | null };
export type ImprovementSourceDenial = { scope: string; error: LearningApiError };
export function currentImprovementDenial(previous: ImprovementSourceDenial | null, scope: string, source: Pick<SourcePage<unknown>, 'error' | 'moreError'>): ImprovementSourceDenial | null {
  const error = [source.error, source.moreError].find(error => error?.kind === 'denied' || error?.kind === 'unauthorized');
  return error ? previous?.scope === scope && previous.error === error ? previous : { scope, error } : previous?.scope === scope ? previous : null;
}
export function sourcePageDenied(source: Pick<SourcePage<unknown>, 'error' | 'moreError'>): boolean { return [source.error, source.moreError].some(error => !!error && ['denied', 'unauthorized'].includes(error.kind)); }
export function admittedSourceRows<T>(source: SourcePage<T>, denial: ImprovementSourceDenial | null = null): T[] { return denial || sourcePageDenied(source) ? [] : source.data; }

/** A current query or an explicitly admitted exact array supplies list certainty. */
export type ImprovementListSource = { kind: 'known-array' } | { loaded: boolean; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null };
export function improvementListFailure(source?: ImprovementListSource): LearningApiError | null {
  return source && !('kind' in source) ? [source.error,source.moreError].find(error=>error?.kind==='denied'||error?.kind==='unauthorized') ?? source.error ?? source.moreError ?? null : null;
}
export function improvementListState(source?: ImprovementListSource): 'complete' | 'loading' | 'unknown' | 'denied' | 'error' {
  if (source && 'kind' in source) return source.kind === 'known-array' && Object.keys(source).length === 1 ? 'complete' : 'unknown';
  if (!source) return 'unknown';
  if (sourcePageDenied(source)) return 'denied';
  if (source.error) return 'error';
  if (source.loading === true) return 'loading';
  return source.loaded === true && source.loading === false && source.loadingMore === false && source.error === null && source.moreError === null && source.nextCursor === null ? 'complete' : 'unknown';
}
