import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('account invitation landing is inert until explicit confirmation and rejects missing or malformed links', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name)); page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning' && /hydrat/i.test(message.text())) errors.push(message.text()); });
  const mutations: string[] = []; page.on('request', request => { if (request.method() === 'POST' && /verify|claim|user/.test(new URL(request.url()).pathname)) mutations.push(new URL(request.url()).pathname); });
  await page.goto('/account/admission'); await expect(page.locator('main').getByRole('alert')).toContainText('missing or incomplete'); expect(mutations).toEqual([]);
  await page.goto('/account/admission#id=invalid&token_hash=secret&type=invite&admission_secret=invalid'); await expect(page).toHaveURL('http://localhost:3000/account/admission'); await expect(page.locator('main').getByRole('alert')).toContainText('missing or incomplete'); expect(mutations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]); expect(errors).toEqual([]);
});
