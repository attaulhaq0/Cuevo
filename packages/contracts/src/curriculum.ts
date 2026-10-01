import { z } from 'zod';

const text=z.string().trim().min(1).max(200);
const kind=z.enum(['curriculum','jurisdiction','quality','school_custom']);
export const curriculumVersionInputSchema=z.object({packId:text,kind,framework:text,programme:text,version:text,scope:text,sourceStatus:z.enum(['VERIFIED','REQUIRES_REVIEW','SOURCE_RESTRICTED','UNKNOWN']),rightsStatus:z.enum(['PERMITTED','REQUIRES_REVIEW','SOURCE_RESTRICTED','UNKNOWN']),sourceLocation:z.string().min(1).max(2000),sourceChecksum:z.string().regex(/^[a-f0-9]{64}$/).nullable(),synthetic:z.boolean(),reason:z.string().trim().min(1).max(2000)}).strict().superRefine((value,ctx)=>{
 if(!value.synthetic&&(value.sourceStatus==='VERIFIED'||value.rightsStatus==='PERMITTED'))ctx.addIssue({code:'custom',message:'Official pack activation requires the separate source-locked import/review workflow.'});
 if(value.synthetic&&value.kind!=='school_custom')ctx.addIssue({code:'custom',message:'Synthetic academic content must remain school custom.'});
});
export const curriculumReferenceInputSchema=z.object({packVersionId:z.uuid(),parentId:z.uuid().nullable(),type:z.enum(['stage','year','subject','strand','objective','outcome','criterion','syllabus_item','requirement','other']),title:text,description:z.string().trim().min(1).max(4000),code:z.string().trim().min(1).max(100).nullable(),sequence:z.number().int().min(0).max(10000),subjectId:z.uuid().nullable(),yearGroupId:z.uuid().nullable()}).strict();
export const programmeInstanceInputSchema=z.object({packVersionId:z.uuid(),name:text,classId:z.uuid(),subjectId:z.uuid(),yearGroupId:z.uuid(),confirmConfiguration:z.literal(true)}).strict();
export const programmeCourseLinkSchema=z.object({programmeId:z.uuid(),referenceId:z.uuid(),expectedVersion:z.number().int().positive(),confirmConfiguration:z.literal(true)}).strict();
export const programmeLearnerInputSchema=z.object({programmeId:z.uuid(),learnerId:z.uuid(),status:z.enum(['active','revoked']),confirmAccessChange:z.literal(true)}).strict();
export const curriculumOverlayInputSchema=z.object({packVersionId:z.uuid(),axis:z.enum(['jurisdiction','quality']),status:z.enum(['REQUIRES_REVIEW','SOURCE_RESTRICTED','UNKNOWN']),confirmConfiguration:z.literal(true)}).strict();
