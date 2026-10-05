import { expectTrailWorkspace, openTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { humanContextLabel, selectHumanChoice } from './human-choice';

test('teacher loads complete authorized learner choices before reviewing development context', async ({ page }) => {
  test.setTimeout(60000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const errors: string[] = [], periodSources: { id: string; title: string; classId: string; policyId: string }[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  // Observe only this UI's admitted current period pages; no extra source query.
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/v1/development/periods' || !response.ok()) return;
    const value = await response.json() as { items: { id: string; title: string; classId: string; policyId: string }[] };
    for (const period of value.items) if (!periodSources.some(source => source.id === period.id)) periodSources.push(period);
  });
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(teacher.email); await page.getByLabel('Password', { exact: true }).fill(teacher.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, 'teacher');
  await openTrailWorkspace(page, 'Development');
  const workspace = page.locator('.development-workspace'), selector = workspace.getByLabel('Learner', { exact: true });
  await expect.poll(() => selector.locator('option').count()).toBeGreaterThan(1);
  const field = selector.locator('..'), learnerMore = field.getByRole('button', { name: 'Load more: Learner', exact: true });
  for (let pass = 0; pass < 20 && await learnerMore.count(); pass++) {
    await learnerMore.click(); await expect(field.getByRole('button', { name: 'Loading more…: Learner', exact: true })).toHaveCount(0);
  }
  await expect(learnerMore).toHaveCount(0);
  const learnerId = '20000000-0000-4000-8000-000000000012';
  const learnerChoice = await selectHumanChoice(selector, humanContextLabel('Lina Al-Kuwari'), learnerId);
  expect(learnerChoice.label).toContain(' · ');
  expect(learnerChoice.label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const personal = workspace.getByRole('region', { name: 'Personal recorded progress', exact: true });
  await expect(personal).toContainText('Choose a learning period to open its recorded points, actions and milestones.');
  const period = workspace.getByLabel('Learning period', { exact: true }), periodMore = workspace.getByRole('button', { name: 'Load more: Learning period', exact: true });
  await expect(workspace.getByRole('status').filter({ hasText: 'Loading development…' })).toHaveCount(0);
  for (let pass = 0; pass < 20 && await periodMore.count(); pass++) {
    await periodMore.click(); await expect(workspace.getByRole('button', { name: 'Loading more…: Learning period', exact: true })).toHaveCount(0);
  }
  await expect(periodMore).toHaveCount(0);
  const offeredPeriods = await period.locator('option[value]:not([value=""]):not([disabled])').allTextContents();
  expect(offeredPeriods, 'The current authorized source must provide a real unambiguous period; do not invent one').not.toEqual([]);
  const classId = '30000000-0000-4000-8000-000000000001';
  const enabledPeriods = await period.locator('option[value]:not([value=""]):not([disabled])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  await expect.poll(() => periodSources.some(source => source.classId === classId && enabledPeriods.includes(source.id))).toBe(true);
  const currentPeriod = periodSources.find(source => source.classId === classId && enabledPeriods.includes(source.id))!;
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
