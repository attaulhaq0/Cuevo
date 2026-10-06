import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Fixture = { course: string; lesson: string; practice: string; activity: string; assessment: string; policyVersion: number };
const root = resolve(import.meta.dirname, '../..');
const runtimePath = process.env.CUEVO_STUDENT_JOURNEY_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

test.describe('actual isolated Student learning journey', () => {
  test.skip(!runtimePath, 'Requires explicit separate synthetic Student journey runtime.');
  let runtime: Runtime, accounts: Record<string, Account>, tokens: Record<string, string>, school: string, buildId: string;

  async function request<T>(role: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(api + '/v1' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': school, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: body ? JSON.stringify(body) : undefined });
    expect(response.status, `Isolated source ${role} ${path}`).toBe(200);
    return await response.json() as T;
  }
  async function fixture(): Promise<Fixture> {
    const classes = await request<{ items: { id: string }[] }>('teacher', '/classes?limit=25');
    const subjects = await request<{ items: { id: string }[] }>('teacher', '/subjects?limit=25');
    const course = await request<{ id: string }>('teacher', '/courses', { classId: classes.items[0].id, subjectId: subjects.items[0].id, title: `School checking journey ${randomUUID().slice(0, 8)}`, description: 'School-authored synthetic verification records.' });
    const unit = await request<{ id: string }>('teacher', `/courses/${course.id}/units`, { title: 'Checking a method', sequence: 1 });
    const lesson = await request<{ id: string }>('teacher', `/units/${unit.id}/lessons`, { title: 'Explain one check', body: 'Read the example, try its method and explain why your check works.', sequence: 1 });
    const practice = await request<{ id: string }>('teacher', `/lessons/${lesson.id}/activities`, { title: 'Try the checking method', instructions: 'Use the method and explain one choice.', kind: 'practice', sequence: 1 });
    const reference = await request<{ id: string }>('teacher', '/academic-references', { title: 'Explain one checking step', description: 'Explain a step in a school-authored checking example.', version: 'school-journey-1' });
    await request('coordinator', `/academic-references/${reference.id}/approve`, {});
    const assessment = await request<{ id: string }>('teacher', '/assessments', { courseId: course.id, title: 'Share your checking explanation', instructions: 'Explain one checking step and give a reason for your choice.', maxScore: 10, preparation: true, intendedModel: 'numeric', intendedSubmissionKind: 'TEXT' });
    await request('teacher', `/assessments/${assessment.id}/preparation`, { title: 'Share your checking explanation', instructions: 'Explain one checking step and give a reason for your choice.', dueAt: null, maxScore: 10, referenceId: reference.id, rubricId: null, expectedPreparationVersion: 1 });
    // Academic publication requires the real current published course first.
    await request('teacher', `/courses/${course.id}/publish`, {});
    const prepared = await request<{ preparationVersion: number; policyVersion: number; availabilityVersion: number }>('teacher', `/assessments/${assessment.id}`);
    await request('teacher', `/assessments/${assessment.id}/publish`, { expectedPreparationVersion: prepared.preparationVersion, expectedPolicyVersion: prepared.policyVersion, expectedAvailabilityVersion: prepared.availabilityVersion });
    const activity = await request<{ id: string }>('teacher', `/lessons/${lesson.id}/activities`, { title: 'Share your checking explanation', instructions: 'Explain one checking step and give a reason for your choice.', kind: 'assignment', sequence: 2 });
    const content = await request<{ draftRevision: number }>('teacher', `/learning-content/activity/${activity.id}`);
    await request('teacher', `/learning-content/activity/${activity.id}/draft`, { resource: 'activity', expectedRevision: content.draftRevision, title: 'Share your checking explanation', content: 'Explain one checking step and give a reason for your choice.', kind: 'assignment', assessmentId: assessment.id, reason: 'Connect the exact same-course response task.' });
    const revised = await request<{ draftRevision: number }>('teacher', `/learning-content/activity/${activity.id}`);
    await request('teacher', `/learning-content/activity/${activity.id}/publish`, { expectedRevision: revised.draftRevision, confirmPublication: true });
    return { course: course.id, lesson: lesson.id, practice: practice.id, activity: activity.id, assessment: assessment.id, policyVersion: prepared.policyVersion };
  }
  async function guard(page: Page) {
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => [base, api, runtime.config.SUPABASE_URL].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  }
  async function open(page: Page, source: Fixture, title: string, locale: 'en' | 'ar' = 'en') {
    // A full navigation intentionally clears the app's memory-only authentication.
    await page.goto(`${base}/?view=learning&source=course&id=${source.course}`);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(accounts.student.email); await page.locator('#password').fill(accounts.student.password); await page.locator('.auth-submit').click();
    await expect(page.locator('.workspace')).toBeVisible();
    if (locale === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await page.getByRole('button', { name: `${locale === 'ar' ? 'فتح الدرس' : 'Open lesson'}: Explain one check`, exact: true }).click();
    await page.getByRole('button', { name: `${locale === 'ar' ? 'فتح النشاط' : 'Open activity'}: ${title}`, exact: true }).click();
    await expect(page.locator('.student-learning-journey__panel > header h2')).toBeFocused();
    return page.locator('.student-learning-journey__panel');
  }
  async function capture(page: Page, info: TestInfo, name: string) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Only the separate ignored synthetic runtime is permitted.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), database = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || database.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Isolated runtime or provider safety guard failed.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (buildId !== process.env.CUEVO_STUDENT_JOURNEY_BUILD) throw new Error('The exact current web build must be frozen.');
    accounts = Object.fromEntries(Object.entries({ teacher: '004', coordinator: '002', student: '012' }).map(([role, suffix]) => [role, runtime.accounts.find(account => account.actorId.endsWith(suffix))!]));
    school = accounts.teacher.schoolId; tokens = {};
    for (const [role, account] of Object.entries(accounts)) {
      if (!account || account.schoolId !== school) throw new Error('Required current synthetic relationship missing.');
      const client = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (result.error || !result.data.session) throw new Error('Isolated authentication unavailable.'); tokens[role] = result.data.session.access_token;
    }
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  test('selected practice completes through its original owner and remains a recorded activity in Arabic mobile', async ({ page }, info) => {
    test.setTimeout(90000); const source = await fixture(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await guard(page);
    const panel = await open(page, source, 'Try the checking method');
    await expect(panel.getByText('Activity status', { exact: true })).toBeVisible(); await expect(panel.getByText('Available', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Open this task', exact: true }).click();
    await expect(panel.locator('form')).toHaveCount(1);
    const form = panel.getByRole('region', { name: 'Complete activity', exact: true }); await form.getByLabel('Reflection (optional)', { exact: true }).fill('I used a checking method and explained my choice.');
    const response = page.waitForResponse(reply => new URL(reply.url()).pathname === `/v1/activities/${source.practice}/complete` && reply.request().method() === 'POST');
    await form.getByRole('button', { name: 'Complete activity', exact: true }).click(); const completedResponse = await response; expect(completedResponse.status()).toBe(200);
    const completed = await completedResponse.json() as { id: string; activityId: string; learnerId: string; reflection: string };
    expect(completed.activityId).toBe(source.practice); expect(completed.learnerId).toBe(accounts.student.actorId); expect(completed.reflection).toBe('I used a checking method and explained my choice.');
    await open(page, source, 'Try the checking method'); await expect(panel.getByText('Recorded completion', { exact: true })).toBeVisible();
    const current = await request<{ units: { lessons: { activities: { id: string; completion: { id: string } | null }[] }[] }[] }>('student', `/courses/${source.course}`);
    expect(current.units.flatMap(unit => unit.lessons.flatMap(lesson => lesson.activities)).find(activity => activity.id === source.practice)?.completion?.id).toBe(completed.id);
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await open(page, source, 'Try the checking method', 'ar'); await expect(panel.getByText('إكمال مسجّل', { exact: true })).toBeVisible(); await capture(page, info, `recorded-practice-ar-${width}`); }
    expect(errors).toEqual([]);
  });

  test('linked task submits once, retains native zero feedback and clears stale work after a denied exact read', async ({ page }, info) => {
    test.setTimeout(120000); const source = await fixture(); const errors: string[] = [], warnings: string[] = []; let denied = false; let submissionPosts = 0;
    await page.setViewportSize({ width: 1366, height: 768 });
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === `/v1/assessments/${source.assessment}/submissions`) submissionPosts++; });
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); if (message.type() === 'error' && !(denied && /403/.test(message.text()))) errors.push(message.text()); }); await guard(page);
    const panel = await open(page, source, 'Share your checking explanation'); await expect(panel.getByText('Submission', { exact: true })).toBeVisible(); await panel.getByRole('button', { name: 'Open this task', exact: true }).click();
    await expect(panel.locator('.connected-assessment')).toHaveCount(0); await expect(panel.getByRole('region', { name: 'Submit work', exact: true })).toBeVisible();
    const form = panel.getByRole('region', { name: 'Submit work', exact: true }); await form.getByLabel('Your response', { exact: true }).fill('I checked the result by working backwards and explaining each step.');
    const submittedResponse = page.waitForResponse(reply => new URL(reply.url()).pathname === `/v1/assessments/${source.assessment}/submissions` && reply.request().method() === 'POST');
    await form.getByRole('button', { name: 'Submit work', exact: true }).click(); const submitted = await (await submittedResponse).json() as { id: string };
    await open(page, source, 'Share your checking explanation'); await expect(panel.getByText('Awaiting teacher review', { exact: true })).toBeVisible(); await expect(panel.getByText('I checked the result by working backwards and explaining each step.', { exact: true })).toBeVisible();
    const submittedAction = panel.getByRole('button', { name: 'Open this task', exact: true });
    const fold = await submittedAction.evaluate(element => { const box = element.getBoundingClientRect(); return { viewport: { width: innerWidth, height: innerHeight }, top: box.top, bottom: box.bottom, scrollY, courseUnavailable: document.querySelector('.student-learning-journey__panel')?.textContent?.includes('Course information is not available') ?? false }; });
    expect(fold.viewport).toEqual({ width: 1366, height: 768 }); expect(fold.bottom).toBeLessThanOrEqual(768); expect(fold.top).toBeGreaterThanOrEqual(0); expect(fold.courseUnavailable).toBe(false);
    await info.attach('submitted-task-fold', { body: JSON.stringify(fold, null, 2), contentType: 'application/json' });
    await capture(page, info, 'selected-submitted-task-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await open(page, source, 'Share your checking explanation', 'ar');
    await expect(panel.getByText('بانتظار مراجعة المعلّم', { exact: true })).toBeVisible(); await capture(page, info, 'selected-submitted-task-mobile-rtl');
    await page.setViewportSize({ width: 1366, height: 768 }); await open(page, source, 'Share your checking explanation');
    const mark = await request<{ id: string; revision: number }>('teacher', `/submissions/${submitted.id}/results`, { score: 0, feedback: 'Show the checking steps and explain the reason for each.', expectedPolicyVersion: source.policyVersion, expectedRevision: 0, sourceEvidence: true });
    const released = await request<{ id: string; nativeResult: { type: string; score: number; maxScore: number } }>('teacher', `/results/${mark.id}/release`, { expectedRevision: mark.revision, parentVisible: true }); expect(released.nativeResult).toMatchObject({ type: 'numeric', score: 0, maxScore: 10 });
    await open(page, source, 'Share your checking explanation'); await expect(panel.getByText('Show the checking steps and explain the reason for each.', { exact: true })).toBeVisible(); await panel.getByRole('button', { name: 'Read released feedback', exact: true }).click();
    await expect(page.locator(`[data-result-id="${released.id}"]`)).toBeVisible(); await expect(page.locator('.released-result').getByText('Show the checking steps and explain the reason for each.', { exact: true })).toBeVisible(); await capture(page, info, 'exact-native-zero-feedback');
    denied = true;
    // This injected transport denial checks presentation clearing; real scope denial remains an API/SQL gate.
    await page.route(`**/v1/learning-content/activities/${source.activity}/task`, route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'FORBIDDEN', requestId: 'isolated-journey-denied-read' }) }));
    await open(page, source, 'Share your checking explanation'); await expect(panel.getByRole('alert')).toBeVisible(); await expect(panel.getByText('I checked the result by working backwards and explaining each step.', { exact: true })).toHaveCount(0); await expect(panel.getByText('Show the checking steps and explain the reason for each.', { exact: true })).toHaveCount(0); await expect(panel.getByRole('button', { name: 'Open this task', exact: true })).toBeDisabled(); await capture(page, info, 'denied-linked-source');
    expect(submissionPosts).toBe(1); expect(errors).toEqual([]); expect(warnings).toEqual([]);
  });
});
