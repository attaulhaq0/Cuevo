import { z } from 'zod';
import { conversationReportSchema,conversationModerationSchema,conversationStateSchema,conversationCreateSchema,type ConversationChoice } from '@cuevo/contracts';
import type {Command} from '../../shared/api/client.ts';
const intentSchema=z.object({id:z.uuid(),learnerId:z.uuid(),parentId:z.uuid(),teacherId:z.uuid(),classId:z.uuid(),subjectId:z.uuid()}).strict();
const actionSchema=z.discriminatedUnion('kind',[
 z.object({id:z.uuid(),kind:z.literal('report'),version:z.number().int().nonnegative(),target:z.null()}).strict(),
 z.object({id:z.uuid(),kind:z.literal('moderate'),version:z.number().int().nonnegative(),target:z.enum(['HIDE','RESTORE'])}).strict(),
 z.object({id:z.uuid(),kind:z.literal('state'),version:z.number().int().nonnegative(),target:z.enum(['OPEN','PAUSED'])}).strict(),
]);
export type ConversationIntent=z.infer<typeof intentSchema>;
export type ConversationAction=z.infer<typeof actionSchema>;
export function conversationChildCurrent<T extends {id:string}>(child:T|undefined,query:{loaded:boolean;loading:boolean;loadingMore:boolean;error:unknown;moreError:unknown}):T|null{
 return child&&query.loaded&&!query.loading&&!query.loadingMore&&!query.error&&!query.moreError?child:null;
}
export function conversationChildMatches(source:{learnerId:string}|null,childId:string|null):boolean{return !!childId&&source?.learnerId===childId;}
export function recoverConversationChoice(command:Command|undefined,choices:readonly ConversationChoice[]):ConversationChoice|null{
 if(command?.path!=='/v1/community/conversations')return null;const input=conversationCreateSchema.safeParse(command.body);if(!input.success)return null;
 const matching=choices.filter(choice=>(['learnerId','parentId','teacherId','classId','subjectId'] as const).every(key=>choice[key]===input.data[key]));return matching.length===1?matching[0]:null;
}
export function recoverConversationAction(commands:readonly Command[],threadId:string,messages:readonly{id:string;moderationVersion:number}[]):ConversationAction|null{
 const actions=commands.flatMap<ConversationAction>(command=>{
  if(command.path===`/v1/community/conversations/${threadId}/state`){const input=conversationStateSchema.safeParse(command.body);return input.success?[{id:threadId,kind:'state',version:input.data.expectedVersion,target:input.data.state}]:[];}
  const match=command.path.match(/^\/v1\/community\/conversations\/messages\/([^/]+)\/(report|moderate)$/),source=match?messages.find(message=>message.id===match[1]):null;if(!match||!source)return[];
  if(match[2]==='report'){const input=conversationReportSchema.safeParse(command.body);return input.success?[{id:source.id,kind:'report',version:source.moderationVersion,target:null}]:[];}
  const input=conversationModerationSchema.safeParse(command.body);return input.success?[{id:source.id,kind:'moderate',version:input.data.expectedVersion,target:input.data.action}]:[];
 });return actions.length===1?actions[0]:null;
}
export function parseConversationIntent(value:unknown):ConversationIntent|null{const parsed=intentSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function parseConversationAction(value:unknown):ConversationAction|null{const parsed=actionSchema.safeParse(value);return parsed.success?parsed.data:null;}
