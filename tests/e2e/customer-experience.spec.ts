import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

type Account = { role: string; email: string; password: string };
type CustomerRole = 'admin' | 'teacher' | 'student' | 'parent' | 'coordinator';
type ArabicDestination = { label: string; heading?: string; refresh?: string };
// Literal expectations traced from the current owner copy; no runtime dictionary builds the oracle.
const arabicDestinations: Record<string, ArabicDestination> = {
  Overview: { label: 'نظرة عامة' },
  School: { label: 'المدرسة', refresh: 'تحديث سجلات المدرسة' },
  Community: { label: 'المجتمع', refresh: 'تحديث المجتمع' },
  Portfolio: { label: 'ملف التعلّم', refresh: 'تحديث ملف التعلّم' },
  Development: { label: 'النموّ', refresh: 'تحديث النموّ' },
  'Curriculum context': { label: 'سياق المنهج', refresh: 'تحديث سياق المنهج' },
  'Restricted school notes': { label: 'ملاحظات مدرسية مقيّدة', refresh: 'تحديث السجلات الحالية' },
  Learning: { label: 'التعلّم', refresh: 'تحديث' },
  Academic: { label: 'الأكاديمي', refresh: 'تحديث السجلات الأكاديمية' },
  Progress: { label: 'التقدّم', refresh: 'تحديث حالة الطالب' },
  'Next steps': { label: 'الخطوات التالية', refresh: 'تحديث الخطوات التالية' },
  'Access details': { label: 'تفاصيل الوصول', heading: 'وصولك إلى المدرسة', refresh: 'تحديث التحقّق من الوصول' },
  Account: { label: 'الحساب', heading: 'حسابك' },
};
const arabicRoleHeadings: Record<CustomerRole, string> = {
  admin: 'تأسيس المدرسة', teacher: 'مساحة عملك التعليمية', student: 'تعلّمك يبدأ هنا',
  parent: 'اتصالك بالمدرسة', coordinator: 'متابعة التعلّم',
};
const evidence = resolve('.local/customer-readiness/ux');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const schoolId = '10000000-0000-4000-8000-000000000001';
const classId = '30000000-0000-4000-8000-000000000001';
const subjectId = '43000000-0000-4000-8000-000000000001';
const hydrationMessages = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const hydration: string[] = [];
  hydrationMessages.set(page, hydration);
  page.on('console', message => { if ((message.type() === 'error' || message.type() === 'warning') && /hydration|hydrated|server rendered|418|attributes.*match/i.test(message.text())) hydration.push(message.text()); });
  test.info().annotations.push({ type: 'console-health', description: 'Hydration errors/warnings are captured independently from page errors.' });
});
test.afterEach(async ({ page }) => { expect(hydrationMessages.get(page) ?? []).toEqual([]); });
async function accounts() { return JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[]; }
async function token(page: Page, account: Account) {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Configured local synthetic Auth required.');
  const response = await page.request.post(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: account.email, password: account.password } });
  expect(response.ok(), 'Synthetic identity verified').toBe(true);
  return (await response.json()).access_token as string;
}
async function command(page: Page, accessToken: string, path: string, data: Record<string, unknown>) {
  const response = await page.request.post(`http://localhost:4000${path}`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': schoolId, 'Idempotency-Key': randomUUID() }, data });
  const failure=response.ok()?null:await response.json()as{code?:string;requestId?:string};expect(response.ok(), `Domain setup ${path} returned ${response.status()} ${failure?.code??''} ${failure?.requestId??''}`).toBe(true);
  return await response.json() as Record<string, unknown> & { id: string };
}
async function signIn(page: Page, account: Account) {
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
}
async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0); }
async function arabicPrimaryLabels(page: Page, role: CustomerRole, name: string, destination: ArabicDestination) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(name === 'Overview' ? arabicRoleHeadings[role] : destination.heading ?? destination.label);
  if (destination.refresh) await expect(main.getByRole('button', { name: destination.refresh, exact: true })).toBeVisible();
  const staff = role === 'admin' || role === 'teacher' || role === 'coordinator';
  const manager = role === 'admin' || role === 'teacher';
  const tabs = main.getByRole('group', { name: destination.label, exact: true });
  const selector = async (label: string, placeholder: string) => {
    const choice = main.getByRole('combobox', { name: label, exact: true });
    await expect(choice).toBeVisible();
    await expect(choice.locator('option[value=""]')).toHaveText(placeholder);
  };
  if (role === 'parent' && ['Overview', 'School', 'Portfolio', 'Academic', 'Progress'].includes(name)) {
    await selector('الطفل', 'اختر الطفل لعرض سجلاته');
  }
  if (name === 'Overview') {
    await expect(main.getByRole('heading', { name: 'الخطوة التالية', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'السياق المدرسي القادم', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'قراءة الإعلانات المعتمدة', exact: true })).toBeVisible();
    if (role === 'student' || role === 'parent') await expect(main.getByRole('heading', { name: 'قراءة ملاحظات المعلّم', exact: true })).toBeVisible();
  } else if (name === 'School') {
    const expected = role === 'admin' ? ['الإعداد', 'الحرم والدعم التعليمي المعتمد', 'الأشخاص والصلاحيات', 'السياسات', 'سجل تدقيق المدرسة', 'مراجعة الأتمتة', 'العمليات اليومية']
      : role === 'coordinator' ? ['الإعداد', 'الحرم والدعم التعليمي المعتمد', 'الأشخاص والصلاحيات', 'السياسات', 'العمليات اليومية']
        : role === 'teacher' ? ['الإعداد', 'الحرم والدعم التعليمي المعتمد', 'العمليات اليومية']
          : role === 'parent' ? ['الدعم التعليمي المعتمد', 'العمليات اليومية'] : ['العمليات اليومية'];
    await expect(tabs.getByRole('button')).toHaveText(expected);
    await expect(tabs.getByRole('button', { name: role === 'admin' ? 'الإعداد' : 'العمليات اليومية', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (staff && role !== 'admin') await selector('السجلات اليومية للصف', 'جميع الصفوف المسموح بها');
  } else if (name === 'Community') {
    await expect(tabs.getByRole('button')).toHaveText(role === 'parent' ? ['الإعلانات', 'الإشعارات', 'محادثات أولياء الأمور والمعلّمين']
      : manager ? ['غرف الصف والمجموعات', 'الإعلانات', 'الإشعارات', 'محادثات أولياء الأمور والمعلّمين'] : ['غرف الصف والمجموعات', 'الإعلانات', 'الإشعارات']);
    await expect(tabs.getByRole('button', { name: role === 'parent' ? 'الإعلانات' : 'غرف الصف والمجموعات', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } else if (name === 'Development') {
    await selector('فترة التعلّم', 'اختر فترة');
    if (staff) await selector('الطالب', 'اختر طالبًا');
    await expect(main.getByRole('heading', { name: 'الإنجازات', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'سجل أنشطة التعلّم', exact: true })).toBeVisible();
  } else if (name === 'Curriculum context') {
    await expect(tabs.getByRole('button')).toHaveText(['مصادر المنهج', 'أهداف التعلّم', 'برامج المدرسة', 'الولاية وأطر الجودة']);
    await expect(tabs.getByRole('button', { name: 'مصادر المنهج', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } else if (name === 'Learning') {
    await expect(tabs.getByRole('button')).toHaveText(manager || role === 'student' ? ['المقررات', 'التقييمات', 'التسليمات'] : ['المقررات', 'التقييمات']);
    await expect(tabs.getByRole('button', { name: 'المقررات', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } else if (name === 'Academic') {
    await expect(tabs.getByRole('button')).toHaveText(manager ? ['الأهداف', 'سلالم التقدير', 'التصحيح', 'سجل درجات الصف', 'النتائج الصادرة']
      : staff ? ['الأهداف', 'سلالم التقدير', 'النتائج الصادرة'] : ['النتائج الصادرة']);
    await expect(tabs.getByRole('button', { name: manager ? 'التصحيح' : 'النتائج الصادرة', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } else if (name === 'Progress' && staff) {
    await selector('الطالب', 'اختر طالبًا');
    await selector('الصف', 'اختر صفًا');
    await expect(main.getByRole('heading', { name: 'شواهد الصف والدعم', exact: true })).toBeVisible();
  } else if (name === 'Next steps') {
    const expected = role === 'admin' ? ['المقترحات', 'مهام التدريب', 'النتائج', 'حالة التحليلات', 'ملاحظات التقييم', 'اعتماد التنفيذ', 'حدود الميزانية', 'سياسة التحليل']
      : role === 'teacher' ? ['المقترحات', 'مهام التدريب', 'النتائج', 'حالة التحليلات', 'ملاحظات التقييم', 'اعتماد التنفيذ']
        : role === 'student' ? ['مهام التدريب', 'النتائج'] : ['المقترحات', 'مهام التدريب', 'النتائج'];
    await expect(tabs.getByRole('button')).toHaveText(expected);
    await expect(tabs.getByRole('button', { name: role === 'student' ? 'مهام التدريب' : 'المقترحات', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } else if (name === 'Access details') {
    await expect(main.getByRole('heading', { name: 'العضوية الحالية', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'الإمكانات المهيّأة', exact: true })).toBeVisible();
  } else if (name === 'Account') {
    await expect(main.getByRole('heading', { name: 'سياق الطالب', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'تحديث سياق الطالب', exact: true })).toBeVisible();
    if (role !== 'student') await selector('اختر الطالب', 'اختر الطالب');
  }
}
async function capture(page: Page, name: string) { const directory = resolve(evidence, runId, test.info().project.name); await mkdir(directory, { recursive: true }); await page.screenshot({ path: resolve(directory, name), fullPage: false }); }
async function findPaged(page: Page, target: Locator) {
  await expect.poll(async()=>await target.count()>0||await page.getByRole('button',{name:'Load more',exact:true}).count()>0).toBe(true);
  for (let count = 0; count < 30 && !await target.count(); count++) {
    const more = page.getByRole('button', { name: 'Load more', exact: true }).first();
    if (!await more.count()) break;
    await more.click(); await expect(page.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await expect(target).toBeVisible(); const openTask = target.getByRole('button', { name: 'Open task', exact: true }); if (await openTask.count()) await openTask.click();
}
async function assessment(page: Page, title: string) {
  const teacher = (await accounts()).find(row => row.role === 'teacher')!;
  const teacherToken = await token(page, teacher);
  const course = await command(page, teacherToken, '/v1/courses', { classId, subjectId, title, description: 'Independent customer UX source.' });
  await command(page, teacherToken, `/v1/courses/${course.id}/publish`, {});
  return command(page, teacherToken, '/v1/assessments', { courseId: course.id, title, instructions: 'Write your explanation and keep your draft.', maxScore: 10 });
}

test('student keeps typed response when choosing draft save and recovers the server draft on return', async ({ page }) => {
  test.setTimeout(90000);
  const title = `Customer draft ${randomUUID().slice(0, 8)}`;
  const assignment = await assessment(page, title);
  await signIn(page, (await accounts()).find(row => row.role === 'student')!);
  await page.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true }).click();
  await page.getByRole('button', { name: 'Assessments', exact: true }).click();
  const row = page.locator('.assessment-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await findPaged(page, row);
  await row.getByLabel('Your response', { exact: true }).fill('Typed before choosing save.');
  await row.scrollIntoViewIfNeeded(); await capture(page, '01-student-response-before-draft.png');
  await row.getByRole('button', { name: 'Save draft', exact: true }).first().click();
  const draft = row.getByRole('region', { name: 'Save draft', exact: true });
  await expect(draft.getByLabel('Your response', { exact: true })).toBeVisible();
  await capture(page, '02-student-response-after-draft-choice.png');
  await expect(draft.getByLabel('Your response', { exact: true })).toHaveValue('Typed before choosing save.');
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/assessments/${assignment.id}/draft` && response.request().method() === 'POST');
  await draft.getByRole('button', { name: 'Save draft', exact: true }).click();
  const receipt = await saved; expect(receipt.ok()).toBe(true);
  expect(receipt.request().postDataJSON().content).toBe('Typed before choosing save.');
  await page.getByRole('button', { name: 'Courses', exact: true }).click();
  await page.getByRole('button', { name: 'Assessments', exact: true }).click(); await findPaged(page, row);
  await expect(row.getByLabel('Your response', { exact: true })).toHaveValue('Typed before choosing save.');
});

test('school editor survives same-scope refresh and clears after access is denied', async ({ page }) => {
  await signIn(page, (await accounts()).find(row => row.role === 'admin')!);
  await page.getByRole('navigation').getByRole('button', { name: 'School', exact: true }).click(); await settled(page);
  await page.getByRole('button', { name: 'Create academic year', exact: true }).click();
  const form = page.getByRole('region', { name: 'Create academic year', exact: true });
  await form.getByLabel('Name', { exact: true }).fill('Preserve this school setup draft');
  await form.scrollIntoViewIfNeeded(); await capture(page, '03-school-typed-setup.png');
  await page.getByRole('button', { name: 'Refresh school records', exact: true }).click(); await settled(page);
  await capture(page, '04-school-after-refresh.png');
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Preserve this school setup draft');
  await page.route('**/v1/school/context', route => route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'FORBIDDEN', requestId: 'customer-denied-draft' }) }));
  await page.getByRole('button', { name: 'Refresh school records', exact: true }).click(); await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(form).toHaveCount(0); await page.unroute('**/v1/school/context');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Create academic year', exact: true }).click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('');
});

test('editing a suspended identity preserves its existing lifecycle and effective window', async ({ page }) => {
  test.setTimeout(90000);
  const admin = (await accounts()).find(row => row.role === 'admin')!;
  const accessToken = await token(page, admin);
  const userId = '20000000-0000-4000-8000-000000000020';
  const response = await page.request.get('http://localhost:4000/v1/school/people?limit=100', { headers: { Authorization: `Bearer ${accessToken}`, 'X-School-Id': schoolId } });
  expect(response.ok()).toBe(true);
  const person = (await response.json()).items.find((row: { id: string }) => row.id === userId);
  expect(person).toBeTruthy();
  expect(Number.isInteger(person.revision)&&person.revision>0).toBe(true);
  const original = { displayName: person.displayName, role: person.role, status: person.status, effectiveFrom: person.effectiveFrom, effectiveTo: person.effectiveTo, confirmAccessChange: true };
  await command(page, accessToken, `/v1/school/people/${userId}/configure`, { ...original, status: 'suspended', expectedRevision:person.revision });
  try {
    await signIn(page, admin); await page.getByRole('navigation').getByRole('button', { name: 'School', exact: true }).click(); await settled(page);
    await page.getByRole('button', { name: 'People and access', exact: true }).click(); await settled(page);
    await page.getByRole('button', { name: 'Manage school account', exact: true }).click();
    await page.getByLabel('Person', { exact: true }).selectOption(userId);
    const form = page.getByRole('region', { name: 'Manage school account', exact: true });
    await form.scrollIntoViewIfNeeded(); await capture(page, '05-suspended-person-edit-default.png');
    await expect(form.getByLabel('Status', { exact: true })).toHaveValue('suspended');
    await expect(form.getByLabel('Effective from', { exact: true })).not.toHaveValue('');
  } finally { const latest=await page.request.get('http://localhost:4000/v1/school/people?limit=100',{headers:{Authorization:`Bearer ${accessToken}`,'X-School-Id':schoolId}});expect(latest.ok()).toBe(true);const current=(await latest.json()).items.find((row:{id:string})=>row.id===userId);expect(current?.revision).toEqual(expect.any(Number));await command(page, accessToken, `/v1/school/people/${userId}/configure`, {...original,expectedRevision:current.revision}); }
});

test('browser back and forward retain the selected authorized workspace', async ({ page }) => {
  await signIn(page, (await accounts()).find(row => row.role === 'admin')!);
  await page.getByRole('navigation').getByRole('button', { name: 'School', exact: true }).click(); await settled(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true }).click(); await settled(page);
  await capture(page, '06-learning-before-browser-back.png');
  await page.goBack(); await capture(page, '07-browser-back-result.png');
  await expect(page.locator('main h1')).toHaveText('School');
  await page.goForward(); await expect(page.locator('main h1')).toHaveText('Learning');
});

test('school context temporary failure can be retried from the feature', async ({ page }) => {
  await signIn(page, (await accounts()).find(row => row.role === 'admin')!);
  await page.route('**/v1/school/context', route => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'REQUEST_UNAVAILABLE', requestId: 'customer-context-retry' }) }));
  await page.getByRole('navigation').getByRole('button', { name: 'School', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible(); await capture(page, '08-school-initial-unavailable.png');
  await page.unroute('**/v1/school/context');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create academic year', exact: true })).toBeVisible();
});

test('parent explicitly selects the child for approved results and the same child carries to portfolio', async ({ page }) => {
  test.setTimeout(90000);
  const all = await accounts(); const admin = all.find(row => row.role === 'admin')!;
  const adminToken = await token(page, admin);
  const parentId = '20000000-0000-4000-8000-000000000072'; const childId = '20000000-0000-4000-8000-000000000013';
  const relationship = { parentId, studentId: childId, relationshipType: 'guardian', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, confirmAccessChange: true };
  async function currentRelationship() {
    const response=await page.request.get(`http://localhost:4000/v1/school/guardian-relationships?limit=100&learnerId=${childId}`,{headers:{Authorization:`Bearer ${adminToken}`,'X-School-Id':schoolId}});
    expect(response.ok(),'Current exact guardian source is authorized').toBe(true);
    const pageSource=await response.json()as{items:(Record<string,unknown>&{parentId:string;studentId:string;revision:number})[];nextCursor:string|null};
    expect(pageSource.nextCursor,'Selected synthetic child guardian source must fit its explicit page').toBeNull();
    const rows=pageSource.items.filter(row=>row.parentId===parentId&&row.studentId===childId);expect(rows.length).toBeLessThanOrEqual(1);const row=rows[0];
    if(row)expect(Number.isInteger(row.revision)&&row.revision>0).toBe(true);return row;
  }
  const originalRelationship=await currentRelationship();
  async function configureRelationship(body:Record<string,unknown>){const current=await currentRelationship();return command(page,adminToken,'/v1/school/guardian-relationships',{...body,expectedRevision:current?.revision??0});}
  await configureRelationship({ ...relationship, status: 'active' });
  try {
    await signIn(page, all.find(row => row.role === 'parent')!);
    const child = page.getByLabel('Child', { exact: true }); await expect(child).toBeVisible();
    await expect(child).toHaveValue(''); await capture(page, '09-parent-choose-child.png');
    await child.selectOption(childId);
    const report = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/learners/${childId}/academic-report`);
    await page.getByRole('navigation').getByRole('button', { name: 'Academic', exact: true }).click();
    expect((await report).ok()).toBe(true); await expect(page.getByLabel('Child', { exact: true })).toHaveValue(childId);
    await page.getByRole('navigation').getByRole('button', { name: 'Portfolio', exact: true }).click();
    await expect(page.getByLabel('Child', { exact: true })).toHaveValue(childId);
    await capture(page, '10-parent-selected-child-portfolio.png');
    await configureRelationship({ ...relationship, status: 'revoked' });
    const accessRead = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/me' && response.request().method() === 'GET');
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); expect((await accessRead).ok()).toBe(true); await settled(page);
    await expect(page.getByLabel('Child', { exact: true })).toHaveValue('');
    await expect(page.locator('.portfolio-item')).toHaveCount(0);
  } finally { await configureRelationship(originalRelationship?{parentId,studentId:childId,relationshipType:originalRelationship.relationshipType,status:originalRelationship.status,effectiveFrom:originalRelationship.effectiveFrom,effectiveTo:originalRelationship.effectiveTo,confirmAccessChange:true}:{...relationship,status:'revoked'}); }
});

test('main school relationships show readable names and no opaque identifiers', async ({ page }) => {
  await signIn(page, (await accounts()).find(row => row.role === 'admin')!);
  await page.getByRole('navigation').getByRole('button', { name: 'School', exact: true }).click();
  await page.getByRole('button', { name: 'People and access', exact: true }).click(); await settled(page);
  const text = await page.locator('main table').allTextContents();
  expect(text.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  await capture(page, '11-school-readable-relationships.png');
});

test('rubric authoring uses meaningful descriptors and keeps typed work during record refresh', async ({ page }) => {
  test.setTimeout(90000);
  const all = await accounts(); const teacher = all.find(row => row.role === 'teacher')!;
  const teacherToken = await token(page, teacher);
  const title = `Reasoning review ${new Date().toISOString()}`;
  const course = await command(page, teacherToken, '/v1/courses', { classId, subjectId, title, description: 'Customer authoring verification.' });
  await signIn(page, teacher); await page.getByRole('navigation').getByRole('button', { name: 'Academic', exact: true }).click();
  await page.getByRole('button', { name: 'Rubrics', exact: true }).click(); await settled(page);
  await page.getByRole('button', { name: 'Create school rubric', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Create school rubric', exact: true });
  await editor.getByLabel('Course', { exact: true }).selectOption(course.id);
  await editor.getByLabel('Title', { exact: true }).fill('Explanation and checking');
  await editor.getByLabel('Criterion title', { exact: true }).fill('Explains the method');
  await editor.getByLabel('Level label', { exact: true }).fill('Developing');
  await editor.getByLabel('Level description', { exact: true }).fill('Explains a relevant step.');
  await expect(editor.getByLabel('Criterion key', { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Level key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh academic records', exact: true }).click(); await settled(page);
  await expect(editor.getByLabel('Criterion title', { exact: true })).toHaveValue('Explains the method');
  await expect(editor.getByLabel('Course', { exact: true })).toHaveValue(course.id);
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/rubrics' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const receipt = await saved; expect(receipt.ok()).toBe(true);
  const payload = receipt.request().postDataJSON();
  expect(payload.criteria[0]).toMatchObject({ title: 'Explains the method', levels: [{ label: 'Developing', description: 'Explains a relevant step.' }] });
  expect(payload.criteria[0].key).toBeTruthy(); expect(payload.criteria[0].levels[0].key).toBeTruthy();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await settled(page); await capture(page, '12-rubric-meaningful-authoring.png');
});

test('all roles use readable primary headings and selectors across current English and Arabic workspaces', async ({ page }) => {
  test.setTimeout(180000);
  const all = await accounts();
  const identifier = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const roles: CustomerRole[] = ['admin', 'teacher', 'student', 'parent', 'coordinator'];
  for (const role of roles) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await signIn(page, all.find(row => row.role === role)!);
    const navigation = page.getByRole('navigation'); const names = (await navigation.getByRole('button').allTextContents()).map(name => name.trim());
    expect(names, `${role} has current customer navigation`).toEqual(expect.arrayContaining(['Overview', 'Access details', 'Account']));
    for (const name of names) {
      await navigation.getByRole('button', { name, exact: true }).click(); await settled(page);
      const primary = await page.locator('main h1,main h2,main h3,main h4,main h5,main h6,main select option,main .school-table-scroll td').allTextContents();
      expect(primary.join(' '), `${role}/${name} English primary labels`).not.toMatch(identifier);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(navigation).toHaveAccessibleName('التنقّل في مساحة العمل');
    const destinations = names.map(name => {
      const destination = arabicDestinations[name];
      expect(destination, `Arabic primary-label expectation for ${role}/${name}`).toBeDefined();
      return destination;
    });
    await expect(navigation.getByRole('button')).toHaveText(destinations.map(destination => destination.label));
    for (const [index, name] of names.entries()) {
      const destination = destinations[index];
      const choice = navigation.getByRole('button', { name: destination.label, exact: true });
      await choice.click(); await settled(page);
      await expect(choice).toHaveAttribute('aria-current', 'page');
      await arabicPrimaryLabels(page, role, name, destination);
      await settled(page);
      const primary = await page.locator('main h1,main h2,main h3,main h4,main h5,main h6,main select option,main .school-table-scroll td').allTextContents();
      expect(primary.join(' '), `${role}/${name} Arabic primary labels`).not.toMatch(identifier);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}/${name} Arabic mobile overflow`).toBe(true);
    }
    await expect(page.getByRole('main').getByRole('button', { name: 'تسجيل الخروج', exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).last().click();
  }
});

test('a completed learning activity remains completed after leaving and reopening its course', async ({ page }) => {
  test.setTimeout(90000);
  const all = await accounts(); const teacherToken = await token(page, all.find(row => row.role === 'teacher')!);
  const title = `Checking practice ${new Date().toISOString()}`;
  const course = await command(page, teacherToken, '/v1/courses', { classId, subjectId, title, description: 'A source-backed learning practice.' });
  const unit = await command(page, teacherToken, `/v1/courses/${course.id}/units`, { title: 'Checking steps', sequence: 1 });
  const lesson = await command(page, teacherToken, `/v1/units/${unit.id}/lessons`, { title: 'Explain a check', sequence: 1, body: 'Work through your example and explain how you checked it.' });
  await command(page, teacherToken, `/v1/lessons/${lesson.id}/activities`, { title: 'Record your practice', sequence: 1, kind: 'practice', instructions: 'Complete a checking step.' });
  await command(page, teacherToken, `/v1/courses/${course.id}/publish`, {});
  await signIn(page, all.find(row => row.role === 'student')!); await page.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true }).click();
  const row = page.locator('.course-list > li').filter({ hasText: title }); await findPaged(page, row);
  await row.getByRole('button', { name: 'Open course', exact: true }).click();
  await page.getByRole('button', { name: 'Complete activity', exact: true }).click();
  await expect(page.getByText('Activity completion confirmed.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to courses', exact: true }).click(); await findPaged(page, row);
  await row.getByRole('button', { name: 'Open course', exact: true }).click();
  await expect(page.getByText('Activity completion confirmed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete activity', exact: true })).toHaveCount(0);
  await capture(page, '13-reopened-completed-practice.png');
});
