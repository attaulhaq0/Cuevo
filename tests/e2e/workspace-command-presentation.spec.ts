import { expectTrailWorkspace } from './trail-workspace';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Production frontend with every Auth/API response intercepted. This suite
// establishes presentation/history/focus behavior, never backend authorization.
const learnerId = 'f1100000-0000-4000-8000-000000000001';
const schoolId = 'f1200000-0000-4000-8000-000000000001';
const periodId = 'f1500000-0000-4000-8000-000000000001';
const policyId = 'f1800000-0000-4000-8000-000000000001';

async function fictionalWorkspace(page: Page) {
  const posts: string[] = [];
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.includes('/auth/v1/') || url.pathname.startsWith('/v1/')) {
      if (request.method() === 'POST') posts.push(url.pathname);
      let response: unknown = { items: [], nextCursor: null };
      if (url.pathname.includes('/auth/v1/token')) response = {
        access_token: 'fictional-presentation-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fictional-presentation-refresh', user: {
          id: learnerId, aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid',
          app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z',
        },
      };
      else if (url.pathname === '/v1/me') response = {
        userId: learnerId, schoolId, membershipId: 'f1600000-0000-4000-8000-000000000001', role: 'student',
        entitlements: ['school.operations', 'learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'development', 'portfolio', 'community'],
        school: { id: schoolId, name: 'Illustrative Trail School' }, displayName: 'Alex',
      };
      else if (url.pathname === '/v1/diagnostics/config') response = { enabled: false };
      else if (url.pathname === '/v1/development/periods') response = { items: [{
        id: periodId, classId: 'f1700000-0000-4000-8000-000000000001', policyId,
        title: 'Autumn learning actions', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z',
      }], nextCursor: null };
      else if (url.pathname === '/v1/development/summary') response = {
        learnerId, status: 'RECORDED_ONLY', totalPoints: 0, periodId, leaderboardEnabled: false,
        streak: { status: 'UNOBSERVED', basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS', timezone: 'UTC', days: null, endingOn: null, recordedDays: null, sourceCount: null },
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }); return;
    }
    if (url.origin !== origin) { await route.abort(); return; }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill('learner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fictional-presentation-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
  await expect(page.locator('.student-home')).toBeVisible();
  return posts;
}

for (const [name, width, height, arabic] of [
  ['desktop', 1440, 900, false], ['small', 320, 700, false], ['arabic mobile', 390, 844, true],
] as const) {
  test(`${name}: current destination search preserves context, Escape, focus and workspace appearance`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const posts = await fictionalWorkspace(page);
    await page.getByRole('combobox', { name: 'Recognition period', exact: true }).selectOption(periodId);
    await expect(page.locator('.student-trail__point-total strong')).toHaveText('0');
    await page.getByRole('button', { name: 'Profile and settings', exact: true }).click();
    await page.getByRole('group', { name: 'Appearance', exact: true }).getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('.workspace')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape');
    const currentUrl = page.url(); const postCount = posts.length;
    const trigger = page.getByRole('button', { name: 'Search workspaces', exact: true });
    await trigger.click();
    const search = page.getByRole('searchbox', { name: 'Workspace name', exact: true });
    await expect(search).toBeFocused();
    await search.fill('not a current destination');
    await expect(page.locator('dialog [role="status"]')).toContainText('No workspaces match');
    // Native search input would otherwise clear its text before dialog cancel.
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(currentUrl);
    await expect(page.getByRole('combobox', { name: 'Recognition period', exact: true })).toHaveValue(periodId);
    expect(posts.length).toBe(postCount);
    await page.locator('main h1').focus(); await page.keyboard.press('Control+k');
    await expect(search).toBeFocused(); await search.fill('Learning');
    await page.locator('dialog [data-workspace-command="learning"]').click();
    await expect(page).toHaveURL(/view=learning/); await expect(page.locator('main h1')).toBeFocused();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.locator('.student-home')).toBeVisible();
    if (arabic) {
      await page.getByRole('button', { name: 'العربية', exact: true }).click();
      await page.keyboard.press('Control+k');
      await page.getByRole('searchbox', { name: 'اسم مساحة العمل', exact: true }).fill('التعلم');
      await expect(page.locator('dialog [data-workspace-command="learning"]')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    expect((await new AxeBuilder({ page }).include('.workspace').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
    await page.reload(); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel('School email', { exact: true }).fill('learner@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('fictional-presentation-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
    await expect(page.locator('.workspace')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Profile and settings', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Use device settings', exact: true }).check();
    await expect(page.locator('.workspace')).toHaveAttribute('data-theme', 'system');
  });
}
