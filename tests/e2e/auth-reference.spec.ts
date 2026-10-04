import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// These journeys prove unauthenticated presentation and mocked failure handling only.
// Real authentication, current membership, tenant/role/object scope and RLS have separate suites.
const viewports = [
  { width: 1536, height: 1024 },
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
];
const reflowViewports = [{ width: 640, height: 450 }, { width: 320, height: 568 }];
const evidence = resolve('.local/auth-reference', process.env.CUEVO_AUTH_REFERENCE_RUN ?? `run-${new Date().toISOString().replace(/[:.]/g, '-')}`, 'screens');
const tokenRoute = /\/auth\/v1\/token\?grant_type=password(?:&|$)/;
const syntheticEmail = 'auth-presentation-only@example.invalid';
const syntheticPassword = 'presentation-only-invalid-password';
const privateProviderMessage = 'PRIVATE_PROVIDER_DETAIL_do_not_render';
const copy = {
  en: {
    localeButton: 'English', welcome: 'Welcome to Cuevo', email: 'School email', password: 'Password',
    signIn: 'Sign in', helpTab: 'Account help', show: 'Show password', hide: 'Hide password',
    helpHeading: 'Need access or password help?', helpAction: 'Need help signing in?',
    returnSignIn: 'Return to sign-in', accessHelp: 'Need access? Contact your school for help.', skip: 'Skip to main content',
    accountBody: 'Your school provides your account and decides which workspaces you can access.',
    sharedDevice: 'On a shared device, sign out when you finish.',
    privacyTitle: 'Privacy & device information',
    privacyBody: 'This browser remembers your language choice. Sign-in sessions stay in memory and are not saved in browser storage.',
    privacyEnvironment: 'This preview uses a synthetic school environment. Official curriculum and live intelligence readiness require separate review.',
    credentials: 'We could not sign you in. Check your email and password and try again.',
    unavailable: 'Sign-in is temporarily unavailable. Please try again shortly.',
  },
  ar: {
    localeButton: 'العربية', welcome: 'مرحبًا بك في Cuevo', email: 'البريد الإلكتروني المدرسي', password: 'كلمة المرور',
    signIn: 'تسجيل الدخول', helpTab: 'مساعدة الحساب', show: 'إظهار كلمة المرور', hide: 'إخفاء كلمة المرور',
    helpHeading: 'تحتاج إلى حساب أو مساعدة في كلمة المرور؟', helpAction: 'تحتاج إلى مساعدة في الدخول؟',
    returnSignIn: 'العودة إلى تسجيل الدخول', accessHelp: 'تحتاج إلى حساب؟ تواصل مع مدرستك للمساعدة.', skip: 'انتقل إلى المحتوى الرئيسي',
    accountBody: 'مدرستك توفّر حسابك وتحدّد مساحات العمل التي يمكنك الوصول إليها.',
    sharedDevice: 'سجّل الخروج بعد الانتهاء من استخدام جهاز مشترك.',
    privacyTitle: 'الخصوصية ومعلومات الجهاز',
    privacyBody: 'يتذكّر هذا المتصفح اللغة التي تختارها. تبقى جلسات تسجيل الدخول في الذاكرة ولا تُحفظ في تخزين المتصفح.',
    privacyEnvironment: 'تستخدم هذه المعاينة بيئة مدرسية اصطناعية. اعتماد المناهج الرسمية والذكاء المباشر يحتاج إلى مراجعة مستقلة.',
    credentials: 'تعذّر تسجيل الدخول. تحقّق من بريدك الإلكتروني وكلمة المرور ثم حاول مجددًا.',
    unavailable: 'تسجيل الدخول غير متاح مؤقتًا. يُرجى المحاولة بعد قليل.',
  },
} as const;
type Locale = keyof typeof copy;

async function openSignIn(page: Page, locale: Locale) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Cuevo/);
  await page.getByRole('button', { name: copy[locale].localeButton, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.getByRole('heading', { name: copy[locale].welcome, exact: true })).toBeVisible();
  await expect(page.locator('.auth-form button[type="submit"]')).toBeEnabled();
  await expect(page.locator('nextjs-portal [data-nextjs-dialog]')).toHaveCount(0);
}

async function keyboardReach(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let attempt = 0; attempt < 50; attempt++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) {
      await expect(target).toBeFocused();
      expect(await target.evaluate(element => {
        const style = getComputedStyle(element); const box = element.getBoundingClientRect();
        return element.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2
          && style.outlineStyle !== 'none' && box.left >= -1 && box.right <= innerWidth + 1
          && box.top >= -1 && box.bottom <= innerHeight + 1;
      }), 'Keyboard focus must be visible and within the viewport').toBe(true);
      return;
    }
  }
  throw new Error('Control was not reachable in the auth keyboard order.');
}

async function keyboardActivate(page: Page, target: Locator) {
  await keyboardReach(page, target);
  await page.keyboard.press('Enter');
}

async function semanticSmoke(page: Page) {
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('main h1')).not.toBeEmpty();
  const snapshot = await page.getByRole('main').ariaSnapshot();
  expect(snapshot).toMatch(/heading ".+" \[level=1\]/);
  expect(await page.locator('.auth-form input').evaluateAll(elements => elements.every(element => {
    const input = element as HTMLInputElement;
    return !!input.labels?.length && !!input.id && input.labels[0].htmlFor === input.id;
  })), 'Sign-in fields must have associated visible labels').toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations).toEqual([]);
}

async function loadedSourceImages(page: Page) {
  const logo = page.locator('.auth-header .brand__mark');
  await expect(logo).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Cuevo by E Deviser', exact: true })).toBeVisible();
  await expect(logo).toHaveAttribute('src', /cuevo-mark\./);
  const art = page.locator('.auth-companions__image');
  await expect(art).toHaveCount(1);
  await art.scrollIntoViewIfNeeded();
  await expect.poll(() => art.evaluate(image => (image as HTMLImageElement).currentSrc)).toMatch((page.viewportSize()?.width ?? 1536) < 768 ? /welcome-fox\./ : /studio-companions\./);
  await expect(art).toHaveAttribute('alt', /.+/);
  await expect.poll(() => page.locator('.auth-header img, .auth-visual img').evaluateAll(images => images.every(image => {
    const asset = image as HTMLImageElement;
    return asset.complete && asset.naturalWidth > 0 && asset.naturalHeight > 0;
  })), { message: 'The supplied logo and approved auth illustration must decode successfully' }).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
}

async function layoutBounds(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom + scrollY };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      main: box('.auth-main'), story: box('.auth-story'), visual: box('.auth-visual'),
      panel: box('.auth-panel'), footer: box('.auth-footer'),
      controls: [...document.querySelectorAll('.auth-form input, .auth-form button[type="submit"], .auth-panel__tabs button')].map(element => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute('name') ?? element.textContent?.trim(), left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }),
    };
  });
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => scrollTo(0, 0));
  const path = resolve(evidence, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: source images, reference and responsive viewports, 200% and 320px reflow, accessible auth`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewports[0]);
    await openSignIn(page, locale); await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadedSourceImages(page);
    const measurements = [];
    for (const viewport of [...viewports, ...reflowViewports]) {
      await page.setViewportSize(viewport);
      await expect(page.getByLabel(copy[locale].email, { exact: true })).toBeVisible();
      await expect(page.getByLabel(copy[locale].password, { exact: true })).toBeVisible();
      const bounds = await layoutBounds(page); measurements.push(bounds);
      expect(bounds.document.width, `${locale}/${viewport.width}: page must not scroll horizontally`).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.panel).not.toBeNull();
      for (const control of bounds.controls) {
        expect(control.left, `${locale}/${viewport.width}/${control.label}: left edge`).toBeGreaterThanOrEqual(-1);
        expect(control.right, `${locale}/${viewport.width}/${control.label}: right edge`).toBeLessThanOrEqual(viewport.width + 1);
        expect(control.width).toBeGreaterThan(0); expect(control.height).toBeGreaterThan(0);
      }
      await semanticSmoke(page);
      if (viewport.width === 390) {
        await expect(page.getByRole('heading', { level: 1, name: copy[locale].welcome, exact: true })).toBeVisible();
        await expect(page.locator('.learning-loop')).toBeHidden();
        await expect(page.locator('.learning-loop__roles')).toBeHidden();
        const primary = await page.locator('.auth-submit').boundingBox();
        expect(primary!.y + primary!.height, `${locale}: mobile sign-in must be visible before scrolling`).toBeLessThanOrEqual(viewport.height);
        expect(bounds.document.height, `${locale}: the full Foxi preserves the normal mobile viewport fit`).toBeLessThanOrEqual(viewport.height + 1);
      }
      if ([1536, 1440, 390].includes(viewport.width)) await screenshot(page, testInfo, `auth-${locale}-${viewport.width}x${viewport.height}`);
    }
    // 640x450 is the CSS reflow area for a 1280x900 viewport at 200% zoom.
    // This measures reflow; it does not assert a browser/OS zoom gesture occurred.
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    expect(await page.locator('.auth-page button').evaluateAll(buttons => buttons.every(button => {
      const style = getComputedStyle(button);
      return style.transitionDuration.split(',').every(duration => parseFloat(duration) === 0)
        && (style.animationName === 'none' || style.animationDuration.split(',').every(duration => parseFloat(duration) === 0));
    }))).toBe(true);
    await mkdir(evidence, { recursive: true });
    const path = resolve(evidence, `auth-${locale}-content-bounds.json`);
    await writeFile(path, JSON.stringify(measurements, null, 2));
    await testInfo.attach(`${locale}-content-bounds`, { path, contentType: 'application/json' });
    expect(errors).toEqual([]);
  });

  test(`${locale}: keyboard sign-in validation, password visibility, account help and truthful device information`, async ({ page, context }, testInfo) => {
    const t = copy[locale]; const authRequests: string[] = [];
    page.on('request', request => { if (/\/auth\/v1\//.test(request.url())) authRequests.push(request.url()); });
    await page.setViewportSize({ width: 390, height: 844 }); await openSignIn(page, locale);
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo(0, 0); });
    await keyboardActivate(page, page.getByRole('link', { name: t.skip, exact: true }));
    await expect(page.getByRole('main')).toBeFocused();
    const email = page.getByLabel(t.email, { exact: true }); const password = page.getByLabel(t.password, { exact: true });
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await expect(email).toHaveAttribute('dir', 'ltr'); await expect(password).toHaveAttribute('dir', 'ltr');
    await keyboardActivate(page, page.locator('.auth-form button[type="submit"]'));
    await expect(email).toBeFocused();
    expect(await email.evaluate(element => (element as HTMLInputElement).validity.valueMissing)).toBe(true);
    expect(authRequests).toEqual([]);
    await email.fill('invalid-email');
    await keyboardActivate(page, page.locator('.auth-form button[type="submit"]'));
    expect(await email.evaluate(element => (element as HTMLInputElement).validity.typeMismatch)).toBe(true);
    expect(authRequests).toEqual([]);
    await password.fill(syntheticPassword);
    const show = page.getByRole('button', { name: t.show, exact: true });
    await keyboardActivate(page, show); await expect(password).toHaveAttribute('type', 'text');
    const hide = page.getByRole('button', { name: t.hide, exact: true }); await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await keyboardActivate(page, hide); await expect(password).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: t.show, exact: true })).toHaveAttribute('aria-pressed', 'false');
    await keyboardReach(page, page.getByRole('tab', { name: t.signIn, exact: true })); await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tab', { name: t.helpTab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: t.helpHeading, exact: true })).toBeVisible();
    await expect(page.getByText(t.accountBody, { exact: true })).toBeVisible();
    await expect(page.locator('.auth-account-help').getByText(t.sharedDevice, { exact: true })).toBeVisible();
    await expect(page.locator('.auth-form')).toHaveCount(0);
    await semanticSmoke(page);
    await screenshot(page, testInfo, `account-help-${locale}-390x844`);
    await keyboardActivate(page, page.getByRole('button', { name: t.returnSignIn, exact: true }));
    await expect(password).toHaveValue('');
    await keyboardActivate(page, page.getByRole('button', { name: t.helpAction, exact: true }));
    await expect(page.getByRole('heading', { name: t.helpHeading, exact: true })).toBeVisible();
    await keyboardActivate(page, page.getByRole('button', { name: t.returnSignIn, exact: true }));
    await keyboardActivate(page, page.getByRole('button', { name: t.accessHelp, exact: true }));
    await expect(page.getByRole('heading', { name: t.helpHeading, exact: true })).toBeVisible();
    await keyboardActivate(page, page.getByRole('button', { name: t.returnSignIn, exact: true }));
    const privacy = page.locator('.auth-privacy');
    await expect(privacy).not.toHaveAttribute('open', '');
    await keyboardActivate(page, privacy.locator('summary'));
    await expect(privacy).toHaveAttribute('open', '');
    await expect(privacy.locator('summary')).toHaveText(t.privacyTitle);
    await expect(privacy.getByText(t.privacyBody, { exact: true })).toBeVisible();
    await expect(privacy.getByText(t.privacyEnvironment, { exact: true })).toBeVisible();
    await semanticSmoke(page);
    await keyboardActivate(page, privacy.locator('summary'));
    await expect(privacy).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: /^(register|create account|magic link|remember me|accept cookies|تسجيل حساب|إنشاء حساب|تذكرني|قبول ملفات الارتباط)$/i })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect((await context.cookies()).map(cookie => cookie.name)).toEqual(['cuevo_locale']);
    expect(authRequests).toEqual([]);
  });

  test(`${locale}: mocked credential and service errors clear passwords and preserve safe retry`, async ({ page }, testInfo) => {
    const t = copy[locale]; let requestCount = 0;
    let status = 400; let releaseResponse: (() => void) | undefined;
    let responseGate = new Promise<void>(resolveGate => { releaseResponse = resolveGate; });
    const protectedRequests: string[] = [];
    page.on('request', request => { if (/\/v1\//.test(new URL(request.url()).pathname) && !/\/auth\/v1\//.test(request.url())) protectedRequests.push(request.url()); });
    await page.route(tokenRoute, async route => {
      requestCount++;
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON() as { email: string; password: string };
      expect(body.email).toBe(syntheticEmail); expect(body.password).toBe(syntheticPassword);
      await responseGate;
      await route.fulfill({
        status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-supabase-api-version', 'x-supabase-api-version': '2024-01-01' },
        body: JSON.stringify({ code: status === 400 ? 'invalid_credentials' : 'unexpected_failure', error_code: status === 400 ? 'invalid_credentials' : 'unexpected_failure', msg: privateProviderMessage }),
      });
    });
    await page.setViewportSize({ width: 390, height: 844 }); await openSignIn(page, locale);
    const email = page.getByLabel(t.email, { exact: true }); const password = page.getByLabel(t.password, { exact: true });
    const submit = page.locator('.auth-form button[type="submit"]');
    await email.fill(syntheticEmail); await password.fill(syntheticPassword); await submit.click();
    await expect.poll(() => requestCount).toBe(1);
    await expect(page.locator('.auth-form')).toHaveAttribute('aria-busy', 'true');
    await expect(submit).toBeDisabled(); await expect(email).toBeDisabled(); await expect(password).toBeDisabled();
    await expect(page.locator('.auth-panel__tabs').getByRole('tab', { name: t.helpTab, exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: t.accessHelp, exact: true })).toBeDisabled();
    await page.keyboard.press('Enter'); expect(requestCount).toBe(1);
    releaseResponse!();
    const error = page.locator('#sign-in-error');
    await expect(error).toHaveText(t.credentials); await expect(error).toHaveAttribute('role', 'alert');
    await expect(email).toHaveAttribute('aria-invalid', 'true'); await expect(password).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'sign-in-error'); await expect(password).toHaveAttribute('aria-describedby', 'sign-in-error');
    await expect(password).toHaveValue(''); await expect(email).toHaveValue(syntheticEmail); await expect(submit).toBeEnabled();
    await expect(page.getByText(privateProviderMessage, { exact: false })).toHaveCount(0);
    await semanticSmoke(page); await screenshot(page, testInfo, `credentials-error-${locale}-390x844`);
    status = 503; responseGate = new Promise<void>(resolveGate => { releaseResponse = resolveGate; });
    await password.fill(syntheticPassword); await keyboardActivate(page, submit);
    await expect.poll(() => requestCount).toBe(2); await expect(error).toHaveCount(0); await expect(submit).toBeDisabled();
    releaseResponse!();
    await expect(error).toHaveText(t.unavailable); await expect(password).toHaveValue('');
    await expect(email).toHaveAttribute('aria-invalid', 'false'); await expect(password).toHaveAttribute('aria-invalid', 'false');
    await expect(email).toHaveAttribute('aria-describedby', 'sign-in-error'); await expect(password).toHaveAttribute('aria-describedby', 'sign-in-error');
    await expect(submit).toBeEnabled(); await expect(page.locator('.auth-form')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByText(privateProviderMessage, { exact: false })).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.locator('.workspace-chrome')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    await semanticSmoke(page); await screenshot(page, testInfo, `service-error-${locale}-390x844`);
  });
}
