import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requirePilotReceipt } from '../../scripts/database/browser-pilot-volume-rules';

const root = resolve(import.meta.dirname, '../..');
type Scope = { status: string; runId: string; actual: { students: number; classes: number; assessments: number; portfolios: number; messages: number; announcements: number }; totals: { schoolAssessments: number; learnerNativeResults: number; learnerPortfolioItems: number }; originalAuthAccounts: number; newAuthAccounts: number; schoolId: string; classId: string; learnerId: string; courseId: string; roomId: string };
type Timing = { scenario: string; durationMs: number; renderedRows: number };

test('pilot browser volume: current class/state, source learning, large community and parent-approved portfolios', async ({ page }, info) => {
  test.skip(process.env.CUEVO_REQUIRE_BROWSER_PILOT_VOLUME !== '1', 'Committed guarded pilot fixture requires its own exclusive window.');
  test.setTimeout(300000); page.setDefaultTimeout(15000);
  const scope = JSON.parse(await readFile(resolve(root, '.local/customer-readiness/browser-pilot-volume/scope.json'), 'utf8')) as Scope;
  const setup = JSON.parse(await readFile(resolve(root, '.local/customer-readiness/browser-pilot-volume/setup.json'), 'utf8')) as { status: string; runId: string };
  requirePilotReceipt(setup, scope);
  expect(scope.status).toBe('READY'); expect(scope.actual.students).toBe(500); expect(scope.actual.classes).toBe(30);
  expect(scope.actual.assessments).toBeGreaterThanOrEqual(100); expect(scope.actual.portfolios).toBe(scope.actual.assessments);
  expect(scope.actual.messages).toBe(1000); expect(scope.actual.announcements).toBe(1000); expect(scope.newAuthAccounts).toBe(0);
  const accounts = JSON.parse(await readFile(resolve(root, '.local/synthetic-accounts.json'), 'utf8')) as { role: string; email: string; password: string }[];
  const timing: Timing[] = []; const payloads: { route: string; byteSize: number; status: number }[] = []; const pending = new Set<Promise<void>>();
  const health = { pageErrors: 0, hydrationWarnings: 0, otherFailedRequests: 0, abortedRequests: 0, externalHttpRequests: 0 }; let status = 'FAILED'; let phase = 'teacher';
  page.on('pageerror', () => health.pageErrors++);
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && /hydration|hydrated|server rendered|React error #418/i.test(message.text())) health.hydrationWarnings++; });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) health.externalHttpRequests++; });
  page.on('requestfailed', request => { if (request.url().startsWith('http://localhost:4000/v1/')) { if (/abort|cancel/i.test(request.failure()?.errorText ?? '')) health.abortedRequests++; else health.otherFailedRequests++; } });
  page.on('response', response => {
    if (!response.url().startsWith('http://localhost:4000/v1/')) return;
    const task = (async () => { const bytes = await response.body().catch(() => undefined); if (bytes) payloads.push({ route: new URL(response.url()).pathname.replace(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi, ':id'), byteSize: bytes.length, status: response.status() }); })();
    pending.add(task); void task.finally(() => pending.delete(task));
  });
  async function settled() { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|Checking current child relationships)/ })).toHaveCount(0); await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
  async function login(role: string) {
    const account = accounts.find(account => account.role === role)!;
    await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, role); await settled();
  }
  async function navigate(name: string) { await page.locator('.workspace-chrome__navigation').getByRole('button', { name, exact: true }).click(); if (name !== 'Overview') await expect(page.locator('main h1')).toHaveText(name); await settled(); }
  async function measure(scenario: string, action: () => Promise<unknown>, rows: Locator) { const start = performance.now(); await action(); await settled(); timing.push({ scenario, durationMs: Math.round((performance.now() - start) * 100) / 100, renderedRows: await rows.count() }); }
  async function nextPages(container: Locator, rows: Locator, expectedAtLeast: number) {
    const identities = () => rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-post-id') ?? element.getAttribute('data-portfolio-id') ?? element.getAttribute('data-class-learner-id') ?? element.querySelector('h3')?.textContent?.trim() ?? ''));
    for (let index = 0; index < 30 && await rows.count() < expectedAtLeast; index++) {
      const before = await rows.count(); const more = container.getByRole('button', { name: 'Load more', exact: true }).first();
      await expect(more).toBeVisible();
      await measure('visible-load-more-render', async () => { await more.click(); await expect.poll(() => rows.count()).toBeGreaterThan(before); }, rows);
      const current = await identities(); expect(current.every(Boolean)).toBe(true); expect(new Set(current).size).toBe(current.length);
    }
    expect(await rows.count()).toBeGreaterThanOrEqual(expectedAtLeast);
  }
  const directory = resolve(root, '.local/customer-readiness/browser-pilot-volume'); await mkdir(directory, { recursive: true });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await login('teacher');
    for (let index = 0; index < 5; index++) {
      await navigate('Overview');
      await measure('teacher-class-evidence-navigation', () => navigate('Progress'), page.locator('[data-class-learner-id]'));
      const response = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/classes/${scope.classId}/learning-summary`);
      await measure('class-evidence-25-of-large-roster', () => page.getByLabel('Class', { exact: true }).selectOption(scope.classId), page.locator('[data-class-learner-id]'));
      const summary = await (await response).json(); expect(summary.items.length).toBe(25); expect(summary.nextCursor).toBeTruthy();
      const firstIds = await page.locator('[data-class-learner-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-class-learner-id')));
      await measure('class-evidence-next-page-render', () => page.getByRole('button', { name: 'Next class page', exact: true }).click(), page.locator('[data-class-learner-id]'));
      const secondIds = await page.locator('[data-class-learner-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-class-learner-id'))); expect(secondIds.some(id => firstIds.includes(id))).toBe(false);
      await page.getByRole('button', { name: 'Return to first class page', exact: true }).click(); await settled();
      const row = page.locator(`[data-class-learner-id="${scope.learnerId}"]`);
      const stateResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/learners/${scope.learnerId}/state`);
      await measure('learner-state-100-native-evidence-render', async () => { await row.getByRole('button', { name: 'Review this learner', exact: true }).click(); await expect(page.getByRole('heading', { name: /^Current learner evidence · Lina/ })).toBeFocused(); }, page.locator('.progress-workspace [data-result-id]'));
      const state = await (await stateResponse).json(); expect(state.academic.length).toBe(100); expect(state.projection.academic.totalCount).toBe(scope.totals.learnerNativeResults); expect(state.projection.academic.truncated).toBe(true);
      await navigate('Overview'); await measure('teacher-marking-large-source-page', () => navigate('Academic'), page.locator('.marking-queue__item'));
      expect(await page.locator('.marking-queue__item').count()).toBeGreaterThanOrEqual(100);
    }
    await page.screenshot({ path: resolve(directory, 'teacher-source-page.png') });
    await signOutTrailWorkspace(page); phase = 'student'; await login('student');
    for (let index = 0; index < 5; index++) {
      await navigate('Overview'); await measure('student-learning-large-assessment-page', () => navigate('Learning'), page.locator('.course-list > li'));
      await page.getByRole('button', { name: 'Assessments', exact: true }).click(); await settled(); expect(await page.locator('.assessment-section').count()).toBe(100);
      await nextPages(page.locator('.learning-workspace'), page.locator('.assessment-section'), scope.actual.assessments);
      await navigate('Overview'); await measure('student-community-1000-history-first-page', () => navigate('Community'), page.locator('.community-room'));
      await measure('student-community-100-visible-messages', async () => { await page.locator(`[data-room-id="${scope.roomId}"]`).getByRole('button', { name: 'Open discussion', exact: true }).click(); }, page.locator('[data-post-id]'));
      expect(await page.locator('[data-post-id]').count()).toBe(100);
      await nextPages(page.locator('.community-discussion'), page.locator('[data-post-id]'), 200);
      await navigate('Overview'); await measure('student-portfolio-large-first-page', () => navigate('Portfolio'), page.locator('[data-portfolio-id]'));
      expect(await page.locator('[data-portfolio-id]').count()).toBe(100);
      await nextPages(page.locator('.portfolio-workspace'), page.locator('[data-portfolio-id]'), scope.actual.portfolios);
    }
    await page.screenshot({ path: resolve(directory, 'student-large-portfolio.png') });
    const ownItem = page.locator('[data-portfolio-id]').last(); await ownItem.getByRole('button', { name: 'Source work', exact: true }).click(); await expect(ownItem.getByRole('region', { name: 'Source work', exact: true })).toContainText('Synthetic explanation imported for browser pilot volume.');
    await signOutTrailWorkspace(page); phase = 'parent'; await login('parent');
    for (let index = 0; index < 5; index++) {
      await navigate('Overview'); await measure('parent-notification-1000-history-first-page', async () => { await navigate('Community'); await page.getByRole('button', { name: 'Notifications', exact: true }).click(); }, page.locator('.community-post'));
      expect(await page.locator('.community-post').count()).toBe(100); await nextPages(page.locator('.community-workspace'), page.locator('.community-post'), 200);
      await navigate('Overview'); await measure('parent-approved-large-portfolio', async () => { await navigate('Portfolio'); await expect(page.locator('[data-portfolio-id]')).toHaveCount(100); }, page.locator('[data-portfolio-id]'));
      expect(await page.locator('[data-portfolio-id]').count()).toBe(100); await nextPages(page.locator('.portfolio-workspace'), page.locator('[data-portfolio-id]'), scope.actual.portfolios);
      expect(await page.getByRole('button', { name: 'Create reflection revision', exact: true }).count()).toBe(0);
    }
    await page.screenshot({ path: resolve(directory, 'parent-approved-portfolio.png') });
    await Promise.allSettled([...pending]); expect(health.pageErrors).toBe(0); expect(health.hydrationWarnings).toBe(0); expect(health.otherFailedRequests).toBe(0); expect(health.externalHttpRequests).toBe(0); expect(payloads.filter(row => row.status >= 400)).toHaveLength(0); status = 'MEASURED';
  } finally {
    await Promise.allSettled([...pending]);
    const names = [...new Set(timing.map(row => row.scenario))];
    const summaries = names.map(scenario => { const rows = timing.filter(row => row.scenario === scenario).sort((a, b) => a.durationMs - b.durationMs); return { scenario, sampleCount: rows.length, medianMs: rows.length % 2 ? rows[Math.floor(rows.length / 2)].durationMs : (rows[rows.length / 2 - 1].durationMs + rows[rows.length / 2].durationMs) / 2, p95Ms: rows[Math.ceil(rows.length * 0.95) - 1].durationMs, maxRenderedRows: Math.max(...rows.map(row => row.renderedRows)) }; });
    await writeFile(resolve(directory, 'browser.json'), JSON.stringify({ schemaVersion: 1, status, phase, runId: scope.runId, actual: scope.actual, simultaneousAuthUsers: 1, availableOriginalAuthAccounts: scope.originalAuthAccounts, newAuthAccounts: 0, browser: info.project.name, source: 'LOCAL_PRODUCTION_WEB_REAL_HTTP_NO_INJECTED_RESPONSES', timing: summaries, samples: timing, payloads, health, gaps: ['No 500 concurrent Auth sessions.', 'Text search control unavailable; actual class filters/pagination measured.', 'Notification/message history imported, not rate-limited creation throughput.', 'Only first two message/notice pages rendered; full 1000 traversal not measured.', 'No isolated database latency or hosted SLA.', 'No live provider or official curriculum acceptance.'], restoration: 'ROOT_GUARDED_REFERENCE_BOOTSTRAP_REQUIRED' }, null, 2) + '\n');
  }
});
