import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkingItem, parseReleasedResult, parseRubric } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const rubric = { id: 'rubric-1', courseId: 'course-1', title: 'School explanation rubric', version: 'school-v1', sourceType: 'SCHOOL_AUTHORED', createdBy: 'teacher-1', createdAt: '2026-10-01T00:00:00.000Z', criteria: [{ key: 'reasoning', title: 'Reasoning', levels: [{ key: 'developing', label: 'Developing', description: 'Explains part of the method.' }, { key: 'secure', label: 'Secure', description: 'Explains each step with evidence.' }] }] };
const native = { type: 'rubric', rubricId: 'rubric-1', rubricTitle: 'School explanation rubric', rubricVersion: 'school-v1', policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'reasoning', criterionTitle: 'Reasoning', levelKey: 'secure', levelLabel: 'Secure', levelDescription: 'Explains each step with evidence.' }] };
const result = { id: 'result-1', submissionId: 'submission-1', assessmentId: 'assessment-1', learnerId: 'learner-1', model: 'rubric', revision: 1, feedback: 'Reviewed criterion evidence.', status: 'RELEASED', policyVersion: 3, referenceId: 'ref-1', referenceVersion: 'objective-v1', evidenceId: 'evidence-1', createdAt: '2026-10-01T00:01:00.000Z', nativeResult: native };

test('native rubric result keeps criterion level and version without inventing a numeric score', () => {
  const parsed = parseReleasedResult(result);
  assert.equal(parsed.nativeResult.type, 'rubric');
  assert.equal(parsed.nativeResult.type === 'rubric' ? parsed.nativeResult.criteria[0].levelLabel : null, 'Secure');
  assert.equal('score' in parsed, false);
  assert.throws(() => parseReleasedResult({ ...result, nativeResult: { ...native, normalized: 100 } }), LearningApiError);
  assert.throws(() => parseReleasedResult({ ...result, nativeResult: { ...native, criteria: [] } }), LearningApiError);
  assert.throws(() => parseReleasedResult({ ...result, nativeResult: { ...native, rubricVersion: '' } }), LearningApiError);
  assert.throws(() => parseReleasedResult({ ...result, nativeResult: { ...native, score: 80, maxScore: 100 } }), LearningApiError);
});

test('marking context requires immutable permitted criterion choices and matching native version', () => {
  const item = { id: 'submission-1', assessmentId: 'assessment-1', learnerId: 'learner-1', content: 'Explanation', assessmentTitle: 'School assessment', learnerName: 'Synthetic Learner', model: 'rubric', policyVersion: 3, referenceId: 'ref-1', rubric: { id: rubric.id, title: rubric.title, version: rubric.version, criteria: rubric.criteria }, currentResult: { id: 'mark-1', revision: 1, feedback: 'Reviewed', status: 'REVIEW', model: 'rubric', nativeResult: native } };
  assert.equal(parseMarkingItem(item).model, 'rubric');
  assert.throws(() => parseMarkingItem({ ...item, rubric: null }), LearningApiError);
  assert.throws(() => parseMarkingItem({ ...item, currentResult: { ...item.currentResult, nativeResult: { ...native, criteria: [{ ...native.criteria[0], levelKey: 'invented' }] } } }), LearningApiError);
  assert.throws(() => parseMarkingItem({ ...item, currentResult: { ...item.currentResult, nativeResult: { ...native, rubricVersion: 'later-v2' } } }), LearningApiError);
});

test('school-authored rubrics require unique criterion and allowed level keys', () => {
  assert.equal(parseRubric(rubric).criteria.length, 1);
  assert.throws(() => parseRubric({ ...rubric, criteria: [...rubric.criteria, rubric.criteria[0]] }), LearningApiError);
  assert.throws(() => parseRubric({ ...rubric, criteria: [{ ...rubric.criteria[0], levels: [rubric.criteria[0].levels[0], rubric.criteria[0].levels[0]] }] }), LearningApiError);
  assert.throws(() => parseRubric({ ...rubric, sourceType: 'AI_OFFICIAL' }), LearningApiError);
});
