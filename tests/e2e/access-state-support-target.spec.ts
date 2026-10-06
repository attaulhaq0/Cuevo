import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The production frontend receives explicit fictional Auth/membership responses;
// denial/retry presentation is separate from actual backend authorization.
for (const locale of ['en', 'ar'] as const) test(`${locale}: denied school access keeps a reachable keyboard support reference outside workspace chrome`, async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const errors: string[] = [], refusedRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if(response.status()===403) refusedRequests.push(new URL(response.url()).pathname); });
  page.on('console', message => { if (message.type() === 'error' && !/^Failed to load resource: the server responded with a status of 403(?: \(Forbidden\))?$/.test(message.text())) errors.push(message.text()); });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.includes('/auth/v1/token')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'fictional-access-target-token', refresh_token: 'fictional-access-target-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'f1100000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'access@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }) }); return; }
    if (url.pathname === '/v1/me') { await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'FORBIDDEN', requestId: 'presentation-support-403' }) }); return; }
    if (url.origin !== origin || url.pathname.startsWith('/v1/')) { await route.abort(); return; }
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: locale === 'en' ? 'English' : 'العربية', exact: true }).click();
  await page.getByLabel(locale === 'en' ? 'School email' : 'البريد الإلكتروني المدرسي', { exact: true }).fill('access@example.invalid');
  await page.getByLabel(locale === 'en' ? 'Password' : 'كلمة المرور', { exact: true }).fill('fictional-presentation-only');
  await page.getByRole('button', { name: locale === 'en' ? 'Sign in' : 'تسجيل الدخول', exact: true }).click();
  await expect(page.locator('.access-state')).toBeVisible(); await expect(page.locator('.workspace-chrome')).toHaveCount(0);
  const summary = page.locator('.access-state .support-reference > summary');
  await expect(summary).toHaveText(locale === 'en' ? 'Reference for support' : 'مرجع للمساعدة');
  await expect(page.locator('.access-state .support-reference')).not.toHaveAttribute('open', '');
  await page.getByRole('link', { name: locale === 'en' ? 'Skip to main content' : 'انتقل إلى المحتوى الرئيسي', exact: true }).focus();
  for (let attempt = 0; attempt < 30 && !await summary.evaluate(element => document.activeElement === element); attempt++) await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(element => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return rect.height >= 44 && rect.width >= 44 && rect.top >= 0 && rect.bottom <= innerHeight && element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2; })).toBe(true);
  await page.keyboard.press('Enter'); await expect(page.locator('.access-state .support-reference')).toHaveAttribute('open', '');
  await expect(page.locator('.access-state .support-reference bdi')).toHaveText('presentation-support-403');
  await page.keyboard.press('Enter'); await expect(page.locator('.access-state .support-reference')).not.toHaveAttribute('open', '');
  expect((await new AxeBuilder({ page }).withRules(['target-size']).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(refusedRequests).toEqual(['/v1/me']);
});
