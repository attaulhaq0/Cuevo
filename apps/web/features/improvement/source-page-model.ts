import type { LearningApiError } from '../../shared/api/client';
type SourcePage<T> = { data: T[]; error: LearningApiError | null; moreError: LearningApiError | null };
export function sourcePageDenied(source: Pick<SourcePage<unknown>, 'error' | 'moreError'>): boolean { return [source.error, source.moreError].some(error => !!error && ['denied', 'unauthorized'].includes(error.kind)); }
export function admittedSourceRows<T>(source: SourcePage<T>): T[] { return sourcePageDenied(source) ? [] : source.data; }
