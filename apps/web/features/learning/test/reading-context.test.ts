import assert from 'node:assert/strict';
import test from 'node:test';
import { activityKindLabel, learningTitle, courseReadingContext, activityCompletionState, currentActivityCompletion, currentCourseReading, type CourseDetail } from '../model.ts';
import { learningEn, learningAr } from '../messages.ts';

const course: CourseDetail = {
  id: 'course-private-id', classId: 'class-private-id', subjectId: 'subject-private-id', title: 'Learning strategies', description: 'Make your thinking visible.', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00.000Z', selectedUnitId: 'u2',
  units: [
    { id: 'u1', title: 'Earlier unit', sequence: 1, lessons: [{ id: 'l1', title: 'Earlier lesson', sequence: 1, body: 'Earlier material', status: 'PUBLISHED', activities: [] }] },
    { id: 'u2', title: 'Show your thinking', sequence: 2, lessons: [{ id: 'l2', title: 'Explain your approach', sequence: 1, body: 'Read and explain.', status: 'PUBLISHED', activities: [{ id: 'a2', title: 'Practice', kind: 'practice', sequence: 1, instructions: 'Explain', completion: null }] }] },
  ],
};

test('reading context follows the server selected unit without inventing a current lesson', () => {
  const context = courseReadingContext(course, null, null);
  assert.equal(context.unit?.title, 'Show your thinking');
  assert.equal(context.lesson, null);
  assert.equal(context.activity, null);
});

test('reading selection cannot retain another unit lesson or activity after paging', () => {
  assert.equal(courseReadingContext(course, 'l1', 'a2').lesson, null);
  assert.equal(courseReadingContext(course, 'l2', 'a2').activity?.title, 'Practice');
  assert.equal(courseReadingContext({ ...course, selectedUnitId: 'u1' }, 'l2', 'a2').activity, null);
  assert.equal(courseReadingContext({ ...course, selectedUnitId: 'unavailable' }, 'l2', 'a2').unit, null);
});

test('older unpaged course context uses its loaded lesson unit, while explicit null remains unselected', () => {
  assert.equal(courseReadingContext({ ...course, selectedUnitId: undefined }, 'l2', null).unit?.id, 'u2');
  assert.equal(courseReadingContext({ ...course, selectedUnitId: null }, 'l2', null).unit, null);
});

test('unknown activity kinds and missing names stay localized rather than showing technical keys', () => {
  assert.equal(activityKindLabel('practice', learningEn.kinds, learningEn.kindUnavailable), 'Practice');
  assert.equal(activityKindLabel('INTERNAL_NEW_ACTIVITY', learningEn.kinds, learningEn.kindUnavailable), learningEn.kindUnavailable);
  assert.equal(activityKindLabel('INTERNAL_NEW_ACTIVITY', learningAr.kinds, learningAr.kindUnavailable), learningAr.kindUnavailable);
  assert.equal(activityKindLabel('toString', learningEn.kinds, learningEn.kindUnavailable), learningEn.kindUnavailable);
  assert.equal(learningTitle('   ', learningAr.lessonUnavailable), learningAr.lessonUnavailable);
  assert.equal(learningTitle(' Explain your approach ', learningEn.lessonUnavailable), 'Explain your approach');
});

test('completion distinguishes confirmed history, explicit absence and an unknown older projection', () => {
  const activity = course.units[1].lessons[0].activities[0];
  assert.equal(activityCompletionState(activity), 'not-recorded');
  assert.equal(activityCompletionState({ ...activity, completion: undefined }), 'unknown');
  assert.equal(activityCompletionState({ ...activity, completion: { id: 'private-receipt', completedAt: '2026-10-03T00:00:00.000Z' } }), 'confirmed');
});

test('completion feedback requires the exact learner and activity receipt before showing a tick', () => {
  const receipt = { id: 'completion-id', activityId: 'a2', learnerId: 'learner-id', completedAt: '2026-10-03T00:00:00.000Z', reflection: null };
  assert.deepEqual(currentActivityCompletion(receipt, 'a2', 'learner-id'), { id: receipt.id, completedAt: receipt.completedAt });
  assert.throws(() => currentActivityCompletion({ id: 'completion-id' }, 'a2', 'learner-id'));
  assert.throws(() => currentActivityCompletion(receipt, 'different-activity', 'learner-id'));
  assert.throws(() => currentActivityCompletion(receipt, 'a2', 'different-learner'));
  assert.throws(() => currentActivityCompletion({ ...receipt, completedAt: 'unknown' }, 'a2', 'learner-id'));
});

test('completion receipt confirms the reflection actually sent without altering its stored text', () => {
  const receipt = { id: 'completion-id', activityId: 'a2', learnerId: 'learner-id', completedAt: '2026-10-03T00:00:00.000Z', reflection: 'My checked step.' };
  assert.deepEqual(currentActivityCompletion(receipt, 'a2', 'learner-id', { reflection: 'My checked step.' }), { id: receipt.id, completedAt: receipt.completedAt });
  assert.throws(() => currentActivityCompletion({ ...receipt, reflection: 'Another reflection' }, 'a2', 'learner-id', { reflection: 'My checked step.' }));
  assert.throws(() => currentActivityCompletion(receipt, 'a2', 'learner-id', {}));
  assert.deepEqual(currentActivityCompletion({ ...receipt, reflection: null }, 'a2', 'learner-id', {}), { id: receipt.id, completedAt: receipt.completedAt });
});

test('current course read rejects a different course or selected unit before mounting its reader', () => {
  assert.equal(currentCourseReading(course, course.id, 'u2').id, course.id);
  assert.throws(() => currentCourseReading(course, 'different-course', null));
  assert.throws(() => currentCourseReading(course, course.id, 'u1'));
  assert.equal(currentCourseReading(course, course.id, null).selectedUnitId, 'u2');
  assert.equal(currentCourseReading({ ...course, selectedUnitId: undefined }, course.id, 'u2').selectedUnitId, undefined);
});
