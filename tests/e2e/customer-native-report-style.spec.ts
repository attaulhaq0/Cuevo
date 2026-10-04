import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { academicReportSchema } from '@cuevo/contracts';

type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: { actorId: string; role: string; email: string; password: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_NATIVE_REPORT_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';
const scenarios = [{ locale: 'en', width: 1366, height: 768, theme: 'light', learner: '012' }, { locale: 'ar', width: 390, height: 844, theme: 'dark', learner: '012' }, { locale: 'ar', width: 320, height: 568, theme: 'light', learner: '048' }] as const;

test.describe('isolated actual native report style and source', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and frozen report build.');
  let runtime: Runtime, buildId: string;
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored synthetic runtime required.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (buildId !== process.env.CUEVO_NATIVE_REPORT_BUILD) throw new Error('Exact frozen report build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic/provider guard failed.');
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  for (const [role, suffix] of [['teacher', '004'], ['coordinator', '002']]) for (const scenario of scenarios) test(`${role} ${scenario.locale}${scenario.width} ${scenario.theme}: actual native export keeps resolved theme offline and paper print`, async ({ browser }, info) => {
    test.setTimeout(60_000);
    const account = runtime.accounts.find(value => value.actorId.endsWith(suffix)), learner = runtime.accounts.find(value => value.role === 'student' && value.actorId.endsWith(scenario.learner));
    if (!account || account.role !== role || !learner) throw new Error('Current isolated role and learner required.');
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await context.newPage(), errors: string[] = [], warnings: string[] = [], blocked: string[] = []; page.setDefaultTimeout(5_000);
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), read = ['GET', 'OPTIONS'].includes(request.method());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !read && !auth) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    try {
      const peopleReady = page.waitForResponse(reply => [base, api].includes(new URL(reply.url()).origin) && new URL(reply.url()).pathname === '/v1/people' && reply.request().method() === 'GET', { timeout: 10_000 });
      await page.goto(`${base}/?view=progress`); await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click();
      expect((await peopleReady).status()).toBe(200);
      await expect.poll(async () => await page.locator('#learner-selection').isEnabled() || await page.locator('.progress-toolbar').getByRole('button', { name: 'Load more', exact: true }).count() > 0).toBe(true);
      for (let count = 0; count < 10 && !await page.locator('#learner-selection').isEnabled(); count++) {
        await page.locator('.progress-toolbar').getByRole('button', { name: 'Load more', exact: true }).click();
        await expect(page.locator('.progress-toolbar').getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
      }
      await expect(page.locator('#learner-selection')).toBeEnabled(); await page.locator('#learner-selection').selectOption(learner.actorId);
      const report = page.locator('#progress-reports'); await expect(report).toBeVisible();
      if (scenario.locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => new Promise<void>(resolveSettled => requestAnimationFrame(() => requestAnimationFrame(() => resolveSettled()))));
      if (await page.locator('.workspace').getAttribute('data-theme') !== scenario.theme) {
        await page.locator('.workspace-chrome__person > button').click();
        const theme = page.getByRole('group', { name: scenario.locale === 'ar' ? 'المظهر' : 'Appearance', exact: true });
        await expect(theme).toBeVisible(); await theme.getByRole('button', { name: scenario.theme === 'dark' ? scenario.locale === 'ar' ? 'داكن' : 'Dark' : scenario.locale === 'ar' ? 'فاتح' : 'Light', exact: true }).click();
        await page.keyboard.press('Escape');
      }
      await expect(page.locator('.workspace')).toHaveAttribute('data-theme', scenario.theme);
      const expectedTheme = await page.locator('.workspace').evaluate(workspace => {
        const tokens = { canvas: '--color-canvas', surface: '--color-surface', muted: '--color-surface-muted', text: '--color-text', secondary: '--color-text-secondary', border: '--color-border', primary: '--color-primary' };
        const result: Record<string, string> = { fontFamily: getComputedStyle(workspace).fontFamily };
        for (const [name, token] of Object.entries(tokens)) { const probe = document.createElement('span'); probe.style.color = `var(${token})`; probe.style.position = 'absolute'; probe.style.visibility = 'hidden'; workspace.append(probe); result[name] = getComputedStyle(probe).color; probe.remove(); }
        return result;
      });
      const sourceReply = page.waitForResponse(reply => new URL(reply.url()).pathname === `/v1/learners/${learner.actorId}/academic-report` && reply.request().method() === 'GET', { timeout: 10_000 });
      const downloaded = page.waitForEvent('download', { timeout: 10_000 });
      await report.getByRole('button', { name: scenario.locale === 'ar' ? 'تنزيل صفحة النتائج الأكاديمية الحالية' : 'Download current academic result page', exact: true }).click();
      const sourceResponse = await sourceReply; expect(sourceResponse.status()).toBe(200);
      const source = academicReportSchema.parse(await sourceResponse.json()); expect(source.learnerId).toBe(learner.actorId); expect(source.scope).toBe('CURRENT_RELEASED_PAGE'); expect(source.coverage).toBe('NOT_ESTABLISHED');
      const download = await downloaded; expect(await download.failure()).toBeNull();
      const file = info.outputPath(`${role}-${scenario.locale}-${scenario.width}.html`); await download.saveAs(file); const html = await readFile(file, 'utf8');
      expect(html).toContain("default-src 'none'"); expect(html).not.toMatch(/<script|<link|url\(|@import|#23352a|#efefe8/);
      for (const [name, value] of Object.entries(expectedTheme)) expect(html).toContain(`--document-${name}:${value}`);
      // A separate offline browser opens only the actual saved export, with no injected styles/assets.
      const exportedContext = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, offline: true, reducedMotion: 'reduce' });
      const exported = await exportedContext.newPage(), externalRequests: string[] = [];
      exported.on('request', request => { if (!request.url().startsWith('file:')) externalRequests.push(request.url()); });
      try {
        await exported.goto(pathToFileURL(file).href);
        await expect(exported.locator('html')).toHaveAttribute('lang', scenario.locale); await expect(exported.locator('html')).toHaveAttribute('dir', scenario.locale === 'ar' ? 'rtl' : 'ltr');
        await expect(exported.locator('body > header')).toContainText(source.schoolName!); await expect(exported.locator('body > header')).toContainText(source.learnerName!);
        await expect(exported.locator('main > article')).toHaveCount(source.items.length);
        for (let index = 0; index < source.items.length; index++) {
          const item = source.items[index], record = exported.locator('main > article').nth(index);
          await expect(record.locator('h2')).toHaveText(item.assessmentTitle!); await expect(record.locator('.text')).toHaveText(item.feedback);
          const visible = await record.evaluate(article => { const copy = article.cloneNode(true) as HTMLElement; copy.querySelectorAll('details').forEach(element => element.remove()); return copy.textContent ?? ''; });
          expect(visible).toContain(scenario.locale === 'ar' ? 'المشاركة المدرسية' : 'School sharing');
          expect(visible).toContain(scenario.locale === 'ar' ? 'تاريخ السجل المصدر (UTC)' : 'Source record date (UTC)');
          expect(visible).not.toContain(item.referenceVersion);
          if (item.nativeResult.type === 'numeric') { await expect(record.locator('.native')).toHaveText(`${new Intl.NumberFormat(scenario.locale).format(item.nativeResult.score)} / ${new Intl.NumberFormat(scenario.locale).format(item.nativeResult.maxScore)}`); await expect(record.locator('.native')).toHaveAttribute('dir', 'ltr'); }
          else { await expect(record.locator('dl').first().locator('dt')).toHaveText(item.nativeResult.criteria.map(criterion => criterion.criterionTitle)); await expect(record.locator('dl').first().locator('dd strong')).toHaveText(item.nativeResult.criteria.map(criterion => criterion.levelLabel)); for (const criterion of item.nativeResult.criteria) await expect(record).toContainText(criterion.levelDescription); }
          await expect(record.locator('details')).not.toHaveAttribute('open', '');
          await record.locator('summary').click(); await expect(record.locator('details')).toContainText(item.id);
          await expect(record.locator('details')).toContainText(item.referenceVersion);
          await expect(record.locator('details')).toContainText(new Intl.DateTimeFormat(scenario.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(item.createdAt)));
          await record.locator('summary').click();
        }
        const style = await exported.locator('body').evaluate(body => ({ fontFamily: getComputedStyle(body).fontFamily, color: getComputedStyle(body).color, background: getComputedStyle(body).backgroundColor }));
        expect(style).toEqual({ fontFamily: expectedTheme.fontFamily, color: expectedTheme.text, background: expectedTheme.canvas });
        expect(await exported.evaluate(() => { const clone = document.body.cloneNode(true) as HTMLElement; clone.querySelectorAll('details').forEach(element => element.remove()); return /[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i.test(clone.textContent ?? ''); })).toBe(false);
        expect(await exported.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page: exported }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        await info.attach('actual-offline-export', { body: await exported.screenshot({ fullPage: true }), contentType: 'image/png' });
        await exported.emulateMedia({ media: 'print' });
        const print = await exported.locator('body').evaluate(body => ({ color: getComputedStyle(body).color, background: getComputedStyle(body).backgroundColor })); expect(print).toEqual({ color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' });
        expect(await exported.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page: exported }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        await info.attach('actual-paper-print', { body: await exported.screenshot({ fullPage: true }), contentType: 'image/png' }); expect(externalRequests).toEqual([]);
        await info.attach('source-style-facts', { body: JSON.stringify({ buildId, role, ...scenario, nativeModels: source.items.map(item => item.nativeResult.type), count: source.items.length, scope: source.scope, coverage: source.coverage, style, print, externalRequests: externalRequests.length }), contentType: 'application/json' });
      } finally { await exportedContext.close().catch(() => undefined); }
      expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
    } finally { await context.close().catch(() => undefined); }
  });
});
