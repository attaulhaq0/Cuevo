import{afterAll,beforeAll,describe,expect,it}from'vitest';
import{createCustomerContext,type CustomerContext}from'./customer-test-context';
const enabled=process.env.CUEVO_REQUIRE_INTEGRATION==='1';
describe.skipIf(!enabled)('current attention policy read',()=>{
 let context:CustomerContext;beforeAll(async()=>{context=await createCustomerContext();},30000);afterAll(async()=>{await context?.close();});
 it('staff read exact approved policy fields while parent/student cannot retrieve configuration',async()=>{
  const response=await context.request('teacher','/v1/attention-policy');expect(response.statusCode).toBe(200);expect(response.json().policy).toMatchObject({version:1,minimumDecline:3,maxScore:10,missingDueCount:2,windowDays:14});
  expect((await context.request('strong','/v1/attention-policy')).statusCode).toBe(403);expect((await context.request('parent','/v1/attention-policy')).statusCode).toBe(403);
 });
});
