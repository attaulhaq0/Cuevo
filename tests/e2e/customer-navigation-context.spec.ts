import { attachDiagnosticPreservingFailure, serializeFailureDiagnostic } from './course-objective-diagnostics';
import { observeProgressFocus } from './progress-focus-diagnostics';
import { expectTrailWorkspace, openTrailWorkspace } from './trail-workspace';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectHumanChoice } from './human-choice';

const root = resolve(import.meta.dirname, '../..');
async function login(page: Page) {
  const accounts = JSON.parse(await readFile(resolve(root, '.local/synthetic-accounts.json'), 'utf8')) as { role: string; email: string; password: string }[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(teacher.email); await page.getByLabel('Password', { exact: true }).fill(teacher.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
}
async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0); }

test('switching language clears the previous-language saved action notice', async ({ page }) => {
  await login(page);
  await openTrailWorkspace(page, 'Community');
  await page.getByRole('button', { name: 'Create teacher-led room', exact: true }).click();
  const form = page.getByRole('region', { name: 'Create teacher-led room', exact: true });
  await form.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' });
  await form.getByLabel('Room name', { exact: true }).fill('Language confirmation checking');
  await form.getByLabel('Room type', { exact: true }).selectOption('GROUP');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  const notice = page.locator('.workspace-main > .notice[role="status"]');
  await expect(notice).toContainText('Saved.');
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'غرف الصف والمجموعات', level:1, exact: true })).toBeVisible();
});

test('class review brings the current named learner detail into keyboard focus and preserves refresh focus', async ({ page }) => {
  const focusDiagnostic=observeProgressFocus(page,'http://localhost:4000');
  await login(page); await openTrailWorkspace(page, 'Progress'); await settled(page);
  await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' });
  const row = page.locator('[data-class-learner-id]').filter({ has: page.getByRole('heading', { name: 'Lina Al-Kuwari', exact: true }) });
  await row.getByRole('button', { name: 'Review this learner', exact: true }).focus(); await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: 'Current learner evidence · Lina Al-Kuwari · Year 1 · Cedar · Year 1 · 2026–2027', exact: true });
  await expect(heading).toBeFocused(); await expect(heading).toBeInViewport();
  const refresh = page.getByRole('button', { name: 'Refresh learner state', exact: true }); await refresh.click(); await settled(page); await expect(refresh).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button',{name:'العودة إلى الطلاب',exact:true}).click();
  await row.getByRole('button', { name: 'مراجعة هذا الطالب', exact: true }).focus(); await page.keyboard.press('Enter');
  const arabic = page.getByRole('heading',{level:2,name:/^شواهد الطالب الحالي · Lina Al-Kuwari(?: ·|$)/}); await attachDiagnosticPreservingFailure(async()=>{await expect(arabic).toBeFocused();await expect(arabic).toBeInViewport()},async()=>{const safe=serializeFailureDiagnostic(await focusDiagnostic(/^شواهد الطالب الحالي · Lina Al-Kuwari(?: ·|$)/));console.log(safe);await test.info().attach('progress-focus-source',{contentType:'application/json',body:safe})});
});

test('class review announces the named denied or unknown detail and class choices retain exact year context', async ({ page }) => {
  await login(page); await openTrailWorkspace(page, 'School'); await settled(page);
  const classOption = 'Year 1 · Cedar · Year 1 · 2026–2027';
  const schoolClassOption = 'Class: Year 1 · Cedar · Year group: Year 1 · Academic year: 2026–2027';
  await selectHumanChoice(page.getByLabel('Daily class records', { exact: true }),schoolClassOption,'30000000-0000-4000-8000-000000000001');
  await page.getByRole('button', { name: 'Record attendance', exact: true }).click();
  await expect(page.getByRole('region',{name:'Review one attendance record',exact:true})).toContainText('Year 1 · Cedar');await expect(page.getByLabel('Daily class records',{exact:true})).toHaveValue('30000000-0000-4000-8000-000000000001');
  await openTrailWorkspace(page, 'Progress'); await settled(page);
  await page.getByLabel('Class', { exact: true }).selectOption({ label: classOption });
  const row = page.locator('[data-class-learner-id]').filter({ has: page.getByRole('heading', { name: 'Lina Al-Kuwari', exact: true }) });
  const route = '**/v1/learners/*/state';
  await page.route(route, intercepted => intercepted.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'FORBIDDEN', message: 'Current source unavailable.' }) }));
  await row.getByRole('button', { name: 'Review this learner', exact: true }).click();
  const heading = page.getByRole('heading', { name: /^Current learner evidence · Lina Al-Kuwari/ }); await expect(heading).toBeFocused();
  const detail = page.getByRole('region', { name: /^Current learner evidence · Lina Al-Kuwari/ }); await expect(detail.getByRole('alert')).toBeVisible();
  await page.unroute(route);
  await page.route(route, intercepted => intercepted.fulfill({ contentType: 'application/json', body: JSON.stringify({ learnerId: '20000000-0000-4000-8000-000000000012', status: 'UNKNOWN', generatedAt: null, version: null, academic: [], development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [] }, impact: { status: 'unmeasured', measurementIds: [], outcomes: [] }, sourceEventIds: [] }) }));
  await page.getByRole('button',{name:'Back to learners',exact:true}).click();
  await row.getByRole('button', { name: 'Review this learner', exact: true }).click(); await expect(heading).toBeFocused(); await expect(detail.getByText('Not yet measured', { exact: true }).first()).toBeVisible();
});
