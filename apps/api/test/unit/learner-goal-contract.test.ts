import{describe,it,expect}from'vitest';import{learnerGoalCreateSchema,learnerGoalReviewSchema}from'@cuevo/contracts';
describe('learner goals preserve explicit self-reported scope',()=>{
 it('rejects authority or inferred-trait fields and requires explicit review',()=>{const source={courseId:'10000000-0000-4000-8000-000000000001',referenceId:null,title:'Check one step',plannedStep:'Use the school example.'};expect(learnerGoalCreateSchema.safeParse(source).success).toBe(true);expect(learnerGoalCreateSchema.safeParse({...source,intelligenceScore:4}).success).toBe(false);expect(learnerGoalReviewSchema.safeParse({expectedRevision:1,status:'CLOSED',review:'I reviewed my work.'}).success).toBe(false);});
});
