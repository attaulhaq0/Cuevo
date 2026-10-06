import {describe,expect,it} from 'vitest';
import {referenceInputSchema,referenceLinkSchema,markingInputSchema,resultReleaseSchema} from '@cuevo/contracts';
describe('academic command authority boundary',()=>{
 it('accepts zero but rejects missing, negative and out-of-bound technical scores',()=>{
  const base={feedback:'Teacher feedback',expectedPolicyVersion:1,expectedRevision:0,sourceEvidence:true};
  expect(markingInputSchema.safeParse({...base,score:0}).success).toBe(true);
  for(const score of[undefined,-1,100001,NaN])expect(markingInputSchema.safeParse({...base,score}).success).toBe(false);
 });
 it('requires explicit immutable source evidence and optimistic versions',()=>{
  for(const extra of[{sourceEvidence:false},{sourceEvidence:undefined},{expectedRevision:-1},{expectedPolicyVersion:0},{learnerId:'forged'}])expect(markingInputSchema.safeParse({score:5,feedback:'Review',expectedPolicyVersion:1,expectedRevision:0,sourceEvidence:true,...extra}).success).toBe(false);
 });
 it('does not allow official issuer or approval claims through school custom authoring',()=>{
  expect(referenceInputSchema.safeParse({title:'School objective',description:'Teacher authored',version:'school-1',framework:'Cambridge'}).success).toBe(false);
 });
 it('requires compatible assessment policy and explicit release revision',()=>{
  expect(referenceLinkSchema.safeParse({referenceId:'bad',expectedPolicyVersion:1}).success).toBe(false);
  expect(resultReleaseSchema.safeParse({expectedRevision:0}).success).toBe(false);
  expect(resultReleaseSchema.safeParse({expectedRevision:1}).data).toEqual({expectedRevision:1,parentVisible:false});
 });
});
