import { expectTrailWorkspace, trailWorkspaceAction } from './trail-workspace';
import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

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
  await expect(target).toHaveCount(1); await expect(target).toBeVisible(); await expect(target).toBeEnabled();
  const sources = await target.elementHandles();
  if (sources.length !== 1) {
    await Promise.all(sources.map(source => source.dispose()));
    throw new Error('Named keyboard control is no longer unique and current.');
  }
  const source = sources[0];
  try {
    const panel = await source.evaluateHandle(element => element instanceof Element ? element.closest('[popover]') : null);
    try {
      const inPopover = await panel.evaluate(element => element !== null);
      const sample = async () => {
        const state = await target.evaluateAll((elements, original) => {
          const element = elements[0];
          if (elements.length !== 1 || element !== original || !element.isConnected) throw new Error('Named keyboard control is no longer unique and current.');
          const popup = element.closest('[popover]');
          const style = getComputedStyle(element), rect = element.getBoundingClientRect();
          if (element.matches(':disabled') || style.display === 'none' || style.visibility !== 'visible' || !element.getClientRects().length || popup && !popup.matches(':popover-open')) throw new Error('Named keyboard control is no longer available.');
          return { focused: element === document.activeElement, outline: element.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2
            && style.outlineStyle !== 'none' && rect.left >= -1 && rect.right <= innerWidth + 1
            && rect.top >= -1 && rect.bottom <= innerHeight + 1 };
        }, source);
        if (inPopover && !await panel.evaluate(element => !!element?.isConnected && element.matches(':popover-open') && element.contains(document.activeElement))) throw new Error('Native popover keyboard scope was lost.');
        return state;
      };
      if (inPopover) {
        // The native toggle focuses this panel's first control. Restarting at
        // the global skip link can scroll outside it and legitimately dismiss it.
        await expect.poll(() => panel.evaluate(element => {
          if (!element?.isConnected || !element.matches(':popover-open')) throw new Error('Native popover keyboard scope was lost.');
          return element.contains(document.activeElement);
        })).toBe(true);
      } else {
        // Ordinary controls retain the full real keyboard tab-order traversal.
        await page.getByRole('link', { name: skipNames }).focus();
      }
      for (let attempt = 0; attempt < 250; attempt++) {
        const state = await sample();
        if (state.focused) {
          await expect(target).toBeFocused();
          expect(state.outline, 'Keyboard focus must have a visible outline inside the current viewport').toBe(true);
          await page.keyboard.press('Enter'); return;
        }
        await page.keyboard.press('Tab');
      }
      throw new Error('Named control was not reachable through the current keyboard tab order.');
    } finally {
      await panel.dispose();
    }
  } finally {
    await source.dispose();
  }
}

async function keyboardWorkspaceAction(page: Page, label: string): Promise<Locator> {
  const profile = ['Access settings', 'Account'].includes(label);
  const focused = await page.locator('.workspace-chrome').getAttribute('data-navigation-mode') === 'focused';
  if (!profile && !focused) return page.locator('.workspace-chrome__navigation').getByRole('button', { name: label, exact: true });
  const trigger = page.locator(profile ? '.workspace-chrome__person > button' : '.workspace-chrome__workspace-choice');
  const panel = page.locator(profile ? '.workspace-chrome__profile' : '.workspace-chrome__switcher');
  if (!await panel.isVisible()) await keyboardActivate(page, trigger);
  await expect(panel).toBeVisible();
  return panel.getByRole('button', { name: label, exact: true });
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

async function completeStaffPeople(page: Page, learner: Locator, first: import('@playwright/test').Response, development: boolean) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const read = async (response: import('@playwright/test').Response) => {
    expect(response.status()).toBe(200); expect(await response.finished()).toBeNull();
    const body = await response.json() as { items: { userId: string; role: string }[]; nextCursor: string | null };
    expect(Array.isArray(body.items)).toBe(true); expect(body.items.length).toBeLessThanOrEqual(100); expect(body.nextCursor === null || uuid.test(body.nextCursor)).toBe(true);
    for (const item of body.items) expect(item.userId).toMatch(uuid); expect(new Set(body.items.map(item => item.userId)).size).toBe(body.items.length);
    for (const item of body.items.filter(item => item.role === 'student')) await expect(learner.locator(`option[value="${item.userId}"]`)).toBeAttached();
    return body;
  };
  let cursor = (await read(first)).nextCursor; const seen = new Set<string>();
  const field = learner.locator('..'), more = field.getByRole('button', { name: development ? 'Load more: Learner' : 'Load more', exact: true });
  for (let continuation = 0; cursor && continuation < 30; continuation++) {
    expect(seen.has(cursor)).toBe(false); seen.add(cursor); const expectedCursor = cursor; await expect(more).toHaveCount(1);
    const response = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/people' && url.searchParams.get('cursor') === expectedCursor && row.request().method() === 'GET'; });
    await expect(more).toBeEnabled(); await more.click(); const body = await read(await response);
    expect(body.nextCursor).not.toBe(expectedCursor); cursor = body.nextCursor;
    await expect(field.getByRole('button', { name: development ? 'Loading more…: Learner' : 'Loading more…', exact: true })).toHaveCount(0);
  }
  expect(cursor).toBeNull(); await expect(more).toHaveCount(0); await settled(page);
}

async function chooseCurrentClassByKeyboard(page:Page){
 const back=page.getByRole('button',{name:'Back to learners',exact:true});
 if(await back.count()){await keyboardActivate(page,back);await expect(page.locator('.progress-review-layout')).toHaveAttribute('data-selected','false');await settled(page);}
 const select=page.locator('#summary-class'),field=select.locator('..');
 await expect(select).toBeVisible();
 await expect(page.locator('.class-summary-header [data-state="loading"]')).toHaveCount(0);
 const more=field.getByRole('button',{name:'Load more',exact:true});
 for(let part=0;await more.count()&&part<30;part++){
  await expect(more).toBeEnabled();const cursor=await more.getAttribute('data-page-cursor');expect(cursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  const received=page.waitForResponse(response=>{const url=new URL(response.url());return response.request().method()==='GET'&&url.origin==='http://localhost:4000'&&url.pathname==='/v1/classes'&&url.searchParams.get('cursor')===cursor});
  await more.click();const response=await received;expect(response.ok()).toBe(true);expect(await response.finished()).toBeNull();const current=await response.json() as {items:{id:string}[];nextCursor:string|null};expect(Array.isArray(current.items)&&current.items.length<=100).toBe(true);const ids=current.items.map(row=>row.id);expect(new Set(ids).size).toBe(ids.length);for(const id of ids){expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);await expect(select.locator(`option[value="${id}"]`)).toBeAttached();}if(current.nextCursor===null)await expect(more).toHaveCount(0);else{expect(current.nextCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);expect(current.nextCursor).not.toBe(cursor);await expect(more).toHaveAttribute('data-page-cursor',current.nextCursor);}
 }
 await expect(more).toHaveCount(0);await expect(select).toBeEnabled();
 let expected='';
 // Membership revalidation can disable the current source after an earlier
 // enabled check. Read its current option and acquire focus in one DOM turn;
 // an enabled control that refuses focus still fails immediately.
 await expect.poll(async()=>{
  const current=await select.evaluate(element=>{
   const control=element as HTMLSelectElement;if(control.disabled)return null;
   const option=control.querySelector<HTMLOptionElement>('option[value]:not([value=""]):not([disabled])');if(!option)return null;
   control.focus();if(document.activeElement!==control)throw Error('Current enabled class selector did not accept focus.');
   return{value:option.value,label:option.textContent};
  });
  if(!current)return false;expect(current.label?.trim()).toBeTruthy();expected=current.value;return true;
 }).toBe(true);
 await expect(select).toBeFocused();await select.press('Home');await select.press('ArrowDown');await select.press('Tab');await expect(select).toHaveValue(expected);await settled(page);
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
      const target = await keyboardWorkspaceAction(page, names[index].trim());
      const expectedView = await target.getAttribute('data-workspace-destination');
      const profileView = names[index].trim() === 'Account' ? 'account' : names[index].trim() === 'Access settings' ? 'access' : null;
      if (!profileView) expect(expectedView, 'Every current product workspace choice identifies its exact destination').not.toBeNull();
      const staffPeople = ['Progress', 'Development'].includes(names[index].trim()) && role !== 'student' && role !== 'parent' ? page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/people' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; }) : null;
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
      if (names[index].trim() === 'Progress' && ['admin', 'coordinator', 'teacher'].includes(role)) {
        await chooseCurrentClassByKeyboard(page);
      }
      // Staff/parent progress must select a real permitted learner before reviewing evidence.
      if (['Progress', 'Development'].includes(names[index].trim()) && role !== 'student' && role !== 'parent') {
        const learner = names[index].trim() === 'Progress' ? page.locator('#learner-selection') : page.locator('.development-learner-picker select');
        await completeStaffPeople(page, learner, await staffPeople!, names[index].trim() === 'Development');
        const option = learner.locator('option[value]:not([value=""]):not([disabled])').first();
        await expect(option).toBeAttached(); await expect(learner).toBeEnabled(); await learner.focus(); await expect(learner).toBeFocused();
        const learnerValue = (await option.getAttribute('value'))!;
        if (names[index].trim() === 'Development') { await learner.press('Home'); await learner.press('ArrowDown'); await learner.press('Tab'); }
        else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
        await expect(learner).toHaveValue(learnerValue); await settled(page);
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
  await keyboardActivate(page, await keyboardWorkspaceAction(page, 'School')); await settled(page);
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
    await keyboardActivate(page, await keyboardWorkspaceAction(page, 'Access settings'));
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

test('adapter: staff learner paging uses current query owners and captures the native selection before mobile collapse', async ({ page }) => {
  const root = resolve(import.meta.dirname, '../..');
  const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{usePaginatedLearningQuery}from'./apps/web/shared/hooks/use-paginated-query';import{parsePersonChoice}from'./apps/web/shared/api/people';import{LoadMore}from'./apps/web/shared/components/load-more';import{progressLearnerChoices}from'./apps/web/features/progress/model';import{developmentLearnerChoices}from'./apps/web/features/development/model';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
const drafts=new FormDrafts();globalThis.staffPeopleApp={apiUrl:'http://localhost:4000',accessToken:'synthetic',online:true,status:'ready',accessGeneration:1,membership:{schoolId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001',role:'admin'},formDrafts:drafts};
const parseResponse=(_path,value,parse)=>parse(value),request=async path=>{const response=await fetch('http://localhost:4000'+path);return response.json()};globalThis.staffPeopleApi={request,parseResponse,t:{loadMore:'Load more',loadingMore:'Loading more…'}};
function Harness(){const[mode,setMode]=useState('Progress'),[selected,setSelected]=useState('');const people=usePaginatedLearningQuery('/v1/people?limit=100',parsePersonChoice,mode==='Progress'?0:1),complete=people.loaded&&!people.loading&&!people.loadingMore&&!people.error&&!people.moreError&&!people.nextCursor;const choices=mode==='Progress'?progressLearnerChoices(people.data,'Unavailable',complete):developmentLearnerChoices(people.data,'Unavailable');return<main><button onClick={()=>{setSelected('');setMode('Development')}}>Development</button><div className='field' style={{display:selected?'none':'block'}}><label htmlFor='learner'>Learner</label><select id='learner' disabled={mode==='Progress'&&!complete} value={selected} onChange={event=>setSelected(event.target.value)}><option value=''>Choose learner</option>{choices.map(choice=><option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select><LoadMore query={people} label={mode==='Development'?'Learner':undefined}/></div>{selected?<h2>Current selected learner</h2>:null}</main>}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-staff-session-only', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.staffPeopleApp}' }));
    bundler.onLoad({ filter: /shared[\\/]hooks[\\/]use-api\.ts$/ }, () => ({ loader: 'js', contents: 'export function useApi(){return globalThis.staffPeopleApi}' }));
    bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/svg+xml;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const firstId = '20000000-0000-4000-8000-000000000012', nextId = '20000000-0000-4000-8000-000000000013', cursor = '20000000-0000-4000-8000-000000000100';
  await page.route('http://localhost:4000/v1/people**', async route => {
    const next = new URL(route.request().url()).searchParams.get('cursor'); expect(next === null || next === cursor).toBe(true);
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ items: [{ userId: next ? nextId : firstId, displayName: next ? 'Sara' : 'Lina', role: 'student', classLabels: ['Cedar · Year 1 · 2026–2027'] }], nextCursor: next ? null : cursor }) });
  });
  await page.setContent('<div id="root"></div>');
  const first = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/people'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const learner = page.locator('#learner'); await completeStaffPeople(page, learner, await first, false);
  const selected = (await learner.locator('option[value]:not([value=""]):not([disabled])').first().getAttribute('value'))!;
  await learner.focus(); await learner.press('Home'); await learner.press('ArrowDown'); await learner.press('Tab'); await expect(learner).toHaveValue(selected); await expect(learner).toBeHidden();
  const developmentRead = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/people' && !new URL(response.url()).searchParams.has('cursor'));
  await page.getByRole('button', { name: 'Development', exact: true }).click(); await completeStaffPeople(page, learner, await developmentRead, true);
  const developmentValue = (await learner.locator('option[value]:not([value=""]):not([disabled])').first().getAttribute('value'))!;
  await learner.focus(); await learner.press('Home'); await learner.press('ArrowDown'); await learner.press('Tab'); await expect(learner).toHaveValue(developmentValue); await expect(learner).toBeHidden();
});
test('adapter: current ClassLearningSummary source settles its first authorized class before keyboard selection',async({page})=>{
 const root=resolve(import.meta.dirname,'../..');const compiled=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{createContext,useContext}from'react';import{createRoot}from'react-dom/client';import{ClassLearningSummaryPanel}from'./apps/web/features/progress/components/class-learning-summary';import{usePaginatedLearningQuery}from'./apps/web/shared/hooks/use-paginated-query';const C=createContext(null);globalThis.classUC=useContext;globalThis.classC=C;const app={locale:'en',apiUrl:'http://localhost:4000',accessToken:'synthetic',online:true,status:'ready',accessGeneration:1,membership:{schoolId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001',role:'teacher'},formDrafts:{clearRead(){}}};globalThis.classAPI={t:{loadMore:'Load more',loadingMore:'Loading more…'},request:async path=>(await fetch('http://localhost:4000'+path)).json(),parseResponse:(_path,value,parse)=>parse(value)};createRoot(document.getElementById('root')).render(<C.Provider value={app}><main><ClassLearningSummaryPanel refresh={0} onReviewLearner={()=>{}} selectedLearnerId={null} labelContext='current' onLearnerContext={()=>{}}/></main></C.Provider>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.svg':'dataurl'},plugins:[{name:'actual-paging-input',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.classUC(globalThis.classC)}'}));b.onLoad({filter:/shared[\\/]hooks[\\/]use-api\.ts$/},()=>({loader:'js',contents:'export function useApi(){return globalThis.classAPI}export function useApiQuery(path,parse){return{data:path?parse({schoolId:"10000000-0000-4000-8000-000000000001",classId:"30000000-0000-4000-8000-000000000001",generatedAt:"2026-10-05T00:00:00Z",scope:"CURRENT_CLASS_PAGE",coverage:"NOT_ESTABLISHED",observationCoverage:"RECORDED_ONLY",windowStart:null,windowEnd:null,items:[],nextCursor:null}):null,loading:false,error:null}}'}));}}]});
 let release!:()=>void;const held=new Promise<void>(done=>release=done);await page.route('http://localhost:4000/v1/classes**',async route=>{await held;await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({items:[{id:'30000000-0000-4000-8000-000000000001',name:'Year 1 · Cedar',academicYearName:'2026–2027',yearGroupName:'Year 1'}],nextCursor:null})})});
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:compiled.outputFiles[0].text});const select=page.locator('#summary-class');await expect(select).toBeVisible();await select.focus();await select.press('ArrowDown');await select.press('Enter');await expect(select).toHaveValue('');release();
 await chooseCurrentClassByKeyboard(page);await expect(select).toHaveValue('30000000-0000-4000-8000-000000000001');
});

test('adapter: coordinator class keyboard focus waits for the current access generation after an earlier enabled sample',async({page})=>{
 const root=resolve(import.meta.dirname,'../..');
 const compiled=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{ClassLearningSummaryPanel}from'./apps/web/features/progress/components/class-learning-summary';const C=createContext(null);globalThis.classFocusC=C;globalThis.classFocusUC=useContext;globalThis.classFocus={};const base={locale:'en',apiUrl:'http://localhost:4000',accessToken:'synthetic',online:true,status:'ready',membership:{schoolId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000002',role:'coordinator'},formDrafts:{clearRead(){}}};globalThis.classFocusAPI={t:{loadMore:'Load more',loadingMore:'Loading more…'},request:async path=>(await fetch('http://localhost:4000'+path)).json(),parseResponse:(_path,value,parse)=>parse(value)};function H(){const[g,setG]=useState(1);globalThis.classFocus.revalidate=()=>setG(value=>value+1);return<C.Provider value={{...base,accessGeneration:g}}><main><ClassLearningSummaryPanel refresh={0} onReviewLearner={()=>{}} selectedLearnerId={null} labelContext='current' onLearnerContext={()=>{}}/></main></C.Provider>}createRoot(document.getElementById('root')).render(<H/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.svg':'dataurl'},plugins:[{name:'current-class-generation-input',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.classFocusUC(globalThis.classFocusC)}'}));b.onLoad({filter:/shared[\\/]hooks[\\/]use-api\.ts$/},()=>({loader:'js',contents:'export function useApi(){return globalThis.classFocusAPI}export function useApiQuery(path,parse){return{data:path?parse({schoolId:"10000000-0000-4000-8000-000000000001",classId:"30000000-0000-4000-8000-000000000001",generatedAt:"2026-10-06T00:00:00Z",scope:"CURRENT_CLASS_PAGE",coverage:"NOT_ESTABLISHED",observationCoverage:"RECORDED_ONLY",windowStart:null,windowEnd:null,items:[],nextCursor:null}):null,loading:false,error:null}}'}));}}]});
 let requests=0,release!:()=>void;const held=new Promise<void>(done=>release=done);
 await page.route('http://localhost:4000/v1/classes**',async route=>{if(++requests>1)await held;await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({items:[{id:'30000000-0000-4000-8000-000000000001',name:'Cedar',academicYearName:'2026–2027',yearGroupName:'Year 1'}],nextCursor:null})});});
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:compiled.outputFiles[0].text});const select=page.locator('#summary-class');await expect(select).toBeEnabled();
 let changed=false,waitingSamples=0;
 const revalidate=async()=>{if(changed)return;changed=true;await page.evaluate(()=>{(globalThis as unknown as{classFocus:{revalidate:()=>void}}).classFocus.revalidate()});await expect(select).toBeDisabled();};
 const wrapped=new Proxy(page,{get(target,key){if(key==='locator')return(selector:string)=>{const located=target.locator(selector);if(selector!=='#summary-class')return located;return new Proxy(located,{get(control,method){if(method==='focus')return async()=>{await revalidate();await control.focus();release();};if(method==='evaluate')return async(...args:Parameters<Locator['evaluate']>)=>{await revalidate();const result=await control.evaluate(...args);if(result===null){waitingSamples++;release();}return result;};const value=Reflect.get(control,method);return typeof value==='function'?value.bind(control):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 try{await chooseCurrentClassByKeyboard(wrapped);}finally{release();}
 expect(changed).toBe(true);expect(waitingSamples).toBeGreaterThan(0);expect(requests).toBe(2);await expect(select).toHaveValue('30000000-0000-4000-8000-000000000001');
});

test('adapter: mobile staff class selection returns to the current browse plane before learner detail hides it',async({page})=>{
 const root=resolve(import.meta.dirname,'../..'),css=['packages/ui/src/tokens.css','apps/web/app/globals.css','apps/web/features/progress/styles.css'].map(file=>readFileSync(resolve(root,file),'utf8').replace(/@import[^;]+;/g,'')).join('\n');
 const compiled=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{ClassLearningSummaryPanel}from'./apps/web/features/progress/components/class-learning-summary';const C=createContext(null);globalThis.mobileClassC=C;globalThis.mobileClassUC=useContext;globalThis.mobileClass={backs:0,requests:[]};const app={locale:'en',apiUrl:'http://localhost:4000',accessToken:'synthetic',online:true,status:'ready',accessGeneration:1,membership:{schoolId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001',role:'teacher'},formDrafts:{clearRead(){}}};globalThis.mobileClassAPI={t:{loadMore:'Load more',loadingMore:'Loading more…'},request:async path=>{globalThis.mobileClass.requests.push(path);return(await fetch('http://localhost:4000'+path)).json()},parseResponse:(_path,value,parse)=>parse(value)};function H(){const[selected,setSelected]=useState(true);return<C.Provider value={app}><main><div className='progress-review-layout' data-selected={selected}><ClassLearningSummaryPanel refresh={0} onReviewLearner={()=>{}} selectedLearnerId={null} labelContext='current' onLearnerContext={()=>{}}/><div className='progress-review-reading'>{selected?<button className='progress-back-to-learners' onClick={()=>{globalThis.mobileClass.backs++;setSelected(false)}}>Back to learners</button>:null}<button onClick={()=>setSelected(true)}>Open current learner</button></div></div></main></C.Provider>}createRoot(document.getElementById('root')).render(<H/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.svg':'dataurl'},plugins:[{name:'current-mobile-class-inputs',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.mobileClassUC(globalThis.mobileClassC)}'}));b.onLoad({filter:/shared[\\/]hooks[\\/]use-api\.ts$/},()=>({loader:'js',contents:'export function useApi(){return globalThis.mobileClassAPI}export function useApiQuery(path,parse){return{data:path?parse({schoolId:"10000000-0000-4000-8000-000000000001",classId:"30000000-0000-4000-8000-000000000001",generatedAt:"2026-10-05T00:00:00Z",scope:"CURRENT_CLASS_PAGE",coverage:"NOT_ESTABLISHED",observationCoverage:"RECORDED_ONLY",windowStart:null,windowEnd:null,items:[],nextCursor:null}):null,loading:false,error:null}}'}));}}]});
 const errors:string[]=[];page.on('pageerror',()=>errors.push('pageerror'));page.on('console',message=>{if(['warning','error'].includes(message.type()))errors.push(message.type());});
 await page.setViewportSize({width:390,height:844});let release!:()=>void;const held=new Promise<void>(done=>release=done);await page.route('http://localhost:4000/v1/classes**',async route=>{await held;await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({items:[{id:'30000000-0000-4000-8000-000000000001',name:'Year 1 · Cedar',academicYearName:'2026–2027',yearGroupName:'Year 1'}],nextCursor:null})});});
 await page.setContent('<style>'+css+'</style><a href="#root">Skip to main content</a><div id="root"></div>');await page.addScriptTag({content:compiled.outputFiles[0].text});const select=page.locator('#summary-class');await expect(select).toBeHidden();const choose=chooseCurrentClassByKeyboard(page).then(()=>({ok:true as const}),error=>({ok:false as const,error}));try{await expect(select).toBeVisible();await expect(page.locator('.progress-review-layout')).toHaveAttribute('data-selected','false');}finally{release();}const outcome=await choose;if(!outcome.ok)throw outcome.error;await expect(select).toHaveValue('30000000-0000-4000-8000-000000000001');expect(await page.evaluate(()=>(globalThis as unknown as{mobileClass:{backs:number}}).mobileClass.backs)).toBe(1);await keyboardActivate(page,page.getByRole('button',{name:'Open current learner',exact:true}));await expect(select).toBeHidden();expect(errors).toEqual([]);
});

// Controlled actual-owner regression: an oversized current header and deep
// reading make the global skip restart scroll outside an already-open chooser.
// This proves the helper defect, not the unknown original CI closing trigger.
async function mountKeyboardChrome(page: Page, { tallHeader = false, disabledEdges = false } = {}) {
  const root = resolve(import.meta.dirname, '../..');
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/shell/styles.css', 'apps/web/features/shell/workspace-theme.css']
    .map(file => readFileSync(resolve(root, file), 'utf8').replace(/@import[^;]+;/g, '')).join('\n');
  const compiled = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{WorkspaceChrome}from'./apps/web/features/shell/components/workspace-chrome';
const labels={overview:'Overview',school:'School',community:'Community',portfolio:'Portfolio',development:'Development',curriculum:'Curriculum context',restricted:'Restricted records',learning:'Learning',academic:'Academic',progress:'Progress',improvement:'Next steps'},icons={overview:'home',school:'school',community:'community',portfolio:'portfolio',development:'development',curriculum:'curriculum',restricted:'shield',learning:'learning',academic:'assessment',progress:'progress',improvement:'arrow'};
function Harness(){const[view,setView]=useState('progress');function choose(id){history.pushState(null,'','?view='+id);setView(id);requestAnimationFrame(()=>document.querySelector('main h1')?.focus({preventScroll:true}));}const nav=Object.keys(labels).map(id=>({id,label:labels[id],icon:icons[id],disabled:${disabledEdges}&&(id==='overview'||id==='improvement'),onSelect:()=>choose(id)}));return <WorkspaceChrome context={{navigation:nav,selectedId:view,mode:'focused',currentWorkspace:nav.find(item=>item.id===view),navigationLabel:'Workspace navigation',schoolName:'Current reference school',personName:'Current teacher',roleLabel:'Teacher',locale:'en',theme:'light',brand:<a className='brand' href='#'>Cuevo</a>,searchAction:{label:'Search',onClick(){}},languageControl:<div className='language-switch'><button>English</button><button>العربية</button></div>,accountAction:{label:'Account',onClick:()=>choose('account')},settingsAction:{label:'Access settings',onClick:()=>choose('access')}}}><main id='main-content' className='workspace-main' tabIndex={0}><h1 tabIndex={-1}>{view==='improvement'?'Current approved next steps':'Current '+(labels[view]||view)}</h1><div style={{height:2200}}>Current authorized reading context</div><button>Last source control</button></main></WorkspaceChrome>};createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', format: 'iife', plugins: [{ name: 'native-owner-assets', setup(b) {
    b.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const blocked: string[] = [];
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest() && new URL(route.request().url()).origin === 'https://chooser.fixture.invalid') return route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html lang="en"><head><title>Current chooser keyboard regression</title></head><body><a class="skip-link" href="#main-content">Skip to main content</a><div id="root"></div></body></html>' });
    blocked.push(new URL(route.request().url()).origin); return route.abort();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://chooser.fixture.invalid/?view=progress');
  await page.addStyleTag({ content: css + (tallHeader ? '\n.workspace-chrome__header{min-height:1100px!important}' : '') });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await expect(page.locator('.workspace-chrome__workspace-choice')).toBeVisible();
  return blocked;
}

test('adapter: native chooser keyboard traversal keeps its current focus after deep reading', async ({ page }) => {
  const blocked = await mountKeyboardChrome(page, { tallHeader: true });
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);
  const target = await trailWorkspaceAction(page, 'Next steps');
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await expect(page.locator('.workspace-chrome__switcher').getByRole('button', { name: 'Overview', exact: true })).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await keyboardActivate(page, target);
  await expect(page).toHaveURL('https://chooser.fixture.invalid/?view=improvement');
  await expect(page.getByRole('heading', { name: 'Current approved next steps', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(blocked).toEqual([]);
});

test('adapter: keyboard workspace opener admits first and last enabled native choices', async ({ page }) => {
  const blocked = await mountKeyboardChrome(page, { disabledEdges: true });
  const keys: string[] = [];
  await page.exposeFunction('recordOpenerKey', (key: string) => keys.push(key));
  await page.locator('.workspace-chrome__workspace-choice').evaluate(element => element.addEventListener('keydown', event => { void (window as unknown as { recordOpenerKey: (key: string) => Promise<void> }).recordOpenerKey((event as KeyboardEvent).key); }));
  const first = await keyboardWorkspaceAction(page, 'School');
  await expect(first).toBeFocused();
  await expect(page.locator('[data-workspace-destination="overview"]')).toBeDisabled();
  await keyboardActivate(page, first); await expect(page).toHaveURL('https://chooser.fixture.invalid/?view=school');
  const last = await keyboardWorkspaceAction(page, 'Progress');
  await expect(page.locator('[data-workspace-destination="improvement"]')).toBeDisabled();
  await keyboardActivate(page, last); await expect(page).toHaveURL('https://chooser.fixture.invalid/?view=progress');
  await expect(page.getByRole('heading', { name: 'Current Progress', exact: true })).toBeFocused();
  expect(keys.filter(key => key === 'Enter')).toHaveLength(2); expect(blocked).toEqual([]);
});

test('adapter: profile destinations and ordinary controls retain real keyboard entry', async ({ page }) => {
  const blocked = await mountKeyboardChrome(page);
  const seen: string[] = [];
  await page.exposeFunction('recordKeyboardFocus', (name: string) => seen.push(name));
  await page.evaluate(() => document.addEventListener('focusin', event => { void (window as unknown as { recordKeyboardFocus: (name: string) => Promise<void> }).recordKeyboardFocus((event.target as HTMLElement).textContent?.trim() ?? ''); }));
  await keyboardActivate(page, page.getByRole('button', { name: 'English', exact: true }));
  expect(seen).toContain('Skip to main content'); expect(seen).toContain('English');
  await keyboardActivate(page, await keyboardWorkspaceAction(page, 'Account'));
  await expect(page).toHaveURL('https://chooser.fixture.invalid/?view=account');
  await keyboardActivate(page, await keyboardWorkspaceAction(page, 'Access settings'));
  await expect(page).toHaveURL('https://chooser.fixture.invalid/?view=access');
  await expect(page.getByRole('heading', { name: 'Current access', exact: true })).toBeFocused();
  expect(blocked).toEqual([]);
});

for (const change of ['closed', 'removed', 'replaced', 'ambiguous', 'disabled'] as const) test(`adapter: native keyboard traversal refuses a ${change} current choice immediately`, async ({ page }) => {
  const blocked = await mountKeyboardChrome(page);
  const target = await keyboardWorkspaceAction(page, 'Next steps');
  await expect(page.locator('.workspace-chrome__switcher').getByRole('button', { name: 'Overview', exact: true })).toBeFocused();
  await page.evaluate(change => document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const panel = document.querySelector<HTMLElement>('.workspace-chrome__switcher')!;
    const target = panel.querySelector<HTMLButtonElement>('[data-workspace-destination="improvement"]')!;
    if (change === 'closed') panel.hidePopover();
    else if (change === 'removed') target.remove();
    else if (change === 'replaced') target.replaceWith(target.cloneNode(true));
    else if (change === 'ambiguous') target.after(target.cloneNode(true));
    else target.disabled = true;
  }, { once: true }), change);
  const started = performance.now();
  await expect(keyboardActivate(page, target)).rejects.toThrow(/Named keyboard control|Native popover keyboard scope/);
  expect(performance.now() - started).toBeLessThan(2_000);
  await expect(page).toHaveURL('https://chooser.fixture.invalid/?view=progress');
  if (change === 'closed') await expect(page.locator('.workspace-chrome__switcher')).toBeHidden();
  expect(blocked).toEqual([]);
});
