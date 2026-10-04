import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { guardianRelationshipInputSchema } from '@cuevo/contracts';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; API_ALLOWED_ORIGIN: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Relationship = { id: string; parentId: string; studentId: string; relationshipType: 'parent' | 'guardian'; status: 'active' | 'revoked' | 'pending'; effectiveFrom: string; effectiveTo: string | null; revision: number };
type Person = { id: string; displayName: string; role: string; synthetic: boolean };
type Receipt = { id: string; revision: number };
type Input = ReturnType<typeof guardianRelationshipInputSchema.parse>;
type Attempt = { key: string; body: Input; status: number; receipt: Receipt | null; delivery: string };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_ADMIN_ACCESS_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122', path = '/v1/school/guardian-relationships';
const output = process.env.CUEVO_ADMIN_ACCESS_OUTPUT ?? 'C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-admin-connected/access';
const copy = {
  en: { language: 'English', people: 'People and access', family: 'Family relationships', change: 'Choose another record', edit: 'Edit this record', title: 'Configure guardian relationship', confirm: 'I approve this change to current access', save: 'Save', retry: 'Retry the same action', cancel: 'Cancel', refresh: 'Refresh school records', conflict: 'This action conflicts with the current record.', unavailable: 'The outcome is not confirmed.' },
  ar: { language: 'العربية', people: 'الأشخاص والصلاحيات', family: 'علاقات الأسرة', change: 'اختيار سجل آخر', edit: 'تعديل هذا السجل', title: 'إعداد علاقة وليّ الأمر', confirm: 'أوافق على هذا التغيير للصلاحيات الحالية', save: 'حفظ', retry: 'إعادة الإجراء نفسه', cancel: 'إلغاء', refresh: 'تحديث سجلات المدرسة', conflict: 'يتعارض هذا الإجراء مع السجل الحالي.', unavailable: 'لم تتأكّد نتيجة الإجراء.' },
};

// Only the root-approved exclusive canonical Guardian072/Student012 window may
// run this test. It never starts a server, provisions Auth or writes another tuple.
// Browser plugin unavailable; actual source/commands use the isolated Playwright runner.
test.describe('isolated actual Admin guardian command acceptance', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime, frozen build and exclusive mutation window.');
  test.use({ timezoneId: 'Asia/Riyadh', reducedMotion: 'reduce' });
  let runtime: Runtime, build: string, admin: Account, parent: Account, learner: Account;
  const tokens: Record<'admin' | 'parent', string> = { admin: '', parent: '' };
  test.beforeAll(async () => {
    const info = test.info();
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json') || process.env.CUEVO_ADMIN_ACCESS_EXCLUSIVE !== 'Guardian072-Student012') throw new Error('Explicit isolated canonical mutation window required.');
    if (info.project.use.baseURL !== base || info.config.webServer !== null) throw new Error('Isolated no-webServer configuration required.');
    build = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (build !== process.env.CUEVO_ADMIN_ACCESS_BUILD) throw new Error('Exact frozen build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.API_ALLOWED_ORIGIN !== base || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Isolated synthetic/provider guard failed.');
    const account = (suffix: string, role: string) => { const value = runtime.accounts.find(row => row.actorId.endsWith(suffix)); if (!value || value.role !== role) throw new Error('Exact isolated identity required.'); return value; };
    admin = account('001', 'admin'); parent = account('072', 'parent'); learner = account('012', 'student');
    expect(admin.schoolId).toBe(parent.schoolId); expect(parent.schoolId).toBe(learner.schoolId);
    for (const role of ['admin', 'parent'] as const) {
      const actor = role === 'admin' ? admin : parent;
      const client = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await client.auth.signInWithPassword({ email: actor.email, password: actor.password });
      if (result.error || !result.data.session || result.data.user?.id !== actor.actorId) throw new Error('Actual isolated Auth unavailable.');
      tokens[role] = result.data.session.access_token;
    }
  });
  test.afterAll(async () => { if (build) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(build); });
  function headers(role: 'admin' | 'parent') { return { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': admin.schoolId }; }
  async function get<T>(route: string, role: 'admin' | 'parent' = 'admin'): Promise<T> {
    const response = await fetch(api + route, { headers: headers(role), signal: AbortSignal.timeout(10_000) });
    expect(response.status, `Current ${role} source ${route}`).toBe(200); return response.json() as Promise<T>;
  }
  async function all<T>(route: string): Promise<T[]> {
    const rows: T[] = []; let cursor: string | null = null;
    for (let page = 0; page < 10; page++) { const result: { items: T[]; nextCursor: string | null } = await get(`${route}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); rows.push(...result.items); if (!result.nextCursor) return rows; expect(result.nextCursor).not.toBe(cursor); cursor = result.nextCursor; }
    throw new Error('Current source capacity requires review.');
  }
  async function current(): Promise<Relationship> {
    const matches = (await all<Relationship>(path)).filter(row => row.parentId === parent.actorId && row.studentId === learner.actorId);
    expect(matches).toHaveLength(1); expect(matches[0].revision).toBeGreaterThan(0); return matches[0];
  }
  function input(row: Relationship, changes: Partial<Input> = {}): Input { return guardianRelationshipInputSchema.parse({ parentId: row.parentId, studentId: row.studentId, relationshipType: row.relationshipType, status: row.status, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, expectedRevision: row.revision, confirmAccessChange: true, ...changes }); }
  async function command(body: Input): Promise<Receipt> {
    const parsed = guardianRelationshipInputSchema.parse(body);
    if (parsed.parentId !== parent.actorId || parsed.studentId !== learner.actorId) throw new Error('Only the exclusive current guardian tuple may change.');
    const response = await fetch(api + path, { method: 'POST', headers: { ...headers('admin'), 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(parsed), signal: AbortSignal.timeout(10_000) });
    expect(response.status, 'Canonical guardian command').toBe(200); const receipt = await response.json() as Receipt;
    expect(receipt.revision).toBe(body.expectedRevision! + 1); return receipt;
  }
  async function health(page: Page) { expect((await new AxeBuilder({ page }).include('.workspace').analyze()).violations).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
  async function openRecord(page: Page, locale: 'en' | 'ar', parentName: string, learnerName: string): Promise<Locator> {
    const t = copy[locale], directory = page.locator('.school-access-directory'), selected = page.locator('.school-access-selected');
    const change = directory.getByRole('button', { name: t.change, exact: true });
    if (await change.isVisible() && await change.getAttribute('aria-expanded') === 'false') await change.click();
    await directory.getByRole('button', { name: t.family, exact: true }).click();
    const row = directory.locator('li').filter({ has: page.getByText(parentName, { exact: true }) }).filter({ has: page.getByText(learnerName, { exact: true }) });
    await expect(row).toHaveCount(1); await row.getByRole('button').focus(); await row.getByRole('button').press('Enter');
    await expect(selected.getByRole('heading', { level: 2 })).toHaveText(parentName); await expect(selected.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(selected.locator('.cuevo-section-header__context > p')).toHaveText(learnerName);
    await selected.getByRole('button', { name: t.edit, exact: true }).click();
    const form = page.getByRole('region', { name: t.title, exact: true }).filter({ has: page.locator('form') }); await expect(form).toBeVisible();
    await expect(form.locator('[name=parentId]')).toHaveValue(parent.actorId); await expect(form.locator('[name=studentId]')).toHaveValue(learner.actorId);
    return form;
  }

  test('current precision, committed original-key recovery, stale conflict and Parent revocation restore', async ({ page }, info) => {
    test.setTimeout(150_000); page.setDefaultTimeout(8_000); await page.setViewportSize({ width: 1366, height: 768 });
    await mkdir(output, { recursive: true });
    const original = await current(), attempts: Attempt[] = [], stages: string[] = [], errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    const baselinePeople = await all<Person>('/v1/school/people'); expect(baselinePeople.every(row => row.synthetic)).toBe(true);
    const parentPerson = baselinePeople.find(row => row.id === parent.actorId), learnerPerson = baselinePeople.find(row => row.id === learner.actorId);
    if (!parentPerson || !learnerPerson) throw new Error('Authorized exact human context required.');
    expect(original.status).toBe('active');
    const profilePath = `/v1/school/learners/${learner.actorId}/profile`; expect((await get<{ id: string }>(profilePath, 'parent')).id).toBe(learner.actorId);
    let delivery: 'actual' | 'abort' | 'malformed' = 'actual', cleanup: Relationship | null = null;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); if (message.type() === 'error') { const expected = message.location().url === api + path && /Failed to load resource:.*(?:409|ERR_FAILED)/.test(message.text()); if (!expected) errors.push(message.text()); } });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const login = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (url.origin === api && url.pathname === path && request.method() === 'POST') {
        const body = guardianRelationshipInputSchema.safeParse(request.postDataJSON());
        if (!body.success || body.data.parentId !== parent.actorId || body.data.studentId !== learner.actorId || !request.headers()['idempotency-key']) { blocked.push('Out-of-scope guardian command'); return route.abort(); }
        return route.continue();
      }
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !login) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    await page.route('**/v1/school/guardian-relationships', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const request = route.request(), body = guardianRelationshipInputSchema.parse(request.postDataJSON());
      if (body.parentId !== parent.actorId || body.studentId !== learner.actorId || !request.headers()['idempotency-key']) { blocked.push('Out-of-scope guardian command'); return route.abort(); }
      const actual = await route.fetch(), status = actual.status();
      const receipt = status === 200 ? await actual.json() as Receipt : null;
      attempts.push({ key: request.headers()['idempotency-key'], body, status, receipt, delivery });
      if (status === 200 && delivery === 'abort') return route.abort('failed');
      if (status === 200 && delivery === 'malformed') return route.fulfill({ response: actual, body: '{}' });
      return route.fulfill({ response: actual });
    });
    try {
      // Controlled past instant with nonzero seconds/milliseconds, preserving all
      // current access semantics. Finally restores the original exact source window.
      await command(input(original, { effectiveFrom: new Date(Date.parse(original.effectiveFrom) + 37_321).toISOString() }));
      let source = await current(); expect(source.id).toBe(original.id); expect(source.status).toBe(original.status);
      await page.goto(base + '/?view=school'); await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.locator('#email').fill(admin.email); await page.locator('#password').fill(admin.password); await page.locator('.auth-submit').click();
      const workspace = page.locator('.school-workspace'); await expect(workspace).toBeVisible();
      await workspace.locator(':scope > .learning-toolbar').getByRole('button', { name: copy.en.people, exact: true }).click();
      await page.locator('.school-access-directory').waitFor();
      for (const viewport of [{ locale: 'en', width: 1366, height: 768 }, { locale: 'ar', width: 390, height: 844 }, { locale: 'ar', width: 320, height: 568 }] as const) {
        await page.setViewportSize(viewport); await page.getByRole('button', { name: copy[viewport.locale].language, exact: true }).click();
        const form = await openRecord(page, viewport.locale, parentPerson.displayName, learnerPerson.displayName);
        await expect(form.locator('[name=relationshipType]')).toHaveValue(source.relationshipType); await expect(form.locator('[name=status]')).toHaveValue(source.status);
        // The native local control may show minute precision; a no-change command
        // must retain the reviewed exact instant rather than round it on the wire.
        expect(await form.locator('[name=effectiveFrom]').inputValue()).toBe(new Date(Date.parse(source.effectiveFrom) + 3 * 60 * 60 * 1000).toISOString().slice(0, 16));
        await health(page); await page.screenshot({ path: info.outputPath(`guardian-editor-${viewport.locale}${viewport.width}.png`), fullPage: false });
        await form.getByLabel(copy[viewport.locale].confirm, { exact: true }).check();
        const beforeAttempts = attempts.length; await form.getByRole('button', { name: copy[viewport.locale].save, exact: true }).click();
        await expect(form).toHaveCount(0); await expect.poll(() => attempts.length).toBe(beforeAttempts + 1);
        const sent = attempts.at(-1)!; expect(sent.status).toBe(200); expect(sent.body).toEqual(input(source));
        const next = await current(); expect(next.revision).toBe(source.revision + 1); expect(Date.parse(next.effectiveFrom)).toBe(Date.parse(source.effectiveFrom)); expect(next.effectiveTo).toBe(source.effectiveTo); source = next;
        stages.push(`${viewport.locale}${viewport.width} visible no-change exact precision save`);
      }
      await page.setViewportSize({ width: 1366, height: 768 }); await page.getByRole('button', { name: 'English', exact: true }).click();
      let form = await openRecord(page, 'en', parentPerson.displayName, learnerPerson.displayName);
      const originalLocalFrom = await form.locator('[name=effectiveFrom]').inputValue(), originalLocalTo = await form.locator('[name=effectiveTo]').inputValue();
      await form.getByLabel(copy.en.confirm, { exact: true }).check(); delivery = 'abort'; const uncertainStart = attempts.length;
      await form.getByRole('button', { name: copy.en.save, exact: true }).click(); await expect(form.getByRole('button', { name: copy.en.retry, exact: true })).toBeVisible();
      await expect(form.locator('fieldset')).toHaveAttribute('disabled', ''); await expect(form.locator('[name=parentId]')).toBeDisabled(); await expect(form.getByRole('button', { name: copy.en.cancel, exact: true })).toHaveCount(0);
      await expect(form.locator('[name=effectiveFrom]')).toHaveValue(originalLocalFrom); await expect(form.locator('[name=effectiveTo]')).toHaveValue(originalLocalTo);
      const committed = await current(); expect(committed.revision).toBe(source.revision + 1); await expect(form.getByRole('alert')).toContainText(copy.en.unavailable);
      delivery = 'malformed'; await form.getByRole('button', { name: copy.en.retry, exact: true }).click(); await expect.poll(() => attempts.length).toBe(uncertainStart + 2); await expect(form.getByRole('button', { name: copy.en.retry, exact: true })).toBeEnabled();
      expect((await current()).revision).toBe(committed.revision); await expect(form.locator('fieldset')).toHaveAttribute('disabled', ''); await expect(form.locator('[name=parentId]')).toBeDisabled();
      await expect(form.locator('[name=effectiveFrom]')).toHaveValue(originalLocalFrom); await expect(form.locator('[name=effectiveTo]')).toHaveValue(originalLocalTo);
      delivery = 'actual'; await form.getByRole('button', { name: copy.en.retry, exact: true }).click(); await expect(form).toHaveCount(0); await expect.poll(() => attempts.length).toBe(uncertainStart + 3);
      const uncertain = attempts.slice(uncertainStart); expect(new Set(uncertain.map(value => value.key)).size).toBe(1); for (const value of uncertain) { expect(value.body).toEqual(input(source)); expect(value.receipt).toEqual(uncertain[0].receipt); }
      source = await current(); expect(source.revision).toBe(committed.revision); stages.push('Committed aborted receipt, malformed replay and exact original-key/body recovery advances once');
      form = await openRecord(page, 'en', parentPerson.displayName, learnerPerson.displayName); await form.getByLabel(copy.en.confirm, { exact: true }).check();
      const staleSource = source; await command(input(source)); source = await current(); expect(source.revision).toBe(staleSource.revision + 1);
      const staleStart = attempts.length; await form.getByRole('button', { name: copy.en.save, exact: true }).click(); await expect(form.getByRole('alert')).toContainText(copy.en.conflict); await expect.poll(() => attempts.length).toBe(staleStart + 1);
      expect(attempts.at(-1)!.status).toBe(409); expect(attempts.at(-1)!.body.expectedRevision).toBe(staleSource.revision); expect((await current()).revision).toBe(source.revision);
      await form.getByRole('button', { name: copy.en.cancel, exact: true }).click(); await workspace.locator(':scope > .learning-toolbar').getByRole('button', { name: copy.en.refresh, exact: true }).click(); await page.locator('.school-access-directory').waitFor();
      stages.push('Actual newer canonical revision rejects stale UI command409 without a further change');
      await command(input(source, { status: 'revoked' })); source = await current(); expect(source.status).toBe('revoked');
      const denied = await fetch(api + profilePath, { headers: headers('parent'), signal: AbortSignal.timeout(10_000) }); expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ code: 'FORBIDDEN' });
      stages.push('Current Parent exact learner profile403 after canonical exclusive relationship revoke');
      expect(blocked).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
    } finally {
      delivery = 'actual';
      const latest = await current(); await command(input(latest, { relationshipType: original.relationshipType, status: original.status, effectiveFrom: original.effectiveFrom, effectiveTo: original.effectiveTo }));
      cleanup = await current(); expect(cleanup.id).toBe(original.id); expect(cleanup.parentId).toBe(original.parentId); expect(cleanup.studentId).toBe(original.studentId); expect(cleanup.relationshipType).toBe(original.relationshipType); expect(cleanup.status).toBe(original.status); expect(Date.parse(cleanup.effectiveFrom)).toBe(Date.parse(original.effectiveFrom)); expect(cleanup.effectiveTo).toBe(original.effectiveTo);
      expect((await get<{ id: string }>(profilePath, 'parent')).id).toBe(learner.actorId);
      await writeFile(resolve(output, 'cleanup-readback.json'), JSON.stringify({ build, original, restored: cleanup, parentProfileStatus: 200, sourceScope: 'Exclusive existing synthetic tuple only; exact original semantic window/type/status restored with latest monotonic revision.' }, null, 2));
      await writeFile(resolve(output, 'command-evidence.json'), JSON.stringify({ build, original, restored: cleanup, attempts, stages, errors, warnings, blocked, limitation: 'Steps recorded even when an assertion fails; cleanup status is independent of acceptance pass.' }, null, 2));
    }
    await frozen(); stages.push('Finally restores original exact type/window/status and Parent profile200');
    await writeFile(resolve(output, 'command-evidence.json'), JSON.stringify({ build, original, restored: cleanup, attempts, stages, errors, warnings, blocked, viewports: ['EN1366x768', 'AR390x844', 'AR320x568'], limitation: 'Controlled exclusive synthetic relationship commands only; no Auth/entitlement/person/enrollment/teacher/policy/grade/provider mutation or inferred full Admin acceptance.' }, null, 2));
    await info.attach('actual-access-acceptance', { body: JSON.stringify({ build, stages, attempts: attempts.length, restoredRevision: cleanup!.revision, blocked }), contentType: 'application/json' });
  });
  async function frozen() { expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(build); }
});
