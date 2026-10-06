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

/** Only immutable navigation identity is retained; source text stays in the
 * current authorized page and a status change cannot silently restore an editor. */
export type ProposalSelection=Pick<import('./model.ts').Recommendation,'id'|'learnerId'|'referenceId'|'baselineResultId'|'createdAt'>;
export function proposalSelection(source:import('./model.ts').Recommendation):ProposalSelection{return{id:source.id,learnerId:source.learnerId,referenceId:source.referenceId,baselineResultId:source.baselineResultId,createdAt:source.createdAt};}
export function parseProposalSelection(value:unknown):ProposalSelection|null {
 const parsed=z.object({id:z.uuid(),learnerId:z.uuid(),referenceId:z.uuid(),baselineResultId:z.uuid(),createdAt:z.string().refine(value=>Number.isFinite(Date.parse(value)))}).strict().safeParse(value);return parsed.success?parsed.data:null;
}
export function currentProposalSelection(rows:import('./model.ts').Recommendation[],selection:ProposalSelection|null):import('./model.ts').Recommendation|null {
 return selection?rows.find(row=>row.id===selection.id&&row.learnerId===selection.learnerId&&row.referenceId===selection.referenceId&&row.baselineResultId===selection.baselineResultId&&row.createdAt===selection.createdAt)??null:null;
}
