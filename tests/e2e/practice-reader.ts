import { expect, type Locator, type Page } from '@playwright/test';

/** Open only an exact current task source already identified by an API receipt/read. */
export async function currentPracticeChoice(page: Page, id: string): Promise<Locator> {
  expect(id, 'An actual intervention source UUID is required').toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  const workspace = page.locator('.improvement-workspace');
  const choice = workspace.locator(`[data-practice-choice="${id}"]`);
  const more = workspace.locator(':scope > .pagination-actions').getByRole('button', { name: /^(Load more|تحميل المزيد)$/, exact: true });
  await expect(page.getByText('Loading next steps…', { exact: true })).toHaveCount(0);
  await expect.poll(async () => await choice.count() > 0 || await more.count() > 0, { message: 'Wait for the current practice directory or its own continuation.' }).toBe(true);
  for (let part = 0; !await choice.count() && part < 30; part++) {
    await expect(more, 'Current task continuation must identify one source control').toHaveCount(1);
    const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/interventions' && response.request().method() === 'GET');
    await more.click(); expect((await requested).ok()).toBe(true);
    await expect(workspace.getByRole('button', { name: /^(Loading more…|جارٍ تحميل المزيد…)$/, exact: true })).toHaveCount(0);
    await expect.poll(async () => await choice.count() > 0 || await more.count() > 0, { message: 'The received current task page must commit its row or continuation.' }).toBe(true);
  }
  await expect(choice).toHaveCount(1); await expect(choice.locator('strong')).not.toBeEmpty();
  await expect(choice.locator('strong')).not.toHaveText(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  return choice;
}

export async function openCurrentPractice(page: Page, id: string): Promise<Locator> {
  const selected = page.locator(`.practice-selected [data-intervention-id="${id}"]`);
  if (await selected.count()) { await expect(selected).toBeVisible(); return selected; }
  const existing = page.locator('.practice-selected');
  if (await existing.count()) await existing.getByRole('button', { name: /^(Back to practice tasks|العودة إلى مهام التدريب)$/, exact: true }).click();
  const choice = await currentPracticeChoice(page, id);
  await expect(choice).toBeVisible(); await expect(choice).toBeEnabled(); await choice.click();
  await expect(selected).toHaveCount(1); await expect(selected).toBeVisible();
  return selected;
}
