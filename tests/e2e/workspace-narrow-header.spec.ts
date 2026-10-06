import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: { actorId: string; role: string; email: string; password: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_NARROW_HEADER_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

test.describe('isolated current narrow role header', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and exact frozen build.');
  let runtime: Runtime, buildId: string;
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored synthetic runtime required.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (buildId !== process.env.CUEVO_NARROW_HEADER_BUILD) throw new Error('Exact frozen build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic/provider guard failed.');
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  for (const [role, suffix] of [['student', '012'], ['teacher', '004'], ['coordinator', '002'], ['parent', '072'], ['admin', '001']]) test(`${role}: Arabic320 Search and Profile remain reachable without page overflow`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const account = runtime.accounts.find(value => value.actorId.endsWith(suffix));
    if (!account || account.role !== role) throw new Error('Current isolated role required.');
    const errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), read = ['GET', 'OPTIONS'].includes(request.method());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !read && !auth) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/?view=school`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click();
    await expect(page.locator('.school-workspace')).toBeVisible(); await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const search = page.getByRole('button', { name: 'البحث عن مساحات العمل', exact: true }); await expect(search).toBeVisible();
    await search.focus(); await search.press('Enter'); await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('dialog[open]')).toHaveCount(0);
    const profile = page.locator('.workspace-chrome__person > button'); await profile.focus(); await profile.press('Enter');
    await expect(page.locator('.workspace-chrome__profile')).toBeVisible(); await expect(page.locator('.workspace-chrome__signout')).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolveSettled => requestAnimationFrame(() => requestAnimationFrame(() => resolveSettled()))));
    await expect(page.locator('.workspace-chrome__profile')).toBeVisible(); await expect(page.locator('.workspace-chrome__signout')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (role === 'teacher' || role === 'coordinator') {
      await page.keyboard.press('Escape');
      const classChoice = page.locator('#daily-class-filter'), date = page.locator('.school-day-filter input[type="date"]');
      await expect(classChoice).toBeVisible(); await expect(date).toBeVisible();
      await expect(classChoice.locator('option')).not.toHaveCount(0); await expect(date).not.toHaveValue('');
      await classChoice.focus(); await expect(classChoice).toBeFocused(); await date.focus(); await expect(date).toBeFocused();
      const dateGeometry = await date.boundingBox(); expect(dateGeometry!.width).toBeLessThanOrEqual(288);
    }
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await info.attach(`${role}-Arabic320`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
    expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
  });
});
