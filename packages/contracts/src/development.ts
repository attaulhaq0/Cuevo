import{z}from'zod';
const key=z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const milestone=z.object({key,title:z.string().trim().min(1).max(200),minimumPoints:z.number().int().positive().max(100000)}).strict();
export const recognitionPolicySchema=z.object({expectedVersion:z.number().int().min(0),points:z.object({practice:z.number().int().min(0).max(1000),revision:z.number().int().min(0).max(1000),reflection:z.number().int().min(0).max(1000)}).strict(),milestones:z.array(milestone).max(20),confirmApproval:z.literal(true)}).strict().refine(value=>new Set(value.milestones.map(item=>item.key)).size===value.milestones.length,'Milestone keys must be unique.');
export const recognitionPeriodSchema=z.object({classId:z.uuid(),policyId:z.uuid(),title:z.string().trim().min(1).max(200),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),confirmApproval:z.literal(true)}).strict().refine(value=>Date.parse(value.endsAt)>Date.parse(value.startsAt),'Period end must follow start.');
export const leaderboardParticipationSchema=z.object({periodId:z.uuid(),optIn:z.boolean(),alias:z.string().trim().max(50)}).strict().refine(value=>!value.optIn||value.alias.length>0,'A private display alias is required when opting in.');
export const recognitionBackfillSchema=z.object({periodId:z.uuid(),confirmApproval:z.literal(true)}).strict();
export const developmentQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.uuid().optional(),learnerId:z.uuid().optional(),periodId:z.uuid().optional()}).strict();
