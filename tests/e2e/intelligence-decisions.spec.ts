import { test, expect, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

type Account = { role: string; email: string; password: string };
type Policy = {
  purpose: string;
  dataClassification: string;
  fixtureEnabled: boolean;
  liveEnabled: boolean;
  allowedActions: string[];
  version: number;
};
type Proposal = {
  id: string;
  baselineResultId: string;
  learnerId: string;
  intelligenceRunId: string;
  generationMode: string;
  status: string;
};
type Decision = { id: string; status: string; interventionId: string | null };
type Task = { id: string; recommendationId: string; title: string; instructions: string };
const api = 'http://localhost:4000';
const school = '10000000-0000-4000-8000-000000000001';

test('teacher rejects one proposal and approves exact edited instructions through visible decisions', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  page.setDefaultTimeout(15_000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const student = accounts.find(account => account.role === 'student')!;
  const admin = accounts.find(account => account.role === 'admin')!;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error('Configured synthetic Auth is required.');
  const run = new Date().toISOString();
  const editedTitle = `Teacher-reviewed checking step ${run}`;
  const editedInstructions = 'Compare the two school examples. Explain the first checking step, then ask your teacher to review it. راجع خطوة التحقق المدرسية.';
  const privateReason = 'Private teacher decision basis: I reviewed the exact school evidence.';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /hydration|did not match/i.test(message.text())) errors.push(message.text());
  });

  const token = async (account: Account) => {
    const response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, {
      headers: { apikey: publicKey }, data: { email: account.email, password: account.password },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).access_token as string;
  };
  const teacherToken = await token(teacher);
  const studentToken = await token(student);
  const adminToken = await token(admin);
  const headers = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, 'X-School-Id': school });
  const command = async (path: string, body: Record<string, unknown>, accessToken = teacherToken) => {
    const response = await page.request.post(`${api}${path}`, {
      headers: { ...headers(accessToken), 'Idempotency-Key': randomUUID() }, data: body,
    });
    expect(response.status(), `Synthetic API setup ${path}`).toBe(200);
    return response.json();
  };
  const readPolicy = async () => {
    const response = await page.request.get(`${api}/v1/intelligence/policy`, { headers: headers(adminToken) });
    expect(response.status()).toBe(200);
    return (await response.json()).policy as Policy;
  };
  const originalPolicy = await readPolicy();

  const signIn = async (account: Account) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true }).last();
    if (await signOut.isVisible()) await signOut.click();
    await page.getByLabel('School email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'Next steps', exact: true }).click();
  };
  const loadTarget = async (target: Locator, last = false) => {
    await expect(page.getByText('Loading next steps…', { exact: true })).toHaveCount(0);
    await expect.poll(async () => await target.count() > 0 || await page.locator('.improvement-workspace').getByRole('button', { name: 'Load more', exact: true }).count() > 0).toBe(true);
    for (let index = 0; index < 40 && !await target.count(); index++) {
      const more = page.locator('.improvement-workspace').getByRole('button', { name: 'Load more', exact: true });
      expect(await more.count(), 'Current source must remain reachable through authorized continuation').toBeGreaterThan(0);
      await (last ? more.last() : more.first()).click();
      await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
    }
    await expect(target).toBeAttached();
  };
  const analyze = async (baseline: { id: string }, title: string) => {
    await page.getByRole('button', { name: 'Proposals', exact: true }).click();
    await page.getByRole('button', { name: 'Request analysis', exact: true }).click();
    const form = page.getByRole('region', { name: 'Request analysis', exact: true });
    const choice = form.getByLabel('Released baseline result', { exact: true });
    const option = choice.locator(`option[value="${baseline.id}"]`);
    await loadTarget(option, true);
    await expect(option).toContainText(title);
    await expect(option).toContainText('3 / 10');
    await choice.selectOption(baseline.id);
    const received = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/intelligence/analyze' && response.request().method() === 'POST');
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/recommendations' && response.request().method() === 'GET');
    await form.getByRole('button', { name: 'Request analysis', exact: true }).click();
    const response = await received;
    expect(response.status()).toBe(200);
    const proposal = await response.json() as Proposal;
    expect((await refreshed).status()).toBe(200);
    expect(proposal).toMatchObject({ baselineResultId: baseline.id, generationMode: 'FIXTURE', status: 'AWAITING_HUMAN' });
    expect(proposal.intelligenceRunId).toEqual(expect.any(String));
    const row = page.locator(`[data-recommendation-id="${proposal.id}"]`);
    await loadTarget(row);
    await expect(row.getByText('Demonstration analysis', { exact: true })).toBeVisible();
    await expect(row.getByRole('region', { name: 'Why this appeared', exact: true })).toBeVisible();
    return { proposal, row };
  };
  const visibleDecision = async (proposal: Proposal, form: Locator, action: string) => {
    const path = `/v1/recommendations/${proposal.id}/decision`;
    const received = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
    await form.getByRole('button', { name: action, exact: true }).click();
    const response = await received;
    expect(response.status()).toBe(200);
    const key = response.request().headers()['idempotency-key'];
    expect(key).toEqual(expect.any(String));
    if (!key) throw new Error('The confirmed visible decision requires its original request key.');
    expect(key.length).toBeGreaterThan(0);
    const decision = await response.json() as Decision;
    // Exact original-key replay verifies the visible decision receipt; it creates no new decision.
    const replay = await page.request.post(`${api}${path}`, {
      headers: { ...headers(teacherToken), 'Idempotency-Key': key }, data: response.request().postDataJSON(),
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(decision);
    return decision;
  };
  const currentTasks = async () => {
    const items: Task[] = [];
    let cursor: string | null = null;
    const cursors = new Set<string>();
    for (let index = 0; index < 40; index++) {
      const response = await page.request.get(`${api}/v1/interventions?limit=100${cursor ? `&cursor=${cursor}` : ''}`, { headers: headers(teacherToken) });
      expect(response.status()).toBe(200);
      const result = await response.json() as { items: Task[]; nextCursor: string | null };
      items.push(...result.items);
      cursor = result.nextCursor;
      if (!cursor) return items;
      expect(cursors.has(cursor)).toBe(false);
      cursors.add(cursor);
    }
    throw new Error('Current authorized task continuation did not finish within its bounded fixture view.');
  };

  try {
    // Academic baselines and explicit fixture policy are API setup. Analysis and consequential decisions below use visible controls.
    await command('/v1/intelligence/policy', {
      purpose: 'NEXT_LEARNING_ACTION', dataClassification: 'SCHOOL_CUSTOM_NUMERIC', fixtureEnabled: true,
      liveEnabled: false, allowedActions: ['GUIDED_PRACTICE', 'REVIEW_FEEDBACK'], expectedVersion: originalPolicy.version,
      confirmApproval: true, reason: 'Synthetic UI rejection and exact edited approval verification.',
    }, adminToken);
    const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title: `School decision review ${run}`, description: 'API fixture setup for visible teacher decisions.' });
    const unit = await command(`/v1/courses/${course.id}/units`, { title: 'School checking plan', sequence: 1 });
    const lesson = await command(`/v1/units/${unit.id}/lessons`, { title: 'School worked example', sequence: 1, body: 'Explain and check one school example.' });
    await command(`/v1/lessons/${lesson.id}/activities`, { title: 'School checking practice', kind: 'practice', instructions: 'Explain a checking step from the school example.', sequence: 1 });
    await command(`/v1/courses/${course.id}/publish`, {});
    const released = async (title: string) => {
      const assessment = await command('/v1/assessments', { courseId: course.id, title, instructions: 'Explain one school checking step.', maxScore: 10 });
      await command(`/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
      const work = await command(`/v1/assessments/${assessment.id}/submissions`, { content: 'Synthetic evidence for a teacher-reviewed step.' }, studentToken);
      const marking = await command(`/v1/submissions/${work.id}/results`, { score: 3, feedback: 'Teacher reviewed this exact school source.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
      return command(`/v1/results/${marking.id}/release`, { expectedRevision: 1, parentVisible: false });
    };
    const rejectedTitle = `First school decision evidence ${run}`;
    const approvedTitle = `Second school decision evidence ${run}`;
    const rejectedBaseline = await released(rejectedTitle);
    const approvedBaseline = await released(approvedTitle);

    await signIn(teacher);
    const rejected = await analyze(rejectedBaseline, rejectedTitle);
    await rejected.row.getByRole('button', { name: 'Reject proposal', exact: true }).click();
    const rejectionForm = rejected.row.getByRole('region', { name: 'Reject proposal', exact: true });
    await rejectionForm.getByLabel('Decision reason', { exact: true }).fill('Teacher will review another supported step; this proposal is not approved.');
    const rejection = await visibleDecision(rejected.proposal, rejectionForm, 'Reject proposal');
    expect(rejection).toMatchObject({ status: 'REJECTED', interventionId: null });
    await expect(rejected.row.getByText('Rejected', { exact: true })).toBeVisible();
    await expect(rejected.row.getByRole('button', { name: 'Approve practice', exact: true })).toHaveCount(0);
    expect((await currentTasks()).some(task => task.recommendationId === rejected.proposal.id)).toBe(false);

    const approved = await analyze(approvedBaseline, approvedTitle);
    await approved.row.getByRole('button', { name: 'Approve practice', exact: true }).click();
    const approvalForm = approved.row.getByRole('region', { name: 'Approve practice', exact: true });
    await approvalForm.getByLabel('Decision reason', { exact: true }).fill(privateReason);
    await approvalForm.getByLabel('Review or edit practice title', { exact: true }).fill(editedTitle);
    await approvalForm.getByLabel('Review or edit instructions', { exact: true }).fill(editedInstructions);
    const approval = await visibleDecision(approved.proposal, approvalForm, 'Approve practice');
    expect(approval).toMatchObject({ status: 'APPROVED', interventionId: expect.any(String) });
    if (!approval.interventionId) throw new Error('The confirmed approval must identify its current assigned task.');
    await expect(approved.row.getByText('Approved', { exact: true })).toBeVisible();
    const tasks = await currentTasks();
    expect(tasks.filter(task => task.recommendationId === approved.proposal.id)).toHaveLength(1);
    expect(tasks.find(task => task.id === approval.interventionId)).toMatchObject({ title: editedTitle, instructions: editedInstructions });
    expect(tasks.some(task => task.recommendationId === rejected.proposal.id)).toBe(false);

    await signIn(student);
    const studentSource = await page.request.get(`${api}/v1/interventions/${approval.interventionId}`, { headers: headers(studentToken) });
    expect(studentSource.status()).toBe(200);
    expect(await studentSource.text()).not.toContain(privateReason);
    const task = page.locator(`[data-intervention-id="${approval.interventionId}"]`);
    await loadTarget(task);
    await expect(task.getByRole('heading', { name: editedTitle, exact: true })).toBeVisible();
    await expect(task.getByText(editedInstructions, { exact: true })).toBeVisible();
    await expect(task).not.toContainText(privateReason);
    await expect(task.getByRole('button', { name: 'Complete practice', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(task.getByText(editedInstructions, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    test.setTimeout(testInfo.timeout + 30_000);
    const current = await readPolicy();
    await command('/v1/intelligence/policy', {
      purpose: originalPolicy.purpose, dataClassification: originalPolicy.dataClassification,
      fixtureEnabled: originalPolicy.fixtureEnabled, liveEnabled: originalPolicy.liveEnabled,
      allowedActions: originalPolicy.allowedActions, expectedVersion: current.version,
      confirmApproval: true, reason: 'Restore the original school analysis policy after the synthetic UI decision check.',
    }, adminToken);
  }
});
