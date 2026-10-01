import{describe,it,expect}from'vitest';import{proposalInputSchema,decisionInputSchema,measureInputSchema}from '@cuevo/contracts';
describe('human improvement command boundaries',()=>{
it('rejects model or client authoritative origin, learner and grade fields',()=>{expect(proposalInputSchema.safeParse({baselineResultId:'bad',origin:'AI_GENERATED',learnerId:'forged',score:99}).success).toBe(false);});
it('requires explicit human decision and reason',()=>{expect(decisionInputSchema.safeParse({decision:'EXECUTE',reason:''}).success).toBe(false);});
it('requires a positive explicit change threshold and released follow-up identity',()=>{for(const minimumChange of[0,-1,undefined,NaN])expect(measureInputSchema.safeParse({followUpResultId:'00000000-0000-4000-8000-000000000001',minimumChange}).success).toBe(false);});
});
