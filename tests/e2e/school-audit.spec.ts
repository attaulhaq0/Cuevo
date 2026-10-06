import { expectTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('administrator reviews school audit without private payloads', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const admin = accounts.find(account => account.role === 'admin')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email', { exact: true }).fill(admin.email); await page.getByLabel('Password', { exact: true }).fill(admin.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page); await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'School', exact: true }).click();
  await page.getByRole('button', { name: 'School audit', exact: true }).click(); const audit = page.getByRole('region', { name: 'School audit', exact: true }); await expect(audit.locator('article').first()).toBeVisible();
  await expect(audit).not.toContainText('RAW PRIVATE NOTE'); await audit.locator('article').first().locator('summary').click(); await expect(audit.locator('article').first().locator('details')).toHaveAttribute('open', '');
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.getByRole('region', { name: 'سجل تدقيق المدرسة', exact: true })).toBeVisible();
});
