import { describe, expect, it } from 'vitest';
import { learnerProjectionSchema } from '@cuevo/contracts';
const count={totalCount:0,returnedCount:0,truncated:false};
const projection={scope:'CURRENT_AUTHORIZED_SOURCES',academic:{totalCount:101,returnedCount:100,truncated:true,nextCursor:'00000000-0000-4000-8000-000000000001'},observations:{practice:count,revision:count,reflection:count},sourceEvents:count};
describe('customer bounded projection denominator',()=>{
 it('retains exact returned and total native source coverage',()=>{expect(learnerProjectionSchema.parse(projection).academic).toMatchObject({totalCount:101,returnedCount:100,truncated:true});});
 it('rejects a falsely complete clipped projection',()=>{expect(learnerProjectionSchema.safeParse({...projection,academic:{...projection.academic,truncated:false}}).success).toBe(false);});
 it('rejects invented observed zero for unknown coverage',()=>{expect(learnerProjectionSchema.safeParse({...projection,sourceEvents:{totalCount:null,returnedCount:1,truncated:false}}).success).toBe(false);});
});
