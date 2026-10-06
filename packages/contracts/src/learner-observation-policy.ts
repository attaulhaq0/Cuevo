import{z}from'zod';
const days=z.number().int().min(1).max(365);
export const learnerObservationPolicyInputSchema=z.object({developmentWindowDays:days,expectedVersion:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(1000),confirmApproval:z.literal(true)}).strict();
export const learnerObservationPolicySchema=z.object({version:z.number().int().positive(),developmentWindowDays:days,approvedByName:z.string().trim().min(1).max(200).nullable(),approvedAt:z.iso.datetime({offset:true}).nullable()}).strict();
export const learnerObservationPolicyStatusSchema=z.object({schoolId:z.uuid(),status:z.enum(['UNCONFIGURED','CONFIGURED','REQUIRES_REVIEW']),policy:learnerObservationPolicySchema.nullable()}).strict().refine(value=>value.status==='REQUIRES_REVIEW'||(value.status==='UNCONFIGURED'?value.policy===null:value.policy!==null),'Current policy status must reflect its known source.');
export const learnerObservationPolicyReceiptSchema=z.object({id:z.uuid(),schoolId:z.uuid(),version:z.number().int().positive(),developmentWindowDays:days,status:z.literal('APPROVED'),refreshStatus:z.enum(['PENDING','NOT_REQUIRED'])}).strict();
export type LearnerObservationPolicyInput=z.infer<typeof learnerObservationPolicyInputSchema>;
export type LearnerObservationPolicyStatus=z.infer<typeof learnerObservationPolicyStatusSchema>;
export type LearnerObservationPolicyReceipt=z.infer<typeof learnerObservationPolicyReceiptSchema>;
