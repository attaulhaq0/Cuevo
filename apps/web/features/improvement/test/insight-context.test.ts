import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInsightContextEnvelope } from '../model.ts';
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
