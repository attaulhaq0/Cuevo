import assert from 'node:assert/strict';
import test from 'node:test';
import { parentSupportCourses, parentSupportPath, parseParentLearningSupport, parseParentLearnerProfile, parentSupportMatches } from '../parent-support-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

const id = '10000000-0000-4000-8000-000000000001';
const course = '30000000-0000-4000-8000-000000000001';
const profile = { id, displayName: 'School learner', schoolName: 'School', enrollments: [], courses: [{ id: course, title: 'Checking course', classId: course, className: 'Year 1 Cedar', subjectName: 'Mathematics' }] };
const support = { id: 'support', learnerId: id, learnerName: 'School learner', courseId: course, courseTitle: 'Checking course', assessmentId: null, assessmentTitle: null, title: 'Checking guide', instructions: 'Review one school step.', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', revision: 1, state: 'ACTIVE', studentVisible: false, parentVisible: true };

test('parent support uses the exact current child profile and human course context', () => {
  const parsed = parseParentLearnerProfile(profile);
  assert.deepEqual(parentSupportCourses(parsed), [{ value: course, label: 'Checking course · Year 1 Cedar · Mathematics', requiresReview: false }]);
  assert.equal(parentSupportPath(parsed, id, course), `/v1/school/learning-support?limit=25&learnerId=${id}&courseId=${course}`);
  assert.equal(parentSupportPath(parsed, 'other-child', course), null);
  assert.equal(parentSupportPath(parsed, id, 'unlisted-course'), null);
  assert.equal(parentSupportPath(null, id, course), null);
  assert.throws(() => parseParentLearnerProfile({ ...profile, displayName: '' }), LearningApiError);
});
test('matching current course names require review rather than an opaque identifier suffix', () => {
  const duplicate = parseParentLearnerProfile({ ...profile, courses: [...profile.courses, { ...profile.courses[0], id: '30000000-0000-4000-8000-000000000002' }] });
  assert.equal(parentSupportCourses(duplicate).every(choice => choice.requiresReview), true);
  assert.equal(parentSupportPath(duplicate, id, course), null);
});
test('parent display rejects private approval notes and unpublished fields while accepting valid lifecycle states', () => {
  assert.equal(parseParentLearningSupport(support).instructions, support.instructions);
  for (const changed of [{ approvalReason: 'Private school basis' }, { parentVisible: false }, { assessmentId: 'task', assessmentTitle: null }]) assert.throws(() => parseParentLearningSupport({ ...support, ...changed }), LearningApiError);
  for (const state of ['REVOKED', 'EXPIRED', 'UPCOMING']) assert.equal(parseParentLearningSupport({ ...support, state }).state, state);
});
test('inactive support alongside an active published source never hides the valid current source', () => {
  const sources = [parseParentLearningSupport({ ...support, id: 'expired', state: 'EXPIRED' }), parseParentLearningSupport(support)];
  assert.equal(parentSupportMatches(sources, id, course), true);
  assert.deepEqual(sources.filter(source => source.state === 'ACTIVE').map(source => source.id), ['support']);
});
test('support readback must match the exact selected child and course', () => {
  const parsed = parseParentLearningSupport(support);
  assert.equal(parentSupportMatches([parsed], id, course), true);
  assert.equal(parentSupportMatches([{ ...parsed, learnerId: 'sibling' }], id, course), false);
  assert.equal(parentSupportMatches([{ ...parsed, courseId: 'different-course' }], id, course), false);
  assert.equal(parentSupportMatches([parsed, { ...parsed, id: 'expired', state: 'EXPIRED' }], id, course), true);
});
