import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSummary, parseLedger, parseLeaderboard } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
test('disabled recognition stays unknown rather than displaying zero attainment', () => { const summary = { learnerId: 'l', status: 'DISABLED', totalPoints: null, periodId: null, leaderboardEnabled: false }; assert.equal(parseSummary(summary).totalPoints, null); assert.throws(() => parseSummary({ ...summary, totalPoints: 0 }), LearningApiError); });
test('recognition sources are observed learning actions rather than grades', () => { const entry = { id: 'x', learnerId: 'l', periodId: 'p', observationId: 'o', kind: 'revision', points: 5, occurredAt: '2026-10-01T00:00:00Z', policyId: 'policy' }; assert.equal(parseLedger(entry).kind, 'revision'); assert.throws(() => parseLedger({ ...entry, kind: 'grade' }), LearningApiError); });
test('optional class leaderboard keeps aliases and tie-safe ranks without learner identifiers', () => { const board = { periodId: 'p', status: 'OPT_IN_RECORDED_ACTIONS', items: [{ alias: 'Learner alias', points: 5, rank: 1 }] }; assert.equal(parseLeaderboard(board).items[0].rank, 1); assert.throws(() => parseLeaderboard({ ...board, items: [{ ...board.items[0], learnerId: 'l' }] }), LearningApiError); });
