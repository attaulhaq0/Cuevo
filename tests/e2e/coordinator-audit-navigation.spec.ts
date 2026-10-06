import { expect, test, type Page } from '@playwright/test';
import { expectTrailWorkspace } from './trail-workspace';

// Intercepted synthetic presentation only. No source mutation, actual API
// authorization or database acceptance is established by these journeys.
const actor = 'c1100000-0000-4000-8000-000000000001';
const school = 'c1200000-0000-4000-8000-000000000001';
const id = (index: number) => `c1300000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const outcome = (index: number) => ({
  id: id(index), interventionId: id(index + 10), baselineResultId: id(index + 20), followUpResultId: id(index + 30),
  measuredAt: '2026-10-03T10:00:00Z', status: 'improved', baseline: { score: 3, maxScore: 10 }, followUp: { score: 5, maxScore: 10 },
  difference: 2, minimumChange: 1, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF',
  context: { status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK', learnerId: id(index + 40), identityRequiresReview: false,
    learnerName: index === 1 ? 'Alex Hassan' : 'Mariam Ahmed', className: 'Cedar', yearGroupName: 'Year 4', academicYearName: '2026–2027', courseTitle: 'Reasoning',
    practiceTitle: index === 1 ? 'Check one step' : 'Compare the next method', baselineAssessmentTitle: 'Before checking', followUpAssessmentTitle: 'After checking',
    baselineSubmittedAt: '2026-10-01T10:00:00Z', followUpSubmittedAt: '2026-10-02T10:00:00Z' },
});
const auditRows = (start: number, prefix = 'Current school record') => Array.from({ length: 25 }, (_, index) => ({
  id: id(start + index), actorName: 'Mariam Al-Nuaimi', action: 'school.guardian.configure', objectType: 'school_operation',
  objectId: id(start + index + 100), objectName: `${prefix} ${start + index}`, outcome: 'succeeded',
  occurredAt: new Date(Date.UTC(2026, 9, 4, 10, index)).toISOString(), requestId: id(start + index + 200),
}));
type ReadResult = { status?: number; data: unknown };
type ReadHandler = (url: URL) => Promise<ReadResult> | ReadResult;

async function syntheticWorkspace(page: Page, role: 'coordinator' | 'admin', view: 'improvement' | 'school', read: ReadHandler) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const blocked: string[] = [], errors: string[] = [], reads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !/status of (403|503)/.test(message.text())) errors.push(message.text()); });
  await page.context().routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const login = url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
    if (login) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'fictional-coordinator-audit-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fictional-coordinator-audit-refresh', user: { id: actor, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }) });
      return;
    }
    if (request.method() !== 'GET') { blocked.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
    if (url.pathname.startsWith('/v1/')) {
      reads.push(url.pathname + url.search);
      let result: ReadResult;
      if (url.pathname === '/v1/me') result = { data: { userId: actor, schoolId: school, membershipId: id(999), role, displayName: role === 'coordinator' ? 'Nadia Hassan' : 'Mariam Al-Nuaimi', school: { id: school, name: 'Reference school' }, entitlements: ['learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'portfolio', 'community', 'school.operations', 'school.context'] } };
      else if (url.pathname === '/v1/diagnostics/config') result = { data: { enabled: false } };
      else if (url.pathname === '/v1/school/context') result = { data: { school: { id: school, name: 'Reference school', countryCode: 'QA', languages: ['en', 'ar'] }, policy: { version: 0, parentAttendanceVisible: false, parentUpcomingVisible: false, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false }, intelligence: { fixtureSchoolApproved: false, liveSchoolApproved: false, availability: 'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED' } } };
      else result = await read(url);
      await route.fulfill({ status: result.status ?? 200, contentType: 'application/json', body: JSON.stringify(result.data) });
      return;
    }
    if (url.origin !== origin || url.pathname.includes('/auth/v1/')) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort(); return; }
    await route.continue();
  });
  await page.goto(`/?view=${view}`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fictional-presentation-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectTrailWorkspace(page, role);
  await expect(page.locator('.workspace-chrome')).toHaveAttribute('data-navigation-mode', 'focused');
  return { blocked, errors, reads };
}

const empty = { items: [], nextCursor: null };

test('Coordinator explicit outcome reading preserves native source values through continuation and mobile Back', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  let nextStatus = 200;
  const state = await syntheticWorkspace(page, 'coordinator', 'improvement', url => {
    if (url.pathname !== '/v1/outcomes') return { data: empty };
    if (!url.searchParams.has('cursor')) return { data: { items: [outcome(1)], nextCursor: id(800) } };
    return nextStatus === 200 ? { data: { items: [outcome(2)], nextCursor: id(801) } } : { status: nextStatus, data: { code: 'FORBIDDEN', requestId: 'synthetic-outcome-page' } };
  });
  const layout = page.locator('.coordinator-outcome-layout'), directory = page.locator('.coordinator-outcome-directory');
  await expect(layout).toHaveAttribute('data-selected', 'false');
  await expect(page.locator('.outcome-reading')).toHaveCount(0);
  const initialWidth = await directory.evaluate(element => element.getBoundingClientRect().width);
  const layoutWidth = await layout.evaluate(element => element.getBoundingClientRect().width);
  expect(Math.abs(initialWidth - layoutWidth)).toBeLessThan(2);
  const opener = directory.locator('li').first().getByRole('button');
  await expect(opener).toHaveText('Read measured outcome');
  await opener.click();
  const reader = page.locator('.coordinator-outcome-selected'), native = reader.locator('.outcome-reading');
  await expect(native).toHaveCount(1);
  await expect(reader.getByRole('heading', { name: 'Selected outcome sources', exact: true })).toBeFocused();
  await expect(native.locator('.outcome-reading__ratio')).toHaveText(['3 / 10', '5 / 10']);
  await expect(native.locator('.outcome-reading__measure dd')).toHaveText(['2', '1']);
  await expect(native).toContainText('Before checking'); await expect(native).toContainText('After checking');
  await expect(native).toContainText('Observed change is not proof that the practice caused the outcome.');
  expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(initialWidth);
  await directory.getByRole('button', { name: 'Load more: Outcomes', exact: true }).click();
  await expect(directory.locator('li')).toHaveCount(2);
  await expect(native.locator('h4')).toHaveText('Check one step');
  await expect(native.locator('.outcome-reading__ratio')).toHaveText(['3 / 10', '5 / 10']);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(directory).toBeHidden(); await expect(reader).toBeVisible();
  await reader.getByRole('button', { name: 'Return to outcome list', exact: true }).click();
  await expect(directory).toBeVisible(); await expect(reader).toHaveCount(0); await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await opener.click(); await expect(directory).toBeHidden(); await expect(reader).toBeVisible();
  await reader.getByRole('button', { name: 'العودة إلى قائمة النتائج', exact: true }).click();
  await expect(directory).toBeVisible(); await expect(opener).toBeFocused();
  await page.getByRole('button', { name: 'English', exact: true }).click(); await page.setViewportSize({ width: 1366, height: 768 });
  await opener.click(); nextStatus = 403;
  await directory.getByRole('button', { name: 'Load more: Outcomes', exact: true }).click();
  await expect(page.locator('.coordinator-outcomes [role="alert"]')).toBeVisible();
  await expect(directory).toHaveCount(0); await expect(reader).toHaveCount(0); await expect(page.locator('.outcome-reading')).toHaveCount(0);
  await expect(page.locator('.coordinator-outcomes')).not.toContainText('Alex Hassan');
  await info.attach('outcome-current-denial', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(state.reads.filter(path => path.startsWith('/v1/outcomes'))).toHaveLength(3);
  expect(state.blocked).toEqual([]); expect(state.errors).toEqual([]);
});

test('Admin Audit moves only after admitted cursor success, revisits loaded pages and clears denied browsing', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  let mode: 'normal' | 'outage' | 'denied' | 'fresh' = 'normal';
  let releasePage!: () => void, pageStarted!: () => void, releaseFresh!: () => void, freshStarted!: () => void;
  const heldPage = new Promise<void>(resolve => { releasePage = resolve; }), startedPage = new Promise<void>(resolve => { pageStarted = resolve; });
  const heldFresh = new Promise<void>(resolve => { releaseFresh = resolve; }), startedFresh = new Promise<void>(resolve => { freshStarted = resolve; });
  const state = await syntheticWorkspace(page, 'admin', 'school', async url => {
    if (url.pathname !== '/v1/school/audit') return { data: empty };
    if (!url.searchParams.has('cursor')) {
      if (mode === 'fresh') { freshStarted(); await heldFresh; return { data: { items: auditRows(101, 'Fresh admitted record'), nextCursor: id(803) } }; }
      return { data: { items: auditRows(1), nextCursor: id(800) } };
    }
    if (mode === 'outage' || mode === 'denied') return { status: mode === 'outage' ? 503 : 403, data: { code: mode === 'outage' ? 'REQUEST_UNAVAILABLE' : 'FORBIDDEN', requestId: 'synthetic-audit-page' } };
    pageStarted(); await heldPage;
    return { data: { items: auditRows(26), nextCursor: id(801) } };
  });
  await page.locator('[data-workspace-section="audit"]').click();
  const audit = page.getByRole('region', { name: 'School audit', exact: true }), articles = audit.locator('.school-audit-row');
  const next = audit.getByRole('button', { name: 'Next', exact: true }), previous = audit.getByRole('button', { name: 'Previous', exact: true });
  await expect(articles).toHaveCount(25); await expect(articles.first()).toContainText('Current school record 1');
  await expect(previous).toBeDisabled(); await expect(next).toBeEnabled();
  await next.click(); await startedPage;
  await expect(articles).toHaveCount(25); await expect(articles.first()).toContainText('Current school record 1');
  await expect(audit.getByRole('button', { name: 'Loading school records…', exact: true })).toBeDisabled();
  await expect(previous).toBeDisabled();
  releasePage();
  await expect(articles.first()).toContainText('Current school record 26'); await expect(articles).toHaveCount(25);
  const loadedReads = state.reads.filter(path => path.startsWith('/v1/school/audit')).length;
  await previous.click(); await expect(articles.first()).toContainText('Current school record 1');
  await next.click(); await expect(articles.first()).toContainText('Current school record 26');
  expect(state.reads.filter(path => path.startsWith('/v1/school/audit'))).toHaveLength(loadedReads);
  mode = 'outage'; await next.click(); await expect(audit.getByRole('alert')).toBeVisible();
  await expect(articles).toHaveCount(25); await expect(articles.first()).toContainText('Current school record 26'); await expect(next).toBeEnabled();
  mode = 'denied'; await next.click(); await expect(articles).toHaveCount(0); await expect(audit.getByRole('alert')).toBeVisible();
  await expect(next).toHaveCount(0); await expect(previous).toHaveCount(0); await expect(audit).not.toContainText('Current school record');
  mode = 'fresh'; await audit.getByRole('button', { name: 'Refresh school records', exact: true }).click(); await startedFresh;
  await expect(articles).toHaveCount(0); await expect(audit).not.toContainText('Current school record');
  releaseFresh();
  await expect(articles).toHaveCount(25); await expect(articles.first()).toContainText('Fresh admitted record 101'); await expect(previous).toBeDisabled();
  await expect(audit.getByRole('alert')).toHaveCount(0); await expect(audit).not.toContainText('Current school record');
  await expect(audit).not.toContainText(/Page \d+ of|Total records|All records loaded/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await info.attach('audit-fresh-current-page-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(state.reads.filter(path => path.startsWith('/v1/school/audit'))).toHaveLength(5);
  expect(state.blocked).toEqual([]); expect(state.errors).toEqual([]);
});
