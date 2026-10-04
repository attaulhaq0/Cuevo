import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSummary, parseLedger, parseLeaderboard, developmentLearnerChoices, currentDevelopmentSummary, currentDevelopmentBoard, confirmDevelopmentReceipt, confirmDevelopmentCommandReceipt, confirmLearnerGoalReceipt, developmentPeriodChoices } from '../model.ts';
import { parsePersonChoice } from '../../../shared/api/people.ts';
import { PageAccumulator,parsePage } from '../../../shared/api/pagination.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const unknownStreak = { status: 'PERIOD_REQUIRED', basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS', timezone: 'UTC', days: null, endingOn: null, recordedDays: null, sourceCount: null };
const recordedSummary = { learnerId: 'l', status: 'RECORDED_ONLY', totalPoints: 12, periodId: 'p', leaderboardEnabled: false,
  streak: { status: 'RECORDED', basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS', timezone: 'UTC', days: 2, endingOn: '2026-10-02', recordedDays: 4, sourceCount: 6 } };

test('disabled recognition stays unknown rather than displaying zero attainment', () => { const summary = { learnerId: 'l', status: 'DISABLED', totalPoints: null, periodId: null, leaderboardEnabled: false, streak: unknownStreak }; assert.equal(parseSummary(summary).totalPoints, null); assert.equal(parseSummary(summary).streak.days, null); assert.throws(() => parseSummary({ ...summary, totalPoints: 0 }), LearningApiError); });

test('personal streak retains its latest UTC block and exact recognized source denominator', () => {
  const summary = parseSummary(recordedSummary);
  assert.deepEqual(summary.streak, { status: 'RECORDED', basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS', timezone: 'UTC', days: 2, endingOn: '2026-10-02', recordedDays: 4, sourceCount: 6 });
  assert.equal(parseSummary({ ...recordedSummary, streak: { ...recordedSummary.streak, endingOn: '2024-02-29' } }).streak.endingOn, '2024-02-29');
});

test('recorded streak refuses invalid calendar dates and fabricated zero or inconsistent counts', () => {
  for (const fields of [
    { endingOn: '2026-02-30' }, { endingOn: '2026-02-29' }, { endingOn: '2026-10-02T00:00:00Z' }, { endingOn: 'unknown' },
    { days: 0 }, { days: 1.5 }, { days: null }, { days: 5 }, { recordedDays: 0 }, { sourceCount: 3 }, { sourceCount: 0 }, { sourceCount: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.throws(() => parseSummary({ ...recordedSummary, streak: { ...recordedSummary.streak, ...fields } }), LearningApiError);
});

test('unobserved, disabled and review-required streak states retain unknown values', () => {
  for (const status of ['UNOBSERVED', 'DISABLED', 'REQUIRES_REVIEW']) {
    const summary = { ...recordedSummary, ...(status === 'DISABLED' ? { status: 'DISABLED', totalPoints: null } : {}), streak: { ...unknownStreak, status } };
    assert.deepEqual(parseSummary(summary).streak, { status, basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS', timezone: 'UTC', days: null, endingOn: null, recordedDays: null, sourceCount: null });
    for (const fields of [{ days: 0 }, { endingOn: '2026-10-02' }, { recordedDays: 0 }, { sourceCount: 0 }]) {
      assert.throws(() => parseSummary({ ...summary, streak: { ...summary.streak, ...fields } }), LearningApiError);
    }
  }
});

test('streak requires exact period, recognition state, source basis and UTC contract', () => {
  assert.equal(parseSummary({ ...recordedSummary, periodId: null, streak: unknownStreak }).streak.status, 'PERIOD_REQUIRED');
  for (const fields of [
    { streak: undefined }, { streak: { ...recordedSummary.streak, basis: 'GRADE_DAYS' } }, { streak: { ...recordedSummary.streak, timezone: 'Asia/Riyadh' } },
    { streak: { ...unknownStreak, status: 'UNKNOWN' } }, { streak: unknownStreak }, { periodId: null }, { periodId: '' },
    { status: 'DISABLED', totalPoints: null }, { streak: { ...unknownStreak, status: 'DISABLED' } },
  ]) assert.throws(() => parseSummary({ ...recordedSummary, ...fields }), LearningApiError);
});
test('recognition sources are observed learning actions rather than grades', () => { const entry = { id: 'x', learnerId: 'l', periodId: 'p', observationId: 'o', kind: 'revision', points: 5, occurredAt: '2026-10-01T00:00:00Z', policyId: 'policy' }; assert.equal(parseLedger(entry).kind, 'revision'); assert.throws(() => parseLedger({ ...entry, kind: 'grade' }), LearningApiError); });
test('optional class leaderboard keeps aliases and tie-safe ranks without learner identifiers', () => { const board = { periodId: 'p', status: 'OPT_IN_RECORDED_ACTIONS', items: [{ alias: 'Learner alias', points: 5, rank: 1 }] }; assert.equal(parseLeaderboard(board).items[0].rank, 1); assert.throws(() => parseLeaderboard({ ...board, items: [{ ...board.items[0], learnerId: 'l' }] }), LearningApiError); });
test('development learner choices retain later pages and distinguish full current class context',()=>{const cursor='00000000-0000-4000-8000-000000000001';const person={userId:'first',displayName:'Lina Hassan',role:'student',classLabels:['Year 8 · Cedar · 2026–2027']};const page=new PageAccumulator<ReturnType<typeof parsePersonChoice>>();page.reset('development');page.apply('development',null,parsePage({items:[person],nextCursor:cursor},parsePersonChoice));page.apply('development',cursor,parsePage({items:[{...person,userId:'second',classLabels:['Year 8 · Palm · 2026–2027']},{...person,userId:'teacher',role:'teacher'}],nextCursor:null},parsePersonChoice));const choices=developmentLearnerChoices(page.items,'Context unavailable');assert.equal(choices.length,2);assert.equal(choices.every(choice=>!choice.requiresReview),true);assert.match(choices[1].label,/Palm/);assert.equal(choices.some(choice=>choice.label.includes('second')),false);});
test('development refuses identical learner context and unknown class labels without opaque suffixes',()=>{const person=parsePersonChoice({userId:'first',displayName:'Lina Hassan',role:'student',classLabels:['Year 8 · Cedar']});const choices=developmentLearnerChoices([person,{...person,id:'second',userId:'second'},{...person,id:'unknown',userId:'unknown',classLabels:[]}],'Context unavailable');assert.equal(choices.every(choice=>choice.requiresReview),true);assert.match(choices[2].label,/Context unavailable/);assert.equal(choices[0].label,choices[1].label);});

test('development summary rejects a prior first frame without discarding valid XP when days need review', () => {
  const summary = parseSummary({ ...recordedSummary, streak: { ...unknownStreak, status: 'REQUIRES_REVIEW' } });
  const source = { scope: 'school:learner:period:generation:refresh', value: summary };
  assert.equal(currentDevelopmentSummary(source, source.scope, 'l', 'p')?.totalPoints, 12);
  assert.equal(currentDevelopmentSummary(source, source.scope, 'l', 'p')?.streak.days, null);
  for (const context of [
    { scope: 'other-school:learner:period:generation:refresh', learner: 'l', period: 'p' },
    { scope: source.scope, learner: 'other-learner', period: 'p' },
    { scope: source.scope, learner: 'l', period: 'other-period' },
  ]) assert.equal(currentDevelopmentSummary(source, context.scope, context.learner, context.period), null);
});

test('class board only exposes the exact selected period in the current source envelope', () => {
  const source = { scope: 'current', value: parseLeaderboard({ periodId: 'p', status: 'OPT_IN_RECORDED_ACTIONS', items: [{ alias: 'Explorer', points: 0, rank: 1 }] }) };
  assert.equal(currentDevelopmentBoard(source, 'current', 'p')?.items[0].points, 0);
  assert.equal(currentDevelopmentBoard(source, 'old', 'p'), null);
  assert.equal(currentDevelopmentBoard(source, 'current', 'other-period'), null);
});

const goal = {
  id: '00000000-0000-4000-8000-000000000001', revisionId: '00000000-0000-4000-8000-000000000002', revision: 1,
  learnerId: '00000000-0000-4000-8000-000000000003', learnerName: 'Lina Hassan', courseId: '00000000-0000-4000-8000-000000000004', courseTitle: 'Current school course',
  referenceId: null, referenceTitle: null, title: 'Check one example', plannedStep: 'Explain one checking step.', status: 'ACTIVE' as const, review: null,
  createdAt: '2026-10-03T08:00:00Z', reviewedAt: null,
};

test('goal creation confirmation checks strict returned source against the original command payload', () => {
  const command = { key: 'original-key', path: '/v1/development/goals', body: { courseId: goal.courseId, referenceId: null, title: ` ${goal.title} `, plannedStep: goal.plannedStep } };
  assert.equal(confirmLearnerGoalReceipt(goal, goal.learnerId, command).id, goal.id);
  for (const patch of [{ learnerId: goal.id }, { courseId: goal.id }, { title: 'Another goal' }, { revision: 2 }, { status: 'CLOSED' }, { privateNotes: 'Never expected' }]) {
    assert.throws(() => confirmLearnerGoalReceipt({ ...goal, ...patch }, goal.learnerId, command), error => error instanceof LearningApiError && error.uncertain);
  }
});

test('goal review confirmation uses the original revision and own review rather than new readback state', () => {
  const command = { key: 'original-key', path: `/v1/development/goals/${goal.id}/review`, body: { expectedRevision: 1, status: 'CLOSED', review: 'I checked one step.', confirmReview: true } };
  const receipt = { ...goal, revisionId: '00000000-0000-4000-8000-000000000005', revision: 2, status: 'CLOSED', review: 'I checked one step.', reviewedAt: '2026-10-03T09:00:00Z' };
  assert.equal(confirmLearnerGoalReceipt(receipt, goal.learnerId, command, goal).revision, 2);
  assert.equal(confirmLearnerGoalReceipt(receipt, goal.learnerId, command, { ...goal, revision: 2, revisionId: receipt.revisionId }).revision, 2);
  for (const patch of [{ id: goal.courseId }, { revision: 3 }, { status: 'REVIEWED' }, { review: 'Other reflection' }, { reviewedAt: null }, { plannedStep: 'Changed step' }]) {
    assert.throws(() => confirmLearnerGoalReceipt({ ...receipt, ...patch }, goal.learnerId, command, goal), error => error instanceof LearningApiError && error.uncertain);
  }
});

test('goal review preserves immutable creation time and records a distinct new source revision', () => {
  const command = { key: 'original-key', path: `/v1/development/goals/${goal.id}/review`, body: { expectedRevision: 1, status: 'REVIEWED', review: 'I reviewed one example.', confirmReview: true } };
  const receipt = { ...goal, revisionId: '00000000-0000-4000-8000-000000000005', revision: 2, status: 'REVIEWED', review: 'I reviewed one example.', reviewedAt: '2026-10-03T09:00:00Z' };
  assert.equal(confirmLearnerGoalReceipt(receipt, goal.learnerId, command, goal).revisionId, receipt.revisionId);
  for (const patch of [{ createdAt: '2026-09-01T08:00:00Z' }, { revisionId: goal.revisionId }]) {
    assert.throws(() => confirmLearnerGoalReceipt({ ...receipt, ...patch }, goal.learnerId, command, goal), error => error instanceof LearningApiError && error.uncertain);
  }
});

test('goal review replay matches the exact revision already confirmed by current readback', () => {
  const command = { key: 'original-key', path: `/v1/development/goals/${goal.id}/review`, body: { expectedRevision: 1, status: 'CLOSED', review: 'I checked one step.', confirmReview: true } };
  const current = { ...goal, revisionId: '00000000-0000-4000-8000-000000000005', revision: 2, status: 'CLOSED' as const, review: 'I checked one step.', reviewedAt: '2026-10-03T09:00:00Z' };
  assert.equal(confirmLearnerGoalReceipt(current, goal.learnerId, command, current).revisionId, current.revisionId);
  assert.throws(() => confirmLearnerGoalReceipt({ ...current, revisionId: '00000000-0000-4000-8000-000000000006' }, goal.learnerId, command, current), error => error instanceof LearningApiError && error.uncertain);
});

test('recognition confirmation requires the exact command and target before resolving a retained key', () => {
  assert.equal(confirmDevelopmentReceipt({ id: goal.id, command: 'participation', awards: 0 }, 'participation', goal.id).id, goal.id);
  assert.equal(confirmDevelopmentReceipt({ id: goal.id, command: 'backfill', awards: 0 }, 'backfill', goal.id).awards, 0);
  for (const receipt of [{ id: goal.courseId, command: 'participation', awards: 0 }, { id: goal.id, command: 'policy', awards: 0 }, { id: goal.id, command: 'participation', awards: 1 }, { id: goal.id, command: 'participation', awards: null }, { id: goal.id, command: 'participation', awards: 0, learnerId: goal.learnerId }]) {
    assert.throws(() => confirmDevelopmentReceipt(receipt, 'participation', goal.id), error => error instanceof LearningApiError && error.uncertain);
  }
});

test('recognition receipt validation derives command and period only from the original submitted command', () => {
  const original = { key: 'original-key', path: '/v1/development/leaderboard/participation', body: { periodId: goal.id, optIn: false, alias: '' } };
  const receipt = { id: goal.id, command: 'participation', awards: 0 };
  assert.equal(confirmDevelopmentCommandReceipt(receipt, original).id, goal.id);
  assert.throws(() => confirmDevelopmentCommandReceipt({ ...receipt, id: goal.courseId }, original), error => error instanceof LearningApiError && error.uncertain);
  assert.throws(() => confirmDevelopmentCommandReceipt(receipt, { ...original, path: '/v1/development/policies' }), error => error instanceof LearningApiError && error.uncertain);
  assert.throws(() => confirmDevelopmentCommandReceipt(receipt, { ...original, body: {} }), error => error instanceof LearningApiError && error.uncertain);
  assert.throws(() => confirmDevelopmentCommandReceipt(receipt, { ...original, path: '/v1/development/unknown' }), error => error instanceof LearningApiError && error.uncertain);
});

test('recorded recognition projections refuse unexpected fields instead of accepting private or invented metadata', () => {
  assert.throws(() => parseSummary({ ...recordedSummary, studentQuality: 8 }), LearningApiError);
  assert.throws(() => parseSummary({ ...recordedSummary, streak: { ...recordedSummary.streak, motivation: 'high' } }), LearningApiError);
  const entry = { id: 'x', learnerId: 'l', periodId: 'p', observationId: 'o', kind: 'practice', points: 0, occurredAt: '2026-10-01T00:00:00Z', policyId: 'policy' };
  assert.throws(() => parseLedger({ ...entry, rawAnswer: 'Private work' }), LearningApiError);
  assert.throws(() => parseLeaderboard({ periodId: 'p', status: 'OPT_IN_RECORDED_ACTIONS', items: [], learnerNames: ['Private name'] }), LearningApiError);
});

test('recognition period choices declare indistinguishable human context rather than adding opaque IDs', () => {
  const period = { id: 'first', classId: 'class-one', policyId: 'policy', title: 'Learning period', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-10T00:00:00Z' };
  const choices = developmentPeriodChoices([period, { ...period, id: 'second', classId: 'class-two' }], 'en');
  assert.equal(choices.every(choice => choice.requiresReview), true);
  assert.equal(choices[0].label, choices[1].label);
  assert.equal(choices.some(choice => choice.label.includes('first') || choice.label.includes('second')), false);
  const named = developmentPeriodChoices([period, { ...period, id: 'second', title: 'Later learning period' }], 'ar');
  assert.equal(named.every(choice => !choice.requiresReview), true);
});
