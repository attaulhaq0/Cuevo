import { z } from 'zod';
import { assetDisplayNameSchema, assetContentTypeSchema } from './assets';
export const submissionAssetIdsSchema=z.array(z.uuid()).max(5).refine(ids=>new Set(ids).size===ids.length,'Choose each document once.');
export const submissionArtifactSchema=z.object({id:z.uuid(),name:assetDisplayNameSchema,contentType:assetContentTypeSchema,byteSize:z.number().int().positive().max(524288),sha256:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['AVAILABLE','RETIRED'])}).strict();
export const submissionArtifactsSchema=z.array(submissionArtifactSchema).max(5).refine(artifacts=>new Set(artifacts.map(asset=>asset.id)).size===artifacts.length,'Each source document appears once.');
export const submissionWorkInputSchema=z.object({responseKind:z.enum(['TEXT','FILE']),content:z.string().max(50000),assetIds:submissionAssetIdsSchema.default([])}).strict().superRefine((value,ctx)=>{if(value.responseKind==='TEXT'&&!value.content.trim()||value.responseKind==='FILE'&&(value.content!==''||!value.assetIds.length))ctx.addIssue({code:'custom',message:'Use actual text or an explicit file-only response.'});});
export const submissionWorkDraftSchema=submissionWorkInputSchema.safeExtend({expectedRevision:z.number().int().nonnegative()});
export const submissionWorkResubmitSchema=submissionWorkInputSchema.safeExtend({expectedRevision:z.number().int().positive(),returnId:z.uuid()});
export const submissionWorkSourceSchema=z.object({submissionId:z.uuid(),assessmentId:z.uuid(),learnerId:z.uuid(),revision:z.number().int().positive(),responseKind:z.enum(['TEXT','FILE']),content:z.string().max(50000),artifacts:submissionArtifactsSchema}).strict().superRefine((value,ctx)=>{if(value.responseKind==='TEXT'&&!value.content.length||value.responseKind==='FILE'&&(value.content!==''||!value.artifacts.length))ctx.addIssue({code:'custom',message:'Submitted source kind must match its actual work.'});});
export const submissionWorkDraftResponseSchema=z.object({id:z.uuid().nullable(),assessmentId:z.uuid(),revision:z.number().int().nonnegative(),responseKind:z.enum(['TEXT','FILE']),content:z.string().max(50000),artifacts:submissionArtifactsSchema,status:z.literal('DRAFT')}).strict();
export type SubmissionArtifact=z.infer<typeof submissionArtifactSchema>;
export type SubmissionWorkSource=z.infer<typeof submissionWorkSourceSchema>;

