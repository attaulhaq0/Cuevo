import {describe,expect,it}from'vitest';
import * as contracts from '@cuevo/contracts';
import type{z}from'zod';
describe('customer course detail page input',()=>{
 it('provides a bounded selected-unit query without client authority fields',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).courseDetailQuerySchema;
  expect(schema).toBeDefined();expect(schema.safeParse({unitId:'00000000-0000-4000-8000-000000000001',limit:'10'}).success).toBe(true);
  expect(schema.safeParse({limit:'1000'}).success).toBe(false);expect(schema.safeParse({learnerId:'00000000-0000-4000-8000-000000000001'}).success).toBe(false);
 });
});
