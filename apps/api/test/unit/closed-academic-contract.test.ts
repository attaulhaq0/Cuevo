import{describe,it,expect}from'vitest';
import * as contracts from'@cuevo/contracts';
import type{z}from'zod';
const id='40000000-0000-4000-8000-000000000001';
describe('closed academic recovery contract',()=>{
 it('requires explicit reason and exact source/result expectations without caller authority',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).closedResultCorrectionSchema;expect(schema).toBeDefined();
  const input={score:0,feedback:'Reviewed correction',reason:'Arithmetic transcription error',expectedPolicyVersion:2,expectedRevision:1,expectedSubmissionRevision:1,expectedResultId:id,expectedResultRevision:1,parentVisible:false,sourceEvidence:true};
  expect(schema.safeParse(input).success).toBe(true);expect(schema.safeParse({...input,reason:''}).success).toBe(false);expect(schema.safeParse({...input,learnerId:id}).success).toBe(false);
 });
});
