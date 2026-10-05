import { expectTrailWorkspace, openTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { classLearningSummarySchema } from '@cuevo/contracts';
import { selectHumanChoice } from './human-choice';

type Account = { role: string; email: string; password: string };
test('coordinator reviews a source-linked class page with native evidence, separate recorded observations and unknown coverage', async ({ page }) => {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const account = accounts.find(item => item.role === 'coordinator')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
  await openTrailWorkspace(page,'Progress');
  const panel = page.getByRole('region', { name: 'Class evidence and support', exact: true }); await expect(panel).toBeVisible();
  const selector = panel.getByLabel('Class', { exact: true });
  const requested = page.waitForResponse(response => response.url().includes('/learning-summary?') && response.request().method() === 'GET');
  await selectHumanChoice(selector,'Year 1 · Cedar · Year 1 · 2026–2027','30000000-0000-4000-8000-000000000001');
  const response = await requested; expect(response.ok()).toBe(true); const summary = classLearningSummarySchema.parse(await response.json());
  expect(summary.classId).toBe('30000000-0000-4000-8000-000000000001'); expect(summary.coverage).toBe('NOT_ESTABLISHED');
  await expect(panel.locator('.coordinator-class-context > summary')).toHaveText('Coverage is not established · Recorded learning actions only');
  expect(summary.items.length).toBeGreaterThan(0);
  for (const learner of summary.items) {
    const row = panel.locator(`[data-class-learner-id="${learner.learnerId}"]`); await expect(row).toContainText(learner.learnerName);
    await expect(row.getByRole('button', { name: 'Review this learner', exact: true })).toBeVisible();
  }
  const sourceLearner = summary.items.find(learner => learner.academic.sources.length)!; expect(sourceLearner).toBeDefined();
  const row = panel.locator(`[data-class-learner-id="${sourceLearner.learnerId}"]`);
  await row.getByRole('button', { name: 'Show class record sources', exact: true }).click();
  const source = sourceLearner.academic.sources[0];const sourceRecord=row.locator('.class-native-source').filter({hasText:source.resultId});await expect(sourceRecord).toHaveCount(1);await sourceRecord.locator('details > summary').click();await expect(sourceRecord.getByText(source.resultId,{exact:true})).toBeVisible();await expect(sourceRecord.getByText(source.referenceVersion,{exact:true})).toBeVisible();
  await row.getByRole('button', { name: 'Review this learner', exact: true }).click();
  await expect(page.getByRole('heading',{level:2,name:new RegExp('^Current learner evidence · '+sourceLearner.learnerName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: ·|$)')})).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Academic evidence', exact: true })).toBeVisible();
});
