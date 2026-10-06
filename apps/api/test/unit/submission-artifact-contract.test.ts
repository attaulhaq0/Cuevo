import { describe, expect, it } from 'vitest';
import { submissionWorkInputSchema, submissionWorkResubmitSchema, submissionWorkSourceSchema } from '@cuevo/contracts';
const id='00000000-0000-4000-8000-000000000001';
describe('actual academic document source contract',()=>{
 it('represents file-only work explicitly without inventing answer text',()=>{expect(submissionWorkInputSchema.safeParse({responseKind:'FILE',content:'',assetIds:[id]}).success).toBe(true);for(const input of[{responseKind:'FILE',content:'file attached',assetIds:[id]},{responseKind:'FILE',content:'',assetIds:[]},{responseKind:'TEXT',content:'',assetIds:[id]},{responseKind:'TEXT',content:'Actual text',assetIds:[id,id]}])expect(submissionWorkInputSchema.safeParse(input).success).toBe(false);});
 it('requires exact resubmission source pointers and bounded artifact metadata',()=>{expect(submissionWorkResubmitSchema.safeParse({responseKind:'FILE',content:'',assetIds:[id],returnId:id,expectedRevision:1}).success).toBe(true);expect(submissionWorkSourceSchema.safeParse({submissionId:id,assessmentId:id,learnerId:id,revision:1,responseKind:'FILE',content:'',artifacts:[]}).success).toBe(false);});
});

describe('exact document response integrity',()=>{
 const artifact={id,name:'Actual work.txt',contentType:'text/plain',byteSize:12,sha256:'a'.repeat(64),state:'AVAILABLE'};
 it('rejects duplicated artifacts in an immutable source response',()=>{expect(submissionWorkSourceSchema.safeParse({submissionId:id,assessmentId:id,learnerId:id,revision:1,responseKind:'FILE',content:'',artifacts:[artifact,artifact]}).success).toBe(false);});
});
