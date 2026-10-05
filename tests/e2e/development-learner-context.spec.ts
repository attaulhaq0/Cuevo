import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type APIRequestContext, type Locator, type Response } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { humanContextLabel, selectHumanChoice } from './human-choice';
import { withBrowserRestoration } from './browser-restoration';
import { schoolPolicyInputSchema } from '@cuevo/contracts';
import type { Page } from '@playwright/test';

function schoolLearnerPeriodTitle(startsAt: string, endsAt: string) {
  return `School learner context · ${startsAt.slice(0, 16).replace('T', ' ')} UTC – ${endsAt.slice(0, 16).replace('T', ' ')} UTC`;
}

test('adapter: learner-context period title uses its exact recorded date window without a private identifier',()=>{
  const title=schoolLearnerPeriodTitle('2026-10-06T09:30:00.000Z','2026-10-07T09:30:00.000Z');
  expect(title).toBe('School learner context · 2026-10-06 09:30 UTC – 2026-10-07 09:30 UTC');
  expect(title).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(schoolLearnerPeriodTitle('2026-10-07T09:30:00.000Z','2026-10-08T09:30:00.000Z')).not.toBe(title);
});

async function refreshCurrentDevelopmentSources(page:Page){
 const controller=new AbortController();const parse=async(response:Response)=>{expect(response.ok()).toBe(true);expect(await response.finished()).toBeNull();return response;};
 const observe=(path:string)=>page.waitForEvent('response',{signal:controller.signal,predicate:response=>{const url=new URL(response.url());return url.origin==='http://localhost:4000'&&url.pathname===path&&!url.searchParams.has('cursor')&&response.request().method()==='GET';}}).then(parse).then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));
 const periods=observe('/v1/development/periods'),people=observe('/v1/people');
 try{const [periodSource,peopleSource]=await Promise.all([periods,people,page.locator('.development-workspace').getByRole('button',{name:'Refresh development',exact:true}).click()]);if(!periodSource.ok)throw periodSource.error;if(!peopleSource.ok)throw peopleSource.error;return{periods:periodSource.value,people:peopleSource.value};}finally{controller.abort();await Promise.all([periods,people]);}
}

async function withSchoolRecognitionApproval(request: Pick<APIRequestContext, 'get' | 'post'>, admin: { email: string; password: string }, publicKey: string, verify: () => Promise<void>) {
  const schoolId = '10000000-0000-4000-8000-000000000001';
  const auth = await request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, { headers: { apikey: publicKey }, data: { email: admin.email, password: admin.password } });
  expect(auth.status()).toBe(200);
  const adminToken = (await auth.json()).access_token as string;
  expect(adminToken).toEqual(expect.any(String));
  const headers = { Authorization: `Bearer ${adminToken}`, 'X-School-Id': schoolId };
  const readSchoolPolicy = async () => {
    const response = await request.get('http://localhost:4000/v1/school/context', { headers }); expect(response.status()).toBe(200);
    const context = await response.json() as { school: { id: string }; policy: Record<string, unknown> }; expect(context.school.id).toBe(schoolId);
    const { version, ...policy } = context.policy;
    const input = schoolPolicyInputSchema.parse({ ...policy, expectedVersion: version, reason: 'Validate the current synthetic school policy source.', confirmPolicyApproval: true });
    return { version: input.expectedVersion, parentAttendanceVisible: input.parentAttendanceVisible, parentUpcomingVisible: input.parentUpcomingVisible, studentMessagingEnabled: input.studentMessagingEnabled, recognitionEnabled: input.recognitionEnabled, leaderboardEnabled: input.leaderboardEnabled, analyticsEnabled: input.analyticsEnabled };
  };
  const originalSchoolPolicy = await readSchoolPolicy();
  let approvedSchoolPolicyVersion: number | null = null;
  let recognitionApprovalKey: string | null = null;
  const approveSchoolPolicy = async (policy: typeof originalSchoolPolicy, reason: string, key: string) => {
    const body = schoolPolicyInputSchema.parse({ expectedVersion: policy.version, parentAttendanceVisible: policy.parentAttendanceVisible, parentUpcomingVisible: policy.parentUpcomingVisible, studentMessagingEnabled: policy.studentMessagingEnabled, recognitionEnabled: policy.recognitionEnabled, leaderboardEnabled: policy.leaderboardEnabled, analyticsEnabled: policy.analyticsEnabled, reason, confirmPolicyApproval: true });
    const response = await request.post('http://localhost:4000/v1/school/policies', { headers: { ...headers, 'Idempotency-Key': key }, data: body });
    expect(response.status()).toBe(200); const receipt = await response.json() as { id: string; command: string; schoolId: string; version: number };
    expect(receipt).toMatchObject({ command: 'policy.approve', schoolId, version: policy.version + 1 }); expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/i);
    return receipt.version;
  };
  await withBrowserRestoration(async () => {
    if (!originalSchoolPolicy.recognitionEnabled) {
      recognitionApprovalKey = randomUUID();
      approvedSchoolPolicyVersion = await approveSchoolPolicy({ ...originalSchoolPolicy, recognitionEnabled: true }, 'Synthetic learner-context verification approves the recognition configuration prerequisite.', recognitionApprovalKey);
      expect(await readSchoolPolicy()).toEqual({ ...originalSchoolPolicy, version: approvedSchoolPolicyVersion, recognitionEnabled: true });
    }
    await verify();
  }, async () => {
    // Resolve an uncertain setup only with its original key and identical payload.
    // Matching flags/version alone cannot establish ownership of another approval.
    if (recognitionApprovalKey && approvedSchoolPolicyVersion === null) approvedSchoolPolicyVersion = await approveSchoolPolicy({ ...originalSchoolPolicy, recognitionEnabled: true }, 'Synthetic learner-context verification approves the recognition configuration prerequisite.', recognitionApprovalKey);
    if (approvedSchoolPolicyVersion === null) return;
    const current = await readSchoolPolicy();
    expect(current, 'Restore only the exact test-owned recognition approval; a newer policy needs review').toEqual({ ...originalSchoolPolicy, version: approvedSchoolPolicyVersion, recognitionEnabled: true });
    const restoredVersion = await approveSchoolPolicy({ ...originalSchoolPolicy, version: current.version }, 'Synthetic learner-context verification restores the preceding school recognition settings.', randomUUID());
    expect(await readSchoolPolicy()).toEqual({ ...originalSchoolPolicy, version: restoredVersion });
  });
}

test('teacher loads complete authorized learner choices before reviewing development context', async ({ page }) => {
  test.setTimeout(60000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const admin = accounts.find(account => account.role === 'admin')!;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error('Configured synthetic Auth is required for the school approval prerequisite.');
  await withSchoolRecognitionApproval(page.request, admin, publicKey, async () => {
  const classId = '30000000-0000-4000-8000-000000000001';
  const errors: string[] = [];
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  type PageBody = { items: { id?: string; userId?: string; role?: string }[]; nextCursor: string | null };
  async function readPage(response: Response): Promise<PageBody> {
    expect(response.status()).toBe(200); expect(await response.finished()).toBeNull(); const body = await response.json() as PageBody;
    expect(Array.isArray(body.items)).toBe(true); expect(body.items.length).toBeLessThanOrEqual(100); expect(body.nextCursor === null || uuid.test(body.nextCursor)).toBe(true);
    const ids = body.items.map(item => item.userId ?? item.id); for (const id of ids) expect(id).toMatch(uuid); expect(new Set(ids).size).toBe(ids.length);
    return body;
  }
  async function completeChoices(more: Locator, field: Locator, path: string, initialCursor: string | null) {
    const seen = new Set<string>(); let cursor = initialCursor;
    for (let continuation = 0; cursor && continuation < 30; continuation++) {
      expect(seen.has(cursor)).toBe(false); seen.add(cursor);
      await expect(more).toHaveCount(1);
      const currentCursor = cursor;
      const response = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === path && url.searchParams.get('cursor') === currentCursor && row.request().method() === 'GET'; });
      await expect(more).toBeEnabled(); await more.click(); const current = await response; expect(current.status()).toBe(200); expect(await current.finished()).toBeNull();
      const body = await readPage(current);
      expect(body.nextCursor).not.toBe(currentCursor);
      for (const item of body.items.filter(item => path !== '/v1/people' || item.role === 'student')) {
        const id = path === '/v1/people' ? item.userId : item.id; expect(id).toMatch(uuid); await expect(field.locator(`option[value="${id}"]`)).toBeAttached();
      }
      cursor = body.nextCursor;
      if (body.nextCursor === null) await expect(more).toHaveCount(0); else await expect(more).toBeEnabled();
    }
    expect(cursor).toBeNull(); await expect(more).toHaveCount(0);
  }
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(admin.email); await page.getByLabel('Password', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, 'admin');
  const adminPolicies = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/policies' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; });
  const adminClasses = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/classes' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; });
  const adminPeriods = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/periods' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; });
  await openTrailWorkspace(page, 'Development');
  const initialPolicyPage = await readPage(await adminPolicies);
  let classPage = await readPage(await adminClasses);
  const configuredPeriods = [] as { classId: string; endsAt: string }[];
  let periodPageResponse = await adminPeriods;
  const seenPeriodCursors = new Set<string>();
  for (let part = 0; part < 30; part++) {
    const body = await readPage(periodPageResponse) as PageBody & { items: { id: string; classId: string; endsAt: string }[] };
    configuredPeriods.push(...body.items);
    if (!body.nextCursor) break;
    const cursor = body.nextCursor; expect(seenPeriodCursors.has(cursor)).toBe(false); seenPeriodCursors.add(cursor);
    const next = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/periods' && url.searchParams.get('cursor') === cursor && row.request().method() === 'GET'; });
    const more = page.locator('.development-workspace').getByRole('button', { name: 'Load more: Learning period', exact: true }); await expect(more).toBeEnabled(); await more.click(); periodPageResponse = await next;
    if (part === 29) throw new Error('Current period source exceeded its bounded pages.');
  }
  const latestEnd = Math.max(Date.now(), ...configuredPeriods.filter(period => period.classId === classId).map(period => { const end = Date.parse(period.endsAt); expect(Number.isFinite(end)).toBe(true); return end; }));
  const startMs = Math.ceil((latestEnd + 86400000) / 60000) * 60000;
  const periodStartsAt = new Date(startMs).toISOString(), periodEndsAt = new Date(startMs + 86400000).toISOString();
  const periodTitle = schoolLearnerPeriodTitle(periodStartsAt, periodEndsAt);
  const localInput = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const adminWorkspace = page.locator('.development-workspace');
  await expect(adminWorkspace.getByRole('status').filter({ hasText: 'Loading development…' })).toHaveCount(0);
  const policyMore = adminWorkspace.getByRole('button', { name: 'Load more: Recognition policies', exact: true });
  if (initialPolicyPage.nextCursor) await expect(policyMore).toHaveCount(1); else await expect(adminWorkspace.getByRole('button', { name: 'Approve recognition policy', exact: true })).toBeEnabled();
  async function completePolicies(initial: PageBody) {
    let cursor = initial.nextCursor; const seen = new Set<string>();
    for (let continuation = 0; cursor && continuation < 30; continuation++) { expect(seen.has(cursor)).toBe(false); seen.add(cursor); const expectedCursor = cursor; await expect(policyMore).toHaveCount(1);
      const response = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/policies' && url.searchParams.get('cursor') === expectedCursor && row.request().method() === 'GET'; });
      await policyMore.click(); const current = await readPage(await response); expect(current.nextCursor).not.toBe(expectedCursor); cursor = current.nextCursor;
      await expect(adminWorkspace.getByRole('button', { name: 'Loading more…: Recognition policies', exact: true })).toHaveCount(0);
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    }
    expect(cursor).toBeNull(); await expect(policyMore).toHaveCount(0); await expect(adminWorkspace.getByRole('button', { name: 'Approve recognition policy', exact: true })).toBeEnabled();
  }
  await completePolicies(initialPolicyPage);
  await expect(policyMore).toHaveCount(0); await expect(adminWorkspace.getByRole('button', { name: 'Approve recognition policy', exact: true })).toBeEnabled();
  await adminWorkspace.getByRole('button', { name: 'Approve recognition policy', exact: true }).click();
  let setup = adminWorkspace.getByRole('region', { name: 'Approve recognition policy', exact: true });
  for (const label of ['Practice points', 'Revision points', 'Reflection points']) await setup.getByLabel(label, { exact: true }).fill('0');
  await expect(setup.getByLabel('I approve this policy or period', { exact: true })).not.toBeChecked(); await setup.getByLabel('I approve this policy or period', { exact: true }).check();
  const policyResponse = page.waitForResponse(response => response.url() === 'http://localhost:4000/v1/development/policies' && response.request().method() === 'POST');
  const reloadedPolicies = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/policies' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; });
  const reloadedClasses = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/classes' && !url.searchParams.has('cursor') && row.request().method() === 'GET'; });
  await setup.getByRole('button', { name: 'Save', exact: true }).click(); const approvedPolicy = await policyResponse; expect(approvedPolicy.status()).toBe(200);
  const policyReceipt = await approvedPolicy.json() as { id: string; command: string; awards: number }; expect(policyReceipt).toMatchObject({ command: 'policy', awards: 0 }); expect(policyReceipt.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(approvedPolicy.request().postDataJSON()).toMatchObject({ points: { practice: 0, revision: 0, reflection: 0 }, milestones: [], confirmApproval: true }); await expect(setup).toHaveCount(0);
  const currentPolicyPage = await readPage(await reloadedPolicies); classPage = await readPage(await reloadedClasses);
  if (currentPolicyPage.nextCursor) await expect(policyMore).toHaveCount(1); else await expect(adminWorkspace.getByRole('button', { name: 'Approve recognition policy', exact: true })).toBeEnabled();
  await expect(adminWorkspace.getByRole('status').filter({ hasText: 'Loading development…' })).toHaveCount(0);
  await completePolicies(currentPolicyPage);
  await expect(policyMore).toHaveCount(0); await expect(adminWorkspace.getByRole('button', { name: 'Approve recognition policy', exact: true })).toBeEnabled();
  await adminWorkspace.getByRole('button', { name: 'Create learning period', exact: true }).click(); setup = adminWorkspace.getByRole('region', { name: 'Create learning period', exact: true });
  const classMore = adminWorkspace.getByRole('button', { name: 'Load more: Class', exact: true });
  await expect(setup).toBeVisible();
  await completeChoices(classMore, setup.getByLabel('Class', { exact: true }), '/v1/classes', classPage.nextCursor); await selectHumanChoice(setup.getByLabel('Class', { exact: true }), humanContextLabel('Year 1 · Cedar'), classId);
  const policyOption = setup.getByLabel('Policy', { exact: true }).locator(`option[value="${policyReceipt.id}"]`); await expect(policyOption).toBeAttached();
  await selectHumanChoice(setup.getByLabel('Policy', { exact: true }), (await policyOption.textContent())!.trim(), policyReceipt.id);
  await setup.getByLabel('Title', { exact: true }).fill(periodTitle); await setup.getByLabel('Starts at', { exact: true }).fill(localInput(periodStartsAt)); await setup.getByLabel('Ends at', { exact: true }).fill(localInput(periodEndsAt));
  await expect(setup.getByLabel('I approve this policy or period', { exact: true })).not.toBeChecked(); await setup.getByLabel('I approve this policy or period', { exact: true }).check();
  const periodResponse = page.waitForResponse(response => response.url() === 'http://localhost:4000/v1/development/periods' && response.request().method() === 'POST');
  await setup.getByRole('button', { name: 'Save', exact: true }).click(); const configuredPeriod = await periodResponse; expect(configuredPeriod.status()).toBe(200);
  const configured = await configuredPeriod.json() as { id: string; command: string; awards: number }; expect(configured).toMatchObject({ command: 'period', awards: 0 }); expect(configured.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(configuredPeriod.request().postDataJSON()).toMatchObject({ classId, policyId: policyReceipt.id, title: periodTitle, startsAt: periodStartsAt, endsAt: periodEndsAt, confirmApproval: true }); await expect(setup).toHaveCount(0);
  await signOutTrailWorkspace(page);
  await page.getByLabel('School email').fill(teacher.email); await page.getByLabel('Password', { exact: true }).fill(teacher.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, 'teacher');
  await openTrailWorkspace(page, 'Development');
  const currentSources=await refreshCurrentDevelopmentSources(page);const firstPeriodPage = await readPage(currentSources.periods);
  const periodSources = firstPeriodPage.items as { id: string; title: string; classId: string; policyId: string; startsAt: string; endsAt: string }[];
  const firstPeoplePage = await readPage(currentSources.people);
  const workspace = page.locator('.development-workspace'), selector = workspace.getByLabel('Learner', { exact: true });
  await expect.poll(() => selector.locator('option').count()).toBeGreaterThan(1);
  const field = selector.locator('..'), learnerMore = field.getByRole('button', { name: 'Load more: Learner', exact: true });
  await completeChoices(learnerMore, selector, '/v1/people', firstPeoplePage.nextCursor);
  const learnerId = '20000000-0000-4000-8000-000000000012';
  const learnerChoice = await selectHumanChoice(selector, humanContextLabel('Lina Al-Kuwari'), learnerId);
  expect(learnerChoice.label).toContain(' · ');
  expect(learnerChoice.label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const personal = workspace.getByRole('region', { name: 'Personal recorded progress', exact: true });
  await expect(personal).toContainText('Choose a learning period to open its recorded points, actions and milestones.');
  const period = workspace.getByLabel('Learning period', { exact: true }), periodMore = workspace.getByRole('button', { name: 'Load more: Learning period', exact: true });
  const firstPeriodCursor = firstPeriodPage.nextCursor;
  for (const item of periodSources) await expect(period.locator(`option[value="${item.id}"]`)).toBeAttached();
  if (firstPeriodCursor) await expect(periodMore).toHaveCount(1);
  await expect(workspace.getByRole('status').filter({ hasText: 'Loading development…' })).toHaveCount(0);
  let periodCursor = firstPeriodCursor; const seenPeriods = new Set<string>();
  for (let pass = 0; periodCursor && pass < 30; pass++) {
    expect(seenPeriods.has(periodCursor)).toBe(false); seenPeriods.add(periodCursor); const expectedCursor = periodCursor; await expect(periodMore).toHaveCount(1);
    const response = page.waitForResponse(row => { const url = new URL(row.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/periods' && url.searchParams.get('cursor') === expectedCursor && row.request().method() === 'GET'; });
    await periodMore.click(); const current = await response; expect(current.status()).toBe(200); expect(await current.finished()).toBeNull();
    const body = await readPage(current) as { items: { id: string; title: string; classId: string; policyId: string; startsAt: string; endsAt: string }[]; nextCursor: string | null }; expect(body.nextCursor).not.toBe(expectedCursor); periodCursor = body.nextCursor; periodSources.push(...body.items);
    for (const item of body.items) await expect(period.locator(`option[value="${item.id}"]`)).toBeAttached();
    await expect(workspace.getByRole('button', { name: 'Loading more…: Learning period', exact: true })).toHaveCount(0);
  }
  expect(periodCursor).toBeNull(); await expect(periodMore).toHaveCount(0);
  const offeredPeriods = await period.locator('option[value]:not([value=""]):not([disabled])').allTextContents();
  expect(offeredPeriods, 'The current authorized source must provide a real unambiguous period; do not invent one').not.toEqual([]);
  const enabledPeriods = await period.locator('option[value]:not([value=""]):not([disabled])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  await expect.poll(() => periodSources.some(source => source.id === configured.id && source.classId === classId && source.policyId === policyReceipt.id && enabledPeriods.includes(source.id))).toBe(true);
  const currentPeriod = periodSources.find(source => source.id === configured.id && source.classId === classId && source.policyId === policyReceipt.id && enabledPeriods.includes(source.id))!;
  expect(currentPeriod).toMatchObject({ id: configured.id, title: periodTitle, classId, policyId: policyReceipt.id, startsAt: periodStartsAt, endsAt: periodEndsAt });
  const currentPeriodLabel = (await period.locator(`option[value="${currentPeriod.id}"]`).textContent())!.trim();
  const selectedPeriod = await selectHumanChoice(period, currentPeriodLabel, currentPeriod.id);
  expect(currentPeriod.title.trim()).not.toBe(''); expect(currentPeriod.policyId).not.toBe('');
  expect(selectedPeriod.label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  // The existing read-only refresh validates the chosen learner/period source.
  const sourceResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/v1/development/summary' && url.searchParams.get('learnerId') === learnerId && url.searchParams.get('periodId') === selectedPeriod.value;
  });
  await workspace.getByRole('button', { name: 'Refresh development', exact: true }).click();
  const summaryResponse = await sourceResponse; expect(summaryResponse.ok()).toBe(true);
  const summary = await summaryResponse.json() as { learnerId: string; periodId: string };
  expect(summary).toMatchObject({ learnerId, periodId: selectedPeriod.value });
  await expect(personal.getByRole('heading', { name: 'Recorded development', exact: true })).toBeVisible();
  const goals = page.getByRole('region', { name: 'Learning goals', exact: true }); await expect(goals).toBeVisible();
  await expect(goals.getByRole('button', { name: 'Record a learning goal', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]); expect(errors).toEqual([]);
  });
});

test('adapter: recognition prerequisite preserves fields and original-key recovery without overwriting newer school approval', async () => {
  const schoolId = '10000000-0000-4000-8000-000000000001';
  const original = { version: 4, parentAttendanceVisible: true, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: true };
  for (const scenario of ['complete', 'already-enabled', 'setup-uncertain', 'newer-policy', 'body-failure'] as const) {
    let current = { ...original, recognitionEnabled: scenario === 'already-enabled' };
    const writes: { body: Record<string, unknown>; key: string }[] = [], receipts = new Map<string, { id: string; command: string; schoolId: string; version: number }>();
    const response = (value: unknown) => ({ status: () => 200, json: async () => value });
    const request = {
      get: async () => response({ school: { id: schoolId }, policy: current }),
      post: async (url: string, options: { headers: Record<string, string>; data: Record<string, unknown> }) => {
        if (url.includes('/auth/v1/')) return response({ access_token: 'synthetic-authorized-admin' });
        expect(options.headers['X-School-Id']).toBe(schoolId); expect(options.headers.Authorization).toBe('Bearer synthetic-authorized-admin');
        const body = schoolPolicyInputSchema.parse(options.data), key = options.headers['Idempotency-Key']; writes.push({ body, key });
        if (receipts.has(key)) return response(receipts.get(key));
        expect(body.expectedVersion).toBe(current.version);
        current = { version: current.version + 1, parentAttendanceVisible: body.parentAttendanceVisible, parentUpcomingVisible: body.parentUpcomingVisible, studentMessagingEnabled: body.studentMessagingEnabled, recognitionEnabled: body.recognitionEnabled, leaderboardEnabled: body.leaderboardEnabled, analyticsEnabled: body.analyticsEnabled };
        const receipt = { id: randomUUID(), command: 'policy.approve', schoolId, version: current.version }; receipts.set(key, receipt);
        if (scenario === 'setup-uncertain' && writes.length === 1) throw new Error('Synthetic setup response lost after commit');
        return response(receipt);
      },
    } as unknown as Pick<APIRequestContext, 'get' | 'post'>;
    const run = withSchoolRecognitionApproval(request, { email: 'admin@synthetic.invalid', password: 'fixture-only' }, 'synthetic-public-key', async () => {
      if (scenario === 'newer-policy') current = { ...current, version: current.version + 1, parentUpcomingVisible: true };
      if (scenario === 'body-failure') throw new Error('Synthetic original verification failure');
    });
    if (['setup-uncertain', 'newer-policy', 'body-failure'].includes(scenario)) await expect(run).rejects.toThrow(); else await run;
    if (scenario === 'already-enabled') expect(writes).toEqual([]);
    else if (scenario === 'newer-policy') { expect(writes).toHaveLength(1); expect(current.parentUpcomingVisible).toBe(true); }
    else {
      expect(current).toEqual({ ...original, version: 6 });
      expect(writes[0].body).toMatchObject({ expectedVersion: 4, parentAttendanceVisible: true, parentUpcomingVisible: false, analyticsEnabled: true, recognitionEnabled: true, leaderboardEnabled: false, confirmPolicyApproval: true });
      if (scenario === 'setup-uncertain') { expect(writes).toHaveLength(3); expect(writes[1]).toEqual(writes[0]); } else expect(writes).toHaveLength(2);
      expect(writes.at(-1)?.key).not.toBe(writes[0].key);
    }
  }
});

test('adapter: a preserved Development route uses explicit current refresh after earlier period and people reads',async({page})=>{
 const reads:string[]=[];await page.route('http://localhost:4000/**',route=>{reads.push(new URL(route.request().url()).pathname);return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[],nextCursor:null})});});
 await page.setContent('<main><section class="development-workspace"><button>Refresh development</button></section></main><script>document.querySelector("button").onclick=()=>Promise.all([fetch("http://localhost:4000/v1/development/periods?limit=100"),fetch("http://localhost:4000/v1/people?limit=100")]);</script>');
 await page.evaluate(async()=>{await Promise.all([fetch('http://localhost:4000/v1/development/periods?limit=100'),fetch('http://localhost:4000/v1/people?limit=100')]);});
 const source=await refreshCurrentDevelopmentSources(page);expect(await source.periods.json()).toEqual({items:[],nextCursor:null});expect(reads.filter(path=>path==='/v1/development/periods')).toHaveLength(2);expect(reads.filter(path=>path==='/v1/people')).toHaveLength(2);
});

test('adapter: failed Development refresh preserves its click error and settles both current source observers',async({page})=>{
 await page.setContent('<section class="development-workspace"></section>');page.setDefaultTimeout(300);await expect(refreshCurrentDevelopmentSources(page)).rejects.toThrow();
});
