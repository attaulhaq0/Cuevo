import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
type Account = { role: string; email: string; password: string };
test('admin records source-limited curriculum metadata without activating official support', async ({ page }) => {
  page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[]; const admin = accounts.find(row => row.role === 'admin')!; await page.goto('/'); await page.getByLabel('School email').fill(admin.email); await page.getByLabel('Password', { exact: true }).fill(admin.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: 'Curriculum context', exact: true }).click(); await page.getByRole('button', { name: 'Record source context', exact: true }).click(); const form = page.getByRole('region', { name: 'Record source context', exact: true }); const title = `Unknown source ${randomUUID().slice(0, 6)}`; const programme = `Source-limited programme ${title}`; await form.getByLabel('Source collection reference').fill(title); await form.getByLabel('Context axis').selectOption('curriculum'); await form.getByLabel('Framework', { exact: true }).fill('Repository structural context'); await form.getByLabel('Programme', { exact: true }).fill(programme); await form.getByLabel('Version', { exact: true }).fill('unreviewed-v1'); await form.getByLabel('Scope', { exact: true }).fill('Synthetic technical metadata only'); await form.getByLabel('Source status').selectOption('UNKNOWN'); await form.getByLabel('Rights status').selectOption('UNKNOWN'); await form.getByLabel('Local source location / provenance').fill('docs/product/curriculum'); await form.getByLabel('Context limitations / reason').fill('No approved official snapshot or rights supplied.');
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/curriculum/versions' && response.request().method() === 'POST');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(form).toHaveCount(0);
  const record = page.getByRole('article').filter({ has: page.getByRole('heading', { name: `Repository structural context · ${programme}`, exact: true }) });
  await expect(record.getByText('No approved official snapshot or rights supplied.', { exact: true })).toBeVisible();
  await expect(page.getByText('CUSTOMER_READY', { exact: true })).toHaveCount(0);
});
