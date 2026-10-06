import{z}from'zod';
export const assetDisplayNameSchema=z.string().trim().min(1).max(120).refine(name=>!/[\\/\u202a-\u202e\u2066-\u2069]/u.test(name)&&![...name].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)&&name!=='.'&&name!=='..','Use a safe display filename.');
export const assetContentTypeSchema=z.enum(['text/plain','image/png','image/jpeg','application/pdf']);
export const assetStageSchema=z.object({ownerId:z.uuid(),name:assetDisplayNameSchema,contentType:assetContentTypeSchema,byteSize:z.number().int().positive().max(512*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const assetFinalizeSchema=z.object({contentBase64:z.string().min(1).max(699052).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict();
export const assetRetireSchema=z.object({reason:z.string().trim().min(1).max(1000),confirmRetirement:z.literal(true)}).strict();
