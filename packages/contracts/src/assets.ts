import{z}from'zod';
export const assetStageSchema=z.object({ownerId:z.uuid(),name:z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_. -]+$/),contentType:z.enum(['text/plain','image/png','image/jpeg','application/pdf']),byteSize:z.number().int().positive().max(512*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const assetFinalizeSchema=z.object({contentBase64:z.string().min(1).max(699052).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict();
export const assetRetireSchema=z.object({reason:z.string().trim().min(1).max(1000),confirmRetirement:z.literal(true)}).strict();
