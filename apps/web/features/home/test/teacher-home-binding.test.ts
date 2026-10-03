import assert from 'node:assert/strict';
import test from 'node:test';
import { currentTeacherHomeRows, teacherHomeWork } from '../teacher-home-binding-model.ts';
import { parseMarkingItem } from '../../academic/model.ts';
import { parseIntervention } from '../../improvement/model.ts';

const marking = { id: 'submission-1', assessmentId: 'assessment-1', learnerId: 'learner-1', content: 'My current answer', assessmentTitle: 'Explain a shape', learnerName: 'Alex', policyVersion: 1, referenceId: 'reference-1', currentResult: null, submissionRevision: 1, submissionStatus: 'SUBMITTED', model: 'numeric', maxScore: 4, rubric: null };

test('teacher attention opens exact pending marking and excludes closed or released work', () => {
  const rows = [parseMarkingItem(marking), parseMarkingItem({ ...marking, id: 'closed', submissionStatus: 'CLOSED' }), parseMarkingItem({ ...marking, id: 'released', currentResult: { id: 'mark-1', resultId: 'result-1', revision: 1, feedback: 'Reviewed', status: 'RELEASED', model: 'numeric', score: 0, maxScore: 4 } })];
  const work = teacherHomeWork(rows, [], []);
  assert.equal(work.length, 1);
  assert.deepEqual(work[0].destination, { view: 'academic', source: 'marking', id: 'submission-1' });
  assert.equal(work[0].state, 'needs-review');
  assert.equal(work[0].learnerName, 'Alex');
});

test('current marking draft is in progress and native criterion model remains distinct', () => {
  const current = parseMarkingItem({ ...marking, currentResult: { id: 'mark-1', revision: 1, feedback: 'Review my explanation', status: 'REVIEW', model: 'numeric', score: 0, maxScore: 4 } });
  assert.equal(teacherHomeWork([current], [], [])[0].state, 'in-progress');
  assert.equal(teacherHomeWork([current], [], [])[0].nativeKind, 'numeric');
});

test('teacher follow-up attention retains every completed current source and excludes review-changed or measured tasks', () => {
  const task = { id: 'practice-1', recommendationId: 'proposal-1', learnerId: 'learner-1', referenceId: 'reference-1', baselineResultId: 'result-1', title: 'Explain another example', instructions: 'Describe your method', status: 'COMPLETED', createdAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-02T00:00:00Z', followUpAssessmentId: null };
  const tasks = [parseIntervention(task), parseIntervention({ ...task, id: 'changed', requiresReview: true, reviewReason: 'ACADEMIC_SOURCE_CHANGED' })];
  const work = teacherHomeWork([], tasks, []);
  assert.equal(work.length, 1);
  assert.deepEqual(work[0].destination, { view: 'improvement', source: 'intervention', id: 'practice-1' });
  assert.equal(work[0].learnerName, null);
});

test('teacher pages cannot retain source rows from a previous token, access generation or refresh', () => {
  const row = { ...parseMarkingItem(marking), sourceScope: 'current' };
  assert.equal(currentTeacherHomeRows([row], 'current').length, 1);
  assert.deepEqual(currentTeacherHomeRows([row], 'next-token'), []);
});
