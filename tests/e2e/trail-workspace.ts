import { expect, type Locator, type Page } from '@playwright/test';

export type TrailRole = 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent';
const roles: Record<TrailRole, readonly [string, string]> = {
  admin: ['Administrator', 'مسؤول المدرسة'], coordinator: ['Coordinator', 'المنسّق'],
  teacher: ['Teacher', 'المعلّم'], student: ['Student', 'الطالب'], parent: ['Parent / guardian', 'وليّ الأمر'],
};

/** Assert the admitted current workspace's actual chrome and human identity. */
export async function expectTrailWorkspace(page: Page, role?: string): Promise<void> {
  const workspace = page.locator('.workspace-chrome');
  await expect(workspace).toHaveCount(1); await expect(workspace).toBeVisible();
  const header = workspace.locator('.workspace-chrome__header');
  await expect(header).toBeVisible();
  await expect(header.locator('.workspace-chrome__school bdi')).not.toBeEmpty();
  await expect(header.locator('.workspace-chrome__school bdi')).not.toHaveText(/not available|غير متاحة/);
  await expect(header.locator('.workspace-chrome__person > button strong')).not.toBeEmpty();
  await expect(header.locator('.workspace-chrome__person > button strong')).not.toHaveText(/not available|غير متاحة/);
  const currentRole = header.locator('.workspace-chrome__person > button small');
  await expect(currentRole).not.toBeEmpty();
  await expect(currentRole).not.toHaveText(/not available|غير متاح/);
  await expect(currentRole).toHaveText(/^(Administrator|Coordinator|Teacher|Student|Parent \/ guardian|مسؤول المدرسة|المنسّق|المعلّم|الطالب|وليّ الأمر)$/);
  if (role) {
    if (!Object.hasOwn(roles, role)) throw new Error('A known expected test role is required.');
    const [en, ar] = roles[role as TrailRole];
    await expect(currentRole).toHaveText((await workspace.getAttribute('lang')) === 'ar' ? ar : en);
  }
  const mode = await workspace.getAttribute('data-navigation-mode');
  if (mode === 'home') {
    const navigation = workspace.locator('.workspace-chrome__navigation');
    await expect(navigation).toBeVisible();
    await expect(workspace.locator('.workspace-chrome__focused-navigation')).toHaveCount(0);
    await expect(navigation.locator('button[data-workspace-destination][aria-current="page"]')).toHaveCount(1);
  } else {
    expect(mode, 'Current Chrome must declare Home or focused navigation').toBe('focused');
    const navigation = workspace.locator('.workspace-chrome__focused-navigation');
    await expect(navigation).toBeVisible();
    await expect(workspace.locator('.workspace-chrome__navigation')).toHaveCount(0);
    const trigger = navigation.locator('.workspace-chrome__workspace-choice');
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeEnabled();
    await expect(navigation.locator('.workspace-chrome__back')).toBeVisible();
    const current = navigation.locator('.workspace-chrome__switcher button[data-workspace-destination][aria-current="page"]');
    if (await current.count()) {
      await expect(current).toHaveCount(1);
      await expect(current).toBeEnabled();
      await expect(trigger.locator('span')).toHaveText((await current.locator('span').textContent())!);
    } else {
      // Account/Access are Profile destinations, intentionally outside this
      // product-workspace chooser; their exact URL/context still must agree.
      const view = new URL(page.url()).searchParams.get('view');
      expect(['account', 'access']).toContain(view);
      const locale = await workspace.getAttribute('lang');
      const title = view === 'account' ? (locale === 'ar' ? 'الحساب' : 'Account') : (locale === 'ar' ? 'تفاصيل الوصول' : 'Access details');
      await expect(trigger.locator('span')).toHaveText(title);
    }
  }
  const main = workspace.getByRole('main');
  await expect(main).toHaveCount(1); await expect(main).toBeVisible();
  await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(main.getByRole('heading', { level: 1 })).not.toBeEmpty();
  await expect(page.locator('.auth-form')).toHaveCount(0);
}

/** Profile destinations are reached through the same visible popover as customers. */
async function openVisibleTrailProfile(page: Page): Promise<void> {
  const trigger = page.locator('.workspace-chrome__person > button');
  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(page.locator('.workspace-chrome__profile')).toBeVisible();
}
export async function trailWorkspaceAction(page: Page, label: string): Promise<Locator> {
  if (['Access details', 'Access settings', 'تفاصيل الوصول', 'إعدادات الوصول', 'Account', 'الحساب'].includes(label)) {
    await openVisibleTrailProfile(page);
    const current = label === 'Access details' ? 'Access settings' : label === 'تفاصيل الوصول' ? 'إعدادات الوصول' : label;
    return page.locator('.workspace-chrome__profile').getByRole('button', { name: current, exact: true });
  }
  if (await page.locator('.workspace-chrome').getAttribute('data-navigation-mode') === 'focused') {
    const trigger = page.locator('.workspace-chrome__workspace-choice');
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(trigger).toBeVisible(); await expect(trigger).toBeEnabled();
    const chooser = page.locator('.workspace-chrome__switcher');
    // Home replaces the focused popover DOM. Its former toggle state can
    // outlive that node, so open the current native surface when it is closed.
    if (!await chooser.isVisible()) await trigger.click();
    await expect(chooser).toBeVisible();
    return chooser.getByRole('button', { name: label, exact: true });
  }
  return page.locator('.workspace-chrome__navigation').getByRole('button', { name: label, exact: true });
}
export async function openTrailWorkspace(page: Page, label: string): Promise<void> {
  const action = await trailWorkspaceAction(page, label); await expect(action).toBeVisible(); await expect(action).toBeEnabled(); await action.click();
}
export async function signOutTrailWorkspace(page: Page): Promise<void> {
  await openVisibleTrailProfile(page);
  const locale = await page.locator('.workspace-chrome').getAttribute('lang');
  await page.locator('.workspace-chrome__profile').getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Sign out', exact: true }).click();
  await expect(page.locator('.auth-form')).toBeVisible();
  await expect(page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الدخول' : 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.workspace-chrome')).toHaveCount(0);
}

export async function selectTrailSchoolRecord(page: Page, kind: 'person' | 'enrollment' | 'assignment' | 'guardian', label: string | RegExp): Promise<Locator> {
  const groups = { person: 'People', enrollment: 'Enrollments', assignment: 'Teacher assignments', guardian: 'Family relationships' };
  const directory = page.locator('.school-access-directory');
  await expect(directory).toBeVisible();
  await directory.getByRole('button', { name: groups[kind], exact: true }).click();
  const source = directory.locator('li button').filter({ hasText: label });
  const currentPage = () => directory.evaluate(element => {
    const rows=Array.from(element.querySelectorAll<HTMLButtonElement>('li button')).map(button=>[button.getAttribute('aria-label'),button.textContent?.trim()]);
    const loading=Array.from(element.querySelectorAll('button,[role="status"]')).some(node=>/^(Loading current records|جارٍ تحميل السجلات الحالية)/.test(node.textContent?.trim()??''));
    const noMatches=Array.from(element.querySelectorAll('[role="status"]')).some(node=>/^(No loaded records match|لا تطابق السجلات المحمّلة)/.test(node.textContent?.trim()??''));
    return {signature:JSON.stringify(rows),count:rows.length,loading,error:!!element.querySelector('[role="alert"]'),noMatches};
  });
  const seen = new Set<string>();
  for (let step = 0; step < 40 && await source.count() === 0; step++) {
    await expect.poll(async()=>{const state=await currentPage();return !state.loading&&(state.count>0||state.error||state.noMatches);},{message:'Current School page must settle before another browse action'}).toBe(true);
    if(await source.count())break;
    const signature = (await currentPage()).signature;
    if (seen.has(signature)) throw new Error('Current School directory did not advance to a distinct page.');
    seen.add(signature);
    const next = directory.locator('.school-access-pagination').getByRole('button', { name: 'Next', exact: true });
    await expect(next, 'An explicit current directory continuation is required').toBeVisible();
    await expect(next).toBeEnabled();
    if(await source.count())break;
    await next.click();
    await expect.poll(async () => {const state=await currentPage();return !state.loading&&(state.count>0&&state.signature!==signature||state.error||state.noMatches&&await next.isDisabled());}, { message: 'Wait for a committed School page, terminal no-match state or explicit current refusal', timeout: 15_000 }).toBe(true);
  }
  await expect(source, 'One current visible relationship context must identify this record').toHaveCount(1);
  await expect(source).toBeEnabled(); await source.click();
  const selected = page.getByRole('region', { name: 'Selected current record', exact: true });
  await expect(selected).toBeVisible(); await expect(selected).toContainText(label);
  return selected;
}
export async function prepareTrailSchoolRelationship(page: Page, kind: 'enrollment' | 'assignment' | 'guardian'): Promise<void> {
  const groups = { enrollment: 'Enrollments', assignment: 'Teacher assignments', guardian: 'Family relationships' };
  await page.locator('.school-access-directory').getByRole('button', { name: groups[kind], exact: true }).click();
  await page.getByRole('button', { name: 'Prepare a new relationship', exact: true }).click();
}
/** Select the saved UTC source date using the staff input or parent calendar. */
export async function chooseTrailSchoolDate(page: Page, date: string): Promise<void> {
  const target = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(target.getTime()) || target.toISOString().slice(0, 10) !== date) throw new Error('A valid saved source date is required.');
  const input = page.getByLabel('School date', { exact: true });
  if (await input.count()) { await input.fill(date); return; }
  const calendar = page.locator('.parent-calendar');
  await expect(calendar).toBeVisible();
  const month = calendar.locator('.parent-calendar-month h3');
  const expectedMonth = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(target);
  for (let step = 0; step < 36 && (await month.innerText()) !== expectedMonth; step++) {
    const shown = new Date(`${await month.innerText()} 1`);
    if (!Number.isFinite(shown.getTime())) throw new Error('The visible English calendar month is unavailable.');
    await calendar.getByRole('button', { name: shown.getTime() < target.getTime() ? 'Next month' : 'Previous month', exact: true }).click();
  }
  await expect(month).toHaveText(expectedMonth);
  const day = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' }).format(target);
  const choice = calendar.getByRole('button', { name: new RegExp(`^${day.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `) });
  await expect(choice).toHaveCount(1); await choice.click(); await expect(choice).toHaveAttribute('aria-pressed', 'true');
}

/** Open one current Portfolio source by its independent receipt identity and visible human context. */
export async function selectTrailPortfolioRecord(page: Page, id: string, title?: string): Promise<Locator> {
  expect(id, 'An independently known current Portfolio receipt identity is required').toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  const workspace=page.locator('.portfolio-workspace'); await expect(workspace).toHaveCount(1);
  const row=workspace.locator(`[data-portfolio-id="${id}"], [data-parent-portfolio-id="${id}"]`);
  await expect(workspace.getByRole('status').filter({hasText:/^(Loading|جارٍ تحميل)/})).toHaveCount(0);
  if(await row.count()){await expect(row).toHaveCount(1);await expect(row).toBeVisible();if(title)await expect(row.getByRole('heading',{name:title,level:2,exact:true})).toBeVisible();return row;}
  const other=workspace.locator('[data-portfolio-id]');if(await other.count()){await expect(other).toHaveCount(1);await other.getByRole('button',{name:/^(Back to selected work|العودة إلى الأعمال المختارة)$/,exact:true}).click();}
  const parent=await workspace.locator('.parent-portfolio-directory').count()>0;
  const otherParent=workspace.locator('[data-parent-portfolio-id]');if(parent&&await otherParent.count()){await expect(otherParent).toHaveCount(1);await otherParent.getByRole('button',{name:/^(Return to approved work|العودة إلى الأعمال المعتمدة)$/,exact:true}).click();}
  if(parent&&!title?.trim())throw new Error('Current Parent Portfolio selection requires its independent human source title.');
  const choice=parent?workspace.locator('.parent-portfolio-directory li').filter({has:page.getByRole('heading',{name:title!,exact:true})}):workspace.locator(`[data-portfolio-choice="${id}"]`);
  const more=parent?workspace.locator(':scope > .pagination-actions').getByRole('button',{name:/^(Load more|تحميل المزيد)$/,exact:true}):workspace.locator('.portfolio-reading-directory > .pagination-actions').getByRole('button',{name:/^(Load more|تحميل المزيد)$/,exact:true});
  for(let count=0;!await choice.count()&&count<30;count++){
    await expect(more,'The current Portfolio source must have its own continuation').toHaveCount(1);await expect(more).toBeVisible();await expect(more).toBeEnabled();
    if(await choice.count())break;
    const beforeParentCount=parent?await workspace.locator('.parent-portfolio-directory li').count():0;
    const requested=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/v1/portfolio/items');await more.click();const response=await requested;expect(response.ok()).toBe(true);
    const received=await response.json()as{items:{id:string}[];nextCursor:string|null};expect(Array.isArray(received.items)&&received.items.length<=100,'Current Portfolio page receipt must identify its admitted summaries').toBe(true);expect(received.nextCursor===null||typeof received.nextCursor==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(received.nextCursor),'Current Portfolio page must disclose a canonical continuation').toBe(true);
    const receivedIds=received.items.map(item=>item.id);expect(new Set(receivedIds).size).toBe(receivedIds.length);for(const receivedId of receivedIds)expect(receivedId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    await expect.poll(async()=>{
      const loading=await workspace.getByRole('button',{name:/^(Loading more…|جارٍ تحميل المزيد…)$/,exact:true}).count();if(loading)return false;
      if(await choice.count())return true;
      if(parent)return received.items.length>0&&await workspace.locator('.parent-portfolio-directory li').count()>=beforeParentCount+received.items.length&&(received.nextCursor!==null||await more.count()===0)||received.items.length===0&&received.nextCursor===null&&await more.count()===0;
      const ids=await workspace.locator('[data-portfolio-choice]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-portfolio-choice')));
      return receivedIds.length>0&&receivedIds.every(receivedId=>ids.includes(receivedId))&&(received.nextCursor!==null||await more.count()===0)||receivedIds.length===0&&received.nextCursor===null&&await more.count()===0;
    },{message:'The exact Portfolio page receipt must commit its summary identities or terminal continuation'}).toBe(true);
  }
  await expect(choice,'One exact current Portfolio summary must identify this source').toHaveCount(1);
  const action=parent?choice.getByRole('button',{name:/^(Open approved item|فتح العمل المعتمد)$/,exact:true}):choice.locator('button');await expect(action).toHaveCount(1);await expect(action).toBeVisible();await expect(action).toBeEnabled();
  if(parent)await expect(choice.getByRole('heading',{name:title!,exact:true})).toBeVisible();else{await expect(action.locator('strong')).not.toBeEmpty();await expect(action.locator('strong')).not.toHaveText(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);if(title)await expect(action.locator('strong')).toHaveText(title);}
  await action.click();await expect(row).toHaveCount(1);await expect(row).toBeVisible();if(title)await expect(row.getByRole('heading',{name:title,level:2,exact:true})).toBeVisible();return row;
}
