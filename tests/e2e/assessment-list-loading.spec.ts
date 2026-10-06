import { expectTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('published assessment list loads one explicitly opened task detail and exact links open their source', async ({ page }) => {
  const root = resolve(import.meta.dirname, '../..');
  const accounts = JSON.parse(await readFile(resolve(root, '.local/synthetic-accounts.json'), 'utf8')) as { role: string; email: string; password: string }[];
  const student = accounts.find(account => account.role === 'student')!;
  let supportRequests = 0; let resourceRequests = 0; let draftRequests = 0; let selectedId = '';
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path === '/v1/school/learning-support') supportRequests++;
    if (/\/resources\/assessment\//.test(path)) resourceRequests++;
    if (/\/assessments\/[^/]+\/draft$/.test(path)) draftRequests++;
  });
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(student.email); await page.getByLabel('Password', { exact: true }).fill(student.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectTrailWorkspace(page); await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Learning', exact: true }).click();
  await page.getByRole('button', { name: 'Assessments', exact: true }).click(); await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0);
  const task = page.locator('.assessment-section').first(); await expect(task.getByRole('button', { name: 'Open task', exact: true })).toBeVisible(); expect(supportRequests).toBe(0); expect(resourceRequests).toBe(0); expect(draftRequests).toBe(0);
  page.on('request', request => { const id = new URL(request.url()).pathname.match(/\/resources\/assessment\/([^/]+)/)?.[1]; if (id) selectedId = id; });
  await task.getByRole('button', { name: 'Open task', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(task.getByRole('region', { name: 'Task details', exact: true })).toBeVisible(); await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0);
  expect(supportRequests).toBe(1); expect(resourceRequests).toBe(1);
  await task.getByRole('button', { name: 'Close task', exact: true }).click(); await expect(task.getByRole('region', { name: 'Task details', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'العربية', exact: true }).click(); await task.getByRole('button', { name: 'فتح التقييم', exact: true }).click(); await expect(task.getByRole('region', { name: 'تفاصيل التقييم', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  expect(selectedId).not.toBe(''); await page.goto(`/?view=learning&source=assessment&id=${selectedId}`);
  // A new document intentionally has no persisted protected session; sign in at the exact source URL.
  await page.getByLabel('School email').fill(student.email); await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
  await expect(page.locator('.assessment-section').getByRole('region', { name: 'Task details', exact: true })).toBeVisible();
});
