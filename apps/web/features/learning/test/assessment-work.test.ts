import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentSubmissionContext, assessmentWorkAvailable, assessmentWorkPresentation, currentSubmissionDraft, currentTextDraftReceipt, currentSubmissionReceipt, currentSubmissionActionReceipt, currentStudentQuiz, currentQuizReceipt, currentSubmissionWorkDraft, currentSubmissionWorkReceipt, currentWorkArtifact, preferredSubmissionDraft, type Assessment, type Submission } from '../model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../../../shared/api/client.ts';

const assessment: Assessment = { id: 'task', courseId: 'course', title: 'Explain your method', instructions: 'Show the steps.', status: 'PUBLISHED', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, allowLate: false, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT', model: 'numeric', maxScore: 10, rubricId: null };
const submission: Submission = { id: 'work', assessmentId: 'task', learnerId: 'learner', content: 'My method', status: 'SUBMITTED', revision: 1, submittedAt: '2026-10-03T10:00:00Z', assessmentTitle: 'Explain your method', learnerName: 'Learner', previousSubmissionId: null, sourceReturnId: null, returnId: null, returnFeedback: null, returnedAt: null };

test('an explicit current submission absence wins over an older queue record', () => {
  assert.deepEqual(assessmentSubmissionContext({ ...assessment, currentSubmission: null }, [submission], false, 'learner'), { submission: undefined, known: true, mismatch: false });
});
test('legacy task responses keep missing work unknown until the queue is complete', () => {
  assert.equal(assessmentSubmissionContext(assessment, [], false, 'learner').known, false);
  assert.equal(assessmentSubmissionContext(assessment, [], true, 'learner').known, true);
  assert.equal(assessmentSubmissionContext(assessment, [submission], false, 'learner').submission?.id, 'work');
});
test('task work rejects a projection for a different actor or task', () => {
  assert.equal(assessmentSubmissionContext({ ...assessment, currentSubmission: { ...submission, learnerId: 'other' } }, [], true, 'learner').mismatch, true);
  assert.equal(assessmentSubmissionContext({ ...assessment, currentSubmission: { ...submission, assessmentId: 'other' } }, [], true, 'learner').mismatch, true);
});
test('quiz guidance remains quiz-specific before and after checking without selecting text draft guidance', () => {
  const quiz = { ...assessment, submissionKind: 'QUIZ' as const };
  assert.deepEqual(assessmentWorkPresentation(quiz), { stage: 'quiz', response: 'quiz' });
  assert.deepEqual(assessmentWorkPresentation(quiz, submission), { stage: 'quiz', response: 'quiz' });
  assert.deepEqual(assessmentWorkPresentation(assessment), { stage: 'write', response: 'text' });
  assert.deepEqual(assessmentWorkPresentation(assessment, { ...submission, status: 'RETURNED' }), { stage: 'revise', response: 'text' });
});
test('task context identifies a current document-only submission without inferring file-only work from attached text', () => {
  assert.deepEqual(assessmentWorkPresentation(assessment, { ...submission, responseKind: 'FILE', artifactCount: 1 }), { stage: 'submitted', response: 'file' });
  assert.deepEqual(assessmentWorkPresentation(assessment, { ...submission, responseKind: 'TEXT', artifactCount: 1 }), { stage: 'submitted', response: 'text' });
});
test('availability respects exact opening, closing and late-work boundaries without assigning a result', () => {
  const now = Date.parse('2026-10-03T10:00:00Z');
  assert.equal(assessmentWorkAvailable(assessment, now), true);
  assert.equal(assessmentWorkAvailable({ ...assessment, availableFrom: '2026-10-03T10:00:01Z' }, now), false);
  assert.equal(assessmentWorkAvailable({ ...assessment, availableUntil: '2026-10-03T10:00:00Z' }, now), false);
  assert.equal(assessmentWorkAvailable({ ...assessment, dueAt: '2026-10-03T10:00:00Z' }, now), true);
  assert.equal(assessmentWorkAvailable({ ...assessment, dueAt: '2026-10-03T09:59:59Z' }, now), false);
  assert.equal(assessmentWorkAvailable({ ...assessment, dueAt: '2026-10-03T09:59:59Z', allowLate: true }, now), true);
  assert.equal(assessmentWorkAvailable({ ...assessment, assignmentState: 'CLOSED', allowLate: true }, now), false);
});
test('a draft-save receipt must belong to the selected task and next expected revision', () => {
  const saved = { id: 'draft', assessmentId: 'task', content: 'Saved method', status: 'DRAFT', revision: 2, updatedAt: '2026-10-03T10:00:00Z' };
  assert.equal(currentSubmissionDraft(saved, 'task', 1).revision, 2);
  assert.throws(() => currentSubmissionDraft({ ...saved, assessmentId: 'other' }, 'task'), LearningApiError);
  assert.throws(() => currentSubmissionDraft({ ...saved, revision: 1 }, 'task', 1), (error: unknown) => error instanceof LearningApiError && error.uncertain);
  assert.throws(() => currentSubmissionDraft({ ...saved, revision: 3 }, 'task', 1), (error: unknown) => error instanceof LearningApiError && error.uncertain);
});

test('an unmounted text draft validates original content and revision before its key settles', () => {
  const journal = new CommandJournal();
  const path = '/v1/assessments/task/draft';
  const original = journal.prepare(path, path, { expectedRevision: 1, content: '\n My exact draft \n' });
  const receipt = { id: 'draft', assessmentId: 'task', content: original.body.content, status: 'DRAFT', revision: 2, updatedAt: '2026-10-03T10:00:00Z' };
  const validate = (value: unknown, command: typeof original) => { currentTextDraftReceipt(value, 'task', command.body); };
  for (const patch of [{ revision: 3 }, { content: 'My exact draft' }, { assessmentId: 'other-task' }]) {
    assert.throws(() => confirmCommandReceipt(journal, path, original.key, { ...receipt, ...patch }, undefined, validate), error => error instanceof LearningApiError && error.uncertain);
    assert.equal(journal.get(path), original);
  }
  assert.equal(confirmCommandReceipt(journal, path, original.key, receipt, undefined, validate), true);
  assert.equal(journal.get(path), undefined);
});

test('unmounted resubmission validation retains the original returned-work link and key', () => {
  const journal = new CommandJournal(); const path = '/v1/submissions/work/resubmit';
  const command = journal.prepare(path, path, { content: '\n My method \n', expectedRevision: 1, returnId: 'return' });
  const revised = { ...submission, id: 'revised', status: 'RESUBMITTED', revision: 2, previousSubmissionId: 'work', sourceReturnId: 'return' };
  const validate = (value: unknown, original: typeof command) => { currentSubmissionReceipt(value, 'task', 'learner', original.body, 'work'); };
  assert.throws(() => confirmCommandReceipt(journal, path, command.key, { ...revised, sourceReturnId: 'other-return' }, undefined, validate), error => error instanceof LearningApiError && error.uncertain);
  assert.equal(journal.get(path), command);
  assert.equal(confirmCommandReceipt(journal, path, command.key, revised, undefined, validate), true);
});
test('a confirmed current draft receipt survives a delayed earlier read while a newer read can advance it', () => {
  const read = currentSubmissionDraft({ id: 'draft', assessmentId: 'task', content: 'Before save', status: 'DRAFT', revision: 1, updatedAt: '2026-10-03T09:00:00Z' }, 'task');
  const receipt = { ...read, content: 'Confirmed response', revision: 2 };
  assert.equal(preferredSubmissionDraft('task', read, receipt)?.content, 'Confirmed response');
  assert.equal(preferredSubmissionDraft('task', { ...read, content: 'Newer response', revision: 3 }, receipt)?.content, 'Newer response');
  assert.equal(preferredSubmissionDraft('task', read, { ...receipt, assessmentId: 'other' })?.content, 'Before save');
});
test('a text submission receipt matches actual sent work and a resubmission keeps its exact return source', () => {
  assert.equal(currentSubmissionReceipt(submission, 'task', 'learner', { content: 'My method' }).id, 'work');
  assert.equal(currentSubmissionReceipt(submission, 'task', 'learner', { content: '\n My method \n' }).id, 'work');
  assert.throws(() => currentSubmissionReceipt({ ...submission, learnerId: 'other' }, 'task', 'learner', { content: 'My method' }), LearningApiError);
  assert.throws(() => currentSubmissionReceipt(submission, 'task', 'learner', { content: 'Different work' }), LearningApiError);
  const revised = { ...submission, id: 'revised', status: 'RESUBMITTED', revision: 2, previousSubmissionId: 'work', sourceReturnId: 'return' };
  assert.equal(currentSubmissionReceipt(revised, 'task', 'learner', { content: 'My method', expectedRevision: 1, returnId: 'return' }, 'work').revision, 2);
  assert.throws(() => currentSubmissionReceipt({ ...revised, sourceReturnId: 'other' }, 'task', 'learner', { content: 'My method', expectedRevision: 1, returnId: 'return' }, 'work'), LearningApiError);
});
test('staff return and closure receipts identify the exact current work and sent feedback', () => {
  const returned = { id: 'return', submissionId: 'work', assessmentId: 'task', learnerId: 'learner', sourceRevision: 1, feedback: 'Explain the method.', actorId: 'teacher', createdAt: '2026-10-03T10:00:00Z', status: 'RETURNED' };
  assert.equal(currentSubmissionActionReceipt(returned, 'return', 'work', 'teacher', { feedback: ' Explain the method.\n', expectedRevision: 1 }).id, 'return');
  assert.throws(() => currentSubmissionActionReceipt({ ...returned, submissionId: 'other' }, 'return', 'work', 'teacher', { feedback: 'Explain the method.', expectedRevision: 1 }), LearningApiError);
  assert.throws(() => currentSubmissionActionReceipt({ ...returned, sourceRevision: 2 }, 'return', 'work', 'teacher', { feedback: 'Explain the method.', expectedRevision: 1 }), LearningApiError);
  assert.equal(currentSubmissionActionReceipt({ id: 'closed', submissionId: 'work', learnerId: 'learner', createdAt: returned.createdAt, status: 'CLOSED' }, 'close', 'work', 'teacher', { expectedRevision: 1 }).id, 'closed');
});
test('student checking uses the exact pinned quiz and complete valid checked answer set', () => {
  const quiz = { id: 'quiz', assessmentId: 'task', version: 'school-version', policyVersion: 1, questions: [{ key: 'question', prompt: 'Choose', options: [{ key: 'a', label: 'First choice' }, { key: 'b', label: 'Second choice' }] }] };
  const attempt = { id: 'attempt', quizId: 'quiz', assessmentId: 'task', learnerId: 'learner', submissionId: 'work', createdAt: '2026-10-03T10:00:00Z', status: 'CHECKED_NOT_GRADED' as const, checkedAnswers: [{ questionKey: 'question', optionKey: 'a', status: 'CORRECT' as const }] };
  assert.equal(currentStudentQuiz(quiz, [attempt], 'task', 'learner')?.id, 'quiz');
  for (const invalid of [{ ...attempt, quizId: 'other' }, { ...attempt, learnerId: 'other' }, { ...attempt, checkedAnswers: [attempt.checkedAnswers[0], attempt.checkedAnswers[0]] }, { ...attempt, checkedAnswers: [{ ...attempt.checkedAnswers[0], optionKey: 'unknown' }] }]) assert.throws(() => currentStudentQuiz(quiz, [invalid], 'task', 'learner'), LearningApiError);
  assert.throws(() => currentStudentQuiz(null, [attempt], 'task', 'learner'), LearningApiError);
  assert.equal(currentQuizReceipt(attempt, quiz, 'learner', { quizId: 'quiz', answers: [{ questionKey: 'question', optionKey: 'a' }] }).id, 'attempt');
  assert.throws(() => currentQuizReceipt(attempt, quiz, 'learner', { quizId: 'quiz', answers: [{ questionKey: 'question', optionKey: 'b' }] }), LearningApiError);
});
const taskId = '00000000-0000-4000-8000-000000000001';
const learnerId = '00000000-0000-4000-8000-000000000002';
const workId = '00000000-0000-4000-8000-000000000003';
const asset = { id: '00000000-0000-4000-8000-000000000004', name: 'My work.txt', contentType: 'text/plain' as const, byteSize: 4, sha256: 'a'.repeat(64), state: 'AVAILABLE' as const };
test('a verified upload receipt matches the actual staged filename type byte count and checksum', () => {
  const metadata = { name: asset.name, contentType: asset.contentType, byteSize: asset.byteSize, sha256: asset.sha256 };
  assert.equal(currentWorkArtifact(asset, asset.id, metadata).id, asset.id);
  for (const invalid of [{ ...asset, name: 'Other work.txt' }, { ...asset, byteSize: 5 }, { ...asset, sha256: 'b'.repeat(64) }, { ...asset, contentType: 'image/png' }, { ...asset, state: 'RETIRED' }]) assert.throws(() => currentWorkArtifact(invalid, asset.id, metadata), (error: unknown) => error instanceof LearningApiError && error.uncertain);
});
test('document draft absence must be an exact empty source while positive legacy text drafts may be empty', () => {
  const empty = { id: null, assessmentId: taskId, revision: 0, responseKind: 'TEXT', content: '', artifacts: [], status: 'DRAFT' };
  assert.equal(currentSubmissionWorkDraft(empty, taskId).revision, 0);
  assert.throws(() => currentSubmissionWorkDraft({ ...empty, artifacts: [asset] }, taskId), LearningApiError);
  assert.throws(() => currentSubmissionWorkDraft({ ...empty, assessmentId: learnerId }, taskId), LearningApiError);
  assert.equal(currentSubmissionWorkDraft({ ...empty, id: workId, revision: 1 }, taskId).content, '');
  assert.throws(() => currentSubmissionWorkDraft({ ...empty, id: workId, revision: 2 }, taskId, { expectedRevision: 0, responseKind: 'TEXT', content: '', assetIds: [] }), (error: unknown) => error instanceof LearningApiError && error.uncertain);
});
test('document work receipt confirms the exact actor source mode and selected manifest', () => {
  const receipt = { id: workId, submissionId: workId, assessmentId: taskId, learnerId, revision: 1, responseKind: 'FILE', content: '', artifacts: [asset] };
  const body = { responseKind: 'FILE', content: '', assetIds: [asset.id] };
  assert.equal(currentSubmissionWorkReceipt(receipt, taskId, learnerId, body, [asset]).submissionId, workId);
  assert.throws(() => currentSubmissionWorkReceipt(receipt, taskId, learnerId, { ...body, assetIds: [] }, []), LearningApiError);
  assert.throws(() => currentSubmissionWorkReceipt({ ...receipt, id: learnerId }, taskId, learnerId, body, [asset]), LearningApiError);
  assert.throws(() => currentSubmissionWorkReceipt({ ...receipt, artifacts: [{ ...asset, sha256: 'b'.repeat(64) }] }, taskId, learnerId, body, [asset]), LearningApiError);
  assert.throws(() => currentSubmissionWorkReceipt({ ...receipt, content: 'Invented text' }, taskId, learnerId, body, [asset]), LearningApiError);
  assert.equal(currentSubmissionWorkReceipt({ ...receipt, revision: 2 }, taskId, learnerId, { ...body, expectedRevision: 1 }, [asset]).revision, 2);
});
