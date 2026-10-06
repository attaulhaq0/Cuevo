import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import { IntelligenceService } from '../../src/modules/improvement/intelligence.service';
import type { Database } from '../../src/platform/database/database';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import type { PoolClient } from 'pg';
import {intelligenceExecutionManifest}from'../../src/modules/improvement/execution-manifest';
const actor={userId:'26000000-0000-4000-8000-000000000001',schoolId:'26000000-0000-4000-8000-000000000002',membershipId:'26000000-0000-4000-8000-000000000003',role:'admin' as const,entitlements:['improvement']};
describe('execution registry current service manifest',()=>{
 it('permits an explicit hosted school approval command and sends truthful manifest provenance',async()=>{
  const projectRef='abcdefghijklmnopqrst';
  const config=parseServerConfig({NODE_ENV:'production',CUEVO_DEPLOYMENT_ENVIRONMENT:'synthetic-staging',CUEVO_SYNTHETIC_PROJECT_REF:projectRef,CUEVO_SYNTHETIC_WEB_ORIGIN:'https://cuevo.example',API_ALLOWED_ORIGIN:'https://cuevo.example',DATABASE_URL:`postgresql://cuevo_api:private@db.${projectRef}.supabase.co:5432/postgres`,SUPABASE_URL:`https://${projectRef}.supabase.co`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'},'api');
  const manifests:unknown[]=[];
  const policy={id:actor.schoolId,policy:{version:2,purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['GUIDED_PRACTICE'],approvedAt:'2026-10-02T00:00:00Z'}};
  const database={actorTransaction:async(_user:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async(sql:string,values:unknown[])=>{if(sql.includes('approve_intelligence_execution'))manifests.push(JSON.parse(String(values[0])));return{rows:[{policy}]};}}as unknown as PoolClient)}as unknown as Database;
  await new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,database,config).schoolPolicy('Bearer actor',actor.schoolId,{purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['GUIDED_PRACTICE'],expectedVersion:1,confirmApproval:true,reason:'Explicit hosted synthetic school approval.'},'hosted-confirmation');
  expect(manifests).toEqual([expect.objectContaining({providerDataPolicy:'HOSTED_SYNTHETIC_FIXTURE'})]);
 });
 const fixtureConfig=parseServerConfig({NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:56321',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'});
 const currentPolicy={version:2,dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false};
 const manifest=intelligenceExecutionManifest(fixtureConfig,'SCHOOL_CUSTOM_NUMERIC')!;
 const binding={id:'26000000-0000-4000-8000-000000000004',version:1,policyVersion:2,manifest,approvedBy:actor.userId,effectiveAt:'2026-10-01T00:00:00Z',approvalSource:'EXPLICIT_SCHOOL_POLICY'};
 function registry(policy:unknown,bound:unknown=binding,config=fixtureConfig){const identity={resolve:async()=>actor}as unknown as IdentityService;const database={actorTransaction:async(_user:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async()=>({rows:[{policy,binding:bound,classification:'SCHOOL_CUSTOM_NUMERIC'}]})}as unknown as PoolClient)}as unknown as Database;return new IntelligenceService(identity,database,config).executionRegistry('Bearer actor',actor.schoolId);}
 it.each([
  ['paused mode',{...currentPolicy,fixtureEnabled:false},binding],
  ['changed current policy',{...currentPolicy,version:3},binding],
  ['future approval',currentPolicy,{...binding,effectiveAt:'2999-01-01T00:00:00Z'}],
  ['missing current policy',null,binding],
  ['changed manifest',currentPolicy,{...binding,manifest:{...manifest,maxCost:manifest.maxCost+1}}],
 ])('does not present %s as current approval',async(_name,policy,bound)=>{await expect(registry(policy,bound)).resolves.toMatchObject({status:'REQUIRES_APPROVAL',binding:bound});});
 it('approves only an effective exact manifest under its enabled current policy',async()=>{await expect(registry(currentPolicy)).resolves.toMatchObject({status:'APPROVED',binding});});
 it('discloses no fabricated approved binding when server configuration is unavailable',async()=>{
  const identity={resolve:async()=>actor}as unknown as IdentityService;const database={actorTransaction:async(_user:string,_school:string,run:(client:unknown)=>unknown)=>run({query:async()=>({rows:[{binding:null,policy:{dataClassification:'SCHOOL_CUSTOM_NUMERIC'}}]})})}as unknown as Database;
  const service=new IntelligenceService(identity,database,parseServerConfig({NODE_ENV:'test'}));
  await expect(service.executionRegistry('Bearer actor',actor.schoolId)).resolves.toMatchObject({current:null,binding:null,status:'SERVER_UNAVAILABLE'});
 });
 it('binds the approval command fingerprint to the exact server manifest',async()=>{
  const fingerprints:string[]=[];const identity={resolve:async()=>actor}as unknown as IdentityService;
  const policy={id:actor.schoolId,policy:{version:2,purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['GUIDED_PRACTICE'],approvedAt:'2026-10-02T00:00:00Z'}};
  const database={actorTransaction:async(_user:string,_school:string,run:(client:PoolClient)=>Promise<unknown>)=>run({query:async(sql:string,values:unknown[])=>{if(sql.includes('approve_school_intelligence_policy'))fingerprints.push(String(values[2]));return{rows:[{policy}]};}}as unknown as PoolClient)}as unknown as Database;
  const config=parseServerConfig({NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:56321',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'});const input={purpose:'NEXT_LEARNING_ACTION',dataClassification:'SCHOOL_CUSTOM_NUMERIC',fixtureEnabled:true,liveEnabled:false,allowedActions:['GUIDED_PRACTICE'],expectedVersion:1,confirmApproval:true,reason:'Explicit configured task approval.'};
  await new IntelligenceService(identity,database,config).schoolPolicy('Bearer actor',actor.schoolId,input,'same-confirmation');
  await new IntelligenceService(identity,database,{...config,intelligence:{...config.intelligence,maxTokens:2000}}).schoolPolicy('Bearer actor',actor.schoolId,input,'same-confirmation');
  expect(fingerprints).toHaveLength(2);expect(fingerprints[0]).not.toBe(fingerprints[1]);
 });
});
