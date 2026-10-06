import { describe, expect, it } from 'vitest';
import { CustomerAssessmentPhaseDiagnostics, serializeCustomerAssessmentFailure } from '../integration/customer-assessment-phase-diagnostics';
import { CooperativeFixtureScope } from '../integration/cooperative-fixture-scope';
import { withFixtureCleanup } from '../integration/fixture-cleanup';

const record = () => ({ schemaVersion:'1', code:'CUSTOMER_ASSESSMENT_REVOCATION_UNVERIFIED', budgetMs:30000, elapsedMs:0, phases:[{phase:'ENROLLMENT_REVOKE',status:'REJECTED',elapsedMs:0,httpResponses:0,lastHttpStatus:null,queryFailure:null}],truncated:false });
describe('customer assessment revocation phase diagnostics', () => {
  it('is silent on success and invokes each original operation once', async () => {
    let calls=0; const logs:string[]=[]; const diagnostic=new CustomerAssessmentPhaseDiagnostics(()=>0);
    expect(await diagnostic.run(()=>diagnostic.phase('ENROLLMENT_REVOKE',async()=>{calls++;return 7;}))).toBe(7);
    diagnostic.emitFailure(value=>logs.push(value)); expect(calls).toBe(1);expect(logs).toEqual([]);
  });
  it('reports only fixed phase metadata once after preserving the exact original rejection', async () => {
    let clock=10; const logs:string[]=[]; const original={code:'57014',message:'private pupil content',stack:'private SQL',toJSON(){throw Error('private');}};
    const diagnostic=new CustomerAssessmentPhaseDiagnostics(()=>clock);
    await expect(diagnostic.run(async()=>{
      await diagnostic.phase('ENROLLMENT_REVOKE',async()=>{clock=12;});
      await diagnostic.phase('REVOKED_PAGE',async()=>{diagnostic.httpStatus(200);clock=5012;diagnostic.queryFailure({stage:'UNKNOWN',sqlState:'57014',durationMs:5000});throw original;});
    })).rejects.toBe(original);
    diagnostic.emitFailure(value=>logs.push(value));diagnostic.emitFailure(value=>logs.push(value));expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0])).toEqual({schemaVersion:'1',code:'CUSTOMER_ASSESSMENT_REVOCATION_UNVERIFIED',budgetMs:30000,elapsedMs:5002,truncated:false,phases:[
      {phase:'ENROLLMENT_REVOKE',status:'COMPLETED',elapsedMs:2,httpResponses:0,lastHttpStatus:null,queryFailure:null},
      {phase:'REVOKED_PAGE',status:'REJECTED',elapsedMs:5000,httpResponses:1,lastHttpStatus:200,queryFailure:{stage:'UNKNOWN',sqlState:'57014',durationMs:5000}},
    ]});expect(logs[0]).not.toContain('private');
  });
  it('waits for cooperative late work, keeps its original call count and reports after settlement', async () => {
    let clock=0;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});const scope=new CooperativeFixtureScope(30000,()=>clock);const diagnostic=new CustomerAssessmentPhaseDiagnostics(()=>clock);const logs:string[]=[];const order:string[]=[];
    const body=scope.run(()=>diagnostic.run(async()=>{
      await diagnostic.phase('PROGRAMME_SETUP',()=>scope.operation(async()=>{order.push('request started');await held;order.push('request settled');}));
      await diagnostic.phase('PROGRAMME_REVOKE',()=>scope.operation(async()=>{order.push('unsafe next request');}));
    }));const rejected=body.catch(error=>error);await Promise.resolve();diagnostic.emitFailure(value=>logs.push(value));expect(logs).toEqual([]);
    clock=30001;const cleanup=withFixtureCleanup(()=>scope.cancelAndWait(),[()=>{order.push('reset role');},()=>diagnostic.emitFailure(value=>{order.push('diagnostic');logs.push(value);})]);
    await Promise.resolve();expect(order).toEqual(['request started']);release();expect(await rejected).toBeInstanceOf(Error);await cleanup;
    expect(order).toEqual(['request started','request settled','reset role','diagnostic']);expect(JSON.parse(logs[0]).phases).toEqual([{phase:'PROGRAMME_SETUP',status:'REJECTED',elapsedMs:30001,httpResponses:0,lastHttpStatus:null,queryFailure:null}]);
  });
  it('retains assertion and cleanup failures when diagnostics or the clock cannot be read', async () => {
    const original=Error('private assertion');const reset=Error('private cleanup');const diagnostic=new CustomerAssessmentPhaseDiagnostics(()=>{throw Error('private clock');});let caught:unknown;
    try { await withFixtureCleanup(()=>diagnostic.run(()=>diagnostic.phase('PROGRAMME_RESTORE',async()=>{throw original;})),[()=>{throw reset;},()=>diagnostic.emitFailure(()=>{throw Error('private sink');})]); } catch(error){caught=error;}
    expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual([original,reset]);expect((caught as AggregateError).cause).toBe(original);
    const second=new CustomerAssessmentPhaseDiagnostics(()=>NaN);let json='';await expect(second.run(()=>second.phase('RESTORED_PAGE',async()=>{throw null;}))).rejects.toBeNull();second.emitFailure(value=>{json=value;});expect(JSON.parse(json).elapsedMs).toBeNull();expect(JSON.parse(json).phases[0].elapsedMs).toBeNull();
  });
  it('rejects unknown fields, arbitrary strings, accessors and serialization hooks before output', () => {
    let reads=0;const accessor=Object.defineProperty(record(),'elapsedMs',{get(){reads++;return 0;},enumerable:true});
    for(const value of [accessor,{...record(),pupil:'private'}, {...record(),toJSON(){return'private';}}, {...record(),code:'private'}, {...record(),phases:[{...record().phases[0],phase:'private'}]}, {...record(),phases:[{...record().phases[0],queryFailure:{stage:'UNKNOWN',sqlState:'private',durationMs:1}}]}, {...record(),elapsedMs:Infinity}])expect(()=>serializeCustomerAssessmentFailure(value)).toThrow();
    expect(reads).toBe(0);expect(JSON.parse(serializeCustomerAssessmentFailure(record()))).toEqual(record());
  });
  it('keeps unobserved command status null, ignores malformed observations and bounds timings/counters', async () => {
    let clock=0;const logs:string[]=[];const diagnostic=new CustomerAssessmentPhaseDiagnostics(()=>clock);const original=Error('private');let reads=0;
    await expect(diagnostic.run(()=>diagnostic.phase('PROGRAMME_SETUP',async()=>{
      diagnostic.httpStatus('200');diagnostic.queryFailure({stage:'UNKNOWN',sqlState:'private',durationMs:5});diagnostic.queryFailure(Object.defineProperty({},'stage',{get(){reads++;return'UNKNOWN';}}));clock=900000;throw original;
    }))).rejects.toBe(original);diagnostic.emitFailure(value=>logs.push(value));expect(reads).toBe(0);expect(JSON.parse(logs[0]).phases[0]).toEqual({phase:'PROGRAMME_SETUP',status:'REJECTED',elapsedMs:180000,httpResponses:0,lastHttpStatus:null,queryFailure:null});
    const bounded=new CustomerAssessmentPhaseDiagnostics(()=>0);await expect(bounded.run(()=>bounded.phase('PROGRAMME_DENIED_PAGE',async()=>{for(let n=0;n<1002;n++)bounded.httpStatus(403);throw original;}))).rejects.toBe(original);bounded.emitFailure(value=>logs.push(value));expect(JSON.parse(logs[1])).toMatchObject({truncated:true,phases:[{httpResponses:1000,lastHttpStatus:403}]});
  });
});
