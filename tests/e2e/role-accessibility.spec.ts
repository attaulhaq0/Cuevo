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
 await expect.poll(()=>select.locator('option[value]:not([value=""]):not([disabled])').count()).toBeGreaterThan(0);
 const option=select.locator('option[value]:not([value=""]):not([disabled])').first(),expected=await option.getAttribute('value');expect((await option.textContent())?.trim()).toBeTruthy();
 await select.focus();await expect(select).toBeFocused();await select.press('Home');await select.press('ArrowDown');await select.press('Tab');await expect(select).toHaveValue(expected!);await settled(page);
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
      if (names[index].trim() === 'Progress' && ['admin', 'coordinator', 'teacher'].includes(role)) {
        await chooseCurrentClassByKeyboard(page);
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
test('current ClassLearningSummary source settles its first authorized class before keyboard selection',async({page})=>{
 const root=resolve(import.meta.dirname,'../..');const compiled=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{createContext,useContext}from'react';import{createRoot}from'react-dom/client';import{ClassLearningSummaryPanel}from'./apps/web/features/progress/components/class-learning-summary';import{usePaginatedLearningQuery}from'./apps/web/shared/hooks/use-paginated-query';const C=createContext(null);globalThis.classUC=useContext;globalThis.classC=C;const app={locale:'en',apiUrl:'http://localhost:4000',accessToken:'synthetic',online:true,status:'ready',accessGeneration:1,membership:{schoolId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001',role:'teacher'},formDrafts:{clearRead(){}}};globalThis.classAPI={t:{loadMore:'Load more',loadingMore:'Loading more…'},request:async path=>(await fetch('http://localhost:4000'+path)).json(),parseResponse:(_path,value,parse)=>parse(value)};createRoot(document.getElementById('root')).render(<C.Provider value={app}><main><ClassLearningSummaryPanel refresh={0} onReviewLearner={()=>{}} selectedLearnerId={null} labelContext='current' onLearnerContext={()=>{}}/></main></C.Provider>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.svg':'dataurl'},plugins:[{name:'actual-paging-input',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.classUC(globalThis.classC)}'}));b.onLoad({filter:/shared[\\/]hooks[\\/]use-api\.ts$/},()=>({loader:'js',contents:'export function useApi(){return globalThis.classAPI}export function useApiQuery(path,parse){return{data:path?parse({schoolId:"10000000-0000-4000-8000-000000000001",classId:"30000000-0000-4000-8000-000000000001",generatedAt:"2026-10-05T00:00:00Z",scope:"CURRENT_CLASS_PAGE",coverage:"NOT_ESTABLISHED",observationCoverage:"RECORDED_ONLY",windowStart:null,windowEnd:null,items:[],nextCursor:null}):null,loading:false,error:null}}'}));}}]});
 let release!:()=>void;const held=new Promise<void>(done=>release=done);await page.route('http://localhost:4000/v1/classes**',async route=>{await held;await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({items:[{id:'30000000-0000-4000-8000-000000000001',name:'Year 1 · Cedar',academicYearName:'2026–2027',yearGroupName:'Year 1'}],nextCursor:null})})});
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:compiled.outputFiles[0].text});const select=page.locator('#summary-class');await expect(select).toBeVisible();await select.focus();await select.press('ArrowDown');await select.press('Enter');await expect(select).toHaveValue('');release();
 await chooseCurrentClassByKeyboard(page);await expect(select).toHaveValue('30000000-0000-4000-8000-000000000001');
});
