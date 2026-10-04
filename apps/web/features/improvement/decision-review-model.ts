import { decisionInputSchema } from '@cuevo/contracts';
import { z } from 'zod';
import { LearningApiError,type Command } from '../../shared/api/client.ts';

export function retainedProposalDecision(command:Command|undefined):{id:string;value:'APPROVE'|'REJECT'}|null {
 const id=command?.path.match(/^\/v1\/recommendations\/([^/]+)\/decision$/)?.[1];
 const body=decisionInputSchema.safeParse(command?.body);
 return id&&z.uuid().safeParse(id).success&&body.success?{id,value:body.data.decision}:null;
}
const receiptSchema=z.object({id:z.uuid(),recommendationId:z.uuid(),status:z.enum(['APPROVED','REJECTED']),decision:z.enum(['APPROVE','REJECT']),interventionId:z.uuid().nullable()}).strict();
export function validateProposalDecisionReceipt(value:unknown,original:Command):void {
 const decision=retainedProposalDecision(original),receipt=receiptSchema.safeParse(value);
 if(!decision||!receipt.success||receipt.data.id!==decision.id||receipt.data.recommendationId!==decision.id||receipt.data.decision!==decision.value||receipt.data.status!==(decision.value==='APPROVE'?'APPROVED':'REJECTED')||(decision.value==='APPROVE'?receipt.data.interventionId===null:receipt.data.interventionId!==null))throw new LearningApiError('invalid',true);
}
