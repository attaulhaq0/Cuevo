import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

type Account = { role: string; email: string; password: string };
const school = '10000000-0000-4000-8000-000000000001';
const learner = '20000000-0000-4000-8000-000000000012';
async function signIn(page: Page, account: Account) {
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectTrailWorkspace(page, account.role);
  await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Portfolio', exact: true }).click();
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await signOutTrailWorkspace(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
}
async function findWork(page: Page, row: Locator) {
  await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0);
  for (let count = 0; count < 30 && !await row.count(); count++) {
    const more = page.getByRole('button', { name: 'Load more', exact: true }).first();
    if (!await more.count()) break;
    await more.click();
    await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await expect(row).toBeVisible();
}
async function save(page: Page, form: Locator, path: string) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  expect(response.ok(), `Portfolio command status ${response.status()}`).toBe(true);
  return await response.json() as { id: string; revisionId: string; revision: number };
}

test('revoked selected work explains learner recovery and requires a fresh exact teacher approval before parent sharing', async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on('pageerror', () => errors.push('PAGE_ERROR'));
  page.on('console', message => { if (['warning', 'error'].includes(message.type()) && /hydrat|server rendered|did not match/i.test(message.text())) errors.push('HYDRATION'); });
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const student = accounts.find(account => account.role === 'student')!;
  const parent = accounts.find(account => account.role === 'parent')!;
  const authUrl = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!authUrl || !publicKey) throw Error('Synthetic Auth configuration required.');
  async function token(account: Account) {
    let response;
    try { response = await page.request.post(`${authUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: publicKey! }, data: { email: account.email, password: account.password } }); }
    catch { throw Error('Synthetic Auth transport unavailable; details withheld.'); }
    expect(response.ok()).toBe(true);
    return (await response.json()).access_token as string;
  }
  const teacherToken = await token(teacher), studentToken = await token(student), parentToken = await token(parent);
  async function command(path: string, body: Record<string, unknown>, accessToken = teacherToken) {
    let response;
    try { response = await page.request.post(`http://localhost:4000${path}`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': school, 'Idempotency-Key': randomUUID() }, data: body }); }
    catch { throw Error('Synthetic source transport unavailable; details withheld.'); }
    expect(response.ok(), `Synthetic source status ${response.status()}`).toBe(true);
    return await response.json() as { id: string; evidenceId: string };
  }
  async function deniedSource(revisionId: string, itemId: string) {
    let response;
    try { response = await page.request.get(`http://localhost:4000/v1/portfolio/items/${itemId}/revisions/${revisionId}/source-work`, { headers: { Authorization: `Bearer ${parentToken}`, 'X-School-Id': school } }); }
    catch { throw Error('Portfolio denial transport unavailable; details withheld.'); }
    expect(response.status()).toBe(403);
  }
  // Authorized API fixtures establish the academic source. Portfolio creation, review,
  // revocation, recovery and parent disclosure below use actual rendered controls.
  const title = `Checking work for family ${new Date().toISOString()}`;
  const sourceText = 'I checked the school example and explained my method. راجعت المثال وشرحت طريقتي.';
  const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'Synthetic sharing recovery source.' });
  await command(`/v1/courses/${course.id}/publish`, {});
  const assessment = await command('/v1/assessments', { courseId: course.id, title, instructions: 'Explain your checking method.', maxScore: 10 });
  await command(`/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
  const submission = await command(`/v1/assessments/${assessment.id}/submissions`, { content: sourceText }, studentToken);
  const mark = await command(`/v1/submissions/${submission.id}/results`, { score: 6, feedback: 'Teacher checked the source.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
  const result = await command(`/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true });

  await signIn(page, student);
  await page.getByRole('button', { name: 'Select released work', exact: true }).click();
  let form = page.getByRole('region', { name: 'Select released work', exact: true });
  await expect(form.getByLabel('Released source evidence').locator('option').filter({ hasText: title })).toHaveCount(1);
  await form.getByLabel('Released source evidence').selectOption(result.evidenceId);
  await form.getByLabel('Portfolio title').fill(title);
  await form.getByLabel('What I learned').fill('My first reflection for family.');
  const original = await save(page, form, '/v1/portfolio/items');
  const row = page.locator(`[data-portfolio-id="${original.id}"]`);
  await signOut(page);

  async function review(revision: number, reflection: string) {
    await signIn(page, teacher);
    await findWork(page, row);
    await expect(row).toContainText(reflection);
    await row.getByRole('button', { name: 'Review selected work', exact: true }).click();
    await expect(row.getByText(sourceText, { exact: true })).toBeVisible();
    form = row.getByRole('region', { name: 'Review selected work', exact: true });
    await expect(form.getByLabel('I reviewed this exact submitted work and reflection')).not.toBeChecked();
    await expect(form.getByLabel('Share this exact revision with current parents / guardians')).not.toBeChecked();
    await form.getByLabel('Teacher feedback').fill('Reviewed this exact work and reflection for family.');
    await form.getByLabel('I reviewed this exact submitted work and reflection').check();
    await form.getByLabel('Share this exact revision with current parents / guardians').check();
    await form.getByLabel('I approve parent sharing of this reviewed revision').check();
    const receipt = await save(page, form, `/v1/portfolio/items/${original.id}/review`);
    expect(receipt.revision).toBe(revision);
    await expect(row.getByText('Teacher reviewed', { exact: true })).toBeVisible();
  }
  await review(1, 'My first reflection for family.');
  await signOut(page);
  await signIn(page, parent);
  await page.getByLabel('Child', { exact: true }).selectOption(learner);
  await findWork(page, row);
  await expect(row).toContainText('My first reflection for family.');
  await signOut(page);

  await signIn(page, teacher);
  await findWork(page, row);
  await row.getByRole('button', { name: 'Revoke parent sharing', exact: true }).click();
  form = row.getByRole('region', { name: 'Revoke parent sharing', exact: true });
  await form.getByLabel('Reason').fill('Pause sharing pending an updated reflection and fresh school review.');
  await save(page, form, `/v1/portfolio/items/${original.id}/parent-revoke`);
  await expect(row.getByText('Sharing is off. To share updated work, ask the learner to create a new reflection and review that version.', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Review selected work', exact: true })).toHaveCount(0);
  await signOut(page);
  await deniedSource(original.revisionId, original.id);

  await signIn(page, student);
  await findWork(page, row);
  await expect(row.getByText('Family sharing is off for this reflection. Create a new reflection, then ask your teacher to review it before sharing.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(row.getByText('مشاركة هذا التأمل مع الأسرة متوقفة. أنشئ تأملاً جديدًا ثم اطلب من معلّمك مراجعته قبل المشاركة.', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'إنشاء مراجعة للتأمّل', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await row.getByRole('button', { name: 'Create reflection revision', exact: true }).click();
  form = row.getByRole('region', { name: 'Create reflection revision', exact: true });
  await form.getByLabel('What I learned').fill('I checked my explanation again and added what helped me.');
  const revised = await save(page, form, `/v1/portfolio/items/${original.id}/reflection`);
  expect(revised.revision).toBe(2);
  expect(revised.revisionId).not.toBe(original.revisionId);
  await expect(row.getByText('Awaiting teacher review', { exact: true })).toBeVisible();
  await deniedSource(revised.revisionId, original.id);
  await signOut(page);
  await review(2, 'I checked my explanation again and added what helped me.');
  await signOut(page);
  await signIn(page, parent);
  await page.getByLabel('Child', { exact: true }).selectOption(learner);
  await findWork(page, row);
  await expect(row).toContainText('I checked my explanation again and added what helped me.');
  await expect(row).not.toContainText('My first reflection for family.');
  await row.getByRole('button', { name: 'Source work', exact: true }).click();
  await expect(row.getByText(sourceText, { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Create reflection revision', exact: true })).toHaveCount(0);
  await deniedSource(original.revisionId, original.id);
  expect(errors).toEqual([]);
});
