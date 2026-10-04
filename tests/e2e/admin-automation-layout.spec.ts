import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { schoolAutomationSchema } from '@cuevo/contracts';

type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: { actorId: string; role: string; email: string; password: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_ADMIN_AUTOMATION_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';
const cases = [{ locale: 'en', width: 1366, height: 768 }, { locale: 'ar', width: 390, height: 844 }, { locale: 'ar', width: 320, height: 568 }] as const;

// Execute with the ignored isolated no-webServer config. Root owns the frozen services.
test.describe('isolated current Admin Automation reading', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and exact frozen build.');
  let runtime: Runtime, buildId: string;
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored synthetic runtime required.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (buildId !== process.env.CUEVO_ADMIN_AUTOMATION_BUILD) throw new Error('Exact frozen build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic/provider guard failed.');
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  for (const viewport of cases) test(`${viewport.locale} ${viewport.width}: selected current policy, bounded receipts and existing controls`, async ({ page }, info) => {
    test.setTimeout(45_000); await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const account = runtime.accounts.find(value => value.actorId.endsWith('001'));
    if (!account || account.role !== 'admin') throw new Error('Current isolated Administrator required.');
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
    await expect(page.locator('.school-workspace')).toBeVisible();
    const ready = page.waitForResponse(reply => [base, api].includes(new URL(reply.url()).origin) && new URL(reply.url()).pathname === '/v1/school/automation' && reply.request().method() === 'GET', { timeout: 10_000 });
    await page.locator('.school-workspace > .learning-toolbar').getByRole('button', { name: 'Automation review', exact: true }).click();
    const response = await ready; expect(response.status()).toBe(200); const source = schoolAutomationSchema.parse(await response.json());
    await expect(page.locator('.school-automation-policy')).toHaveCount(1);
    if (viewport.locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
    const selector = page.locator('#school-automation-policy'), selected = page.locator('.school-automation-policy');
    await expect(selector.locator('option')).toHaveCount(source.policies.length); await expect(selector).toHaveValue('LEARNER_STATE');
    const titles: string[] = [];
    for (const policy of source.policies) {
      await selector.selectOption(policy.id); await expect(selector).toHaveValue(policy.id); await expect(selected).toHaveCount(1);
      const label = await selector.locator('option:checked').innerText(); await expect(selected.locator('h3')).toHaveText(label); titles.push(label);
      await expect(selected.locator('.school-automation-rule dd')).toHaveCount(4);
      const values = selected.locator('.school-automation-policy__facts dd');
      await expect(values.nth(0)).toHaveText(policy.version === null ? viewport.locale === 'en' ? 'Unknown' : 'غير معروف' : new Intl.NumberFormat(viewport.locale).format(policy.version));
      await expect(values.nth(1)).toHaveText(policy.approvedBy ?? (viewport.locale === 'en' ? 'Unknown' : 'غير معروف'));
    }
    expect(new Set(titles).size).toBe(5); await selector.selectOption('LEARNER_STATE');
    const disclosure = page.locator('.school-automation-runs'), summary = disclosure.locator(':scope > summary'), runs = page.locator('.school-automation-runs__items > article');
    await expect(disclosure).not.toHaveAttribute('open', ''); await expect(runs).toHaveCount(source.execution.runs.length);
    await summary.focus(); await summary.press('Enter'); await expect(disclosure).toHaveAttribute('open', '');
    const runSummary = runs.locator('details > summary');
    // Native Tab order reaches every current record's provenance without an extra action owner.
    for (let index = 0; index < source.execution.runs.length; index++) { await page.keyboard.press('Tab'); await expect(runSummary.nth(index)).toBeFocused(); }
    if (source.execution.runs.length) {
      await page.keyboard.press('Enter'); const last = runs.last(); await expect(last.locator('details')).toHaveAttribute('open', '');
      await expect(last.locator('details')).toContainText(source.execution.runs.at(-1)!.id); await expect(last).toBeVisible();
    }
    const runGeometry = await page.locator('.school-automation-runs__items').evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
    expect(runGeometry.client).toBeLessThanOrEqual(viewport.width < 768 ? 352 : 448);
    await summary.click(); await page.evaluate(() => window.scrollTo(0, 0));
    const geometry = await selector.evaluate(element => { const rect = element.getBoundingClientRect(), nav = document.querySelector('.workspace-chrome__navigation')!.getBoundingClientRect(); return { selectorTop: rect.top, selectorBottom: rect.bottom, navigationTop: nav.top, docHeight: document.documentElement.scrollHeight }; });
    if (viewport.width === 320) expect(geometry.selectorBottom, 'Current policy selector must fit above the fixed mobile navigation').toBeLessThanOrEqual(geometry.navigationTop);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await info.attach('current-automation-reading', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await info.attach('current-reading-geometry', { body: JSON.stringify({ buildId, ...viewport, geometry, runGeometry, nativeRuns: source.execution.runs.length }), contentType: 'application/json' });
    for (const [id, destination] of [['LEARNER_STATE', 'school'], ['ATTENTION', 'progress'], ['RECOGNITION', 'development'], ['COMMUNICATION', 'community'], ['INTELLIGENCE', 'improvement']]) {
      await selector.selectOption(id); await selected.getByRole('button', { name: viewport.locale === 'en' ? 'Review existing policy controls' : 'مراجعة أدوات السياسة الحالية', exact: true }).click();
      if (destination === 'school') await expect(page.locator('.school-workspace .school-section h2').first()).toHaveText(viewport.locale === 'en' ? 'Policies' : 'السياسات');
      else await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe(destination);
      await page.getByRole('navigation').getByRole('button', { name: viewport.locale === 'en' ? 'School' : 'المدرسة', exact: true }).click();
      await page.locator('.school-workspace > .learning-toolbar').getByRole('button', { name: viewport.locale === 'en' ? 'Automation review' : 'مراجعة الأتمتة', exact: true }).click();
      await expect(selector).toBeVisible();
    }
    expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
  });
});
