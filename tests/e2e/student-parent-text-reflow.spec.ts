import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: { actorId: string; role: string; email: string; password: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_TEXT_REFLOW_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';
const cases = [{ role: 'student', suffix: '012', view: 'progress', width: 390 }, { role: 'student', suffix: '012', view: 'progress', width: 320 }, { role: 'student', suffix: '012', view: 'school', width: 320 }, { role: 'student', suffix: '012', view: 'learning', width: 320 }, { role: 'parent', suffix: '072', view: 'school', width: 320 }] as const;

test.describe('isolated actual Student/Parent narrow text reflow', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and frozen build.');
  let runtime: Runtime, buildId: string;
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored synthetic runtime required.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim(); if (buildId !== process.env.CUEVO_TEXT_REFLOW_BUILD) throw new Error('Exact frozen build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic/provider guard failed.');
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  for (const scenario of cases) test(`${scenario.role} ${scenario.view} Arabic${scenario.width}: 200% text and current controls fit`, async ({ page }, info) => {
    expect(info.config.webServer, 'The isolated test must not start another runtime').toBeNull();
    test.setTimeout(30_000); await page.setViewportSize({ width: scenario.width, height: 844 });
    const account = runtime.accounts.find(value => value.actorId.endsWith(scenario.suffix)); if (!account || account.role !== scenario.role) throw new Error('Current isolated role required.');
    const errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), read = ['GET', 'OPTIONS'].includes(request.method());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !read && !auth) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/?view=${scenario.view}`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click();
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|Checking)/ })).toHaveCount(0);
    if (scenario.role === 'parent') { const child = page.locator('.home-context-section select').first(); await expect(child).toBeVisible(); await child.selectOption(runtime.accounts.find(value => value.actorId.endsWith('012'))!.actorId); }
    if (scenario.view === 'learning') {
      await page.locator('.learning-workspace > .learning-toolbar').getByRole('button', { name: 'Assessments', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Open task', exact: true }).first()).toBeVisible(); await page.getByRole('button', { name: 'Open task', exact: true }).first().click();
      await expect(page.locator('.assessment-task-layout')).toBeVisible();
    }
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|Checking|جارٍ تحميل|جارٍ التحقق)/ })).toHaveCount(0);
    if (scenario.view === 'learning') {
      const title = await page.getByRole('main').getByRole('heading', { level: 1 }).evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth })); expect(title.scroll).toBeLessThanOrEqual(title.client + 2);
    }
    const date = scenario.role === 'student' && scenario.view === 'school' ? page.locator('.school-day-filter input[type="date"]') : null;
    const dateValue = date ? await date.inputValue() : null;
    // Text-only enlargement leaves viewport/spacing intact, distinct from native browser zoom.
    await page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>('.workspace *')], sizes = nodes.map(element => parseFloat(getComputedStyle(element).fontSize));
      nodes.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 2}px`; });
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const rootSelector = scenario.view === 'progress' ? '.progress-intro__actions' : scenario.view === 'school' ? '.school-workspace > .learning-toolbar,.school-day-filter' : '.assessment-metadata';
    const overflow = await page.locator(rootSelector).evaluateAll(elements => elements.filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2).map(element => ({ class: element.className, width: element.clientWidth, scroll: element.scrollWidth })));
    expect(overflow).toEqual([]);
    const target = date ?? page.locator(scenario.view === 'progress' ? '.progress-intro__actions button' : scenario.role === 'parent' ? '.school-workspace > .learning-toolbar > button' : '.assessment-section--open button').first();
    await target.focus(); await target.scrollIntoViewIfNeeded(); await expect(target).toBeFocused();
    expect(await target.evaluate(element => { const bounds = element.getBoundingClientRect(), hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2); return hit === element || element.contains(hit); })).toBe(true);
    if (date) { await expect(date).toHaveValue(dateValue!); const bounds = await date.boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(scenario.width - 32); }
    await info.attach('current-text-reflow', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await info.attach('scope', { body: JSON.stringify({ buildId, ...scenario, method: '200% text-only enlargement', currentDatePreserved: dateValue !== null, noPageOverflow: true }), contentType: 'application/json' });
    expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
  });
});
