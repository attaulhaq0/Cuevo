import{z}from'zod';
export const attentionPolicySchema=z.object({minimumDecline:z.number().positive().max(100000),maxScore:z.number().positive().max(100000),missingDueCount:z.number().int().positive().max(100),windowDays:z.number().int().positive().max(365),expectedVersion:z.number().int().min(0),confirmApproval:z.literal(true)}).strict();
export const attentionRefreshSchema=z.object({expectedPolicyVersion:z.number().int().positive()}).strict();
export const attentionListSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.uuid().optional(),learnerId:z.uuid().optional()}).strict();
