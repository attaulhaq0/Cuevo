import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Locator, type Response } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { humanContextLabel, selectHumanChoice } from './human-choice';

test('teacher loads complete authorized learner choices before reviewing development context', async ({ page }) => {
  test.setTimeout(60000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const admin = accounts.find(account => account.role === 'admin')!;
  const classId = '30000000-0000-4000-8000-000000000001';
  const periodTitle = `School learner context period ${randomUUID()}`;
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
  await openTrailWorkspace(page, 'Development');
  const initialPolicyPage = await readPage(await adminPolicies);
  let classPage = await readPage(await adminClasses);
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
  await setup.getByLabel('Title', { exact: true }).fill(periodTitle); await setup.getByLabel('Starts at', { exact: true }).fill('2026-09-01T00:00'); await setup.getByLabel('Ends at', { exact: true }).fill('2027-07-01T00:00');
  await expect(setup.getByLabel('I approve this policy or period', { exact: true })).not.toBeChecked(); await setup.getByLabel('I approve this policy or period', { exact: true }).check();
  const periodResponse = page.waitForResponse(response => response.url() === 'http://localhost:4000/v1/development/periods' && response.request().method() === 'POST');
  await setup.getByRole('button', { name: 'Save', exact: true }).click(); const configuredPeriod = await periodResponse; expect(configuredPeriod.status()).toBe(200);
  const configured = await configuredPeriod.json() as { id: string; command: string; awards: number }; expect(configured).toMatchObject({ command: 'period', awards: 0 }); expect(configured.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(configuredPeriod.request().postDataJSON()).toMatchObject({ classId, policyId: policyReceipt.id, title: periodTitle, confirmApproval: true }); await expect(setup).toHaveCount(0);
  await signOutTrailWorkspace(page);
  await page.getByLabel('School email').fill(teacher.email); await page.getByLabel('Password', { exact: true }).fill(teacher.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, 'teacher');
  const firstPeriods = page.waitForResponse(response => { const url = new URL(response.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/development/periods' && !url.searchParams.has('cursor') && response.request().method() === 'GET'; });
  const firstPeople = page.waitForResponse(response => { const url = new URL(response.url()); return url.origin === 'http://localhost:4000' && url.pathname === '/v1/people' && !url.searchParams.has('cursor') && response.request().method() === 'GET'; });
  await openTrailWorkspace(page, 'Development');
  const firstPeriodResponse = await firstPeriods; const firstPeriodPage = await readPage(firstPeriodResponse);
  const periodSources = firstPeriodPage.items as { id: string; title: string; classId: string; policyId: string }[];
  const firstPeoplePage = await readPage(await firstPeople);
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
    const body = await readPage(current) as { items: { id: string; title: string; classId: string; policyId: string }[]; nextCursor: string | null }; expect(body.nextCursor).not.toBe(expectedCursor); periodCursor = body.nextCursor; periodSources.push(...body.items);
    for (const item of body.items) await expect(period.locator(`option[value="${item.id}"]`)).toBeAttached();
    await expect(workspace.getByRole('button', { name: 'Loading more…: Learning period', exact: true })).toHaveCount(0);
  }
  expect(periodCursor).toBeNull(); await expect(periodMore).toHaveCount(0);
  const offeredPeriods = await period.locator('option[value]:not([value=""]):not([disabled])').allTextContents();
  expect(offeredPeriods, 'The current authorized source must provide a real unambiguous period; do not invent one').not.toEqual([]);
  const enabledPeriods = await period.locator('option[value]:not([value=""]):not([disabled])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  await expect.poll(() => periodSources.some(source => source.id === configured.id && source.classId === classId && source.policyId === policyReceipt.id && enabledPeriods.includes(source.id))).toBe(true);
  const currentPeriod = periodSources.find(source => source.id === configured.id && source.classId === classId && source.policyId === policyReceipt.id && enabledPeriods.includes(source.id))!;
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
