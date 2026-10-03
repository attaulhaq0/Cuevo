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
