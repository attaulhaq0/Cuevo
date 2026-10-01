import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAssessment, parseCourseDetail, parseList, parseSubmission } from '../lib/learning-types.ts';
import { LearningApiError } from '../lib/learning-api.ts';

test('malformed learning responses cannot become a zero score or incomplete lesson', () => {
  assert.throws(() => parseAssessment({ id: 'a', courseId: 'c', title: 'Quiz', instructions: 'Answer', status: 'PUBLISHED', dueAt: null, policyVersion: 1 }), LearningApiError);
  assert.throws(() => parseCourseDetail({ id: 'c', classId: 'cl', subjectId: 's', title: 'Course', description: '', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00.000Z', units: [{ id: 'u', title: 'Unit', sequence: 1, lessons: [{ id: 'l', title: 'Lesson', body: 'Read', status: 'PUBLISHED', sequence: 1 }] }] }), LearningApiError);
  assert.throws(() => parseList({ items: Array.from({ length: 101 }, () => ({})), nextCursor: null }, (item) => item), LearningApiError);
});

test('invalid dates and numeric values are rejected before localized rendering', () => {
  assert.throws(() => parseAssessment({ id: 'a', courseId: 'c', title: 'Quiz', instructions: 'Answer', maxScore: -10, status: 'PUBLISHED', dueAt: 'invalid-date', policyVersion: 1 }), LearningApiError);
  assert.throws(() => parseSubmission({ id: 's', assessmentId: 'a', learnerId: 'l', content: 'Answer', status: 'SUBMITTED', submittedAt: 'invalid-date', revision: 1, assessmentTitle: 'Quiz', learnerName: 'Synthetic learner' }), LearningApiError);
});
