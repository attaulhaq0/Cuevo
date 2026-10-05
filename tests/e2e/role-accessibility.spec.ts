import { expectTrailWorkspace, trailWorkspaceAction } from './trail-workspace';
import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Role = 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent';
type Account = { role: Role; email: string; password: string };
const roles: Role[] = ['admin', 'coordinator', 'teacher', 'student', 'parent'];
const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
];
const evidence = resolve('.local/technical-mvp-visuals/accessibility');
const skipNames = /^(Skip to main content|انتقل إلى المحتوى الرئيسي)$/;

async function keyboardActivate(page: Page, target: Locator) {
  await expect(target).toBeVisible(); await expect(target).toBeEnabled();
  // The skip link anchors the tab order. Activation always uses real keyboard input.
  await page.getByRole('link', { name: skipNames }).focus();
  for (let attempt = 0; attempt < 250; attempt++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) {
      await expect(target).toBeFocused();
      expect(await target.evaluate(element => {
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return element.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2
          && style.outlineStyle !== 'none' && rect.left >= -1 && rect.right <= innerWidth + 1
          && rect.top >= -1 && rect.bottom <= innerHeight + 1;
      }), 'Keyboard focus must have a visible outline inside the current viewport').toBe(true);
      await page.keyboard.press('Enter'); return;
    }
  }
  throw new Error('Named control was not reachable through the current keyboard tab order.');
}

async function signIn(page: Page, role: Role) {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const account = accounts.find(item => item.role === role); if (!account) throw new Error('Synthetic role account missing.');
  await page.goto('/'); await keyboardActivate(page, page.getByRole('button', { name: 'English', exact: true }));
  await page.getByLabel('School email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  const verified = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/me' && response.request().method() === 'GET');
  await keyboardActivate(page, page.getByRole('button', { name: 'Sign in', exact: true }));
  const current = await (await verified).json() as { displayName: string };
  if (role === 'student') {
    await expectTrailWorkspace(page, role);
    await expect(page.locator('.student-trail__intro h1')).toHaveText(`Hello, ${current.displayName}!`);
    await expect(page.locator('.workspace-chrome__person')).toContainText('Student');
    await expect(page.locator('.student-home .student-trail__task')).toBeVisible();
    await expect(page.locator('.student-home .student-trail__task h2')).not.toBeEmpty();
    await expect(page.locator('.student-home .student-trail__goal h2')).toHaveText('My learning goal');
  } else {
    await expectTrailWorkspace(page, role);
    await expect(page.locator('.workspace-chrome__person > button strong')).toHaveText(current.displayName);
    const titles: Record<string, string | RegExp> = { admin: 'A clear view of your school', coordinator: 'Programme and learning review', teacher: 'Your teaching day', parent: /^(Learning, clearly|Learning clearly with)/ };
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(titles[role]);
  }
  if (role === 'parent') {
    const child = page.getByLabel('Child', { exact: true });
    const option = child.locator('option[value]:not([value=""]):not([disabled])').first();
    await expect(option).toBeAttached();
    if (await child.inputValue() === '') { await child.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
    await expect(child).not.toHaveValue(''); await settled(page);
  }
  return current.displayName;
}

async function settled(page: Page) {
  await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0);
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
}

async function semanticSmoke(page: Page) {
  await expect(page.getByRole('main')).toHaveCount(1);
  const navigation = page.locator('.workspace-chrome__navigation,.workspace-chrome__focused-navigation');
  await expect(navigation).toHaveCount(1); await expect(navigation).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(1); await expect(page.locator('main h1')).not.toBeEmpty();
  const snapshot = await page.getByRole('main').ariaSnapshot();
  expect(snapshot).toMatch(/heading ".+" \[level=1\]/);
  expect(await page.locator('main input:not([type="hidden"]), main select, main textarea').evaluateAll(elements => elements.every(element => {
    const control = element as HTMLInputElement;
    return !!control.labels?.length || !!element.getAttribute('aria-label') || !!element.getAttribute('aria-labelledby');
  })), 'Every rendered form control needs a screen-reader name').toBe(true);
  // AX semantics are a smoke check, not a claim that a human listened with a screen reader.
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
}

async function layoutMatrix(page: Page, role: Role, surface: string) {
  for (const locale of ['en', 'ar'] as const) {
    await keyboardActivate(page, page.getByRole('button', { name: locale === 'en' ? 'English' : 'العربية', exact: true }));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}/${surface}/${locale}/${viewport.width} horizontal reflow`).toBe(true);
      await expect(page.locator('main h1')).toBeVisible();
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => {
      const seconds = (value: string) => value.split(',').every(duration => parseFloat(duration.trim()) === 0);
      return matchMedia('(prefers-reduced-motion: reduce)').matches && getComputedStyle(document.documentElement).scrollBehavior === 'auto'
        && [...document.querySelectorAll('button, [role="status"]')].every(element => {
          const style = getComputedStyle(element); return seconds(style.transitionDuration) && (style.animationName === 'none' || seconds(style.animationDuration));
        });
    })).toBe(true);
    // At 200% browser zoom, a 1280x900 content area has a 640x450 CSS layout viewport.
    // This checks that exact reflow size; it does not claim an OS/browser zoom gesture.
    await page.setViewportSize({ width: 640, height: 450 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}/${surface}/${locale}/200%-reflow`).toBe(true);
    await keyboardActivate(page, page.getByRole('button', { name: locale === 'en' ? 'English' : 'العربية', exact: true }));
    await page.setViewportSize(locale === 'en' ? viewports[0] : viewports[4]);
    await settled(page); await semanticSmoke(page);
    await page.screenshot({ path: resolve(evidence, `${role}-${surface}-${locale}-${locale === 'en' ? 'desktop' : 'mobile'}.png`), fullPage: false });
  }
}

for (const role of roles) {
  test(`${role} major surfaces support keyboard, bilingual RTL, all required viewports, 200% reflow and accessibility semantics`, async ({ page }) => {
    test.setTimeout(240_000); await mkdir(evidence, { recursive: true });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await signIn(page, role); await page.emulateMedia({ reducedMotion: 'reduce' });
    const navigation = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
    const railNames = await navigation.locator('button[data-workspace-destination]').allTextContents();
    const names = [...railNames, 'Access settings', 'Account'];
    expect(names).toContain('Learning'); expect(names).toContain('Academic'); expect(names).toContain('Progress');
    if (role === 'parent') { expect(names).not.toContain('Development'); expect(names).not.toContain('Next steps'); expect(names).not.toContain('Curriculum context'); }
    if (role === 'student') expect(names).not.toContain('Curriculum context');
    for (let index = 0; index < names.length; index++) {
      await keyboardActivate(page, page.getByRole('button', { name: 'English', exact: true }));
      const target = await trailWorkspaceAction(page, names[index].trim());
      const expectedView = await target.getAttribute('data-workspace-destination');
      const profileView = names[index].trim() === 'Account' ? 'account' : names[index].trim() === 'Access settings' ? 'access' : null;
      if (!profileView) expect(expectedView, 'Every current product workspace choice identifies its exact destination').not.toBeNull();
      const developmentPeople = names[index].trim() === 'Development' && role !== 'student' && role !== 'parent' ? page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/people' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; }) : null;
      await keyboardActivate(page, target);
      if (expectedView) {
        await expect(page).toHaveURL(url => expectedView === 'overview' ? url.searchParams.get('view') === null : url.searchParams.get('view') === expectedView);
        const workspace = page.locator('.workspace-chrome');
        const current = expectedView === 'overview' ? workspace.locator(`.workspace-chrome__navigation [data-workspace-destination="${expectedView}"][aria-current="page"]`) : workspace.locator(`.workspace-chrome__switcher [data-workspace-destination="${expectedView}"][aria-current="page"]`);
        await expect(current).toHaveCount(1);
        if (expectedView !== 'overview') await expect(workspace.locator('.workspace-chrome__workspace-choice > span')).toHaveText(names[index].trim());
      } else await expect(page).toHaveURL(url => url.searchParams.get('view') === profileView);
      await expect(page.locator('main h1')).toBeFocused(); await settled(page);
      const surface = names[index].trim().toLowerCase().replace(/[^a-z]+/g, '-');
      // Staff/parent progress must select a real permitted learner before reviewing evidence.
      if (['Progress', 'Development'].includes(names[index].trim()) && role !== 'student' && role !== 'parent') {
        const learner = names[index].trim() === 'Progress' ? page.locator('#learner-selection') : page.locator('.development-workspace').getByRole('combobox', { name: 'Learner', exact: true });
        if (names[index].trim() === 'Development') {
          const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
          const first = await developmentPeople!; expect(first.status()).toBe(200); expect(await first.finished()).toBeNull();
          let cursor = (await first.json() as { items: unknown[]; nextCursor: string | null }).nextCursor; const seen = new Set<string>();
          expect(cursor === null || uuid.test(cursor)).toBe(true);
          const field = learner.locator('..'), more = field.getByRole('button', { name: 'Load more: Learner', exact: true });
          for (let continuation = 0; cursor && continuation < 30; continuation++) {
            expect(seen.has(cursor)).toBe(false); seen.add(cursor); const expectedCursor = cursor; await expect(more).toHaveCount(1);
            const response = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/people' && url.searchParams.get('cursor') === expectedCursor && row.request().method() === 'GET'; });
            await expect(more).toBeEnabled(); await more.click(); const current = await response; expect(current.status()).toBe(200); expect(await current.finished()).toBeNull();
            const body = await current.json() as { items: { userId: string; role: string }[]; nextCursor: string | null }; expect(body.items.length).toBeLessThanOrEqual(100);
            expect(Array.isArray(body.items)).toBe(true); expect(body.nextCursor === null || uuid.test(body.nextCursor)).toBe(true); expect(body.nextCursor).not.toBe(expectedCursor);
            for (const item of body.items) expect(item.userId).toMatch(uuid); expect(new Set(body.items.map(item => item.userId)).size).toBe(body.items.length);
            for (const item of body.items.filter(item => item.role === 'student')) await expect(learner.locator(`option[value="${item.userId}"]`)).toBeAttached();
            cursor = body.nextCursor;
            await expect(field.getByRole('button', { name: 'Loading more…: Learner', exact: true })).toHaveCount(0);
          }
          expect(cursor).toBeNull(); await expect(more).toHaveCount(0); await settled(page);
        }
        const option = learner.locator('option[value]:not([value=""]):not([disabled])').first();
        await expect(option).toBeAttached(); await expect(learner).toBeEnabled(); await learner.focus(); await expect(learner).toBeFocused();
        if (names[index].trim() === 'Development') { await learner.press('Home'); await learner.press('ArrowDown'); await learner.press('Tab'); }
        else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
        await expect(learner).toHaveValue((await option.getAttribute('value'))!); await settled(page);
      }
      if (names[index].trim() === 'Progress' && ['admin', 'coordinator', 'teacher'].includes(role)) {
        const classSelector = page.locator('#summary-class'); await classSelector.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        await expect(classSelector).not.toHaveValue(''); await settled(page);
      }
      await layoutMatrix(page, role, surface);
      await keyboardActivate(page, page.getByRole('button', { name: 'English', exact: true }));
      const tabs = page.locator('[data-workspace-sections] .learning-tabs').getByRole('button'); const tabNames = await tabs.allTextContents();
      for (const tabName of tabNames) {
        await keyboardActivate(page, page.getByRole('button', { name: 'English', exact: true }));
        const tab = page.locator('[data-workspace-sections] .learning-tabs').getByRole('button', { name: tabName.trim(), exact: true });
        await keyboardActivate(page, tab); await expect(tab).toHaveAttribute('aria-pressed', 'true'); await settled(page);
        await layoutMatrix(page, role, `${surface}-${tabName.trim().toLowerCase().replace(/[^a-z]+/g, '-')}`);
      }
    }
    expect(errors).toEqual([]);
  });
}

test('protected content clears offline and only returns after current membership revalidation', async ({ page, context }) => {
  const displayName = await signIn(page, 'student'); await mkdir(evidence, { recursive: true });
  await context.setOffline(true); await expect(page.getByRole('heading', { name: 'You are offline', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0); await expect(page.getByText(displayName, { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeDisabled();
  await keyboardActivate(page, page.getByRole('button', { name: 'العربية', exact: true })); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: resolve(evidence, 'student-offline-ar.png') });
  const verified = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/me' && response.request().method() === 'GET');
  await context.setOffline(false); expect((await verified).ok()).toBe(true);
  await expectTrailWorkspace(page, 'student'); await expect(page.locator('.student-trail__intro h1')).toHaveText(`مرحبًا، ${displayName}!`); await expect(page.locator('.student-home .student-trail__task h2')).not.toBeEmpty(); await expect(page.locator('.student-home .student-trail__goal h2')).toHaveText('هدفي في التعلّم');
});

test('sign-in keyboard controls, validation errors and bilingual labels remain associated at narrow reflow', async ({ page }) => {
  await page.goto('/'); await keyboardActivate(page, page.getByRole('button', { name: 'English', exact: true }));
  const email = page.getByLabel('School email', { exact: true }); const password = page.getByLabel('Password', { exact: true });
  await keyboardActivate(page, page.getByRole('button', { name: 'Sign in', exact: true }));
  await expect(email).toBeFocused(); expect(await email.evaluate(element => (element as HTMLInputElement).validity.valueMissing)).toBe(true);
  await keyboardActivate(page, page.getByRole('button', { name: 'Show password', exact: true })); await expect(password).toHaveAttribute('type', 'text');
  await keyboardActivate(page, page.getByRole('button', { name: 'Hide password', exact: true })); await expect(password).toHaveAttribute('type', 'password');
  await email.fill('unregistered-synthetic@cuevo.test'); await password.fill('synthetic-invalid-password');
  await keyboardActivate(page, page.getByRole('button', { name: 'Sign in', exact: true }));
  await expect(page.locator('#sign-in-error')).toHaveAttribute('role', 'alert');
  await expect(email).toHaveAttribute('aria-invalid', 'true'); await expect(email).toHaveAttribute('aria-describedby', 'sign-in-error');
  await expect(password).toHaveAttribute('aria-invalid', 'true'); await expect(password).toHaveAttribute('aria-describedby', 'sign-in-error');
  await expect(password).toHaveValue('');
  await page.setViewportSize({ width: 640, height: 450 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await keyboardActivate(page, page.getByRole('button', { name: 'العربية', exact: true })); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('البريد الإلكتروني المدرسي', { exact: true })).toBeVisible(); await expect(page.getByLabel('كلمة المرور', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});

test('command form refusal is associated with named fields and supports keyboard cancellation', async ({ page }) => {
  await signIn(page, 'admin');
  await keyboardActivate(page, await trailWorkspaceAction(page, 'School')); await settled(page);
  await keyboardActivate(page, page.getByRole('button', { name: 'Create academic year', exact: true }));
  const form = page.getByRole('region', { name: 'Create academic year', exact: true });
  await form.getByLabel('Name', { exact: true }).fill('Synthetic refusal case');
  await form.getByLabel('Starts on (YYYY-MM-DD)', { exact: true }).fill('2027-09-01');
  await form.getByLabel('Ends on (YYYY-MM-DD)', { exact: true }).fill('2028-07-01');
  await page.route('**/v1/school/years', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_INPUT', requestId: 'presentation-form-400' }), headers: { 'access-control-allow-origin': '*' } }));
  await keyboardActivate(page, form.getByRole('button', { name: 'Save', exact: true }));
  const error = form.getByRole('alert'); await expect(error).toBeVisible();
  const errorId = await error.getAttribute('id'); expect(errorId).toBeTruthy();
  await expect(form.getByLabel('Name', { exact: true })).toHaveAttribute('aria-describedby', errorId!);
  await expect(form.getByLabel('Starts on (YYYY-MM-DD)', { exact: true })).toHaveAttribute('aria-describedby', errorId!);
  await keyboardActivate(page, form.getByRole('button', { name: 'Cancel', exact: true })); await expect(form).toHaveCount(0);
  await page.unroute('**/v1/school/years');
});

for (const state of [{ status: 403, title: 'School access is unavailable for this account' }, { status: 401, title: 'Please sign in again' }, { status: 503, title: 'Your workspace is temporarily unavailable' }]) {
  test(`membership ${state.status} presentation removes protected content and keyboard retry restores verified access`, async ({ page }) => {
    const displayName = await signIn(page, 'parent'); await mkdir(evidence, { recursive: true });
    // Fault injection checks presentation/recovery only. API/SQL suites prove actual authorization denial.
    await page.route('**/v1/me', route => route.fulfill({ status: state.status, contentType: 'application/json', body: JSON.stringify({ code: 'TEST_MEMBERSHIP_FAILURE', requestId: `presentation-${state.status}` }), headers: { 'access-control-allow-origin': '*' } }));
    await keyboardActivate(page, await trailWorkspaceAction(page, 'Access settings'));
    await keyboardActivate(page, page.getByRole('button', { name: 'Refresh access', exact: true }));
    await expect(page.getByRole('heading', { name: state.title, exact: true })).toBeVisible(); await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByText(displayName, { exact: false })).toHaveCount(0); await expect(page.getByRole('status')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: resolve(evidence, `parent-membership-${state.status}-en.png`) }); await page.unroute('**/v1/me');
    const verified = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/me' && response.request().method() === 'GET');
    await keyboardActivate(page, page.getByRole('button', { name: 'Try again', exact: true })); expect((await verified).ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Your school access', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current membership', exact: true })).toContainText('Parent / guardian');
    await expect(page.locator('.workspace-chrome__person > button strong')).toHaveText(displayName);
  });
}
