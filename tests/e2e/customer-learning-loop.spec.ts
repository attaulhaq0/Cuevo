import { expect, test, type Page } from '@playwright/test';
import { selectHumanChoice } from './human-choice';

const modulePath = './customer-learning-loop';
const actor = { role: 'teacher' as const, actorId: '20000000-0000-4000-8000-000000000004', schoolId: '10000000-0000-4000-8000-000000000001', email: 'teacher@cuevo.test', displayName: 'Fictional teacher' };
const apiOrigin = 'https://learning-loop-fixture.invalid';
const path = '/v1/courses';
function loopInput() {
  const roles = ['admin', 'coordinator', 'teacher', 'student', 'parent'] as const;
  const accounts = roles.map((role, index) => ({ ...actor, role, actorId: '20000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), email: role + '@cuevo.test', displayName: 'Fictional ' + role, password: 'fictional-test-password' }));
  return { apiOrigin, webOrigin: 'https://web-loop-fixture.invalid', title: 'Fictional learning sequence', accounts, context: { schoolId: actor.schoolId, classId: '30000000-0000-4000-8000-000000000001', classLabel: 'Year 1 · Cedar · 2026–2027', className: 'Year 1 · Cedar', yearGroupName: 'Year 1', classShortName: 'Cedar', subjectId: '43000000-0000-4000-8000-000000000001', subjectName: 'Mathematics', referenceId: '61000000-0000-4000-8000-000000000001', referenceTitle: 'School-authored explanation objective' } };
}

async function owner() {
  return import(modulePath).catch(() => null) as Promise<typeof import('./customer-learning-loop') | null>;
}
async function form(page: Page, headers: Record<string, string>) {
  if(new URL(page.url()).origin!==apiOrigin){await page.route(apiOrigin+'/form',route=>route.fulfill({status:200,contentType:'text/html',body:'<main></main>'}));await page.goto(apiOrigin+'/form');}
  await page.setContent('<main><button type="button">Save</button></main>');
  await page.evaluate(({ url, headers }) => {
    document.querySelector('button')!.addEventListener('click', () => {
      void fetch(url, { method: 'POST', headers, body: JSON.stringify({ title: 'Fictional course' }) });
    });
  }, { url: apiOrigin + path, headers });
}

test('the reusable loop imports outside test discovery and exposes its explicit consumers', async () => {
  const imported = await owner();
  expect(imported).not.toBeNull();
  expect(typeof imported?.runCustomerBrowserLearningLoop).toBe('function');
  expect(typeof imported?.observeCustomerLearningLoopMutation).toBe('function');
});

test('a Parent child label containing braces selects the literal learner rather than a regex-shaped peer', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull();
  await page.setContent('<main><label>Child<select></select></label></main>');
  await page.evaluate(() => { const select = document.querySelector('select')!; for (const [value, label] of [['literal-learner', 'Aisha {2} Hassan · Year 1 · Cedar'], ['other-learner', 'Aisha  Hassan · Year 1 · Cedar']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); } });
  const label = new RegExp(imported!.escapeCustomerLearningLoopLabel('Aisha {2} Hassan') + '.*' + imported!.escapeCustomerLearningLoopLabel('Year 1'));
  await selectHumanChoice(page.getByLabel('Child'), label, 'literal-learner');
  await expect(page.getByLabel('Child')).toHaveValue('literal-learner');
});

test('missing or duplicate selected actors refuse the journey before navigation and command hooks', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull();
  const input = loopInput(), accounts = input.accounts;
  for (const selected of [accounts.filter(account => account.role !== 'parent'), accounts.map(account => account.role === 'parent' ? { ...account, actorId: accounts[0].actorId } : account), accounts.map(account => account.role === 'teacher' ? { ...account, schoolId: '10000000-0000-4000-8000-000000000002' } : account)]) {
    let started = 0, requested = 0;
    page.on('request', () => { requested++; });
    await expect(imported!.runCustomerBrowserLearningLoop(page, { ...input, accounts: selected }, { beforeLoop: async () => { started++; } })).rejects.toThrow();
    expect(started).toBe(0); expect(requested).toBe(0); expect(page.url()).toBe('about:blank');
  }
});

test('pre-loop failure still invokes cleanup and preserves both original verification and cleanup failures', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); let cleanups = 0;
  const original = Error('Original source admission failed'), cleanup = Error('Known-session cleanup failed');
  let received: unknown;
  try { await imported!.runCustomerBrowserLearningLoop(page, loopInput(), { beforeLoop: async controls => { expect(typeof controls.signIn).toBe('function'); expect(typeof controls.signOut).toBe('function'); expect(typeof controls.visibleMutation).toBe('function'); throw original; }, cleanup: async () => { cleanups++; throw cleanup; } }); } catch (error) { received = error; }
  expect(cleanups).toBe(1); expect(received).toBeInstanceOf(AggregateError); expect((received as AggregateError).errors).toEqual([original, cleanup]); expect((received as AggregateError).cause).toBe(original); expect(page.url()).toBe('about:blank');
});

test('the original immutable actor snapshot survives an admission callback changing its input', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull();
  const originalActor = { ...actor };
  await page.route(apiOrigin + path, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }));
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  await imported!.observeCustomerLearningLoopMutation(page, { apiOrigin, intent: { path, actor: originalActor, scopeGeneration: 1 }, isCurrent: () => true, beforeMutation: async () => { originalActor.schoolId = '10000000-0000-4000-8000-000000000002'; }, action: () => page.getByRole('button', { name: 'Save' }).click(), onCommand: async observation => { expect(observation.actor.schoolId).toBe(actor.schoolId); expect(Object.isFrozen(observation.actor)).toBe(true); } });
});

test('failed pre-action admission prevents the visible command from being sent', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); let requests = 0, actions = 0;
  await page.route(apiOrigin + path, async route => { requests++; await route.abort(); });
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  const failure = Error('Unavailable original admission');
  await expect(imported!.observeCustomerLearningLoopMutation(page, { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => true, beforeMutation: async () => { throw failure; }, action: async () => { actions++; await page.getByRole('button', { name: 'Save' }).click(); } })).rejects.toBe(failure);
  expect(actions).toBe(0); expect(requests).toBe(0);
});

test('visible command observation binds the original request, school and receipt before publishing it', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull();
  const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' };
  const order: string[] = []; const responseFailures: unknown[] = []; let currentChecks = 0;
  await page.route(apiOrigin + path, async route => { order.push('request'); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }); });
  await form(page, headers);
  const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => { currentChecks++; return true; }, beforeMutation: async () => { order.push('admission'); }, action: () => page.getByRole('button', { name: 'Save' }).click(), onCommand: async (observation: import('./customer-learning-loop').CustomerLearningLoopCommandObservation) => { order.push('receipt'); expect(observation.key).toBe('original-loop-key'); expect(observation.actor).toEqual(actor); expect(observation.request.url()).toBe(apiOrigin + path); expect(observation.body).toEqual({ title: 'Fictional course' }); expect(observation.receipt.id).toBe('70000000-0000-4000-8000-000000000001'); }, onResponseFailure: (value: unknown) => { responseFailures.push(value); } };
  const receipt = await imported!.observeCustomerLearningLoopMutation(page, options);
  expect(receipt.id).toBe('70000000-0000-4000-8000-000000000001');
  expect(order).toEqual(['admission', 'request', 'receipt']);
  expect(responseFailures).toEqual([]); expect(currentChecks).toBe(5);
});

test('missing visible command response freezes the first bounded diagnostic without another scope check', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); await page.setContent('<button type="button">Save</button>'); page.setDefaultTimeout(1000);
  let currentChecks = 0, actions = 0; const failures: unknown[] = [], diagnosticError = Error('Private diagnostic failure');
  const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => { currentChecks++; return true; }, action: async () => { actions++; await page.getByRole('button', { name: 'Save' }).click({ timeout: 5000 }); }, onResponseFailure: (value: unknown) => { expect(Object.isFrozen(value)).toBe(true); failures.push(value); throw diagnosticError; } };
  let failure: unknown; try { await imported!.observeCustomerLearningLoopMutation(page, options); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error); expect(failure).not.toBe(diagnosticError); expect((failure as Error).message).toBe('The original visible command response could not be confirmed.');
  expect(failures).toEqual([{ schemaVersion: '1', stage: 'RESPONSE_CONFIRMATION', reason: 'NO_MATCHING_RESPONSE', requestCount: 0, responseSeen: false, originalSeen: false, currentScope: null }]);
  expect(currentChecks).toBe(2); expect(actions).toBe(1); expect(JSON.stringify(failures)).not.toMatch(/path|actor|school|key|body|token|https:/);
});

test('duplicate visible commands report the original count without reevaluating current scope', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); let requests = 0, currentChecks = 0; const failures: unknown[] = [];
  await page.route(apiOrigin + path, route => { requests++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }); });
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => { currentChecks++; return true; }, action: async () => { for (let count = 0; count < 2; count++) { const response = page.waitForResponse(value => value.url() === apiOrigin + path && value.request().method() === 'POST'); await page.getByRole('button', { name: 'Save' }).click(); await response; } }, onResponseFailure: (value: unknown) => { failures.push(value); } };
  await expect(imported!.observeCustomerLearningLoopMutation(page, options)).rejects.toThrow('The original visible command response could not be confirmed.');
  expect(failures).toEqual([{ schemaVersion: '1', stage: 'RESPONSE_CONFIRMATION', reason: 'MATCHING_REQUEST_COUNT', requestCount: 2, responseSeen: true, originalSeen: true, currentScope: null }]); expect(requests).toBe(2); expect(currentChecks).toBe(2);
});

test('stale visible command scope remains frozen when diagnostic delivery changes current state', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); let current = true, currentChecks = 0; const failures: unknown[] = [], diagnosticError = Error('Private diagnostic failure');
  await page.route(apiOrigin + path, route => { current = false; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }); });
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => { currentChecks++; return current; }, action: () => page.getByRole('button', { name: 'Save' }).click(), onResponseFailure: (value: unknown) => { failures.push(value); current = true; throw diagnosticError; } };
  const originalError = globalThis.Error; let createdGuardFailure: Error | undefined;
  globalThis.Error = new Proxy(originalError, { apply(target, thisArg, args) { const error = Reflect.apply(target, thisArg, args) as Error; if (args[0] === 'The original visible command response could not be confirmed.') createdGuardFailure = error; return error; } });
  let failure: unknown; try { await imported!.observeCustomerLearningLoopMutation(page, options); } catch (error) { failure = error; } finally { globalThis.Error = originalError; }
  expect(failure).toBe(createdGuardFailure); expect(failure).not.toBe(diagnosticError); expect((failure as Error).message).toBe('The original visible command response could not be confirmed.'); expect(currentChecks).toBe(3);
  expect(failures).toEqual([{ schemaVersion: '1', stage: 'RESPONSE_CONFIRMATION', reason: 'CURRENT_SCOPE_CHANGED', requestCount: 1, responseSeen: true, originalSeen: true, currentScope: false }]); expect(Object.isFrozen(failures[0])).toBe(true); expect(current).toBe(true);
});

test('a controlled response without an original request reports the second guard before scope evaluation', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); const failures: unknown[] = []; let currentChecks = 0;
  await page.route(apiOrigin + path, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }));
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  const pending = page.waitForResponse(response => response.url() === apiOrigin + path && response.request().method() === 'POST'); await page.getByRole('button', { name: 'Save' }).click(); const response = await pending;
  const originalWait = page.waitForResponse.bind(page); page.waitForResponse = () => Promise.resolve(response);
  try {
    const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => { currentChecks++; return true; }, action: async () => {}, onResponseFailure: (value: unknown) => { failures.push(value); } };
    await expect(imported!.observeCustomerLearningLoopMutation(page, options)).rejects.toThrow('The original visible command response could not be confirmed.');
  } finally { page.waitForResponse = originalWait; }
  expect(failures).toEqual([{ schemaVersion: '1', stage: 'RESPONSE_CONFIRMATION', reason: 'NO_ORIGINAL_REQUEST', requestCount: 0, responseSeen: true, originalSeen: false, currentScope: null }]); expect(currentChecks).toBe(2);
});

test('an action failure retains its original error and emits no response-guard diagnostic', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); page.setDefaultTimeout(100); const original = Error('Original visible action refused'), failures: unknown[] = [];
  const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => true, action: async () => { throw original; }, onResponseFailure: (value: unknown) => { failures.push(value); } };
  await expect(imported!.observeCustomerLearningLoopMutation(page, options)).rejects.toBe(original); expect(failures).toEqual([]);
});

test('response-guard diagnostics keep an overflowing event count unknown without changing the original rejection', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); const failures: unknown[] = []; let currentChecks = 0;
  await page.route(apiOrigin + path, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }));
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  const options = { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => { currentChecks++; return true; }, action: async () => { const response = page.waitForResponse(value => value.url() === apiOrigin + path && value.request().method() === 'POST'); await page.getByRole('button', { name: 'Save' }).click(); const original = (await response).request(), events = page as Page & { emit(event: 'request', request: import('@playwright/test').Request): boolean }; for (let count = 0; count < 1000; count++) events.emit('request', original); }, onResponseFailure: (value: unknown) => { failures.push(value); } };
  await expect(imported!.observeCustomerLearningLoopMutation(page, options)).rejects.toThrow('The original visible command response could not be confirmed.');
  expect(failures).toEqual([{ schemaVersion: '1', stage: 'RESPONSE_CONFIRMATION', reason: 'MATCHING_REQUEST_COUNT', requestCount: null, responseSeen: true, originalSeen: true, currentScope: null }]); expect(currentChecks).toBe(2);
});

test('wrong-school and malformed confirmed responses cannot publish command evidence', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull();
  for (const selected of ['school', 'receipt'] as const) {
    let published = 0;
    await page.route(apiOrigin + path, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(selected === 'receipt' ? { id: null } : { id: '70000000-0000-4000-8000-000000000001' }) }));
    await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': selected === 'school' ? '10000000-0000-4000-8000-000000000002' : actor.schoolId, Authorization: 'Bearer fictional-session' });
    await expect(imported!.observeCustomerLearningLoopMutation(page, { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => true, action: () => page.getByRole('button', { name: 'Save' }).click(), onCommand: async () => { published++; } })).rejects.toThrow(selected==='school'?'The original visible command identity could not be confirmed.':'The original visible command receipt is invalid.');
    expect(published).toBe(0); await page.unroute(apiOrigin+path);
  }
});

test('a delayed prior-actor receipt cannot publish evidence into the replacement scope', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); let current = true, published = 0;
  await page.route(apiOrigin + path, async route => { current = false; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }); });
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  await expect(imported!.observeCustomerLearningLoopMutation(page, { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => current, action: () => page.getByRole('button', { name: 'Save' }).click(), onCommand: async () => { published++; } })).rejects.toThrow('The original visible command response could not be confirmed.');
  expect(published).toBe(0);
});

test('a second visible command during the receipt callback prevents continuation with the first receipt', async ({ page }) => {
  const imported = await owner(); expect(imported).not.toBeNull(); let requests = 0;
  await page.route(apiOrigin + path, route => { requests++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }); });
  await form(page, { 'Content-Type': 'application/json', 'Idempotency-Key': 'original-loop-key', 'X-School-Id': actor.schoolId, Authorization: 'Bearer fictional-session' });
  await expect(imported!.observeCustomerLearningLoopMutation(page, { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => true, action: () => page.getByRole('button', { name: 'Save' }).click(), onCommand: async () => { const second = page.waitForResponse(response => response.url() === apiOrigin + path && response.request().method() === 'POST'); await page.getByRole('button', { name: 'Save' }).click(); await second; } })).rejects.toThrow('The original visible command scope changed before continuing.');
  expect(requests).toBe(2);
});
