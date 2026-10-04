import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
type Account = { role: string; email: string; password: string };
test('five roles have meaningful home actions and current-role navigation in English and Arabic', async ({ page }) => {
  test.setTimeout(90_000); const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  for (const role of ['admin', 'coordinator', 'teacher', 'student', 'parent']) { const account = accounts.find(row => row.role === role)!; await page.goto('/'); if (await page.getByRole('button', { name: 'English', exact: true }).isVisible()) await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, role);
    const homeHeadings: Record<string, string | RegExp> = { admin: 'A clear view of your school', coordinator: 'Programme and learning review', teacher: 'Your teaching day', student: /^Hello, /, parent: /^(Learning, clearly|Learning clearly with)/ };
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(homeHeadings[role]); await expect(page.getByText('Coming next', { exact: true })).toHaveCount(0); if (role === 'parent') await expect(page.getByRole('button', { name: 'Development', exact: true })).toHaveCount(0); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]); await page.getByRole('button', { name: 'English', exact: true }).click(); await signOutTrailWorkspace(page); }
});
