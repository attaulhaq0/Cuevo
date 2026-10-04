import { test, expect, chromium, type Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: { actorId: string; role: string; email: string; password: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_NATIVE_ZOOM_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

// Native Chromium tab zoom in a disposable profile. No user browser/extension is modified.
test.describe('isolated actual Admin native page zoom', () => {
  test.skip(!runtimePath, 'Requires dedicated synthetic runtime and frozen build.');
  for (const locale of ['en', 'ar'] as const) test(`${locale}: current person, policy, audit and native dialogs survive 85–200% zoom`, async ({ browserName }, info) => {
    expect(browserName).toBe('chromium');
    test.setTimeout(90_000);
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json') || info.config.webServer) throw new Error('Dedicated no-webServer isolated configuration required.');
    const runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Isolated synthetic/provider guard failed.');
    const build = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim(); if (build !== process.env.CUEVO_NATIVE_ZOOM_BUILD) throw new Error('Exact frozen build required.');
    const account = runtime.accounts.find(row => row.actorId.endsWith('001')); if (!account || account.role !== 'admin') throw new Error('Current Admin identity unavailable.');
    const extension = info.outputPath('native-zoom-extension'); await mkdir(extension, { recursive: true });
    await writeFile(resolve(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Cuevo disposable native zoom verification', version: '1.0', permissions: ['tabs'], background: { service_worker: 'background.js' } }));
    await writeFile(resolve(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
    const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const errors: string[] = [], warnings: string[] = [], blocked: string[] = [], measures: unknown[] = [];
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      await context.routeWebSocket('**/*', socket => socket.close());
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url()), login = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && request.method() === 'POST';
        if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'OPTIONS'].includes(request.method()) && !login) { blocked.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(); page.setDefaultTimeout(7_000); const capture = await context.newCDPSession(page);
      async function nativeScreenshot(){return Buffer.from((await capture.send('Page.captureScreenshot',{format:'png',fromSurface:true})).data,'base64');}
      page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
      await page.goto(base + '/?view=school'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click(); await page.locator('.school-workspace').waitFor();
      if (locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
      const copy = locale === 'ar' ? { people: 'الأشخاص والصلاحيات', automation: 'مراجعة الأتمتة', audit: 'سجل تدقيق المدرسة', edit: 'تعديل هذا السجل', search: 'البحث عن مساحات العمل', profile: 'الملف الشخصي والإعدادات' } : { people: 'People and access', automation: 'Automation review', audit: 'School audit', edit: 'Edit this record', search: 'Search workspaces', profile: 'Profile and settings' };
      const toolbar = page.locator('.school-workspace > .learning-toolbar'); await toolbar.getByRole('button', { name: copy.people, exact: true }).click();
      const choice = page.locator('.school-access-directory__rows li').first().getByRole('button'); await choice.click();
      const selected = page.locator('.school-access-selected'), heading = selected.locator('h2'); await expect(heading).toBeFocused(); const title = await heading.innerText();
      const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
      async function zoom(factor: number) {
        const actual = await worker.evaluate(async ({ factor, url }) => {
          const tabs = (globalThis as unknown as { chrome: { tabs: { query: (query: object) => Promise<{ id: number; url?: string }[]>; setZoom: (id: number, factor: number) => Promise<void>; getZoom: (id: number) => Promise<number> } } }).chrome.tabs;
          const tab = (await tabs.query({})).find(row => row.url === url); if (!tab) throw new Error('Disposable test tab unavailable.'); await tabs.setZoom(tab.id, factor); return tabs.getZoom(tab.id);
        }, { factor, url: page.url() }); expect(actual).toBeCloseTo(factor, 5);
        await expect.poll(async () => Math.abs(await page.evaluate(() => innerWidth) - baseline.width / factor)).toBeLessThanOrEqual(1.5);
        expect(await page.evaluate(() => devicePixelRatio) / baseline.dpr).toBeCloseTo(factor, 5);
        expect(await page.evaluate(() => ({ scale: visualViewport?.scale, cssZoom: getComputedStyle(document.body).zoom }))).toEqual({ scale: 1, cssZoom: '1' });
      }
      async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
      async function focusedAction() {
        await heading.focus(); await page.keyboard.press('Tab'); const action = selected.getByRole('button', { name: copy.edit, exact: true }); await expect(action).toBeFocused();
        const visibility = await action.evaluate(element => { const r = element.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { fits: r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1, clear: top === element || element.contains(top), outlined: element.matches(':focus-visible') && parseFloat(getComputedStyle(element).outlineWidth) > 0 && getComputedStyle(element).outlineStyle === 'solid' }; });
        await info.attach('focus-style',{body:JSON.stringify(await action.evaluate(e=>({focus:e.matches(':focus-visible'),outline:getComputedStyle(e).outlineWidth,style:getComputedStyle(e).outlineStyle,focusWidth:getComputedStyle(e).getPropertyValue('--focus-width')}))),contentType:'application/json'});
        expect(visibility).toEqual({ fits: true, clear: true, outlined: true });
      }
      for (const factor of [.85, 1, 1.25, 1.5, 2, 1]) { await zoom(factor); await expect(heading).toHaveText(title); await focusedAction(); await noOverflow(page); measures.push({ view: 'selected-current-person', factor, actualOutlinePolicy:'Native browser CSS rounds outline at zoom; visible solid outline required, shared source token stays2px', ...await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) }); if ([.85, 2].includes(factor)) await info.attach(`person-${factor}`, { body: await nativeScreenshot(), contentType: 'image/png' }); }
      await toolbar.getByRole('button', { name: copy.automation, exact: true }).click(); const policy = page.locator('#school-automation-policy'); await expect(policy.locator('option')).toHaveCount(5);
      for (const factor of [1, 1.5, 2, 1]) { await zoom(factor); await policy.focus(); await expect(policy).toBeFocused(); await noOverflow(page); await expect(page.locator('.school-automation-policy')).toHaveCount(1); measures.push({ view: 'current-policy', factor, ...await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) }); }
      await toolbar.getByRole('button', { name: copy.audit, exact: true }).click(); await expect(page.locator('.school-audit-row')).toHaveCount(25);
      await zoom(2); await page.locator('.school-audit-row').last().locator('summary').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.school-audit-row').last().locator('details')).toHaveAttribute('open', ''); await noOverflow(page);
      await page.locator('.workspace-chrome__search').click(); const dialog = page.locator('dialog.workspace-command'); await expect(dialog).toBeVisible(); await noOverflow(page); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
      await page.locator('.workspace-chrome__person > button').click(); await expect(page.locator('.workspace-chrome__profile')).toBeVisible(); await noOverflow(page); await page.keyboard.press('Escape');
      expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await info.attach('native-zoom-proof', { body: JSON.stringify({ build, locale, method: 'Confirmed Chromium tab zoom; DPR and CSS viewport change, no CSS/pinch zoom', measures }), contentType: 'application/json' });
      expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(blocked).toEqual([]);
      expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(build);
    } finally { await context.close(); }
  });
});
