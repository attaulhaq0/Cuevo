import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningApiError } from '../../../shared/api/client.ts';
import { parseAssessment, parseSubmission } from '../../learning/model.ts';
import { parseReleasedResult } from '../../academic/model.ts';
import { parseIntervention } from '../../improvement/model.ts';
import { parseLearnerGoal } from '../../development/model.ts';
import { selectStudentHomeSources, studentHomePagingOnly, studentRecognition, currentStudentHomeSummary, currentNativeFeedbackDisclosure, currentStudentHomeDenial, studentHomeReadFrame, type HomeSourcePage } from '../student-home-model.ts';
import type { LearnerGoal } from '../../development/model.ts';

const learnerId = '00000000-0000-4000-8000-000000000001';
const assessment = { id: 'task', courseId: 'course', courseTitle: 'Methods · Year 6', title: 'Compare explanations', instructions: 'Keep both methods visible', model: 'numeric', maxScore: 10, rubricId: null, status: 'PUBLISHED', dueAt: null, policyVersion: 1, availableFrom: null, availableUntil: null, allowLate: true, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT' };
const submission = { id: 'submission', assessmentId: 'task', learnerId, content: 'My work', status: 'SUBMITTED', revision: 1, submittedAt: '2026-10-01T00:00:00Z', assessmentTitle: 'Compare explanations', learnerName: 'Learner' };
const page = <T,>(data: T[]): HomeSourcePage<T> => ({ data, loaded: true, loading: false, nextCursor: null, error: null, moreError: null });
const sources = () => ({ learnerId, now: Date.parse('2026-10-03T00:00:00Z'), assessments: page([parseAssessment({ ...assessment, currentSubmission: null })]), submissions: page<ReturnType<typeof parseSubmission>>([]), interventions: page([]), results: page<ReturnType<typeof parseReleasedResult>>([]), goals: page<ReturnType<typeof parseLearnerGoal>>([]) });

test('Student practice uses its exact confirmed course and preserves unknown source context', () => {
  const id = (number: number) => `24000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const task = { id: id(1), recommendationId: id(2), learnerId, referenceId: id(4), baselineResultId: id(5), title: 'Explain one checking step', instructions: 'Compare the two methods.', status: 'ASSIGNED', createdAt: '2026-10-01T10:00:00Z', completedAt: null, followUpAssessmentId: null };
  const context = { interventionId: id(1), baselineResultId: id(5), learnerId, referenceId: id(4), status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false, learnerName: 'Lina Hassan', courseTitle: 'Checking ideas', className: 'Cedar', yearGroupName: 'Year 1', academicYearName: '2026–2027' };
  const select = (record: unknown, source: Partial<HomeSourcePage<ReturnType<typeof parseIntervention>>> = {}) => selectStudentHomeSources({ ...sources(), interventions: { ...page([parseIntervention(record)]), ...source } }).queue.filter(item => item.kind === 'practice');
  const current = select({ ...task, context })[0];
  assert.equal(current.course, 'Checking ideas');
  assert.equal(current.title, 'Explain one checking step');
  assert.deepEqual(current.destination, { view: 'improvement', source: 'intervention', id: id(1) });
  assert.equal(select(task)[0].course, null);
  assert.equal(select({ ...task, context: { ...context, status: 'REQUIRES_REVIEW', identityRequiresReview: true } })[0].course, null);
  assert.deepEqual(select({ ...task, context, requiresReview: true, reviewReason: 'ACADEMIC_SOURCE_CHANGED' }), []);
  assert.deepEqual(select({ ...task, context }, { error: new LearningApiError('denied') }), []);
  assert.deepEqual(select({ ...task, context }, { moreError: new LearningApiError('denied') }), []);
  assert.deepEqual(select({ ...task, learnerId: id(9), context: { ...context, learnerId: id(9) } }), []);
});

test('Student current read frame changes immediately on token API actor role and access changes without clearing presentation preference identity', () => {
  const app = { apiUrl: 'https://api.invalid', accessToken: 'one', membership: { schoolId: 'school', userId: learnerId, role: 'student' }, accessGeneration: 1, status: 'ready', online: true };
  const current = studentHomeReadFrame(app);
  for (const next of [{ ...app, accessToken: 'two' }, { ...app, apiUrl: 'https://other.invalid' }, { ...app, accessGeneration: 2 }, { ...app, membership: { ...app.membership, userId: 'other' } }, { ...app, online: false }]) assert.notEqual(studentHomeReadFrame(next), current);
});

test('Student Home denial stays refused when a continuation retry clears its error until fresh current read', () => {
  const source = { error: null, moreError: new LearningApiError('denied') };
  const refused = currentStudentHomeDenial(null, 'source:0', [source]);
  assert.ok(refused);
  assert.equal(currentStudentHomeDenial(refused, 'source:0', [{ error: null, moreError: null }]), refused);
  assert.equal(currentStudentHomeDenial(refused, 'source:1', [{ error: null, moreError: null }]), null);
  assert.equal(currentStudentHomeDenial(null, 'source:0', [{ error: null, moreError: new LearningApiError('unavailable') }]), null);
});

test('exact own submitted source prevents an unsubmitted action even outside the independent queue', () => {
  const input = sources(); input.assessments.data[0] = parseAssessment({ ...assessment, currentSubmission: submission });
  assert.deepEqual(selectStudentHomeSources(input).queue, []);
  input.assessments.data[0] = parseAssessment({ ...assessment, currentSubmission: { ...submission, status: 'RETURNED', returnId: 'return', returnFeedback: 'Explain again', returnedAt: '2026-10-02T00:00:00Z' } });
  assert.deepEqual(selectStudentHomeSources(input).queue[0].destination, { view: 'learning', source: 'assessment', id: 'task' });
  assert.equal(selectStudentHomeSources(input).queue[0].kind, 'revision');
});

test('all submitted current work names its exact awaiting-review task while an empty complete source stays distinct', () => {
  const input = sources(); input.assessments.data[0] = parseAssessment({ ...assessment, currentSubmission: submission });
  const selected = selectStudentHomeSources(input); assert.equal(selected.submittedTask?.title, assessment.title); assert.equal(selected.submittedTask?.kind, 'submitted');
  assert.deepEqual(selected.submittedTask?.destination, { view: 'learning', source: 'assessment', id: 'task' }); assert.equal(selected.workKnown, true);
  input.assessments.nextCursor = 'more'; assert.equal(selectStudentHomeSources(input).submittedTask, null); assert.equal(selectStudentHomeSources(input).workKnown, false);
  input.assessments.nextCursor = null; input.assessments.data = []; assert.equal(selectStudentHomeSources(input).submittedTask, null); assert.equal(selectStudentHomeSources(input).workKnown, true);
});

test('the exact own released submission cannot remain awaiting review while a previous attempt does not mask current work', () => {
  const input = sources(); input.assessments.data[0] = parseAssessment({ ...assessment, currentSubmission: submission });
  const released = parseReleasedResult({ id: 'result', submissionId: submission.id, assessmentId: assessment.id, learnerId, referenceId: 'reference', referenceVersion: '1', evidenceId: 'evidence', createdAt: '2026-10-03T00:00:00Z', status: 'RELEASED', revision: 1, policyVersion: 1, feedback: 'Keep both methods', model: 'numeric', score: 2, maxScore: 3, nativeResult: { type: 'numeric', score: 2, maxScore: 3, policyVersion: 1 } });
  input.results.data = [released]; assert.equal(selectStudentHomeSources(input).submittedTask, null);
  input.results.nextCursor = 'more'; assert.equal(selectStudentHomeSources(input).submittedTask, null);
  input.results.nextCursor = null; input.results.data = [{ ...released, submissionId: 'previous-submission' }]; assert.equal(selectStudentHomeSources(input).submittedTask?.kind, 'submitted');
  input.results.data = [{ ...released, learnerId: 'different-learner' }]; assert.equal(selectStudentHomeSources(input).submittedTask?.kind, 'submitted');
});

test('a partial or failed release read cannot establish that submitted work is awaiting review', () => {
  const input = sources(); input.assessments.data[0] = parseAssessment({ ...assessment, currentSubmission: submission });
  input.results.nextCursor = 'more'; assert.equal(selectStudentHomeSources(input).submittedTask?.kind, 'submitted-unresolved');
  input.results.nextCursor = null; input.results.error = new LearningApiError('unavailable'); assert.equal(selectStudentHomeSources(input).submittedTask?.kind, 'submitted-unresolved');
  input.results.error = null; input.results.loaded = false; input.results.loading = true; assert.equal(selectStudentHomeSources(input).submittedTask?.kind, 'submitted-unresolved');
});

test('a refreshed time snapshot removes current work after its exact availability boundary', () => {
  const input = sources(); input.assessments.data[0] = parseAssessment({ ...assessment, availableUntil: '2026-10-03T00:01:00Z', currentSubmission: null });
  assert.equal(selectStudentHomeSources(input).queue.length, 1);
  input.now = Date.parse('2026-10-03T00:01:00Z'); assert.deepEqual(selectStudentHomeSources(input).queue, []);
});

test('incomplete independent submission pages never establish absence for older assessment responses', () => {
  const input = sources(); input.assessments.data[0] = parseAssessment(assessment); input.submissions.nextCursor = 'next';
  assert.deepEqual(selectStudentHomeSources(input).queue, []);
  assert.equal(selectStudentHomeSources(input).unresolvedWork, true);
  input.submissions.nextCursor = null;
  assert.equal(selectStudentHomeSources(input).queue[0].kind, 'assessment');
});

test('loaded pending actions retain priority and every exact destination while later pages stay partial', () => {
  const input = sources(); input.assessments.nextCursor = 'next';
  input.assessments.data.push(parseAssessment({ ...assessment, id: 'returned', title: 'Review explanation', currentSubmission: { ...submission, assessmentId: 'returned', status: 'RETURNED', returnId: 'return', returnFeedback: 'Explain again', returnedAt: '2026-10-02T00:00:00Z' } }));
  for (let index = 0; index < 7; index++) input.assessments.data.push(parseAssessment({ ...assessment, id: `later-${index}`, currentSubmission: null }));
  const selected = selectStudentHomeSources(input); assert.equal(selected.queue.length, 9); assert.equal(selected.queue[0].destination.id, 'returned'); assert.equal(selected.unresolvedWork, true);
});

test('released feedback and goals retain only exact own current facts and no goal is silently chosen from a partial page', () => {
  const input = sources();
  const result = parseReleasedResult({ id: 'result', submissionId: 'submission', learnerId, referenceId: 'reference', referenceVersion: '1', evidenceId: 'evidence', createdAt: '2026-10-01T00:00:00Z', status: 'RELEASED', revision: 1, policyVersion: 1, feedback: 'Keep both methods', model: 'numeric', score: 2, maxScore: 3, nativeResult: { type: 'numeric', score: 2, maxScore: 3, policyVersion: 1 } });
  input.results.data = [result, { ...result, id: 'other', learnerId: 'other' }];
  const goal = parseLearnerGoal({ id: '00000000-0000-4000-8000-000000000002', revisionId: '00000000-0000-4000-8000-000000000003', revision: 1, learnerId, learnerName: 'Learner', courseId: '00000000-0000-4000-8000-000000000004', courseTitle: 'Methods · Year 6', referenceId: null, referenceTitle: null, title: 'Compare two methods', plannedStep: 'Keep both explanations', status: 'ACTIVE', review: null, createdAt: '2026-10-01T00:00:00Z', reviewedAt: null });
  input.goals.data = [goal, { ...goal, id: 'other', learnerId: 'other' }, { ...goal, id: 'closed', status: 'CLOSED' } satisfies LearnerGoal];
  assert.deepEqual(selectStudentHomeSources(input).results, [result]); assert.equal(selectStudentHomeSources(input).goal?.title, goal.title);
  input.goals.nextCursor = 'more'; assert.equal(selectStudentHomeSources(input).goal, null);
  input.goals.nextCursor = null; input.goals.data.push({ ...goal, id: 'another-active' }); assert.equal(selectStudentHomeSources(input).goal, null);
});

test('failed current page clears populated private facts instead of reusing them', () => {
  const input = sources(); input.assessments.error = new LearningApiError('denied');
  assert.deepEqual(selectStudentHomeSources(input).queue, []);
});

test('recognition requires exact own selected period, preserves recorded zero, and shows only actual earned milestone titles', () => {
  const period = { id: 'period', classId: 'class', policyId: 'policy', title: 'Autumn recorded practice', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' };
  const summary = { learnerId, periodId: 'period', status: 'RECORDED_ONLY' as const, totalPoints: 0, leaderboardEnabled: false, streak: { status: 'UNOBSERVED' as const, basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS' as const, timezone: 'UTC' as const, days: null, endingOn: null, recordedDays: null, sourceCount: null } };
  const earned = { id: 'earned', learnerId, periodId: 'period', policyId: 'policy', key: 'key', title: 'Recorded reflection', minimumPoints: 5, earnedAt: '2026-10-02T00:00:00Z' };
  const input = { learnerId, period, summary: { data: summary, loading: false, error: null }, ledger: page([]), achievements: page([earned, { ...earned, id: 'other', periodId: 'other' }]) };
  assert.equal(studentRecognition(input).totalPoints, 0); assert.equal(studentRecognition(input).currentMilestone, 'Recorded reflection');
  assert.equal(studentRecognition({ ...input, period: null }).totalPoints, null);
  assert.equal(studentRecognition({ ...input, summary: { ...input.summary, data: { ...summary, learnerId: 'other' } } }).totalPoints, null);
  assert.equal(studentRecognition({ ...input, summary: { ...input.summary, data: { ...summary, periodId: 'other' } } }).totalPoints, null);
  assert.equal(studentRecognition({ ...input, summary: { ...input.summary, data: { ...summary, status: 'DISABLED', totalPoints: null } } }).status, 'disabled');
});

test('recognition history retains only the exact selected policy and uses owner records without client award calculation', () => {
  const period = { id: 'period', classId: 'class', policyId: 'policy', title: 'Autumn recorded practice', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' };
  const summary = { learnerId, periodId: 'period', status: 'RECORDED_ONLY' as const, totalPoints: 21, leaderboardEnabled: false, streak: { status: 'UNOBSERVED' as const, basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS' as const, timezone: 'UTC' as const, days: null, endingOn: null, recordedDays: null, sourceCount: null } };
  const entry = { id: 'entry', learnerId, periodId: 'period', observationId: 'observation', kind: 'revision' as const, points: 4, occurredAt: '2026-10-02T00:00:00Z', policyId: 'policy' };
  const earned = { id: 'earned', learnerId, periodId: 'period', policyId: 'policy', key: 'key', title: 'Recorded reflection', minimumPoints: 5, earnedAt: '2026-10-02T00:00:00Z' };
  const input = { learnerId, period, summary: { data: summary, loading: false, error: null }, ledger: page([entry, { ...entry, id: 'different-policy', policyId: 'old-policy' }]), achievements: page([earned, { ...earned, id: 'different-policy', policyId: 'old-policy' }]) };
  const current = studentRecognition(input); assert.equal(current.totalPoints, 21); assert.equal(current.entries.length, 1); assert.equal(current.earnedMilestones.length, 1); assert.equal(current.earnedMilestones[0].title, earned.title);
  input.ledger.moreError = new LearningApiError('unavailable'); input.achievements.moreError = new LearningApiError('unavailable');
  assert.deepEqual(studentRecognition(input).entries, []); assert.deepEqual(studentRecognition(input).earnedMilestones, []);
});

test('a review-required day streak does not erase a separately confirmed recorded XP total', () => {
  const period = { id: 'period', classId: 'class', policyId: 'policy', title: 'Autumn recorded practice', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' };
  const summary = { learnerId, periodId: 'period', status: 'RECORDED_ONLY' as const, totalPoints: 21, leaderboardEnabled: false, streak: { status: 'REQUIRES_REVIEW' as const, basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS' as const, timezone: 'UTC' as const, days: null, endingOn: null, recordedDays: null, sourceCount: null } };
  const recognition = studentRecognition({ learnerId, period, summary: { data: summary, loading: false, error: null }, ledger: page([]), achievements: page([]) });
  assert.equal(recognition.status, 'recorded'); assert.equal(recognition.totalPoints, 21);
});

test('same learner and period summary from a previous access or refresh epoch cannot remain visible', () => {
  const summary = { learnerId, periodId: 'period', status: 'RECORDED_ONLY' as const, totalPoints: 21, leaderboardEnabled: false, streak: { status: 'REQUIRES_REVIEW' as const, basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS' as const, timezone: 'UTC' as const, days: null, endingOn: null, recordedDays: null, sourceCount: null } };
  assert.equal(currentStudentHomeSummary({ scope: 'school:actor:period:1:0', summary }, 'school:actor:period:1:0'), summary);
  assert.equal(currentStudentHomeSummary({ scope: 'school:actor:period:1:0', summary }, 'school:actor:period:2:0'), null);
  assert.equal(currentStudentHomeSummary({ scope: 'school:actor:period:1:0', summary }, 'school:actor:period:1:1'), null);
});

test('native feedback disclosure restores only the same exact source after a current read refresh', () => {
  const disclosure = { resultId: 'released-result', open: true };
  assert.equal(currentNativeFeedbackDisclosure(disclosure, 'released-result'), true);
  assert.equal(currentNativeFeedbackDisclosure(disclosure, null), false);
  assert.equal(currentNativeFeedbackDisclosure(disclosure, 'different-result'), false);
  assert.equal(currentNativeFeedbackDisclosure(disclosure, 'released-result'), true);
  assert.equal(currentNativeFeedbackDisclosure(null, 'released-result'), false);
  assert.equal(currentNativeFeedbackDisclosure({ ...disclosure, open: false }, 'released-result'), false);
});


test('paging-only Home presentation keeps bounded work incomplete while every loaded task has known submission context', () => {
 const input=sources();input.assessments.nextCursor='next';const selected=selectStudentHomeSources(input);assert.equal(selected.unresolvedWork,true);assert.equal(selected.workKnown,false);
 assert.equal(studentHomePagingOnly([input.assessments,input.interventions,input.results], input.assessments, input.submissions),true);
 input.assessments.data[0]=parseAssessment(assessment);input.submissions.nextCursor='more';
 assert.equal(studentHomePagingOnly([input.assessments,input.submissions,input.interventions],input.assessments,input.submissions),false);
});

test('loading unknown and failed Home sources cannot hide their genuine recovery notice as paging', () => {
 const input=sources();input.assessments.nextCursor='next';
 for(const source of[{...input.results,loading:true},{...input.results,loaded:false},{...input.results,error:new LearningApiError('unavailable')},{...input.results,moreError:new LearningApiError('denied')}])assert.equal(studentHomePagingOnly([input.assessments,source],input.assessments,input.submissions),false);
 input.assessments.nextCursor=null;assert.equal(studentHomePagingOnly([input.assessments,input.results],input.assessments,input.submissions),false);
});
