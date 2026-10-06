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
  const order: string[] = [];
  await page.route(apiOrigin + path, async route => { order.push('request'); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '70000000-0000-4000-8000-000000000001' }) }); });
  await form(page, headers);
  const receipt = await imported!.observeCustomerLearningLoopMutation(page, { apiOrigin, intent: { path, actor, scopeGeneration: 1 }, isCurrent: () => true, beforeMutation: async () => { order.push('admission'); }, action: () => page.getByRole('button', { name: 'Save' }).click(), onCommand: async observation => { order.push('receipt'); expect(observation.key).toBe('original-loop-key'); expect(observation.actor).toEqual(actor); expect(observation.request.url()).toBe(apiOrigin + path); expect(observation.body).toEqual({ title: 'Fictional course' }); expect(observation.receipt.id).toBe('70000000-0000-4000-8000-000000000001'); } });
  expect(receipt.id).toBe('70000000-0000-4000-8000-000000000001');
  expect(order).toEqual(['admission', 'request', 'receipt']);
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
