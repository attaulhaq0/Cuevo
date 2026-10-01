import{describe,it,expect,vi}from'vitest';import type{Pool}from'pg';import{OutboxProcessor}from'../src/jobs/outbox/processor';
describe('outbox delivery worker',()=>{
 it('processes only validated claimed event IDs and lease tokens through private functions',async()=>{
  const query=vi.fn(async(sql:string)=>sql.includes('claim_outbox')?{rows:[{id:'event',lease_token:'lease'}]}:{rows:[]});
  await new OutboxProcessor({query}as unknown as Pool).tick();
  expect(query.mock.calls.some(([sql])=>sql.includes('process_learner_event'))).toBe(true);
  expect(query.mock.calls.some(([sql])=>sql.includes('app.'))).toBe(false);
 });
 it('records bounded failure code without passing raw error content to storage',async()=>{
  const query=vi.fn(async(sql:string)=>{if(sql.includes('claim_outbox'))return{rows:[{id:'event',lease_token:'lease'}]};if(sql.includes('process_learner_event'))throw new Error('secret source content');return{rows:[]};});
  await new OutboxProcessor({query}as unknown as Pool).tick();
  const calls=query.mock.calls as unknown as [string,unknown[]][];
  expect(calls.some(([sql])=>sql.includes('fail_outbox'))).toBe(true);
  expect(JSON.stringify(calls)).not.toContain('secret source content');
 });
});
