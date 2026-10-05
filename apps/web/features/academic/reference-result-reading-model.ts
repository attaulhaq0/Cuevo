import {z}from'zod';
import {referenceInputSchema}from'@cuevo/contracts';
import {LearningApiError,type Command}from'../../shared/api/client.ts';
import {parseReference, sameNativeResult, type AcademicReference,type ReleasedResult}from'./model.ts';

const referenceSelectionSchema=z.object({id:z.uuid(),version:z.string().min(1),createdBy:z.string().min(1)}).strict();
export type ReferenceSelection=z.infer<typeof referenceSelectionSchema>;
export function referenceSelection(row:AcademicReference):ReferenceSelection{return{id:row.id,version:row.version,createdBy:row.createdBy};}
export function parseReferenceSelection(value:unknown):ReferenceSelection|null{const result=referenceSelectionSchema.safeParse(value);return result.success?result.data:null;}
export function currentSelectedReference(rows:AcademicReference[],selection:ReferenceSelection|null):AcademicReference|null{return selection?rows.find(row=>row.id===selection.id&&row.version===selection.version&&row.createdBy===selection.createdBy)??null:null;}
export function validateReferenceReceipt(value:unknown,original:Command,actorId:string,source?:ReferenceSelection):void {
 try{const row=parseReference(value);if(!z.uuid().safeParse(row.id).success)throw new LearningApiError('invalid');
  if(original.path==='/v1/academic-references'){const input=referenceInputSchema.parse(original.body);if(row.createdBy!==actorId||row.title!==input.title||row.description!==input.description||row.version!==input.version||row.status!=='DRAFT')throw new LearningApiError('invalid');}
  else{const id=original.path.match(/^\/v1\/academic-references\/([^/]+)\/approve$/)?.[1];if(!id||row.id!==id||row.status!=='APPROVED'||row.approvedBy!==actorId||source&&(row.version!==source.version||row.createdBy!==source.createdBy))throw new LearningApiError('invalid');}
 }catch{throw new LearningApiError('invalid',true);}
}
export type ResultSelection=Pick<ReleasedResult,'id'|'submissionId'|'assessmentId'|'learnerId'|'evidenceId'|'referenceId'|'referenceVersion'|'revision'|'policyVersion'|'createdAt'> & {nativeFingerprint:string};
function nativeFingerprint(row:ReleasedResult):string { const value=row.nativeResult;return JSON.stringify(value.type==='numeric'?[value.type,value.policyVersion,value.score,value.maxScore]:[value.type,value.policyVersion,value.rubricId,value.rubricVersion,value.rubricTitle,value.criteria.map(criterion=>[criterion.criterionKey,criterion.criterionTitle,criterion.levelKey,criterion.levelLabel,criterion.levelDescription])]); }
export function resultSelection(row:ReleasedResult):ResultSelection{return{id:row.id,submissionId:row.submissionId,assessmentId:row.assessmentId,learnerId:row.learnerId,evidenceId:row.evidenceId,referenceId:row.referenceId,referenceVersion:row.referenceVersion,revision:row.revision,policyVersion:row.policyVersion,createdAt:row.createdAt,nativeFingerprint:nativeFingerprint(row)};}
export function currentSelectedResult(rows:ReleasedResult[],selection:ResultSelection|null):ReleasedResult|null{if(!selection)return null;const{nativeFingerprint:expected,...identity}=selection;return rows.find(row=>Object.keys(identity).every(key=>row[key as keyof ReleasedResult]===identity[key as keyof typeof identity])&&nativeFingerprint(row)===expected)??null;}
export function sameSelectedResult(left:ReleasedResult,right:ReleasedResult):boolean{return currentSelectedResult([right],resultSelection(left))!==null&&sameNativeResult(left.nativeResult,right.nativeResult);}
