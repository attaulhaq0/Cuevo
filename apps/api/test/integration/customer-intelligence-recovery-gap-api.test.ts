import 'reflect-metadata';
import {afterAll,beforeAll,describe,expect,it}from'vitest';
import {randomUUID}from'node:crypto';
import {readFile}from'node:fs/promises';
import {config as dotenv}from'dotenv';
import {Module}from'@nestjs/common';
import {NestFactory}from'@nestjs/core';
import {FastifyAdapter,type NestFastifyApplication}from'@nestjs/platform-fastify';
import {createClient}from'@supabase/supabase-js';
import type{PoolClient}from'pg';
import {parseServerConfig}from'@cuevo/config';
import type{Database}from'../../src/platform/database/database';
import {IdentityService,type MembershipRow}from'../../src/platform/identity/identity.service';
import {createUserVerifier}from'../../src/platform/identity/supabase-auth';
import {createImprovementController}from'../../src/modules/improvement/improvement.controller';
import {IntelligenceService}from'../../src/modules/improvement/intelligence.service';
import {createFixtureProvider}from'../../src/modules/improvement/fixture-provider';
import type{AIProvider}from'../../src/modules/improvement/orchestrator';
import {createCustomerContext,customerActor,customerCourse,customerReleased,type CustomerContext}from'./customer-test-context';

dotenv({path:'.env.local',quiet:true});
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
type ProviderInput=Parameters<AIProvider['generate']>[0];
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}

describe.skipIf(!enabled)('current intelligence recovery after historical correction and unused context additions',()=>{
 let context:CustomerContext;let app:NestFastifyApplication;let token:string;
 let providerCalls=0;let hold:{entered:ReturnType<typeof deferred<ProviderInput>>;release:ReturnType<typeof deferred<void>>}|undefined;
 beforeAll(async()=>{
  context=await createCustomerContext();
  const config=parseServerConfig({...process.env,NODE_ENV:'test',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true',AI_TIMEOUT_MS:'10000'});
  const password=(JSON.parse(await readFile('.local/runtime-secrets.json','utf8'))as{syntheticPassword:string}).syntheticPassword;
  const identities=(JSON.parse(await readFile('supabase/seed/identities.json','utf8'))as{actors:{actorId:string;email:string}[]}).actors;
  const teacher=identities.find(actor=>actor.actorId===customerActor(4));if(!teacher)throw Error('Verified synthetic teacher required.');
  const auth=createClient(config.supabaseUrl!,config.supabasePublishableKey!,{auth:{persistSession:false,autoRefreshToken:false}});
  const session=await auth.auth.signInWithPassword({email:teacher.email,password});if(!session.data.session)throw Error('Synthetic teacher login unavailable.');token=session.data.session.access_token;
  // Share the isolated rollback tenant; all controller SQL still runs as the real restricted API role.
  const database={actorTransaction:async<T>(actor:string,school:string|undefined,run:(client:PoolClient)=>Promise<T>)=>{
   await context.client.query('SAVEPOINT intelligence_recovery_request');await context.client.query('set local role cuevo_api');
   try{await context.client.query("set local statement_timeout='5s'");await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)",[actor,school??'']);const result=await run(context.client);await context.client.query('reset role');await context.client.query("set local statement_timeout='0'");await context.client.query('RELEASE SAVEPOINT intelligence_recovery_request');return result;}
   catch(error){await context.client.query('ROLLBACK TO SAVEPOINT intelligence_recovery_request');await context.client.query('reset role');await context.client.query('RELEASE SAVEPOINT intelligence_recovery_request');throw error;}
  }}as unknown as Database;
  const identity=new IdentityService({verifyUser:createUserVerifier(config),currentMemberships:actor=>database.actorTransaction(actor,undefined,async client=>(await client.query<MembershipRow>('select*from "authorization".current_memberships()')).rows),isCurrentSession:(actor,id)=>database.actorTransaction(actor,undefined,async client=>Boolean((await client.query('select "authorization".is_current_session($1)as active',[id])).rows[0]?.active))});
  const fixture=createFixtureProvider();const provider:AIProvider={generate:async input=>{providerCalls++;const gate=hold;if(gate){hold=undefined;gate.entered.resolve(input);await gate.release.promise;}return fixture.generate(input);}};
  const controller=createImprovementController(identity,database,new IntelligenceService(identity,database,config,provider));
  @Module({controllers:[controller]})class IntelligenceRecoveryModule{}
  app=await NestFactory.create<NestFastifyApplication>(IntelligenceRecoveryModule,new FastifyAdapter({logger:false}),{logger:false});await app.init();await app.getHttpAdapter().getInstance().ready();
 },30000);
 afterAll(async()=>{try{await app?.close();}finally{await context?.close();}});
 const request=(path:string,body?:Record<string,unknown>,key=randomUUID())=>app.inject({method:body===undefined?'GET':'POST',url:path,headers:{authorization:`Bearer ${token}`,'x-school-id':context.school,'idempotency-key':key},payload:body});
 const analyze=async(resultId:string,key=randomUUID())=>{const response=await request('/v1/intelligence/analyze',{baselineResultId:resultId},key);expect(response.statusCode,response.body).toBe(200);return response.json()as{id:string;intelligenceRunId:string;baselineResultId:string;status:string};};

 it('IG15 a fresh current baseline remains usable after a prior intervention baseline is corrected',async()=>{
  const course=await customerCourse(context,'Fresh review after an earlier correction');
  const old=await customerReleased(context,'strong',course.courseId,'Earlier reviewed explanation',2);
  const original=await analyze(old.resultId);
  const decision=await context.command('teacher',`/v1/recommendations/${original.id}/decision`,{decision:'APPROVE',reason:'Teacher approved the earlier source and practice.'});
  const marking=await context.command('teacher',`/v1/submissions/${old.submissionId}/results`,{score:4,feedback:'Teacher corrected the earlier marking.',expectedPolicyVersion:2,expectedRevision:1,sourceEvidence:true});
  const correction=await context.command('teacher',`/v1/results/${marking.id}/release`,{expectedRevision:2,parentVisible:true});expect(correction.id).not.toBe(old.resultId);
  // The historical source is still readable, while its old generated command authority is deliberately denied.
  expect((await context.request('strong',`/v1/evidence/${old.evidenceId}`)).statusCode).toBe(200);
  expect((await request(`/v1/intelligence/runs/${original.intelligenceRunId}/context`)).statusCode).toBe(403);
  expect((await request('/v1/intelligence/analyze',{baselineResultId:old.resultId})).statusCode).toBe(403);
  const history=await context.request('teacher','/v1/interventions?limit=100');expect(history.statusCode,history.body).toBe(200);
  expect(history.json().items.find((item:{id:string})=>item.id===decision.interventionId)).toMatchObject({baselineResultId:old.resultId,requiresReview:true,status:'ASSIGNED'});
  const fresh=await customerReleased(context,'strong',course.courseId,'New explanation for current review',5);const key=randomUUID();const calls=providerCalls;
  const proposal=await analyze(fresh.resultId,key);expect(proposal).toMatchObject({baselineResultId:fresh.resultId,status:'AWAITING_HUMAN'});
  const disclosure=await request(`/v1/intelligence/runs/${proposal.intelligenceRunId}/context`);expect(disclosure.statusCode,disclosure.body).toBe(200);
  const replay=await request('/v1/intelligence/analyze',{baselineResultId:fresh.resultId},key);expect(replay.statusCode,replay.body).toBe(200);expect(replay.json()).toEqual(proposal);expect(providerCalls).toBe(calls+1);
  const approved=await request(`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Teacher reviewed the valid new source, keeping earlier history distinct.'});expect(approved.statusCode,approved.body).toBe(200);expect(approved.json().interventionId).toEqual(expect.any(String));
  expect((await request(`/v1/intelligence/runs/${original.intelligenceRunId}/context`)).statusCode).toBe(403);
  expect((await context.client.query('select count(*)::integer count from app.recommendations where school_id=$1 and intelligence_run_id=$2',[context.school,proposal.intelligenceRunId])).rows[0].count).toBe(1);
 },30000);

 it('IG16 an unused authorized option added during generation does not invalidate the saved source or repeat the provider call',async()=>{
  const course=await customerCourse(context,'Saved analysis while learning options expand');
  const baseline=await customerReleased(context,'strong',course.courseId,'Current explanation source',3);const key=randomUUID();const calls=providerCalls;
  const gate={entered:deferred<ProviderInput>(),release:deferred<void>()};hold=gate;
  const pending=request('/v1/intelligence/analyze',{baselineResultId:baseline.resultId},key);let settled=false;void pending.then(()=>{settled=true;},()=>{settled=true;});
  try{
   const supplied=await Promise.race([gate.entered.promise,pending.then(()=>{throw Error('Analysis ended before the deterministic provider was reached.');})]);
   expect(supplied.context.resultId).toBe(baseline.resultId);expect(supplied.insight?.learningOptions.map(option=>option.activityId)).toContain(course.practiceId);expect(settled).toBe(false);
   const run=(await context.client.query('select id,state from app.intelligence_runs where school_id=$1 and actor_id=$2 and command_key=$3',[context.school,customerActor(4),key])).rows[0];expect(run).toMatchObject({id:expect.any(String),state:'REASONING'});
   const option=await context.command('teacher',`/v1/lessons/${course.lessonId}/activities`,{title:'Another authorized worked example',kind:'practice',instructions:'A later option the in-flight proposal did not use.',sequence:2});
   expect(supplied.insight?.learningOptions.some(item=>item.activityId===option.id)).toBe(false);
   const saved=await request(`/v1/intelligence/runs/${run.id}/context`);expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().context.learningOptions.map((item:{activityId:string})=>item.activityId)).toContain(course.practiceId);expect(saved.json().context.learningOptions.some((item:{activityId:string})=>item.activityId===option.id)).toBe(false);
   gate.release.resolve();const completed=await pending;expect(completed.statusCode,completed.body).toBe(200);const proposal=completed.json();expect(proposal).toMatchObject({intelligenceRunId:run.id,baselineResultId:baseline.resultId,status:'AWAITING_HUMAN'});
   const replay=await request('/v1/intelligence/analyze',{baselineResultId:baseline.resultId},key);expect(replay.statusCode,replay.body).toBe(200);expect(replay.json()).toEqual(proposal);expect(providerCalls).toBe(calls+1);
   const approved=await request(`/v1/recommendations/${proposal.id}/decision`,{decision:'APPROVE',reason:'Teacher approved the original still-authorized source and learning option.'});expect(approved.statusCode,approved.body).toBe(200);
   expect((await context.client.query('select count(*)::integer count from app.recommendations where school_id=$1 and intelligence_run_id=$2',[context.school,run.id])).rows[0].count).toBe(1);
   // Genuine loss of the saved source remains a denial; accepting an unused addition must not weaken this guard.
   const marking=await context.command('teacher',`/v1/submissions/${baseline.submissionId}/results`,{score:6,feedback:'Correction after the accepted proposal.',expectedPolicyVersion:2,expectedRevision:1,sourceEvidence:true});await context.command('teacher',`/v1/results/${marking.id}/release`,{expectedRevision:2,parentVisible:true});
   expect((await request(`/v1/intelligence/runs/${run.id}/context`)).statusCode).toBe(403);
  }finally{hold=undefined;gate.release.resolve();await pending;}
 },30000);
});
