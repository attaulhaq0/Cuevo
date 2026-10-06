import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAttentionSignal } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import * as attention from '../model.ts';
test('native decline retains compatible evidence and observed negative difference without causal claims', () => {
  const signal = { id: 'sig', learnerId: 'l', type: 'native_result_decline', ruleVersion: 1, generatedAt: '2026-10-01T00:00:00Z', sourceEventIds: ['event1', 'event2'], referenceId: 'ref', referenceVersion: 'v1', baselineResultId: 'baseline', followUpResultId: 'followup', evidenceIds: ['e1', 'e2'], baseline: { score: 8, maxScore: 10 }, followUp: { score: 3, maxScore: 10 }, difference: -5, minimumDecline: 3, uncertainty: 'OBSERVED_CHANGE_NOT_CAUSE' };
  assert.equal(parseAttentionSignal(signal).type, 'native_result_decline');
  assert.throws(() => parseAttentionSignal({ ...signal, difference: 5 }), LearningApiError);
  assert.throws(() => parseAttentionSignal({ ...signal, evidenceIds: [] }), LearningApiError);
  assert.throws(() => parseAttentionSignal({ ...signal, uncertainty: 'LAZY_STUDENT' }), LearningApiError);
});

test('attention refresh requires the exact current policy scope and hides action on failed or pending reads',()=>{
 assert.equal(typeof attention.currentAttentionPolicy,'function');const policy={id:'policy',version:2};
 assert.equal(attention.currentAttentionPolicy({scope:'current',value:{policy}},'current',false,false),policy);
 for(const[scope,loading,failed]of[['old',false,false],['current',true,false],['current',false,true]] as const)assert.equal(attention.currentAttentionPolicy({scope,value:{policy}},'current',loading,failed),null);
 assert.equal(attention.currentAttentionPolicy({scope:'current',value:{policy:null}},'current',false,false),null);
});
test('missing due work requires source assignments and cannot be presented as zero grades', () => {
  const signal = { id: 'sig', learnerId: 'l', type: 'missing_due_work', ruleVersion: 1, generatedAt: '2026-10-01T00:00:00Z', sourceEventIds: [], count: 2, missingAssessments: [{ id: 'a1', title: 'Work one', dueAt: '2026-09-30T00:00:00Z' }, { id: 'a2', title: 'Work two', dueAt: '2026-09-30T00:00:00Z' }], uncertainty: 'MISSING_SUBMISSION_NOT_ZERO' };
  assert.equal(parseAttentionSignal(signal).type, 'missing_due_work');
  assert.throws(() => parseAttentionSignal({ ...signal, count: 0 }), LearningApiError);
  assert.throws(() => parseAttentionSignal({ ...signal, missingAssessments: [] }), LearningApiError);
});
