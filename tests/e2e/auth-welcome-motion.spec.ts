import { expect, test } from '@playwright/test';

// Static presentation only; membership and protected API acceptance stay separate.
for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: static companions never mount or request welcome video`, async ({ page }) => {
    const mediaRequests: string[] = [];
    page.on('request', request => { if (/\.(webm|mp4)(?:\?|$)/.test(request.url())) mediaRequests.push(request.url()); });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1915, height: 875 });
    await page.goto('/');
    await page.getByRole('button', { name: locale === 'ar' ? 'العربية' : 'English', exact: true }).click();
    const art = page.locator('.auth-companions__image');
    await expect(art).toBeVisible();
    await expect(page.locator('.auth-page video')).toHaveCount(0);
    await page.locator('#email').fill('static-presentation@example.invalid');
    for (const viewport of [{ width: 390, height: 844 }, { width: 3072, height: 2048 }]) {
      await page.setViewportSize(viewport);
      await expect(art).toBeVisible();
      await expect(page.locator('#email')).toHaveValue('static-presentation@example.invalid');
      await expect(page.locator('.auth-submit')).toBeEnabled();
      await expect(page.locator('.auth-page video')).toHaveCount(0);
    }
    expect(mediaRequests).toEqual([]);
  });
}
