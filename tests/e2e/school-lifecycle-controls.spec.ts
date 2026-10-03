import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

type Role = 'admin' | 'teacher' | 'student' | 'parent';
type Account = { role: string; email: string; password: string };
type Row = { id: string; revision: number; [key: string]: unknown };
type Relation = 'assignment' | 'enrollment' | 'guardian';
const api = 'http://localhost:4000';
const school = '10000000-0000-4000-8000-000000000001';
const year = '40000000-0000-4000-8000-000000000001';
const yearGroup = '42000000-0000-4000-8000-000000000001';
const subject = '43000000-0000-4000-8000-000000000001';

async function fixture(page: Page) {
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const identities = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string; displayName: string }[] };
  const selected = Object.fromEntries((['admin', 'teacher', 'student', 'parent'] as Role[]).map(role => {
    const account = accounts.find(item => item.role === role);
    const person = identities.actors.find(item => item.email === account?.email);
    if (!account || !person) throw new Error(`Guarded synthetic ${role} account and current name are required.`);
    return [role, { ...account, ...person }];
  })) as Record<Role, Account & { actorId: string; displayName: string }>;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error('Configured local synthetic Auth is required.');
  const tokens = {} as Record<Role, string>;
  for (const role of ['admin', 'teacher', 'student', 'parent'] as Role[]) {
    const account = selected[role];
    const response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, {
      headers: { apikey: publicKey }, data: { email: account.email, password: account.password },
    });
    expect(response.status(), 'Synthetic fixture Auth').toBe(200);
    tokens[role] = (await response.json()).access_token;
  }
  const headers = (role: Role) => ({ Authorization: `Bearer ${tokens[role]}`, 'X-School-Id': school });
  const command = async (role: Role, path: string, body: Record<string, unknown>) => {
    const response = await page.request.post(`${api}${path}`, { headers: { ...headers(role), 'Idempotency-Key': randomUUID() }, data: body });
    expect(response.status(), `Explicit synthetic API setup/cleanup ${path}`).toBe(200);
    return response.json() as Promise<Row>;
  };
  const rows = async (path: string) => {
    const items: Row[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let index = 0; index < 30; index++) {
      const response = await page.request.get(`${api}${path}?limit=100${cursor ? `&cursor=${cursor}` : ''}`, { headers: headers('admin') });
      expect(response.status()).toBe(200);
      const result = await response.json() as { items: Row[]; nextCursor: string | null };
      items.push(...result.items);
      cursor = result.nextCursor;
      if (!cursor) return items;
      expect(seen.has(cursor)).toBe(false);
      seen.add(cursor);
    }
    throw new Error('Synthetic current source lookup exceeded its bounded continuation.');
  };
  const signIn = async (role: Role, feature = 'School') => {
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true }).last();
    if (await signOut.isVisible()) await signOut.click();
    await page.getByLabel('School email', { exact: true }).fill(selected[role].email);
    await page.getByLabel('Password', { exact: true }).fill(selected[role].password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: feature, exact: true }).click();
    const surface = feature === 'School' ? '.school-workspace' : feature === 'Learning' ? '.learning-workspace' : feature === 'Academic' ? '.academic-workspace' : '.progress-workspace';
    await expect(page.locator(surface)).toBeVisible();
  };
  const settle = async () => {
    await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0);
  };
  const allPages = async (scope: Locator) => {
    await settle();
    for (let index = 0; index < 40; index++) {
      const more = scope.getByRole('button', { name: /^Load more(?:[: ·]|$)/ });
      if (!await more.count()) return;
      await more.first().click();
      await expect(scope.getByRole('button', { name: /^Loading more/ })).toHaveCount(0);
      await settle();
    }
    throw new Error('Visible current source choices exceeded their bounded fixture pages.');
  };
  const selectNamed = async (control: Locator, value: string, name: string) => {
    const option = control.locator(`option[value="${value}"]`);
    await expect(option).toBeAttached();
    await expect(option).toContainText(name);
    await control.selectOption(value);
  };
  const save = async (path: string, form: Locator) => {
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await responsePromise;
    expect(response.status(), `Visible current-source mutation ${path}`).toBe(200);
    const body = response.request().postDataJSON() as Record<string, unknown>;
    const receipt = await response.json() as Row;
    const key = response.request().headers()['idempotency-key'];
    if (!key) throw new Error('A confirmed UI write must retain its original request key.');
    await expect(form).toHaveCount(0);
    await settle();
    return { body, receipt, key };
  };
  const stamp = new Date().toISOString();
  const className = `School lifecycle class ${stamp}`;
  // Isolated class/course source setup is API-arranged, not counted as visible lifecycle acceptance.
  const classroom = await command('admin', '/v1/school/classes', { academicYearId: year, yearGroupId: yearGroup, name: className });
  const from = '2026-09-01T00:00:00.000Z';
  await command('admin', '/v1/school/teacher-assignments', { classId: classroom.id, subjectId: subject, teacherId: selected.teacher.actorId, status: 'active', effectiveFrom: from, effectiveTo: null, expectedRevision: 0, confirmAccessChange: true });
  await command('admin', '/v1/school/enrollments', { classId: classroom.id, studentId: selected.student.actorId, status: 'active', effectiveFrom: from, effectiveTo: null, expectedRevision: 0, confirmAccessChange: true });
  return { selected, command, rows, headers, signIn, settle, allPages, selectNamed, save, classroom, className, stamp };
}

test('administrator revokes and restores current teacher, learner and guardian scope through visible records', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const context = await fixture(page);
  const courseTitle = `Current school access evidence ${context.stamp}`;
  const course = await context.command('teacher', '/v1/courses', { classId: context.classroom.id, subjectId: subject, title: courseTitle, description: 'Isolated source for current relationship readback.' });
  await context.command('teacher', `/v1/courses/${course.id}/publish`, {});
  const taskTitle = `Reviewed family access evidence ${context.stamp}`;
  const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.id, title: taskTitle, instructions: 'Explain the school example.', maxScore: 10 });
  await context.command('teacher', `/v1/assessments/${assessment.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
  const submission = await context.command('student', `/v1/assessments/${assessment.id}/submissions`, { content: 'Synthetic immutable school explanation.' });
  const mark = await context.command('teacher', `/v1/submissions/${submission.id}/results`, { score: 7, feedback: 'Reviewed school evidence.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
  const result = await context.command('teacher', `/v1/results/${mark.id}/release`, { expectedRevision: 1, parentVisible: true });
  const paths: Record<Relation, string> = { assignment: '/v1/school/teacher-assignments', enrollment: '/v1/school/enrollments', guardian: '/v1/school/guardian-relationships' };
  const titles: Record<Relation, string> = { assignment: 'Assign teacher', enrollment: 'Configure enrollment', guardian: 'Configure guardian relationship' };
  const matches = (kind: Relation, row: Row) => kind === 'guardian'
    ? row.parentId === context.selected.parent.actorId && row.studentId === context.selected.student.actorId
    : row.classId === context.classroom.id && (kind === 'assignment' ? row.teacherId === context.selected.teacher.actorId && row.subjectId === subject : row.studentId === context.selected.student.actorId);
  const originals = {} as Record<Relation, Row>;
  for (const kind of ['assignment', 'enrollment', 'guardian'] as Relation[]) {
    const original = (await context.rows(paths[kind])).find(row => matches(kind, row));
    if (!original || original.status !== 'active') throw new Error('Active synthetic current relationship is required.');
    originals[kind] = original;
  }
  const originalInput = (kind: Relation, row: Row) => ({
    ...(kind === 'guardian' ? { parentId: row.parentId, studentId: row.studentId, relationshipType: row.relationshipType } : kind === 'assignment' ? { classId: row.classId, subjectId: row.subjectId, teacherId: row.teacherId } : { classId: row.classId, studentId: row.studentId }),
    status: originals[kind].status, effectiveFrom: originals[kind].effectiveFrom, effectiveTo: originals[kind].effectiveTo,
    expectedRevision: row.revision, confirmAccessChange: true,
  });
  const change = async (kind: Relation, status: 'Active' | 'Revoked') => {
    await context.signIn('admin');
    await page.getByRole('button', { name: 'People and access', exact: true }).click();
    await context.allPages(page.locator('.school-workspace'));
    const current = (await context.rows(paths[kind])).find(row => matches(kind, row));
    if (!current) throw new Error('Current relationship lookup is unavailable.');
    const personName = kind === 'assignment' ? context.selected.teacher.displayName : context.selected.student.displayName;
    let record = page.locator(`[data-access-kind="${kind}"]`).filter({ hasText: personName });
    record = kind === 'guardian' ? record.filter({ hasText: context.selected.parent.displayName }) : record.filter({ hasText: context.className });
    await expect(record).toHaveCount(1);
    await record.getByRole('button', { name: titles[kind], exact: true }).click();
    const form = page.getByRole('region', { name: titles[kind], exact: true }).filter({ has: page.locator('form') });
    if (kind === 'guardian') {
      await expect(form.getByLabel('Parent / guardian', { exact: true }).locator('option:checked')).toContainText(context.selected.parent.displayName);
      await expect(form.getByLabel('Student', { exact: true }).locator('option:checked')).toContainText(context.selected.student.displayName);
    } else {
      await expect(form.getByLabel('Class', { exact: true }).locator('option:checked')).toContainText(context.className);
      await expect(form.getByLabel(kind === 'assignment' ? 'Teacher' : 'Student', { exact: true }).locator('option:checked')).toContainText(personName);
    }
    await expect(form.getByLabel('Status', { exact: true })).toHaveValue(String(current.status));
    await expect(form.getByLabel('I approve this change to current access', { exact: true })).not.toBeChecked();
    await form.getByLabel('Status', { exact: true }).selectOption({ label: status });
    await form.getByLabel('I approve this change to current access', { exact: true }).check();
    const saved = await context.save(paths[kind], form);
    expect(saved.body).toMatchObject({ expectedRevision: current.revision, status: status.toLowerCase(), effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo });
    expect(saved.receipt.revision).toBe(current.revision + 1);
    await expect(record).toContainText(status);
    return saved;
  };
  const courseVisible = async (role: 'teacher' | 'student', visible: boolean) => {
    await context.signIn(role, 'Learning');
    await context.allPages(page.locator('.learning-workspace'));
    const title = page.getByRole('heading', { name: courseTitle, exact: true });
    await expect(title).toHaveCount(visible ? 1 : 0);
  };
  const familyVisible = async (visible: boolean) => {
    await context.signIn('parent', 'Academic');
    await context.settle();
    const child = page.getByLabel('Child', { exact: true });
    const own = child.locator(`option[value="${context.selected.student.actorId}"]`);
    if (visible) {
      await context.selectNamed(child, context.selected.student.actorId, context.selected.student.displayName);
      await context.allPages(page.locator('.academic-workspace'));
      await expect(page.locator(`[data-result-id="${result.id}"]`).getByRole('heading', { name: taskTitle, exact: true })).toBeVisible();
    } else {
      await expect(own).toHaveCount(0);
      await expect(page.getByRole('heading', { name: taskTitle, exact: true })).toHaveCount(0);
    }
  };
  let primaryError: unknown;
  try {
    await courseVisible('teacher', true);
    const revoked = await change('assignment', 'Revoked');
    await courseVisible('teacher', false);
    await change('assignment', 'Active');
    await courseVisible('teacher', true);
    // The old expected revision cannot silently repeat a different state after restoration.
    const stale = await page.request.post(`${api}${paths.assignment}`, { headers: { ...context.headers('admin'), 'Idempotency-Key': randomUUID() }, data: revoked.body });
    expect(stale.status()).toBe(409);

    await courseVisible('student', true);
    await change('enrollment', 'Revoked');
    await courseVisible('student', false);
    await change('enrollment', 'Active');
    await courseVisible('student', true);

    await familyVisible(true);
    await change('guardian', 'Revoked');
    await familyVisible(false);
    await change('guardian', 'Active');
    await familyVisible(true);
  } catch (error) { primaryError = error; }
  test.setTimeout(testInfo.timeout + 45_000);
  const cleanupErrors: unknown[] = [];
  for (const kind of ['assignment', 'enrollment', 'guardian'] as Relation[]) {
    try {
      const current = (await context.rows(paths[kind])).find(row => matches(kind, row));
      if (!current) throw new Error('Current relationship must be re-read before cleanup.');
      if (current.status !== originals[kind].status || current.effectiveFrom !== originals[kind].effectiveFrom || current.effectiveTo !== originals[kind].effectiveTo) await context.command('admin', paths[kind], originalInput(kind, current));
    } catch (error) { cleanupErrors.push(error); }
  }
  if (primaryError && cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], 'Lifecycle check and current-source restoration both need review.', { cause: primaryError });
  if (primaryError) throw primaryError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Current synthetic relationships were not fully restored.');
});

test('administrator corrects and cancels timetable and report period, then creates reviewed replacements through UI', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const context = await fixture(page);
  const term = await context.command('admin', '/v1/school/terms', { academicYearId: year, name: `Lifecycle school term ${context.stamp}`, startsOn: '2026-10-01', endsOn: '2026-12-31' });
  const location = `School lifecycle room ${context.stamp}`;
  const periodName = `School lifecycle report ${context.stamp}`;
  const initialSlot = { classId: context.classroom.id, subjectId: subject, teacherId: context.selected.teacher.actorId, dayOfWeek: 6, startsAt: '17:00', endsAt: '18:00', effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31', location };
  const initialPeriod = { termId: term.id, name: periodName, startsOn: '2026-10-01', endsOn: '2026-10-31', parentVisible: true };
  // Only initial source setup uses API; corrections, cancellations and reviewed replacements below are visible operations.
  const slot = await context.command('admin', '/v1/school/timetable', initialSlot);
  const period = await context.command('admin', '/v1/school/report-periods', initialPeriod);
  const currentIds = { timetable: [slot.id], 'report-periods': [period.id] };
  const daily = async () => {
    await context.signIn('admin');
    await page.getByRole('button', { name: 'Daily operations', exact: true }).click();
    await context.allPages(page.locator('.school-workspace'));
    await context.selectNamed(page.getByLabel('Daily class records', { exact: true }), context.classroom.id, context.className);
    await context.settle();
  };
  const maintain = async (resource: 'timetable' | 'report-periods', id: string, title: string, cancel: boolean, edit?: (form: Locator) => Promise<void>) => {
    await daily();
    const section = page.getByRole('region', { name: `${resource === 'timetable' ? 'Timetable' : 'Report periods'} · Manage current records`, exact: true });
    const row = section.locator('article').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: cancel ? 'Cancel current record' : 'Correct current record', exact: true }).click();
    const form = section.getByRole('region', { name: cancel ? 'Cancel current record' : 'Correct current record', exact: true });
    const current = (await context.rows(`/v1/school/${resource}`)).find(item => item.id === id);
    if (!current) throw new Error('Maintenance requires one exact current source.');
    if (edit) await edit(form);
    await form.getByLabel('Correction reason', { exact: true }).fill('Administrator reviewed this exact current timetable or report-period source.');
    await expect(form.getByLabel('I reviewed this source and approve the change', { exact: true })).not.toBeChecked();
    await form.getByLabel('I reviewed this source and approve the change', { exact: true }).check();
    const saved = await context.save(`/v1/school/records/${id}/${cancel ? 'cancel' : 'edit'}`, form);
    expect(saved.body).toMatchObject({ resource, expectedRevision: current.revision });
    expect(saved.receipt).toMatchObject({ id, revision: current.revision + 1, recordState: cancel ? 'CANCELLED' : 'CURRENT' });
    return saved;
  };
  const studentSlot = async (text: string, visible: boolean) => {
    await context.signIn('student');
    await context.allPages(page.locator('.school-workspace'));
    const timetable = page.getByRole('region', { name: 'Timetable', exact: true });
    if (visible) await expect(timetable).toContainText(text);
    else await expect(timetable).not.toContainText(text);
  };
  const studentPeriod = async (name: string, visible: boolean) => {
    await context.signIn('student', 'Progress');
    await context.settle();
    const report = page.getByRole('region', { name: 'Browse current result pages', exact: true });
    await context.allPages(report);
    const option = report.getByLabel('Report period', { exact: true }).locator('option').filter({ hasText: name });
    await expect(option).toHaveCount(visible ? 1 : 0);
  };
  let primaryError: unknown;
  try {
    const correctedLocation = `${location} corrected`;
    await maintain('timetable', slot.id, context.className, false, async form => {
      await expect(form.getByLabel('Start time (HH:MM)', { exact: true })).toHaveValue('17:00');
      await form.getByLabel('Start time (HH:MM)', { exact: true }).fill('18:00');
      await form.getByLabel('End time (HH:MM)', { exact: true }).fill('19:00');
      await form.getByLabel('Location', { exact: true }).fill(correctedLocation);
    });
    await studentSlot(correctedLocation, true);
    await maintain('timetable', slot.id, context.className, false, async form => {
      await form.getByLabel('Start time (HH:MM)', { exact: true }).fill('17:00');
      await form.getByLabel('End time (HH:MM)', { exact: true }).fill('18:00');
      await form.getByLabel('Location', { exact: true }).fill(location);
    });
    await studentSlot(location, true);
    await maintain('timetable', slot.id, context.className, true);
    await studentSlot(location, false);
    await daily();
    await page.getByRole('button', { name: 'Create timetable entry', exact: true }).click();
    let form = page.getByRole('region', { name: 'Create timetable entry', exact: true });
    await context.selectNamed(form.getByLabel('Class', { exact: true }), context.classroom.id, context.className);
    await context.selectNamed(form.getByLabel('Subject', { exact: true }), subject, 'Mathematics');
    await context.selectNamed(form.getByLabel('Teacher', { exact: true }), context.selected.teacher.actorId, context.selected.teacher.displayName);
    await form.getByLabel('Day of week', { exact: true }).selectOption({ label: 'Saturday' });
    await form.getByLabel('Start time (HH:MM)', { exact: true }).fill('17:00');
    await form.getByLabel('End time (HH:MM)', { exact: true }).fill('18:00');
    await form.getByLabel('Starts on (YYYY-MM-DD)', { exact: true }).fill('2026-10-01');
    await form.getByLabel('Ends on (YYYY-MM-DD)', { exact: true }).fill('2026-12-31');
    await form.getByLabel('Location', { exact: true }).fill(location);
    const replacedSlot = await context.save('/v1/school/timetable', form);
    currentIds.timetable.push(replacedSlot.receipt.id);
    expect(replacedSlot.receipt.id).not.toBe(slot.id);
    await studentSlot(location, true);

    const correctedName = `${periodName} corrected`;
    await maintain('report-periods', period.id, periodName, false, async editor => {
      await expect(editor.getByLabel('Name', { exact: true })).toHaveValue(periodName);
      await editor.getByLabel('Name', { exact: true }).fill(correctedName);
      await editor.getByLabel('Ends on (YYYY-MM-DD)', { exact: true }).fill('2026-11-30');
    });
    await studentPeriod(correctedName, true);
    await maintain('report-periods', period.id, correctedName, false, async editor => {
      await editor.getByLabel('Name', { exact: true }).fill(periodName);
      await editor.getByLabel('Ends on (YYYY-MM-DD)', { exact: true }).fill('2026-10-31');
    });
    await studentPeriod(periodName, true);
    await maintain('report-periods', period.id, periodName, true);
    await studentPeriod(periodName, false);
    await daily();
    await page.getByRole('button', { name: 'Create report period', exact: true }).click();
    form = page.getByRole('region', { name: 'Create report period', exact: true });
    await context.selectNamed(form.getByLabel('Term', { exact: true }), term.id, `Lifecycle school term ${context.stamp}`);
    await form.getByLabel('Name', { exact: true }).fill(periodName);
    await form.getByLabel('Starts on (YYYY-MM-DD)', { exact: true }).fill('2026-10-01');
    await form.getByLabel('Ends on (YYYY-MM-DD)', { exact: true }).fill('2026-10-31');
    await form.getByLabel('Approve this event or period for parents', { exact: true }).check();
    const replacedPeriod = await context.save('/v1/school/report-periods', form);
    currentIds['report-periods'].push(replacedPeriod.receipt.id);
    expect(replacedPeriod.receipt.id).not.toBe(period.id);
    await studentPeriod(periodName, true);
    await daily();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  } catch (error) { primaryError = error; }
  test.setTimeout(testInfo.timeout + 45_000);
  const cleanupErrors: unknown[] = [];
  // Cancel only exact test-authored current sources. Cancelled history is retained; same-source restoration is unsupported.
  for (const resource of ['timetable', 'report-periods'] as const) {
    try {
      const current = await context.rows(`/v1/school/${resource}`);
      for (const id of currentIds[resource]) {
        const source = current.find(row => row.id === id);
        if (source) await context.command('admin', `/v1/school/records/${id}/cancel`, { resource, expectedRevision: source.revision, reason: 'Restore the guarded demonstration schedule after exact synthetic lifecycle verification.', confirmChange: true });
      }
    } catch (error) { cleanupErrors.push(error); }
  }
  if (primaryError && cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], 'Maintenance check and exact-source cleanup both need review.', { cause: primaryError });
  if (primaryError) throw primaryError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Synthetic schedule cleanup did not finish.');
});
