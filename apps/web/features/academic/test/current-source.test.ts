import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCurrentMarking, parseCurrentNativeSource, parseLearnerReleasedResult, parseCurrentAcademicReport, parseAcademicHistoryResult, sameNativeResult } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';

test('native numeric comparison retains exact zero and tolerates optional null normalization', () => {
  const value = { type: 'numeric' as const, score: 0, maxScore: 4, policyVersion: 1 };
  assert.equal(sameNativeResult(value, { ...value, normalized: null }), true);
  assert.equal(sameNativeResult(value, { ...value, score: 1 }), false);
});

test('exact marking source refuses a successful response for another submission', () => {
  const row = { id, assessmentId: id, learnerId: id, content: 'My answer', assessmentTitle: 'Explain the steps', learnerName: 'Alex', policyVersion: 1, referenceId: id, currentResult: null, submissionRevision: 1, submissionStatus: 'SUBMITTED', model: 'numeric', maxScore: 4, rubric: null };
  assert.equal(parseCurrentMarking(row, id).id, id);
  assert.throws(() => parseCurrentMarking(row, other), LearningApiError);
});

test('exact native result source matches result and learner while retaining zero', () => {
  const row = { id, learnerId: id, submissionId: id, assessmentId: id, courseId: id, referenceId: id, referenceVersion: 'school-v1', evidenceId: id, revision: 1, policyVersion: 1, createdAt: '2026-10-03T00:00:00Z', model: 'numeric', nativeResult: { type: 'numeric', score: 0, maxScore: 4, policyVersion: 1 } };
  assert.equal(parseCurrentNativeSource(row, id, id).nativeResult.type, 'numeric');
  assert.throws(() => parseCurrentNativeSource(row, other, id), LearningApiError);
  assert.throws(() => parseCurrentNativeSource(row, id, other), LearningApiError);
});

test('student and parent result rows bind the exact learner with explicit parent approval', () => {
  const row = { id, submissionId: id, learnerId: id, referenceId: id, referenceVersion: 'school-v1', evidenceId: id, createdAt: '2026-10-03T00:00:00Z', status: 'RELEASED', revision: 1, policyVersion: 1, feedback: 'Explain your choice', model: 'numeric', score: 0, maxScore: 4, nativeResult: { type: 'numeric', score: 0, maxScore: 4, policyVersion: 1 }, parentVisible: true };
  assert.equal(parseLearnerReleasedResult(row, id, true).id, id);
  assert.throws(() => parseLearnerReleasedResult(row, other, false), LearningApiError);
  assert.throws(() => parseLearnerReleasedResult({ ...row, parentVisible: false }, id, true), LearningApiError);
  const report = { schemaVersion: '1', schoolId: id, learnerId: id, generatedAt: '2026-10-03T00:00:00Z', scope: 'CURRENT_RELEASED_PAGE', coverage: 'NOT_ESTABLISHED', items: [{ ...row, assessmentId: id, actorId: id, assessmentTitle: 'Explain the steps', referenceTitle: 'Compare reasons' }], nextCursor: null };
  assert.equal(parseCurrentAcademicReport(report, id, id, true).items.length, 1);
  assert.throws(() => parseCurrentAcademicReport({ ...report, schoolId: other }, id, id, true), LearningApiError);
  assert.throws(() => parseCurrentAcademicReport({ ...report, items: [{ ...report.items[0], parentVisible: false }] }, id, id, true), LearningApiError);
  assert.throws(() => parseCurrentAcademicReport({ ...report, scope: 'CURRENT_RELEASED_PERIOD_PAGE', period: { id, name: 'Term one', revision: 1, startsOn: '2026-10-01', endsOn: '2026-10-31', basis: 'SOURCE_SUBMITTED_DATE_UTC' } }, id, id, true), LearningApiError);
});

const historyRow = () => ({ id, submissionId: id, assessmentId: id, learnerId: id, referenceId: id, referenceVersion: 'school-v1', evidenceId: id, createdAt: '2026-10-03T00:00:00Z', status: 'RELEASED', revision: 1, policyVersion: 1, feedback: 'Explain your choice', model: 'numeric', score: 0, maxScore: 4, nativeResult: { type: 'numeric', score: 0, maxScore: 4, policyVersion: 1 }, parentVisible: true, previousResultId: null, correctionReason: null });

test('academic revision history binds the selected work while preserving legitimate historical revisions', () => {
  const anchor = { submissionId: id, assessmentId: id, learnerId: id };
  assert.equal(parseAcademicHistoryResult(historyRow(), anchor, 'student').id, id);
  for (const patch of [{ submissionId: other }, { assessmentId: other }, { learnerId: other }, { assessmentId: undefined }]) assert.throws(() => parseAcademicHistoryResult({ ...historyRow(), ...patch }, anchor, 'student'), LearningApiError);
  assert.equal(parseAcademicHistoryResult({ ...historyRow(), id: other, evidenceId: other, revision: 2, referenceId: other, policyVersion: 2, nativeResult: { type: 'numeric', score: 1, maxScore: 5, policyVersion: 2 }, score: 1, maxScore: 5 }, anchor, 'teacher').revision, 2);
});

test('learner history refuses staff-only correction reasons and parent predecessor identities', () => {
  assert.throws(() => parseLearnerReleasedResult({ ...historyRow(), correctionReason: 'Private staff reason' }, id), LearningApiError);
  assert.throws(() => parseLearnerReleasedResult({ ...historyRow(), correctionReason: 'Private staff reason' }, id, true), LearningApiError);
  assert.throws(() => parseLearnerReleasedResult({ ...historyRow(), previousResultId: other }, id, true), LearningApiError);
  assert.equal(parseLearnerReleasedResult({ ...historyRow(), previousResultId: other }, id).previousResultId, other);
  assert.equal(parseAcademicHistoryResult({ ...historyRow(), correctionReason: 'Reviewed staff correction' }, { submissionId: id, assessmentId: id, learnerId: id }, 'teacher').correctionReason, 'Reviewed staff correction');
});
