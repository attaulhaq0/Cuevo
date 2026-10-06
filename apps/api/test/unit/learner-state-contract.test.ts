import{describe,it,expect}from'vitest';import{unknownLearnerState}from'../../src/modules/learner-state/learner-state.controller';import{learnerStateSchema}from'@cuevo/contracts';
describe('unknown learner state',()=>{it('does not invent zero counts or normalized attainment',()=>{const state=unknownLearnerState('20000000-0000-4000-8000-000000000012');expect(state.development.practice.count).toBeNull();expect(state.engagement.completedActivityCount).toBeNull();expect(state.academic).toEqual([]);expect(learnerStateSchema.safeParse(state).success).toBe(true);});
it('rejects an UNKNOWN state containing a claimed zero measurement',()=>{const state=unknownLearnerState('20000000-0000-4000-8000-000000000012');expect(learnerStateSchema.safeParse({...state,engagement:{completedActivityCount:0,lastCompletedAt:null}}).success).toBe(false);});
it('retains explicit freshness and recorded-only completeness fields',()=>{const state=unknownLearnerState('20000000-0000-4000-8000-000000000012');expect(learnerStateSchema.parse({...state,status:'READY',freshness:'STALE',development:{...state.development,completeness:'RECORDED_ONLY'}})).toMatchObject({freshness:'STALE',development:{completeness:'RECORDED_ONLY'}});});
it('retains source-linked measured impact with explicit numeric zero baseline',()=>{
 const learnerId='20000000-0000-4000-8000-000000000012';const interventionId='70000000-0000-4000-8000-000000000001';const outcomeId='70000000-0000-4000-8000-000000000002';const baselineResultId='70000000-0000-4000-8000-000000000003';const followUpResultId='70000000-0000-4000-8000-000000000004';const state=unknownLearnerState(learnerId);
 const outcome={id:outcomeId,interventionId,baselineResultId,followUpResultId,status:'improved',difference:4,minimumChange:2,baseline:{score:0,maxScore:10},followUp:{score:4,maxScore:10},reason:'OBSERVED_RAW_SCORE_CHANGE',limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',measuredAt:'2026-10-01T10:00:00Z'};
 const support={id:interventionId,recommendationId:'70000000-0000-4000-8000-000000000005',learnerId,referenceId:'70000000-0000-4000-8000-000000000006',baselineResultId,title:'Synthetic practice',instructions:'Try a worked example.',status:'MEASURED',createdAt:'2026-10-01T08:00:00Z',completedAt:'2026-10-01T09:00:00Z',followUpAssessmentId:'70000000-0000-4000-8000-000000000007'};
 const parsed=learnerStateSchema.parse({...state,status:'READY',impact:{status:'measured',measurementIds:[outcomeId],outcomes:[outcome]},support:{activeInterventionIds:[],items:[support]}});
 expect(parsed.impact).toMatchObject({status:'measured',outcomes:[{baseline:{score:0}}]});
 expect(learnerStateSchema.safeParse({...parsed,impact:{...parsed.impact,measurementIds:[]}}).success).toBe(false);
 expect(learnerStateSchema.safeParse({...parsed,impact:{...parsed.impact,status:'unmeasured'}}).success).toBe(false);
 expect(learnerStateSchema.safeParse({...parsed,status:'UNKNOWN'}).success).toBe(false);
});
it('rejects untraceable support status and invented active IDs',()=>{
 const state=unknownLearnerState('20000000-0000-4000-8000-000000000012');
 const intervention={id:'70000000-0000-4000-8000-000000000001',recommendationId:'70000000-0000-4000-8000-000000000002',learnerId:state.learnerId,referenceId:'70000000-0000-4000-8000-000000000003',baselineResultId:'70000000-0000-4000-8000-000000000004',title:'Approved synthetic practice',instructions:'Try the approved worked example.',status:'ASSIGNED',createdAt:'2026-10-01T10:00:00Z',completedAt:null,followUpAssessmentId:null};
 const value={...state,status:'READY',support:{activeInterventionIds:[intervention.id],items:[intervention]}};
 expect(learnerStateSchema.parse(value).support).toMatchObject({items:[{status:'ASSIGNED'}]});
 expect(learnerStateSchema.safeParse({...value,support:{...value.support,activeInterventionIds:[]}}).success).toBe(false);
 expect(learnerStateSchema.safeParse({...value,support:{...value.support,items:[{...intervention,learnerId:'20000000-0000-4000-8000-000000000013'}]}}).success).toBe(false);
});
});
