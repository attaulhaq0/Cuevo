import{describe,it,expect}from'vitest';
import * as contracts from'@cuevo/contracts';
import type{z}from'zod';
const id='40000000-0000-4000-8000-000000000001';
describe('period objective planning authority',()=>{
 it('requires an exact approved objective, period revision and explicit teacher confirmation',()=>{
  const schemas=contracts as unknown as Record<string,z.ZodType>;expect(schemas.objectivePlanSchema).toBeDefined();expect(schemas.objectiveTaughtSchema).toBeDefined();expect(schemas.objectiveAssessmentSchema).toBeDefined();
  expect(schemas.objectivePlanSchema.safeParse({referenceId:id,periodId:id,expectedPeriodRevision:1,reason:'Planned school objective.',confirmPlanning:true}).success).toBe(true);
  expect(schemas.objectivePlanSchema.safeParse({referenceId:id,periodId:id,expectedPeriodRevision:1,reason:'Plan',confirmPlanning:true,coverage:100}).success).toBe(false);
  expect(schemas.objectiveTaughtSchema.safeParse({lessonId:id,taughtOn:'2026-10-02',expectedPeriodRevision:1,note:'Teacher recorded this lesson.',confirmTeaching:true}).success).toBe(true);
  expect(schemas.objectiveTaughtSchema.safeParse({lessonId:id,taughtOn:'2026-10-02',expectedPeriodRevision:1,note:'Teacher record',confirmTeaching:false}).success).toBe(false);
  expect(schemas.objectiveAssessmentSchema.safeParse({assessmentId:id,expectedPolicyVersion:2,expectedPeriodRevision:1,reason:'Included reviewed task.',confirmInclusion:true}).success).toBe(true);
 });
});
