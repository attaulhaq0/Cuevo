import { describe, expect, it } from 'vitest';
import { observeScaleQuery, scaleDiagnosticClient, scaleSetupFailure, scaleSqlStage, scaleSqlState, type ScaleQueryFailure } from '../integration/scale-query-diagnostics';
import { AcademicService } from '../../src/modules/academic/academic.service';
import type { Database } from '../../src/platform/database/database';
import type { ActorContext } from '@cuevo/domain';

describe('scale-only query diagnostics', () => {
  it('keeps SQLSTATE unknown without reading accessors or coercing private objects', () => {
    let read = 0;
    const accessor = Object.defineProperty({}, 'code', { get() { read++; throw Error('private'); } });
    for (const error of [null, undefined, accessor, {code:{toString(){throw Error('private');}}}, {code:'private-error'}, Object.create({code:'57014'}), new Proxy({}, {getOwnPropertyDescriptor(){throw Error('private');}})]) expect(scaleSqlState(error)).toBeNull();
    expect(read).toBe(0); expect(scaleSqlState({code:'57014',message:'private learner'})).toBe('57014');
  });
  it('executes the actual wrapped query once, preserves bindings and original rejection even when collection throws', async () => {
    const original = {code:'57014',message:'private',detail:'private'};
    const calls: unknown[][]=[]; const values=['private-id']; const client={query:async(...args:unknown[])=>{calls.push(args);throw original;}, marker:1};
    const wrapped=scaleDiagnosticClient(client,()=>{throw Error('collector failed');});
    await expect(wrapped.query('select internal.release_marking($1,$2,$3)as id',values)).rejects.toBe(original);
    expect(calls).toEqual([['select internal.release_marking($1,$2,$3)as id',values]]); expect(wrapped.marker).toBe(1); expect(scaleDiagnosticClient(client)).toBe(client);
  });
  it('success is silent and fixed output contains no SQL, parameters, error fields or object serialization', async () => {
    const rows: ScaleQueryFailure[]=[]; let clock=10;
    expect(await observeScaleQuery('private SQL',async()=>7,row=>rows.push(row),()=>clock)).toBe(7);expect(rows).toEqual([]);
    const original={code:'40P01',message:'private',stack:'private',toJSON(){throw Error('private');}};
    await expect(observeScaleQuery('select pg_advisory_xact_lock(hashtextextended($1,0))',async()=>{clock=5010;throw original;},row=>rows.push(row),()=>clock)).rejects.toBe(original);
    expect(rows).toEqual([{stage:'RELEASE_LOCK',sqlState:'40P01',durationMs:5000}]);expect(JSON.stringify(scaleSetupFailure(74,74,'result.released',rows[0]))).not.toContain('private');
  });
  it('known stage and bounded timing differ from unknown or absent observations', async () => {
    expect(scaleSqlStage('select internal.finish_command($1,$2,$3,$4::jsonb)')).toBe('IDEMPOTENCY_FINISH');expect(scaleSqlStage({text:'private'})).toBe('UNKNOWN');
    expect(scaleSetupFailure(74,74,'result.released',null).query).toBeNull();expect(()=>scaleSetupFailure(100,74,'private',null)).toThrow();
    const rows:ScaleQueryFailure[]=[];let clock=0;await expect(observeScaleQuery('private SQL',async()=>{clock=900000;throw null;},row=>rows.push(row),()=>clock)).rejects.toBeNull();expect(rows).toEqual([{stage:'UNKNOWN',sqlState:null,durationMs:180000}]);
  });
  it('refuses accessor, extra-field and invalid query observations before output serialization', () => {
    let read=0;const accessor=Object.defineProperty({},'stage',{get(){read++;return'private';}});
    for(const query of [accessor,{stage:{toJSON(){return'private';}},sqlState:null,durationMs:0},{stage:'RELEASE_NATIVE',sqlState:'private',durationMs:0},{stage:'RELEASE_NATIVE',sqlState:null,durationMs:Infinity},{stage:'RELEASE_NATIVE',sqlState:null,durationMs:0,private:'learner'}]) expect(()=>scaleSetupFailure(74,74,'result.released',query as ScaleQueryFailure)).toThrow();
    expect(read).toBe(0);
  });
  it('classifies every fixed academic release boundary without exposing SQL text', () => {
    const stages = [
      ['select *from "authorization".current_memberships()', 'IDENTITY'],
      ['select "authorization".academic_access($1)and(scope)as allowed', 'ACADEMIC_AUTHORIZATION'],
      ['select course_id as id from app.assessments where school_id=$1 and id=(select assessment_id from app.submissions where id=$2)', 'RELEASE_COURSE'],
      ['select internal.require_curriculum_academic_write($1)', 'CURRICULUM_WRITE'],
      ['select internal.begin_command($1,$2,$3)as reservation', 'IDEMPOTENCY_BEGIN'],
      ['select pg_advisory_xact_lock(hashtextextended($1,0))', 'RELEASE_LOCK'],
      ['select *from(select r.id,r.submission_id from exact_source)existing_native_result', 'RELEASE_EXISTING'],
      ["select 'numeric'as model from app.marking_revisions where id=$1 union all select 'rubric'as model from app.rubric_marking_revisions where id=$1", 'RELEASE_KIND'],
      ['select internal.release_marking($1,$2,$3)as id', 'RELEASE_NATIVE'],
      ['select r.id,r.submission_id from exact_source where r.id=$1', 'RELEASE_PROJECTION'],
      ['select internal.append_audit($1,$2,$3,$4,$5,$6::jsonb)', 'AUDIT'],
      ['select internal.enqueue_event($1,$2,$3,$4,$5::jsonb,$6)', 'OUTBOX'],
      ['select internal.finish_command($1,$2,$3,$4::jsonb)', 'IDEMPOTENCY_FINISH'],
    ];
    for(const [sql,stage]of stages)expect(scaleSqlStage(sql)).toBe(stage);
    expect(scaleSqlStage('select private pupil content')).toBe('UNKNOWN');
    for(const code of ['57014','40P01','40001','55P03','42501','22023','23502','23503','23505','23514','55000'])expect(scaleSqlState({code})).toBe(code);
  });
  it('retains the exact driver rejection when a clock or diagnostic observer is unavailable',async()=>{
    const original=Error('private driver detail');let calls=0;
    await expect(observeScaleQuery('private SQL',async()=>{calls++;throw original;},()=>{throw Error('private observer');},()=>{throw Error('private clock');})).rejects.toBe(original);expect(calls).toBe(1);
  });
  it('keeps an unobserved clock nullable instead of reporting zero',async()=>{
    const records:ScaleQueryFailure[]=[];let clockReads=0;const original={code:'57014'};
    await expect(observeScaleQuery('select internal.release_marking($1,$2,$3)as id',async()=>{throw original;},record=>records.push(record),()=>{if(clockReads++===0)throw Error('private clock');return 5;})).rejects.toBe(original);
    expect(records).toEqual([{stage:'RELEASE_NATIVE',sqlState:'57014',durationMs:null}]);
    let tick=2;const negative:ScaleQueryFailure[]=[];await expect(observeScaleQuery('private SQL',async()=>{tick=1;throw original;},record=>negative.push(record),()=>tick)).rejects.toBe(original);expect(negative[0].durationMs).toBeNull();
  });
  it('observes the actual Academic release failure before unchanged SQLSTATE-to-503 mapping',async()=>{
    const original={code:'57014',message:'private SQL failure'};const records:ScaleQueryFailure[]=[];let failedQueries=0;
    const client={query:async(sql:string)=>{if(sql.includes('as allowed'))return{rows:[{allowed:true}]};if(sql.startsWith('select course_id as id'))return{rows:[{id:'e9000000-0000-4000-8000-000000000001'}]};if(sql.includes('begin_command'))return{rows:[{reservation:{state:'NEW'}}]};if(sql.includes('existing_native_result')){failedQueries++;throw original;}return{rows:[{}]};}};
    const wrapped=scaleDiagnosticClient(client,record=>records.push(record));const database={actorTransaction:async(_actor:string,_school:string,run:(connection:unknown)=>Promise<unknown>)=>run(wrapped)}as unknown as Database;
    const actor:ActorContext={userId:'e9000000-0000-4000-8000-000000000002',schoolId:'e9000000-0000-4000-8000-000000000003',membershipId:'e9000000-0000-4000-8000-000000000004',role:'teacher',entitlements:['assessment','curriculum']};
    await expect(new AcademicService(database).command(actor,'result.release','e9000000-0000-4000-8000-000000000005',{expectedRevision:1,parentVisible:true},'scale-release-diagnostic','request')).rejects.toMatchObject({code:'REQUEST_UNAVAILABLE',status:503});
    expect(failedQueries).toBe(1);expect(records).toHaveLength(1);expect(records[0]).toMatchObject({stage:'RELEASE_EXISTING',sqlState:'57014'});expect(JSON.stringify(records)).not.toContain('private');
  });
});
