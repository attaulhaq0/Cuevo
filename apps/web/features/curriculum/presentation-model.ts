/** These are workflow markers, not curriculum version identities. */
import type { Reference, Version } from './model';
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
export function curriculumReferenceContext(reference:Reference,versions:readonly Version[],references:readonly Reference[],versionReady:boolean,referenceReady:boolean){
 const sources=versionReady?versions.filter(item=>item.id===reference.packVersionId&&[item.framework,item.programme,item.version,item.scope].every(value=>!!value.trim())):[];
 const parents=referenceReady&&reference.parentId?references.filter(item=>item.id===reference.parentId&&item.packVersionId===reference.packVersionId&&!!item.title.trim()):[];
 return{source:sources.length===1?sources[0]:null,parent:parents.length===1?parents[0]:null,noParent:reference.parentId===null,needsSource:sources.length!==1,needsParent:reference.parentId!==null&&parents.length!==1};
}
