import 'reflect-metadata';
import {describe,it,expect} from 'vitest';
import {Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {FastifyAdapter,type NestFastifyApplication} from '@nestjs/platform-fastify';
import type {Database} from '../../src/platform/database/database';
import type {IdentityService} from '../../src/platform/identity/identity.service';
import type {ActorContext} from '@cuevo/domain';
import {createImprovementController} from '../../src/modules/improvement/improvement.controller';
import {measureDiagnosticDatabase,measureFailureRecord,measureSqlStage} from '../integration/improvement-measure-diagnostics';
import type {ScaleQueryFailure} from '../integration/scale-query-diagnostics';
import {observeScaleQuery} from '../integration/scale-query-diagnostics';

describe('test-only exact measurement failure diagnostic',()=>{
 it('classifies the known measurement statements without revealing SQL or private bindings',()=>{
  const phases=[['select "authorization".can_access_intervention($1,$2,true)as allowed','IMPROVEMENT_AUTHORIZATION'],['select internal.begin_command($1,$2,$3)as reservation','IDEMPOTENCY_BEGIN'],['select pg_advisory_xact_lock(hashtextextended($1,0))','MEASURE_LOCK'],['select internal.measure_intervention($1,$2,$3)as id','MEASURE_NATIVE'],['select o.id,internal.intervention_outcome_projection(o.id)as source,private from app.outcome_measurements o where o.id=$1','MEASURE_PROJECTION'],['select internal.improvement_event_exists($1)as existing','OUTBOX_LOOKUP'],['select internal.append_audit($1,$2,$3,$4,$5,$6::jsonb)','AUDIT'],['select internal.enqueue_event($1,$2,$3,$4,$5::jsonb,$6)','OUTBOX'],['select internal.finish_command($1,$2,$3,$4::jsonb)','IDEMPOTENCY_FINISH']];
  for(const[sql,stage]of phases)expect(measureSqlStage(sql)).toBe(stage);expect(measureSqlStage({text:'private'})).toBe('UNKNOWN');expect(measureSqlStage('select private pupil source')).toBe('UNKNOWN');
 });
 it('scope wrapping preserves the original client result and executes once with no unrelated observations',async()=>{
  const original={code:'57014',message:'private source',detail:'private',stack:'private'};const records:ScaleQueryFailure[]=[],calls:unknown[][]=[];const client={query:async(...args:unknown[])=>{calls.push(args);throw original;}};
  const db={actorTransaction:async(_actor:string,_school:string,run:(c:unknown)=>Promise<unknown>)=>run(client),marker:9}as unknown as Database;
  const observed=measureDiagnosticDatabase(db,row=>records.push(row));const operation=()=>observed.database.actorTransaction('private actor','private school',c=>c.query('select internal.measure_intervention($1,$2,$3)as id',['private source']));
  await expect(operation()).rejects.toBe(original);expect(records).toEqual([]);await expect(observed.run(operation)).rejects.toBe(original);expect(calls).toEqual([['select internal.measure_intervention($1,$2,$3)as id',['private source']],['select internal.measure_intervention($1,$2,$3)as id',['private source']]]);expect(records).toHaveLength(1);expect(records[0]).toMatchObject({stage:'MEASURE_NATIVE',sqlState:'57014'});expect(JSON.stringify(records)).not.toContain('private');
 });
 it('successful current queries remain silent and return the exact result without another statement',async()=>{
  const records:ScaleQueryFailure[]=[],result={rows:[{id:'private source'}]};let calls=0;const db={actorTransaction:async(_a:string,_s:string,run:(c:unknown)=>Promise<unknown>)=>run({query:async()=>{calls++;return result;}})}as unknown as Database;const diagnostic=measureDiagnosticDatabase(db,row=>records.push(row));expect(await diagnostic.run(()=>diagnostic.database.actorTransaction('private actor','private school',c=>c.query('select internal.measure_intervention($1,$2,$3)as id')))).toBe(result);expect(calls).toBe(1);expect(records).toEqual([]);
 });
 it('observer failure and unavailable clocks cannot replace the driver rejection; unknown remains nullable and time is capped',async()=>{
  const original={code:'57014',toJSON(){throw Error('private');}};const client={query:async()=>{throw original;}};const db={actorTransaction:async(_a:string,_s:string,run:(c:unknown)=>Promise<unknown>)=>run(client)}as unknown as Database;
  const observed=measureDiagnosticDatabase(db,()=>{throw Error('collector');});await expect(observed.run(()=>observed.database.actorTransaction('a','s',c=>c.query('private')))).rejects.toBe(original);
  expect(measureFailureRecord({stage:'UNKNOWN',sqlState:null,durationMs:null})).toEqual({code:'IMPROVEMENT_MEASURE_QUERY_FAILED',stage:'UNKNOWN',sqlState:null,durationMs:null});
  for(const failure of [{stage:'MEASURE_NATIVE',sqlState:'private',durationMs:1},{stage:'MEASURE_NATIVE',sqlState:null,durationMs:180001},{stage:'MEASURE_NATIVE',sqlState:null,durationMs:Infinity},{stage:'MEASURE_NATIVE',sqlState:null,durationMs:0,query:'private'},Object.defineProperty({},'stage',{get(){throw Error('private');}})])expect(()=>measureFailureRecord(failure as ScaleQueryFailure)).toThrow();
 });
 it('holds opt-in until the original operation settles and refuses overlapping measurement observation',async()=>{
  let release!:()=>void;const records:ScaleQueryFailure[]=[];const client={query:async()=>{throw{code:'57014'};}};const db={actorTransaction:async(_a:string,_s:string,run:(c:unknown)=>Promise<unknown>)=>run(client)}as unknown as Database;const diagnostic=measureDiagnosticDatabase(db,row=>records.push(row));
  const first=diagnostic.run(async()=>{await new Promise<void>(done=>{release=done;});return 7;});await expect(diagnostic.run(async()=>8)).rejects.toThrow('One diagnostic measurement');release();await expect(first).resolves.toBe(7);await expect(diagnostic.database.actorTransaction('a','s',c=>c.query('select internal.measure_intervention($1,$2,$3)as id'))).rejects.toMatchObject({code:'57014'});expect(records).toEqual([]);
  const rows:ScaleQueryFailure[]=[];let clock=0;const original={code:'57014'};await expect(observeScaleQuery('select internal.measure_intervention($1,$2,$3)as id',async()=>{clock=900000;throw original;},row=>rows.push(row),()=>clock,measureSqlStage)).rejects.toBe(original);expect(rows).toEqual([{stage:'MEASURE_NATIVE',sqlState:'57014',durationMs:180000}]);
 });
 for(const phase of ['MEASURE_NATIVE','MEASURE_PROJECTION']as const)it(`captures ${phase} before the actual controller preserves its sanitized503`,async()=>{
  const records:ScaleQueryFailure[]=[],calls:string[]=[];const source='d1000000-0000-4000-8000-000000000001';const client={query:async(sql:string)=>{calls.push(sql);if(sql.includes('as allowed'))return{rows:[{allowed:true}]};if(sql.includes('begin_command'))return{rows:[{reservation:{state:'NEW'}}]};if(sql==='select internal.measure_intervention($1,$2,$3)as id'){if(phase==='MEASURE_NATIVE')throw{code:'57014',message:'private SQL'};return{rows:[{id:source}]};}if(sql.startsWith('select o.id,internal.intervention_outcome_projection'))throw{code:'40P01',detail:'private source'};return{rows:[{}]};}};
  const original={actorTransaction:async(_a:string,_s:string,run:(c:unknown)=>Promise<unknown>)=>run(client)}as unknown as Database;const diagnostic=measureDiagnosticDatabase(original,row=>records.push(row));const actor:ActorContext={userId:source,schoolId:source,membershipId:source,role:'teacher',entitlements:['improvement']};const identity={resolve:async()=>actor}as unknown as IdentityService;
  @Module({controllers:[createImprovementController(identity,diagnostic.database)]})class TestModule{}let app:NestFastifyApplication|undefined;try{app=await NestFactory.create<NestFastifyApplication>(TestModule,new FastifyAdapter({logger:false}),{logger:false});await app.init();await app.getHttpAdapter().getInstance().ready();const response=await diagnostic.run(()=>app!.inject({method:'POST',url:'/v1/interventions/'+source+'/measure',headers:{authorization:'Bearer synthetic','x-school-id':source,'idempotency-key':'measure-diagnostic-original'},payload:{followUpResultId:source,minimumChange:2}}));expect(response.statusCode).toBe(503);expect(response.json()).toMatchObject({code:'REQUEST_UNAVAILABLE',message:'Improvement services are temporarily unavailable.'});expect(records).toHaveLength(1);expect(records[0]).toMatchObject({stage:phase,sqlState:phase==='MEASURE_NATIVE'?'57014':'40P01'});expect(calls.filter(x=>x==='select internal.measure_intervention($1,$2,$3)as id')).toHaveLength(1);expect(JSON.stringify(records)).not.toMatch(/private|Bearer|d100|original/);}finally{await app?.close();}
 });
});
