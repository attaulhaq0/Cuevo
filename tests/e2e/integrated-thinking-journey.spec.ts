import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';

type Account = { role: string; email: string; password: string };
test('reviewed thinking focus follows the Student course journey and immutable parent result', async ({ page }) => {
  test.setTimeout(180000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const authOrigin = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (authOrigin !== 'http://127.0.0.1:56321' || !key?.startsWith('sb_publishable_')) throw Error('Standard guarded synthetic CI runtime required.');
  const roles = ['teacher', 'coordinator', 'student', 'parent'] as const;
  const selected = Object.fromEntries(roles.map(role => [role, accounts.find(row => row.role === role)!])) as Record<typeof roles[number], Account>;
  const tokens: Record<string, string> = {};
  for (const role of roles) {
    const result = await page.request.post(`${authOrigin}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: selected[role].email, password: selected[role].password } });
    expect(result.status()).toBe(200); tokens[role] = (await result.json()).access_token;
  }
  const school = '10000000-0000-4000-8000-000000000001';
  async function request(role: typeof roles[number], path: string, body?: Record<string, unknown>) {
    const result = await page.request.fetch(`http://localhost:4000/v1${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': school, 'Idempotency-Key': randomUUID() }, ...(body ? { data: body } : {}) });
    expect(result.status(), `Current synthetic ${role} request ${path}`).toBe(200);
    return result.json();
  }
  async function login(target: Page, role: typeof roles[number], query: string) {
    await target.goto(`/?${query}`);
    await target.getByRole('button', { name: 'English', exact: true }).click();
    await target.getByLabel('School email', { exact: true }).fill(selected[role].email);
    await target.getByLabel('Password', { exact: true }).fill(selected[role].password);
    await target.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expectTrailWorkspace(target, role);
  }
  const suffix = randomUUID().slice(0, 8), title = `Reviewed checking journey ${suffix}`;
  const course = await request('teacher', '/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'School-authored synthetic task thinking review.' });
  const unit = await request('teacher', `/courses/${course.id}/units`, { title: `Checking unit ${suffix}`, sequence: 1 });
  const lesson = await request('teacher', `/units/${unit.id}/lessons`, { title: `Checking lesson ${suffix}`, sequence: 1, body: 'Read the example and explain why its method works.' });
  const reference = await request('teacher', '/academic-references', { title: `Checking objective ${suffix}`, description: 'Explain a method and its purpose.', version: `school-${suffix}` });
  await request('coordinator', `/academic-references/${reference.id}/approve`, {});
  const task = await request('teacher', '/assessments', { courseId: course.id, title: `Checking explanation ${suffix}`, instructions: 'Judge one checking method and explain the choice.', maxScore: 10, preparation: true, intendedModel: 'numeric', intendedSubmissionKind: 'TEXT' });
  await request('teacher', `/assessments/${task.id}/preparation`, { title: task.title, instructions: task.instructions, dueAt: null, maxScore: 10, referenceId: reference.id, rubricId: null, expectedPreparationVersion: 1 });
  await request('teacher', `/courses/${course.id}/publish`, {});
  const preparation = await request('teacher', `/assessments/${task.id}`);
  await request('teacher', `/assessments/${task.id}/publish`, { expectedPreparationVersion: preparation.preparationVersion, expectedPolicyVersion: preparation.policyVersion, expectedAvailabilityVersion: preparation.availabilityVersion });
  const activity = await request('teacher', `/lessons/${lesson.id}/activities`, { title: `Explain the choice ${suffix}`, instructions: task.instructions, kind: 'assignment', sequence: 1 });
  const practice = await request('teacher', `/lessons/${lesson.id}/activities`, { title: `Practice the method ${suffix}`, instructions: 'Explain one checking step without a linked response task.', kind: 'practice', sequence: 2 });
  const content = await request('teacher', `/learning-content/activity/${activity.id}`);
  await request('teacher', `/learning-content/activity/${activity.id}/draft`, { resource: 'activity', expectedRevision: content.draftRevision, title: activity.title, content: task.instructions, kind: 'assignment', assessmentId: task.id, reason: 'Link the exact same-course response task.' });
  const draftContent = await request('teacher', `/learning-content/activity/${activity.id}`);
  await request('teacher', `/learning-content/activity/${activity.id}/publish`, { expectedRevision: draftContent.draftRevision, confirmPublication: true });
  const current = await request('teacher', `/thinking-focus/assessment/${task.id}`);
  await request('teacher', `/thinking-focus/assessment/${task.id}/draft`, { expectedRevision: current.revision, expectedSourceVersion: current.sourceVersion, focus: { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'EVALUATE', additionalProcesses: ['UNDERSTAND'] }, rationale: 'This task asks for a justified judgement of the method.' });
  const pending = await request('coordinator', `/thinking-focus/assessment/${task.id}`);
  const reviewed = await request('coordinator', `/thinking-focus/assessment/${task.id}/review`, { expectedRevision: pending.revision, expectedSourceVersion: pending.sourceVersion, decision: 'APPROVE', reason: 'Reviewed the exact task instructions and attached material manifest.', confirmReview: true });
  expect(reviewed.status).toBe('APPROVED');
  expect(reviewed.classification.reviewerId).not.toBe(reviewed.classification.authorId);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page, 'student', `view=learning&source=assessment&id=${task.id}`);
  await page.getByRole('button', { name: 'Open learning journey', exact: true }).click();
  await page.locator('.learning-unit-directory').getByRole('button', { name: new RegExp(`Checking unit ${suffix}`) }).click();
  await page.getByRole('button', { name: `Open lesson: Checking lesson ${suffix}`, exact: true }).click();
  const journey = page.locator('.student-learning-journey'); await expect(journey).toBeVisible();
  await journey.getByRole('button', { name: `Open activity: ${practice.title}`, exact: true }).click();
  await journey.getByRole('button', { name: 'Open this task', exact: true }).click();
  await expect(journey.locator('.activity-section > h3.activity-section__title')).toHaveText(practice.title);
  for (const locale of ['English', 'العربية']) { await page.getByRole('button', { name: locale, exact: true }).click(); if (locale === 'العربية') await journey.getByRole('button', { name: 'فتح هذه المهمة', exact: true }).click(); expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]); }
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await journey.getByRole('button', { name: `Open activity: Explain the choice ${suffix}`, exact: true }).click();
  const focus = journey.locator('.student-learning-journey__thinking');
  await expect(focus).toContainText('Evaluate'); await expect(focus).toContainText('Understand');
  await expect(focus).toContainText('Thinking focus has not been reviewed for this task.');
  await expect(focus).not.toContainText('Level 3');
  await journey.getByRole('button', { name: 'Open this task', exact: true }).click();
  const response = page.waitForResponse(result => new URL(result.url()).pathname === `/v1/assessments/${task.id}/submissions` && result.request().method() === 'POST');
  await page.getByLabel('Your response', { exact: true }).fill('I checked the method and justified my choice.');
  await page.getByRole('button', { name: 'Submit work', exact: true }).click();
  const submittedResponse = await response; expect(submittedResponse.status()).toBe(200);
  const submitted = await submittedResponse.json();
  const snapshot = await request('student', `/thinking-focus/sources/submission/${submitted.id}`);
  expect(snapshot.items.some((item: { classification: { id: string } }) => item.classification.id === reviewed.classification.id)).toBe(true);
  await signOutTrailWorkspace(page);
  const mark = await request('teacher', `/submissions/${submitted.id}/results`, { score: 0, feedback: 'Review the explanation of your judgement.', expectedPolicyVersion: preparation.policyVersion, expectedRevision: 0, sourceEvidence: true });
  const released = await request('teacher', `/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true });
  await login(page, 'parent', `view=academic&source=result&id=${released.id}`);
  await expect(page.getByRole('img', { name: '0 out of 10', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thinking focus recorded with this work', exact: true }).click();
  await expect(page.locator('.thinking-focus-snapshot')).toContainText('Evaluate');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
  await signOutTrailWorkspace(page);
});
