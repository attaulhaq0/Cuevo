import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingWork, scheduledUpcoming } from '../model.ts';
import { parseAssessment, parseSubmission } from '../../learning/model.ts';
test('student next actions exclude submitted/closed/future work and prioritise explicit returned revision', () => {
  const base = { id: 'a', courseId: 'c', title: 'Assignment', instructions: 'Explain', model: 'numeric', maxScore: 10, rubricId: null, status: 'PUBLISHED', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, allowLate: true, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT' };
  const assessments = [parseAssessment(base), parseAssessment({ ...base, id: 'closed', assignmentState: 'CLOSED' }), parseAssessment({ ...base, id: 'future', availableFrom: '2027-01-01T00:00:00Z' })];
  const returned = parseSubmission({ id: 's', assessmentId: 'a', learnerId: 'l', content: 'Original', status: 'RETURNED', revision: 1, submittedAt: '2026-10-01T00:00:00Z', assessmentTitle: 'Assignment', learnerName: 'Learner', previousSubmissionId: null, sourceReturnId: null, returnId: 'r', returnFeedback: 'Revise', returnedAt: '2026-10-01T00:01:00Z' });
  const actions = pendingWork(assessments, [returned], 'l', Date.parse('2026-10-02T00:00:00Z')); assert.equal(actions.length, 1); assert.equal(actions[0].needsRevision, true);
});
test('upcoming calendar excludes finished records and retains chronological next context', () => { const items = [{ id: 'old', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-01T01:00:00Z' }, { id: 'later', startsAt: '2026-10-03T00:00:00Z', endsAt: '2026-10-03T01:00:00Z' }, { id: 'next', startsAt: '2026-10-02T00:00:00Z', endsAt: '2026-10-02T01:00:00Z' }]; assert.deepEqual(scheduledUpcoming(items, Date.parse('2026-10-01T00:00:00Z')).map(item => item.id), ['next', 'later']); });
