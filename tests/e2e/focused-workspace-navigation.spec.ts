import { expect, test, type Page } from '@playwright/test';
import { expectTrailWorkspace, openTrailWorkspace } from './trail-workspace';

// Intercepted presentation only: real source/API/relationship acceptance is
// verified separately. No fixture record or command reaches a remote service.
const learnerId = 'f1100000-0000-4000-8000-000000000001';
const schoolId = 'f1200000-0000-4000-8000-000000000001';
const sourceId = (index: number) => `f1300000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

async function focusedCommunity(page: Page) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const posts: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.includes('/auth/v1/') || url.pathname.startsWith('/v1/')) {
      if (request.method() === 'POST') posts.push(url.pathname);
      let response: unknown = { items: [], nextCursor: null };
      if (url.pathname.includes('/auth/v1/token')) response = {
        access_token: 'fictional-focused-nav-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fictional-focused-nav-refresh', user: { id: learnerId, aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
      };
      else if (url.pathname === '/v1/me') response = {
        userId: learnerId, schoolId, membershipId: 'f1600000-0000-4000-8000-000000000001', role: 'student',
        entitlements: ['school.operations', 'learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'development', 'portfolio', 'community'],
        school: { id: schoolId, name: 'مدرسة التعلم الحديثة للبنات والبنين للتعليم العام والمراحل الابتدائية والمتوسطة والثانوية' }, displayName: 'عبد الرحمن محمد أحمد عبد العزيز',
      };
      else if (url.pathname === '/v1/diagnostics/config') response = { enabled: false };
      else if (url.pathname === '/v1/community/rooms') response = { items: Array.from({ length: 30 }, (_, index) => ({ id: sourceId(index), classId: sourceId(99), ownerId: sourceId(98), name: `Current class discussion ${index + 1}`, type: 'CLASS', status: 'ACTIVE', canModerate: false, canPost: false, privateTopic: `cuevo:${schoolId}:room:${sourceId(index)}` })), nextCursor: null };
      else if (url.pathname === '/v1/community/announcements') response = { items: Array.from({ length: 30 }, (_, index) => ({ id: sourceId(index + 40), classId: null, title: `Current announcement ${index + 1}`, body: 'Current authorized announcement context. '.repeat(8), parentVisible: false, createdAt: '2026-10-01T00:00:00Z', readAt: null, canManage: false })), nextCursor: null };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }); return;
    }
    if (url.origin !== origin) { await route.abort(); return; }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill('learner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fictional-presentation-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectTrailWorkspace(page, 'student');
  await openTrailWorkspace(page, 'Community');
  await expectTrailWorkspace(page, 'student');
  await expect(page.locator('.workspace-chrome')).toHaveAttribute('data-navigation-mode', 'focused');
  await expect(page.locator('.community-room')).toHaveCount(30);
  await expect(page.getByRole('heading', { name: 'Current class discussion 1', exact: true })).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.locator('[data-workspace-section="rooms"]')).toHaveAttribute('aria-pressed', 'true');
  return posts;
}

test('focused section activation reveals current work while same section preserves reading position', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const posts = await focusedCommunity(page), count = posts.length;
  const main = page.locator('.workspace-main');
  await main.evaluate(element => { element.scrollTop = 650; });
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(650);
  await page.locator('[data-workspace-section="rooms"]').click();
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(650);
  await page.locator('[data-workspace-sections]').getByRole('button', { name: 'Refresh community', exact: true }).click();
  await expect(page.locator('.community-room')).toHaveCount(30);
  await main.evaluate(element => { element.scrollTop = 650; });
  await page.locator('[data-workspace-section="announcements"]').click();
  await expect(page.locator('.community-post')).toHaveCount(30);
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(0);
  await expect(page.locator('main h1')).toBeFocused();
  expect(posts.length).toBe(count);
  expect(errors).toEqual([]);
});

test('focused chooser follows reflow and scroll with reachable Arabic context in a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await focusedCommunity(page);
  const trigger = page.locator('.workspace-chrome__workspace-choice'), chooser = page.locator('.workspace-chrome__switcher');
  await trigger.click(); await expect(chooser).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chooser).toBeHidden(); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(chooser).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(chooser).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await page.setViewportSize({ width: 820, height: 500 });
  await expect(page.locator('main h1')).toBeVisible();
  expect(await page.locator('main h1').evaluate(element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; })).toBe(true);
  expect(await page.locator('.workspace-chrome__header').evaluate(element => Array.from(element.children).every(child => { const rect = child.getBoundingClientRect(); return rect.left >= -1 && rect.right <= innerWidth + 1; }))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('narrow focused sections keep the whole selected label reachable beside workspace actions', async ({ page }) => {
  await focusedCommunity(page);
  await page.locator('[data-workspace-section="announcements"]').click();
  await expect(page.locator('.community-post')).toHaveCount(30);
  for (const locale of ['en', 'ar']) {
    await page.getByRole('button', { name: locale === 'en' ? 'English' : 'العربية', exact: true }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const selected = page.locator('[data-workspace-sections] button[aria-pressed="true"]');
      await expect.poll(() => selected.evaluate(element => {
        const item = element.getBoundingClientRect(), rail = element.parentElement!.getBoundingClientRect();
        return item.left >= rail.left - 1 && item.right <= rail.right + 1 && item.height >= 44;
      })).toBe(true);
      const refresh = page.locator('[data-workspace-sections] .cuevo-workspace-section-actions button');
      expect(await refresh.evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44; })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await selected.focus(); await expect(selected).toBeFocused();
    }
  }
});

test('focused content uses one current heading and the long workspace is keyboard scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await focusedCommunity(page);
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('main .workspace-intro')).toHaveCount(0);
  const main = page.locator('.workspace-main');
  await expect(main).toHaveAttribute('tabindex', '0');
  await main.focus(); await page.keyboard.press('PageDown');
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('[data-workspace-sections]')).toBeVisible();
});
