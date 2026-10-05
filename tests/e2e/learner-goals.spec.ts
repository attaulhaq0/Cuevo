import { expectTrailWorkspace, openTrailWorkspace } from './trail-workspace';
import { selectHumanChoice } from './human-choice';
import { test, expect, type Page, type Locator, type Response } from '@playwright/test';
import { learnerGoalSchema } from '@cuevo/contracts';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

type GoalReceipt = ReturnType<typeof learnerGoalSchema.parse>;
const learnerId = '20000000-0000-4000-8000-000000000012';
const courseId = '96010000-0000-4000-8000-000000000001';
const courseTitle = 'Synthetic primary explanation';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function currentGoalRead(page: Page) {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/v1/development/goals' && url.searchParams.get('learnerId') === learnerId && !url.searchParams.has('cursor');
  });
}

async function selectCurrentGoalCourse(page: Page, section: Locator, form: Locator) {
  const control = form.getByLabel('Course', { exact: true });
  const choice = control.getByRole('option', { name: courseTitle, exact: true });
  const more = section.getByRole('button', { name: 'Load more: Course', exact: true });
  const seen = new Set<string>();
  for (let index = 0; !await choice.count(); index++) {
    expect(index, 'Current course source continuation is bounded').toBeLessThan(30);
    await expect(more).toHaveCount(1); await expect(more).toBeEnabled();
    const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/courses' && response.request().method() === 'GET');
    await more.click(); const response = await requested; expect(response.ok()).toBe(true);
    const value = await response.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(Array.isArray(value.items) && value.items.length <= 25).toBe(true);
    expect(value.nextCursor === null || typeof value.nextCursor === 'string' && uuid.test(value.nextCursor)).toBe(true);
    if (value.nextCursor) { expect(seen.has(value.nextCursor)).toBe(false); seen.add(value.nextCursor); }
    for (const item of value.items) { expect(item.id).toMatch(uuid); await expect(control.locator(`option[value="${item.id}"]`)).toHaveCount(1); }
    await expect(section.getByRole('button', { name: 'Loading more…: Course', exact: true })).toHaveCount(0);
    await expect(section.getByRole('alert')).toHaveCount(0);
    if (value.nextCursor === null) await expect(more).toHaveCount(0);
  }
  await selectHumanChoice(control, courseTitle, courseId);
}

async function openCurrentGoal(page: Page, section: Locator, goal: GoalReceipt, firstRead: Promise<Response>) {
  learnerGoalSchema.parse(goal);
  const row = section.locator(`[data-goal-id="${goal.id}"]`);
  const more = section.getByRole('button', { name: 'Load more: Learning goals', exact: true });
  const seen = new Set<string>();
  let cursor: string | null = null, response = await firstRead;
  for (let index = 0; ; index++) {
    expect(index, 'Current goal source continuation is bounded').toBeLessThan(30);
    expect(response.ok()).toBe(true);
    const url = new URL(response.url());
    expect(url.searchParams.get('learnerId')).toBe(goal.learnerId);
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('cursor')).toBe(cursor);
    const value = await response.json() as { items: unknown[]; nextCursor: string | null };
    expect(Array.isArray(value.items) && value.items.length <= 25).toBe(true);
    expect(value.nextCursor === null || typeof value.nextCursor === 'string' && uuid.test(value.nextCursor)).toBe(true);
    const items = value.items.map(item => learnerGoalSchema.parse(item));
    for (const item of items) { expect(item.learnerId).toBe(goal.learnerId); await expect(section.locator(`[data-goal-id="${item.id}"]`)).toHaveCount(1); }
    await expect(section.getByRole('status').filter({ hasText: 'Loading goals…' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Loading more…: Learning goals', exact: true })).toHaveCount(0);
    await expect(section.getByRole('alert')).toHaveCount(0);
    const current = items.find(item => item.id === goal.id);
    if (current) { expect(current, 'Current learner-scoped source matches the saved receipt').toEqual(goal); break; }
    expect(value.nextCursor, 'The exact saved goal remains in the current authorized source').not.toBeNull();
    cursor = value.nextCursor!; expect(seen.has(cursor)).toBe(false); seen.add(cursor);
    await expect(more).toHaveCount(1); await expect(more).toBeEnabled();
    const requested = page.waitForResponse(candidate => {
      const next = new URL(candidate.url());
      return candidate.request().method() === 'GET' && next.pathname === '/v1/development/goals' && next.searchParams.get('learnerId') === goal.learnerId && next.searchParams.get('cursor') === cursor;
    });
    await more.click(); response = await requested;
  }
  await expect(row).toHaveCount(1);
  const disclosure = section.locator('.development-goal-records'); await expect(disclosure).toHaveCount(1);
  if (await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
  await expect(row).toBeVisible();
  await expect(row.getByRole('heading', { name: goal.title, level: 3, exact: true })).toBeVisible();
  await expect(row.locator('.development-eyebrow')).toHaveText(goal.courseTitle);
  await expect(row).toContainText(goal.plannedStep);
  await expect(row.locator('.development-goal__context')).toContainText('Record revision: ' + goal.revision);
  if (goal.review !== null) await expect(row.locator('.development-goal__reflection')).toContainText(goal.review);
  return row;
}

test('student records reviews and closes an own learning goal in English and Arabic', async ({ page }) => {
  test.setTimeout(90000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const student = accounts.find(account => account.role === 'student')!;
  const title = `My checking goal ${new Date().toISOString()}`;
  const plannedStep = 'Review the school example and explain one check.';
  const review = 'I compared one step and closed this goal.';
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(student.email); await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page); await openTrailWorkspace(page, 'Development');
  const section = page.getByRole('region', { name: 'Learning goals', exact: true });
  await section.getByRole('button', { name: 'Record a learning goal', exact: true }).click();
  let form = section.getByRole('region', { name: 'Record a learning goal', exact: true });
  await expect.poll(async () => form.getByLabel('Course', { exact: true }).locator('option').count()).toBeGreaterThan(1);
  await selectCurrentGoalCourse(page, section, form);
  await form.getByLabel('My goal').fill(title); await form.getByLabel('Planned next step').fill(plannedStep);
  await expect(section.getByRole('status').filter({ hasText: 'Loading goals…' })).toHaveCount(0);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/development/goals' && response.request().method() === 'POST');
  const createdRead = currentGoalRead(page);
  await form.getByRole('button', { name: 'Save', exact: true }).click(); const saved = await response; expect(saved.ok()).toBe(true);
  expect(saved.request().postDataJSON()).toMatchObject({ courseId, referenceId: null, title, plannedStep });
  const goal = learnerGoalSchema.parse(await saved.json());
  expect(goal).toMatchObject({ learnerId, courseId, courseTitle, referenceId: null, title, revision: 1, plannedStep, status: 'ACTIVE', review: null, reviewedAt: null });
  const row = await openCurrentGoal(page, section, goal, createdRead);
  await row.getByRole('button', { name: 'Review my goal', exact: true }).click();
  form = row.getByRole('region', { name: 'Review my goal', exact: true });
  await form.getByLabel('Goal state').selectOption('CLOSED'); await form.getByLabel('What I reviewed').fill(review);
  await form.getByLabel('I confirm this is my own review').check();
  const reviewed = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/development/goals/${goal.id}/review` && response.request().method() === 'POST');
  const closedRead = currentGoalRead(page);
  await form.getByRole('button', { name: 'Save', exact: true }).click(); const reviewResponse = await reviewed; expect(reviewResponse.ok()).toBe(true);
  expect(reviewResponse.request().postDataJSON()).toMatchObject({ expectedRevision: goal.revision, status: 'CLOSED', review, confirmReview: true });
  const closedGoal = learnerGoalSchema.parse(await reviewResponse.json());
  expect(closedGoal).toMatchObject({ id: goal.id, learnerId, courseId, courseTitle, referenceId: null, title, plannedStep, createdAt: goal.createdAt, revision: goal.revision + 1, status: 'CLOSED', review });
  expect(closedGoal.revisionId).not.toBe(goal.revisionId); expect(closedGoal.reviewedAt).not.toBeNull();
  await openCurrentGoal(page, section, closedGoal, closedRead);
  await expect(row).toContainText('Closed'); await expect(row.getByRole('button', { name: 'Review my goal', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});