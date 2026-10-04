import type { LearningApiError } from '../../shared/api/client';
type SourcePage<T> = { data: T[]; error: LearningApiError | null; moreError: LearningApiError | null };
export type ImprovementSourceDenial = { scope: string; error: LearningApiError };
export function currentImprovementDenial(previous: ImprovementSourceDenial | null, scope: string, source: Pick<SourcePage<unknown>, 'error' | 'moreError'>): ImprovementSourceDenial | null {
  const error = [source.error, source.moreError].find(error => error?.kind === 'denied' || error?.kind === 'unauthorized');
  return error ? previous?.scope === scope && previous.error === error ? previous : { scope, error } : previous?.scope === scope ? previous : null;
}
export function sourcePageDenied(source: Pick<SourcePage<unknown>, 'error' | 'moreError'>): boolean { return [source.error, source.moreError].some(error => !!error && ['denied', 'unauthorized'].includes(error.kind)); }
export function admittedSourceRows<T>(source: SourcePage<T>, denial: ImprovementSourceDenial | null = null): T[] { return denial || sourcePageDenied(source) ? [] : source.data; }
