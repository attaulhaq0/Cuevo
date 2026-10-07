import test from 'node:test';
import assert from 'node:assert/strict';
import ordinary from './playwright.ordinary.config';

const isolatedFiles = ['admin-audit-current-source.spec.ts','admin-automation-layout.spec.ts','admin-connected-access.spec.ts','admin-native-zoom.spec.ts','admin-selected-record-layout.spec.ts','coordinator-connected-curriculum.spec.ts','coordinator-connected-review.spec.ts','customer-native-report-style.spec.ts','customer-performance.spec.ts','customer-pilot-volume.spec.ts','parent-connected-conversation.spec.ts','parent-connected-portfolio.spec.ts','parent-connected-school.spec.ts','staff-marking-layout.spec.ts','student-learning-journey.spec.ts','student-parent-text-reflow.spec.ts','thinking-focus.spec.ts','workspace-narrow-header.spec.ts'];
test('ordinary browser verification cannot silently skip known isolated and pilot acceptance files', () => {
  const ignored = ordinary.testIgnore as string[];
  for (const file of isolatedFiles) assert.ok(ignored.includes(`**/${file}`), `ordinary verification must explicitly exclude ${file}`);
});

import * as scope from './browser-runtime-scope';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const identity = { runId: 'controlled-browser-run', sourceSha: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), scope: 'ordinary-browser' };
type ControlledResult = { status: string; retry: number; startTime: string; duration: number; errors: { message: string }[] };
type ControlledSpec = { id: string; title: string; file: string; line: number; column: number; ok: boolean; tests: { projectId: string; projectName: string; expectedStatus: string; status: string; results: ControlledResult[] }[] };
type ControlledSuite = { title: string; file: string; specs: ControlledSpec[]; suites: ControlledSuite[] };
type ControlledReport = { config: { configFile: string; rootDir: string; metadata: { cuevoBrowserVerification: scope.BrowserVerificationIdentity }; projects: { id: string; name: string; repeatEach: number; retries: number }[] }; suites: ControlledSuite[]; errors: { message: string }[]; stats: { startTime: string; duration: number; expected: number; unexpected: number; skipped: number; flaky: number } };
function controlledReports() {
  const base = resolve(import.meta.dirname, '../../.local/browser-scope-tests'); mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(resolve(base, 'report-'));
  writeFileSync(resolve(directory, 'shape.spec.ts'), 'import {test} from "@playwright/test"; test.describe("named group",()=>{test("first controlled case",()=>{});test("second controlled case",()=>{});});\n');
  writeFileSync(resolve(directory, 'playwright.config.ts'), `export default {testDir:${JSON.stringify(directory)},workers:1,retries:0,reporter:[['json']],metadata:{cuevoBrowserVerification:${JSON.stringify(identity)}},projects:[{name:'controlled-chromium',use:{browserName:'chromium'}},{name:'controlled-firefox',use:{browserName:'firefox'}}]};\n`);
  const run = (list: boolean) => {
    const startedAt = Date.now();
    const child = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../node_modules/@playwright/test/cli.js'), 'test', '--config', resolve(directory, 'playwright.config.ts'), '--reporter=json', ...(list ? ['--list'] : [])], { encoding: 'utf8' });
    const finishedAt = Date.now(); assert.equal(child.status, 0, child.stderr);
    return { report: JSON.parse(child.stdout) as ControlledReport, context: { ...identity, startedAt, finishedAt } };
  };
  return { list: run(true), execution: run(false) };
}
test('full browser evidence requires a preflight inventory validator', () => {
  assert.equal(typeof scope.parseBrowserInventory, 'function', 'preflight inventory validation must exist before wrapper exits can be accepted');
  assert.equal(typeof scope.validateBrowserRunReport, 'function', 'execution completeness validation must exist before wrapper exits can be accepted');
});
test('actual Playwright preflight and no-browser execution preserve every test identity and engine', () => {
  const { list, execution } = controlledReports();
  const inventory = scope.parseBrowserInventory(list.report, ['shape.spec.ts'], list.context);
  assert.equal(inventory.tests.length, 4);
  assert.equal(scope.validateBrowserRunReport(execution.report, inventory, execution.context), 4);
  const incomplete = structuredClone(execution.report); incomplete.suites[0].suites[0].specs.pop(); incomplete.stats.expected = 3;
  assert.throws(() => scope.validateBrowserRunReport(incomplete, inventory, execution.context), /not confirmed/);
});
test('browser scope source review refuses new skip owners and changed reviewed exclusions', () => {
  const sources = Object.fromEntries(scope.reviewedBrowserExclusions.map(item => [item.file, readFileSync(resolve(import.meta.dirname, '../../tests/e2e', item.file), 'utf8')]));
  assert.doesNotThrow(() => scope.assertReviewedBrowserExclusions(sources));
  assert.throws(() => scope.assertReviewedBrowserExclusions({ ...sources, 'new-conditional.spec.ts': 'test.skip(true,"later");' }));
  assert.throws(() => scope.assertReviewedBrowserExclusions({ ...sources, 'new-conditional.spec.ts': 'test.describe.skip("later",()=>{});' }));
  assert.throws(() => scope.assertReviewedBrowserExclusions({ ...sources, 'thinking-focus.spec.ts': 'test.skip(true,"changed");' }));
  assert.ok(scope.ordinaryBrowserFiles().includes('foundation.spec.ts'));
  assert.ok(!scope.ordinaryBrowserFiles().includes('thinking-focus.spec.ts'));
});

test('missing changed duplicated stale retried skipped and erroneous execution cannot certify browser evidence', () => {
  const { list, execution } = controlledReports();
  const inventory = scope.parseBrowserInventory(list.report, ['shape.spec.ts'], list.context);
  const reject = (mutate: (value: ControlledReport) => void) => { const value = structuredClone(execution.report); mutate(value); assert.throws(() => scope.validateBrowserRunReport(value, inventory, execution.context), /not confirmed/); };
  reject(value => { value.suites[0].suites[0].specs[0].id = 'foreign-case'; });
  reject(value => { value.suites[0].suites[0].specs[0].title = 'changed title'; });
  reject(value => { value.suites[0].suites[0].specs[1] = structuredClone(value.suites[0].suites[0].specs[0]); });
  reject(value => { value.suites[0].suites[0].specs[0].file = 'foreign.spec.ts'; });
  reject(value => { value.suites[0].suites[0].specs[0].tests[0].projectId = 'foreign-project'; });
  reject(value => { value.suites[0].suites[0].specs[0].tests[0].results[0].retry = 1; });
  reject(value => { value.suites[0].suites[0].specs[0].tests[0].results[0].status = 'skipped'; });
  reject(value => { value.suites[0].suites[0].specs[0].tests[0].results[0].errors.push({ message: 'failure' }); });
  reject(value => { value.suites[0].suites[0].specs[0].tests[0].results.push(structuredClone(value.suites[0].suites[0].specs[0].tests[0].results[0])); });
  reject(value => { value.stats.startTime = new Date(execution.context.startedAt - 1).toISOString(); });
  reject(value => { value.suites[0].suites[0].specs[0].tests[0].results[0].startTime = new Date(execution.context.finishedAt + 1).toISOString(); });
  reject(value => { value.stats.flaky = 1; });
  reject(value => { value.stats.expected = 0; });
  reject(value => { value.errors.push({ message: 'global failure' }); });
  reject(value => { value.config.metadata.cuevoBrowserVerification.sourceDigest = 'c'.repeat(64); });
  for (const mutate of [(value: ControlledReport) => { value.suites[0].suites[0].specs = value.suites[0].suites[0].specs.filter((spec: ControlledSpec) => spec.tests[0].projectId === 'controlled-chromium'); value.stats.skipped = 2; }, (value: ControlledReport) => { value.config.metadata.cuevoBrowserVerification.runId = 'another'; }, (value: ControlledReport) => { value.suites[0].suites[0].specs[0].tests[0].expectedStatus = 'skipped'; }, (value: ControlledReport) => { value.suites[0].suites[0].specs[0].tests[0].results.push(structuredClone(execution.report.suites[0].suites[0].specs[0].tests[0].results[0])); }]) {
    const value = structuredClone(list.report); mutate(value); assert.throws(() => scope.parseBrowserInventory(value, ['shape.spec.ts'], list.context));
  }
});
test('browser environment metadata refuses partial identity and preserves complete source/run scope', () => {
  assert.deepEqual(scope.browserVerificationMetadata({}), {});
  assert.throws(() => scope.browserVerificationMetadata({ CUEVO_VERIFICATION_RUN_ID: identity.runId }));
  assert.deepEqual(scope.browserVerificationMetadata({ CUEVO_VERIFICATION_RUN_ID: identity.runId, CUEVO_VERIFICATION_SOURCE_SHA: identity.sourceSha, CUEVO_VERIFICATION_SOURCE_DIGEST: identity.sourceDigest, CUEVO_VERIFICATION_SCOPE: identity.scope }), { cuevoBrowserVerification: identity });
});


test('a parent browser receipt exists only for completed exact account and ordinary scopes', () => {
  assert.equal(typeof scope.validateBrowserPhaseReceipt, 'function', 'parent admission must validate exact completed child evidence');
});

test('parent browser receipt admission rejects changed source scope counts exclusions and extra private fields', () => {
  const original: scope.BrowserPhaseReceipt = { version: 1 as const, identity: { ...identity, scope: 'browser' }, phaseRunId: '12345678-1234-4234-8234-123456789abc', status: 'VERIFIED' as const, startedAt: 1000, finishedAt: 2000, account: { completedTests: 3, inventorySha256: 'c'.repeat(64), reportSha256: 'd'.repeat(64) }, ordinary: { completedTests: 650, inventorySha256: 'e'.repeat(64), reportSha256: 'f'.repeat(64) }, excludedBrowserFiles: scope.reviewedBrowserExclusions.map(({ file, reason }) => ({ file, reason })) };
  assert.deepEqual(scope.validateBrowserPhaseReceipt(original, original.identity, 999, 2001), original);
  for (const mutate of [(value: scope.BrowserPhaseReceipt) => { value.identity.sourceSha = '1'.repeat(40); }, (value: scope.BrowserPhaseReceipt) => { value.identity.scope = 'ordinary-browser'; }, (value: scope.BrowserPhaseReceipt) => { value.account.completedTests = 2; }, (value: scope.BrowserPhaseReceipt) => { value.ordinary.completedTests = 0; }, (value: scope.BrowserPhaseReceipt) => { value.excludedBrowserFiles.pop(); }, (value: scope.BrowserPhaseReceipt) => { value.finishedAt = 2002; }, (value: scope.BrowserPhaseReceipt) => { Object.assign(value.ordinary, { stderr: 'private' }); }, (value: scope.BrowserPhaseReceipt) => { Object.assign(value, { rawReport: {} }); }]) {
    const value = structuredClone(original); mutate(value); assert.throws(() => scope.validateBrowserPhaseReceipt(value, original.identity, 999, 2001));
  }
});
