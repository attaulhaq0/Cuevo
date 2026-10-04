import { academicReportSchema, conversationResponseSchema } from '@cuevo/contracts';
import { LearningApiError } from '../../shared/api/client.ts';
export type ParentHomeReadContext={apiUrl:string;membership:{schoolId:string;userId:string;role:string}|null;accessToken:string|null;accessGeneration:number;online:boolean;status:string};
export type ParentHomeRead<T>={scope:string|null;value:T};
export function parentHomeReadScope(context:ParentHomeReadContext,childId:string|null,path:string|null,refresh:number):string|null {
 if(!childId||!path||!context.online||context.status!=='ready'||context.membership?.role!=='parent'||!context.accessToken)return null;
 return JSON.stringify([context.apiUrl,context.membership.schoolId,context.membership.userId,context.membership.role,context.accessToken,context.accessGeneration,childId,path,refresh]);
}
export function currentParentHomeRead<T>(response:ParentHomeRead<T>|null|undefined,scope:string|null):T|null{return scope&&response?.scope===scope?response.value:null;}
export function parseParentHomeReport(value:unknown,schoolId:string,childId:string) {
 const parsed=academicReportSchema.safeParse(value);if(!parsed.success||parsed.data.scope!=='CURRENT_RELEASED_PAGE'||parsed.data.schoolId!==schoolId||parsed.data.learnerId!==childId||parsed.data.items.some(item=>item.learnerId!==childId||item.parentVisible!==true))throw new LearningApiError('invalid');return parsed.data;
}
export function parseParentHomeConversation(value:unknown,parentId:string,childId:string) {
 const parsed=conversationResponseSchema.safeParse(value);if(!parsed.success||parsed.data.parentId!==parentId||parsed.data.learnerId!==childId||parsed.data.canModerate)throw new LearningApiError('invalid');return parsed.data;
}
export function appendParentHomeReportPage(items:ReturnType<typeof parseParentHomeReport>['items'],page:ReturnType<typeof parseParentHomeReport>,cursor:string,seenCursors:string[]=[]) {
 if(page.nextCursor===cursor||page.nextCursor&&seenCursors.includes(page.nextCursor)||page.items.some(item=>items.some(previous=>previous.id===item.id)))throw new LearningApiError('invalid');return {items:[...items,...page.items],nextCursor:page.nextCursor};
}
/** Completeness applies to this current report only, never to another source. */
export function parentHomeReportComplete(source:{loaded:boolean;loading:boolean;error:LearningApiError|null;nextCursor:string|null;moreError:LearningApiError|null}):boolean {
 return source.loaded&&!source.loading&&!source.error&&!source.nextCursor&&!source.moreError;
}
export function parentHomeEventContext(event:{classId:string|null;className?:unknown},labels:{schoolWide:string;classUnknown:string}):string {
 if(event.classId===null)return labels.schoolWide;
 return typeof event.className==='string'&&event.className.trim()?event.className:labels.classUnknown;
}
export type ParentHomeSourceState={loaded:boolean;loading:boolean;error:LearningApiError|null;moreError:LearningApiError|null};
export type ParentHomeSourceDenial={scope:string;error:LearningApiError};
/** A continuation retry cannot make a denied page current by clearing its error. */
export function parentHomeSourceDenial(previous:ParentHomeSourceDenial|null,scope:string|null,source:ParentHomeSourceState):ParentHomeSourceDenial|null {
 if(!scope)return null;
 const error=[source.error,source.moreError].find(error=>error?.kind==='denied'||error?.kind==='unauthorized');
 if(error)return previous?.scope===scope&&previous.error===error?previous:{scope,error};
 return previous?.scope===scope?previous:null;
}
export function parentHomeSourceUsable(source:ParentHomeSourceState,denial:ParentHomeSourceDenial|null):boolean {
 return source.loaded&&!source.loading&&!source.error&&!denial&&source.moreError?.kind!=='denied'&&source.moreError?.kind!=='unauthorized';
}
