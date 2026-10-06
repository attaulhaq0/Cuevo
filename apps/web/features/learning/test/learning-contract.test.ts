import { parseList } from '../../../shared/api/responses.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAssessment, parseCourseDetail, parseSubmission } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';

test('malformed learning responses cannot become a zero score or incomplete lesson', () => {
  assert.throws(() => parseAssessment({ id: 'a', courseId: 'c', title: 'Quiz', instructions: 'Answer', status: 'PUBLISHED', dueAt: null, policyVersion: 1 }), LearningApiError);
  assert.throws(() => parseCourseDetail({ id: 'c', classId: 'cl', subjectId: 's', title: 'Course', description: '', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00.000Z', units: [{ id: 'u', title: 'Unit', sequence: 1, lessons: [{ id: 'l', title: 'Lesson', body: 'Read', status: 'PUBLISHED', sequence: 1 }] }] }), LearningApiError);
  assert.throws(() => parseList({ items: Array.from({ length: 101 }, () => ({})), nextCursor: null }, (item) => item), LearningApiError);
});

test('invalid dates and numeric values are rejected before localized rendering', () => {
  assert.throws(() => parseAssessment({ id: 'a', courseId: 'c', title: 'Quiz', instructions: 'Answer', maxScore: -10, status: 'PUBLISHED', dueAt: 'invalid-date', policyVersion: 1 }), LearningApiError);
  assert.throws(() => parseSubmission({ id: 's', assessmentId: 'a', learnerId: 'l', content: 'Answer', status: 'SUBMITTED', submittedAt: 'invalid-date', revision: 1, assessmentTitle: 'Quiz', learnerName: 'Synthetic learner' }), LearningApiError);
});

test('rubric assessments retain their model and rubric source without a numeric maximum', () => {
  const assessment = { id: 'a', courseId: 'c', title: 'Explanation', instructions: 'Explain', model: 'rubric', rubricId: 'rubric-1', status: 'PUBLISHED', dueAt: null, policyVersion: 3, availableFrom: null, availableUntil: null, allowLate: true, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT' };
  assert.equal(parseAssessment(assessment).model, 'rubric');
  assert.throws(() => parseAssessment({ ...assessment, rubricId: null }), LearningApiError);
  assert.throws(() => parseAssessment({ ...assessment, maxScore: 10 }), LearningApiError);
});

test('course paging preserves the selected unit and rejects incomplete completion receipts', () => {
  const course = { id: 'c', classId: 'cl', subjectId: 's', title: 'Course', description: '', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00.000Z', units: [{ id: 'u', title: 'Unit', sequence: 1, lessons: [{ id: 'l', title: 'Lesson', body: 'Read', status: 'PUBLISHED', sequence: 1, activities: [{ id: 'a', title: 'Practice', kind: 'practice', instructions: 'Explain', sequence: 1, completion: { id: 'receipt' } }] }] }], selectedUnitId: 'u', nextUnitCursor: null, nextLessonCursor: null };
  assert.throws(() => parseCourseDetail(course), LearningApiError);
});
test('private preparation requires its closed status and explicit intended configuration',()=>{
 const draft={id:'a',courseId:'c',title:'Prepared task',instructions:'Explain',model:'numeric',maxScore:10,rubricId:null,status:'DRAFT',dueAt:null,policyVersion:1,availableFrom:null,availableUntil:null,allowLate:true,assignmentState:'CLOSED',availabilityVersion:1,submissionKind:'TEXT',preparationVersion:1,intendedSubmissionKind:'QUIZ',intendedModel:'rubric',referenceId:null};
 assert.equal(parseAssessment(draft).status,'DRAFT');assert.throws(()=>parseAssessment({...draft,assignmentState:'OPEN'}),LearningApiError);assert.throws(()=>parseAssessment({...draft,preparationVersion:0}),LearningApiError);
});
