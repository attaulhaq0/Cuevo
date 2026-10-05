import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openTrailWorkspace } from './trail-workspace';

// Intercepted presentation: no product command or external request is delivered.
// Actual learner/tenant/source authority is tested separately through API/SQL.
const learnerId = 'f2100000-0000-4000-8000-000000000001';
const schoolId = 'f2200000-0000-4000-8000-000000000001';
const sourceId = (value: number) => `f2300000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const courseId = sourceId(100), assessmentId = sourceId(101);

async function ownStaticSubmissions(page: Page) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const blocked: string[] = [], consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleErrors.push(message.text()); });
  const submissions = Array.from({ length: 30 }, (_, index) => ({
    id: sourceId(index + 1), assessmentId, learnerId, learnerName: 'Alex Reed', assessmentTitle: `Explanation from lesson ${index + 1}`,
    content: 'I checked each step and explained how the evidence supports my answer. '.repeat(4), responseKind: 'TEXT', artifactCount: 0,
    status: index % 2 ? 'CLOSED' : 'SUBMITTED', revision: 1, previousSubmissionId: null, sourceReturnId: null, returnId: null, returnFeedback: null, returnedAt: null,
    submittedAt: '2026-10-05T09:00:00Z',
  }));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/v1/') || url.pathname.includes('/auth/v1/')) {
      if (!['GET', 'OPTIONS'].includes(request.method()) && !(url.pathname.endsWith('/auth/v1/token') && request.method() === 'POST')) {
        blocked.push(`${request.method()} ${url.pathname}`); await route.abort(); return;
      }
      let body: unknown = { items: [], nextCursor: null };
      if (url.pathname.endsWith('/auth/v1/token')) body = {
        access_token: 'fictional-submission-presentation-token', refresh_token: 'fictional-submission-presentation-refresh', token_type: 'bearer', expires_in: 3600,
        user: { id: learnerId, aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
      };
      else if (url.pathname === '/v1/me') body = {
        userId: learnerId, schoolId, membershipId: sourceId(200), role: 'student', displayName: 'Alex Reed',
        school: { id: schoolId, name: 'Reference learning school' }, entitlements: ['learning', 'assessment', 'curriculum'],
      };
      else if (url.pathname === '/v1/diagnostics/config') body = { enabled: false };
      else if (url.pathname === '/v1/courses') body = { items: [{ id: courseId, classId: sourceId(102), subjectId: sourceId(103), title: 'Reasoning and explanation', description: 'Current school-authored learning context.', status: 'PUBLISHED', createdAt: '2026-10-01T00:00:00Z' }], nextCursor: null };
      else if (url.pathname === '/v1/assessments') body = { items: [{ id: assessmentId, courseId, courseTitle: 'Reasoning and explanation', title: 'Explain the checking step', instructions: 'Explain one checking step.', status: 'PUBLISHED', dueAt: null, model: 'numeric', maxScore: 10, policyVersion: 1, referenceId: null, currentSubmission: null, availableFrom: null, availableUntil: null, allowLate: true, assignmentState: 'OPEN', availabilityVersion: 1, submissionKind: 'TEXT' }], nextCursor: null };
      else if (url.pathname === '/v1/submissions') body = { items: submissions, nextCursor: null };
      else if (url.pathname === '/v1/curriculum/learning-availability') body = { items: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); return;
    }
    if (url.origin !== origin || !['GET', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
    await route.continue();
  });
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill('learner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fictional-presentation-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.workspace-chrome')).toBeVisible();
  await openTrailWorkspace(page, 'Learning');
  const section = page.locator('[data-workspace-sections] [data-workspace-section="submissions"]');
  await section.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.submission-list > .submission-section')).toHaveCount(30);
  await expect(page.getByRole('heading', { name: 'Explanation from lesson 1', exact: true })).toBeVisible();
  await expect(page.locator('.submission-section').nth(0)).toContainText('Submitted — awaiting review');
  await expect(page.locator('.submission-section').nth(1)).toContainText('Closed');
  await expect(page.locator('.submission-section').first()).toContainText('A grade or attainment result is not implied.');
  await expect(page.locator('.submission-list .native-score')).toHaveCount(0);
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.locator('.submission-list button, .submission-list input, .submission-list select, .submission-list textarea, .submission-list a[href]')).toHaveCount(0);
  return { blocked, consoleErrors, section };
}

async function tabToMain(page: Page, main: Locator) {
  // Enter starts from the visible actual toolbar; only native Tab can reach main.
  const refresh = page.locator('[data-workspace-sections] .cuevo-workspace-section-actions button');
  await refresh.focus(); await expect(refresh).toBeFocused();
  const chromeStops = await page.locator('.workspace-chrome__header button, .workspace-chrome__focused-navigation button').count();
  for (let step = 0; step < chromeStops + 5; step++) {
    await page.keyboard.press('Tab');
    if (await main.evaluate(element => document.activeElement === element)) return;
  }
  await expect(main, 'A static long reading region must be reachable through the native Tab cycle').toBeFocused();
}

test('Student static submissions are reachable by Tab and PageDown scrolls the focused main', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const evidence = await ownStaticSubmissions(page), main = page.locator('#main-content');
  await tabToMain(page, main);
  await expect(main).toHaveAttribute('tabindex', '0');
  await expect(page.locator('main h1')).toHaveCount(1); await expect(page.locator('main h1')).toHaveText('Submissions');
  await expect(page.locator('main .workspace-intro')).toHaveCount(0);
  expect(await main.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await main.evaluate(element => { const style = getComputedStyle(element); return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2; })).toBe(true);
  const start = await main.evaluate(element => element.scrollTop);
  await page.keyboard.press('PageDown'); await expect.poll(() => main.evaluate(element => element.scrollTop)).toBeGreaterThan(start);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.workspace-chrome__header')).toBeVisible(); await expect(page.locator('.workspace-chrome__focused-navigation')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations).toEqual([]);
  expect(evidence.blocked).toEqual([]); expect(evidence.consoleErrors).toEqual([]);
});

test('Arabic Student submissions keep one page flow and a reachable selected section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const evidence = await ownStaticSubmissions(page);
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('.submission-list > .submission-section')).toHaveCount(30);
  await expect(page.locator('main h1')).toHaveCount(1); await expect(page.locator('main h1')).toHaveText('التسليمات');
  const selected = page.locator('[data-workspace-sections] [data-workspace-section="submissions"]');
  await selected.focus(); await page.keyboard.press('Enter');
  expect(await selected.evaluate(element => { const item = element.getBoundingClientRect(), rail = element.parentElement!.getBoundingClientRect(); return item.height >= 44 && item.left >= rail.left - 1 && item.right <= rail.right + 1; })).toBe(true);
  expect(await page.locator('#main-content').evaluate(element => getComputedStyle(element).overflowY)).not.toBe('auto');
  await page.keyboard.press('Tab'); await page.keyboard.press('PageDown');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.locator('#main-content').evaluate(element => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(evidence.blocked).toEqual([]); expect(evidence.consoleErrors).toEqual([]);
});
