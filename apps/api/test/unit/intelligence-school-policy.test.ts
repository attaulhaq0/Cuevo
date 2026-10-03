import{describe,expect,it}from'vitest';import{schoolIntelligencePolicyInputSchema}from'@cuevo/contracts';
describe('explicit school intelligence purpose policy',()=>{
 it('requires explicit admin confirmation, bounded action choices and known purpose',()=>{
  const input={purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['REVIEW_FEEDBACK'],expectedVersion:0,confirmApproval:true,reason:'School reviewed this purpose.'};
  expect(schoolIntelligencePolicyInputSchema.safeParse(input).success).toBe(true);expect(schoolIntelligencePolicyInputSchema.safeParse({...input,confirmApproval:false}).success).toBe(false);expect(schoolIntelligencePolicyInputSchema.safeParse({...input,allowedActions:['CHANGE_GRADES']}).success).toBe(false);expect(schoolIntelligencePolicyInputSchema.safeParse({...input,purpose:'SAFEGUARDING'}).success).toBe(false);
  expect(schoolIntelligencePolicyInputSchema.safeParse({...input,dataClassification:'SCHOOL_CUSTOM_NATIVE'}).success).toBe(true);expect(schoolIntelligencePolicyInputSchema.safeParse({...input,dataClassification:'PASTORAL_INFERENCES'}).success).toBe(false);
 });
});
