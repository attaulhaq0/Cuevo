import{describe,expect,it}from'vitest';
import{intelligenceBudgetPolicyInputSchema,intelligenceBudgetStatusSchema}from'@cuevo/contracts';
import{parseServerConfig}from'@cuevo/config';
describe('explicit live budget reservation contract',()=>{
 it('requires explicit admin approval and coherent school/actor USD limits',()=>{
  expect(intelligenceBudgetPolicyInputSchema.safeParse({currency:'USD',schoolDailyLimit:2,actorDailyLimit:1,maxConcurrentRuns:2,expectedVersion:0,confirmApproval:true,reason:'Synthetic controlled trial'}).success).toBe(true);
  expect(intelligenceBudgetPolicyInputSchema.safeParse({currency:'USD',schoolDailyLimit:1,actorDailyLimit:2,maxConcurrentRuns:2,expectedVersion:0,confirmApproval:true,reason:'Invalid'}).success).toBe(false);
  expect(intelligenceBudgetPolicyInputSchema.safeParse({schoolDailyLimit:2,actorDailyLimit:1,maxConcurrentRuns:2,expectedVersion:0,reason:'Missing approval'}).success).toBe(false);
 });
 it('keeps unknown invoiced amounts distinct from held reservations',()=>{
  const value={currency:'USD',period:'UTC_DAY',policy:null,schoolReserved:0,actorReserved:0,billedCost:null};
  expect(intelligenceBudgetStatusSchema.parse(value).billedCost).toBeNull();expect(intelligenceBudgetStatusSchema.safeParse({...value,billedCost:0}).success).toBe(false);
 });
 it('keeps global live reservation limits explicit and rejects invented numeric configuration',()=>{
  expect(parseServerConfig({}).intelligence.globalDailyBudget).toBeUndefined();
  expect(parseServerConfig({AI_GLOBAL_DAILY_BUDGET:'2'}).intelligence.globalDailyBudget).toBe(2);
  expect(()=>parseServerConfig({AI_GLOBAL_DAILY_BUDGET:'0'})).toThrow();expect(()=>parseServerConfig({AI_GLOBAL_DAILY_BUDGET:'NaN'})).toThrow();
 });
});
