import { rubricInputSchema, assessmentRubricSchema } from '@cuevo/contracts';
import { z } from 'zod';
import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { parseRubric, type Rubric } from './model.ts';
export function validateRubricCreateReceipt(value:unknown,command:Command,actorId:string):void {
 const input=rubricInputSchema.safeParse(command.body);let receipt:Rubric;
 try{receipt=parseRubric(value);}catch{throw new LearningApiError('invalid',true);}
 const sameCriteria=input.success&&receipt.criteria.length===input.data.criteria.length&&receipt.criteria.every((criterion,index)=>{const expected=input.data.criteria[index];return criterion.key===expected.key&&criterion.title===expected.title&&criterion.levels.length===expected.levels.length&&criterion.levels.every((level,levelIndex)=>{const expectedLevel=expected.levels[levelIndex];return level.key===expectedLevel.key&&level.label===expectedLevel.label&&level.description===expectedLevel.description;});});
 if(command.path!=='/v1/rubrics'||!input.success||!z.uuid().safeParse(receipt.id).success||receipt.createdBy!==actorId||receipt.courseId!==input.data.courseId||receipt.title!==input.data.title||receipt.version!==input.data.version||!sameCriteria)throw new LearningApiError('invalid',true);
}
export function validateAssessmentRubricReceipt(value:unknown,command:Command):void {
 const id=command.path.match(/^\/v1\/assessments\/([^/]+)\/rubric$/)?.[1],input=assessmentRubricSchema.safeParse(command.body);
 const receipt=z.object({id:z.uuid(),courseId:z.uuid(),model:z.literal('rubric'),rubricId:z.uuid(),policyVersion:z.number().int().positive()}).passthrough().safeParse(value);
 if(!id||!input.success||!receipt.success||receipt.data.id!==id||receipt.data.rubricId!==input.data.rubricId||receipt.data.policyVersion!==input.data.expectedPolicyVersion+1)throw new LearningApiError('invalid',true);
}
export const rubricCommandPending=(command:Command)=>command.path==='/v1/rubrics'||/^\/v1\/assessments\/[^/]+\/rubric$/.test(command.path);
export type RubricSelection=Pick<Rubric,'id'|'courseId'|'version'|'createdAt'>;
export function currentRubricSelection(rows:Rubric[],selection:RubricSelection|null):Rubric|null{return selection?rows.find(row=>row.id===selection.id&&row.courseId===selection.courseId&&row.version===selection.version&&row.createdAt===selection.createdAt)??null:null;}
