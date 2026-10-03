import{z}from'zod';
import { submissionAssetIdsSchema, submissionArtifactsSchema } from './submission-artifact';
import { nativeAcademicResultSchema } from './academic';
const title=z.string().trim().min(1).max(200);const reflection=z.string().trim().min(1).max(10000);
const identityName=z.string().trim().min(1).max(200).nullable();
export const portfolioIdentitySchema=z.object({status:z.enum(['READY','REQUIRES_REVIEW']),learnerName:identityName,className:identityName,yearGroupName:identityName,academicYearName:identityName,courseTitle:identityName,assessmentTitle:identityName,submittedAt:z.iso.datetime({offset:true}).nullable(),submissionRevision:z.number().int().positive().nullable()}).strict().refine(value=>value.status!=='READY'||Object.entries(value).every(([key,field])=>key==='status'||field!==null),'Ready portfolio identity requires complete human source context.');
export type PortfolioIdentity=z.infer<typeof portfolioIdentitySchema>;
export const portfolioCreateSchema=z.object({evidenceId:z.uuid(),sourceModel:z.enum(['numeric','rubric']),title,reflection,assetIds:submissionAssetIdsSchema.optional()}).strict();
export const portfolioReflectionSchema=z.object({title,reflection,expectedRevision:z.number().int().positive(),assetIds:submissionAssetIdsSchema.optional()}).strict();
export const portfolioReviewSchema=z.object({expectedRevision:z.number().int().positive(),feedback:z.string().trim().min(1).max(10000),featured:z.boolean(),parentVisible:z.boolean(),confirmParentApproval:z.boolean().default(false),confirmSourceReview:z.boolean().default(false)}).strict().refine(value=>!value.parentVisible||value.confirmParentApproval,'Explicit parent approval required.');
export const portfolioParentRevokeSchema=z.object({reason:z.string().trim().min(1).max(2000)}).strict();
export const portfolioCollectionSchema=z.object({title,description:z.string().trim().max(2000)}).strict();
export const portfolioPlacementSchema=z.object({collectionId:z.uuid().nullable(),expectedRevision:z.number().int().nonnegative(),position:z.number().int().min(1).max(10000)}).strict();
export const portfolioFeedbackRequestSchema=z.object({revisionId:z.uuid(),expectedRevision:z.number().int().positive(),message:z.string().trim().min(1).max(2000),confirmRequest:z.literal(true)}).strict();
export const portfolioListSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.uuid().optional(),learnerId:z.uuid().optional()}).strict();
export const portfolioSourceWorkSchema=z.object({
 itemId:z.uuid(),revisionId:z.uuid(),portfolioRevision:z.number().int().positive(),learnerId:z.uuid(),learnerName:z.string().min(1).max(200),
 evidenceId:z.uuid(),resultId:z.uuid(),referenceId:z.uuid(),referenceVersion:z.string().min(1).max(100),policyVersion:z.number().int().positive(),
 source:z.object({kind:z.enum(['TEXT','FILE']),submissionId:z.uuid(),submissionRevision:z.number().int().positive(),assessmentId:z.uuid(),assessmentTitle:z.string().min(1).max(200),submittedAt:z.iso.datetime({offset:true}),content:z.string().max(50000),artifacts:submissionArtifactsSchema.optional()}).strict().superRefine((value,ctx)=>{if(value.kind==='TEXT'&&!value.content.length||value.kind==='FILE'&&(value.content!==''||!value.artifacts?.length))ctx.addIssue({code:'custom',message:'Selected work kind must match real source.'});}),
}).strict();
export type PortfolioSourceWork=z.infer<typeof portfolioSourceWorkSchema>;
export const portfolioRequestedReviewSchema=z.object({requestId:z.uuid(),itemId:z.uuid(),revisionId:z.uuid(),revision:z.number().int().positive(),title,reflection,learnerId:z.uuid(),learnerName:z.string().min(1).max(200),sourceModel:z.enum(['numeric','rubric']),nativeResult:nativeAcademicResultSchema,evidenceId:z.uuid(),resultId:z.uuid(),assessmentTitle:z.string().min(1).max(200),referenceTitle:z.string().min(1).max(200),work:portfolioSourceWorkSchema.nullable()}).strict().superRefine((value,ctx)=>{if(value.nativeResult.type!==value.sourceModel||value.work&&(value.work.itemId!==value.itemId||value.work.revisionId!==value.revisionId||value.work.portfolioRevision!==value.revision||value.work.learnerId!==value.learnerId||value.work.evidenceId!==value.evidenceId||value.work.resultId!==value.resultId))ctx.addIssue({code:'custom',message:'Requested source and reflection must share the exact identity.'});});
export type PortfolioRequestedReview=z.infer<typeof portfolioRequestedReviewSchema>;
