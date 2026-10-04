import{describe,it,expect}from'vitest';
import{learnerObservationPolicyInputSchema,learnerObservationPolicyStatusSchema,learnerObservationPolicyReceiptSchema}from'../src/index';
const id='00000000-0000-4000-8000-000000000001';
describe('explicit learner observation policy',()=>{
 it('requires a reviewed bounded day window without a default',()=>{
  const input={developmentWindowDays:1,expectedVersion:0,reason:'Reviewed learning observation window',confirmApproval:true};
  expect(learnerObservationPolicyInputSchema.parse(input).developmentWindowDays).toBe(1);expect(learnerObservationPolicyInputSchema.parse({...input,developmentWindowDays:365}).developmentWindowDays).toBe(365);
  for(const value of [{...input,developmentWindowDays:0},{...input,developmentWindowDays:366},{...input,developmentWindowDays:1.2},{...input,confirmApproval:false},{...input,developmentWindowDays:undefined},{...input,schoolId:id}])expect(learnerObservationPolicyInputSchema.safeParse(value).success).toBe(false);
 });
 it('unconfigured status cannot imply a policy and legacy approval time remains unknown',()=>{
  expect(learnerObservationPolicyStatusSchema.parse({schoolId:id,status:'UNCONFIGURED',policy:null}).policy).toBeNull();
  const policy={version:1,developmentWindowDays:14,approvedByName:'School administrator',approvedAt:null};
  expect(learnerObservationPolicyStatusSchema.parse({schoolId:id,status:'CONFIGURED',policy}).policy?.approvedAt).toBeNull();
  expect(learnerObservationPolicyStatusSchema.safeParse({schoolId:id,status:'CONFIGURED',policy:null}).success).toBe(false);expect(learnerObservationPolicyStatusSchema.safeParse({schoolId:id,status:'UNCONFIGURED',policy}).success).toBe(false);
 });
 it('approval receipt confirms policy separately from bounded refresh completion',()=>{
  const receipt={id,schoolId:id,version:1,developmentWindowDays:28,status:'APPROVED',refreshStatus:'PENDING'};
  expect(learnerObservationPolicyReceiptSchema.parse(receipt).refreshStatus).toBe('PENDING');
  expect(learnerObservationPolicyReceiptSchema.safeParse({...receipt,refreshStatus:'COMPLETED'}).success).toBe(false);expect(learnerObservationPolicyReceiptSchema.safeParse({...receipt,rawPolicy:'private'}).success).toBe(false);
 });
});
