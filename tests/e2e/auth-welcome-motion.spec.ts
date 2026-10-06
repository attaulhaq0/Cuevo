import { expect, test } from '@playwright/test';

// Static presentation only; membership and protected API acceptance stay separate.
for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: desktop forced colors preserves native controls without the decorative room`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    await page.getByRole('button', { name: locale === 'ar' ? 'العربية' : 'English', exact: true }).click();
    const sceneDisplay = await page.locator('.auth-studio-scene').evaluate(element => getComputedStyle(element, '::before').display);
    expect(sceneDisplay).toBe('none');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('.auth-form')).toHaveCount(1);
    await page.locator('#email').fill('forced-color@example.invalid');
    await page.locator('#password').fill('presentation-only');
    await page.getByRole('button', { name: locale === 'ar' ? 'إظهار كلمة المرور' : 'Show password', exact: true }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  });

  test(`${locale}: static companions never mount or request welcome video`, async ({ page }) => {
    const mediaRequests: string[] = [];
    page.on('request', request => { if (/\.(webm|mp4)(?:\?|$)/.test(request.url())) mediaRequests.push(request.url()); });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1915, height: 875 });
    await page.goto('/');
    await page.getByRole('button', { name: locale === 'ar' ? 'العربية' : 'English', exact: true }).click();
    const art = page.locator('.auth-companions__image');
    await expect(art).toBeVisible();
    await expect.poll(() => art.evaluate(image => (image as HTMLImageElement).currentSrc)).toMatch(/studio-companions\./);
    await expect(page.locator('.auth-page video')).toHaveCount(0);
    await page.locator('#email').fill('static-presentation@example.invalid');
    for (const viewport of [{ width: 390, height: 844 }, { width: 3072, height: 2048 }]) {
      await page.setViewportSize(viewport);
      await expect(art).toBeVisible();
      await expect.poll(() => art.evaluate(image => (image as HTMLImageElement).currentSrc)).toMatch(viewport.width < 768 ? /welcome-fox\./ : /studio-companions\./);
      const backdrop = await page.locator('.auth-page').evaluate(element => ({ page: getComputedStyle(element, '::before').backgroundImage, scene: getComputedStyle(element.querySelector(innerWidth > 1100 ? '.auth-visual' : '.auth-studio-scene')!, '::before').backgroundImage }));
      if (viewport.width < 768) { expect(backdrop.page).toMatch(/learning-background\./); expect(backdrop.scene).toBe('none'); }
      else { expect(backdrop.page).toBe('none'); expect(backdrop.scene).toMatch(/studio-background\./); }
      await expect(page.locator('.auth-form')).toHaveCount(1);
      await expect(page.locator('#email')).toHaveValue('static-presentation@example.invalid');
      await expect(page.locator('.auth-submit')).toBeEnabled();
      await expect(page.locator('.auth-page video')).toHaveCount(0);
    }
    expect(mediaRequests).toEqual([]);
  });
}
