import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
type Account = { role: string; email: string; password: string };
const widths = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];
test('login is responsive, bilingual, keyboard accessible and has no runtime errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const viewport of widths) {
    await page.setViewportSize(viewport); await page.goto('/');
    await expect(page).toHaveTitle(/Cuevo/); await expect(page.getByRole('heading', { name: 'Welcome to Cuevo' })).toBeVisible();
    await expect(page.getByLabel('School email')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations).toEqual([]); expect(errors).toEqual([]);
});
test('all five synthetic roles authenticate through Supabase and current API membership', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  for (const role of ['admin', 'coordinator', 'teacher', 'student', 'parent']) {
    const account = accounts.find(a => a.role === role)!;
    await page.goto('/');
    await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
    await expect(page.getByText(`Synthetic ${role}`, { exact: false }).first()).toBeVisible();
    const heading = page.locator('main h1'); await expect(heading).not.toBeEmpty();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  }
});
