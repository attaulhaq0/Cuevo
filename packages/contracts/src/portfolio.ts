import{z}from'zod';
const title=z.string().trim().min(1).max(200);const reflection=z.string().trim().min(1).max(10000);
export const portfolioCreateSchema=z.object({evidenceId:z.uuid(),sourceModel:z.enum(['numeric','rubric']),title,reflection}).strict();
export const portfolioReflectionSchema=z.object({title,reflection,expectedRevision:z.number().int().positive()}).strict();
export const portfolioReviewSchema=z.object({expectedRevision:z.number().int().positive(),feedback:z.string().trim().min(1).max(10000),featured:z.boolean(),parentVisible:z.boolean(),confirmParentApproval:z.boolean().default(false)}).strict().refine(value=>!value.parentVisible||value.confirmParentApproval,'Explicit parent approval required.');
export const portfolioParentRevokeSchema=z.object({reason:z.string().trim().min(1).max(2000)}).strict();
export const portfolioListSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.uuid().optional(),learnerId:z.uuid().optional()}).strict();
