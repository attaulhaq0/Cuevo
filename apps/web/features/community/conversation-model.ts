import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { conversationPolicySchema, conversationChoiceSchema, conversationResponseSchema, conversationMessageResponseSchema, conversationReportResponseSchema, conversationPolicyInputSchema, conversationCreateSchema, conversationMessageSchema, conversationReadSchema, conversationReportSchema, conversationModerationSchema, conversationStateSchema, type ParentConversation, type ConversationChoice, type ConversationMessage } from '@cuevo/contracts';
export type { ConversationChoice, ParentConversation, ConversationMessage } from '@cuevo/contracts';
export const parseConversationPolicy=(value:unknown)=>{const parsed=conversationPolicySchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseConversationChoice=(value:unknown)=>{const parsed=conversationChoiceSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseParentConversation=(value:unknown)=>{const parsed=conversationResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseConversationMessage=(value:unknown)=>{const parsed=conversationMessageResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseConversationReport=(value:unknown)=>{const parsed=conversationReportResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export type ConversationReadContext={apiUrl:string;membership:{schoolId:string;userId:string;role:string;entitlements:string[]}|null;accessToken:string|null;accessGeneration:number;online:boolean;status:string};
export type ConversationRead<T>={scope:string|null;value:T};
export function conversationReadScope(context:ConversationReadContext,path:string,refresh:number):string|null{if(!context.online||context.status!=='ready'||!context.accessToken||!context.membership||!['admin','teacher','parent'].includes(context.membership.role)||!context.membership.entitlements.includes('community'))return null;return JSON.stringify([context.apiUrl,context.membership.schoolId,context.membership.userId,context.membership.role,context.accessToken,context.online,context.accessGeneration,path,refresh]);}
export function currentConversationRead<T>(read:ConversationRead<T>|null|undefined,scope:string|null):T|null{return scope&&read?.scope===scope?read.value:null;}
function actorMatches(source:{parentId:string;teacherId:string},role:string,userId:string):boolean{return role==='admin'||role==='parent'&&source.parentId===userId||role==='teacher'&&source.teacherId===userId;}
export function conversationIdentity(thread:ParentConversation){return {id:thread.id,learnerId:thread.learnerId,parentId:thread.parentId,teacherId:thread.teacherId,classId:thread.classId,subjectId:thread.subjectId};}
export function parseCurrentConversation(value:unknown,id:string,role:string,userId:string):ParentConversation{const source=parseParentConversation(value);if(source.id!==id||!actorMatches(source,role,userId)||role==='parent'&&source.canModerate)throw new LearningApiError('invalid');return source;}
export function parseCurrentConversationChoice(value:unknown,role:string,userId:string):ConversationChoice{const source=parseConversationChoice(value);if(!['parent','teacher'].includes(role)||!actorMatches(source,role,userId))throw new LearningApiError('invalid');return source;}
export function parseCurrentConversationMessage(value:unknown,thread:ParentConversation){const message=parseConversationMessage(value);if(message.conversationId!==thread.id||message.senderRole==='parent'&&message.senderId!==thread.parentId||message.senderRole==='teacher'&&message.senderId!==thread.teacherId)throw new LearningApiError('invalid');return message;}
export function parseCurrentConversationReport(value:unknown,threadId:string){const report=parseConversationReport(value);if(report.conversationId!==threadId)throw new LearningApiError('invalid');return report;}
export function conversationChoiceOptions(choices:readonly ConversationChoice[]){const rows=choices.map(choice=>({value:choice.id,label:[choice.learnerName,choice.teacherName,choice.parentName,choice.className,choice.academicYearName,choice.subjectName].join(' · '),requiresReview:false}));return rows.map(row=>({...row,requiresReview:rows.filter(other=>other.label===row.label).length!==1}));}

/** Purpose-specific validation of current SQL receipts against only the
 * original command/source. Generated moderation/report/state IDs do not echo
 * target/version; replayed send/create return their current protected state. */
export function validateConversationReceipt(value:unknown,original:Command,actorId:string,actorRole:string,thread?:ParentConversation,messageSource?:ConversationMessage):void{
 try{
  const path=original.path,body=original.body;
  if(path==='/v1/community/conversations/policy'){
   const input=conversationPolicyInputSchema.parse(body),receipt=conversationPolicySchema.parse(value);if(actorRole!=='admin'||receipt.version!==input.expectedVersion+1||receipt.enabled!==input.enabled||receipt.approvedAt===null)throw new LearningApiError('invalid');return;
  }
  if(path==='/v1/community/conversations'){
   const input=conversationCreateSchema.parse(body),receipt=conversationResponseSchema.parse(value);if(!['parent','teacher'].includes(actorRole)||!actorMatches(input,actorRole,actorId)||!actorMatches(receipt,actorRole,actorId)||actorRole==='parent'&&receipt.canModerate||['learnerId','parentId','teacherId','classId','subjectId','title'].some(key=>receipt[key as keyof typeof receipt]!==input[key as keyof typeof input]))throw new LearningApiError('invalid');return;
  }
  const send=path.match(/^\/v1\/community\/conversations\/([^/]+)\/messages$/);
  if(send){
   const input=conversationMessageSchema.parse(body);if(!thread||thread.id!==send[1]||!['parent','teacher'].includes(actorRole)||!actorMatches(thread,actorRole,actorId))throw new LearningApiError('invalid');const receipt=parseCurrentConversationMessage(value,thread);if(receipt.senderId!==actorId||receipt.senderRole!==actorRole||receipt.status==='VISIBLE'&&receipt.body!==input.body)throw new LearningApiError('invalid');return;
  }
  const message=path.match(/^\/v1\/community\/conversations\/messages\/([^/]+)\/(read|report|moderate)$/);const state=path.match(/^\/v1\/community\/conversations\/([^/]+)\/state$/);
  if(message){if(!thread||!messageSource||messageSource.id!==message[1]||!actorMatches(thread,actorRole,actorId)||message[2]==='moderate'&&!thread.canModerate)throw new LearningApiError('invalid');parseCurrentConversationMessage(messageSource,thread);}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||Object.keys(value).some(key=>!['id','status'].includes(key)))throw new LearningApiError('invalid');const receipt=value as{id:unknown;status:unknown};if(typeof receipt.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.id))throw new LearningApiError('invalid');
  if(message?.[2]==='read'){conversationReadSchema.parse(body);if(!['parent','teacher'].includes(actorRole)||receipt.id!==message[1]||receipt.status!=='READ')throw new LearningApiError('invalid');return;}
  if(message?.[2]==='report'){conversationReportSchema.parse(body);if(!['parent','teacher'].includes(actorRole)||receipt.status!=='REPORTED')throw new LearningApiError('invalid');return;}
  if(message?.[2]==='moderate'){const input=conversationModerationSchema.parse(body);if(!['admin','teacher'].includes(actorRole)||receipt.status!==(input.action==='HIDE'?'HIDDEN':'VISIBLE'))throw new LearningApiError('invalid');return;}
  if(state){const input=conversationStateSchema.parse(body);if(!thread||thread.id!==state[1]||!actorMatches(thread,actorRole,actorId)||!thread.canModerate||!['admin','teacher'].includes(actorRole)||receipt.status!==input.state)throw new LearningApiError('invalid');return;}
  throw new LearningApiError('invalid');
 }catch{throw new LearningApiError('invalid',true);}
}
