import { z } from 'zod';
const reason=z.string().trim().min(1).max(1000);const revision=z.number().int().positive();
export const communityGroupLifecycleSchema=z.object({name:z.string().trim().min(1).max(200),state:z.enum(['ACTIVE','CLOSED']),expectedRevision:revision,reason,confirmChange:z.literal(true)}).strict();
export const communityReportReviewSchema=z.object({outcome:z.enum(['RESOLVED','REQUIRES_FOLLOW_UP','REOPENED']),expectedRevision:z.number().int().nonnegative(),reason,confirmReview:z.literal(true)}).strict();
export const communityAnnouncementRevisionSchema=z.object({title:z.string().trim().min(1).max(200),body:z.string().trim().min(1).max(4000),parentVisible:z.boolean(),expectedRevision:revision,reason,confirmPublication:z.literal(true)}).strict();
export const communityAnnouncementWithdrawSchema=z.object({expectedRevision:revision,reason,confirmWithdrawal:z.literal(true)}).strict();
export const communityExactReadSchema=z.object({expectedRevision:revision}).strict();
