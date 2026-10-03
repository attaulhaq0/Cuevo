import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserDiagnosticsSession, diagnosticFeature, diagnosticTiming, diagnosticViewport, classifyRuntimeDiagnostic, parseDiagnosticResponse } from '../browser-diagnostics.ts';

const observation = { category: 'api_error' as const, feature: 'learning' as const, status: 'denied' as const, timing: 'under_250ms' as const, locale: 'en' as const, viewport: 'desktop' as const };
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('collection stays disabled until server confirmation and ignores unsafe observations', async () => {
  const sent: unknown[] = [];
  const session = new BrowserDiagnosticsSession({ isCurrent: () => true, send: async value => { sent.push(value); } });
  session.report(observation);
  session.enable({ enabled: false }); session.report(observation);
  assert.equal(sent.length, 0);
  session.enable({ enabled: true }); session.report({ ...observation, message: 'private raw console' });
  session.report(observation); await settle();
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0] as object).sort(), ['category', 'diagnosticId', 'feature', 'locale', 'status', 'timing', 'viewport']);
  session.close();
});

test('deduplicates fixed observations, bounds the session and suppresses transport failure recursion', async () => {
  const sent: unknown[] = [];
  const session = new BrowserDiagnosticsSession({ isCurrent: () => true, send: async value => { sent.push(value); throw new Error('secret transport detail'); } });
  session.enable({ enabled: true });
  for (let index = 0; index < 100; index++) session.report(observation);
  for (const feature of ['school', 'learning', 'academic', 'curriculum', 'progress', 'improvement', 'community', 'portfolio', 'development', 'files', 'session', 'other']) {
    for (const status of ['success', 'denied', 'unavailable']) session.report({ ...observation, feature, status });
  }
  for (let index = 0; index < 25; index++) await settle();
  assert.equal(sent.length, 20);
  session.close();
});

test('success samples cannot consume the reserved failure capacity or exceed the total budget', async () => {
  const sent: { category: string; status: string; feature: string }[] = [];
  const session = new BrowserDiagnosticsSession({ isCurrent: () => true, send: async value => { sent.push(value); } });
  session.enable({ enabled: true });
  for (const feature of ['school', 'learning', 'academic', 'curriculum', 'progress', 'improvement', 'community', 'portfolio', 'development', 'files', 'session', 'other']) {
    for (const locale of ['en', 'ar']) session.report({ ...observation, category: 'api_request', status: 'success', feature, locale });
  }
  for (let index = 0; index < 25; index++) await settle();
  assert.equal(sent.filter(value => value.status === 'success').length, 5);
  session.report(observation);
  for (const feature of ['school', 'learning', 'academic', 'curriculum', 'progress', 'improvement', 'community', 'portfolio', 'development', 'files', 'session', 'other']) {
    for (const status of ['denied', 'unavailable']) session.report({ ...observation, feature, status });
  }
  for (let index = 0; index < 25; index++) await settle();
  assert.ok(sent.some(value => value.feature === 'learning' && value.status === 'denied'));
  assert.equal(sent.length, 20); assert.equal(sent.filter(value => value.status !== 'success').length, 15);
  session.close();
});

test('scope replacement cancels admitted transmission and discards queued prior-actor data', async () => {
  let current = true;
  let pendingSignal: AbortSignal | undefined;
  let finish!: () => void;
  let sent = 0;
  const session = new BrowserDiagnosticsSession({ isCurrent: () => current, send: async (_value, signal) => { sent++; pendingSignal = signal; await new Promise<void>(resolve => { finish = resolve; }); } });
  session.enable({ enabled: true }); session.report(observation); session.report({ ...observation, category: 'response_invalid' });
  assert.equal(sent, 1);
  current = false; session.close(); assert.equal(pendingSignal?.aborted, true);
  finish(); await settle(); assert.equal(sent, 1);
  session.report(observation); assert.equal(sent, 1);
});

test('sanitizes route, timings, viewport and runtime categories without forwarding raw text', () => {
  assert.equal(diagnosticFeature('/v1/courses/private-id?learner=secret'), 'learning');
  assert.equal(diagnosticFeature('/v1/diagnostics/browser'), null);
  assert.equal(diagnosticFeature('https://private.invalid/secret'), 'other');
  assert.equal(diagnosticTiming(250), '250_to_999ms'); assert.equal(diagnosticTiming(NaN), 'unknown');
  assert.equal(diagnosticViewport(390), 'mobile'); assert.equal(diagnosticViewport(900), 'tablet'); assert.equal(diagnosticViewport(1500), 'desktop');
  assert.equal(classifyRuntimeDiagnostic('Hydration failed because the server rendered HTML private child name'), 'hydration_error');
  assert.equal(classifyRuntimeDiagnostic({ message: 'private', stack: 'secret' }), 'runtime_error');
});

test('only known production React hydration code becomes a fixed hydration category', () => {
  assert.equal(classifyRuntimeDiagnostic('Minified React error #418; visit https://react.dev/errors/418?args[]=private learner text'), 'hydration_error');
  assert.equal(classifyRuntimeDiagnostic('Minified React error #419; private answer and stack'), 'runtime_error');
  assert.equal(classifyRuntimeDiagnostic('Private source item #418 was not found'), 'runtime_error');
  assert.equal(classifyRuntimeDiagnostic({ message: 'Minified React error #418; private' }), 'runtime_error');
});

test('parser boundary reports a fixed invalid category while preserving the original failure', () => {
  const reports: unknown[] = []; const original = new Error('private server response');
  assert.throws(() => parseDiagnosticResponse({}, () => { throw original; }, value => reports.push(value), { ...observation, category: 'api_request' }), error => error === original);
  assert.deepEqual(reports, [{ ...observation, category: 'response_invalid', status: 'invalid' }]);
});
