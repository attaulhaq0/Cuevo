import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function messages(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
  return { errors, warnings };
}

for (const locale of ['en', 'ar']) {
  test(`extension-free ${locale} initial document hydrates without console mismatches`, async ({ page, context }) => {
    const observed = messages(page);
    await context.addCookies([{ name: 'cuevo_locale', value: locale, domain: 'localhost', path: '/' }]);
    await page.goto('/');
    await expect(page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الدخول' : 'Sign in', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.getByRole('button', { name: locale === 'ar' ? 'English' : 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale === 'ar' ? 'en' : 'ar');
    expect(observed.errors).toEqual([]); expect(observed.warnings).toEqual([]);
  });
}

test('a pre-hydration extension body attribute remains a detectable DOM discrepancy', async ({ page }) => {
  const observed = messages(page);
  // Inject only the reported extension attribute into the incoming HTML. This is a
  // controlled compatibility diagnostic; it never changes application source.
  await page.route('http://localhost:3000/', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<body>', '<body cz-shortcut-listen="true">');
    await route.fulfill({ response, body: html });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('cz-shortcut-listen', 'true');
  const hydration = [...observed.errors, ...observed.warnings].filter(message => /hydration|hydrated|server rendered|418|attributes.*match/i.test(message));
  // React production may omit recoverable attribute warnings; the byte discrepancy
  // itself must remain visible and must never be masked by a body suppression flag.
  const upstream = await page.request.get('/'); expect(await upstream.text()).not.toContain('cz-shortcut-listen');
  const directory = resolve('.local/customer-readiness/hydration'); await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${test.info().project.name}-extension-diagnostic.json`), JSON.stringify({ upstreamContainsExtensionAttribute: false, hydratedBodyContainsExtensionAttribute: true, hydrationConsoleMessages: hydration, otherConsoleErrorCount: observed.errors.length - hydration.length, warningCount: observed.warnings.length }, null, 2));
  expect(observed.errors.filter(message => !/hydration|hydrated|server rendered|418|attributes.*match/i.test(message))).toEqual([]);
});
