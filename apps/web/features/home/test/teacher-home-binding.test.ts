import assert from 'node:assert/strict';
import test from 'node:test';
import { currentTeacherHomeRows, teacherHomeWork } from '../teacher-home-binding-model.ts';
import * as binding from '../teacher-home-binding-model.ts';
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

test('assigned practice remains waiting work with its exact source action and never becomes completed follow-up', () => {
  const task = { id: 'practice-waiting', recommendationId: 'proposal-1', learnerId: 'learner-1', referenceId: 'reference-1', baselineResultId: 'result-1', title: 'Compare one explanation', instructions: 'Explain the checking step', status: 'ASSIGNED', createdAt: '2026-10-03T10:00:00Z', completedAt: null, followUpAssessmentId: null };
  const tasks = [parseIntervention(task), parseIntervention({ ...task, id: 'changed', requiresReview: true, reviewReason: 'ACADEMIC_SOURCE_CHANGED' }), parseIntervention({ ...task, id: 'measured', status: 'MEASURED', completedAt: '2026-10-03T11:00:00Z', followUpAssessmentId: 'follow-up' })];
  const work = teacherHomeWork([], tasks, []);
  assert.equal(work.length, 1);
  assert.equal(work[0].kind, 'support');
  assert.equal(work[0].state, 'waiting');
  assert.equal(work[0].title, 'Compare one explanation');
  assert.equal(work[0].learnerName, null);
  assert.equal(work[0].date, '2026-10-03T10:00:00Z');
  assert.deepEqual(work[0].destination, { view: 'improvement', source: 'intervention', id: 'practice-waiting' });
});

test('teacher pages cannot retain source rows from a previous token, access generation or refresh', () => {
  const row = { ...parseMarkingItem(marking), sourceScope: 'current' };
  assert.equal(currentTeacherHomeRows([row], 'current').length, 1);
  assert.deepEqual(currentTeacherHomeRows([row], 'next-token'), []);
});

test('compact next work places current review before waiting practice and retains the exact source callbacks', () => {
  assert.equal(typeof binding.teacherHomeNextWork, 'function');
  const teacherHomeNextWork = binding.teacherHomeNextWork;
  const waiting = { key: 'waiting', kind: 'support' as const, title: 'Waiting practice', learnerName: null, classLabel: null, state: 'waiting' as const, destination: { view: 'improvement' as const, source: 'intervention' as const, id: 'practice' } };
  const review = { ...waiting, key: 'review', kind: 'marking' as const, title: 'Current review', state: 'needs-review' as const, destination: { view: 'academic' as const, source: 'marking' as const, id: 'submission' } };
  const inProgress = { ...review, key: 'saved-review', state: 'in-progress' as const };
  const fourth = { ...review, key: 'fourth' };
  const rows = [waiting, review, inProgress, fourth];
  assert.deepEqual(teacherHomeNextWork(rows).map(row => row.key), ['review', 'saved-review', 'fourth']);
  assert.deepEqual(rows.map(row => row.key), ['waiting', 'review', 'saved-review', 'fourth']);
  assert.deepEqual(teacherHomeNextWork([waiting])[0].destination, { view: 'improvement', source: 'intervention', id: 'practice' });
});
