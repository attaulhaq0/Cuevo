import test from 'node:test';
import assert from 'node:assert/strict';
import type { PilotWindowEvidence, PilotPorts, PilotPrivateCleanupResult, PilotRunIdentity } from './pilot-window-rules';

const module = await import('./pilot-window-rules').catch(() => ({}));
type RuleApi = typeof import('./pilot-window-rules');
const rules = module as RuleApi;
const identity: PilotRunIdentity = { repository: 'attaulhaq0/Cuevo', commitSha: 'b'.repeat(40), ref: 'refs/heads/codex/cuevo-integrated-review', runId: '100', runAttempt: 1, ciRunId: '99' };
const context = { platform: 'linux', ci: 'true', githubActions: 'true', runnerEnvironment: 'github-hosted', event: 'workflow_dispatch', repository: identity.repository, sha: identity.commitSha, expectedSha: identity.commitSha, headSha: identity.commitSha, ref: identity.ref, clean: true, runId: identity.runId, runAttempt: 1, ciRunId: identity.ciRunId };
const ci = { id: 99, head_sha: identity.commitSha, head_branch: 'codex/cuevo-integrated-review', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: identity.repository } };
const startedAt = Date.parse('2026-10-05T12:00:00Z');
const cases = { performance: ['customer-performance.spec.ts', 'customer performance: production browser navigation, private bytes, fixture analysis and private updates'], volume: ['customer-pilot-volume.spec.ts', 'pilot browser volume: current class/state, source learning, large community and parent-approved portfolios'] };
function browserReport(window: 'performance' | 'volume' = 'performance') { const [file, title] = cases[window]; return { stats: { startTime: new Date(startedAt + 1).toISOString(), duration: 100, expected: 1, unexpected: 0, flaky: 0, skipped: 0 }, errors: [], suites: [{ specs: [{ file, title, ok: true, tests: [{ expectedStatus: 'passed', projectName: 'production-chromium', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [], duration: 10, startTime: new Date(startedAt + 2).toISOString() }] }] }] }] }; }
function harness(fail?: string, cleanupRecovery = false, recordFailAt?: string) {
  const order: string[] = [], evidence: PilotWindowEvidence[] = [];
  let clock = 0;
  const action = async (name: string) => { order.push(name); if (name === fail) throw Error('Private exception must not enter evidence'); };
  let recordFailed = false;
  const ports: PilotPorts = {
    identity, now: () => ++clock,
    context: () => action('context'), canonicalCi: () => action('canonical-ci'), sourceStart: () => action('source-start'), bootstrap: () => action('clean-bootstrap'), reference: window => action(window ? `${window}-reference` : 'clean-reference'), build: () => action('build'), ownership: window => action(`${window}-ownership`), setupVolume: () => action('volume-setup'), browser: window => action(`${window}-browser`), stop: window => action(`${window}-stop`), journal: window => action(`${window}-journal`), cleanupPrivate: async window => { const name = `${window}-private-cleanup`; if (name === fail && cleanupRecovery) { order.push(name); return { status: 'FAILED', restorationAllowed: true }; } await action(name); return { status: 'PASSED', restorationAllowed: true }; }, restore: window => action(`${window}-restore`), sourceFreeze: () => action('source-freeze'),
    record: async value => { evidence.push(structuredClone(value)); if (!recordFailed && recordFailAt && value.rows.some(row => row.name === recordFailAt && row.status === 'PASSED')) { recordFailed = true; throw Error('Private journal unavailable'); } },
  };
  return { ports, order, evidence };
}
const successOrder = ['context', 'canonical-ci', 'source-start', 'clean-bootstrap', 'clean-reference', 'build', 'performance-ownership', 'performance-browser', 'performance-stop', 'performance-journal', 'performance-private-cleanup', 'performance-restore', 'performance-reference', 'volume-ownership', 'volume-setup', 'volume-browser', 'volume-stop', 'volume-journal', 'volume-private-cleanup', 'volume-restore', 'volume-reference', 'source-freeze'];

test('pilot context admits only clean exact-source manual Linux GitHub-hosted Cuevo execution', () => {
  assert.equal(typeof rules.validatePilotWindowContext, 'function');
  assert.equal(rules.validatePilotWindowContext(context).sha, identity.commitSha);
  for (const fields of [{ platform: 'win32' }, { ci: 'false' }, { githubActions: 'false' }, { runnerEnvironment: 'self-hosted' }, { event: 'pull_request' }, { repository: 'other/Cuevo' }, { sha: 'a'.repeat(40) }, { headSha: 'a'.repeat(40) }, { expectedSha: 'a'.repeat(40) }, { ref: 'refs/pull/1/merge' }, { ref: 'refs/heads/other' }, { clean: false }, { runId: '-1' }, { runAttempt: 0 }, { ciRunId: 'undefined' }, { token: 'must not be accepted' }]) assert.throws(() => rules.validatePilotWindowContext({ ...context, ...fields }));
});
test('pilot CI admission accepts exact branch push and rejects PR, wrong SHA and partial workflow proof', () => {
  assert.equal(typeof rules.validatePilotCiRun, 'function');
  assert.doesNotThrow(() => rules.validatePilotCiRun(ci, rules.validatePilotWindowContext(context)));
  for (const fields of [{ id: 98 }, { head_sha: 'a'.repeat(40) }, { head_branch: 'main' }, { event: 'pull_request' }, { event: 'workflow_dispatch' }, { conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' }, { path: '.github/workflows/pilot.yml' }, { repository: { full_name: 'other/Cuevo' } }]) assert.throws(() => rules.validatePilotCiRun({ ...ci, ...fields }, rules.validatePilotWindowContext(context)));
  const main = { ...context, ref: 'refs/heads/main' }; assert.doesNotThrow(() => rules.validatePilotCiRun({ ...ci, head_branch: 'main' }, rules.validatePilotWindowContext(main)));
});
test('fresh one-case browser report admits each exact selected measurement and excludes a renamed unrelated case', () => {
  assert.equal(typeof rules.validatePilotBrowserReport, 'function');
  for (const window of ['performance', 'volume'] as const) assert.equal(rules.validatePilotBrowserReport(browserReport(window), { window, startedAt, finishedAt: startedAt + 1000 }), 1);
  assert.throws(() => rules.validatePilotBrowserReport(browserReport('performance'), { window: 'volume', startedAt, finishedAt: startedAt + 1000 }));
});
test('stale, skipped, flaky, missing, repeated, failed or interrupted browser reports never qualify', () => {
  assert.equal(typeof rules.validatePilotBrowserReport, 'function');
  const inputs: unknown[] = [undefined, {}, browserReport('volume')];
  for (const field of ['skipped', 'unexpected', 'flaky'] as const) { const value = browserReport(); value.stats[field] = 1; inputs.push(value); }
  for (const status of ['skipped', 'failed', 'interrupted', 'timedOut']) { const value = browserReport(); value.suites[0].specs[0].tests[0].results[0].status = status; inputs.push(value); }
  const stale = browserReport(); stale.stats.startTime = new Date(startedAt - 1).toISOString(); inputs.push(stale);
  const future = browserReport(); future.suites[0].specs[0].tests[0].results[0].startTime = new Date(startedAt + 2000).toISOString(); inputs.push(future);
  const missing = browserReport(); missing.suites = []; inputs.push(missing);
  const repeated = browserReport(); repeated.suites.push(structuredClone(repeated.suites[0])); inputs.push(repeated);
  const retry = browserReport(); retry.suites[0].specs[0].tests[0].results[0].retry = 1; inputs.push(retry);
  const error = browserReport(); error.errors.push('private' as never); inputs.push(error);
  const project = browserReport(); project.suites[0].specs[0].tests[0].projectName = 'other'; inputs.push(project);
  for (const value of inputs) assert.throws(() => rules.validatePilotBrowserReport(value, { window: 'performance', startedAt, finishedAt: startedAt + 1000 }));
});
test('both windows must run in order and restore source context before the next one', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness();
  assert.equal(await rules.verifyPilotWindows(h.ports), 0); assert.deepEqual(h.order, successOrder);
  const final = h.evidence.at(-1)!; assert.equal(final.status, 'VERIFIED'); assert.equal(final.recordFailed, false);
  assert.deepEqual(final.rows.map(row => row.sequence), Array.from({ length: 22 }, (_, index) => index + 1));
  assert.equal(JSON.stringify(final).includes('Private'), false); assert.doesNotThrow(() => rules.validatePilotWindowEvidence(final));
});
for (const fail of ['context', 'canonical-ci', 'source-start', 'clean-bootstrap', 'clean-reference', 'build']) test(`${fail} failure prevents measurement and cannot count as successful cleanup`, async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(fail);
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.some(name => name.includes('browser')), false);
  assert.equal(h.order.includes('performance-restore'), false); assert.equal(h.evidence.at(-1)!.status, 'FAILED');
});
test('failed performance browser is restored but remains failed and does not start volume', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness('performance-browser');
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.deepEqual(h.order, successOrder.slice(0, 13).concat('source-freeze'));
  assert.equal(h.evidence.at(-1)!.rows.find(row => row.name === 'performance-browser')!.status, 'FAILED');
});
for (const fail of ['performance-ownership', 'performance-stop', 'performance-journal']) test(`${fail} failure withholds destructive cleanup and restore`, async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(fail);
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('performance-private-cleanup'), false); assert.equal(h.order.includes('performance-restore'), false); assert.equal(h.order.includes('volume-ownership'), false);
});
test('unknown private-cleanup source error withholds reset; known owned removal failure still restores and fails', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function');
  const unknown = harness('performance-private-cleanup'); assert.equal(await rules.verifyPilotWindows(unknown.ports), 1); assert.equal(unknown.order.includes('performance-restore'), false);
  const owned = harness('performance-private-cleanup', true); assert.equal(await rules.verifyPilotWindows(owned.ports), 1); assert.equal(owned.order.includes('performance-restore'), true); assert.equal(owned.order.includes('performance-reference'), true); assert.equal(owned.order.includes('volume-ownership'), false);
});
for (const fail of ['performance-restore', 'performance-reference']) test(`${fail} failure stops the next window and keeps a failed acceptance`, async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(fail);
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('volume-ownership'), false); assert.equal(h.order.includes('source-freeze'), true);
});
test('recording failure after ownership still attempts cleanup and restore but cannot start another window', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(undefined, false, 'performance-browser');
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('performance-restore'), true); assert.equal(h.order.includes('volume-ownership'), false); assert.equal(h.evidence.at(-1)!.recordFailed, true);
});
test('evidence recording failure cannot abandon a successfully admitted private ownership journal', async () => {
  const h = harness(undefined, false, 'performance-ownership');
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('performance-browser'), false); assert.equal(h.order.includes('performance-stop'), true); assert.equal(h.order.includes('performance-restore'), true); assert.equal(h.order.includes('volume-ownership'), false);
});
test('journal persistence failure stops before private deletion or reset', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(undefined, false, 'performance-journal');
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('performance-private-cleanup'), false); assert.equal(h.order.includes('performance-restore'), false);
});
for (const fail of ['volume-setup', 'volume-browser']) test(`${fail} failure still completes safe terminal cleanup and source freeze`, async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(fail);
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('volume-restore'), true); assert.equal(h.order.includes('volume-reference'), true); assert.equal(h.order.at(-1), 'source-freeze');
  if (fail === 'volume-setup') assert.equal(h.order.includes('volume-browser'), false);
});
test('source freeze failure invalidates otherwise successful measurements', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness('source-freeze');
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.evidence.at(-1)!.status, 'FAILED');
});
test('failed clock observation cannot interrupt terminal ownership cleanup or become zero duration', async () => {
  const h = harness(); let tick = 0;
  h.ports.now = () => { if (++tick === 16) throw Error('private clock'); return tick; };
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('performance-restore'), true); assert.equal(h.order.includes('volume-ownership'), false); assert.equal(h.evidence.at(-1)!.rows.find(row => row.name === 'performance-browser')!.durationMs, null);
});
test('terminal recording failure after successful freeze remains unsuccessful', async () => {
  const h = harness(undefined, false, 'source-freeze');
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.evidence.at(-1)!.recordFailed, true);
});
test('run identity mutation by a callback cannot change admitted evidence', async () => {
  const h = harness(); h.ports.identity = structuredClone(identity);
  h.ports.browser = async window => { h.order.push(`${window}-browser`); h.ports.identity.commitSha = 'c'.repeat(40); };
  assert.equal(await rules.verifyPilotWindows(h.ports), 0); assert.equal(h.evidence.at(-1)!.identity.commitSha, identity.commitSha);
});
test('evidence rejects missing/unknown/reordered/forged success rows and sensitive fields', async () => {
  assert.equal(typeof rules.verifyPilotWindows, 'function'); const h = harness(); await rules.verifyPilotWindows(h.ports); const final = h.evidence.at(-1)!;
  const missing = structuredClone(final); missing.rows.pop();
  const unknown = structuredClone(final); unknown.rows[0] = { ...unknown.rows[0], status: 'UNKNOWN', exitCode: null, durationMs: null };
  const reordered = structuredClone(final); reordered.rows.reverse();
  const forged = structuredClone(final); forged.rows[0] = { ...forged.rows[0], exitCode: 1 };
  for (const value of [missing, unknown, reordered, forged, { ...final, rawError: 'private' }, { ...final, recordFailed: true }]) assert.throws(() => rules.validatePilotWindowEvidence(value));
});
test('serialized evidence cannot skip safe ownership gates or claim volume after failed performance', async () => {
  const h = harness(); await rules.verifyPilotWindows(h.ports); const final = h.evidence.at(-1)!;
  const blocked = structuredClone(final); blocked.status = 'FAILED'; blocked.rows.find(row => row.name === 'performance-stop')!.status = 'FAILED'; blocked.rows.find(row => row.name === 'performance-stop')!.exitCode = 1;
  const ignoredFailure = structuredClone(final); ignoredFailure.status = 'FAILED'; ignoredFailure.rows.find(row => row.name === 'performance-browser')!.status = 'FAILED'; ignoredFailure.rows.find(row => row.name === 'performance-browser')!.exitCode = 1;
  for (const value of [blocked, ignoredFailure]) assert.throws(() => rules.validatePilotWindowEvidence(value));
});
test('malformed cleanup result cannot masquerade as successful removal or authorize reset', async () => {
  const h = harness(); h.ports.cleanupPrivate = async () => ({ status: 'PASSED', restorationAllowed: true, rawError: 'private' } as PilotPrivateCleanupResult);
  assert.equal(await rules.verifyPilotWindows(h.ports), 1); assert.equal(h.order.includes('performance-restore'), false);
});
test('unknown serialized stop or journal timing cannot imply confirmed destructive operation authority', async () => {
  const h = harness('performance-browser'); await rules.verifyPilotWindows(h.ports); const final = h.evidence.at(-1)!;
  for (const name of ['performance-stop', 'performance-journal'] as const) {
    const forged = structuredClone(final); const row = forged.rows.find(row => row.name === name)!;
    Object.assign(row, { status: 'UNKNOWN', actionConfirmed: false, exitCode: null, durationMs: null });
    assert.throws(() => rules.validatePilotWindowEvidence(forged));
  }
});
test('serialized failed or unknown private cleanup cannot authorize a restore without its explicit owned receipt', async () => {
  const h = harness('performance-private-cleanup', true); await rules.verifyPilotWindows(h.ports); const final = h.evidence.at(-1)!;
  for (const status of ['FAILED', 'UNKNOWN'] as const) {
    const forged = structuredClone(final); const cleanup = forged.rows.find(row => row.name === 'performance-private-cleanup')!;
    Object.assign(cleanup, { status, actionConfirmed: false, restorationAllowed: null, exitCode: status === 'FAILED' ? 1 : null, durationMs: status === 'FAILED' ? 1 : null });
    assert.throws(() => rules.validatePilotWindowEvidence(forged));
  }
});
test('serialized unknown cleanup cannot retain restoration permission from an earlier known owned failure', async () => {
  const h = harness('performance-private-cleanup', true); await rules.verifyPilotWindows(h.ports); const final = h.evidence.at(-1)!;
  const forged = structuredClone(final), cleanup = forged.rows.find(row => row.name === 'performance-private-cleanup')!;
  forged.status = 'NOT_VERIFIED';
  Object.assign(cleanup, { status: 'UNKNOWN', actionConfirmed: false, exitCode: null, durationMs: null, restorationAllowed: true });
  assert.equal(forged.rows.find(row => row.name === 'performance-restore')!.status, 'PASSED');
  assert.throws(() => rules.validatePilotWindowEvidence(forged));
});
