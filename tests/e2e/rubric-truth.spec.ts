import { openCurrentResult, openCurrentRubric } from './result-reader';
import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

type Account = { role: string; email: string; password: string };

test('teacher creates a rubric and releases native criteria with approved parent evidence and correction', async ({ page }) => {
  test.setTimeout(90_000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const student = accounts.find(account => account.role === 'student')!;
  const parent = accounts.find(account => account.role === 'parent')!;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error('Configured local public Auth key required for browser verification.');
  const apiUrl = 'http://localhost:4000';
  const title = `Rubric browser ${randomUUID().slice(0, 8)}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const token = async (account: Account) => {
    const response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, { headers: { apikey: publicKey }, data: { email: account.email, password: account.password } });
    expect(response.ok()).toBe(true);
    return (await response.json()).access_token as string;
  };
  const teacherToken = await token(teacher);
  const studentToken = await token(student);
  const command = async (path: string, body: Record<string, unknown>, accessToken = teacherToken) => {
    let response;
    try { response = await page.request.post(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': '10000000-0000-4000-8000-000000000001', 'Idempotency-Key': randomUUID() }, data: body }); }
    catch { throw new Error(`Domain transport unavailable for ${path}; request details withheld.`); }
    expect(response.ok(), `Expected domain receipt, got ${response.status()}`).toBe(true);
    return await response.json() as { id: string; policyVersion?: number };
  };
  const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'Independent synthetic rubric source.' });
  await command(`/v1/courses/${course.id}/publish`, {});
  const assessment = await command('/v1/assessments', { courseId: course.id, title, instructions: 'Explain the synthetic example.', maxScore: 10 });
  await command(`/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
  const mutation = (path: string) => page.waitForResponse(response => response.url() === `${apiUrl}${path}` && response.request().method() === 'POST');
  const signIn = async (account: Account) => {
    await page.goto('/');
    if (await page.getByRole('button', { name: 'English', exact: true }).isVisible()) await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel('School email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, account.role);
    await page.getByRole('button', { name: 'Academic', exact: true }).click();
  };
  const signOut = async () => {
    await signOutTrailWorkspace(page);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  };
  let visualIndex = 0;
  const visualCheck = async (target: ReturnType<typeof page.locator>) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await mkdir('.local/technical-mvp-visuals', { recursive: true });
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/technical-mvp-visuals/rubric-ar-mobile-${++visualIndex}.png` });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/technical-mvp-visuals/rubric-en-desktop-${visualIndex}.png` });
  };
  const loadChoice = async (select: ReturnType<typeof page.getByLabel>, id: string) => {
    await expect(page.getByText('Loading academic records…', { exact: true })).toHaveCount(0);
    while (!await select.locator(`option[value="${id}"]`).count()) {
      const more = page.getByRole('button', { name: 'Load more', exact: true });
      expect(await more.count()).toBeGreaterThan(0);
      await more.last().click();
      await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
    }
  };
  const loadRow = async (row: ReturnType<typeof page.locator>) => {
    await expect(page.getByText('Checking current child relationships…', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Loading academic records…', { exact: true })).toHaveCount(0);
    while (!await row.count()) {
      const more = page.getByRole('button', { name: 'Load more', exact: true });
      expect(await more.count()).toBeGreaterThan(0);
      await more.first().click();
      await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
    }
  };

  await signIn(teacher);
  await page.getByRole('button', { name: 'Rubrics', exact: true }).click();
  await page.getByRole('button', { name: 'Create school rubric', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Create school rubric', exact: true });
  await loadChoice(editor.getByLabel('Course', { exact: true }), course.id);
  await editor.getByLabel('Course', { exact: true }).selectOption(course.id);
  await editor.getByLabel('Title', { exact: true }).fill(`${title} native rubric`);
  await editor.getByLabel('Criterion title', { exact: true }).fill('Reasoning evidence');
  await editor.getByLabel('Level label', { exact: true }).fill('Developing explanation');
  await editor.getByLabel('Level description', { exact: true }).fill('Explains part of the synthetic method.');
  await editor.getByRole('button', { name: 'Add allowed level', exact: true }).click();
  await editor.getByLabel('Level label', { exact: true }).nth(1).fill('Secure explanation');
  await editor.getByLabel('Level description', { exact: true }).nth(1).fill('Explains each step using the synthetic source.');
  const created = mutation('/v1/rubrics');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const rubricResponse = await created; expect(rubricResponse.ok()).toBe(true);
  const rubric = await rubricResponse.json() as { id: string; version: string };
  await openCurrentRubric(page,rubric.id);
  await expect(page.locator(`[data-rubric-id="${rubric.id}"]`)).toContainText('Secure explanation');
  await page.getByRole('button', { name: 'Configure assessment rubric', exact: true }).click();
  await loadChoice(page.getByLabel('Assessment', { exact: true }), assessment.id);
  await page.getByLabel('Assessment', { exact: true }).selectOption(assessment.id);
  const configuration = page.getByRole('region', { name: 'Configure assessment rubric', exact: true });
  await configuration.getByLabel('Rubric', { exact: true }).selectOption(rubric.id);
  const configured = mutation(`/v1/assessments/${assessment.id}/rubric`);
  await configuration.getByRole('button', { name: 'Configure assessment rubric', exact: true }).click();
  const configuredResponse = await configured; expect(configuredResponse.ok()).toBe(true);
  const nativeAssessment = await configuredResponse.json();
  expect(nativeAssessment.model).toBe('rubric'); expect(nativeAssessment.maxScore).toBeUndefined();
  const submission = await command(`/v1/assessments/${assessment.id}/submissions`, { content: 'Independent criterion evidence from the synthetic learner.' }, studentToken);
  await page.getByRole('button', { name: 'Refresh academic records', exact: true }).click();
  await page.getByRole('button', { name: 'Marking', exact: true }).click();
  await loadRow(page.locator('.marking-queue__item').filter({ hasText: title }));
  await page.locator('.marking-queue__item').filter({ hasText: title }).click();
  let marking = page.getByRole('region', { name: 'Save marking draft', exact: true });
  await marking.getByLabel('Reasoning evidence', { exact: true }).selectOption({ label: 'Developing explanation — Explains part of the synthetic method.' });
  await marking.getByLabel('Teacher feedback', { exact: true }).fill('Teacher reviewed the permitted developing criterion.');
  await marking.getByRole('button', { name: 'Save marking draft', exact: true }).click();
  await expect(page.locator('.mark-review')).toContainText('Developing explanation');
  await expect(page.locator('.mark-review .native-score')).toHaveCount(0);
  await page.getByRole('button', { name: 'Release result', exact: true }).click();
  let releaseForm = page.getByRole('region', { name: 'Release result', exact: true });
  await expect(releaseForm.getByRole('checkbox')).not.toBeChecked();
  await releaseForm.getByRole('checkbox').check();
  // The result route carries the saved marking UUID; capture its actual successful receipt.
  const firstRelease = page.waitForResponse(response => /\/v1\/results\/[^/]+\/release$/.test(response.url()) && response.request().method() === 'POST');
  await releaseForm.getByRole('button', { name: 'Release result', exact: true }).click();
  const firstResponse = await firstRelease; expect(firstResponse.ok()).toBe(true);
  const first = await firstResponse.json() as { id: string; evidenceId: string };
  await signOut();

  await signIn(parent);
  const child=page.getByLabel('Child',{exact:true});await expect(child).toBeVisible();await expect(child.locator('option[value="20000000-0000-4000-8000-000000000012"]')).toHaveText(/^Lina Al-Kuwari(?: ·|$)/);await expect(child.locator('option[value="20000000-0000-4000-8000-000000000012"]')).toContainText('Year 1 · Cedar');await expect(child.locator('option[value="20000000-0000-4000-8000-000000000012"]')).toContainText('2026–2027');await child.selectOption('20000000-0000-4000-8000-000000000012');
  const parentResult = page.locator(`[data-result-id="${first.id}"]`);
  await openCurrentResult(page,first.id);
  await expect(parentResult).toContainText('Developing explanation');
  await expect(parentResult.locator('.native-score')).toHaveCount(0);
  await parentResult.getByRole('button', { name: 'View evidence', exact: true }).click();
  await expect(parentResult).toContainText(submission.id);
  await expect(parentResult).toContainText('Approved current parent / guardian view');
  await signOut();

  await signIn(teacher);
  await loadRow(page.locator('.marking-queue__item').filter({ hasText: title }));
  await page.locator('.marking-queue__item').filter({ hasText: title }).click();
  await page.getByRole('button', { name: 'Create correction draft', exact: true }).click();
  marking = page.getByRole('region', { name: 'Create correction draft', exact: true });
  await marking.getByLabel('Reasoning evidence', { exact: true }).selectOption({ label: 'Secure explanation — Explains each step using the synthetic source.' });
  await marking.getByLabel('Teacher feedback', { exact: true }).fill('Corrected criterion after human evidence review.');
  await marking.getByRole('button', { name: 'Create correction draft', exact: true }).click();
  await page.getByRole('button', { name: 'Release result', exact: true }).click();
  releaseForm = page.getByRole('region', { name: 'Release result', exact: true });
  await releaseForm.getByRole('checkbox').check();
  const corrected = page.waitForResponse(response => /\/v1\/results\/[^/]+\/release$/.test(response.url()) && response.request().method() === 'POST');
  await releaseForm.getByRole('button', { name: 'Release result', exact: true }).click();
  const correctionResponse = await corrected; expect(correctionResponse.ok()).toBe(true);
  const correction = await correctionResponse.json() as { id: string; revision: number };
  expect(correction.revision).toBe(2); expect(correction.id).not.toBe(first.id);
  const priorEvidence = await page.request.get(`${apiUrl}/v1/evidence/${first.evidenceId}`, { headers: { Authorization: `Bearer ${studentToken}`, 'X-School-Id': '10000000-0000-4000-8000-000000000001' } });
  expect(priorEvidence.ok()).toBe(true);
  expect(await priorEvidence.json()).toMatchObject({ resultId: first.id, sourceObjectId: submission.id, revision: 1 });
  await signOut();

  await signIn(student);
  const studentResult = page.locator(`[data-result-id="${correction.id}"]`);
  await openCurrentResult(page,correction.id);
  await expect(studentResult).toContainText('Secure explanation');
  await expect(studentResult).toContainText(rubric.version);
  await expect(studentResult.locator('.native-score')).toHaveCount(0);
  await studentResult.getByRole('button', { name: 'View evidence', exact: true }).click();
  await expect(studentResult).toContainText(submission.id);
  await visualCheck(studentResult);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect.poll(async () => { const refreshed = page.waitForResponse(response => response.url().endsWith('/v1/learners/20000000-0000-4000-8000-000000000012/state') && response.request().method() === 'GET'); await page.getByRole('button', { name: 'Refresh learner state', exact: true }).click(); expect((await refreshed).ok()).toBe(true); await expect(page.getByText('Loading learner state…', { exact: true })).toHaveCount(0); return page.locator(`.progress-workspace [data-result-id="${correction.id}"]`).count(); }, { timeout: 15_000 }).toBe(1);
  await expect(page.locator(`.progress-workspace [data-result-id="${correction.id}"]`)).toContainText('Secure explanation');
  await visualCheck(page.locator(`.progress-workspace [data-result-id="${correction.id}"]`));
  expect(errors).toEqual([]);
});
