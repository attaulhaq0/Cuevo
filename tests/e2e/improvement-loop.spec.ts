import { test, expect, type APIResponse } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

type Account = { role: string; email: string; password: string };
type Receipt = { id: string; [field: string]: unknown };

test('fixture proposal, human approval and native follow-up refresh the own learner support and outcome', async ({ page }) => {
  test.setTimeout(90_000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const student = accounts.find(account => account.role === 'student')!;
  const parent = accounts.find(account => account.role === 'parent')!;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error('Configured local public Auth key required for browser verification.');
  const schoolId = '10000000-0000-4000-8000-000000000001';
  const apiUrl = 'http://localhost:4000';
  const title = `Improvement browser ${randomUUID().slice(0, 8)}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  const token = async (account: Account) => {
    const response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, { headers: { apikey: publicKey }, data: { email: account.email, password: account.password } });
    expect(response.ok()).toBe(true);
    return (await response.json()).access_token as string;
  };
  const teacherToken = await token(teacher);
  const studentToken = await token(student);
  const receipt = async (response: Pick<APIResponse, 'ok' | 'status' | 'json'>): Promise<Receipt> => {
    expect(response.ok(), `Expected successful domain receipt, got ${response.status()}`).toBe(true);
    return await response.json() as Receipt;
  };
  const command = async (path: string, body: Record<string, unknown>, accessToken = teacherToken) => {
    let response: APIResponse;
    try { response = await page.request.post(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': schoolId, 'Idempotency-Key': randomUUID() }, data: body }); }
    catch { throw new Error(`Domain transport unavailable for ${path}; request details withheld.`); }
    return receipt(response);
  };
  const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'Independent synthetic browser source.' });
  await command(`/v1/courses/${course.id}/publish`, {});
  const assessment = async (label: string) => {
    const result = await command('/v1/assessments', { courseId: course.id, title: `${title} ${label}`, instructions: 'Explain the synthetic worked example.', maxScore: 10 });
    await command(`/v1/assessments/${result.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
    return result;
  };
  const release = async (assessmentId: string, score: number) => {
    const submission = await command(`/v1/assessments/${assessmentId}/submissions`, { content: 'Independent source-linked synthetic response.' }, studentToken);
    const marking = await command(`/v1/submissions/${submission.id}/results`, { score, feedback: 'Teacher reviewed source evidence.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
    return command(`/v1/results/${marking.id}/release`, { expectedRevision: 1, parentVisible: false });
  };
  const baselineAssessment = await assessment('baseline');
  const baseline = await release(baselineAssessment.id, 0);

  const signIn = async (account: Account) => {
    await page.goto('/');
    const english = page.getByRole('button', { name: 'English', exact: true });
    if (await english.isVisible()) await english.click();
    await page.getByLabel('School email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
  };
  const signOut = async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  };
  const mutation = (path: string) => page.waitForResponse(response => response.url() === `${apiUrl}${path}` && response.request().method() === 'POST');
  const loadRow = async (row: ReturnType<typeof page.locator>) => {
    await expect(page.getByText('Loading next steps…', { exact: true })).toHaveCount(0);
    while (!await row.count()) {
      const more = page.getByRole('button', { name: 'Load more', exact: true });
      expect(await more.count()).toBeGreaterThan(0);
      await more.first().click();
      await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
    }
  };
  let visualIndex = 0;
  const visualCheck = async (target: ReturnType<typeof page.locator>) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations).toEqual([]);
    await mkdir('.local/technical-mvp-visuals', { recursive: true });
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/technical-mvp-visuals/improvement-ar-mobile-${++visualIndex}.png` });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/technical-mvp-visuals/improvement-en-desktop-${visualIndex}.png` });
  };

  await signIn(teacher);
  await page.getByRole('button', { name: 'Next steps', exact: true }).click();
  await page.getByRole('button', { name: 'Request analysis', exact: true }).click();
  const analyzeForm = page.getByRole('region', { name: 'Request analysis', exact: true });
  await expect(analyzeForm).toBeVisible();
  // Choice lists remain bounded; load permitted later pages before selecting this test's source.
  while (!await analyzeForm.getByLabel('Released baseline result').locator(`option[value="${baseline.id}"]`).count()) {
    const more = page.getByRole('button', { name: 'Load more', exact: true });
    expect(await more.count()).toBeGreaterThan(0);
    await more.last().click();
    await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await analyzeForm.getByLabel('Released baseline result').selectOption(baseline.id);
  const analyzed = mutation('/v1/intelligence/analyze');
  await analyzeForm.getByRole('button', { name: 'Request analysis', exact: true }).click();
  const proposal = await receipt(await analyzed);
  expect(proposal).toMatchObject({ origin: 'AI_GENERATED', generationMode: 'FIXTURE', status: 'AWAITING_HUMAN', baselineResultId: baseline.id });
  expect(proposal.intelligenceRunId).toEqual(expect.any(String));
  const proposalRow = page.locator(`[data-recommendation-id="${proposal.id}"]`);
  await loadRow(proposalRow);
  await expect(proposalRow.getByText('Fixture analysis — synthetic/test', { exact: true })).toBeVisible();
  await expect(proposalRow.getByText('Live model analysis', { exact: true })).toHaveCount(0);
  await proposalRow.getByText('Cited evidence', { exact: true }).click();
  await expect(proposalRow).toContainText(String(proposal.intelligenceRunId));
  const contextRequested = page.waitForResponse(response => response.url().endsWith(`/v1/intelligence/runs/${proposal.intelligenceRunId}/context`) && response.request().method() === 'GET');
  await proposalRow.getByRole('button', { name: 'Show analysis source context', exact: true }).click();
  const contextResponse = await contextRequested; expect(contextResponse.ok()).toBe(true); const contextReceipt = await contextResponse.json();
  expect(contextReceipt.runId).toBe(proposal.intelligenceRunId); expect(contextReceipt.context.coverage).toBe('BOUNDED_AUTHORIZED_CONTEXT');
  expect(contextReceipt.context.recentResults.some((source: { resultId: string }) => source.resultId === baseline.id)).toBe(true);
  const contextPanel = proposalRow.getByRole('region', { name: 'Authorized analysis context', exact: true }); await expect(contextPanel).toContainText(baseline.id);
  await expect(contextPanel.getByRole('heading', { name: 'Recorded learning observations', exact: true })).toBeVisible();
  await expect(contextPanel.getByRole('heading', { name: 'Authorized teacher learning options', exact: true })).toBeVisible();
  await visualCheck(proposalRow);
  await proposalRow.getByRole('button', { name: 'Approve practice', exact: true }).click();
  const decisionForm = proposalRow.getByRole('region', { name: 'Approve practice', exact: true });
  await decisionForm.getByLabel('Decision reason').fill('Teacher reviewed the cited synthetic source.');
  await decisionForm.getByLabel('Review or edit practice title').fill(`${title} approved practice`);
  const decided = mutation(`/v1/recommendations/${proposal.id}/decision`);
  await decisionForm.getByRole('button', { name: 'Approve practice', exact: true }).click();
  const decision = await receipt(await decided);
  const interventionId = String(decision.interventionId);
  expect(decision.status).toBe('APPROVED');
  await signOut();

  await signIn(student);
  await page.getByRole('button', { name: 'Next steps', exact: true }).click();
  const practice = page.locator(`[data-intervention-id="${interventionId}"]`);
  await loadRow(practice);
  await expect(practice.getByRole('heading', { name: `${title} approved practice`, exact: true })).toBeVisible();
  await practice.getByLabel('Reflection (optional)').fill('I tried the approved example and explained each step.');
  const completion = mutation(`/v1/interventions/${interventionId}/complete`);
  await practice.getByRole('button', { name: 'Complete practice', exact: true }).click();
  expect((await receipt(await completion)).status).toBe('COMPLETED');
  await signOut();

  // Follow-up source is created after actual practice completion, never borrowed from another test.
  const followUpAssessment = await assessment('follow-up');
  await signIn(teacher);
  await page.getByRole('button', { name: 'Next steps', exact: true }).click();
  await page.getByRole('button', { name: 'Practice tasks', exact: true }).click();
  await loadRow(practice);
  await practice.getByRole('button', { name: 'Link follow-up assessment', exact: true }).click();
  const followUpForm = practice.getByRole('region', { name: 'Link follow-up assessment', exact: true });
  while (!await followUpForm.getByLabel('Published follow-up assessment').locator(`option[value="${followUpAssessment.id}"]`).count()) {
    const more = page.getByRole('button', { name: 'Load more', exact: true });
    expect(await more.count()).toBeGreaterThan(0);
    await more.last().click();
    await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await followUpForm.getByLabel('Published follow-up assessment').selectOption(followUpAssessment.id);
  const linked = mutation(`/v1/interventions/${interventionId}/reassessment`);
  await followUpForm.getByRole('button', { name: 'Link follow-up assessment', exact: true }).click();
  expect((await receipt(await linked)).followUpAssessmentId).toBe(followUpAssessment.id);
  const followUp = await release(followUpAssessment.id, 3);
  await page.getByRole('button', { name: 'Refresh next steps', exact: true }).click();
  await practice.getByRole('button', { name: 'Measure observed change', exact: true }).click();
  const measureForm = practice.getByRole('region', { name: 'Measure observed change', exact: true });
  await measureForm.getByLabel('Released follow-up result').selectOption(followUp.id);
  await measureForm.getByLabel('Minimum change on the raw score scale').fill('2');
  const measured = mutation(`/v1/interventions/${interventionId}/measure`);
  await measureForm.getByRole('button', { name: 'Measure observed change', exact: true }).click();
  const outcome = await receipt(await measured);
  expect(outcome).toMatchObject({ status: 'improved', difference: 3, baseline: { score: 0, maxScore: 10 }, followUp: { score: 3, maxScore: 10 }, limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' });
  await signOut();

  await signIn(student);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect.poll(async () => {
    const refreshed = page.waitForResponse(response => response.url().endsWith('/v1/learners/20000000-0000-4000-8000-000000000012/state') && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Refresh learner state', exact: true }).click();
    expect((await refreshed).ok()).toBe(true);
    await expect(page.getByText('Loading learner state…', { exact: true })).toHaveCount(0);
    return page.locator(`[data-outcome-id="${outcome.id}"]`).count();
  }, { timeout: 15_000 }).toBe(1);
  const progressSupport = page.locator(`.progress-workspace [data-intervention-id="${interventionId}"]`);
  await expect(progressSupport.getByText('Measured', { exact: true })).toBeVisible();
  const progressOutcome = page.locator(`.progress-workspace [data-outcome-id="${outcome.id}"]`);
  await expect(progressOutcome).toContainText('0 / 10');
  await expect(progressOutcome).toContainText('3 / 10');
  await expect(progressOutcome).toContainText('Observed change is not proof that the practice caused the outcome.');
  await progressOutcome.getByText('Cited evidence', { exact: true }).click();
  await expect(progressOutcome).toContainText(baseline.id);
  await expect(progressOutcome).toContainText(followUp.id);
  await visualCheck(progressOutcome);
  expect(errors).toEqual([]);
  await signOut();

  await signIn(parent);
  await expect(page.getByRole('button', { name: 'Next steps', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByLabel('Learner', { exact: true }).selectOption('20000000-0000-4000-8000-000000000012');
  await expect(page.getByText('This view shows only school-approved academic evidence. Learning-habit details are not shared here.', { exact: true }).first()).toBeVisible();
  await expect(page.locator(`[data-intervention-id="${interventionId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-outcome-id="${outcome.id}"]`)).toHaveCount(0);
});
