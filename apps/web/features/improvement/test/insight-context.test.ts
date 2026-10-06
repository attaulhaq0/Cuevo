import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInsightContextEnvelope,parseProposalPracticeContext } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id = '10000000-0000-4000-8000-000000000001';
const context = { schemaVersion: '1', learnerId: id, courseId: id, classId: id, reference: { id, version: 'school-v1', title: 'School objective' }, recentResults: [{ resultId: id, evidenceId: id, referenceId: id, referenceVersion: 'school-v1', score: 0, maxScore: 10 }], observations: [], priorInterventions: [], learningOptions: [], coverage: 'BOUNDED_AUTHORIZED_CONTEXT' };
test('persisted analysis context retains a native zero and explicitly absent legacy context', () => {
  const first=parseInsightContextEnvelope({runId:id,context}).context?.recentResults[0];assert.ok(first&&'score'in first);assert.equal(first.score,0);
  assert.equal(parseInsightContextEnvelope({ runId: id, context: null }).context, null);
  assert.throws(() => parseInsightContextEnvelope({ runId: id, context: { ...context, coverage: 'ALL_LEARNER_DATA' } }), LearningApiError);
  assert.throws(() => parseInsightContextEnvelope({ runId: id, context: { ...context, modelPrompt: 'private server prompt' } }), LearningApiError);
  assert.throws(() => parseInsightContextEnvelope({ runId: id, context: { ...context, recentResults: [{ ...context.recentResults[0], score: 11 }] } }), LearningApiError);
});
test('proposal practice options require the exact run, learner, objective and baseline source',()=>{
 const expected={runId:id,learnerId:id,referenceId:id,baselineResultId:id};assert.equal(parseProposalPracticeContext({runId:id,context},expected).context?.learnerId,id);
 const other='10000000-0000-4000-8000-000000000002';for(const changed of [{runId:other,context},{runId:id,context:{...context,learnerId:other}},{runId:id,context:{...context,reference:{...context.reference,id:other},recentResults:[{...context.recentResults[0],referenceId:other}]}},{runId:id,context:{...context,recentResults:[{...context.recentResults[0],resultId:other}]}}])assert.throws(()=>parseProposalPracticeContext(changed,expected),LearningApiError);
 assert.equal(parseProposalPracticeContext({runId:id,context:null},expected).context,null);
});
