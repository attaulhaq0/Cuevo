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
  const navigation = workspace.locator('.workspace-chrome__navigation');
  await expect(navigation).toBeVisible();
  await expect(navigation.locator('button[data-workspace-destination][aria-current="page"]')).toHaveCount(1);
  const main = workspace.getByRole('main');
  await expect(main).toHaveCount(1); await expect(main).toBeVisible();
  await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(main.getByRole('heading', { level: 1 })).not.toBeEmpty();
  await expect(page.locator('.auth-form')).toHaveCount(0);
}

/** Profile destinations are reached through the same visible popover as customers. */
export async function trailWorkspaceAction(page: Page, label: string): Promise<Locator> {
  if (['Access details', 'Access settings', 'تفاصيل الوصول', 'إعدادات الوصول', 'Account', 'الحساب'].includes(label)) {
    const trigger = page.locator('.workspace-chrome__person > button');
    await expect(trigger).toBeVisible();
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
    const current = label === 'Access details' ? 'Access settings' : label === 'تفاصيل الوصول' ? 'إعدادات الوصول' : label;
    return page.locator('.workspace-chrome__profile').getByRole('button', { name: current, exact: true });
  }
  return page.locator('.workspace-chrome__navigation').getByRole('button', { name: label, exact: true });
}
export async function openTrailWorkspace(page: Page, label: string): Promise<void> {
  const action = await trailWorkspaceAction(page, label); await expect(action).toBeVisible(); await expect(action).toBeEnabled(); await action.click();
}
export async function signOutTrailWorkspace(page: Page): Promise<void> {
  const trigger = page.locator('.workspace-chrome__person > button');
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
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
