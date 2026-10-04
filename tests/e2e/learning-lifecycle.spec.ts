import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
type Account = { role: string; email: string; password: string };
test('private draft, teacher return and immutable resubmission work beside checked quiz answers', async ({ page }) => {
  test.setTimeout(90_000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(account => account.role === 'teacher')!; const student = accounts.find(account => account.role === 'student')!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY; if (!key) throw new Error('Local public Auth configuration required.');
  const auth = async (account: Account) => { let response; try { response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: account.email, password: account.password } }); } catch { throw new Error('Synthetic Auth transport unavailable; details withheld.'); } expect(response.ok()).toBe(true); return (await response.json()).access_token as string; };
  const teacherToken = await auth(teacher);
  const command = async (path: string, body: Record<string, unknown>) => { let response; try { response = await page.request.post(`http://localhost:4000${path}`, { headers: { Authorization: `Bearer ${teacherToken}`, 'X-School-Id': '10000000-0000-4000-8000-000000000001', 'Idempotency-Key': randomUUID() }, data: body }); } catch { throw new Error(`Domain transport unavailable for ${path}; details withheld.`); } expect(response.ok(), 'HTTP ' + response.status() + ' for ' + path).toBe(true); return await response.json() as { id: string }; };
  const title = `Lifecycle ${randomUUID().slice(0, 6)}`;
  const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'Independent synthetic lifecycle.' }); await command(`/v1/courses/${course.id}/publish`, {});
  const assignment = await command('/v1/assessments', { courseId: course.id, title, instructions: 'Explain and revise.', maxScore: 10 });
  await command('/v1/assessments', { courseId: course.id, title: `${title} quiz`, instructions: 'Choose a safe synthetic answer.', maxScore: 10 });
  const signIn = async (account: Account) => { await page.goto('/'); if (await page.getByRole('button', { name: 'English', exact: true }).isVisible()) await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, account.role); await page.getByRole('button', { name: 'Learning', exact: true }).click(); await page.getByRole('button', { name: 'Assessments', exact: true }).click(); };
  const signOut = async () => { await signOutTrailWorkspace(page); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(); };
  const row = (name: string) => page.locator('.assessment-section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const waitRow = async (target: ReturnType<typeof row>) => { for (let pageIndex = 0; pageIndex < 40; pageIndex++) { const more = page.locator('.learning-workspace').getByRole('button', { name: 'Load more', exact: true }).first(); await expect.poll(async () => await target.count() > 0 || await more.count() > 0, { timeout: 15000 }).toBe(true); if (await target.count()) { await expect(target).toBeVisible({ timeout: 15000 }); const openTask=target.getByRole('button',{name:'Open task',exact:true});if(await openTask.count())await openTask.click();return; } await more.click(); await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0, { timeout: 15000 }); } throw new Error('Exact task was not reached within authorized continuation.'); };
  const response = (suffix: string) => page.waitForResponse(result => result.url().endsWith(suffix) && result.request().method() === 'POST');
  await signIn(teacher); const quizRow = row(`${title} quiz`); await waitRow(quizRow);
  await quizRow.getByRole('button', { name: 'Quiz versions', exact: true }).click(); await quizRow.getByRole('button', { name: 'Create quiz version', exact: true }).click();
  const quizForm = quizRow.getByRole('region', { name: 'Create quiz version', exact: true }); await quizForm.getByLabel('Question prompt 1', { exact: true }).fill('Which example follows the teacher instructions?'); await quizForm.getByLabel('Option label 1.1', { exact: true }).fill('Show the steps'); await quizForm.getByLabel('Option label 1.2', { exact: true }).fill('Skip the explanation'); await quizForm.getByLabel('Correct answer 1', { exact: true }).selectOption({ label: 'Show the steps' }); await quizForm.getByRole('button', { name: 'Save', exact: true }).click();
  const publish = quizRow.getByRole('region', { name: 'Publish quiz version', exact: true }); await publish.getByRole('button', { name: 'Publish quiz version', exact: true }).click(); await signOut();
  const assignmentRow = row(title);
  let releaseDraftRead!: () => void; const draftReadHeld = new Promise<void>(resolve => { releaseDraftRead = resolve; });
  let draftReadStarted!: () => void; const draftReadObserved = new Promise<void>(resolve => { draftReadStarted = resolve; });
  let draftReadFinished!: () => void; const draftReadComplete = new Promise<void>(resolve => { draftReadFinished = resolve; });
  const draftPath = `/v1/assessments/${assignment.id}/draft`;
  await page.route(`**${draftPath}`, async route => { if (route.request().method() === 'GET') { draftReadStarted(); await draftReadHeld; } try { await route.continue(); } finally { draftReadFinished(); } });
  await signIn(student); await expect(assignmentRow).toBeVisible(); await assignmentRow.getByRole('button',{name:'Open task',exact:true}).click();await draftReadObserved;
  await assignmentRow.evaluate(element => {
    const observed = { prematureEditor: false }; const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement
        && (node.matches('textarea[name="content"]') || node.querySelector('textarea[name="content"]'))) observed.prematureEditor = true;
    });
    observer.observe(element, { childList: true, subtree: true });
    Object.assign(element, { draftReadObservation: observed, draftReadObserver: observer });
  });
  // Default editing now loads the current draft before exposing any response editor.
  await assignmentRow.getByRole('button', { name: 'Save draft', exact: true }).first().click(); await draftReadObserved;
  await expect(assignmentRow.getByRole('region', { name: 'Save draft', exact: true }).getByLabel('Your response')).toHaveCount(0);
  expect(await assignmentRow.evaluate(element => {
    const state = element as HTMLElement & { draftReadObservation: { prematureEditor: boolean }; draftReadObserver: MutationObserver };
    state.draftReadObserver.disconnect(); return state.draftReadObservation.prematureEditor;
  }), 'An editable draft must never mount before the initial current source read completes').toBe(false);
  releaseDraftRead(); await draftReadComplete; await page.unroute(`**${draftPath}`);
  let form = assignmentRow.getByRole('region', { name: 'Save draft', exact: true }); await form.getByLabel('Your response').fill('Private first draft.');
  const draftSaved = response(draftPath); await form.getByRole('button', { name: 'Save draft', exact: true }).click(); const draftReceipt = await draftSaved;
  expect(draftReceipt.ok()).toBe(true); expect(draftReceipt.request().postDataJSON()).toMatchObject({ content: 'Private first draft.', expectedRevision: 0 });
  expect(await draftReceipt.json()).toMatchObject({ assessmentId: assignment.id, content: 'Private first draft.', revision: 1, status: 'DRAFT' });
  form = assignmentRow.getByRole('region', { name: 'Submit work', exact: true }); await expect(form.getByLabel('Your response')).toHaveValue('Private first draft.'); const submitted = response(`/v1/assessments/${assignment.id}/submissions`); await form.getByRole('button', { name: 'Submit work', exact: true }).click(); const original = await (await submitted).json() as { id: string }; await signOut();
  await signIn(teacher); await page.getByRole('button', { name: 'Submissions', exact: true }).click(); const submissionRow = page.locator('.submission-section').filter({ hasText: title }).first(); await expect(submissionRow).toBeVisible(); await submissionRow.getByRole('button', { name: 'Return for revision', exact: true }).click(); const returnedForm = submissionRow.getByRole('region', { name: 'Return for revision', exact: true }); await returnedForm.getByLabel('Revision feedback').fill('Explain each step and resubmit.'); const returnResponse = response(`/v1/submissions/${original.id}/return`); await returnedForm.getByRole('button', { name: 'Return for revision', exact: true }).click(); const returnReceipt = await returnResponse; expect(returnReceipt.status()).toBe(200); expect(await returnReceipt.json()).toMatchObject({ status: 'RETURNED' }); await expect(returnedForm).toHaveCount(0); await signOut();
  await signIn(student); await waitRow(assignmentRow); await expect(assignmentRow.getByText('Returned for revision', { exact: true })).toBeVisible(); const revisedForm = assignmentRow.getByRole('region', { name: 'Resubmit revised work', exact: true }); await revisedForm.getByLabel('Your response').fill('Revised source: each step is explained.'); const resubmitted = response(`/v1/submissions/${original.id}/resubmit`); await revisedForm.getByRole('button', { name: 'Resubmit revised work', exact: true }).click(); const revised = await (await resubmitted).json(); expect(revised).toMatchObject({ revision: 2, previousSubmissionId: original.id }); await assignmentRow.getByRole('button', { name: 'Submission history', exact: true }).click(); await expect(assignmentRow.getByRole('region', { name: 'Submission history', exact: true })).toContainText('Private first draft.'); await expect(assignmentRow).toContainText('Revised source: each step is explained.');
  await waitRow(quizRow); const attemptForm = quizRow.getByRole('region', { name: 'Quiz questions', exact: true }); await attemptForm.getByLabel('Which example follows the teacher instructions?').selectOption({ label: 'Show the steps' }); await attemptForm.getByRole('button', { name: 'Check my answers', exact: true }).click(); await expect(quizRow.getByText('Answers checked — not graded', { exact: true })).toBeVisible(); await expect(quizRow).not.toContainText('Correct option key'); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});
