import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Page, type Request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { browserDiagnosticSchema } from '@cuevo/contracts';

type Account = { role: string; email: string; password: string };
type PolicySnapshot = { analytics_enabled: boolean; parent_attendance_visible: boolean; parent_upcoming_visible: boolean; recognition_enabled: boolean; leaderboard_enabled: boolean };
type ActivationSnapshot = { enabled: boolean; environment: string; key_version: number; activated_at: Date; configured_at: Date };
const school = '10000000-0000-4000-8000-000000000001';

async function signIn(page: Page, account: Account) {
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectTrailWorkspace(page, account.role);
}

test('authorized synthetic browser diagnostics are minimized across errors, parsing, Arabic mobile and sign-out', async ({ page }) => {
  test.setTimeout(90000); page.setDefaultTimeout(15000);
  const config = parseServerConfig(process.env, 'api');
  if (!config.databaseUrl) throw Error('Guarded local diagnostics verification requires Cuevo database configuration.');
  const ownerUrl = new URL(config.databaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(ownerUrl.hostname) || ownerUrl.port !== '56322') throw Error('Diagnostics browser test refuses a nonlocal database.');
  ownerUrl.username = 'postgres'; ownerUrl.password = 'postgres';
  const owner = new Pool({ connectionString: ownerUrl.toString(), max: 1 });
  let previous: ActivationSnapshot | undefined;
  let policy: PolicySnapshot = { analytics_enabled: false, parent_attendance_visible: false, parent_upcoming_visible: false, recognition_enabled: false, leaderboard_enabled: false };
  let policyChanged = false; let activationChanged = false;
  const errors: unknown[] = [];
  const observed: Request[] = []; const accepted: string[] = []; const remote: string[] = []; let configurationEnabled = false;
  page.on('request', request => { if (new URL(request.url()).pathname === '/v1/diagnostics/browser') observed.push(request); if (/posthog|us\.i\.posthog\.com/i.test(request.url())) remote.push(request.url()); });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path === '/v1/diagnostics/browser' && response.status() === 200) accepted.push(response.url());
    if (path === '/v1/diagnostics/config' && response.status() === 200) void response.json().then(value => { configurationEnabled = value.enabled === true; }).catch(() => undefined);
  });
  try {
    const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
    const admin = accounts.find(account => account.role === 'admin')!; const teacher = accounts.find(account => account.role === 'teacher')!;
    previous = (await owner.query('select * from internal.posthog_school_activation where school_id=$1', [school])).rows[0] as ActivationSnapshot | undefined;
    const priorPolicy = (await owner.query('select * from app.school_policy_versions where school_id=$1 order by version desc limit 1', [school])).rows[0] as PolicySnapshot | undefined;
    if (priorPolicy) policy = priorPolicy;
    const guarded = (await owner.query("select id from app.schools where id=$1 and status='active' and not exists(select 1 from app.people where school_id=$1 and synthetic is distinct from true)", [school])).rows;
    if (guarded.length !== 1) throw Error('Diagnostics test requires the entirely synthetic reference school.');
    // Preserve and pause any prior activation so earlier approved configuration cannot satisfy this test.
    await owner.query("set app.runtime_env='local'"); activationChanged = true;
    await owner.query('select internal.configure_posthog_school($1,false,\'QA\',1)', [school]);
    // A real administrator approves the existing analytics policy in the supported UI.
    await signIn(page, admin); await openTrailWorkspace(page, 'School');
    await page.getByRole('button', { name: 'Policies', exact: true }).click(); await page.getByRole('button', { name: 'Approve school policy', exact: true }).click();
    const form = page.getByRole('region', { name: 'Approve school policy', exact: true });
    await form.getByLabel('Enable policy-approved analytics', { exact: true }).check();
    await form.getByLabel('Approval reason', { exact: true }).fill('Synthetic browser diagnostic privacy verification');
    await form.getByLabel('I approve this policy version', { exact: true }).check();
    const savedPolicy = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/school/policies' && response.request().method() === 'POST');
    policyChanged = true;
    await form.getByRole('button', { name: 'Save', exact: true }).click(); expect((await savedPolicy).status()).toBe(200);
    await signOutTrailWorkspace(page);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    observed.length = 0; accepted.length = 0; configurationEnabled = false;
    await owner.query("set app.runtime_env='local'"); await owner.query('select internal.configure_posthog_school($1,true,\'QA\',1)', [school]);
    await signIn(page, teacher);
    await expect.poll(() => configurationEnabled).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Controlled synthetic runtime verification' })));
    await expect.poll(() => accepted.length).toBeGreaterThan(0);
    let responseMode: 'invalid' | 'unavailable' = 'invalid';
    await page.route('**/v1/courses?*', async route => {
      await route.fulfill({ status: responseMode === 'invalid' ? 200 : 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(responseMode === 'invalid' ? { items: [{ private: 'student answer cannot enter analytics' }], nextCursor: null } : { code: 'REQUEST_UNAVAILABLE', message: 'private pupil answer and request', requestId: 'private-request' }) });
    });
    await openTrailWorkspace(page, 'Learning');
    await expect.poll(() => observed.some(request => request.postDataJSON()?.category === 'response_invalid')).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
    responseMode = 'unavailable';
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Hydration failed because the server rendered HTML private learner name' })));
    await expect.poll(() => observed.some(request => request.postDataJSON()?.category === 'hydration_error' && request.postDataJSON()?.locale === 'ar' && request.postDataJSON()?.viewport === 'mobile')).toBe(true);
    await openTrailWorkspace(page, 'المدرسة');
    await openTrailWorkspace(page, 'التعلّم');
    await expect.poll(() => observed.some(request => request.postDataJSON()?.category === 'api_error' && request.postDataJSON()?.status === 'unavailable')).toBe(true);
    for (const request of observed) {
      const payload = request.postDataJSON(); expect(browserDiagnosticSchema.safeParse(payload).success).toBe(true);
      expect(request.headers()['idempotency-key']).toBe(payload.diagnosticId);
      expect(Object.keys(payload).sort()).toEqual(['category', 'diagnosticId', 'feature', 'locale', 'status', 'timing', 'viewport']);
      expect(JSON.stringify(payload)).not.toMatch(/private|answer|student|learner|20000000|10000000|token|stack|http/i);
    }
    expect(remote).toEqual([]);
    await signOutTrailWorkspace(page);
    await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    const count = observed.length;
    await page.evaluate(() => { window.dispatchEvent(new ErrorEvent('error', { message: 'Hydration failed private signed-out actor' })); window.dispatchEvent(new Event('unhandledrejection')); });
    await page.waitForTimeout(200); expect(observed).toHaveLength(count);
  } catch (error) { errors.push(error); }
  for (const cleanup of [
    () => page.close(),
    async () => {
      if (policyChanged) await owner.query("insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled,parent_attendance_visible,parent_upcoming_visible,recognition_enabled,leaderboard_enabled)select $1,coalesce(max(version),0)+1,'Restore synthetic browser diagnostics verification policy',$2,$3,$4,$5,$6,$7 from app.school_policy_versions where school_id=$1", [school, '20000000-0000-4000-8000-000000000001', policy.analytics_enabled, policy.parent_attendance_visible, policy.parent_upcoming_visible, policy.recognition_enabled, policy.leaderboard_enabled]);
    },
    async () => {
      if (!activationChanged) return;
      if (previous) await owner.query('update internal.posthog_school_activation set enabled=$2,environment=$3,key_version=$4,activated_at=$5,configured_at=$6 where school_id=$1', [school, previous.enabled, previous.environment, previous.key_version, previous.activated_at, previous.configured_at]);
      else await owner.query('delete from internal.posthog_school_activation where school_id=$1', [school]);
    },
    () => owner.end(),
  ]) { try { await cleanup(); } catch (error) { errors.push(error); } }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Browser diagnostic verification or restoration failed.', { cause: errors[0] });
});
