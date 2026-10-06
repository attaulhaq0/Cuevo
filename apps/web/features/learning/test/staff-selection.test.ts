import assert from 'node:assert/strict';
import test from 'node:test';
import * as learning from '../model.ts';
import type { CourseDetail } from '../model.ts';

const course: CourseDetail = { id: 'course', classId: 'class', subjectId: 'subject', title: 'Learning strategies', description: 'Show your thinking.', status: 'PUBLISHED', createdAt: '2026-10-03T00:00:00Z', selectedUnitId: 'unit', units: [{ id: 'unit', title: 'Checking', sequence: 1, lessons: [{ id: 'lesson', title: 'Explain your approach', sequence: 1, body: 'Exact lesson material', status: 'PUBLISHED', activities: [{ id: 'activity', title: 'Explain one choice', kind: 'practice', sequence: 1, instructions: 'Exact activity instructions' }] }] }] };

test('staff selection requires one exact currently loaded source and never chooses a sibling by default', () => {
  assert.equal(typeof learning.currentLearningSelection, 'function');
  const { currentLearningSelection } = learning;
  const rows = [{ id: 'one' }, { id: 'two' }];
  assert.equal(currentLearningSelection(rows, null), null);
  assert.equal(currentLearningSelection(rows, 'missing'), null);
  assert.equal(currentLearningSelection(rows, 'two'), rows[1]);
  assert.equal(currentLearningSelection([...rows, rows[1]], 'two'), null);
});

test('preparation follows exact course unit lesson and activity ancestry', () => {
  assert.equal(typeof learning.coursePreparationContext, 'function');
  const { coursePreparationContext } = learning;
  assert.equal(coursePreparationContext(course, 'course', null, null)?.sourceId, 'course');
  assert.equal(coursePreparationContext(course, 'unit', null, null)?.sourceId, 'unit');
  assert.equal(coursePreparationContext(course, 'lesson', 'lesson', null)?.sourceId, 'lesson');
  const activity = coursePreparationContext(course, 'activity', 'lesson', 'activity');
  assert.equal(activity?.sourceId, 'activity');
  assert.equal(activity?.lesson?.body, 'Exact lesson material');
  assert.equal(activity?.activity?.instructions, 'Exact activity instructions');
});

test('paging retirement or missing selection cannot replace an editor with another source', () => {
  assert.equal(typeof learning.coursePreparationContext, 'function');
  const { coursePreparationContext } = learning;
  assert.equal(coursePreparationContext({ ...course, selectedUnitId: null }, 'unit', null, null), null);
  assert.equal(coursePreparationContext({ ...course, selectedUnitId: 'other' }, 'activity', 'lesson', 'activity'), null);
  assert.equal(coursePreparationContext(course, 'activity', 'other-lesson', 'activity'), null);
  assert.equal(coursePreparationContext(course, 'activity', 'lesson', 'other-activity'), null);
  assert.equal(coursePreparationContext({ ...course, units: [] }, 'lesson', 'lesson', null), null);
});
