import { z } from 'zod';
const intentSchema=z.object({id:z.uuid(),learnerId:z.uuid(),parentId:z.uuid(),teacherId:z.uuid(),classId:z.uuid(),subjectId:z.uuid()}).strict();
const actionSchema=z.discriminatedUnion('kind',[
 z.object({id:z.uuid(),kind:z.literal('report'),version:z.number().int().nonnegative(),target:z.null()}).strict(),
 z.object({id:z.uuid(),kind:z.literal('moderate'),version:z.number().int().nonnegative(),target:z.enum(['HIDE','RESTORE'])}).strict(),
 z.object({id:z.uuid(),kind:z.literal('state'),version:z.number().int().nonnegative(),target:z.enum(['OPEN','PAUSED'])}).strict(),
]);
export type ConversationIntent=z.infer<typeof intentSchema>;
export type ConversationAction=z.infer<typeof actionSchema>;
export function parseConversationIntent(value:unknown):ConversationIntent|null{const parsed=intentSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function parseConversationAction(value:unknown):ConversationAction|null{const parsed=actionSchema.safeParse(value);return parsed.success?parsed.data:null;}
