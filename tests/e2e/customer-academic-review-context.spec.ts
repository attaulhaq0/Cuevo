import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

type Account = { role: string; email: string; password: string };
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceDirectory = resolve('.local/customer-readiness/academic-review', runId);

async function signIn(page: Page, role: string) {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const account = accounts.find(row => row.role === role);
  if (!account) throw Error('A provisioned synthetic account is required.');
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Academic', exact: true }).click();
}

async function capture(page: Page, name: string) {
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: resolve(evidenceDirectory, name), fullPage: false });
}

for (const failure of [{ path: 'courses', status: 503 }, { path: 'assessments', status: 503 }, { path: 'assessments', status: 403 }]) {
 test(`rubric ${failure.path} ${failure.status} replaces loading with one error and refresh recovers`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await signIn(page, 'teacher');
  await page.route(`**/v1/${failure.path}?limit=100`, route => route.fulfill({
    status: failure.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ code: failure.status === 403 ? 'FORBIDDEN' : 'REQUEST_UNAVAILABLE', requestId: 'academic-review-unavailable' }),
  }));
  const failedRead = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/${failure.path}` && response.status() === failure.status);
  await page.getByRole('button', { name: 'Rubrics', exact: true }).click();
  await failedRead;
  const workspace = page.locator('.academic-workspace');
  await expect(workspace.getByRole('alert')).toBeVisible();
  await capture(page, `01-rubric-${failure.path}-${failure.status}-failure.png`);
  await expect(workspace.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
  await expect(workspace.getByRole('alert')).toHaveCount(1);
  await page.unroute(`**/v1/${failure.path}?limit=100`);
  await page.getByRole('button', { name: 'Refresh academic records', exact: true }).click();
  await expect(workspace.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
  await expect(workspace.getByRole('alert')).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: 'Create school rubric', exact: true })).toBeVisible();
  await capture(page, `02-rubric-${failure.path}-${failure.status}-recovered.png`);
  expect(errors).toEqual([]);
 });
}

test('coordinator reads the exact saved objective description before approving through the screen', async ({ page }) => {
  test.setTimeout(60000);
  const title = `School-authored explanation goal · ${new Date().toISOString()}`;
  const description = 'Synthetic school goal: explain one checking step and describe the evidence used. هدف مدرسي تجريبي: شرح خطوة التحقق والدليل المستخدم.';
  await signIn(page, 'teacher');
  await page.getByRole('button', { name: 'Objectives', exact: true }).click();
  await page.getByRole('button', { name: 'Create school objective', exact: true }).click();
  const form = page.getByRole('region', { name: 'Create school objective', exact: true });
  await form.getByLabel('Title', { exact: true }).fill(title);
  await form.getByLabel('Version', { exact: true }).fill('school-review-v1');
  await form.getByLabel('Description', { exact: true }).fill(description);
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/academic-references' && response.request().method() === 'POST');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  const creation = await created;
  expect(creation.status()).toBe(200);
  const receipt = await creation.json();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'coordinator');
  await page.getByRole('button', { name: 'Objectives', exact: true }).click();
  const row = page.locator('.academic-reference-list .academic-row').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  for (let count = 0; count < 30 && !await row.count(); count++) {
    await expect(page.locator('.academic-workspace').getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
    const more = page.locator('.academic-workspace').getByRole('button', { name: 'Load more', exact: true });
    if (!await more.count()) break;
    await more.click();
    await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await capture(page, '03-objective-before-approval.png');
  await expect(row.getByText(description, { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Approve objective', exact: true }).click();
  const approval = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/academic-references/${receipt.id}/approve` && response.request().method() === 'POST');
  await row.getByRole('region', { name: 'Approve objective', exact: true }).getByRole('button', { name: 'Approve objective', exact: true }).click();
  expect((await approval).status()).toBe(200);
  await expect(row).toContainText('Approved');
  await expect(row.getByText(description, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(row.getByText(description, { exact: true })).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await capture(page, '04-objective-approved-arabic-mobile.png');
});
