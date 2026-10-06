import { z } from 'zod';
import { schoolAccountInvitationPageSchema, schoolAccountInvitationReceiptSchema, schoolAccountEffectStatusSchema, schoolAccountInviteSchema, schoolAccountRecoveryRequestSchema, schoolAccountInvitationRevokeSchema } from '@cuevo/contracts';
import { LearningApiError } from '../../shared/api/client.ts';

export function readBoundAccountPage(value:unknown,schoolId:string) {
 const parsed=schoolAccountInvitationPageSchema.safeParse(value);
 if(!z.uuid().safeParse(schoolId).success||!parsed.success||parsed.data.items.some(item=>item.schoolId!==schoolId))throw new LearningApiError('invalid');
 return parsed.data;
}
export function parseBoundDelivery(value:unknown,schoolId:string,id:string) {
 const parsed=schoolAccountEffectStatusSchema.safeParse(value);
 if(!z.uuid().safeParse(schoolId).success||!z.uuid().safeParse(id).success||!parsed.success||parsed.data.receipt&&(parsed.data.receipt.id!==id||parsed.data.receipt.schoolId!==schoolId))throw new LearningApiError('invalid');
 return parsed.data;
}
/** Stored invite/recovery receipts retain REQUESTED revision1; current progress is a separate source read. */
export function validateAccountReceipt(value:unknown,kind:'invite'|'recovery'|'revoke',schoolId:string,originalBody:unknown,id?:string) {
 const invalid=():never=>{throw new LearningApiError('invalid',true);};
 const receipt=schoolAccountInvitationReceiptSchema.safeParse(value);
 if(!z.uuid().safeParse(schoolId).success||!receipt.success||receipt.data.schoolId!==schoolId)return invalid();
 if(kind==='invite'){if(!schoolAccountInviteSchema.safeParse(originalBody).success||receipt.data.revision!==1||receipt.data.status!=='REQUESTED')return invalid();}
 else if(kind==='recovery'){if(!z.uuid().safeParse(id).success||!schoolAccountRecoveryRequestSchema.safeParse(originalBody).success||receipt.data.revision!==1||receipt.data.status!=='REQUESTED')return invalid();}
 else if(kind==='revoke'){const body=schoolAccountInvitationRevokeSchema.safeParse(originalBody);if(!z.uuid().safeParse(id).success||!body.success||!Number.isSafeInteger(body.data.expectedRevision)||body.data.expectedRevision>=Number.MAX_SAFE_INTEGER||receipt.data.id!==id||receipt.data.revision!==body.data.expectedRevision+1||receipt.data.status!=='REVOKED')return invalid();}
 else return invalid();
 return receipt.data;
}
export type AccountSelection={kind:'invite'|'recover'}|{kind:'read';id:string}|{kind:'revoke';id:string;revision:number};
/** Memory-only display intent; no account details, credentials or source authorization. */
export function parseAccountSelection(value:unknown):AccountSelection|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const row=value as Record<string,unknown>;
 const keys=row.kind==='invite'||row.kind==='recover'?['kind']:row.kind==='read'?['kind','id']:row.kind==='revoke'?['kind','id','revision']:null;
 if(!keys||Object.keys(row).length!==keys.length||keys.some(key=>!(key in row)))return null;
 if(row.kind==='invite'||row.kind==='recover')return{kind:row.kind};
 if(!z.uuid().safeParse(row.id).success)return null;
 if(row.kind==='read')return{kind:'read',id:String(row.id)};
 if(!Number.isSafeInteger(row.revision)||Number(row.revision)<1)return null;
 return{kind:'revoke',id:String(row.id),revision:Number(row.revision)};
}
