import assert from 'node:assert/strict';
import test from 'node:test';
import { journeySelection, journeyTaskContext, journeyFeedbackRows, parseJourneyTask, journeyThinkingFocusSources } from '../student-journey-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import type { Activity, Assessment, Lesson } from '../model.ts';
import type { ReleasedResult } from '../../academic/model.ts';
const activity: Activity = { id: 'a1', title: 'Explain a check', kind: 'assignment', instructions: 'Explain one step.', sequence: 1, assessmentId: 'task', completion: null };
const task = { id: 'task', courseId: 'course', title: 'Explain', instructions: 'Explain one step.', model: 'numeric', maxScore: 10, status: 'PUBLISHED', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, allowLate: true, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT', currentSubmission: { id: 'new-work', assessmentId: 'task', learnerId: 'learner', status: 'SUBMITTED', content: 'My explanation', submittedAt: '2026-10-03T00:00:00Z', assessmentTitle: 'Explain', learnerName: 'Learner', revision: 1, previousSubmissionId: null, sourceReturnId: null, returnId: null, returnFeedback: null, returnedAt: null } } as Assessment;
const result = { id: 'result', assessmentId: 'task', learnerId: 'learner', status: 'RELEASED', submissionId: 'earlier-work', createdAt: '2026-10-03T00:00:00Z', feedback: 'Explain your choice.', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 1 } } as ReleasedResult;
test('journey choices never borrow another lesson or an ambiguous activity', () => {
  const lesson = { activities: [activity] } as Lesson;
  assert.equal(journeySelection(lesson, 'a1'), activity);
  assert.equal(journeySelection(lesson, 'another'), null);
  assert.equal(journeySelection({ ...lesson, activities: [activity, activity] }, 'a1'), null);
});
test('earlier feedback cannot turn a currently pending submission into a released result', () => {
  const value = journeyTaskContext(activity, task, [result], 'learner');
  assert.equal(value.state, 'submitted'); assert.equal(value.earlier, true); assert.equal(value.feedback?.nativeResult.type, 'numeric');
  assert.equal(journeyTaskContext(activity, task, [{ ...result, submissionId: 'new-work' }], 'learner').state, 'released');
  assert.equal(journeyTaskContext(activity, task, [{ ...result, learnerId: 'other' }], 'learner').feedback, null);
  assert.throws(() => journeyTaskContext(activity, { ...task, currentSubmission: { ...task.currentSubmission!, learnerId: 'other' } }, [], 'learner'));
});
test('absence and missing task state remain distinct from completion or release', () => {
  assert.equal(journeyTaskContext(activity, null, [], 'learner').state, 'unknown');
  assert.equal(journeyTaskContext(activity, { ...task, currentSubmission: undefined }, [], 'learner').state, 'unknown');
  assert.equal(journeyTaskContext(activity, { ...task, currentSubmission: null }, [], 'learner').state, 'available');
  assert.equal(journeyTaskContext({ ...activity, assessmentId: null, completion: undefined }, null, [], 'learner').state, 'unknown');
  assert.equal(journeyTaskContext({ ...activity, assessmentId: null, completion: { id: 'receipt', completedAt: '2026-10-03T00:00:00Z' } }, null, [], 'learner').state, 'completed');
});
test('connected task previews reject another assessment or course even on successful reads', () => {
  assert.equal(parseJourneyTask(task, activity, 'course').id, 'task');
  assert.throws(() => parseJourneyTask({ ...task, id: 'another' }, activity, 'course'));
  assert.throws(() => parseJourneyTask(task, activity, 'another'));
});

test('linked activity and assessment thinking focus remain distinct current sources before opening work', () => {
  const linked = { ...task, thinkingFocus: null };
  const sources = journeyThinkingFocusSources(activity, linked, task.courseId);
  assert.deepEqual(sources, [{ kind: 'activity', value: undefined }, { kind: 'assessment', value: null }]);
  assert.deepEqual(journeyThinkingFocusSources(activity, { ...linked, id: 'foreign-task' }, task.courseId), [{ kind: 'activity', value: undefined }]);
  assert.deepEqual(journeyThinkingFocusSources(activity, { ...linked, courseId: 'foreign-course' }, task.courseId), [{ kind: 'activity', value: undefined }]);
  assert.deepEqual(journeyThinkingFocusSources({ ...activity, assessmentId: null }, linked, task.courseId), [{ kind: 'activity', value: undefined }]);
});
test('a denied continuation clears previously loaded feedback while bounded unavailable reads keep truthful current records', () => {
  const rows = [{ ...result, scope: 'current' }];
  assert.equal(journeyFeedbackRows(rows, 'current', null, new LearningApiError('denied')).length, 0);
  assert.equal(journeyFeedbackRows(rows, 'current', new LearningApiError('unauthorized'), null).length, 0);
  assert.equal(journeyFeedbackRows(rows, 'other', null, null).length, 0);
  assert.equal(journeyFeedbackRows(rows, 'current', null, new LearningApiError('unavailable')).length, 1);
});
