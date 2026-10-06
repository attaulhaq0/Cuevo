import assert from 'node:assert/strict';import test from 'node:test';
import {coordinatorOutcomeChoices,currentCoordinatorOutcome,coordinatorOutcomeSelection,coordinatorOutcomeDenied} from '../coordinator-outcome-model.ts';
import {LearningApiError} from '../../../shared/api/client.ts';import type{Outcome}from'../model.ts';
const outcome={id:'outcome-a',interventionId:'practice-a',baselineResultId:'before',followUpResultId:'after',measuredAt:'2026-10-03T10:00:00Z',context:{status:'READY',learnerId:'learner-a',identityRequiresReview:false,learnerName:'Alex',className:'Cedar',yearGroupName:'Year4',academicYearName:'2026–2027',courseTitle:'Reasoning',practiceTitle:'Check one step',baselineAssessmentTitle:'Before checking',followUpAssessmentTitle:'After checking'}}as Outcome;
test('Coordinator selected outcome uses exact current identity and never retains an old source frame',()=>{const selected=coordinatorOutcomeSelection(outcome),state={loading:false,error:null,moreError:null};assert.equal(currentCoordinatorOutcome(selected,[outcome],state),outcome);assert.equal(currentCoordinatorOutcome(selected,[{...outcome,interventionId:'other-practice'}],state),null);assert.equal(currentCoordinatorOutcome(selected,[{...outcome,context:{...outcome.context!,learnerId:'other-learner'}}],state),null);assert.equal(currentCoordinatorOutcome(selected,[outcome],{...state,loading:true}),null);assert.equal(currentCoordinatorOutcome(selected,[outcome],{...state,moreError:new LearningApiError('denied')}),null);assert.equal(currentCoordinatorOutcome(selected,[outcome],{...state,moreError:new LearningApiError('unavailable')}),outcome);});
test('Coordinator directory labels use actual learner practice source dates and flag indistinguishable context',()=>{const labels={unavailable:'Context unavailable',review:'School review needed'};const rows=coordinatorOutcomeChoices([outcome,{...outcome,id:'outcome-b'}],'en',labels);assert.equal(rows.every(row=>row.requiresReview),true);assert.match(rows[0].label,/Alex/);assert.match(rows[0].label,/Check one step/);assert.doesNotMatch(rows[0].label,/outcome-a|practice-a|learner-a/);});
test('denied source pages clear private reading authority while unavailable pages retain loaded partial context',()=>{assert.equal(coordinatorOutcomeDenied({error:null,moreError:new LearningApiError('denied')}),true);assert.equal(coordinatorOutcomeDenied({error:null,moreError:new LearningApiError('unavailable')}),false);});

test('a changed measurement date cannot reuse a selected current outcome reader',()=>{
 const selected=coordinatorOutcomeSelection(outcome),source={loading:false,error:null,moreError:null};
 assert.equal(currentCoordinatorOutcome(selected,[{...outcome,measuredAt:'2026-10-04T10:00:00Z'}],source),null);
});

test('late access and source frames cannot reuse the same selected identities',()=>{
 const first={...outcome,sourceScope:'current-access-token-frame'};
 const selected=coordinatorOutcomeSelection(first),source={loading:false,error:null,moreError:null};
 assert.equal(currentCoordinatorOutcome(selected,[first],source),first);
 assert.equal(currentCoordinatorOutcome(selected,[{...first,sourceScope:'new-access-token-frame'}],source),null);
 assert.equal(currentCoordinatorOutcome(selected,[outcome],source),null);
});

test('a selected source that becomes ambiguous or needs identity review is withheld',()=>{
 const selected=coordinatorOutcomeSelection(outcome),source={loading:false,error:null,moreError:null};
 assert.equal(currentCoordinatorOutcome(selected,[outcome,{...outcome}],source),null);
 assert.equal(currentCoordinatorOutcome(selected,[outcome,{...outcome,id:'indistinguishable-source'}],source),null);
 assert.equal(currentCoordinatorOutcome(selected,[outcome,{...outcome,id:'indistinguishable-minute',measuredAt:'2026-10-03T10:00:30Z'}],source),null);
 assert.equal(currentCoordinatorOutcome(selected,[{...outcome,context:{...outcome.context!,identityRequiresReview:true}}],source),null);
});
