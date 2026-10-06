import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type FocusRecord = { id?: string; revision: number; sourceVersion: string; status: string; classification: { id: string; revision: number; focus: { primaryProcess: string; additionalProcesses: string[] }; authorId: string; reviewerId: string | null } | null };
const optIn = process.env.CUEVO_THINKING_FOCUS_ISOLATED_RUNTIME;
const root = resolve(import.meta.dirname, '../..');
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';
const focus = { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'APPLY', additionalProcesses: ['UNDERSTAND', 'EVALUATE'] };

test.describe('isolated current-source thinking focus', () => {
  test.skip(!optIn, 'Requires the explicitly configured separate synthetic Bloom runtime.');
  let runtime: Runtime, accounts: Record<string, Account>, tokens: Record<string, string>, school: string;
  let courseId: string, lessonId: string, sourceSequence = 0;
  let buildId: string;
  const titlePrefix = `Thinking focus browser ${randomUUID().slice(0, 8)}`;

  async function request<T = Record<string, unknown>>(role: string, path: string, body?: Record<string, unknown>, expected = 200, key = randomUUID()): Promise<T> {
    const response = await fetch(api + '/v1' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': school, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: body ? JSON.stringify(body) : undefined });
    expect(response.status, `Expected status for isolated ${role} source request ${path}`).toBe(expected);
    return await response.json() as T;
  }
  async function activity(name: string) {
    return request<{ id: string }>('teacher', `/lessons/${lessonId}/activities`, { title: name, instructions: 'Use a checking method and explain why one step works.', kind: 'practice', sequence: ++sourceSequence });
  }
  async function draft(id: string) {
    const source = await request<FocusRecord>('teacher', `/thinking-focus/activity/${id}`);
    return request<FocusRecord>('teacher', `/thinking-focus/activity/${id}/draft`, { expectedRevision: source.revision, expectedSourceVersion: source.sourceVersion, focus, rationale: 'Use a method, explain its steps and justify a choice.' });
  }
  async function approve(id: string) {
    const source = await request<FocusRecord>('coordinator', `/thinking-focus/activity/${id}`);
    return request<FocusRecord>('coordinator', `/thinking-focus/activity/${id}/review`, { expectedRevision: source.revision, expectedSourceVersion: source.sourceVersion, decision: 'APPROVE', reason: 'Reviewed the exact task and mixed thinking demand.', confirmReview: true });
  }
  async function guard(page: Page) {
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', route => {
      const url = new URL(route.request().url());
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin)) return route.abort();
      return route.continue();
    });
  }
  async function login(page: Page, role: string, view = 'learning', source?: string, id?: string) {
    await guard(page);
    const query = new URLSearchParams({ view, ...(source && id ? { source, id } : {}) });
    await page.goto(`${base}/?${query}`); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(accounts[role].email); await page.locator('#password').fill(accounts[role].password); await page.locator('.auth-submit').click();
    await expect(page.locator('.workspace')).toBeVisible();
  }
  async function teacherEditor(page: Page, name: string) {
    await login(page, 'teacher', 'learning', 'course', courseId);
    await page.locator('.learning-preparation-outline').getByRole('button', { name: new RegExp(name) }).click();
    const section = page.locator('.learning-preparation-main');
    await section.getByRole('button', { name: 'Review thinking focus', exact: true }).click();
    return section;
  }
  async function reviewEditor(page: Page, name: string) {
    await login(page, 'coordinator', 'curriculum');
    await page.locator('.curriculum-thinking-review').getByRole('button', { name: 'Review thinking focus', exact: true }).click();
    await page.locator('#thinking-course-review').selectOption(courseId);
    await page.getByRole('button', { name: 'Course thinking-focus review', exact: true }).click();
    const row = page.locator('.thinking-focus-queue__items > li').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await row.getByRole('button', { name: 'Open task review', exact: true }).click();
    const editor = page.locator('.thinking-focus-editor').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await editor.getByRole('button', { name: 'Review the proposed focus', exact: true }).click();
    return editor;
  }
  async function fillDraft(section: Locator, name: string) {
    await section.getByRole('button', { name: 'Prepare a focus draft', exact: true }).click();
    const form = section.getByRole('region', { name: `Prepare a focus draft: ${name}`, exact: true });
    await form.getByLabel('Main thinking focus', { exact: true }).selectOption('APPLY');
    await form.getByLabel('Also used in this task: Understand', { exact: true }).check();
    await form.getByLabel('Also used in this task: Evaluate', { exact: true }).check();
    await form.getByLabel('Why this focus fits the actual task', { exact: true }).fill('Use a method, explain its steps and justify a choice.');
    return form;
  }
  async function checkPage(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  }

  test.beforeAll(async () => {
    if (!optIn || resolve(optIn) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Only the dedicated ignored Bloom runtime is permitted.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (!process.env.CUEVO_THINKING_FOCUS_BUILD || buildId !== process.env.CUEVO_THINKING_FOCUS_BUILD) throw new Error('The exact isolated web build must be frozen before this journey.');
    runtime = JSON.parse(await readFile(optIn, 'utf8')) as Runtime;
    if (new URL(runtime.config.SUPABASE_URL).hostname !== '127.0.0.1' || new URL(runtime.config.SUPABASE_URL).port !== '57421' || new URL(runtime.config.DATABASE_URL).port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Separate synthetic runtime/provider guard failed.');
    accounts = Object.fromEntries(Object.entries({ teacher: '004', coordinator: '002', student: '012', parent: '072' }).map(([role, suffix]) => [role, runtime.accounts.find(account => account.actorId.endsWith(suffix))! ]));
    school = accounts.teacher.schoolId; tokens = {};
    for (const [role, account] of Object.entries(accounts)) {
      if (!account || account.schoolId !== school) throw new Error('Required current synthetic school relationship missing.');
      const auth = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await auth.auth.signInWithPassword({ email: account.email, password: account.password });
      if (signedIn.error || !signedIn.data.session) throw new Error('Isolated authentication unavailable.');
      tokens[role] = signedIn.data.session.access_token;
    }
    const classes = await request<{ items: { id: string }[] }>('teacher', '/classes?limit=25');
    const subjects = await request<{ items: { id: string }[] }>('teacher', '/subjects?limit=25');
    const course = await request<{ id: string }>('teacher', '/courses', { classId: classes.items[0].id, subjectId: subjects.items[0].id, title: titlePrefix, description: 'Isolated synthetic browser review tasks.' }); courseId = course.id;
    const unit = await request<{ id: string }>('teacher', `/courses/${courseId}/units`, { title: 'Review thinking in tasks', sequence: 1 });
    const lesson = await request<{ id: string }>('teacher', `/units/${unit.id}/lessons`, { title: 'Check one method', body: 'Use one method and explain its purpose.', sequence: 1 }); lessonId = lesson.id;
    await request('teacher', `/courses/${courseId}/publish`, {});
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  test('teacher draft, independent review and learner completion retain exact task demand', async ({ page }, info) => {
    test.setTimeout(120_000); const name = `${titlePrefix} mixed task`, work = await activity(name);
    const section = await teacherEditor(page, name); await fillDraft(section, name);
    await section.getByRole('button', { name: 'Close thinking focus', exact: true }).click(); await section.getByRole('button', { name: 'Review thinking focus', exact: true }).click();
    const form = section.getByRole('region', { name: `Prepare a focus draft: ${name}`, exact: true });
    await expect(form.getByLabel('Main thinking focus')).toHaveValue('APPLY'); await expect(form.getByLabel('Also used in this task: Understand')).toBeChecked();
    const sent = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/thinking-focus/activity/${work.id}/draft` && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Save focus for review', exact: true }).click(); const saved = await sent;
    if (saved.status() !== 200) {
      const actual = await request<FocusRecord>('teacher', `/thinking-focus/activity/${work.id}`);
      await info.attach('unconfirmed-draft', { body: JSON.stringify({ status: saved.status(), body: saved.request().postDataJSON(), response: await saved.json(), current: actual }, null, 2), contentType: 'application/json' });
    }
    expect(saved.status()).toBe(200); await expect(section.getByText('Awaiting school review', { exact: true }).first()).toBeVisible(); await checkPage(page);
    const reviewer = await page.context().newPage(), editor = await reviewEditor(reviewer, name);
    await expect(editor.locator('.thinking-focus-source')).toHaveAttribute('open', '');
    const reviewForm = editor.getByRole('region', { name: `Review the proposed focus: ${name}`, exact: true });
    await reviewForm.getByLabel('Review decision').selectOption('APPROVE'); await reviewForm.getByLabel('Reason for this decision').fill('Reviewed the actual instructions.'); await reviewForm.getByLabel('I reviewed these exact instructions and approve recording this decision').check();
    await reviewForm.getByRole('button', { name: 'Review the proposed focus', exact: true }).click(); await expect(editor.getByText('Use an idea or method in this activity.', { exact: true })).toBeVisible();
    const learner = await page.context().newPage(); await login(learner, 'student', 'learning', 'course', courseId); await learner.getByRole('button', { name: 'Open lesson: Check one method', exact: true }).click(); await learner.getByRole('button', { name: `Open activity: ${name}`, exact: true }).click();
    await expect(learner.getByText('Use an idea or method in this activity.', { exact: true })).toBeVisible();
    const completionResponse = learner.waitForResponse(response => new URL(response.url()).pathname === `/v1/activities/${work.id}/complete` && response.request().method() === 'POST');
    await learner.getByRole('button', { name: 'Complete activity', exact: true }).click(); const completion = await (await completionResponse).json() as { id: string };
    const snapshot = await request<{ items: FocusRecord[] }>('student', `/thinking-focus/sources/completion/${completion.id}`); expect(snapshot.items[0].classification?.focus).toMatchObject(focus);
    for (const width of [390, 320]) { await learner.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await learner.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(learner.getByText('استخدم فكرة أو طريقة في هذه المهمة.', { exact: true })).toBeVisible(); await checkPage(learner); }
    await info.attach('learner-rtl', { body: await learner.screenshot({ fullPage: true }), contentType: 'image/png' });
    await reviewer.close(); await learner.close();
  });

  test('a delayed exact focus read cannot reveal the preceding task after another source is selected', async ({ page }) => {
    const name = `${titlePrefix} delayed task`, work = await activity(name), otherName = `${titlePrefix} next task`; await activity(otherName);
    let release!: () => void; const held = new Promise<void>(resolveHeld => { release = resolveHeld; });
    await login(page, 'teacher', 'learning', 'course', courseId); await page.locator('.learning-preparation-outline').getByRole('button', { name: new RegExp(name) }).click();
    await page.route(`**/v1/thinking-focus/activity/${work.id}`, async route => { const response = await route.fetch(); await held; await route.fulfill({ response }); });
    await page.locator('.learning-preparation-main').getByRole('button', { name: 'Review thinking focus', exact: true }).click(); await expect(page.getByText('Checking the reviewed task focus…')).toBeVisible();
    await page.locator('.learning-preparation-outline').getByRole('button', { name: new RegExp(otherName) }).click(); release();
    await expect(page.locator('.learning-preparation-main > h2')).toHaveText(otherName); await expect(page.locator('.learning-preparation-main .thinking-focus-editor h3')).toHaveCount(0);
    await page.context().setOffline(true); await expect(page.locator('.workspace')).toHaveCount(0); await expect(page.locator('.thinking-focus-editor')).toHaveCount(0); await page.context().setOffline(false);
  });

  test('a checked reviewer decision keeps its original source and cannot approve revised task content', async ({ page }) => {
    const name = `${titlePrefix} changed task`, work = await activity(name); await draft(work.id); const editor = await reviewEditor(page, name);
    const form = editor.getByRole('region', { name: `Review the proposed focus: ${name}`, exact: true });
    await form.getByLabel('Review decision').selectOption('APPROVE'); await form.getByLabel('Reason for this decision').fill('Checked original source.'); await form.getByLabel('I reviewed these exact instructions and approve recording this decision').check();
    const old = await request<FocusRecord>('coordinator', `/thinking-focus/activity/${work.id}`);
    const content = await request<{ revision: number }>('teacher', `/learning-content/activity/${work.id}`);
    const changed = await request<{ revision: number }>('teacher', `/learning-content/activity/${work.id}/draft`, { resource: 'activity', expectedRevision: content.revision, title: name, content: 'Create a new explanation instead of using the previous method.', kind: 'practice', assessmentId: null, reason: 'Synthetic current-source regression.' });
    await request('teacher', `/learning-content/activity/${work.id}/publish`, { expectedRevision: changed.revision, confirmPublication: true });
    const reply = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/thinking-focus/activity/${work.id}/review` && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Review the proposed focus', exact: true }).click(); const rejected = await reply; expect(rejected.status()).toBe(409);
    expect(rejected.request().postDataJSON().expectedSourceVersion).toBe(old.sourceVersion); await expect(form.getByRole('alert')).toBeVisible();
    const exactEditor = page.locator('.thinking-focus-editor');
    await exactEditor.getByRole('button', { name: 'Close thinking focus', exact: true }).click(); await exactEditor.getByRole('button', { name: 'Review thinking focus', exact: true }).click(); await expect(exactEditor.getByText('The task changed. Its thinking focus needs another review.', { exact: true }).first()).toBeVisible();
    expect((await request<FocusRecord>('coordinator', `/thinking-focus/activity/${work.id}`)).status).toBe('SOURCE_CHANGED');
  });

  test('a malformed transport receipt preserves one original command until actual replay confirms it', async ({ page }) => {
    const name = `${titlePrefix} uncertain task`, work = await activity(name), section = await teacherEditor(page, name), form = await fillDraft(section, name);
    const keys: string[] = [], bodies: unknown[] = []; let first = true;
    await page.route(`**/v1/thinking-focus/activity/${work.id}/draft`, async route => {
      keys.push(route.request().headers()['idempotency-key']); bodies.push(route.request().postDataJSON()); const response = await route.fetch(); expect(response.status()).toBe(200);
      if (first) { first = false; const actual = await response.json() as { id: string }; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: actual.id }) }); }
      else await route.fulfill({ response });
    });
    await form.getByRole('button', { name: 'Save focus for review', exact: true }).click(); await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible(); await expect(form.getByLabel('Main thinking focus')).toBeDisabled();
    await form.getByRole('button', { name: 'Retry the same action', exact: true }).click(); await expect(section.getByText('Awaiting school review', { exact: true }).first()).toBeVisible();
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(bodies[0]).toEqual(bodies[1]);
    const history = await request<{ items: FocusRecord[] }>('teacher', `/thinking-focus/activity/${work.id}/history?limit=25`); expect(history.items).toHaveLength(1);
  });

  test('withdrawal changes current presentation without erasing an earlier completed focus snapshot', async ({ page }) => {
    const name = `${titlePrefix} withdrawn task`, work = await activity(name); await draft(work.id); const approved = await approve(work.id);
    const completion = await request<{ id: string }>('student', `/activities/${work.id}/complete`, { reflection: 'Checked a school method.' }); const editor = await reviewEditor(page, name);
    const form = editor.getByRole('region', { name: `Review the proposed focus: ${name}`, exact: true });
    await expect(form.getByLabel('Review decision').locator('option[value="APPROVE"]')).toHaveCount(0); await form.getByLabel('Review decision').selectOption('WITHDRAW'); await form.getByLabel('Reason for this decision').fill('Withdraw this current classification for review.'); await form.getByLabel('I reviewed these exact instructions and approve recording this decision').check();
    await form.getByRole('button', { name: 'Review the proposed focus', exact: true }).click(); await expect(editor.getByText('The reviewed focus was withdrawn.', { exact: true })).toBeVisible();
    const current = await request<FocusRecord>('coordinator', `/thinking-focus/activity/${work.id}`), learner = await request<FocusRecord>('student', `/thinking-focus/activity/${work.id}`), snapshot = await request<{ items: FocusRecord[] }>('student', `/thinking-focus/sources/completion/${completion.id}`);
    expect(current.status).toBe('WITHDRAWN'); expect(learner.status).toBe('UNCLASSIFIED'); expect(learner.classification).toBeNull(); expect(snapshot.items[0].status).toBe('APPROVED'); expect(snapshot.items[0].classification?.id).toBe(approved.classification?.id);
  });

  test('parent reads reviewed task demand only through exact released native evidence', async ({ page }, info) => {
    test.setTimeout(90000);
    const reference = await request<{ id: string }>('teacher', '/academic-references', { title: `${titlePrefix} checking objective`, description: 'School-authored explanation of a checking method.', version: 'school-browser-1' });
    await request('coordinator', `/academic-references/${reference.id}/approve`, {});
    const assessment = await request<{ id: string; policyVersion: number }>('teacher', '/assessments', { courseId, title: `${titlePrefix} native zero`, instructions: 'Use and justify a checking method.', maxScore: 10 });
    await request('teacher', `/assessments/${assessment.id}/reference`, { referenceId: reference.id, expectedPolicyVersion: assessment.policyVersion });
    const current = await request<FocusRecord>('teacher', `/thinking-focus/assessment/${assessment.id}`);
    const proposed = await request<FocusRecord>('teacher', `/thinking-focus/assessment/${assessment.id}/draft`, { expectedRevision: current.revision, expectedSourceVersion: current.sourceVersion, focus, rationale: 'Use a method and justify it.' });
    await request('coordinator', `/thinking-focus/assessment/${assessment.id}/review`, { expectedRevision: proposed.revision, expectedSourceVersion: proposed.sourceVersion, decision: 'APPROVE', reason: 'Reviewed exact native task.', confirmReview: true });
    const submitted = await request<{ id: string }>('student', `/assessments/${assessment.id}/submissions`, { content: 'I used the method and checked its purpose.' });
    const configured = await request<{ policyVersion: number }>('teacher', `/assessments/${assessment.id}`);
    const marked = await request<{ id: string; revision: number }>('teacher', `/submissions/${submitted.id}/results`, { score: 0, feedback: 'Explain why the method fits.', expectedPolicyVersion: configured.policyVersion, expectedRevision: 0, sourceEvidence: true });
    const released = await request<{ id: string; nativeResult: { type: string; score: number; maxScore: number } }>('teacher', `/results/${marked.id}/release`, { expectedRevision: marked.revision, parentVisible: true });
    expect(released.nativeResult).toMatchObject({ type: 'numeric', score: 0, maxScore: 10 });
    await page.setViewportSize({ width: 390, height: 844 }); await login(page, 'parent', 'academic', 'result', released.id); await page.getByRole('button', { name: 'العربية', exact: true }).click();
    const snapshot = page.locator('.thinking-focus-snapshot'); await snapshot.getByRole('button').click(); await expect(snapshot.getByText('استخدم فكرة أو طريقة في هذه المهمة.', { exact: true })).toBeVisible();
    await expect(page.locator('.thinking-focus-editor')).toHaveCount(0); await checkPage(page);
    await request('parent', `/thinking-focus/sources/submission/${submitted.id}`, undefined, 403);
    await info.attach('parent-native-source', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('published rubric criterion editor retains exact criterion demand and native descriptor', async ({ page }, info) => {
    test.setTimeout(120000);
    const reference = await request<{ id: string }>('teacher', '/academic-references', { title: `${titlePrefix} comparison objective`, description: 'Explain a school comparison using supplied alternatives.', version: 'school-browser-criterion-1' }); await request('coordinator', `/academic-references/${reference.id}/approve`, {});
    const rubric = await request<{ id: string }>('teacher', '/rubrics', { courseId, title: `${titlePrefix} comparison rubric`, version: 'school-browser-1', criteria: [{ key: 'comparison', title: 'Compare alternatives', levels: [{ key: 'shown', label: 'Comparison shown', description: 'Compare the supplied alternatives and explain one difference.' }] }] });
    const taskName = `${titlePrefix} published criterion`, assessment = await request<{ id: string }>('teacher', '/assessments', { courseId, title: taskName, instructions: 'Compare two supplied approaches and explain how their parts differ.', maxScore: 10, preparation: true, intendedModel: 'rubric', intendedSubmissionKind: 'TEXT' });
    await request('teacher', `/assessments/${assessment.id}/preparation`, { title: taskName, instructions: 'Compare two supplied approaches and explain how their parts differ.', dueAt: null, maxScore: 10, referenceId: reference.id, rubricId: rubric.id, expectedPreparationVersion: 1 });
    const prepared = await request<{ preparationVersion: number; policyVersion: number; availabilityVersion: number }>('teacher', `/assessments/${assessment.id}`); await request('teacher', `/assessments/${assessment.id}/publish`, { expectedPreparationVersion: prepared.preparationVersion, expectedPolicyVersion: prepared.policyVersion, expectedAvailabilityVersion: prepared.availabilityVersion });
    await login(page, 'teacher', 'learning', 'assessment', assessment.id);
    const criteriaSection = page.locator('.thinking-focus-criteria'); await criteriaSection.getByRole('button', { name: 'Assessment criterion focus', exact: true }).click();
    const criterion = page.locator('.thinking-focus-criteria article').filter({ has: page.getByRole('heading', { name: 'Compare alternatives', exact: true }) });
    await criterion.getByRole('button', { name: 'Open task review', exact: true }).click();
    const editor = criteriaSection.locator('.thinking-focus-editor'); await editor.getByRole('button', { name: 'Prepare a focus draft', exact: true }).click();
    const heading = await editor.locator('h3').first().innerText();
    const form = editor.getByRole('region', { name: `Prepare a focus draft: ${heading}`, exact: true });
    await form.getByLabel('Main thinking focus').selectOption('ANALYZE'); await form.getByLabel('Why this focus fits the actual task').fill('Compare the supplied parts and their relationships.');
    const draftResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/thinking-focus/criterion/${assessment.id}/draft` && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Save focus for review', exact: true }).click(); expect((await draftResponse).status()).toBe(200);
    await expect(page.locator('.workspace-main > [role="status"]')).toContainText('Saved.');
    await page.locator('.thinking-focus-criteria').getByRole('button', { name: 'Assessment criterion focus', exact: true }).click();
    await page.locator('.thinking-focus-criteria article').filter({ has: page.getByRole('heading', { name: 'Compare alternatives', exact: true }) }).getByRole('button', { name: 'Open task review', exact: true }).click();
    await expect(page.locator('.thinking-focus-criteria .thinking-focus-editor').getByText('Awaiting school review', { exact: true })).toBeVisible();
    const source = await request<FocusRecord>('coordinator', `/thinking-focus/criterion/${assessment.id}?criterionKey=comparison`); await request('coordinator', `/thinking-focus/criterion/${assessment.id}/review?criterionKey=comparison`, { expectedRevision: source.revision, expectedSourceVersion: source.sourceVersion, decision: 'APPROVE', reason: 'Reviewed the exact comparison criterion.', confirmReview: true });
    const submitted = await request<{ id: string }>('student', `/assessments/${assessment.id}/submissions`, { content: 'I compared the two parts and explained their relationship.' });
    const mark = await request<{ id: string; revision: number }>('teacher', `/submissions/${submitted.id}/results`, { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'comparison', levelKey: 'shown' }] }, feedback: 'The comparison is shown in the original school rubric.', expectedPolicyVersion: prepared.policyVersion, expectedRevision: 0, sourceEvidence: true });
    const released = await request<{ id: string; nativeResult: { type: string; normalized: null; criteria: { criterionKey: string; levelLabel: string }[] }; score?: number }>('teacher', `/results/${mark.id}/release`, { expectedRevision: mark.revision, parentVisible: true });
    expect(released.score).toBeUndefined(); expect(released.nativeResult.type).toBe('rubric'); expect(released.nativeResult.normalized).toBeNull(); expect(released.nativeResult.criteria[0]).toMatchObject({ criterionKey: 'comparison', levelLabel: 'Comparison shown' });
    const snapshot = await request<{ items: { target: { kind: string; criterionKey: string }; classification: { focus: { primaryProcess: string } } }[] }>('parent', `/thinking-focus/sources/result/${released.id}`); expect(snapshot.items[0].target).toMatchObject({ kind: 'CRITERION', criterionKey: 'comparison' }); expect(snapshot.items[0].classification.focus.primaryProcess).toBe('ANALYZE');
    await checkPage(page); await info.attach('published-criterion-editor', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('uncertain withdrawal reconciles its original command after current review permission closes', async ({ page }) => {
    const name = `${titlePrefix} uncertain withdrawal`, work = await activity(name); await draft(work.id); await approve(work.id); const editor = await reviewEditor(page, name);
    const form = editor.getByRole('region', { name: `Review the proposed focus: ${name}`, exact: true });
    await form.getByLabel('Review decision').selectOption('WITHDRAW'); await form.getByLabel('Reason for this decision').fill('Withdraw this exact current focus.'); await form.getByLabel('I reviewed these exact instructions and approve recording this decision').check();
    const keys: string[] = [], bodies: unknown[] = []; let first = true;
    await page.route(`**/v1/thinking-focus/activity/${work.id}/review`, async route => {
      keys.push(route.request().headers()['idempotency-key']); bodies.push(route.request().postDataJSON()); const response = await route.fetch(); expect(response.status()).toBe(200);
      if (first) { first = false; const actual = await response.json() as { id: string }; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: actual.id }) }); }
      else await route.fulfill({ response });
    });
    await form.getByRole('button', { name: 'Review the proposed focus', exact: true }).click(); await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible();
    const current = await request<FocusRecord & { canReview: boolean }>('coordinator', `/thinking-focus/activity/${work.id}`); expect(current.status).toBe('WITHDRAWN'); expect(current.canReview).toBe(false);
    const queueControl = page.getByRole('button', { name: 'Course thinking-focus review', exact: true });
    await queueControl.click(); await queueControl.click();
    const choice = page.locator('.thinking-focus-queue__items > li').filter({ has: page.getByRole('heading', { name, exact: true }) }); await choice.getByRole('button', { name: 'Open task review', exact: true }).click();
    const retry = editor.getByRole('button', { name: 'Retry the same action', exact: true }); await expect(retry).toBeVisible(); await retry.click();
    await expect(editor.getByText('The reviewed focus was withdrawn.', { exact: true }).first()).toBeVisible(); await expect(editor.getByRole('button', { name: 'Retry the same action', exact: true })).toHaveCount(0);
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(bodies[0]).toEqual(bodies[1]);
    const history = await request<{ items: FocusRecord[] }>('coordinator', `/thinking-focus/activity/${work.id}/history?limit=25`); expect(history.items).toHaveLength(3);
  });

  test('reviewer opens actual private task material through the exact reviewed source route', async ({ page }, info) => {
    const name = `${titlePrefix} material task`, work = await activity(name);
    const bytes = Buffer.from('School-authored example: compare the two steps and explain the difference.\n', 'utf8'), sha256 = createHash('sha256').update(bytes).digest('hex');
    const asset = await request<{ id: string }>('teacher', `/courses/${courseId}/resource-assets`, { name: 'school-checking-example.txt', contentType: 'text/plain', byteSize: bytes.length, sha256 });
    await request('teacher', `/courses/${courseId}/resource-assets/${asset.id}/finalize`, { contentBase64: bytes.toString('base64') });
    const resource = await request<{ id: string; revision: number; revisionId: string }>('teacher', `/courses/${courseId}/resources/activity/${work.id}`, { assetId: asset.id, title: 'School checking example', sequence: 1 });
    const published = await request<{ id: string; revisionId: string }>('teacher', `/courses/${courseId}/resources/${resource.id}/publish`, { expectedRevision: resource.revision, confirmPublication: true });
    await draft(work.id);
    const downloadPaths: string[] = []; page.on('request', request => { if (request.url().includes('/download')) downloadPaths.push(new URL(request.url()).pathname); });
    const editor = await reviewEditor(page, name); const material = editor.locator('.thinking-focus-materials'); await expect(material.getByText('School checking example', { exact: true })).toBeVisible();
    const downloaded = page.waitForResponse(response => new URL(response.url()).pathname.includes(`/materials/${published.id}/${published.revisionId}/download`));
    await material.getByRole('button', { name: 'Open material', exact: true }).click(); const response = await downloaded; expect(response.status()).toBe(200);
    const received = await response.body(); expect(createHash('sha256').update(received).digest('hex')).toBe(sha256); expect(received.equals(bytes)).toBe(true);
    expect(downloadPaths).toHaveLength(1); expect(downloadPaths[0]).toBe(`/v1/thinking-focus/activity/${work.id}/materials/${published.id}/${published.revisionId}/download`);
    await request('coordinator', `/learning-resources/${published.id}/revisions/${published.revisionId}/download`, undefined, 403);
    await checkPage(page); await info.attach('reviewed-material', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('review controls retain native keyboard focus at dark Arabic 200% equivalent reflow', async ({ page }, info) => {
    const name = `${titlePrefix} keyboard review`, work = await activity(name); await draft(work.id);
    await page.context().addCookies([{ name: 'cuevo_workspace_theme', value: 'dark', url: base }]);
    const editor = await reviewEditor(page, name);
    await page.getByRole('button', { name: 'العربية', exact: true }).click(); await page.setViewportSize({ width: 640, height: 450 });
    await expect(page.locator('.workspace')).toHaveAttribute('data-theme', 'dark'); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await editor.getByRole('button', { name: 'مراجعة التركيز المقترح', exact: true }).click();
    const select = editor.getByLabel('قرار المراجعة', { exact: true }); await expect(select).toBeVisible();
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
    let reached = false;
    for (let attempt = 0; attempt < 100; attempt++) { await page.keyboard.press('Tab'); if (await select.evaluate(element => element === document.activeElement)) { reached = true; break; } }
    expect(reached).toBe(true); await expect(select).toBeFocused();
    const focus = await select.evaluate(element => { const box = element.getBoundingClientRect(), style = getComputedStyle(element), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return { outlined: element.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2, visible: box.top >= 0 && box.bottom <= innerHeight, unobscured: hit === element || element.contains(hit) }; });
    expect(focus).toEqual({ outlined: true, visible: true, unobscured: true });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await expect(select).toHaveValue('APPROVE');
    await checkPage(page); await info.attach('keyboard-dark-rtl-200-percent-reflow', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
});
