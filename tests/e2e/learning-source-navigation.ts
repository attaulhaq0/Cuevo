import { expect, type Locator, type Page } from '@playwright/test';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type StaffAssessmentSource = { id: string; courseId: string; title: string; courseTitle: string; status?: 'DRAFT' | 'PUBLISHED' };

/** Current read settlement is distinct from a deliberately hidden mobile outline. */
export async function currentCoursePreparationOutline(page: Page): Promise<Locator> {
  const course = page.locator('.course-view');
  await expect(course).toHaveCount(1);
  await expect(course.getByRole('status').filter({ hasText: /^(Loading learning…|جارٍ تحميل التعلّم…)/ })).toHaveCount(0);
  await expect(course.getByRole('alert')).toHaveCount(0);
  const outline = course.getByRole('navigation', { name: /^(Course structure|بنية المقرر)$/, exact: true, includeHidden: true });
  await expect(outline).toHaveCount(1);
  if (!await outline.isVisible()) {
    const back = course.getByRole('button', { name: /^(Back to course structure|العودة إلى بنية المقرر)$/, exact: true });
    await expect(back).toHaveCount(1); await expect(back).toBeVisible(); await expect(back).toBeEnabled(); await back.click();
  }
  await expect(outline).toBeVisible();
  return outline;
}

/** Open a human-labelled current staff choice and verify its independent receipt identity. */
export async function openCurrentStaffAssessment(page: Page, source: StaffAssessmentSource): Promise<Locator> {
  expect(source.id).toMatch(uuid); expect(source.courseId).toMatch(uuid);
  for (const label of [source.title, source.courseTitle]) { expect(label.trim().length).toBeGreaterThan(0); expect(label.length).toBeLessThanOrEqual(200); expect(label).not.toMatch(uuid); }
  const workspace = page.locator('.learning-workspace'); await expect(workspace).toHaveCount(1);
  const choice = workspace.locator(`[data-assessment-choice="${source.id}"]`);
  const more = workspace.locator(':scope > .pagination-actions').getByRole('button', { name: /^(Load more|تحميل المزيد)$/, exact: true });
  const seen = new Set<string>();
  await expect(workspace.getByRole('status').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0);
  await expect(workspace.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => await choice.count() > 0 || await more.count() > 0, { message: 'The current assessment directory or its own continuation must be available.' }).toBe(true);
  for (let part = 0; !await choice.count(); part++) {
    expect(part, 'Current assessment source continuation is bounded').toBeLessThan(30);
    await expect(more).toHaveCount(1); await expect(more).toBeEnabled();
    const requested = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/assessments');
    await more.click(); const response = await requested; expect(response.ok()).toBe(true);
    const cursor = new URL(response.url()).searchParams.get('cursor'); if (cursor !== null) expect(cursor).toMatch(uuid);
    const value = await response.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(Array.isArray(value.items) && value.items.length <= 100).toBe(true);
    expect(value.nextCursor === null || typeof value.nextCursor === 'string' && uuid.test(value.nextCursor)).toBe(true);
    if (value.nextCursor) { expect(value.nextCursor).not.toBe(cursor); expect(seen.has(value.nextCursor)).toBe(false); seen.add(value.nextCursor); }
    for (const row of value.items) { expect(row.id).toMatch(uuid); await expect(workspace.locator(`[data-assessment-choice="${row.id}"]`)).toHaveCount(1); }
    await expect(workspace.getByRole('button', { name: /^(Loading more…|جارٍ تحميل المزيد…)$/, exact: true })).toHaveCount(0);
    await expect(workspace.getByRole('alert')).toHaveCount(0);
    if (value.nextCursor === null) await expect(more).toHaveCount(0);
  }
  await expect(choice).toHaveCount(1);
  await expect(choice.locator('strong')).toHaveText(source.title);
  await expect(choice.locator('small').first()).toHaveText(source.courseTitle);
  const directory = choice.locator('xpath=ancestor::section[contains(@class,"learning-staff-directory")]');
  const sameContext = directory.locator('[data-assessment-choice]').filter({ has: page.getByText(source.title, { exact: true }) }).filter({ has: page.getByText(source.courseTitle, { exact: true }) });
  await expect(sameContext, 'The task and current course context identify one visible choice').toHaveCount(1);
  const disclosure = directory.locator('.learning-staff-choice-disclosure'); await expect(disclosure).toHaveCount(1);
  if (await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
  const button = choice.getByRole('button'); await expect(button).toHaveCount(1); await expect(button).toBeVisible(); await expect(button).toBeEnabled();
  const requested = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/v1/assessments/${source.id}`);
  await button.click(); const response = await requested; expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ id: source.id, courseId: source.courseId, title: source.title, courseTitle: source.courseTitle, ...(source.status ? { status: source.status } : {}) });
  await expect(button).toHaveAttribute('aria-current', 'true');
  const reader = workspace.locator(`.assessment-section[data-assessment-id="${source.id}"]`); await expect(reader).toHaveCount(1); await expect(reader).toBeVisible();
  await expect(reader.getByRole('heading', { name: source.title, exact: true, level: 2 })).toBeVisible();
  return reader;
}
