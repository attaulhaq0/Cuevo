import { currentCoursePreparationOutline } from './learning-source-navigation';
import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

type Account = { role: string; email: string; password: string };
type Content = { id: string; sourceId: string; courseId: string; resource: string; revision: number; draftRevision: number; publishedRevision: number | null; state: string; title: string; content: string };
type Document = { id: string; revisionId: string; revision: number; state: string; sha256: string; byteSize: number; name: string };
const api = 'http://localhost:4000';
const school = '10000000-0000-4000-8000-000000000001';
const edit = 'Prepare a content revision';
const publish = 'Publish reviewed content';
const retire = 'Retire learning content';

test('adapter: current course receipt and primary title remain exact beside a same-named preparation heading', async ({ page }) => {
  const courseId = 'f4000000-0000-4000-8000-000000000001';
  const title = 'Reviewed explanation course';
  await page.route('https://fixture.invalid/v1/courses/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: courseId, title }) }));
  await page.setContent(`<div class="learning-workspace"><ul class="course-list"><li data-course-choice="${courseId}"><h2>${title}</h2><button>Open course</button></li></ul></div><script>document.querySelector('button').onclick=async()=>{await fetch('https://fixture.invalid/v1/courses/${courseId}');document.querySelector('.learning-workspace').innerHTML='<div class="course-view"><h1>${title}</h1><section><h2>${title}</h2></section></div>';};</script>`);
  await openLifecycleCourse(page, title, courseId);
  await expect(page.locator('.course-view').getByRole('heading', { name: title, level: 2, exact: true })).toHaveCount(1);
});

test('adapter: current course opening refuses wrong source receipts and wrong or duplicate primary titles', async ({ page }) => {
  const courseId = 'f4000000-0000-4000-8000-000000000001';
  const title = 'Reviewed explanation course';
  for (const scenario of [
    { receiptId: 'f4000000-0000-4000-8000-000000000002', headings: `<h1>${title}</h1><h2>${title}</h2>` },
    { receiptId: courseId, headings: `<h1>Another course</h1><h2>${title}</h2>` },
    { receiptId: courseId, headings: `<h1>${title}</h1><h1>${title}</h1><h2>${title}</h2>` },
  ]) {
    await page.route('https://fixture.invalid/v1/courses/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: scenario.receiptId, title }) }));
    await page.setContent(`<div class="learning-workspace"><ul class="course-list"><li data-course-choice="${courseId}"><h2>${title}</h2><button>Open course</button></li></ul></div><script>document.querySelector('button').onclick=async()=>{await fetch('https://fixture.invalid/v1/courses/${courseId}');document.querySelector('.learning-workspace').innerHTML='<div class="course-view">${scenario.headings}</div>';};</script>`);
    await expect(openLifecycleCourse(page, title, courseId)).rejects.toThrow();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

async function openLifecycleCourse(page: Page, title: string, courseId: string) {
  const row = page.locator(`.course-list > li[data-course-choice="${courseId}"]`);
  await expect(page.getByText('Loading learning…', { exact: true })).toHaveCount(0);
  for (let index = 0; index < 40 && !await row.count(); index++) {
    const more = page.locator('.learning-workspace > .pagination-actions').getByRole('button', { name: 'Load more', exact: true });
    await expect.poll(async () => await row.count() > 0 || await more.count() > 0).toBe(true);
    if (await row.count()) break;
    await expect(more, 'Only the current course directory continuation may be used').toHaveCount(1);
    await expect(more).toBeEnabled(); await more.click();
    await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await expect(row, 'The independently known course receipt identifies one current directory row').toHaveCount(1);
  await expect(row).toBeVisible();
  await expect(row.getByRole('heading', { name: title, level: 2, exact: true })).toHaveCount(1);
  const current = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/courses/${courseId}` && response.request().method() === 'GET');
  await row.getByRole('button', { name: 'Open course', exact: true }).click();
  const response = await current; expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ id: courseId, title });
  const owner = page.locator('.course-view');
  await expect(owner).toHaveCount(1);
  await expect(owner.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(owner.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
}

async function fixture(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || /hydration|did not match/i.test(message.text())) errors.push(message.text()); });
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  const student = accounts.find(account => account.role === 'student')!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Configured synthetic Auth is required.');
  const token = async (account: Account) => {
    const response = await page.request.post(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:56321'}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key }, data: { email: account.email, password: account.password },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).access_token as string;
  };
  const teacherToken = await token(teacher); const studentToken = await token(student);
  const headers = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, 'X-School-Id': school });
  const get = (path: string, accessToken = teacherToken) => page.request.get(`${api}${path}`, { headers: headers(accessToken) });
  const read = async <T,>(path: string, accessToken = teacherToken): Promise<T> => {
    const response = await get(path, accessToken); expect(response.status(), `Authorized read ${path}`).toBe(200); return response.json();
  };
  const command = async <T extends { id: string }>(path: string, body: Record<string, unknown>): Promise<T> => {
    const response = await page.request.post(`${api}${path}`, { headers: { ...headers(teacherToken), 'Idempotency-Key': randomUUID() }, data: body });
    expect(response.status(), `Labeled synthetic setup/cleanup ${path}`).toBe(200); return response.json();
  };
  const signIn = async (account: Account) => {
    await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
    const signOut = page.locator('.workspace-chrome__person > button');
    if (await signOut.isVisible()) { await signOutTrailWorkspace(page); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(); }
    await page.getByLabel('School email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expectTrailWorkspace(page, account.role);
    await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Learning', exact: true }).click();
  };
  const openCourse = (title: string, courseId: string) => openLifecycleCourse(page, title, courseId);
  const createCourse = (title: string) => command('/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title, description: 'API fixture setup for visible current-source lifecycle decisions.' });
  const cleanupCourse = async (courseId: string) => {
    const current = await read<Content>(`/v1/learning-content/course/${courseId}`);
    if (current.state !== 'RETIRED') await command(`/v1/learning-content/course/${courseId}/retire`, {
      expectedRevision: current.draftRevision, reason: 'Retire only this synthetic browser fixture course after verification.', confirmRetirement: true,
    });
  };
  return { teacher, student, teacherToken, studentToken, get, read, command, signIn, openCourse, createCourse, cleanupCourse, errors };
}

async function withCleanup(work: () => Promise<void>, steps: readonly (() => Promise<void>)[]) {
  const errors: unknown[] = [];
  try { await work(); } catch (error) { errors.push(error); }
  for (const cleanup of steps) { try { await cleanup(); } catch (error) { errors.push(error); } }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Browser fixture and cleanup failed.', { cause: errors[0] });
}

function contentEditor(page: Page, owner: Locator) {
  return owner.locator('section:has(> .learning-actions)').filter({has:page.getByRole('button',{name:edit,exact:true})});
}
function contentForm(page: Page, owner: Locator, title: string) {
  return owner.locator('.learning-form').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}
async function visibleReceipt<T>(page: Page, path: string, submit: () => Promise<void>) {
  const received = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await submit(); const response = await received; expect(response.status(), `Visible command ${path}`).toBe(200);
  return { receipt: await response.json() as T, body: response.request().postDataJSON() as Record<string, unknown> };
}

test('teacher revises exact course, unit and activity sources, retains learner context and retires unused content', async ({ page }) => {
  test.setTimeout(180_000); page.setDefaultTimeout(15_000);
  const f = await fixture(page); const suffix = randomUUID().slice(0, 8);
  const initialTitle = `School content lifecycle ${suffix}`; const course = await f.createCourse(initialTitle);
  await withCleanup(async () => {
    // API setup creates isolated original sources. Every revision/publication/retirement below uses visible teacher controls.
    const unit = await f.command(`/v1/courses/${course.id}/units`, { title: `Original checking unit ${suffix}`, sequence: 1 });
    const unusedUnit = await f.command(`/v1/courses/${course.id}/units`, { title: `Unused unit ${suffix}`, sequence: 2 });
    const lesson = await f.command(`/v1/units/${unit.id}/lessons`, { title: `Checking lesson ${suffix}`, sequence: 1, body: 'Compare the original school examples.' });
    const activity = await f.command(`/v1/lessons/${lesson.id}/activities`, { title: `Original checking activity ${suffix}`, kind: 'practice', instructions: 'Original checking step.', sequence: 1 });
    const unusedActivity = await f.command(`/v1/lessons/${lesson.id}/activities`, { title: `Unused activity ${suffix}`, kind: 'reading', instructions: 'Unused school reading source.', sequence: 2 });
    await f.command(`/v1/courses/${course.id}/publish`, {});
    await f.signIn(f.teacher); await f.openCourse(initialTitle, course.id);
    const revisedTitle = `Reviewed school content ${suffix}`; const revisedUnit = `Reviewed checking unit ${suffix}`; const revisedActivity = `Reviewed checking activity ${suffix}`;
    const revisedDescription = 'Teacher-reviewed course explanation. شرح مدرسي مراجع.';
    const firstInstructions = 'Compare both school examples and explain the first checking step.';
    const revise = async (resource: string, sourceId: string, owner: Locator, title: string, content?: string) => {
      const path = `/v1/learning-content/${resource}/${sourceId}`;
      const before = await f.read<Content>(path);owner=await selectLifecyclePreparation(page,before.title,resource==='activity'?'Practice':undefined,sourceId); const editor = contentEditor(page, owner);
      await expect(editor,'The selected preparation has one current content lifecycle owner').toHaveCount(1);
      await editor.getByRole('button', { name: edit, exact: true }).click();
      const form = contentForm(page, owner, edit); await form.getByLabel('Title', { exact: true }).fill(title);
      if (content !== undefined) await form.getByLabel('Learning content', { exact: true }).fill(content);
      await form.getByLabel('Reason for this revision', { exact: true }).fill('Teacher reviewed this exact current school source.');
      const draft = await visibleReceipt<Content>(page, `${path}/draft`, () => form.getByRole('button', { name: 'Save', exact: true }).click());
      expect(draft.body).toMatchObject({ resource, expectedRevision: before.draftRevision, title, content: content ?? '' });
      expect(draft.receipt).toMatchObject({ sourceId, courseId: course.id, state: 'DRAFT', revision: before.draftRevision + 1, title });
      const learnerBeforePublication = await f.read<Content>(path, f.studentToken);
      expect(learnerBeforePublication).toMatchObject({ id: before.id, title: before.title, content: before.content, state: 'PUBLISHED' });
      const publishButton = owner.getByRole('button', { name: publish, exact: true }); await publishButton.click();
      const approval = contentForm(page, owner, publish);
      await expect(approval.getByLabel('I reviewed and approve this content publication', { exact: true })).not.toBeChecked();
      await approval.getByLabel('I reviewed and approve this content publication', { exact: true }).check();
      const published = await visibleReceipt<Content>(page, `${path}/publish`, () => approval.getByRole('button', { name: publish, exact: true }).click());
      expect(published.body).toEqual({ expectedRevision: draft.receipt.draftRevision, confirmPublication: true });
      expect(published.receipt).toMatchObject({ sourceId, courseId: course.id, state: 'PUBLISHED', revision: draft.receipt.revision + 1, title, content: content ?? '' });
      expect(await f.read<Content>(path, f.studentToken)).toEqual(published.receipt);
      return published.receipt;
    };
    const courseRevision = await revise('course', course.id, page.locator('.course-view'), revisedTitle, revisedDescription);
    await expect(page.locator('.course-view').getByRole('heading', { name: revisedTitle, level:1,exact: true })).toBeVisible();
    // This fixture has authoritative sequences 1/2; retain the owner locator when the reviewed title changes.
    const unitOwner = await selectLifecyclePreparation(page,`Original checking unit ${suffix}`);
    await expect(page.locator('.course-view h1')).toHaveText(`Original checking unit ${suffix}`);
    const unitRevision = await revise('unit', unit.id, unitOwner, revisedUnit);
    const activityOwner = await selectLifecyclePreparation(page,`Original checking activity ${suffix}`,'Practice');
    await expect(page.locator('.course-view h1')).toHaveText(`Original checking activity ${suffix}`);
    const activityRevision = await revise('activity', activity.id, activityOwner, revisedActivity, firstInstructions);

    await f.signIn(f.student); await f.openCourse(revisedTitle, course.id);
    await expect(page.locator('.course-view').getByText(revisedDescription, { exact: true })).toBeVisible();
    await expect(page.locator('.course-view')).toContainText(revisedUnit);
    const ownActivity = await openLifecycleStudentActivity(page,`Checking lesson ${suffix}`,revisedActivity);
    await expect(ownActivity.getByText(firstInstructions, { exact: true })).toBeVisible();
    const completed = await visibleReceipt<{ id: string }>(page, `/v1/activities/${activity.id}/complete`, () => ownActivity.getByRole('button', { name: 'Complete activity', exact: true }).click());
    await f.signIn(f.student); await f.openCourse(revisedTitle, course.id);
    const restoredActivity = await openLifecycleStudentActivity(page,`Checking lesson ${suffix}`,revisedActivity);
    await restoredActivity.getByRole('button', { name: 'Original learning context', exact: true }).click();
    const context = restoredActivity.getByRole('region', { name: 'Original learning context', exact: true });
    await expect(context.getByText(firstInstructions, { exact: true })).toBeVisible();
    const snapshot = await f.read<{ sourceId: string; contextStatus: string; course: { revisionId: string }; activity: { revisionId: string; content: string } }>(`/v1/learning-content/sources/completion/${completed.receipt.id}`, f.studentToken);
    expect(snapshot).toMatchObject({ sourceId: completed.receipt.id, contextStatus: 'AVAILABLE', course: { revisionId: courseRevision.id }, activity: { revisionId: activityRevision.id, content: firstInstructions } });
    expect(unitRevision.resource).toBe('unit');

    await f.signIn(f.teacher); await f.openCourse(revisedTitle, course.id);
    const finalInstructions = 'Teacher corrected the current checking example after the earlier completion. راجع المثال الحالي.';
    const currentActivity = await selectLifecyclePreparation(page,revisedActivity,'Practice');
    await revise('activity', activity.id, currentActivity, revisedActivity, finalInstructions);
    expect(await f.read(`/v1/learning-content/sources/completion/${completed.receipt.id}`, f.studentToken)).toEqual(snapshot);
    const retireSource = async (resource: string, sourceId: string, owner: Locator) => {
      const path = `/v1/learning-content/${resource}/${sourceId}`; const current = await f.read<Content>(path);
      owner=await selectLifecyclePreparation(page,current.title,resource==='activity'?'Reading':undefined,sourceId);
      await expect(contentEditor(page,owner)).toHaveCount(1);
      await contentEditor(page, owner).getByRole('button', { name: retire, exact: true }).click();
      const form = contentForm(page, owner, retire);
      await form.getByLabel('Reason for this revision', { exact: true }).fill('Teacher retires only this unused synthetic source.');
      await expect(form.getByLabel('I confirm this content should no longer be offered', { exact: true })).not.toBeChecked();
      await form.getByLabel('I confirm this content should no longer be offered', { exact: true }).check();
      const retired = await visibleReceipt<Content>(page, `${path}/retire`, () => form.getByRole('button', { name: retire, exact: true }).click());
      expect(retired.body).toMatchObject({ expectedRevision: current.draftRevision, confirmRetirement: true });
      expect(retired.receipt).toMatchObject({ sourceId, state: 'RETIRED', revision: current.draftRevision + 1 });
      expect((await f.get(path, f.studentToken)).status()).toBe(403);
    };
    await retireSource('activity', unusedActivity.id, page.locator('.activity-section').filter({ has: page.getByRole('heading', { name: `Unused activity ${suffix}`, exact: true }) }));
    await retireSource('unit', unusedUnit.id, page.locator('.unit-section').filter({ has: page.getByRole('heading', { name: `Unused unit ${suffix}`, exact: true }) }));
    await f.signIn(f.student); await f.openCourse(revisedTitle, course.id);
    await expect(page.getByRole('heading', { name: `Unused activity ${suffix}`, exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `Unused unit ${suffix}`, exact: true })).toHaveCount(0);
    const latest = await openLifecycleStudentActivity(page,`Checking lesson ${suffix}`,revisedActivity);
    await expect(latest.getByText(finalInstructions, { exact: true })).toBeVisible();
    await latest.getByRole('button', { name: 'Original learning context', exact: true }).click();
    await expect(latest.getByRole('region', { name: 'Original learning context', exact: true }).getByText(firstInstructions, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await f.signIn(f.teacher); await f.openCourse(revisedTitle, course.id);
    await retireSource('course', course.id, page.locator('.course-view'));
    expect(f.errors).toEqual([]);
  }, [() => f.cleanupCourse(course.id)]);
});

test('teacher replaces a verified lesson document, republishes exact bytes and removes current learner delivery', async ({ page }) => {
  test.setTimeout(150_000); page.setDefaultTimeout(15_000);
  const f = await fixture(page); const suffix = randomUUID().slice(0, 8); const title = `School document lifecycle ${suffix}`; const course = await f.createCourse(title);
  let lessonId: string | undefined;
  await withCleanup(async () => {
    // API setup supplies one isolated published lesson. Document upload, publication, replacement and removal use visible controls.
    const unit = await f.command(`/v1/courses/${course.id}/units`, { title: 'Document checking unit', sequence: 1 });
    const lesson = await f.command(`/v1/units/${unit.id}/lessons`, { title: 'Current worksheet lesson', sequence: 1, body: 'Read the current teacher-reviewed worksheet.' });
    lessonId = lesson.id;
    await f.command(`/v1/courses/${course.id}/publish`, {});
    await f.signIn(f.teacher); await f.openCourse(title, course.id);
    let resources = (await selectLifecyclePreparation(page,'Current worksheet lesson')).locator('.learning-resources');
    const bytes = Buffer.from('Original school worksheet. ورقة مدرسية أصلية.'); const replacementBytes = Buffer.from('Corrected school worksheet: compare the exact checking step. ورقة مدرسية مصححة.');
    const name = 'ورقة أصلية.txt'; const replacementName = 'ورقة مصححة.txt'; const documentTitle = `Reviewed worksheet ${suffix}`;
    await resources.getByLabel('Choose document', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: bytes });
    await resources.getByLabel('Document title', { exact: true }).fill(documentTitle);
    const attached = await visibleReceipt<Document>(page, `/v1/courses/${course.id}/resources/lesson/${lesson.id}`, () => resources.getByRole('button', { name: 'Upload, verify and attach', exact: true }).click());
    expect(attached.receipt).toMatchObject({ state: 'ATTACHED', revision: 1, sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length, name });
    const document = resources.getByRole('article').filter({ has: page.getByRole('heading', { name: documentTitle, exact: true }) });
    const publishDocument = async (current: Document) => {
      await document.getByRole('button', { name: 'Publish document', exact: true }).click();
      const form = document.getByRole('region', { name: 'Publish document', exact: true });
      await expect(form.getByLabel('I reviewed this document for the current learners', { exact: true })).not.toBeChecked();
      await form.getByLabel('I reviewed this document for the current learners', { exact: true }).check();
      const published = await visibleReceipt<Document>(page, `/v1/courses/${course.id}/resources/${current.id}/publish`, () => form.getByRole('button', { name: 'Save', exact: true }).click());
      expect(published.body).toEqual({ expectedRevision: current.revision, confirmPublication: true });
      expect(published.receipt).toMatchObject({ id: current.id, state: 'PUBLISHED', revision: current.revision + 1, sha256: current.sha256 });
      await expect(document).toContainText('Published for current learners'); return published.receipt;
    };
    const original = await publishDocument(attached.receipt);
    const downloadPath = (source: Document) => `/v1/learning-resources/${source.id}/revisions/${source.revisionId}/download`;
    const studentDownload = async (expected: Document, expectedBytes: Buffer) => {
      await f.signIn(f.student); await f.openCourse(title, course.id);
      await page.getByRole('button',{name:'Open lesson: Current worksheet lesson',exact:true}).click();await page.locator('.student-learning-journey__materials > summary').click();
      const own = page.locator('.learning-resources').getByRole('article').filter({ has: page.getByRole('heading', { name: documentTitle, exact: true }) });
      await expect(own).toContainText(expected.name);
      const downloadEvent = page.waitForEvent('download'); await own.getByRole('button', { name: 'Download document', exact: true }).click();
      const download = await downloadEvent; expect(download.suggestedFilename()).toBe(expected.name);
      expect(await readFile((await download.path())!)).toEqual(expectedBytes);
    };
    await studentDownload(original, bytes);
    await f.signIn(f.teacher); await f.openCourse(title, course.id);
    resources=(await selectLifecyclePreparation(page,'Current worksheet lesson')).locator('.learning-resources');
    await document.getByRole('button', { name: 'Replace with verified document', exact: true }).click();
    await resources.getByLabel('Choose document', { exact: true }).setInputFiles({ name: replacementName, mimeType: 'text/plain', buffer: replacementBytes });
    await resources.getByLabel('Reason', { exact: true }).fill('Teacher replaces the unused worksheet with reviewed corrected bytes.');
    const replaced = await visibleReceipt<Document>(page, `/v1/courses/${course.id}/resources/${original.id}/replace`, () => resources.getByRole('button', { name: 'Replace with verified document', exact: true }).first().click());
    expect(replaced.body).toMatchObject({ expectedRevision: original.revision, reason: 'Teacher replaces the unused worksheet with reviewed corrected bytes.' });
    expect(replaced.receipt).toMatchObject({ id: original.id, revision: original.revision + 1, state: 'ATTACHED', name: replacementName, sha256: createHash('sha256').update(replacementBytes).digest('hex'), byteSize: replacementBytes.length });
    expect((await f.get(downloadPath(original), f.studentToken)).status()).toBe(403);
    expect((await f.get(downloadPath(replaced.receipt), f.studentToken)).status()).toBe(403);
    const unpublished = await f.read<{ items: Document[] }>(`/v1/courses/${course.id}/resources/lesson/${lesson.id}?limit=100`, f.studentToken);
    expect(unpublished.items).toEqual([]);
    const current = await publishDocument(replaced.receipt);
    await studentDownload(current, replacementBytes);
    expect((await f.get(downloadPath(original), f.studentToken)).status()).toBe(403);
    await f.signIn(f.teacher); await f.openCourse(title, course.id);
    resources=(await selectLifecyclePreparation(page,'Current worksheet lesson')).locator('.learning-resources');
    await document.getByRole('button', { name: 'Remove document', exact: true }).click();
    const removal = document.getByRole('region', { name: 'Remove document', exact: true });
    await removal.getByLabel('Reason', { exact: true }).fill('Teacher removes only this synthetic current worksheet.');
    await expect(removal.getByLabel('I confirm this document should be removed from current learning', { exact: true })).not.toBeChecked();
    await removal.getByLabel('I confirm this document should be removed from current learning', { exact: true }).check();
    const removed = await visibleReceipt<Document>(page, `/v1/courses/${course.id}/resources/${current.id}/remove`, () => removal.getByRole('button', { name: 'Save', exact: true }).click());
    expect(removed.body).toMatchObject({ expectedRevision: current.revision, confirmRemoval: true });
    expect(removed.receipt).toMatchObject({ id: current.id, state: 'REMOVED', revision: current.revision + 1 });
    expect((await f.get(downloadPath(current), f.studentToken)).status()).toBe(403);
    await f.signIn(f.student); await f.openCourse(title, course.id);
    await page.getByRole('button',{name:'Open lesson: Current worksheet lesson',exact:true}).click();await page.locator('.student-learning-journey__materials > summary').click();
    const ownResources = page.locator('.learning-resources');
    await expect(ownResources.getByText('No published documents are available here.', { exact: true })).toBeVisible();
    await expect(ownResources.getByRole('button', { name: 'Download document', exact: true })).toHaveCount(0);
    expect(f.errors).toEqual([]);
  }, [async () => {
    if (!lessonId) return;
    const current = await f.read<{ items: Document[] }>(`/v1/courses/${course.id}/resources/lesson/${lessonId}?limit=100`);
    for (const document of current.items.filter(source => source.state !== 'REMOVED')) await f.command(`/v1/courses/${course.id}/resources/${document.id}/remove`, {
      expectedRevision: document.revision, reason: 'Remove only the created synthetic worksheet after verification.', confirmRemoval: true,
    });
  }, () => f.cleanupCourse(course.id)]);
});

async function selectLifecyclePreparation(page:Page,title:string,kind?:'Practice'|'Reading',sourceId?:string){const outline=await currentCoursePreparationOutline(page),choice=outline.getByRole('button',{name:kind?`${title} ${kind}`:title,exact:true});await expect(choice).toHaveCount(1);await expect(choice).toBeEnabled();await choice.click();await expect(choice).toHaveAttribute('aria-current','page');await expect(page.locator('.course-view h1')).toHaveText(title);const owner=page.getByRole('region',{name:'Course preparation',exact:true});await expect(owner).toHaveCount(1);await expect(owner).toBeVisible();if(sourceId){await expect(owner.getByRole('button',{name:edit,exact:true})).toBeEnabled();}return owner;}
async function openLifecycleStudentActivity(page:Page,lesson:string,title:string){await page.getByRole('button',{name:`Open lesson: ${lesson}`,exact:true}).click();await page.getByRole('button',{name:`Open activity: ${title}`,exact:true}).click();await page.getByRole('button',{name:'Open this task',exact:true}).click();const owner=page.locator('.student-learning-journey__actual-work');await expect(owner).toHaveCount(1);await expect(owner.getByRole('heading',{name:title,exact:true})).toBeVisible();return owner;}

test('adapter: lifecycle preparation waits current loading, names the exact kind and refuses duplicate source choice',async({page})=>{for(const state of['current','duplicate','disabled']){await page.setContent(`<div class="course-view"><h1>Current course</h1><p role="status">Loading learning…</p><nav aria-label="Course structure"><button ${state==='disabled'?'disabled':''}>Current practice Practice</button>${state==='duplicate'?'<button>Current practice Practice</button>':'<button>Current practice Reading</button>'}</nav><section aria-label="Course preparation">Current selected preparation</section></div><script>setTimeout(()=>document.querySelector('[role=status]').remove(),100);document.querySelector('button').onclick=e=>{e.currentTarget.setAttribute('aria-current','page');document.querySelector('h1').textContent='Current practice'};</script>`);if(state==='current')await expect(await selectLifecyclePreparation(page,'Current practice','Practice')).toBeVisible();else await expect(selectLifecyclePreparation(page,'Current practice','Practice')).rejects.toThrow();}});
