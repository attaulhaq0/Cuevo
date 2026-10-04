import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Person = { id: string; displayName: string; role: string; status: string; effectiveFrom: string; effectiveTo: string | null; synthetic: boolean };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_ADMIN_SELECTED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';
const messages = {
  en: { people: 'People and access', refresh: 'Refresh school records', selected: 'Selected current record', change: 'Choose another record', edit: 'Edit this record', ongoing: 'No end date recorded', roles: { admin: 'Administrator', coordinator: 'Coordinator', teacher: 'Teacher', student: 'Student', parent: 'Parent / guardian' }, statuses: { active: 'Active', suspended: 'Suspended', revoked: 'Revoked' } },
  ar: { people: 'الأشخاص والصلاحيات', refresh: 'تحديث سجلات المدرسة', selected: 'السجل الحالي المحدد', change: 'اختيار سجل آخر', edit: 'تعديل هذا السجل', ongoing: 'لا يوجد تاريخ نهاية مسجّل', roles: { admin: 'مسؤول المدرسة', coordinator: 'المنسّق', teacher: 'المعلّم', student: 'الطالب', parent: 'وليّ الأمر' }, statuses: { active: 'نشط', suspended: 'موقوف', revoked: 'ملغى' } },
};

// Browser plugin not available. This opt-in Playwright journey reads the existing
// isolated synthetic sources; it neither launches a runtime nor changes access.
test.describe('isolated actual Admin selected-record focus and layout', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and exact frozen build.');
  test.use({ timezoneId: 'UTC', reducedMotion: 'reduce' });
  let runtime: Runtime, build: string, account: Account;
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored synthetic runtime required.');
    build = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (build !== process.env.CUEVO_ADMIN_SELECTED_BUILD) throw new Error('Exact frozen build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic/provider guard failed.');
    const selected = runtime.accounts.find(value => value.actorId.endsWith('001'));
    if (!selected || selected.role !== 'admin') throw new Error('Current isolated Administrator required.');
    account = selected;
  });
  test.afterAll(async () => { if (build) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(build); });

  async function health(page: Page) {
    const failures = (await new AxeBuilder({ page }).include('.workspace').analyze()).violations.map(value => ({ id: value.id, impact: value.impact }));
    expect(failures).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  async function unobstructed(page: Page, heading: Locator, edit: Locator) {
    const headingBox = await heading.boundingBox(), editBox = await edit.boundingBox();
    const readingBottom = await page.locator('.workspace-chrome__navigation').evaluate(element => getComputedStyle(element).position === 'fixed' ? element.getBoundingClientRect().top : innerHeight);
    expect(headingBox).not.toBeNull(); expect(editBox).not.toBeNull();
    expect(headingBox!.y).toBeGreaterThanOrEqual(-1);
    expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(readingBottom + 1);
    expect(editBox!.y + editBox!.height).toBeLessThanOrEqual(readingBottom + 1);
    expect(await edit.evaluate(element => {
      const box = element.getBoundingClientRect(), atPoint = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return !!atPoint && (element === atPoint || element.contains(atPoint));
    })).toBe(true);
  }

  for (const viewport of [{ locale: 'en', width: 1366, height: 768 }, { locale: 'ar', width: 390, height: 844 }, { locale: 'ar', width: 320, height: 568 }] as const) test(`${viewport.locale}${viewport.width}: explicit selection, same-row reselect, keyboard and fresh read`, async ({ page }, info) => {
    test.setTimeout(60_000); page.setDefaultTimeout(8_000); await page.setViewportSize(viewport);
    const t = messages[viewport.locale], errors: string[] = [], warnings: string[] = [], blocked: string[] = [], reads: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const login = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !login) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      if (url.origin === api) reads.push(url.pathname);
      return route.continue();
    });
    await page.goto(`${base}/?view=school`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click();
    const workspace = page.locator('.school-workspace'); await expect(workspace).toBeVisible();
    const peopleResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/school/people' && response.request().method() === 'GET');
    await workspace.locator(':scope > .learning-toolbar').getByRole('button', { name: 'People and access', exact: true }).click();
    const actual = await peopleResponse; expect(actual.status()).toBe(200);
    const source = await actual.json() as { items: Person[]; nextCursor: string | null };
    expect(source.items.length).toBeGreaterThan(1); expect(source.items.every(value => value.synthetic)).toBe(true);
    const people = source.items.filter(value => value.displayName.trim() && source.items.filter(other => other.displayName === value.displayName && other.role === value.role).length === 1);
    expect(people.length).toBeGreaterThan(1);
    const first = people[0], second = people[1];
    if (viewport.locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
    const directory = page.locator('.school-access-directory'), selected = page.getByRole('region', { name: t.selected, exact: true });
    const rows = directory.locator('.school-access-directory__rows li'); await expect(rows).toHaveCount(source.items.length);
    const rowFor = (person: Person) => rows.filter({ has: page.getByText(person.displayName, { exact: true }) }).filter({ has: page.getByText(t.roles[person.role as keyof typeof t.roles], { exact: true }) }).getByRole('button');
    const heading = selected.getByRole('heading', { level: 2 }), edit = selected.getByRole('button', { name: t.edit, exact: true });
    async function currentFacts(person: Person) {
      await expect(heading).toHaveText(person.displayName); await expect(heading).toBeFocused();
      await expect(selected.locator('.cuevo-section-header__context > p')).toHaveText(t.roles[person.role as keyof typeof t.roles]);
      await expect(selected.locator('.status')).toHaveText(t.statuses[person.status as keyof typeof t.statuses]);
      const date = (value: string) => new Intl.DateTimeFormat(viewport.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));
      await expect(selected.locator('dd')).toHaveText([date(person.effectiveFrom), person.effectiveTo === null ? t.ongoing : date(person.effectiveTo)]);
      await expect(selected.locator('form')).toHaveCount(0);
      await unobstructed(page, heading, edit);
    }
    await rowFor(first).click();
    await page.screenshot({ path: info.outputPath('explicit-selection-before-assertions.png'), fullPage: false });
    await currentFacts(first); await health(page);
    await page.screenshot({ path: info.outputPath('selected-first.png'), fullPage: false });
    if (viewport.width < 768) { await expect(directory).toHaveAttribute('data-expanded', 'false'); await expect(rows.first()).toBeHidden(); await directory.getByRole('button', { name: t.change, exact: true }).click(); }
    await rowFor(first).focus(); await rowFor(first).press('Enter'); await currentFacts(first);
    if (viewport.width < 768) await directory.getByRole('button', { name: t.change, exact: true }).click();
    await rowFor(second).focus(); await expect(rowFor(second)).toBeFocused(); await rowFor(second).press('Enter'); await currentFacts(second);
    if (viewport.width < 768) await directory.getByRole('button', { name: t.change, exact: true }).click();
    const lastSource = people.at(-1)!; await rowFor(lastSource).focus(); await expect(rowFor(lastSource)).toBeFocused(); await rowFor(lastSource).press('Enter'); await currentFacts(lastSource); await health(page);
    await page.screenshot({ path: info.outputPath('selected-last-keyboard.png'), fullPage: false });
    await page.evaluate(() => {
      document.documentElement.dataset.adminSelectedFocuses = '0';
      document.addEventListener('focusin', event => { if ((event.target as Element).matches('.school-access-selected h2')) document.documentElement.dataset.adminSelectedFocuses = String(Number(document.documentElement.dataset.adminSelectedFocuses) + 1); });
    });
    const freshPeople = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/school/people' && response.request().method() === 'GET');
    await workspace.locator(':scope > .learning-toolbar').getByRole('button', { name: t.refresh, exact: true }).click();
    expect((await freshPeople).status()).toBe(200); await expect(directory).toBeVisible(); await expect(rows).toHaveCount(source.items.length);
    // The existing workspace refresh unmounts the selection. No implicit record
    // is selected and no selected-record focus is replayed when data returns.
    await expect(directory).toHaveAttribute('data-selected', 'false');
    expect(await page.evaluate(() => document.documentElement.dataset.adminSelectedFocuses)).toBe('0');
    await rowFor(second).click(); await currentFacts(second); await health(page);
    await page.screenshot({ path: info.outputPath('fresh-selected.png'), fullPage: false });
    expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
    await info.attach('actual-current-source', { body: JSON.stringify({ build, locale: viewport.locale, viewport, loadedPeople: source.items.length, partial: source.nextCursor !== null, sourceReads: [...new Set(reads)], blockedMutations: blocked, selectedFacts: 'Exact human title, current role/status/access dates from authorized source; same-row and last-row keyboard selection focus; edit action above fixed mobile navigation; fresh read replays no selection focus.' }), contentType: 'application/json' });
  });
});
