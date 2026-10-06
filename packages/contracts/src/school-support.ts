import{z}from'zod';
const reason=z.string().trim().min(1).max(2000);const name=z.string().trim().min(1).max(200);
export const campusInputSchema=z.object({name,location:z.string().trim().min(1).max(1000).nullable(),reason,confirmConfiguration:z.literal(true)}).strict();
export const classCampusSchema=z.object({campusId:z.uuid().nullable(),expectedRevision:z.number().int().nonnegative(),reason,confirmConfiguration:z.literal(true)}).strict();
export const campusRetireSchema=z.object({reason,confirmRetirement:z.literal(true)}).strict();
export const learningSupportSchema=z.object({learnerId:z.uuid(),courseId:z.uuid(),assessmentId:z.uuid().nullable(),title:name,instructions:z.string().trim().min(1).max(4000),effectiveFrom:z.iso.date(),effectiveTo:z.iso.date(),studentVisible:z.boolean(),parentVisible:z.boolean(),reason,confirmApproval:z.literal(true)}).strict().refine(value=>value.effectiveTo>=value.effectiveFrom,'Support end must not precede start.');
export const learningSupportRevokeSchema=z.object({expectedRevision:z.number().int().positive(),reason,confirmRevocation:z.literal(true)}).strict();
export const schoolSupportQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(25).default(25),cursor:z.uuid().optional(),courseId:z.uuid().optional(),assessmentId:z.uuid().optional(),learnerId:z.uuid().optional()}).strict();
