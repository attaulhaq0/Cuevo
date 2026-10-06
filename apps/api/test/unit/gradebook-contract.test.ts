import{describe,it,expect}from'vitest';
import * as contracts from'@cuevo/contracts';
import type{z}from'zod';
const id='40000000-0000-4000-8000-000000000001';
describe('gradebook reviewed release contracts',()=>{
 it('bounds distinct selections and requires every exact source expectation and human release confirmation',()=>{
  const schemas=contracts as unknown as Record<string,z.ZodType>;expect(schemas.gradebookReleaseSchema).toBeDefined();expect(schemas.gradebookPreviewSchema).toBeDefined();
  const source={markingId:id,submissionId:id,expectedRevision:1,expectedSubmissionRevision:1,expectedPolicyVersion:2,parentVisible:false};
  expect(schemas.gradebookPreviewSchema.safeParse({selections:[source]}).success).toBe(true);
  expect(schemas.gradebookReleaseSchema.safeParse({selections:[source],confirmRelease:true}).success).toBe(true);
  for(const value of [{selections:[],confirmRelease:true},{selections:[source,source],confirmRelease:true},{selections:[source],confirmRelease:false},{selections:[{...source,expectedRevision:0}],confirmRelease:true},{selections:[source],confirmRelease:true,score:10}])expect(schemas.gradebookReleaseSchema.safeParse(value).success).toBe(false);
 });
 it('gradebook paging bounds both assessment columns and learner rows independently',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).gradebookQuerySchema;expect(schema).toBeDefined();expect(schema.safeParse({learnerLimit:25,assessmentLimit:10}).success).toBe(true);expect(schema.safeParse({learnerLimit:26}).success).toBe(false);expect(schema.safeParse({assessmentLimit:11}).success).toBe(false);
 });
});
