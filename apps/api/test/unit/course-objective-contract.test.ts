import{describe,it,expect}from'vitest';
import * as contracts from'@cuevo/contracts';
import type{z}from'zod';
const id='40000000-0000-4000-8000-000000000001';
describe('course objective approval boundary',()=>{
 it('requires a human reason, confirmation and exact approval-list version',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).courseObjectiveApprovalSchema;
  expect(schema).toBeDefined();
  const valid={referenceId:id,expectedVersion:1,reason:'Reviewed for this course subject and year.',confirmConfiguration:true};
  expect(schema.safeParse(valid).success).toBe(true);
  for(const change of [{reason:''},{confirmConfiguration:false},{expectedVersion:0},{academicReferenceId:id},{packVersionId:id},{approved:true}])expect(schema.safeParse({...valid,...change}).success).toBe(false);
 });
});
