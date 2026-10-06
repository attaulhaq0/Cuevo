import { describe,it,expect } from 'vitest';
import { intelligenceMetricsSchema } from '@cuevo/contracts';
const rate={numerator:0,denominator:0,rate:null};
const metrics={windowDays:30,mode:'FIXTURE',scope:'CURRENT_AUTHORIZED_RUNS',completedRuns:0,failedRuns:0,groundedResponse:rate,acceptance:rate,completion:rate,observedImprovement:rate,meanLatencyMs:null,totalCost:0,costPerApprovedWorkflow:null,unsupportedClaimRate:null,unauthorizedContextLeakageRate:null,invalidToolCallRate:null,humanOverrideRate:null,unknownMetricReason:'NO_DEDICATED_OBSERVATION_DENOMINATOR'};
describe('workflow metrics preserve observation denominators',()=>{
 it('keeps no observed denominator unknown and does not certify fixture safety rates',()=>{expect(intelligenceMetricsSchema.parse(metrics).acceptance.rate).toBeNull();expect(intelligenceMetricsSchema.safeParse({...metrics,unsupportedClaimRate:0}).success).toBe(false);});
 it('rejects inferred rates or numerator exceeding decided records',()=>{expect(intelligenceMetricsSchema.safeParse({...metrics,acceptance:{numerator:1,denominator:2,rate:.5}}).success).toBe(true);for(const acceptance of[{numerator:0,denominator:0,rate:0},{numerator:3,denominator:2,rate:1},{numerator:1,denominator:2,rate:.8}])expect(intelligenceMetricsSchema.safeParse({...metrics,acceptance}).success).toBe(false);});
});
