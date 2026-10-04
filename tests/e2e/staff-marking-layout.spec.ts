import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Level = { key: string; label: string; description: string };
type Criterion = { key: string; title: string; levels: Level[] };
type NativeCriterion = { criterionKey: string; criterionTitle: string; levelKey: string; levelLabel: string; levelDescription: string };
type MarkingItem = {
  id: string; assessmentId: string; assessmentTitle: string; learnerName: string; content: string;
  referenceId: string | null; model: 'numeric' | 'rubric'; maxScore?: number; responseKind: string; submissionStatus: string;
  rubric: { title: string; criteria: Criterion[] } | null;
  currentResult: { model: 'numeric' | 'rubric'; score?: number; maxScore?: number; feedback: string; nativeResult?: { criteria: NativeCriterion[] } } | null;
};

const root = resolve(import.meta.dirname, '../..');
const runtimePath = process.env.CUEVO_STAFF_MARKING_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';
const viewports = [
  { locale: 'en', width: 1366, height: 768 },
  { locale: 'ar', width: 768, height: 1024 },
  { locale: 'ar', width: 390, height: 844 },
  { locale: 'ar', width: 320, height: 568 },
] as const;

// Run with an explicit no-webServer isolated config, never the ordinary local launcher.
// Browser plugin is unavailable; repository Playwright exercises real native details semantics.
test.describe('isolated current Teacher marking layout', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and exact frozen web build.');
  let runtime: Runtime, teacher: Account, buildId: string;

  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Only the dedicated ignored isolated runtime is permitted.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (!process.env.CUEVO_STAFF_MARKING_BUILD || process.env.CUEVO_STAFF_MARKING_BUILD !== buildId) throw new Error('Freeze the exact isolated web build before marking verification.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), database = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || database.hostname !== '127.0.0.1' || database.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic runtime/provider guard failed.');
    const account = runtime.accounts.find(value => value.actorId.endsWith('004'));
    if (!account || account.role !== 'teacher' || !account.schoolId) throw new Error('Current isolated Teacher identity is unavailable.');
    teacher = account;
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  async function login(page: Page, locale: 'en' | 'ar') {
    const current = page.waitForResponse(response => {
      const url = new URL(response.url());
      return [base, api].includes(url.origin) && url.pathname === '/v1/marking' && url.searchParams.get('limit') === '100' && response.request().method() === 'GET';
    }, { timeout: 10_000 });
    await page.goto(`${base}/?view=academic`);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(teacher.email); await page.locator('#password').fill(teacher.password);
    await page.locator('.auth-submit').click();
    const response = await current;
    expect(response.status()).toBe(200);
    const records = await response.json() as { items: MarkingItem[]; nextCursor: string | null };
    expect(records.items.length).toBeGreaterThan(1);
    await expect(page.locator('.marking-queue__item')).toHaveCount(records.items.length);
    if (locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('.academic-workspace')).toBeVisible();
    return records.items;
  }

  async function choose(page: Page, index: number, mobile: boolean, selected: boolean) {
    const disclosure = page.locator('.marking-queue__disclosure');
    if (mobile && selected) {
      await expect(disclosure).not.toHaveAttribute('open', '');
      const summary = disclosure.locator('summary'); await summary.focus(); await summary.press('Enter');
      await expect(disclosure).toHaveAttribute('open', '');
    }
    const choice = page.locator('.marking-queue__item').nth(index);
    await expect(choice).toBeVisible(); await choice.focus(); await choice.press('Enter');
    if (mobile) {
      await expect(disclosure).not.toHaveAttribute('open', '');
      await expect(choice).toBeHidden();
    } else {
      await expect(disclosure).toHaveAttribute('open', '');
      // Native closed details hides descendants even when CSS displays their container.
      // The original failing implementation retained their DOM count, so count alone is insufficient.
      for (const item of await page.locator('.marking-queue__item').all()) await expect(item).toBeVisible();
    }
  }

  async function source(page: Page, item: MarkingItem, focus = true) {
    const detail = page.locator('.marking-detail'), heading = detail.locator('.marking-detail__heading h2');
    await expect(detail).toHaveCount(1); await expect(heading).toHaveText(item.assessmentTitle);
    await expect(detail.locator('.academic-learner')).toHaveText(item.learnerName);
    await expect(detail.locator('.marking-original-work .lesson-content')).toHaveText(item.content);
    await expect(detail.locator('.marking-workbench__source')).toBeVisible();
    if (focus) await expect(heading).toBeFocused();
    await expect(detail.getByRole('status').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0);
    return detail;
  }

  async function openCorrection(detail: Locator, locale: 'en' | 'ar') {
    await detail.getByRole('button', { name: locale === 'ar' ? 'إنشاء مسودة تصحيح معدّلة' : 'Create correction draft', exact: true }).click();
    return detail.locator('.learning-form');
  }

  for (const viewport of viewports) test(`${viewport.locale} ${viewport.width}: native choices, source focus and native drafts survive reselection`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const mobile = viewport.width < 768, errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), read = ['GET', 'OPTIONS'].includes(request.method());
      const authLogin = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !read && !authLogin) {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort();
      }
      return route.continue();
    });
    try {
      const items = await login(page, viewport.locale);
      const editable = (item: MarkingItem) => item.responseKind === 'TEXT' && ['SUBMITTED', 'RESUBMITTED'].includes(item.submissionStatus) && !!item.referenceId;
      const numericIndex = items.findIndex(item => editable(item) && item.model === 'numeric' && !item.currentResult);
      const recordedIndex = items.findIndex(item => editable(item) && item.model === 'numeric' && item.currentResult?.model === 'numeric');
      const rubricIndex = items.findIndex(item => editable(item) && item.model === 'rubric' && item.currentResult?.model === 'rubric');
      expect(numericIndex, 'Existing unmarked native numeric source required').toBeGreaterThanOrEqual(0);
      expect(recordedIndex, 'Existing recorded native numeric source required').toBeGreaterThanOrEqual(0);
      expect(rubricIndex, 'Existing recorded native rubric source required').toBeGreaterThanOrEqual(0);
      await expect(page.locator('.marking-queue__disclosure')).toHaveAttribute('open', '');
      for (const item of await page.locator('.marking-queue__item').all()) await expect(item).toBeVisible();

      await choose(page, numericIndex, mobile, false);
      let detail = await source(page, items[numericIndex]);
      const score = detail.locator('input[name="score"]');
      await expect(score).toHaveValue(''); await expect(score).toHaveAttribute('min', '0');
      await expect(score).toHaveAttribute('max', String(items[numericIndex].maxScore));
      await expect(score).toHaveAttribute('step', 'any'); await expect(score).toHaveCount(1);
      await score.fill('0'); await detail.locator('textarea[name="feedback"]').fill('Local unsaved layout check.');
      await choose(page, numericIndex, mobile, true);
      await expect(score).toHaveValue('0'); await expect(detail.locator('textarea[name="feedback"]')).toHaveValue('Local unsaved layout check.');

      await choose(page, recordedIndex, mobile, true);
      detail = await source(page, items[recordedIndex]);
      const recorded = items[recordedIndex].currentResult!;
      await expect(detail.locator('.native-score strong')).toHaveText(new Intl.NumberFormat(viewport.locale).format(recorded.score!));
      await expect(detail.locator('.native-score span')).toHaveText(`/ ${new Intl.NumberFormat(viewport.locale).format(recorded.maxScore!)}`);
      let form = await openCorrection(detail, viewport.locale);
      await expect(form.locator('input[name="score"]')).toHaveValue(String(recorded.score));
      await expect(form.locator('textarea[name="feedback"]')).toHaveValue(recorded.feedback);

      await choose(page, rubricIndex, mobile, true);
      detail = await source(page, items[rubricIndex]);
      const rubric = items[rubricIndex].rubric!, native = items[rubricIndex].currentResult!.nativeResult!;
      await expect(detail.locator('input[name="score"], .native-score')).toHaveCount(0);
      await expect(detail.locator('.marking-rubric-source h4')).toHaveText(rubric.criteria.map(criterion => criterion.title));
      for (const criterion of rubric.criteria) {
        const section = detail.locator('.marking-rubric-source section').filter({ has: page.getByRole('heading', { name: criterion.title, exact: true }) });
        await expect(section.locator('dt')).toHaveText(criterion.levels.map(level => level.label));
        await expect(section.locator('dd')).toHaveText(criterion.levels.map(level => level.description));
      }
      await expect(detail.locator('.rubric-result-criteria dt')).toHaveText(native.criteria.map(criterion => criterion.criterionTitle));
      await expect(detail.locator('.rubric-result-criteria dd strong')).toHaveText(native.criteria.map(criterion => criterion.levelLabel));
      form = await openCorrection(detail, viewport.locale);
      await expect(form.locator('select[name^="criterion:"]')).toHaveCount(rubric.criteria.length);
      for (const criterion of rubric.criteria) {
        const field = form.locator(`select[name="criterion:${criterion.key}"]`);
        const current = native.criteria.find(choice => choice.criterionKey === criterion.key)!;
        await expect(field).toHaveValue(current.levelKey);
        await expect(field.locator('option[value]:not([value=""])')).toHaveText(criterion.levels.map(level => `${level.label} — ${level.description}`));
        expect(await field.locator('option[value]:not([value=""])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(criterion.levels.map(level => level.key));
      }
      await choose(page, rubricIndex, mobile, true);
      for (const criterion of native.criteria) await expect(form.locator(`select[name="criterion:${criterion.criterionKey}"]`)).toHaveValue(criterion.levelKey);

      // A newer intentional focus change must win over the preceding source-selection intent.
      // The source heading mounts from the queue immediately; delaying its objective read would not exercise this guard.
      if (mobile) { const summary = page.locator('.marking-queue__disclosure > summary'); await summary.focus(); await summary.press('Space'); }
      const refresh = page.locator('.academic-workspace > .learning-toolbar').getByRole('button', { name: viewport.locale === 'ar' ? 'تحديث السجلات الأكاديمية' : 'Refresh academic records', exact: true });
      await page.locator('.marking-queue__item').nth(recordedIndex).evaluate(button => {
        button.addEventListener('click', () => (document.querySelector('.academic-workspace > .learning-toolbar > button') as HTMLElement | null)?.focus(), { capture: true, once: true });
      });
      const next = page.locator('.marking-queue__item').nth(recordedIndex); await next.focus(); await next.press('Enter');
      await source(page, items[recordedIndex], false); await expect(refresh).toBeFocused();
      const refreshed = page.waitForResponse(response => {
        const url = new URL(response.url());
        return [base, api].includes(url.origin) && url.pathname === '/v1/marking' && url.searchParams.get('limit') === '100' && response.request().method() === 'GET';
      }, { timeout: 10_000 });
      await refresh.press('Enter'); expect((await refreshed).status()).toBe(200);
      await source(page, items[recordedIndex], false); await expect(refresh).toBeFocused();
      await expect(page.locator('.marking-queue__item')).toHaveCount(items.length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await info.attach('current-marking-layout', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    } finally {
      expect(blocked, 'No academic mutation or external provider request is permitted').toEqual([]);
      expect(errors).toEqual([]); expect(warnings).toEqual([]);
    }
  });
});
