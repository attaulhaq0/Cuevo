import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
type Account = { role: string; email: string; password: string };
test('current learner report downloads fresh native source page with explicit unknown coverage', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[]; const student = accounts.find(row => row.role === 'student')!; await page.goto('/'); if (await page.getByRole('button', { name: 'English', exact: true }).isVisible()) await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email').fill(student.email); await page.getByLabel('Password', { exact: true }).fill(student.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page); await page.getByRole('button', { name: 'Progress', exact: true }).click(); const requested = page.waitForResponse(response => response.url().includes('/academic-report?') && response.request().method() === 'GET'); const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download current academic result page', exact: true }).click(); const response = await requested; expect(response.ok()).toBe(true); const report = await response.json(); expect(report.scope).toBe('CURRENT_RELEASED_PAGE'); expect(report.coverage).toBe('NOT_ESTABLISHED'); expect(report.items.every((item: { learnerId: string }) => item.learnerId === '20000000-0000-4000-8000-000000000012')).toBe(true); const download = await downloaded; expect(await download.failure()).toBeNull(); expect(download.suggestedFilename()).toContain('current-results'); const path = await download.path(); expect(path).not.toBeNull(); const html = await readFile(path!, 'utf8'); expect(html).toContain('cuevo-report-coverage" content="NOT_ESTABLISHED'); expect(html).toContain('CURRENT_RELEASED_PAGE'); expect(html).not.toContain('<script>');
});

test('a report requested before sign-out cannot download into a later browser session', async ({ page }) => {
  page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const student = accounts.find(row => row.role === 'student')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(student.email); await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
  await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download current academic result page', exact: true })).toBeVisible();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let observed!: () => void; const started = new Promise<void>(resolve => { observed = resolve; });
  let finished!: () => void; const handled = new Promise<void>(resolve => { finished = resolve; });
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  const pattern = '**/v1/learners/*/academic-report?limit=25';
  await page.route(pattern, async route => {
    try { const response = await route.fetch(); observed(); await held; await route.fulfill({ response }); }
    catch { /* The captured request is canceled when its verified actor leaves. */ }
    finally { finished(); }
  });
  const canceled = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('/academic-report?limit=25'), timeout: 15000 });
  await page.getByRole('button', { name: 'Download current academic result page', exact: true }).click(); await started;
  await signOutTrailWorkspace(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  release(); await handled; await canceled; await page.unroute(pattern);
  expect(downloads).toEqual([]);
});
