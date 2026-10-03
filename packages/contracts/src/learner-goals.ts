import{z}from'zod';
const title=z.string().trim().min(1).max(200);const text=z.string().trim().min(1).max(2000);
export const learnerGoalCreateSchema=z.object({courseId:z.uuid(),referenceId:z.uuid().nullable(),title,plannedStep:text}).strict();
export const learnerGoalReviewSchema=z.object({expectedRevision:z.number().int().positive(),status:z.enum(['REVIEWED','CLOSED']),review:text,confirmReview:z.literal(true)}).strict();
export const learnerGoalQuerySchema=z.object({learnerId:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(25).default(25),cursor:z.uuid().optional()}).strict();
export const learnerGoalSchema=z.object({id:z.uuid(),revisionId:z.uuid(),revision:z.number().int().positive(),learnerId:z.uuid(),learnerName:title,courseId:z.uuid(),courseTitle:title,referenceId:z.uuid().nullable(),referenceTitle:title.nullable(),title,plannedStep:text,status:z.enum(['ACTIVE','REVIEWED','CLOSED']),review:z.string().max(2000).nullable(),createdAt:z.iso.datetime({offset:true}),reviewedAt:z.iso.datetime({offset:true}).nullable()}).strict();
