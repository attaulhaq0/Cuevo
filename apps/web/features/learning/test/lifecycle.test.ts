import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDraft, parseQuiz, parseQuizAttempt, parseSubmission, parseAssessment } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const submission = { id: 's', assessmentId: 'a', learnerId: 'l', content: 'Revised work', status: 'RESUBMITTED', revision: 2, submittedAt: '2026-10-01T00:02:00Z', previousSubmissionId: 's1', sourceReturnId: 'return-1', assessmentTitle: 'Task', learnerName: 'Learner', returnId: null, returnFeedback: null, returnedAt: null };

test('returned/resubmitted work retains immutable feedback and prior source pointers', () => {
  assert.equal(parseSubmission(submission).sourceReturnId, 'return-1');
  assert.throws(() => parseSubmission({ ...submission, sourceReturnId: null }), LearningApiError);
  assert.throws(() => parseSubmission({ ...submission, status: 'RETURNED', returnId: null }), LearningApiError);
  assert.throws(() => parseSubmission({ ...submission, status: 'AUTO_GRADED' }), LearningApiError);
});
test('an absent learner draft stays a revision-zero empty draft without submitted authority', () => {
  const draft = { id: null, assessmentId: 'a', content: '', status: 'DRAFT', revision: 0, updatedAt: null };
  assert.equal(parseDraft(draft).revision, 0);
  assert.throws(() => parseDraft({ ...draft, status: 'SUBMITTED' }), LearningApiError);
  assert.throws(() => parseDraft({ ...draft, revision: 1 }), LearningApiError);
});
test('published quiz context never accepts raw answer keys', () => {
  const quiz = { id: 'q', assessmentId: 'a', version: 'v1', policyVersion: 2, questions: [{ key: 'one', prompt: 'Choose', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }] };
  assert.equal(parseQuiz(quiz).questions.length, 1);
  assert.throws(() => parseQuiz({ ...quiz, questions: [{ ...quiz.questions[0], correctOptionKey: 'a' }] }), LearningApiError);
});
test('checked quiz feedback is source-linked checking and cannot become an authoritative grade', () => {
  const attempt = { id: 'attempt', quizId: 'q', assessmentId: 'a', learnerId: 'l', submissionId: 's', createdAt: '2026-10-01T00:02:00Z', status: 'CHECKED_NOT_GRADED', checkedAnswers: [{ questionKey: 'one', optionKey: 'a', status: 'CORRECT' }] };
  assert.equal(parseQuizAttempt(attempt).status, 'CHECKED_NOT_GRADED');
  assert.throws(() => parseQuizAttempt({ ...attempt, status: 'GRADE_RELEASED' }), LearningApiError);
  assert.throws(() => parseQuizAttempt({ ...attempt, submissionId: null }), LearningApiError);
});
test('assignment policy fields remain explicit instead of guessing late permission or availability', () => {
  const assessment = { id: 'a', courseId: 'c', title: 'Task', instructions: 'Explain', model: 'numeric', maxScore: 10, rubricId: null, status: 'PUBLISHED', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT' };
  assert.throws(() => parseAssessment(assessment), LearningApiError);
});
