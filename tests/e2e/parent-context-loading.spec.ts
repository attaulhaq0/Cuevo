import { expectTrailWorkspace } from './trail-workspace';
import { test, expect, type Page, type Request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

type Account = { role: string; email: string; password: string };
const schoolId = '10000000-0000-4000-8000-000000000001';
const learnerId = '20000000-0000-4000-8000-000000000012';
const otherLearnerId = '20000000-0000-4000-8000-000000000013';
const parentId = '20000000-0000-4000-8000-000000000072';
const falseEmpty = ['No permitted selected work is available.', 'No released results are available for your current access.', 'لا يتاح عمل مختار ضمن الصلاحيات.', 'لا تتاح نتائج صادرة ضمن صلاحياتك الحالية.'];
const dependentRead = (url: URL) => url.pathname === '/v1/portfolio/items' || url.pathname === '/v1/results' || /^\/v1\/learners\/[^/]+\/(?:academic-report|state|report-periods)$/.test(url.pathname);

test('parent work stays unresolved during child verification and the selected child then receives an approved native result', async ({ page }) => {
  test.setTimeout(90000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(row => row.role === 'teacher')!; const student = accounts.find(row => row.role === 'student')!; const parent = accounts.find(row => row.role === 'parent')!; const admin = accounts.find(row => row.role === 'admin')!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw Error('Configured local synthetic Auth required.');
  async function token(account: Account) {
    const response = await page.request.post(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, { headers: { apikey: key! }, data: { email: account.email, password: account.password } });
    expect(response.ok(), 'Source setup uses actual synthetic Auth').toBe(true);
    return (await response.json()).access_token as string;
  }
  const teacherToken = await token(teacher); const studentToken = await token(student); const adminToken = await token(admin);
  async function command(path: string, body: Record<string, unknown>, accessToken = teacherToken) {
    const response = await page.request.post(`http://localhost:4000${path}`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': schoolId, 'Idempotency-Key': randomUUID() }, data: body });
    expect(response.ok(), `Approved source setup ${path} returned ${response.status()}`).toBe(true);
    return await response.json() as { id: string; evidenceId: string };
  }
  type Relationship = { parentId: string; studentId: string; relationshipType: string; status: string; effectiveFrom: string; effectiveTo: string | null; revision: number };
  async function relationship() {
    const response = await page.request.get(`http://localhost:4000/v1/school/guardian-relationships?limit=100&learnerId=${otherLearnerId}`, { headers: { Authorization: `Bearer ${adminToken}`, 'X-School-Id': schoolId } });
    expect(response.ok()).toBe(true);
    const directory = await response.json() as { items: Relationship[]; nextCursor: string | null };
    expect(directory.nextCursor).toBeNull();
    const rows = directory.items.filter(row => row.parentId === parentId && row.studentId === otherLearnerId);
    expect(rows.length).toBeLessThanOrEqual(1);
    return rows[0];
  }
  const originalRelationship = await relationship();
  const extraRelationship = { parentId, studentId: otherLearnerId, relationshipType: 'guardian', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, confirmAccessChange: true };
  async function configureRelationship(body: Record<string, unknown>) {
    const current = await relationship();
    if (current) expect(Number.isInteger(current.revision) && current.revision > 0).toBe(true);
    return command('/v1/school/guardian-relationships', { ...body, expectedRevision: current?.revision ?? 0 }, adminToken);
  }
  await configureRelationship({ ...extraRelationship, status: 'active' });
  try {
  // Academic setup is real API setup, separate from the parent browser acceptance below.
  const title = `Parent checked explanation ${new Date().toISOString()}`;
  const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'Synthetic parent context source.' });
  await command(`/v1/courses/${course.id}/publish`, {});
  const assessment = await command('/v1/assessments', { courseId: course.id, title, instructions: 'Explain the checked example.', maxScore: 10 });
  await command(`/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
  const submission = await command(`/v1/assessments/${assessment.id}/submissions`, { content: 'I compared my explanation with the school example.' }, studentToken);
  const mark = await command(`/v1/submissions/${submission.id}/results`, { score: 6, feedback: 'Approved feedback for the current family.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
  const result = await command(`/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true });
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  const canceled = new Set<Request>();
  page.on('requestfailed', request => { if (/abort|cancel/i.test(request.failure()?.errorText ?? '')) canceled.add(request); });
  let heldPhase = false; const prematurelyStarted: string[] = [];
  page.on('request', request => { if (heldPhase && dependentRead(new URL(request.url()))) prematurelyStarted.push(new URL(request.url()).pathname); });
  // Access has no child-content consumer, so the first directory read belongs to the tested destination.
  await page.goto('/?view=access'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(parent.email); await page.getByLabel('Password', { exact: true }).fill(parent.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
  await expect(page.getByRole('heading', { name: 'Your school access', exact: true })).toBeVisible();
  for (const destination of ['Portfolio', 'Academic', 'Progress']) {
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
    let observed!: () => void; let directoryFailed!: (error: unknown) => void; const directoryObserved = new Promise<void>((resolve, reject) => { observed = resolve; directoryFailed = reject; });
    const handlers = new Set<Promise<void>>(); const failures: { request: Request; error: unknown }[] = [];
    const pattern = '**/v1/people?limit=100';
    await page.route(pattern, route => {
      const handling = (async () => {
        try {
          const response = await route.fetch(); expect(response.ok(), 'Held directory is the actual authorized response').toBe(true);
          const directory = await response.json() as { items: { userId: string; role: string; displayName: string }[]; nextCursor: string | null };
          expect(directory.items.filter(row => row.userId === learnerId && row.role === 'student')).toHaveLength(1);
          observed(); await hold; await route.fulfill({ response });
        } catch (error) { failures.push({ request: route.request(), error }); directoryFailed(error); }
      })();
      handlers.add(handling);
      return handling.finally(() => handlers.delete(handling));
    });
    heldPhase = true; prematurelyStarted.length = 0;
    try {
      await page.locator('.workspace-chrome__navigation').getByRole('button', { name: destination, exact: true }).click();
      await directoryObserved;
      await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Checking current child relationships…' })).toBeVisible();
      await assertUnresolved(page, destination);
      await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'جارٍ التحقق من علاقات الأطفال…' })).toBeVisible();
      await assertUnresolved(page, destination);
      expect(prematurelyStarted, `${destination} has no child content request before directory verification`).toEqual([]);
    } finally {
      heldPhase = false; release();
      await Promise.all([...handlers]);
      await page.unrouteAll({ behavior: 'wait' });
    }
    for (const failure of failures) {
      expect(canceled.has(failure.request), `Only a recorded cancelled directory request may end without delivery: ${String(failure.error)}`).toBe(true);
    }
    await page.getByRole('button', { name: 'English', exact: true }).click();
    const child = page.getByRole('combobox', { name: 'Child', exact: true }); await expect(child).toBeVisible();
    if (destination === 'Portfolio') {
      await expect(child).toHaveValue('');
      await assertUnresolved(page, destination);
    }
    await child.selectOption(learnerId); await expect(child).toHaveValue(learnerId);
    if (destination === 'Academic') {
      const source = page.locator(`[data-result-id="${result.id}"]`);
      await expect(source.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(source.locator('.native-score strong')).toHaveText('6');
      await expect(source).toContainText('Approved feedback for the current family.');
      // A fresh authorized report receipt independently confirms the exact result/learner/native source.
      const reportRead = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/learners/${learnerId}/academic-report` && response.request().method() === 'GET');
      await page.getByRole('button', { name: 'Refresh academic records', exact: true }).click();
      const response = await reportRead; expect(response.ok()).toBe(true);
      const report = await response.json() as { items: { id: string; learnerId: string; nativeResult: { type: string; score: number; maxScore: number } }[] };
      expect(report.items.find(row => row.id === result.id)).toMatchObject({ learnerId, nativeResult: { type: 'numeric', score: 6, maxScore: 10 } });
      await expect(source.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
  }
  expect(pageErrors).toEqual([]);
  } finally {
    await configureRelationship(originalRelationship ? {
      parentId, studentId: otherLearnerId, relationshipType: originalRelationship.relationshipType,
      status: originalRelationship.status, effectiveFrom: originalRelationship.effectiveFrom, effectiveTo: originalRelationship.effectiveTo, confirmAccessChange: true,
    } : { ...extraRelationship, status: 'revoked' });
  }
});

async function assertUnresolved(page: Page, destination: string) {
  const main = page.getByRole('main');
  for (const message of falseEmpty) await expect(main.getByText(message, { exact: true }), `${destination} cannot infer an empty result before child verification`).toHaveCount(0);
  await expect(main.locator('[data-portfolio-id], [data-portfolio-choice], [data-parent-portfolio-id], .parent-portfolio-directory li, .academic-row, .learner-detail-heading, .native-score'), `${destination} withholds child content until current directory verification`).toHaveCount(0);
}
