import{describe,it,expect}from'vitest';
import * as contracts from'@cuevo/contracts';
import type{z}from'zod';
const id='40000000-0000-4000-8000-000000000001';
describe('assessment preparation boundary',()=>{
 it('supports an explicit closed draft without changing legacy creation fields',()=>{
  const base={courseId:id,title:'Prepared task',instructions:'Explain',maxScore:10};
  expect(contracts.assessmentInputSchema.safeParse({...base,preparation:true,intendedSubmissionKind:'QUIZ',intendedModel:'rubric'}).success).toBe(true);
  expect(contracts.assessmentInputSchema.safeParse(base).success).toBe(true);
 });
 it('requires exact draft/publish versions and rejects caller authority',()=>{
  const schemas=contracts as unknown as Record<string,z.ZodType>;
  expect(schemas.assessmentPreparationSchema).toBeDefined();expect(schemas.assessmentPublishSchema).toBeDefined();
  const draft={title:'Prepared task',instructions:'Explain',dueAt:null,maxScore:10,referenceId:id,rubricId:null,expectedPreparationVersion:1};
  expect(schemas.assessmentPreparationSchema.safeParse(draft).success).toBe(true);
  expect(schemas.assessmentPreparationSchema.safeParse({...draft,status:'PUBLISHED'}).success).toBe(false);
  expect(schemas.assessmentPublishSchema.safeParse({expectedPreparationVersion:1,expectedPolicyVersion:2,expectedAvailabilityVersion:1}).success).toBe(true);
  expect(schemas.assessmentPublishSchema.safeParse({expectedPreparationVersion:0,expectedPolicyVersion:2,expectedAvailabilityVersion:1}).success).toBe(false);
 });
});
