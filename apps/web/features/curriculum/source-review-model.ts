import { z } from 'zod';
import { curriculumBehaviorAcceptanceSchema, curriculumBehaviorPreviewSchema, curriculumBehaviorResponseSchema, curriculumLifecycleSchema } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { parseCurriculumLifecycle, type Version } from './model.ts';

export function curriculumVersionIdentity(version:Version):string {
 return JSON.stringify([version.id,version.packId,version.kind,version.framework,version.programme,version.version,version.scope,version.synthetic,version.sourceStatus,version.rightsStatus,version.sourceLocation,version.sourceChecksum]);
}
export function curriculumLifecycleCanManage(role:string|undefined):boolean { return role==='admin'||role==='coordinator'; }
export function parseSelectedLifecycle(value:unknown,versionId:string){const result=parseCurriculumLifecycle(value);if(result.versionId!==versionId)throw new LearningApiError('invalid');return result;}
const lifecycleReceipt=z.object({id:z.uuid(),state:z.enum(['DRAFT','APPROVED','ACTIVE','SUPERSEDED','RETIRED']),revision:z.number().int().positive(),customerReady:z.literal(false)}).strict();
export function validateLifecycleReceipt(value:unknown,original:Command):void{
 try{
  const id=original.path.match(/^\/v1\/curriculum\/versions\/([^/]+)\/lifecycle$/)?.[1];const input=curriculumLifecycleSchema.parse(original.body);const receipt=lifecycleReceipt.parse(value);
  if(!id||receipt.id!==id||receipt.state!==input.state||receipt.revision!==input.expectedRevision+1)throw new Error('receipt');
 }catch{throw new LearningApiError('invalid',true);}
}
export function behaviorPreviewInput(basis:string,directory:string){return curriculumBehaviorPreviewSchema.parse({reviewBasis:basis,artifactDirectory:basis==='LOCKED_ARTIFACT'?directory:null});}
export function parseSelectedBehavior(value:unknown,version:Version,basis:string,directory:string){
 try{
  const input=behaviorPreviewInput(basis,directory);const result=curriculumBehaviorResponseSchema.parse(value);
  if(result.basis!==input.reviewBasis||result.version!==version.version||result.directory!==input.artifactDirectory||new Set(result.models).size!==result.models.length||result.basis==='LOCKED_ARTIFACT'&&(!/^[a-f0-9]{64}$/.test(result.digest??'')||result.numericMaxScore===null||result.rubric===null)||result.basis==='SCHOOL_AUTHORED'&&(result.digest!==null||result.numericMaxScore!==null||result.rubric!==null))throw new Error('source');
  return result;
 }catch{throw new LearningApiError('invalid');}
}
const acceptedStatus=z.object({id:z.uuid(),lifecycleRevision:z.number().int().positive(),accepted:z.boolean(),basis:z.enum(['SCHOOL_AUTHORED','LOCKED_ARTIFACT']).nullable(),behavior:z.record(z.string(),z.unknown()).nullable(),reason:z.string().nullable(),requiresReview:z.boolean()}).strict();
export function parseAcceptedBehaviorStatus(value:unknown,version:Version){
 try{
  const status=acceptedStatus.parse(value);if(status.id!==version.id||status.accepted&&(status.basis===null||status.behavior===null||!status.reason?.trim()||status.reason.trim().length>2000||status.requiresReview)||!status.accepted&&(status.basis!==null||status.behavior!==null||status.reason!==null))throw new Error('status');
  if(status.behavior){const {framework,programme,scope,...behavior}=status.behavior;if(status.basis==='LOCKED_ARTIFACT'&&(framework!==version.framework||programme!==version.programme||scope!==version.scope))throw new Error('tuple');parseSelectedBehavior(behavior,version,status.basis!,String(behavior.directory??''));}
  return status;
 }catch{throw new LearningApiError('invalid');}
}
const behaviorReceipt=z.object({id:z.uuid(),lifecycleRevision:z.number().int().positive()}).strict();
export function validateBehaviorReceipt(value:unknown,original:Command):void{
 try{
  const id=original.path.match(/^\/v1\/curriculum\/versions\/([^/]+)\/behavior-acceptance$/)?.[1];const input=curriculumBehaviorAcceptanceSchema.parse(original.body);const receipt=behaviorReceipt.parse(value);
  if(!id||receipt.id!==id||receipt.lifecycleRevision!==input.expectedLifecycleRevision)throw new Error('receipt');
 }catch{throw new LearningApiError('invalid',true);}
}
