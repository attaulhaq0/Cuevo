import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('administrator explicitly approves reservation limits and reopens their current values', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const admin = accounts.find(account => account.role === 'admin')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(admin.email); await page.getByLabel('Password', { exact: true }).fill(admin.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Next steps', exact: true }).click(); await page.getByRole('button', { name: 'Budget limits', exact: true }).click();
  const form = page.getByRole('region', { name: 'Approve budget limits', exact: true });
  await form.getByLabel('School daily limit (USD)', { exact: true }).fill('10'); await form.getByLabel('Per-user daily limit (USD)', { exact: true }).fill('2'); await form.getByLabel('Maximum concurrent analyses', { exact: true }).fill('2'); await form.getByLabel('Approval reason', { exact: true }).fill('Synthetic reservation policy review; no live model request.');
  await expect(form.getByLabel('I approve these reservation limits', { exact: true })).not.toBeChecked(); await form.getByLabel('I approve these reservation limits', { exact: true }).check();
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/intelligence/budget' && response.request().method() === 'POST'); await form.getByRole('button', { name: 'Save', exact: true }).click(); expect((await saved).status()).toBe(200);
  await expect(form.getByLabel('School daily limit (USD)', { exact: true })).toHaveValue('10');
  await expect(form.getByLabel('I approve these reservation limits', { exact: true })).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.getByRole('region', { name: 'حدود ميزانية التحليل', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});
