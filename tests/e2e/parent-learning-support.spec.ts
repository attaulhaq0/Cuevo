import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

type Account = { role: string; email: string; password: string };
type Row = { id: string; revision?: number; [key: string]: unknown };
const api = 'http://localhost:4000';
const school = '10000000-0000-4000-8000-000000000001';

test('parent selects a child and reads only current school-published support with revocation and family access clearing', async ({ page }, testInfo) => {
  test.setTimeout(150_000); page.setDefaultTimeout(15_000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const identities = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string; displayName: string }[] };
  const admin = accounts.find(account => account.role === 'admin')!;
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const parent = accounts.find(account => account.role === 'parent')!;
  const student = accounts.find(account => account.role === 'student')!;
  const child = identities.actors.find(identity => identity.email === student.email)!;
  const parentIdentity = identities.actors.find(identity => identity.email === parent.email)!;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey || !child || !parentIdentity) throw new Error('Guarded synthetic family and Auth configuration required.');
  const token = async (account: Account) => {
    const response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, { headers: { apikey: publicKey }, data: { email: account.email, password: account.password } });
    expect(response.status()).toBe(200); return (await response.json()).access_token as string;
  };
  const adminToken = await token(admin); const teacherToken = await token(teacher); const parentToken = await token(parent);
  const headers = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, 'X-School-Id': school });
  const command = async (path: string, body: Record<string, unknown>, accessToken = adminToken) => {
    const response = await page.request.post(`${api}${path}`, { headers: { ...headers(accessToken), 'Idempotency-Key': randomUUID() }, data: body });
    expect(response.status(), `Labeled synthetic setup/cleanup ${path}`).toBe(200); return response.json() as Promise<Row>;
  };
  const rows = async (path: string, limit = 100) => {
    const items: Row[] = []; let cursor: string | null = null;
    for (let index = 0; index < 30; index++) {
      const response = await page.request.get(`${api}${path}?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`, { headers: headers(adminToken) });
      expect(response.status()).toBe(200); const result = await response.json() as { items: Row[]; nextCursor: string | null };
      items.push(...result.items); cursor = result.nextCursor; if (!cursor) return items;
    }
    throw new Error('Synthetic current relationship lookup exceeded its bounded pages.');
  };
  const originalGuardian = (await rows('/v1/school/guardian-relationships')).find(row => row.parentId === parentIdentity.actorId && row.studentId === child.actorId);
  if (!originalGuardian || originalGuardian.status !== 'active') throw new Error('Current synthetic guardian relationship required.');
  const run = new Date().toISOString(); const courseTitle = `Family checking support ${run}`; const taskTitle = `Family school task ${run}`;
  const supportTitle = `Published family checking guide ${run}`; const instructions = 'Read one checking step together and ask the teacher about the school example. راجعوا خطوة التحقق معًا.';
  const privateReason = 'Private school approval basis excluded from the family projection.';
  const supportIds: string[] = []; let revokedGuardian = false;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || /hydration|did not match/i.test(message.text())) errors.push(message.text()); });
  const signIn = async (account: Account) => {
    await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
    const signOut = page.locator('.workspace-chrome__person > button'); if (await signOut.isVisible()) await signOutTrailWorkspace(page);
    await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, account.role);
    await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'School', exact: true }).click(); await expect(page.locator('.school-workspace')).toBeVisible();
  };
  const settled = async () => { await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0); };
  const choose = async (select: Locator, id: string, label: string) => {
    await settled(); for (let index = 0; index < 30 && !await select.locator(`option[value="${id}"]`).count(); index++) {
      const more = page.locator('.school-workspace').getByRole('button', { name: /^Load more(?:[: ·]|$)/ });
      await expect.poll(async () => await select.locator(`option[value="${id}"]`).count() > 0 || await more.count() > 0).toBe(true);
      if (await select.locator(`option[value="${id}"]`).count()) break;
      await more.last().click(); await expect(page.getByRole('button', { name: /^Loading more/ })).toHaveCount(0);
    }
    await expect(select.locator(`option[value="${id}"]`)).toContainText(label); await select.selectOption(id);
  };
  let primaryError: unknown;
  try {
    // Course/task and unpublished/private/expired support are API setup; staff publication and parent actions below use visible controls.
    const course = await command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title: courseTitle, description: 'Synthetic source for exact family instruction publication.' }, teacherToken);
    await command(`/v1/courses/${course.id}/publish`, {}, teacherToken);
    const task = await command('/v1/assessments', { courseId: course.id, title: taskTitle, instructions: 'Explain the school example.', maxScore: 10 }, teacherToken);
    await command(`/v1/assessments/${task.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 }, teacherToken);
    const privateSupport = await command('/v1/school/learning-support', { learnerId: child.actorId, courseId: course.id, assessmentId: task.id, title: 'Private staff instructional guide', instructions: 'This is not published to the parent.', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', studentVisible: true, parentVisible: false, reason: privateReason, confirmApproval: true }); supportIds.push(privateSupport.id);
    const expiredSupport = await command('/v1/school/learning-support', { learnerId: child.actorId, courseId: course.id, assessmentId: task.id, title: 'Expired family instructional guide', instructions: 'Expired content must not appear.', effectiveFrom: '2026-09-01', effectiveTo: '2026-09-02', studentVisible: false, parentVisible: true, reason: privateReason, confirmApproval: true }); supportIds.push(expiredSupport.id);
    await signIn(admin); await page.getByRole('button', { name: 'Campus and approved learning support', exact: true }).click();
    const staff = page.getByRole('region', { name: 'Campus and approved learning support', exact: true });
    await staff.getByRole('button', { name: 'Approve learning support', exact: true }).click();
    await choose(staff.getByLabel('Supported course', { exact: true }), course.id, courseTitle);
    await choose(staff.getByLabel('Supported learner', { exact: true }), child.actorId, child.displayName);
    const approval = staff.getByRole('region', { name: 'Approve learning support', exact: true });
    await choose(approval.getByLabel('Supported assessment (optional)', { exact: true }), task.id, taskTitle);
    await approval.getByLabel('Support instruction title', { exact: true }).fill(supportTitle); await approval.getByLabel('Approved learning instructions', { exact: true }).fill(instructions);
    await approval.getByLabel('Support starts', { exact: true }).fill('2026-10-01'); await approval.getByLabel('Support ends', { exact: true }).fill('2026-10-31');
    await approval.getByLabel('Publish these instructions to current parents', { exact: true }).check();
    await approval.getByLabel('School approval reason', { exact: true }).fill(privateReason); await approval.getByLabel('I approve this exact learner, learning scope and support window', { exact: true }).check();
    const published = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/school/learning-support' && response.request().method() === 'POST');
    await approval.getByRole('button', { name: 'Save', exact: true }).click(); const publishedResponse = await published; expect(publishedResponse.status()).toBe(200);
    const publishedSupport = await publishedResponse.json() as Row; supportIds.push(publishedSupport.id);
    await signIn(parent); await choose(page.getByLabel('Child', { exact: true }), child.actorId, child.displayName);
    await page.getByRole('button', { name: 'Approved learning support', exact: true }).click(); const family = page.getByRole('region', { name: 'Approved learning support', exact: true });
    const received = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/school/learning-support' && new URL(response.url()).searchParams.get('learnerId') === child.actorId && new URL(response.url()).searchParams.get('courseId') === course.id);
    await choose(family.getByLabel('Child’s current course', { exact: true }), course.id, courseTitle); const familyResponse = await received; expect(familyResponse.status()).toBe(200);
    expect(await familyResponse.text()).not.toContain(privateReason); await expect(family.getByRole('heading', { name: supportTitle, exact: true })).toBeVisible();
    await expect(family.getByText(instructions, { exact: true })).toBeVisible(); await expect(family).toContainText(taskTitle);
    await expect(family).not.toContainText('Private staff instructional guide'); await expect(family).not.toContainText('Expired family instructional guide');
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.getByRole('region', { name: 'الدعم التعليمي المعتمد', exact: true }).getByText(instructions, { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]); await page.getByRole('button', { name: 'English', exact: true }).click();
    await signIn(admin); await page.getByRole('button', { name: 'Campus and approved learning support', exact: true }).click();
    const publishedRow = page.getByRole('region', { name: 'Campus and approved learning support', exact: true }).locator('article').filter({ has: page.getByRole('heading', { name: supportTitle, exact: true }) });
    await expect.poll(async () => await publishedRow.count() > 0 || await page.locator('.school-workspace').getByRole('button', { name: /^Load more(?:[: ·]|$)/ }).count() > 0).toBe(true);
    for (let index = 0; index < 30 && !await publishedRow.count(); index++) { await page.locator('.school-workspace').getByRole('button', { name: /^Load more(?:[: ·]|$)/ }).last().click(); await expect(page.getByRole('button', { name: /^Loading more/ })).toHaveCount(0); }
    const revoke = publishedRow.getByRole('region', { name: 'Revoke support publication', exact: true });
    await revoke.getByLabel('School approval reason', { exact: true }).fill('School withdraws this exact family publication.');
    await revoke.getByLabel('I reviewed this support and approve revocation', { exact: true }).check();
    const revoked = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/school/learning-support/${publishedSupport.id}/revoke` && response.request().method() === 'POST');
    await revoke.getByRole('button', { name: 'Save', exact: true }).click(); expect((await revoked).status()).toBe(200);
    await signIn(parent); await choose(page.getByLabel('Child', { exact: true }), child.actorId, child.displayName); await page.getByRole('button', { name: 'Approved learning support', exact: true }).click();
    await choose(family.getByLabel('Child’s current course', { exact: true }), course.id, courseTitle);
    await family.getByRole('button', { name: 'Refresh approved support', exact: true }).click();
    await expect(family.getByRole('heading', { name: supportTitle, exact: true })).toHaveCount(0);
    await expect(family.getByText('No current support instructions are published for this child and course. Expired or withdrawn instructions are not shown.', { exact: true })).toBeVisible();
    // A second approved source proves relationship loss clears actual protected text, not merely an already empty page.
    const again = await command('/v1/school/learning-support', { learnerId: child.actorId, courseId: course.id, assessmentId: task.id, title: `${supportTitle} restored`, instructions, effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', studentVisible: false, parentVisible: true, reason: privateReason, confirmApproval: true }); supportIds.push(again.id);
    await family.getByRole('button', { name: 'Refresh approved support', exact: true }).click(); await expect(family.getByText(instructions, { exact: true })).toBeVisible();
    const currentGuardian = (await rows('/v1/school/guardian-relationships')).find(row => row.parentId === parentIdentity.actorId && row.studentId === child.actorId)!;
    await command('/v1/school/guardian-relationships', { parentId: currentGuardian.parentId, studentId: currentGuardian.studentId, relationshipType: currentGuardian.relationshipType, status: 'revoked', effectiveFrom: currentGuardian.effectiveFrom, effectiveTo: currentGuardian.effectiveTo, expectedRevision: currentGuardian.revision, confirmAccessChange: true }); revokedGuardian = true;
    await family.getByRole('button', { name: 'Refresh approved support', exact: true }).click(); await expect(page.getByText(instructions, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Refresh school records', exact: true }).click(); await expect(page.getByLabel('Child', { exact: true }).locator(`option[value="${child.actorId}"]`)).toHaveCount(0);
    expect(errors.filter(message => !message.includes('status of 403'))).toEqual([]);
    const denied = await page.request.get(`${api}/v1/school/learning-support?limit=25&learnerId=${child.actorId}&courseId=${course.id}`, { headers: headers(parentToken) });
    expect(denied.status()).toBe(200); expect((await denied.json()).items).toEqual([]);
  } catch (error) { primaryError = error; }
  test.setTimeout(testInfo.timeout + 45_000); const cleanupErrors: unknown[] = [];
  if (revokedGuardian) try {
    const current = (await rows('/v1/school/guardian-relationships')).find(row => row.parentId === parentIdentity.actorId && row.studentId === child.actorId)!;
    await command('/v1/school/guardian-relationships', { parentId: originalGuardian.parentId, studentId: originalGuardian.studentId, relationshipType: originalGuardian.relationshipType, status: originalGuardian.status, effectiveFrom: originalGuardian.effectiveFrom, effectiveTo: originalGuardian.effectiveTo, expectedRevision: current.revision, confirmAccessChange: true });
  } catch (error) { cleanupErrors.push(error); }
  for (const id of supportIds) try {
    const source = (await rows('/v1/school/learning-support', 25)).find(item => item.id === id);
    if (source && source.state !== 'REVOKED') await command(`/v1/school/learning-support/${id}/revoke`, { expectedRevision: source.revision, reason: 'Withdraw only this synthetic family support fixture.', confirmRevocation: true });
  } catch (error) { cleanupErrors.push(error); }
  if (primaryError && cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], 'Parent support check and current fixture restoration failed.', { cause: primaryError });
  if (primaryError) throw primaryError; if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Parent support fixture restoration failed.');
});
