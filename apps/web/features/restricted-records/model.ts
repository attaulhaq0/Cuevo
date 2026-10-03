import{LearningApiError}from'../../shared/api/client.ts';import{restrictedPolicyResponseSchema,restrictedRecordResponseSchema,restrictedHistorySchema}from'@cuevo/contracts';
export type{RestrictedRecord}from'@cuevo/contracts';
export const parseRestrictedPolicy=(value:unknown)=>{const parsed=restrictedPolicyResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};export const parseRestrictedRecord=(value:unknown)=>{const parsed=restrictedRecordResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export function parseRestrictedChoice(value:unknown):{id:string;title?:string;className?:string;displayName?:string;role?:string}{if(!value||typeof value!=='object'||Array.isArray(value))throw new LearningApiError('invalid');const row=value as Record<string,unknown>;if(typeof row.id!=='string'||!(typeof row.title==='string'||typeof row.displayName==='string'))throw new LearningApiError('invalid');return row as{id:string;title?:string;className?:string;displayName?:string;role?:string};}

export function parseRestrictedHistory(value:unknown){const parsed=restrictedHistorySchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;}

