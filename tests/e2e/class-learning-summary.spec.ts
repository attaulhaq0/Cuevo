import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { classLearningSummarySchema } from '@cuevo/contracts';

type Account = { role: string; email: string; password: string };
test('coordinator reviews a source-linked class page with native evidence, separate recorded observations and unknown coverage', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const account = accounts.find(item => item.role === 'coordinator')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Review evidence and outcomes', exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'Class evidence and support', exact: true }); await expect(panel).toBeVisible();
  const selector = panel.getByLabel('Class', { exact: true });
  const requested = page.waitForResponse(response => response.url().includes('/learning-summary?') && response.request().method() === 'GET');
  await selector.selectOption('30000000-0000-4000-8000-000000000001');
  const response = await requested; expect(response.ok()).toBe(true); const summary = classLearningSummarySchema.parse(await response.json());
  expect(summary.classId).toBe('30000000-0000-4000-8000-000000000001'); expect(summary.coverage).toBe('NOT_ESTABLISHED');
  await expect(panel.getByText('Coverage is not established', { exact: true })).toBeVisible();
  await expect(panel.getByText('Recorded learning actions only', { exact: true })).toBeVisible();
  expect(summary.items.length).toBeGreaterThan(0);
  for (const learner of summary.items) {
    const row = panel.locator(`[data-class-learner-id="${learner.learnerId}"]`); await expect(row).toContainText(learner.learnerName);
    await expect(row.getByRole('button', { name: 'Review this learner', exact: true })).toBeVisible();
  }
  const sourceLearner = summary.items.find(learner => learner.academic.sources.length)!; expect(sourceLearner).toBeDefined();
  const row = panel.locator(`[data-class-learner-id="${sourceLearner.learnerId}"]`);
  await row.getByRole('button', { name: 'Show class record sources', exact: true }).click();
  const source = sourceLearner.academic.sources[0]; await expect(row).toContainText(source.resultId); await expect(row).toContainText(source.referenceVersion);
  await row.getByRole('button', { name: 'Review this learner', exact: true }).click();
  await expect(page.locator('#learner-selection')).toHaveValue(sourceLearner.learnerId);
  await expect(page.getByRole('heading', { name: 'Academic evidence', exact: true })).toBeVisible();
});
