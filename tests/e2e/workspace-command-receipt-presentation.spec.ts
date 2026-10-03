import { test, expect, type Page, type Route } from '@playwright/test';

// These regressions use the production frontend with fictional intercepted
// Auth/API responses. They establish receipt/retry presentation, not authority.
const learnerId = 'f1100000-0000-4000-8000-000000000001';
const schoolId = 'f1200000-0000-4000-8000-000000000001';
const courseId = 'f1400000-0000-4000-8000-000000000001';
const goalId = 'f5400000-0000-4000-8000-000000000001';
type JsonBody = Record<string, unknown>;
type CapturedCommand = { path: string; key: string | undefined; body: JsonBody };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function fictionalWorkspace(page: Page, view: 'development' | 'portfolio', responseFor: (route: Route, url: URL) => Promise<unknown | undefined>) {
  const commands: CapturedCommand[] = [];
  const errors: string[] = [];
  const remoteOrigins: string[] = [];
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.includes('/auth/v1/') || url.pathname.startsWith('/v1/')) {
      if (request.method() === 'POST' && url.pathname.startsWith('/v1/')) commands.push({ path: url.pathname, key: request.headers()['idempotency-key'], body: request.postDataJSON() as JsonBody });
      let body: unknown = { items: [], nextCursor: null };
      if (url.pathname.includes('/auth/v1/token')) body = {
        access_token: 'fictional-presentation-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fictional-presentation-refresh', user: {
          id: learnerId, aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid',
          app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z',
        },
      };
      else if (url.pathname === '/v1/me') body = {
        userId: learnerId, schoolId, membershipId: 'f1600000-0000-4000-8000-000000000001', role: 'student',
        entitlements: ['school.operations', 'learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'portfolio', 'community'],
        school: { id: schoolId, name: 'Illustrative Trail School' }, displayName: 'Alex',
      };
      else if (url.pathname === '/v1/diagnostics/config') body = { enabled: false };
      else body = await responseFor(route, url) ?? body;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); return;
    }
    if (url.origin !== origin) { remoteOrigins.push(url.origin); await route.abort(); return; }
    await route.continue();
  });
  await page.goto(`/?view=${view}`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill('learner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fictional-presentation-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  return { commands, errors, remoteOrigins };
}

async function revalidate(page: Page) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/v1/me');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await response).ok()).toBe(true);
}

test('a malformed goal receipt after an unmounted read refresh keeps its original revision payload and retry key', async ({ page }) => {
  const held = deferred(), started = deferred();
  const reviewPath = `/v1/development/goals/${goalId}/review`;
  const goal = {
    id: goalId, revisionId: 'f5500000-0000-4000-8000-000000000001', revision: 1,
    learnerId, learnerName: 'Alex', courseId, courseTitle: 'Exploring explanations', referenceId: null, referenceTitle: null,
    title: 'Explain my checking step', plannedStep: 'Compare two explanations and describe why my example works.',
    status: 'ACTIVE', review: null as string | null, createdAt: '2026-10-03T08:00:00Z', reviewedAt: null as string | null,
  };
  let reviewAttempts = 0;
  let returnedGoal = goal;
  const fixture = await fictionalWorkspace(page, 'development', async (route, url) => {
    if (url.pathname === '/v1/courses') return { items: [{ id: courseId, classId: 'f1700000-0000-4000-8000-000000000001', subjectId: 'f1800000-0000-4000-8000-000000000001', title: goal.courseTitle, description: 'Fictional current course.', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00Z' }], nextCursor: null };
    if (url.pathname === '/v1/development/goals') return { items: [returnedGoal], nextCursor: null };
    if (url.pathname === reviewPath && route.request().method() === 'POST') {
      reviewAttempts++;
      const sent = route.request().postDataJSON() as JsonBody;
      const receipt = { ...goal, revisionId: 'f5600000-0000-4000-8000-000000000001', revision: 2, status: 'CLOSED', review: String(sent.review).trim(), reviewedAt: '2026-10-03T09:00:00Z' };
      if (reviewAttempts === 1) { started.resolve(); await held.promise; return { ...receipt, plannedStep: 'Malformed changed planned step' }; }
      returnedGoal = receipt;
      return receipt;
    }
  });
  try {
    await page.getByRole('button', { name: 'Review my goal', exact: true }).click();
    const form = page.getByRole('region', { name: 'Review my goal', exact: true });
    await form.getByLabel('Goal state', { exact: true }).selectOption('CLOSED');
    await form.getByLabel('What I reviewed', { exact: true }).fill('I reviewed my explanation with the recorded example.');
    await form.getByLabel('I confirm this is my own review', { exact: true }).check();
    const originalNode = await form.elementHandle();
    await form.getByRole('button', { name: 'Save', exact: true }).click(); await started.promise;
    await revalidate(page);
    await expect.poll(() => originalNode!.evaluate(element => element.isConnected)).toBe(false);
    await expect(page.getByRole('heading', { name: goal.title, exact: true })).toBeVisible();
    const returned = page.waitForResponse(response => new URL(response.url()).pathname === reviewPath && response.request().method() === 'POST');
    held.resolve(); expect((await returned).ok()).toBe(true);
    await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible();
    await expect(form.getByLabel('What I reviewed', { exact: true })).toBeDisabled();
    await expect(form.getByLabel('What I reviewed', { exact: true })).toHaveValue('I reviewed my explanation with the recorded example.');
    await expect(page.getByText('Your goal review is recorded.', { exact: true })).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await form.getByRole('button', { name: 'Retry the same action', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Learning goals', exact: true })).toBeFocused();
    await expect(page.getByText('Your goal review is recorded.', { exact: true })).toBeVisible();
    const reviews = fixture.commands.filter(command => command.path === reviewPath);
    expect(reviews).toHaveLength(2); expect(reviews[0].key).toBeTruthy(); expect(reviews[1].key).toBe(reviews[0].key);
    expect(reviews.map(command => command.body)).toEqual(Array.from({ length: 2 }, () => ({ expectedRevision: 1, status: 'CLOSED', review: 'I reviewed my explanation with the recorded example.', confirmReview: true })));
    expect(fixture.errors).toEqual([]); expect(fixture.remoteOrigins).toEqual([]);
  } finally { held.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('a still-mounted form clears saving after access refresh and a late valid receipt without another POST or old notice', async ({ page }) => {
  const held = deferred(), started = deferred();
  const path = '/v1/portfolio/collections';
  const fixture = await fictionalWorkspace(page, 'portfolio', async (route, url) => {
    if (url.pathname === path && route.request().method() === 'POST') { started.resolve(); await held.promise; return { id: 'f9000000-0000-4000-8000-000000000001' }; }
  });
  try {
    await page.getByRole('button', { name: 'Create named collection', exact: true }).click();
    const form = page.getByRole('region', { name: 'Create named collection', exact: true });
    await form.getByLabel('Collection name', { exact: true }).fill('My recorded explanations');
    await form.getByLabel('Collection description', { exact: true }).fill('A fictional collection scope check.');
    const originalNode = await form.elementHandle();
    await form.getByRole('button', { name: 'Save', exact: true }).click(); await started.promise;
    await revalidate(page); await expect(form).toBeVisible();
    expect(await form.evaluate((element, prior) => element === prior, originalNode)).toBe(true);
    await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible();
    const returned = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
    held.resolve(); expect((await returned).ok()).toBe(true);
    await expect(form.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect(form.getByRole('button', { name: 'Saving…', exact: true })).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Collection name', { exact: true })).toHaveValue('My recorded explanations');
    await expect(page.getByRole('status').filter({ hasText: 'Create named collection: Saved.' })).toHaveCount(0);
    expect(fixture.commands.filter(command => command.path === path)).toHaveLength(1);
    expect(fixture.errors).toEqual([]); expect(fixture.remoteOrigins).toEqual([]);
  } finally { held.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
});
