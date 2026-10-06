import { expect, type Locator, type Page } from '@playwright/test';

/** Exact API receipt/source identity verifies one human-labelled current directory control. */
export async function currentProposalChoice(page: Page, id: string): Promise<Locator> {
  expect(id, 'An actual proposal receipt/source UUID is required').toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  const workspace = page.locator('.improvement-workspace');
  const choice = workspace.locator(`[data-proposal-choice="${id}"]`);
  const more = workspace.locator(':scope > .pagination-actions').getByRole('button', { name: /^(Load more|تحميل المزيد)$/, exact: true });
  await expect(page.getByText('Loading next steps…', { exact: true })).toHaveCount(0);
  await expect.poll(async () => await choice.count() > 0 || await more.count() > 0, { message: 'Wait for the current proposal directory or its own continuation.' }).toBe(true);
  for (let part = 0; !await choice.count() && part < 30; part++) {
    await expect(more, 'The current proposal page must remain reachable through its own continuation').toHaveCount(1);
    const response = page.waitForResponse(item => new URL(item.url()).pathname === '/v1/recommendations' && item.request().method() === 'GET');
    await more.click(); expect((await response).ok()).toBe(true);
    await expect(workspace.getByRole('button', { name: /^(Loading more…|جارٍ تحميل المزيد…)$/, exact: true })).toHaveCount(0);
    await expect.poll(async () => await choice.count() > 0 || await more.count() > 0, { message: 'The received current proposal page must commit its row or continuation.' }).toBe(true);
  }
  await expect(choice).toHaveCount(1);
  await expect(choice.locator('strong')).not.toBeEmpty();
  await expect(choice.locator('strong')).not.toHaveText(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  return choice;
}

export async function openCurrentProposal(page: Page, id: string): Promise<Locator> {
  const selected = page.locator(`.proposal-selected [data-recommendation-id="${id}"]`);
  if (await selected.count()) { await expect(selected).toBeVisible(); return selected; }
  const existing = page.locator('.proposal-selected');
  if (await existing.count()) await existing.getByRole('button', { name: /^(Back to proposals|العودة إلى المقترحات)$/, exact: true }).click();
  const choice = await currentProposalChoice(page, id);
  await expect(choice).toBeVisible(); await expect(choice).toBeEnabled(); await choice.click();
  await expect(selected).toHaveCount(1); await expect(selected).toBeVisible();
  return selected;
}
