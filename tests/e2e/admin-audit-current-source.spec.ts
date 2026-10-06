import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Runtime = { config: { SUPABASE_URL: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: { actorId: string; role: string; email: string; password: string }[] };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_ADMIN_AUDIT_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

test.describe('isolated actual Admin audit current-source refusal', () => {
  test.skip(!runtimePath, 'Requires the dedicated synthetic runtime and exact frozen build.');
  let runtime: Runtime, buildId: string;
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored synthetic runtime required.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (buildId !== process.env.CUEVO_ADMIN_AUDIT_BUILD) throw new Error('Exact frozen build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic/provider guard failed.');
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  for (const status of [403, 401]) test(`continuation ${status} removes prior provenance until a fresh source read; 503 remains partial`, async ({ page }, info) => {
    test.setTimeout(45_000);
    const account = runtime.accounts.find(value => value.actorId.endsWith('001'));
    if (!account || account.role !== 'admin') throw new Error('Current isolated Administrator required.');
    const errors: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !/status of (401|403|503)/.test(message.text())) errors.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), read = ['GET', 'OPTIONS'].includes(request.method());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !read && !auth) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    let continuation: number | 'actual' = status;
    await page.route('**/v1/school/audit?*', route => {
      if (new URL(route.request().url()).searchParams.has('cursor') && continuation !== 'actual') return route.fulfill({ status: continuation, contentType: 'application/json', body: JSON.stringify({ code: continuation === 503 ? 'REQUEST_UNAVAILABLE' : 'FORBIDDEN', requestId: 'isolated-admin-audit-continuation' }) });
      return route.continue();
    });
    await page.goto(`${base}/?view=school`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click();
    await expect(page.locator('.school-workspace')).toBeVisible();
    await page.locator('.school-workspace > .learning-toolbar').getByRole('button', { name: 'School audit', exact: true }).click();
    const audit = page.getByRole('region', { name: 'School audit', exact: true }), articles = audit.locator('article');
    await expect(articles).toHaveCount(25); await articles.first().locator('summary').click();
    await expect(articles.first().locator('details')).toHaveAttribute('open', '');
    let releaseMembership!: () => void, membershipStarted!: () => void;
    const membershipHeld = new Promise<void>(resolveHeld => { releaseMembership = resolveHeld; });
    const membershipRead = new Promise<void>(resolveStarted => { membershipStarted = resolveStarted; });
    // A 401 normally starts successful current membership revalidation and a new source scope.
    // Hold that actual read so the retry genuinely stays in the denied source scope first.
    if (status === 401) await page.route('**/v1/me', async route => { const actual = await route.fetch(); membershipStarted(); await membershipHeld; await route.fulfill({ response: actual }); });
    const more = audit.getByRole('button', { name: 'Load more: School audit', exact: true });
    await more.click(); await expect(audit.getByRole('alert')).toBeVisible(); await expect(articles).toHaveCount(0);
    if (status === 401) await membershipRead;
    await expect(audit.locator('article details')).toHaveCount(0);
    // An actual later-page success cannot renew the source authority of the earlier denied page.
    continuation = 'actual'; await more.click(); await expect(audit.getByRole('button', { name: 'Loading more: School audit', exact: true })).toHaveCount(0);
    await expect(articles).toHaveCount(0); await expect(audit.getByRole('alert')).toBeVisible();
    if (status === 401) { releaseMembership(); await expect(articles).toHaveCount(25); await page.unroute('**/v1/me'); }
    await audit.getByRole('button', { name: 'Refresh school records', exact: true }).click();
    await expect(articles).toHaveCount(25); await expect(audit.getByRole('alert')).toHaveCount(0);
    continuation = 503; await more.click(); await expect(audit.getByRole('alert')).toBeVisible();
    await expect(articles).toHaveCount(25); await expect(more).toBeEnabled();
    await info.attach(`audit-${status}-and-outage`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    expect(blocked).toEqual([]); expect(errors).toEqual([]);
  });
});
