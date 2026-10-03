import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSummary, parseLedger, parseLeaderboard,developmentLearnerChoices } from '../model.ts';
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
