import{describe,it,expect,vi}from'vitest';import{OutboxProcessor}from'../src/jobs/outbox/processor';
import{deliveryRecord}from'../src/platform/telemetry';
describe('observation policy bounded source recovery receipts',()=>{
 it('a WAITING source commits its durable continuation without being counted completed',async()=>{
  let claims=0;const query=vi.fn(async(sql:string)=>sql.includes('claim_outbox')?{rows:++claims===1?[{id:'source',lease_token:'lease'}]:[]}:{rows:[{process_learner_event:{status:'WAITING'}}]});
  const metrics:unknown[]=[];const result=await new OutboxProcessor({query},value=>metrics.push(value)).process({maxEvents:1,deadline:20000,now:()=>0});expect(result.processed).toBe(0);expect(result.attempted).toBe(1);expect(result.deferred).toBe(1);expect(metrics).toEqual([{outcome:'WAITING',durationMs:0}]);expect(query.mock.calls.some(([sql])=>sql.includes('fail_outbox'))).toBe(false);
 });
 it('waiting telemetry never claims delivery completion',()=>{expect(deliveryRecord({outcome:'WAITING',durationMs:1})).toMatchObject({event:'delivery.waiting',outcome:'WAITING'});});
 it('terminal child review is not treated as a completed refresh or rewritten failure',async()=>{
  const query=vi.fn(async(sql:string)=>sql.includes('claim_outbox')?{rows:[{id:'source',lease_token:'lease'}]}:{rows:[{process_learner_event:{status:'REQUIRES_REVIEW'}}]});
  const result=await new OutboxProcessor({query}).process({maxEvents:1,deadline:20000,now:()=>0});expect(result.processed).toBe(0);expect(result.reviewRequired).toBe(true);expect(query.mock.calls.some(([sql])=>sql.includes('fail_outbox'))).toBe(false);
 });
});
