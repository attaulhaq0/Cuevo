/** These are workflow markers, not curriculum version identities. */
export function curriculumVersionLabel(version: string, labels: { unknown: string; requiresReview: string; restricted: string }): string {
  if (version === 'REQUIRES_REVIEW') return labels.requiresReview;
  if (version === 'UNKNOWN') return labels.unknown;
  if (version === 'SOURCE_RESTRICTED') return labels.restricted;
  return version;
}
export function curriculumPageControlsVisible(query: { loading?: boolean; loadingMore?: boolean; error?: unknown; moreError?: unknown; nextCursor?: string | null }): boolean {
  return !!(query.loading || query.loadingMore || query.error || query.moreError || query.nextCursor);
}
export function curriculumPageConfirmedEmpty(query:{loaded:boolean;loading:boolean;loadingMore:boolean;error:unknown;moreError:unknown;nextCursor:string|null;data:readonly unknown[]}):boolean{
 return query.loaded&&!query.loading&&!query.loadingMore&&!query.error&&!query.moreError&&query.nextCursor===null&&query.data.length===0;
}
