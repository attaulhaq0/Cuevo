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

test('Student responsive task scene reserves artwork space below the introduction', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const account = accounts.find(row => row.role === 'student')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, 'student');
  for (const width of [390, 768, 800, 1000, 1001, 1100, 1101, 1366]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const locale of ['English', 'العربية']) {
      await page.getByRole('button', { name: locale, exact: true }).click();
      await expect(page.locator('.student-trail__task-art')).toBeVisible();
      await expect.poll(async () => page.locator('.student-trail').evaluate((root, viewportWidth) => {
        const intro = root.querySelector('.student-trail__intro')!.getBoundingClientRect();
        const scene = root.querySelector('.student-trail__task-art')!.getBoundingClientRect();
        const task = root.querySelector('.student-trail__task')!.getBoundingClientRect();
        const art = Array.from(root.querySelectorAll('.student-trail__work-subject,.student-trail__foxi-crop')).filter(element => element.getClientRects().length > 0).map(element => element.getBoundingClientRect());
        const intersectsIntro = (rect: DOMRect) => rect.left < intro.right - 1 && rect.right > intro.left + 1 && rect.top < intro.bottom - 1 && rect.bottom > intro.top + 1;
        return { clearOfIntro: art.every(rect => !intersectsIntro(rect)), responsiveSceneFits: viewportWidth > 1100 || art.every(rect => rect.top >= scene.top - 1 && rect.bottom <= scene.bottom + 1), taskAfterScene: viewportWidth > 1000 || task.top >= scene.bottom - 1, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
      }, width), `${locale}/${width}: artwork has its own flow space and cannot cover the greeting or task`).toEqual({ clearOfIntro: true, responsiveSceneFits: true, taskAfterScene: true, pageFits: true });
    }
  }
  await signOutTrailWorkspace(page);
});
