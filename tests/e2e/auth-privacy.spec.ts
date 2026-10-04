import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Presentation only: no credentials, provider request or membership is fabricated.
for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: privacy preserves the form and studio viewport`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    for (const viewport of [{ width:1536,height:688 }, { width:1366,height:600 }, { width:1280,height:720 }, { width:1101,height:688 }, { width:1920,height:864 }, { width:390,height:844 }]) {
      await page.setViewportSize(viewport); await page.goto('/');
      await page.getByRole('button', { name:locale === 'ar' ? 'العربية' : 'English', exact:true }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#email').fill('privacy-presentation@example.invalid');
      const measure = () => page.evaluate(() => ({
        height:document.documentElement.scrollHeight, width:document.documentElement.scrollWidth,
        panel:document.querySelector('.auth-panel')!.getBoundingClientRect().toJSON(),
        scene:document.querySelector('.auth-studio-scene')!.getBoundingClientRect().toJSON(),
        scrollY,
      }));
      const before = await measure();
      if (viewport.width > 1100) {
        const artwork = await page.locator('.auth-visual').evaluate(element => {
          const pseudo = getComputedStyle(element,'::before'), bounds = element.getBoundingClientRect();
          const width = parseFloat(pseudo.width), offset = parseFloat(pseudo.insetInlineStart);
          return document.dir === 'rtl' ? bounds.right-offset-width : bounds.x+offset+width;
        });
        expect(locale === 'ar' ? artwork-before.panel.right : before.panel.x-artwork, 'The room ends before the credential card').toBeGreaterThanOrEqual(24);
      }
      const trigger = page.locator('.auth-privacy-trigger');
      await trigger.click();
      const dialog = page.getByRole('dialog', { name:locale === 'ar' ? 'الخصوصية ومعلومات الجهاز' : 'Privacy & device information' });
      await expect(dialog).toBeVisible();
      const after = await measure();
      expect(after.height, 'Opening privacy never lengthens the page').toBe(before.height);
      expect(after.width).toBe(before.width);
      expect(after.panel).toEqual(before.panel);
      expect(after.scene).toEqual(before.scene);
      expect(after.scrollY).toBe(before.scrollY);
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(viewport.height);
      await expect(dialog.locator('.auth-privacy__body p')).toHaveCount(2);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
      // A native modal makes the background inert. Tab may visit browser chrome,
      // which is not an application focus escape and differs by browser policy.
      await page.locator('#email').evaluate(element => (element as HTMLElement).focus());
      await expect(page.locator('#email')).not.toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
      await expect(page.locator('#email')).toHaveValue('privacy-presentation@example.invalid');
      await expect(page.locator('.auth-form')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });

  test(`${locale}: enlarged privacy text scrolls inside its dialog`, async ({ page }) => {
    await page.setViewportSize({ width:640,height:450 }); await page.goto('/');
    await page.getByRole('button', { name:locale === 'ar' ? 'العربية' : 'English', exact:true }).click();
    await page.locator('.auth-privacy-trigger').click();
    const dialog = page.getByRole('dialog');
    await dialog.evaluate(element => { element.querySelectorAll<HTMLElement>('p').forEach(p => { p.style.fontSize = '32px'; }); });
    const body = dialog.locator('.auth-privacy__body');
    const scroll = await body.evaluate(element => ({ height:element.clientHeight, total:element.scrollHeight, overflow:getComputedStyle(element).overflowY }));
    expect(scroll.total).toBeGreaterThan(scroll.height); expect(scroll.overflow).toBe('auto');
    await body.focus(); await page.keyboard.press('End');
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('button').click(); await expect(dialog).not.toBeVisible();
    await expect(page.locator('.auth-privacy-trigger')).toBeFocused();
  });
}
