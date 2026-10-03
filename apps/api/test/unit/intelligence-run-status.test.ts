import{describe,expect,it}from'vitest';
import{intelligenceRunStatusSchema}from'@cuevo/contracts';
const id=(n:number)=>`94000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const run={id:id(1),baselineResultId:id(2),learnerId:id(3),learnerName:'Synthetic learner',assessmentTitle:'Checking source',state:'FAILED',generationMode:'FIXTURE',provider:'deterministic-fixture',model:'source-locked-v1',failureCode:'INTELLIGENCE_TIMEOUT',createdAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-01T00:00:30Z',outputTokens:null,inputTokens:null,latencyMs:null,cost:null,costBasis:'DETERMINISTIC_FIXTURE',reservedBudget:0};
describe('safe intelligence run status',()=>{
 it('retains failed versus in-progress status and unknown usage without raw context or leases',()=>{expect(intelligenceRunStatusSchema.parse(run)).toMatchObject({state:'FAILED',cost:null});expect(intelligenceRunStatusSchema.safeParse({...run,leaseToken:id(4)}).success).toBe(false);expect(intelligenceRunStatusSchema.safeParse({...run,context:{score:3}}).success).toBe(false);});
 it('rejects unsanitized errors and missing terminal receipts',()=>{expect(intelligenceRunStatusSchema.safeParse({...run,failureCode:'private provider message'}).success).toBe(false);expect(intelligenceRunStatusSchema.safeParse({...run,completedAt:null}).success).toBe(false);});
});
