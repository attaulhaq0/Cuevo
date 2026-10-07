import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBrowserAccountPhases } from './browser-account-phase';
import accounts from './playwright.accounts.config';
import ordinary from './playwright.ordinary.config';
import * as phases from './browser-account-phase';
import { ordinaryBrowserExclusionPatterns } from './browser-runtime-scope';

const started = Date.parse('2026-10-03T08:00:00Z');
const requiredCases = [
  ['account-admission-inert.spec.ts', 'account invitation landing is inert until explicit confirmation and rejects missing or malformed links'],
  ['school-account-admission.spec.ts', 'administrator invites a new learner and the recipient accepts, saves a password and opens the school workspace'],
  ['school-account-recovery.spec.ts', 'school administrator approves recovery and the member changes password, revokes old sessions and signs in again'],
];
function report() { return { config: { configFile: '/repo/scripts/verification/playwright.accounts.config.ts' }, stats: { startTime: new Date(started + 1).toISOString(), duration: 1000, expected: 3, unexpected: 0, flaky: 0, skipped: 0 }, errors: [], suites: requiredCases.map(([file, title]) => ({ file, specs: [{ file, title, ok: true, tests: [{ expectedStatus: 'passed', projectName: 'production-chromium', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [], startTime: new Date(started + 2).toISOString() }] }] }] })) }; }
test('account acceptance always restores before ordinary browser verification', async () => {
  const order: string[] = []; const receipts: unknown[] = [];
  assert.equal(await verifyBrowserAccountPhases({ account: async () => { order.push('account'); return 0; }, restore: async () => { order.push('restore'); return 0; }, ordinary: async () => { order.push('ordinary'); return 0; }, record: async value => { receipts.push(structuredClone(value)); } }), 0);
  assert.deepEqual(order, ['account', 'restore', 'ordinary']); assert.deepEqual(receipts.at(-1), { account: 0, restore: 0, ordinary: 0 });
});
test('failed or uncertain account acceptance remains failed after successful restoration', async () => {
  for (const thrown of [false, true]) { const order: string[] = [];
    assert.equal(await verifyBrowserAccountPhases({ account: async () => { order.push('account'); if (thrown) throw Error('failed'); return 1; }, restore: async () => { order.push('restore'); return 0; }, ordinary: async () => { order.push('ordinary'); return 0; }, record: async () => {} }), 1); assert.deepEqual(order, ['account', 'restore']);
  }
});
test('unconfirmed restoration prevents ordinary browser state from being accepted', async () => {
  let ordinary = false; assert.equal(await verifyBrowserAccountPhases({ account: async () => 0, restore: async () => 1, ordinary: async () => { ordinary = true; return 0; }, record: async () => {} }), 1); assert.equal(ordinary, false);
});
test('the required account tests are assigned once and never silently omitted from acceptance', () => {
  assert.deepEqual(accounts.testMatch, ['school-account-admission.spec.ts', 'school-account-recovery.spec.ts', 'account-admission-inert.spec.ts']);
  assert.deepEqual(ordinary.testIgnore, ordinaryBrowserExclusionPatterns);
});

test('fresh exact account report accepts all three completed cases only', () => {
  assert.equal(phases.validateAccountBrowserReport(report(), started, started + 2000), 3);
});
test('missing, stale, skipped, repeated or flaky account cases cannot pass the browser gate', () => {
  const missing = report(); missing.suites.pop();
  const stale = report(); stale.stats.startTime = new Date(started - 1).toISOString();
  const skipped = report(); skipped.suites[0].specs[0].tests[0].results[0].status = 'skipped';
  const repeated = report(); repeated.suites[0].specs[0].tests[0].results.push({ ...repeated.suites[0].specs[0].tests[0].results[0], retry: 1 });
  const flaky = report(); flaky.stats.flaky = 1;
  const wrongProject = report(); wrongProject.suites[0].specs[0].tests[0].projectName = 'other';
  const future = report(); future.stats.startTime = new Date(started + 3000).toISOString();
  const interrupted = report(); interrupted.suites[1].specs[0].tests[0].results[0].status = 'interrupted';
  for (const value of [null, {}, missing, stale, skipped, repeated, flaky, wrongProject, future, interrupted]) assert.throws(() => phases.validateAccountBrowserReport(value, started, started + 2000));
});
test('restore attempts guarded bootstrap after capture cleanup failure and retains failure', async () => {
  const order: string[] = [];
  assert.equal(await phases.restoreAccountBrowserState({ stopped: async () => { order.push('stopped'); }, journal: async () => { order.push('journal'); }, cleanup: async () => { order.push('cleanup'); throw Error('private'); }, bootstrap: async () => { order.push('bootstrap'); return 0; }, verify: async () => { order.push('verify'); }, record: async () => { order.push('record'); } }), 1);
  assert.deepEqual(order, ['stopped', 'journal', 'cleanup', 'bootstrap', 'stopped', 'verify', 'record']);
});
test('uncertain stopped ports forbid cleanup and bootstrap mutations', async () => {
  const order: string[] = [];
  assert.equal(await phases.restoreAccountBrowserState({ stopped: async () => { order.push('stopped'); throw Error('active'); }, journal: async () => { order.push('journal'); }, cleanup: async () => { order.push('cleanup'); }, bootstrap: async () => { order.push('bootstrap'); return 0; }, verify: async () => { order.push('verify'); }, record: async () => { order.push('record'); } }), 1);
  assert.deepEqual(order, ['stopped', 'record']);
});
test('ownership journal failure refuses reset before request ownership is recoverable', async () => {
  const order: string[] = [];
  assert.equal(await phases.restoreAccountBrowserState({ stopped: async () => { order.push('stopped'); }, journal: async () => { order.push('journal'); throw Error('private'); }, cleanup: async () => { order.push('cleanup'); }, bootstrap: async () => { order.push('bootstrap'); return 0; }, verify: async () => { order.push('verify'); }, record: async () => { order.push('record'); } }), 1);
  assert.deepEqual(order, ['stopped', 'journal', 'record']);
});
test('port admission requires confirmed refusal on every application port', async () => {
  const seen: number[] = []; await phases.requireStoppedBrowserPorts(async port => { seen.push(port); return 'REFUSED'; }); assert.deepEqual(seen, [3000, 4000, 4001]);
  for (const state of ['OPEN', 'UNKNOWN'] as const) await assert.rejects(phases.requireStoppedBrowserPorts(async port => port === 4000 ? state : 'REFUSED'));
});
test('failed bootstrap and verification are both retained after capture cleanup', async () => {
  let evidence: unknown;
  assert.equal(await phases.restoreAccountBrowserState({ stopped: async () => {}, journal: async () => {}, cleanup: async () => {}, bootstrap: async () => 1, verify: async () => { throw Error('not restored'); }, record: async value => { evidence = value; } }), 1);
  assert.deepEqual(evidence, { stopped: 0, journal: 0, cleanup: 0, bootstrap: 1, verify: 1 });
});
