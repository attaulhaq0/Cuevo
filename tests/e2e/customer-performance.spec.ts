import { test, expect, type Page, type Locator, type Request } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Account = { role: string; email: string; password: string };
type Sample = { scenario: string; durationMs: number | null; status: 'MEASURED' | 'FAILED'; payloadBytes?: number };
type ApiSample = { scenario: string; route: string; method: string; durationMs: number | null; responseBytes: number | null; status: number | null };
type Gap = { scenario: string; status: 'NOT_MEASURED'; reason: string };
const repetitions = 5;
const apiOrigin = 'http://localhost:4000';
const scenarios: Sample[] = [];
const apiSamples: ApiSample[] = [];
const gaps: Gap[] = [];
const screenshotDirectory = resolve('.local/customer-readiness/browser-performance');
const repositoryRoot = resolve(import.meta.dirname, '../..');

const round = (value: number) => Math.round(value * 100) / 100;
function summary(values: number[]) {
  const rows = [...values].sort((a, b) => a - b); const middle = Math.floor(rows.length / 2);
  return rows.length ? { sampleCount: rows.length, medianMs: round(rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2), p95Ms: round(rows[Math.ceil(rows.length * 0.95) - 1]), minMs: round(rows[0]), maxMs: round(rows.at(-1)!) } : { sampleCount: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null };
}

/** Opt-in because this benchmark creates visible synthetic work and needs its own clean window. */
test('customer performance: production browser navigation, private bytes, fixture analysis and private updates', async ({ page, browser }, info) => {
  test.skip(process.env.CUEVO_REQUIRE_BROWSER_PERFORMANCE !== '1', 'Dedicated production browser performance window required.');
  test.setTimeout(420_000); page.setDefaultTimeout(15_000);
  expect(process.env.AI_GENERATION_MODE).toBe('FIXTURE');
  expect(process.env.AI_FIXTURE_ENABLED).toBe('true');
  expect(process.env.POSTHOG_CAPTURE_MODE ?? 'DISABLED').toBe('DISABLED');
  const accounts = JSON.parse(await readFile(resolve(repositoryRoot, '.local/synthetic-accounts.json'), 'utf8')) as Account[];
  const identity = JSON.parse(await readFile(resolve(repositoryRoot, 'supabase/seed/identities.json'), 'utf8')) as { actors: { email: string; displayName: string }[] };
  const student = accounts.find(account => account.role === 'student')!;
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const learnerName = identity.actors.find(actor => actor.email === student.email)?.displayName;
  const teacherName = identity.actors.find(actor => actor.email === teacher.email)?.displayName;
  expect(learnerName).toBeTruthy(); expect(teacherName).toBeTruthy();
  await mkdir(screenshotDirectory, { recursive: true });
  scenarios.length = 0; apiSamples.length = 0; gaps.length = 0;
  const pending = new Set<Promise<unknown>>(); const assigned = new WeakMap<Request, string>();
  const health = { pageErrors: 0, consoleErrors: 0, hydrationWarnings: 0, failedApiRequests: 0, abortedApiRequests: 0, otherFailedApiRequests: 0, externalHttpRequests: 0 };
  let active = 'setup'; let completed = false; let failureScenario: string | null = null; let checkpoint = 'initial-login';
  const firstUse: { scenario: string; navigationActions: number; fieldSelections: number; confirmationActions: number; result: string }[] = [];
  function observe(target: Page) {
    target.on('pageerror', () => health.pageErrors++);
    target.on('console', message => {
      if (message.type() === 'error') health.consoleErrors++;
      if (['error', 'warning'].includes(message.type()) && /hydration|hydrated|server rendered|attributes.*match|React error #418/i.test(message.text())) health.hydrationWarnings++;
    });
    target.on('request', request => { assigned.set(request, active); if (/^https?:/.test(request.url()) && !['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) health.externalHttpRequests++; });
    target.on('requestfailed', request => {
      if (!request.url().startsWith(`${apiOrigin}/v1/`)) return;
      health.failedApiRequests++;
      if (/abort|cancel/i.test(request.failure()?.errorText ?? '')) health.abortedApiRequests++;
      else health.otherFailedApiRequests++;
    });
    target.on('requestfinished', request => {
      if (!request.url().startsWith(`${apiOrigin}/v1/`)) return;
      const record = (async () => {
        const response = await request.response(); const timing = request.timing();
        const body = await response?.body().catch(() => undefined);
        const route = new URL(request.url()).pathname.replace(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi, ':id');
        apiSamples.push({ scenario: assigned.get(request) ?? 'setup', route, method: request.method(), durationMs: timing.responseEnd >= 0 ? round(timing.responseEnd) : null, responseBytes: body?.length ?? null, status: response?.status() ?? null });
      })();
      pending.add(record); void record.finally(() => pending.delete(record));
    });
  }
  observe(page);
  async function settled(target: Page) {
    await expect(target.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0);
    await target.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  async function measure(scenario: string, action: () => Promise<void>, target = page, payloadBytes?: number) {
    active = scenario; const started = performance.now();
    try { await action(); await settled(target); scenarios.push({ scenario, status: 'MEASURED', durationMs: round(performance.now() - started), ...(payloadBytes === undefined ? {} : { payloadBytes }) }); }
    catch (error) { scenarios.push({ scenario, status: 'FAILED', durationMs: null }); failureScenario = scenario; throw error; }
    finally { active = 'setup'; }
  }
  async function signIn(target: Page, account: Account) {
    await target.goto('/'); await target.getByRole('button', { name: 'English', exact: true }).click();
    await target.getByLabel('School email', { exact: true }).fill(account.email); await target.getByLabel('Password', { exact: true }).fill(account.password);
    await target.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(target.getByText('School access verified', { exact: true })).toBeVisible(); await settled(target);
  }
  async function navigate(name: string, target = page) {
    await target.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    const surface = { Overview: '.role-home', Learning: '.learning-workspace', Academic: '.academic-workspace', Progress: '.progress-workspace', School: '.school-workspace', Community: '.community-workspace', Portfolio: '.portfolio-workspace', 'Next steps': '.improvement-workspace' }[name];
    if (name !== 'Overview') await expect(target.locator('main h1')).toHaveText(name);
    if (surface) await expect(target.locator(surface)).toBeVisible();
    await settled(target);
  }
  async function capture(name: string, target = page) { await target.screenshot({ path: resolve(screenshotDirectory, `${name}.png`), fullPage: false }); }
  async function selectedHumanChoice(select: Locator) {
    const choice = (await select.locator('option').evaluateAll(options => options.map(option => ({ value: (option as HTMLOptionElement).value, label: option.textContent ?? '' })))).find(option => option.value && !/unavailable|unknown|review required/i.test(option.label));
    if (!choice) throw Error('A current authorized human choice is unavailable.');
    expect(choice.label).not.toMatch(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i); return choice;
  }
  async function loadTarget(target: Locator, container: Locator) {
    await settled(page);
    for (let attempt = 0; attempt < 30 && !await target.count(); attempt++) {
      const more = container.getByRole('button', { name: 'Load more', exact: true }).first(); if (!await more.count()) break;
      await more.click(); await settled(page);
    }
    await expect(target).toBeVisible();
  }
  async function responseFor(target: Page, path: RegExp, method = 'POST') {
    return target.waitForResponse(response => path.test(new URL(response.url()).pathname) && response.request().method() === method);
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (let repeat = 0; repeat < repetitions; repeat++) {
      await measure('initial-login-render', async () => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'Welcome to Cuevo', exact: true })).toBeVisible(); });
    }
    await capture('01-first-login');
    await measure('teacher-sign-in-overview-render', () => signIn(page, teacher)); await capture('02-teacher-overview');
    firstUse.push({ scenario: 'sign-in-to-overview', navigationActions: 1, fieldSelections: 2, confirmationActions: 0, result: 'Current school access and next-action overview visible.' });

    checkpoint = 'teacher-class-room-setup'; await navigate('Community');
    if (!await page.locator('.community-room[data-room-type="CLASS"]').count()) {
      await page.getByRole('button', { name: 'Create teacher-led room', exact: true }).click();
      const form = page.getByRole('region', { name: 'Create teacher-led room', exact: true });
      const chosen = await selectedHumanChoice(form.getByLabel('Class', { exact: true }));
      await form.getByLabel('Class', { exact: true }).selectOption(chosen.value); await form.getByLabel('Room name', { exact: true }).fill('Checking steps performance room');
      await form.getByLabel('Room type', { exact: true }).selectOption({ label: 'Class discussion' });
      const created = responseFor(page, /^\/v1\/community\/rooms$/); await form.getByRole('button', { name: 'Save', exact: true }).click(); expect((await created).status()).toBe(200);
      await expect(page.locator('.community-room[data-room-type="CLASS"]')).toBeVisible(); await settled(page);
      firstUse.push({ scenario: 'teacher-first-class-room', navigationActions: 3, fieldSelections: 3, confirmationActions: 0, result: 'Empty community requires explicit teacher room setup; current authorized class and room type selected before Save.' });
    }

    for (let repeat = 0; repeat < repetitions; repeat++) {
      checkpoint = `repeated-workspaces-sample-${repeat + 1}`;
      await navigate('Overview');
      await measure('learning-navigation-render', () => navigate('Learning'));
      const course = page.locator('.course-list > li').filter({ has: page.getByRole('heading', { name: 'Synthetic primary explanation', exact: true }) });
      await expect(course).toBeVisible();
      await measure('course-detail-render', async () => { await course.getByRole('button', { name: 'Open course', exact: true }).click(); await expect(page.locator('.course-view')).toBeVisible(); });
      if (repeat === 0) await capture('03-course-detail');
      await navigate('Overview'); await measure('academic-navigation-render', () => navigate('Academic'));
      await navigate('Overview'); await measure('progress-navigation-render', () => navigate('Progress'));
      const classSelect = page.getByLabel('Class', { exact: true }); const chosenClass = await selectedHumanChoice(classSelect);
      await measure('class-evidence-filter-render', async () => { await classSelect.selectOption(chosenClass.value); await expect(page.locator('[data-class-learner-id]').first()).toBeVisible(); });
      const learner = page.locator('[data-class-learner-id]').filter({ has: page.getByRole('heading', { name: learnerName!, exact: true }) });
      await measure('learner-state-from-class-render', async () => { await learner.getByRole('button', { name: 'Review this learner', exact: true }).click(); await expect(page.getByRole('heading', { name: /^Current learner evidence ·/ })).toBeFocused(); await expect(page.getByRole('heading', { name: 'Learning observations', exact: true })).toBeVisible(); });
      if (repeat === 0) {
        await capture('04-class-and-learner-state'); await page.getByRole('heading', { name: 'Learning observations', exact: true }).scrollIntoViewIfNeeded(); await capture('04b-current-learner-observations');
      }
      await navigate('Overview'); await measure('school-daily-navigation-render', () => navigate('School'));
      const filter = page.locator('#daily-class-filter'); const chosenDaily = await selectedHumanChoice(filter);
      await measure('school-daily-class-filter-render', async () => { await filter.selectOption(chosenDaily.value); await expect(filter).toHaveValue(chosenDaily.value); });
      if (repeat === 0) await capture('05-daily-class-filter');
      await navigate('Overview'); await measure('community-navigation-render', () => navigate('Community'));
      const room = page.locator('.community-room[data-room-type="CLASS"]').first();
      await expect(room).toBeVisible();
      await measure('community-discussion-render', async () => { await room.getByRole('button', { name: 'Open discussion', exact: true }).click(); await expect(page.locator('.community-discussion')).toBeVisible(); });
      if (repeat === 0) await capture('06-community-discussion');
      await navigate('Overview'); await measure('portfolio-navigation-render', () => navigate('Portfolio'));
    }
    firstUse.push({ scenario: 'teacher-class-to-current-learner-state', navigationActions: 2, fieldSelections: 1, confirmationActions: 0, result: 'Class evidence and named learner source detail visible; coverage limitations retained.' });
    firstUse.push({ scenario: 'teacher-course-detail', navigationActions: 2, fieldSelections: 0, confirmationActions: 0, result: 'Named course, school-authored lesson and current actions visible.' });
    gaps.push({ scenario: 'customer-text-search', status: 'NOT_MEASURED', reason: 'No customer text-search control in the inspected primary workspaces; class and learner filters measured instead.' });

    checkpoint = 'fixture-analysis'; await navigate('Next steps');
    for (let repeat = 0; repeat < repetitions; repeat++) {
      await page.getByRole('button', { name: 'Request analysis', exact: true }).click();
      const form = page.getByRole('region', { name: 'Request analysis', exact: true }); const choice = await selectedHumanChoice(form.getByLabel('Released baseline result', { exact: true }));
      await form.getByLabel('Released baseline result', { exact: true }).selectOption(choice.value);
      let proposalId = '';
      await measure('fixture-analysis-to-visible-proposal', async () => {
        const pendingResponse = responseFor(page, /^\/v1\/intelligence\/analyze$/); await form.getByRole('button', { name: 'Request analysis', exact: true }).click();
        const response = await pendingResponse; expect(response.status()).toBe(200); const receipt = await response.json() as { id: string; generationMode: string; status: string };
        expect(receipt.generationMode).toBe('FIXTURE'); expect(receipt.status).toBe('AWAITING_HUMAN'); proposalId = receipt.id;
        await loadTarget(page.locator(`[data-recommendation-id="${proposalId}"]`), page.locator('.improvement-workspace'));
      });
      const proposal = page.locator(`[data-recommendation-id="${proposalId}"]`); await expect(proposal.getByText('Fixture analysis — synthetic/test', { exact: true })).toBeVisible();
      if (repeat === 0) await capture('07-fixture-human-review');
      await proposal.getByRole('button', { name: 'Reject proposal', exact: true }).click();
      const rejection = proposal.getByRole('region', { name: 'Reject proposal', exact: true }); await rejection.getByLabel('Decision reason', { exact: true }).fill('Performance verification complete; no practice assigned.');
      const rejected = responseFor(page, /\/decision$/); await rejection.getByRole('button', { name: 'Reject proposal', exact: true }).click(); expect((await rejected).status()).toBe(200); await settled(page);
    }
    firstUse.push({ scenario: 'request-fixture-proposal', navigationActions: 2, fieldSelections: 1, confirmationActions: 1, result: 'Explicit fixture label, pending human decision and rejection control visible.' });
    checkpoint = 'private-file'; await page.getByRole('button', { name: 'Sign out', exact: true }).last().click(); await signIn(page, student); await navigate('Portfolio');
    const fileBytes = Buffer.alloc(256 * 1024, 65);
    for (let repeat = 0; repeat < repetitions; repeat++) {
      const name = `Performance checking notes — sample ${repeat + 1}.txt`;
      await page.getByLabel('Choose private file', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: fileBytes });
      let assetId = '';
      await measure('private-256k-upload-to-verified-render', async () => {
        const finalized = responseFor(page, /\/assets\/[^/]+\/finalize$/); await page.getByRole('button', { name: 'Upload and verify', exact: true }).click();
        const response = await finalized; expect(response.status()).toBe(200); assetId = (await response.json()).id;
        await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })).toBeVisible();
      }, page, fileBytes.length);
      const row = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await measure('private-256k-download-and-byte-verification', async () => {
        const downloaded = page.waitForEvent('download'); await row.getByRole('button', { name: 'Download private file', exact: true }).click();
        const download = await downloaded; expect(await download.failure()).toBeNull(); expect(await readFile((await download.path())!)).toEqual(fileBytes);
      }, page, fileBytes.length);
      if (repeat === 0) await capture('08-private-file');
      await row.getByRole('button', { name: 'Retire private file', exact: true }).click(); const retirement = row.getByRole('region', { name: 'Retire private file', exact: true });
      await expect(retirement.getByLabel('I confirm this private file should no longer be available')).not.toBeChecked();
      await retirement.getByLabel('Reason', { exact: true }).fill('Synthetic performance verification complete.'); await retirement.getByLabel('I confirm this private file should no longer be available').check();
      const retired = responseFor(page, new RegExp(`/assets/${assetId}/retire$`)); await retirement.getByRole('button', { name: 'Save', exact: true }).click(); expect((await retired).status()).toBe(200); await settled(page);
      await expect(row.getByRole('button', { name: 'Download private file', exact: true })).toHaveCount(0);
    }
    firstUse.push({ scenario: 'learner-private-upload-download', navigationActions: 3, fieldSelections: 1, confirmationActions: 0, result: 'Private file verification and named download action visible; download bytes match.' });
    firstUse.push({ scenario: 'learner-private-retirement', navigationActions: 2, fieldSelections: 1, confirmationActions: 1, result: 'Reason and unchecked explicit confirmation required; download removed after receipt.' });

    checkpoint = 'two-browser-private-community'; const receiverContext = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } }); const receiver = await receiverContext.newPage(); receiver.setDefaultTimeout(15_000); observe(receiver);
    try {
      await signIn(receiver, teacher); await navigate('Community', receiver); await navigate('Community');
      const roomRow = page.locator('.community-room[data-room-type="CLASS"]').first(); const roomName = await roomRow.getByRole('heading').innerText();
      await roomRow.getByRole('button', { name: 'Open discussion', exact: true }).click();
      const teacherRoom = receiver.locator('.community-room').filter({ has: receiver.getByRole('heading', { name: roomName, exact: true }) }); await teacherRoom.getByRole('button', { name: 'Open discussion', exact: true }).click();
      await expect(page.getByText('Private updates connected', { exact: true })).toBeVisible({ timeout: 20_000 }); await expect(receiver.getByText('Private updates connected', { exact: true })).toBeVisible({ timeout: 20_000 });
      for (let repeat = 0; repeat < repetitions; repeat++) {
        const text = `Synthetic performance checking step ${repeat + 1}`;
        const members = page.getByRole('group', { name: 'Mention current members (at most five)', exact: true }); await members.getByRole('checkbox', { name: teacherName!, exact: true }).check();
        const form = page.getByRole('region', { name: 'Post to room', exact: true }); await form.getByLabel('Message', { exact: true }).fill(text); let postId = '';
        const started = performance.now(); active = 'community-save-and-private-invalidation';
        const posted = responseFor(page, /\/rooms\/[^/]+\/posts$/); await form.getByRole('button', { name: 'Post to room', exact: true }).click();
        const response = await posted; expect(response.status()).toBe(200); postId = (await response.json()).id;
        scenarios.push({ scenario: 'community-post-confirmation', durationMs: round(performance.now() - started), status: 'MEASURED' });
        await expect(receiver.locator(`[data-post-id="${postId}"]`)).toContainText(text, { timeout: 20_000 }); await settled(receiver);
        scenarios.push({ scenario: 'community-save-to-other-browser-invalidation', durationMs: round(performance.now() - started), status: 'MEASURED' }); active = 'setup';
        await receiver.getByRole('button', { name: 'Back to rooms', exact: true }).click(); await receiver.getByRole('button', { name: 'Notifications', exact: true }).click(); await settled(receiver);
        const notificationStarted = performance.now(); active = 'mention-notification-processing-and-render';
        let found = false;
        for (let attempt = 0; attempt < 20 && !found; attempt++) {
          const request = receiver.waitForResponse(result => new URL(result.url()).pathname === '/v1/community/notifications' && result.request().method() === 'GET');
          await receiver.getByRole('button', { name: 'Refresh community', exact: true }).click(); const response = await request; expect(response.status()).toBe(200);
          const notices = await response.json() as { items: { kind: string; postId?: string }[] }; found = notices.items.some(notice => notice.kind === 'MENTION' && notice.postId === postId);
          if (!found) await receiver.waitForTimeout(250);
        }
        expect(found, 'Exact current mentioned source notification exists').toBe(true); await settled(receiver);
        scenarios.push({ scenario: 'mention-save-to-notification-availability', durationMs: round(performance.now() - started), status: 'MEASURED' });
        scenarios.push({ scenario: 'notification-poll-observation-duration', durationMs: round(performance.now() - notificationStarted), status: 'MEASURED' }); active = 'setup';
        await receiver.getByRole('button', { name: 'Class rooms and groups', exact: true }).click(); await teacherRoom.getByRole('button', { name: 'Open discussion', exact: true }).click();
        await expect(receiver.getByText('Private updates connected', { exact: true })).toBeVisible({ timeout: 20_000 }); await settled(page); await settled(receiver);
      }
      await capture('09-live-private-discussion', receiver);
    } finally { await receiverContext.close(); }
    gaps.push({ scenario: 'isolated-worker-processing-duration', status: 'NOT_MEASURED', reason: 'Browser observes saved-source notification/private invalidation end to end; processing-only SQL/worker duration is not observable from this boundary.' });
    gaps.push({ scenario: 'browser-pilot-scale-and-concurrent-auth-users', status: 'NOT_MEASURED', reason: 'This run uses the 133-person reference school and two authenticated browsers; separate 500-record API fixture is not a browser-load result.' });
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); await settled(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.workspace-main > .notice[role="status"]')).toHaveCount(0);
    await capture('10-student-community-ar-mobile');
    firstUse.push({ scenario: 'current-private-discussion-and-mention', navigationActions: 3, fieldSelections: 2, confirmationActions: 0, result: 'Current named room, optional named recipient and private connected status visible; second browser receives source update.' });
    await Promise.allSettled([...pending]);
    expect(health.pageErrors).toBe(0); expect(health.consoleErrors).toBe(0); expect(health.hydrationWarnings).toBe(0); expect(health.otherFailedApiRequests).toBe(0); expect(health.externalHttpRequests).toBe(0);
    expect(apiSamples.filter(row => row.status !== null && row.status >= 500)).toHaveLength(0);
    completed = true;
  } catch (error) {
    failureScenario ??= active === 'setup' ? checkpoint : active;
    if (!page.isClosed()) await capture('failure').catch(() => undefined);
    throw error;
  } finally {
    await Promise.allSettled([...pending]);
    const scenarioNames = [...new Set(scenarios.map(row => row.scenario))]; const routes = [...new Set(apiSamples.map(row => `${row.method} ${row.route}`))];
    const result = {
      schemaVersion: 1, status: completed ? 'MEASURED' : 'FAILED', failureScenario, measuredAt: new Date().toISOString(),
      environment: { web: 'LOCAL_PRODUCTION_NEXT_BUILD', api: 'LOCAL_SOURCE_NEST_FASTIFY', worker: process.env.CUEVO_VERIFICATION_WORKER === 'supabase-edge' ? 'LOCAL_SUPABASE_EDGE' : 'LOCAL_NODE_POLLER', dataClass: 'SYNTHETIC', populationRecords: 133, simultaneousBrowsers: 2, browser: info.project.name, engineVersion: browser.version(), desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 }, samplesPerRepeatedSegment: repetitions, networkThrottle: 'NONE', cpuThrottle: 'NONE', browserPlugin: 'ABSENT_REPOSITORY_PLAYWRIGHT_USED' },
      limits: { uiSlaMs: null, apiSqlStatementBudgetMs: 5000, privateFileMaxBytes: 524288, measuredPrivateFileBytes: 262144, statistic: 'NEAREST_RANK_P95_SMALL_SAMPLE_MAXIMUM', payloadLimitAllRoutes: null, acceptance: 'OBSERVATION_NOT_HOSTED_OR_LOAD_CERTIFICATION' },
      scenarios: scenarioNames.map(scenario => ({ scenario, ...summary(scenarios.filter(row => row.scenario === scenario && row.durationMs !== null).map(row => row.durationMs!)), failedSamples: scenarios.filter(row => row.scenario === scenario && row.status === 'FAILED').length })),
      api: routes.map(route => { const rows = apiSamples.filter(row => `${row.method} ${row.route}` === route); return { route, ...summary(rows.filter(row => row.durationMs !== null).map(row => row.durationMs!)), unmeasuredTimingCount: rows.filter(row => row.durationMs === null).length, largestResponseBytes: rows.reduce<number | null>((largest, row) => row.responseBytes === null ? largest : Math.max(largest ?? 0, row.responseBytes), null), errorResponses: rows.filter(row => row.status !== null && row.status >= 400).length }; }),
      health, gaps, firstUse, samples: scenarios, apiSamples,
      evidenceLimit: 'Prescribed expert-operated paths and screenshot inspection, not a first-time human study. Request timing includes local HTTP/Auth/API/database work and cannot isolate SQL. Initial-load repeats share the browser cache; first sample is separate in raw samples. Notification observation includes navigation/poll delay. No raw content, tokens, object IDs or query strings persisted.',
    };
    await writeFile(resolve('.local/customer-readiness/browser-performance.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
});
