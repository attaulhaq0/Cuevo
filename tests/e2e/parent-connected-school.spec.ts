import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Source = { id: string; revision: number; state?: string; status?: string; classId?: string | null; title?: string; description?: string; startsAt?: string; endsAt?: string; instructions?: string; reason?: string };
type Profile = { id: string; displayName: string; enrollments: { classId: string }[]; courses: { id: string; title: string; classId: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_PARENT_SCHOOL_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

// Opt-in connected acceptance uses the existing real API, Auth and isolated database.
// Browser plugin unavailable: use the repository Playwright browser without a webServer launcher.
test.describe('isolated actual Parent school dates and support', () => {
  test.skip(!runtimePath, 'Requires the separate synthetic runtime and exact frozen build.');
  let runtime: Runtime, buildId: string, admin: Account, parent: Account, child: Account;
  const tokens: Record<string, string> = {};
  async function request<T>(role: 'admin' | 'parent', path: string, body?: Record<string, unknown>): Promise<T> {
    if (!path.startsWith('/v1/')) throw new Error('Current isolated source route required.');
    const actor = role === 'admin' ? admin : parent;
    const response = await fetch(api + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': actor.schoolId, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
    expect(response.status, `Isolated ${role} ${path}`).toBe(200);
    return response.json() as Promise<T>;
  }
  async function all<T>(role: 'admin' | 'parent', path: string, limit = 100): Promise<T[]> {
    const rows: T[] = []; let cursor: string | null = null;
    for (let count = 0; count < 10; count++) {
      const current: { items: T[]; nextCursor: string | null } = await request(role, `${path}${path.includes('?') ? '&' : '?'}limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
      rows.push(...current.items); if (!current.nextCursor) return rows;
      expect(current.nextCursor).not.toBe(cursor); cursor = current.nextCursor;
    }
    throw new Error('Current source capacity requires review.');
  }
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Only the dedicated ignored runtime is permitted.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (process.env.CUEVO_PARENT_SCHOOL_BUILD !== buildId) throw new Error('Freeze the exact isolated build.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Isolated synthetic/provider guard failed.');
    const account = (suffix: string, role: string) => { const value = runtime.accounts.find(row => row.actorId.endsWith(suffix)); if (!value || value.role !== role) throw new Error('Current isolated identity unavailable.'); return value; };
    admin = account('001', 'admin'); parent = account('072', 'parent'); child = account('012', 'student');
    expect(admin.schoolId).toBe(parent.schoolId); expect(child.schoolId).toBe(parent.schoolId);
    for (const [role, actor] of Object.entries({ admin, parent })) {
      const authClient = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await authClient.auth.signInWithPassword({ email: actor.email, password: actor.password });
      if (signedIn.error || !signedIn.data.session) throw new Error('Current isolated authentication unavailable.');
      tokens[role] = signedIn.data.session.access_token;
    }
    const context = await request<{ policy: { parentUpcomingVisible: boolean } }>('parent', '/v1/school/context');
    if (!context.policy.parentUpcomingVisible) throw new Error('Root must enable the existing isolated publication policy.');
  });
  test.beforeEach(async ({ page }) => { page.setDefaultTimeout(5_000); });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  async function login(page: Page) {
    await page.goto(`${base}/?view=school`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(parent.email); await page.locator('#password').fill(parent.password); await page.locator('.auth-submit').click();
    await expect(page.locator('.school-workspace')).toBeVisible();
    const select = page.getByLabel('Child', { exact: true }); await expect(select.locator(`option[value="${child.actorId}"]`)).toHaveCount(1); await select.selectOption(child.actorId);
    await expect(select).toHaveValue(child.actorId);
  }
  async function healthy(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  }
  test('current school-wide and child-class events, multi-day details and approved instructions retain exact source', async ({ page }, info) => {
    test.setTimeout(90_000);
    const profile = await request<Profile>('parent', `/v1/school/learners/${child.actorId}/profile`);
    expect(profile.id).toBe(child.actorId); expect(profile.enrollments).toHaveLength(1);
    const classId = profile.enrollments[0].classId, course = profile.courses.find(row => row.title === 'School reasoning journey' && row.classId === classId);
    if (!course) throw new Error('Existing published child course required; no new course or grade is manufactured.');
    const other = (await all<{ id: string }>('admin', '/v1/school/classes')).find(row => row.id !== classId);
    if (!other) throw new Error('Existing unrelated class required.');
    const suffix = randomUUID().slice(0, 8), date = '2026-10-10';
    const schoolTitle = `Shared school reading ${suffix}`, classTitle = `Class checking conversation ${suffix}`, privateTitle = `Private staff date ${suffix}`, unrelatedTitle = `Other class date ${suffix}`;
    const description = 'School-wide family reading session. Read the school instructions together. جلسة قراءة مدرسية للعائلة.';
    const supportTitle = `Family checking guide ${suffix}`, instructions = `Read one checking step together, then ask the teacher about the school example. راجعوا خطوة التحقق معًا. ${suffix}`;
    const privateReason = `Private approval basis ${suffix}`;
    const ownedEvents: string[] = [], ownedSupport: string[] = [];
    const errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'OPTIONS'].includes(request.method()) && !auth) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    async function event(title: string, scope: string | null, parentVisible: boolean) {
      const row = await request<Source>('admin', '/v1/school/calendar', { classId: scope, title, description, startsAt: `${date}T09:30:00Z`, endsAt: '2026-10-12T10:15:00Z', parentVisible });
      ownedEvents.push(row.id); return row;
    }
    async function support(title: string, published: boolean, from: string, to: string) {
      const row = await request<Source>('admin', '/v1/school/learning-support', { learnerId: child.actorId, courseId: course!.id, assessmentId: null, title, instructions, effectiveFrom: from, effectiveTo: to, studentVisible: false, parentVisible: published, reason: privateReason, confirmApproval: true });
      ownedSupport.push(row.id); return row;
    }
    async function cancel(id: string) {
      const source = (await all<Source>('admin', '/v1/school/calendar')).find(row => row.id === id);
      if (source && source.status !== 'cancelled') await request('admin', `/v1/school/records/${id}/cancel`, { resource: 'calendar', expectedRevision: source.revision, reason: 'Withdraw only this isolated test-owned calendar event.', confirmChange: true });
    }
    async function revoke(id: string) {
      const source = (await all<Source>('admin', '/v1/school/learning-support', 25)).find(row => row.id === id);
      if (source && source.state !== 'REVOKED') await request('admin', `/v1/school/learning-support/${id}/revoke`, { expectedRevision: source.revision, reason: 'Withdraw only this isolated test-owned family instruction.', confirmRevocation: true });
    }
    let primaryError: unknown;
    try {
      const wide = await event(schoolTitle, null, true), specific = await event(classTitle, classId, true);
      const hidden = await event(privateTitle, classId, false), unrelated = await event(unrelatedTitle, other.id, true);
      const visible = await support(supportTitle, true, '2026-10-01', '2026-10-31');
      const privateSupport = await support(`Staff-only guide ${suffix}`, false, '2026-10-01', '2026-10-31'), expired = await support(`Expired guide ${suffix}`, true, '2026-09-01', '2026-09-02');
      const admitted = await all<Source>('parent', `/v1/school/calendar?learnerId=${child.actorId}`);
      expect(admitted.find(row => row.id === wide.id)).toMatchObject({ classId: null, title: schoolTitle });
      expect(admitted.find(row => row.id === specific.id)).toMatchObject({ classId, title: classTitle });
      expect(admitted.some(row => [hidden.id, unrelated.id].includes(row.id))).toBe(false);
      const admittedSupport = await all<Source>('parent', `/v1/school/learning-support?learnerId=${child.actorId}&courseId=${course.id}`, 25);
      expect(admittedSupport.find(row => row.id === visible.id)).toMatchObject({ title: supportTitle, instructions });
      expect(admittedSupport.some(row => [privateSupport.id, expired.id].includes(row.id))).toBe(false);
      expect(JSON.stringify(admittedSupport)).not.toContain(privateReason);

      await login(page); await page.locator('.school-workspace > .learning-toolbar').getByRole('button', { name: 'Daily operations', exact: true }).click();
      const calendar = page.locator('.parent-calendar'); await expect(calendar).toBeVisible();
      await calendar.getByLabel('Selected school date', { exact: true }).fill(date);
      await expect(calendar.getByRole('heading', { name: schoolTitle, exact: true })).toBeVisible();
      await expect(calendar.getByRole('heading', { name: classTitle, exact: true })).toBeVisible();
      await expect(calendar).not.toContainText(privateTitle); await expect(calendar).not.toContainText(unrelatedTitle);
      const open = calendar.getByRole('button', { name: new RegExp(`^Open event: ${schoolTitle}`) }); await open.focus(); await open.press('Enter');
      const detail = calendar.locator('.parent-calendar-detail'); await expect(detail.locator('h4')).toHaveText(schoolTitle); await expect(detail.locator('h4')).toBeFocused();
      await expect(detail).toContainText('School event'); await expect(detail.getByText(description, { exact: true })).toBeVisible();
      await expect(detail.locator('time').nth(0)).toHaveAttribute('datetime', wide.startsAt!);
      await expect(detail.locator('time').nth(1)).toHaveAttribute('datetime', wide.endsAt!);
      await detail.getByRole('button', { name: 'Close event', exact: true }).click(); await expect(open).toBeFocused();
      await calendar.getByLabel('Selected school date', { exact: true }).fill('2026-10-11');
      await expect(calendar.getByRole('heading', { name: schoolTitle, exact: true })).toBeVisible();
      await expect(calendar.getByRole('heading', { name: classTitle, exact: true })).toBeVisible();
      await calendar.getByRole('button', { name: new RegExp(`^Open event: ${schoolTitle}`) }).click();
      await healthy(page); await page.screenshot({ path: info.outputPath('calendar-en-desktop.png'), fullPage: false });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
        await expect(detail.getByText(description, { exact: true })).toBeVisible(); await healthy(page);
        await page.screenshot({ path: info.outputPath(`calendar-ar-${width}.png`), fullPage: false });
      }
      await page.getByRole('button', { name: 'English', exact: true }).click(); await page.setViewportSize({ width: 1366, height: 768 });
      await cancel(wide.id); await page.locator('.school-workspace > .learning-toolbar').getByRole('button', { name: 'Refresh school records', exact: true }).click();
      await expect(calendar.getByRole('heading', { name: schoolTitle, exact: true })).toHaveCount(0); await expect(detail.getByText(description, { exact: true })).toHaveCount(0);

      await page.locator('.school-workspace > .learning-toolbar').getByRole('button', { name: 'Approved learning support', exact: true }).click();
      const family = page.getByRole('region', { name: 'Approved learning support', exact: true });
      await expect(family.getByLabel('Child’s current course', { exact: true }).locator(`option[value="${course.id}"]`)).toHaveCount(1);
      await page.evaluate(() => window.scrollTo(0, 0));
      const courseBox = await family.getByLabel('Child’s current course', { exact: true }).boundingBox();
      expect(courseBox, 'Current course selection must render').not.toBeNull();
      expect(courseBox!.y + courseBox!.height, 'First meaningful support control must fit the normal desktop viewport').toBeLessThanOrEqual(768);
      await family.getByLabel('Child’s current course', { exact: true }).selectOption(course.id);
      await expect(family.getByRole('heading', { name: supportTitle, exact: true })).toBeVisible(); await expect(family.getByText(instructions, { exact: true })).toBeVisible();
      await expect(family).toContainText(course.title); await expect(family).not.toContainText(privateReason);
      await healthy(page); await page.screenshot({ path: info.outputPath('support-en-desktop.png'), fullPage: false });
      await page.setViewportSize({ width: 320, height: 568 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
      await expect(page.getByText(instructions, { exact: true })).toBeVisible(); await healthy(page);
      await page.screenshot({ path: info.outputPath('support-ar-320.png'), fullPage: false });
      await page.getByRole('button', { name: 'English', exact: true }).click(); await revoke(visible.id);
      await family.getByRole('button', { name: 'Refresh approved support', exact: true }).click();
      await expect(family.getByRole('heading', { name: supportTitle, exact: true })).toHaveCount(0); await expect(page.getByText(instructions, { exact: true })).toHaveCount(0);
      expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(blocked).toEqual([]);
      await info.attach('source-facts', { body: JSON.stringify({ buildId, child: profile.displayName, currentChildren: 1, calendar: 'school-wide + exact child-class admitted; staff-private + unrelated class excluded; overlap on following day; exact UTC source; selected cancellation clears detail', support: 'exact current published course; active Parent publication; private reason excluded; private/expired excluded; revoke removes instructions', viewports: ['en1366', 'ar390', 'ar320'], academicMutations: 0, browserCommands: 0 }), contentType: 'application/json' });
    } catch (error) { primaryError = error; }
    test.setTimeout(info.timeout + 45_000); const cleanupErrors: unknown[] = [];
    for (const id of ownedEvents) try { await cancel(id); } catch (error) { cleanupErrors.push(error); }
    for (const id of ownedSupport) try { await revoke(id); } catch (error) { cleanupErrors.push(error); }
    if (primaryError && cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], 'Parent School acceptance and own-source restoration failed.');
    if (primaryError) throw primaryError; if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Parent School own-source restoration failed.');
  });
});
