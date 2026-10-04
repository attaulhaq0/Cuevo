import type { LearningApiError } from '../../shared/api/client';

type AuditRead<T> = { data: T[]; loading: boolean; error: LearningApiError | null; moreError: LearningApiError | null };
export type AuditDenial = { scope: string; error: LearningApiError };

/** Retain refusal, never record content: clearing a continuation error does not renew source access. */
export function currentAuditDenial(previous: AuditDenial | null, scope: string, source: Pick<AuditRead<unknown>, 'error' | 'moreError'>): AuditDenial | null {
  const error = [source.error, source.moreError].find(value => value?.kind === 'denied' || value?.kind === 'unauthorized');
  if (error) return previous?.scope === scope && previous.error === error ? previous : { scope, error };
  return previous?.scope === scope ? previous : null;
}
export function admittedAuditRows<T>(source: AuditRead<T>, denial: AuditDenial | null): T[] {
  return source.loading || source.error || denial || source.moreError?.kind === 'denied' || source.moreError?.kind === 'unauthorized' ? [] : source.data;
}
