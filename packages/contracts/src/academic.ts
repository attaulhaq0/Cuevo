import { z } from 'zod';
export const referenceInputSchema=z.object({title:z.string().trim().min(1).max(200),description:z.string().trim().min(1).max(4000),version:z.string().trim().min(1).max(100)}).strict();
export const referenceLinkSchema=z.object({referenceId:z.uuid(),expectedPolicyVersion:z.number().int().min(1)}).strict();
export const markingInputSchema=z.object({score:z.number().min(0).max(100000),feedback:z.string().max(10000),expectedPolicyVersion:z.number().int().min(1),expectedRevision:z.number().int().min(0),sourceEvidence:z.literal(true)}).strict();
export const resultReleaseSchema=z.object({expectedRevision:z.number().int().min(1),parentVisible:z.boolean().default(false)}).strict();
