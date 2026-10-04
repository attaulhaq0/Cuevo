import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { classLearningSummarySchema } from '@cuevo/contracts';
import AxeBuilder from '@axe-core/playwright';
import { academicReportSchema } from '@cuevo/contracts';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Person = { userId: string; displayName: string; role: string; classLabels: string[] };
type Practice = { id: string; learnerId: string; title: string; instructions: string };
type Proposal = { id: string; learnerId: string; recommendation: string };
type Outcome = { id: string; interventionId: string; baseline: { score: number; maxScore: number }; followUp: { score: number; maxScore: number }; difference: number; minimumChange: number; context: { practiceTitle: string; learnerName: string; learnerId: string } };
const root = resolve(import.meta.dirname, '../..'), optIn = process.env.CUEVO_COORDINATOR_REVIEW_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

// No ordinary launcher or mutation: the real frozen application reads its current synthetic sources.
// Browser plugin unavailable; existing Playwright tests native details and downloads.
test.describe('isolated current Coordinator review', () => {
  test.skip(!optIn, 'Requires exact isolated runtime and frozen production build.');
  let runtime: Runtime, account: Account, token: string, build: string;
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(api + path, { headers: { Authorization: `Bearer ${token}`, 'x-school-id': account.schoolId }, signal: AbortSignal.timeout(10_000) });
    expect(response.status, path).toBe(200); return response.json() as Promise<T>;
  }
  async function all<T>(path: string): Promise<T[]> {
    const rows: T[] = []; let cursor: string | null = null;
    for (let count = 0; count < 10; count++) {
      const result: { items: T[]; nextCursor: string | null } = await get(`${path}?limit=100${cursor ? `&cursor=${cursor}` : ''}`);
      rows.push(...result.items); if (!result.nextCursor) return rows; expect(result.nextCursor).not.toBe(cursor); cursor = result.nextCursor;
    }
    throw new Error('Current source capacity requires review.');
  }
  test.beforeAll(async () => {
    if (!optIn || resolve(optIn) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated isolated runtime required.');
    runtime = JSON.parse(await readFile(optIn, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Synthetic/provider guard failed.');
    build = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (process.env.CUEVO_COORDINATOR_REVIEW_BUILD !== build) throw new Error('Exact frozen build required.');
    const found = runtime.accounts.find(row => row.actorId.endsWith('002')); if (!found || found.role !== 'coordinator') throw new Error('Current Coordinator unavailable.'); account = found;
    const client = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password }); if (signedIn.error || !signedIn.data.session) throw new Error('Current Auth unavailable.'); token = signedIn.data.session.access_token;
  });
  test.afterAll(async () => { if (build) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(build); });
  async function navigate(page: Page, view: string) { await page.evaluate(value => { history.pushState(null, '', `/?view=${value}`); dispatchEvent(new PopStateEvent('popstate')); scrollTo(0, 0); }, view); }
  async function health(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  }
  for (const viewport of [{ locale: 'en', width: 1366, height: 768 }, { locale: 'ar', width: 390, height: 844 }, { locale: 'ar', width: 320, height: 568 }] as const) test(`${viewport.locale}${viewport.width}: class chooser, current learner evidence, named support and native outcomes`, async ({ page }, info) => {
    if(info.config.webServer)throw new Error('Dedicated no-webServer config required.'); test.setTimeout(75_000); page.setDefaultTimeout(7_000); await page.setViewportSize(viewport);
    const errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), login = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && request.method() === 'POST';
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'OPTIONS'].includes(request.method()) && !login) { blocked.push(`${request.method()} ${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    const people = await all<Person>('/v1/people'), practices = await all<Practice>('/v1/interventions'), proposals = await all<Proposal>('/v1/recommendations'), outcomes = await all<Outcome>('/v1/outcomes');
    expect(practices.length).toBeGreaterThan(0); expect(proposals.length).toBeGreaterThan(0); expect(outcomes.length).toBeGreaterThan(1);
    await page.goto(base + '/?view=progress'); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click(); await page.locator('.progress-workspace').waitFor();
    const panel = page.locator('.class-learning-summary'), selector = panel.locator('#summary-class');
    const classes = await all<{id:string;name:string}>('/v1/classes'); await expect(selector.locator('option')).toHaveCount(classes.length+1);
    const currentClass = classes.find(row => row.name.includes('Cedar')); if(!currentClass)throw new Error('Existing current class context required.'); const classId=currentClass.id;
    const response = page.waitForResponse(row => new URL(row.url()).pathname === `/v1/classes/${classId}/learning-summary` && row.request().method() === 'GET');
    await selector.selectOption(classId); const summary = classLearningSummarySchema.parse(await (await response).json()); expect(summary.schoolId).toBe(account.schoolId); expect(summary.coverage).toBe('NOT_ESTABLISHED');
    const sourceLearner = summary.items.find(row => row.academic.sources.length); if (!sourceLearner) throw new Error('Current native class source required.');
    if (viewport.locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
    const chooser = page.locator('.coordinator-class-chooser'); await expect(chooser).toHaveAttribute('open', '');
    const currentRow = panel.locator(`[data-class-learner-id="${sourceLearner.learnerId}"]`); await expect(currentRow).toContainText(sourceLearner.learnerName);
    const openLabel = viewport.locale === 'en' ? 'Review this learner' : 'مراجعة هذا الطالب';
    await currentRow.getByRole('button', { name: openLabel, exact: true }).click();
    const heading = page.locator('h2.learner-detail-heading'); await expect(heading).toContainText(sourceLearner.learnerName); await expect(heading).toBeFocused();
    if (viewport.width < 768) {
      await expect(chooser).not.toHaveAttribute('open', ''); await expect(currentRow).toBeHidden();
      await chooser.locator('summary').focus(); await chooser.locator('summary').press('Enter'); await expect(chooser).toHaveAttribute('open', '');
    }
    const rows = chooser.locator('[data-class-learner-id]'); await expect(rows).toHaveCount(summary.items.length);
    const last = rows.last().getByRole('button', { name: openLabel, exact: true }); await last.focus(); await expect(last).toBeFocused();
    const bounded = await chooser.locator('.coordinator-class-chooser__records').boundingBox(); expect(bounded!.height).toBeLessThanOrEqual(Math.min(544, viewport.height * .6) + 1);
    await currentRow.getByRole('button', { name: openLabel, exact: true }).click();
    const academic = page.locator('.progress-academic'); await expect(academic).toBeVisible();
    const exactSource = sourceLearner.academic.sources[0], native = exactSource.nativeResult;
    const exactRow = academic.locator(`[data-result-id="${exactSource.resultId}"]`); await expect(exactRow).toBeVisible();
    if(native.type==='numeric'){await expect(exactRow.locator('.native-score strong')).toHaveText(new Intl.NumberFormat(viewport.locale).format(native.score));await expect(exactRow.locator('.native-score span')).toHaveText(` / ${new Intl.NumberFormat(viewport.locale).format(native.maxScore)}`);}else{for(const criterion of native.criteria){await expect(exactRow).toContainText(criterion.criterionTitle);await expect(exactRow).toContainText(criterion.levelDescription);}}
    const evidenceRead = page.waitForResponse(row => new URL(row.url()).pathname === `/v1/evidence/${exactSource.evidenceId}` && row.request().method() === 'GET');
    await exactRow.getByRole('button', { name: viewport.locale==='en'?'View evidence':'عرض الشواهد', exact:true }).click();
    const evidence = await evidenceRead; expect(evidence.status()).toBe(200); expect(await evidence.json()).toMatchObject({learnerId:sourceLearner.learnerId});
    await health(page); await page.screenshot({ path: info.outputPath('class-selected.png'), fullPage: false });
    const exportSection = page.locator('#progress-reports');
    const reportResponse = page.waitForResponse(row => new URL(row.url()).pathname === `/v1/learners/${sourceLearner.learnerId}/academic-report` && row.request().method() === 'GET');
    const reportDownload = page.waitForEvent('download');
    await exportSection.getByRole('button', { name: viewport.locale === 'en' ? 'Download current academic result page' : 'تنزيل صفحة النتائج الأكاديمية الحالية', exact: true }).click();
    const report = academicReportSchema.parse(await (await reportResponse).json()); expect(report.learnerId).toBe(sourceLearner.learnerId); expect(report.schoolId).toBe(account.schoolId); expect(report.scope).toBe('CURRENT_RELEASED_PAGE'); expect(report.coverage).toBe('NOT_ESTABLISHED'); expect(report.items.length).toBeGreaterThan(0);
    const downloaded = await reportDownload; expect(await downloaded.failure()).toBeNull(); const artifact = await downloaded.path(); expect(artifact).not.toBeNull();
    const html = await readFile(artifact!, 'utf8'); expect(html).toContain('cuevo-report-coverage" content="NOT_ESTABLISHED'); expect(html).toContain('CURRENT_RELEASED_PAGE'); expect(html).toContain(report.learnerName!); expect(html).not.toContain('<script');
    for(const item of report.items){expect(item.learnerId).toBe(sourceLearner.learnerId);expect(html).toContain(item.assessmentTitle);if(item.nativeResult.type==='numeric')expect(html).toContain(`${new Intl.NumberFormat(viewport.locale).format(item.nativeResult.score)} / ${new Intl.NumberFormat(viewport.locale).format(item.nativeResult.maxScore)}`);}
    await downloaded.saveAs(info.outputPath(`current-native-report-${viewport.locale}.html`));
    await navigate(page, 'improvement'); const work = page.locator('.improvement-workspace'); await work.waitFor();
    const tabs = work.locator(':scope > .learning-toolbar .learning-tabs');
    await tabs.getByRole('button', { name: viewport.locale === 'en' ? 'Practice tasks' : 'مهام التدريب', exact: true }).click();
    for (const source of practices) {
      const learner = people.find(row => row.userId === source.learnerId)!; expect(learner).toBeDefined();
      const row = work.locator(`[data-intervention-id="${source.id}"]`); await expect(row).toContainText(learner.displayName); await expect(row).toContainText(learner.classLabels[0]); await expect(row).toContainText(source.instructions);
      await expect(row.locator('form')).toHaveCount(0);
    }
    await health(page); await page.screenshot({ path: info.outputPath('named-practice.png'), fullPage: false });
    await tabs.getByRole('button', { name: viewport.locale === 'en' ? 'Proposals' : 'المقترحات', exact: true }).click();
    for (const source of proposals) { const learner = people.find(row => row.userId === source.learnerId)!; await expect(work.locator(`[data-recommendation-id="${source.id}"]`)).toContainText(learner.displayName); }
    await expect(work.locator('form')).toHaveCount(0); await health(page);
    await tabs.getByRole('button', { name: viewport.locale === 'en' ? 'Outcomes' : 'النتائج', exact: true }).click();
    const directory = work.locator('.coordinator-outcome-directory'); await expect(directory.locator('li')).toHaveCount(outcomes.length);
    for (const outcome of outcomes) {
      const row = directory.locator('li').filter({ has: page.getByRole('heading', { name: outcome.context.practiceTitle, exact: true }) }).filter({hasText:outcome.context.learnerName}); await expect(row).toHaveCount(1); await row.getByRole('button').click();
      const reading = work.locator(`[data-outcome-id="${outcome.id}"]`); await expect(reading).toContainText(outcome.context.learnerName);
      const number = new Intl.NumberFormat(viewport.locale, { maximumFractionDigits: 20 });
      await expect(reading.locator('.outcome-reading__ratio')).toHaveText([`${number.format(outcome.baseline.score)} / ${number.format(outcome.baseline.maxScore)}`, `${number.format(outcome.followUp.score)} / ${number.format(outcome.followUp.maxScore)}`]);
      await expect(work.locator('.outcome-reading')).toHaveCount(1); await expect(reading.locator('form')).toHaveCount(0); await health(page);
    }
    await page.screenshot({ path: info.outputPath('native-outcome.png'), fullPage: false });
    if(viewport.locale==='en'){
      await tabs.getByRole('button', { name:'Proposals', exact:true }).click();
      let peopleStatus: 'actual'|403|503=403;
      await page.route('**/v1/people?*', route=>peopleStatus==='actual'?route.continue():route.fulfill({status:peopleStatus,contentType:'application/json',body:JSON.stringify({code:peopleStatus===403?'FORBIDDEN':'REQUEST_UNAVAILABLE',requestId:'isolated-current-identity-read'})}));
      await work.locator(':scope > .learning-toolbar').getByRole('button',{name:'Refresh next steps',exact:true}).click();
      await expect(work.getByRole('alert')).toBeVisible();
      for(const source of proposals){const learner=people.find(row=>row.userId===source.learnerId)!;await expect(work.locator(`[data-recommendation-id="${source.id}"]`)).not.toContainText(learner.displayName);}
      peopleStatus='actual';
      await work.locator(':scope > .learning-toolbar').getByRole('button',{name:'Refresh next steps',exact:true}).click();
      for(const source of proposals){const learner=people.find(row=>row.userId===source.learnerId)!;await expect(work.locator(`[data-recommendation-id="${source.id}"]`)).toContainText(learner.displayName);}
      peopleStatus=503;
      await work.locator(':scope > .learning-toolbar').getByRole('button',{name:'Refresh next steps',exact:true}).click();
      await expect(work.getByRole('alert')).toBeVisible();
      for(const source of proposals){const learner=people.find(row=>row.userId===source.learnerId)!;await expect(work.locator(`[data-recommendation-id="${source.id}"]`)).not.toContainText(learner.displayName);}
      peopleStatus='actual';
      await work.locator(':scope > .learning-toolbar').getByRole('button',{name:'Refresh next steps',exact:true}).click();
      for(const source of proposals){const learner=people.find(row=>row.userId===source.learnerId)!;await expect(work.locator(`[data-recommendation-id="${source.id}"]`)).toContainText(learner.displayName);}
      await page.unroute('**/v1/people?*');
    }
    expect(errors.filter(value=>!value.includes('status of 403')&&!value.includes('status of 503'))).toEqual([]); expect(warnings).toEqual([]); expect(blocked).toEqual([]);
    await info.attach('current-source-facts', { body: JSON.stringify({ build, locale: viewport.locale, currentClassLearners: summary.items.length, academicCoverage: summary.coverage, namedPractices: practices.length, namedProposals: proposals.length, exactNativeOutcomes: outcomes.length, mutationRequests: blocked, reportArtifact: 'Actual current selected-learner native result page downloaded; explicit unknown coverage, source titles/native values/learner identity checked. Period export and scope-cancellation remain separate gates.' }), contentType: 'application/json' });
  });
});
