import{describe,it,expect}from'vitest';import * as contracts from'@cuevo/contracts';import type{z}from'zod';
import{CurriculumLifecycleService}from'../../src/modules/curriculum/lifecycle.service';import type{Database}from'../../src/platform/database/database';import type{ActorContext}from'@cuevo/domain';
const id='40000000-0000-4000-8000-000000000001';
describe('technical curriculum lifecycle contract',()=>{
 it('requires reviewed exact artifact context and current revision, never caller readiness claims',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).curriculumLifecycleSchema;expect(schema).toBeDefined();
  const input={state:'ACTIVE',expectedRevision:1,reviewBasis:'LOCKED_ARTIFACT',artifactDirectory:'synthetic-primary-v1',replacementVersionId:null,reason:'Technical source review approved.',confirmTransition:true};expect(schema.safeParse(input).success).toBe(true);
  for(const change of [{customerReady:true},{confirmTransition:false},{expectedRevision:0},{state:'CUSTOMER_READY'},{artifactDirectory:'../outside'}])expect(schema.safeParse({...input,...change}).success).toBe(false);
  expect(schema.safeParse({...input,state:'SUPERSEDED',replacementVersionId:id}).success).toBe(true);
 });
 it('refuses unavailable locked artifact bytes before a lifecycle database mutation',async()=>{
  let writes=0;const database={actorTransaction:async()=>{writes++;throw Error('Unexpected mutation');}}as unknown as Database;const service=new CurriculumLifecycleService(database);const actor:ActorContext={userId:id,schoolId:id,membershipId:id,role:'admin',entitlements:['curriculum']};
  await expect(service.transition(actor,id,{state:'APPROVED',expectedRevision:1,reviewBasis:'LOCKED_ARTIFACT',artifactDirectory:'missing-authoritative-artifact',replacementVersionId:null,reason:'Must not infer absent bytes.',confirmTransition:true},'source-review-key','source-review')).rejects.toBeDefined();expect(writes).toBe(0);
 });
 it('rejects lifecycle history pages larger than the source limit before database reads',async()=>{
  let reads=0;const database={actorTransaction:async()=>{reads++;throw Error('Unexpected read');}}as unknown as Database;const service=new CurriculumLifecycleService(database);const actor:ActorContext={userId:id,schoolId:id,membershipId:id,role:'admin',entitlements:['curriculum']};await expect(service.read(actor,id,{limit:26})).rejects.toBeDefined();expect(reads).toBe(0);
 });
});
