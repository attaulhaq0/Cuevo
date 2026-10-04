import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { curriculumLifecycleResponseSchema, curriculumProgrammeSchema, programmeLearnerPageSchema, objectivePlanSchema, markingInputSchema, decisionInputSchema } from '@cuevo/contracts';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; API_ALLOWED_ORIGIN: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Receipt = { id: string; command: string; schoolId: string; academicReferenceId: string | null };
type Version = { id: string; packId: string; kind: string; framework: string; programme: string; version: string; scope: string; sourceStatus: string; rightsStatus: string; sourceLocation: string; sourceChecksum: string | null; synthetic: boolean; reason: string };
type CurriculumReference = { id: string; packVersionId: string; parentId: string | null; type: string; title: string; code: string | null; sequence: number; subjectId: string | null; yearGroupId: string | null };
type Course = { id: string; title: string; classId: string; subjectId: string; curriculumContext: { version: number; programmeId: string | null; referenceId: string | null } };
type Objective = { id: string; academicReferenceId: string | null; title: string; description: string; parentTitle: string | null; approved: boolean; approvalReason: string | null; version: string };
type ObjectivePage = { version: number; scopeStatus: string; courseTitle: string; programmeName: string; packVersion: string; subjectName: string; yearGroupName: string; items: Objective[]; nextCursor: string | null };
type Approval = { id: string; courseId: string; academicReferenceId: string; version: number };
type AcademicReference = { id: string; title: string; description: string; parentTitle: string | null; version: string; status: string };
type PageResult<T> = { items: T[]; nextCursor: string | null };
type Role = 'admin' | 'coordinator' | 'teacher';
const root = resolve(import.meta.dirname, '../..');
const runtimePath = process.env.CUEVO_COORDINATOR_CURRICULUM_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122';

// Opt-in only: the execution config must omit webServer and use this exact
// synthetic runtime. Root owns build/service freezing and reference restoration.
// Browser plugin unavailable; the repository Playwright runner exercises real Auth/API.
test.describe('connected Coordinator curriculum source acceptance', () => {
  test.skip(!runtimePath, 'Requires the dedicated ignored runtime and an exact frozen build.');
  let runtime: Runtime, buildId: string, coordinator: Account, teacher: Account, admin: Account, learner: Account;
  const tokens: Record<string, string> = {};
  async function frozen() {
    expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim(), 'Root-owned frozen build').toBe(buildId);
  }
  function actor(role: Role) { return { admin, coordinator, teacher }[role]; }
  async function source<T>(role: Role, path: string): Promise<T> {
    if (!path.startsWith('/v1/')) throw new Error('Canonical current source route required.');
    const response = await fetch(api + path, { headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': actor(role).schoolId }, signal: AbortSignal.timeout(10_000) });
    expect(response.status, `${role} current source ${path}`).toBe(200);
    return response.json() as Promise<T>;
  }
  async function all<T>(role: Role, path: string): Promise<T[]> {
    const rows: T[] = []; let cursor: string | null = null;
    for (let index = 0; index < 10; index++) {
      const page: PageResult<T> = await source(role, `${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${cursor}` : ''}`);
      rows.push(...page.items); if (!page.nextCursor) return rows;
      expect(page.nextCursor).not.toBe(cursor); cursor = page.nextCursor;
    }
    throw new Error('Current source capacity requires review.');
  }
  test.beforeAll(async () => {
    const info = test.info();
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Only the dedicated ignored runtime is permitted.');
    if (info.project.use.baseURL !== base || info.config.webServer !== null) throw new Error('Use the isolated config without a webServer launcher.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (process.env.CUEVO_COORDINATOR_CURRICULUM_BUILD !== buildId) throw new Error('Freeze the exact isolated build.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.API_ALLOWED_ORIGIN !== base || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Isolated synthetic/provider/port guard failed.');
    function account(suffix: string, role: string) {
      const row = runtime.accounts.find(value => value.actorId.endsWith(suffix));
      if (!row || row.role !== role) throw new Error('Exact current isolated identity required.'); return row;
    }
    admin = account('001', 'admin'); coordinator = account('002', 'coordinator'); teacher = account('004', 'teacher'); learner = account('012', 'student');
    for (const role of ['admin', 'coordinator', 'teacher'] as const) {
      expect(actor(role).schoolId).toBe(learner.schoolId);
      const authClient = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await authClient.auth.signInWithPassword({ email: actor(role).email, password: actor(role).password });
      if (login.error || !login.data.session) throw new Error('Real isolated authentication unavailable.');
      tokens[role] = login.data.session.access_token;
    }
  });
  test.afterAll(async () => { if (buildId) await frozen(); });
  async function login(page: Page, account: Account) {
    await page.goto(base + '/?view=curriculum'); await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('.auth-submit').click();
    await expect(page.locator('.curriculum-workspace')).toBeVisible();
  }
  async function post(page: Page, path: string, button: Locator) {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST', { timeout: 15_000 });
    await button.click(); const response = await pending; expect(response.status(), path).toBe(200); return response.json();
  }
  async function healthy(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal viewport overflow').toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  }
  test('visible lifecycle, lost approval receipt, current learner decisions and Teacher source availability retain one exact source', async ({ page, browser }, info) => {
    test.setTimeout(180_000); page.setDefaultTimeout(10_000);
    const classId = '30000000-0000-4000-8000-000000000001', subjectId = '43000000-0000-4000-8000-000000000001', yearGroupId = '42000000-0000-4000-8000-000000000001';
    const suffix = randomUUID().slice(0, 8), packId = `school-connected-${suffix}`, version = 'school-checking-1';
    const recordedAt = new Date().toISOString(), recordedContext = recordedAt.replace('T', ' ').replace('Z', ' UTC');
    const programmeTitle = `School checking programme · ${recordedContext}`, sourceTitle = `School checking source · ${recordedContext}`, courseTitle = `Class checking course · ${recordedContext}`;
    const firstTitle = 'Explain a checking step', secondTitle = 'Review a checking step', subjectTitle = 'School mathematics';
    const reason = 'Reviewed this synthetic Year 1 school-authored hierarchy. Official curriculum and customer acceptance remain separate.';
    const commands: { role: Role; path: string; key: string; body: Record<string, unknown>; receipt?: unknown; retry?: boolean }[] = [];
    const errors: string[] = [], warnings: string[] = [], blocked: string[] = [], expectedTransportErrors: string[] = [];
    let sourceId: string | undefined, programmeId: string | undefined, periodId: string | undefined, courseId: string | undefined;
    let teacherPage: Page | undefined;
    let assignmentCreated = false, retired = false, approvalPath = '', lost: Approval | undefined;
    const approvalAttempts: { key: string | undefined; body: string | null }[] = [];
    async function persist() {
      const ledger = JSON.stringify({ buildId, recordedAt, synthetic: true, customerReady: false, sourceId, programmeId, courseId, periodId, commands, approvalAttempts, lost, assignmentCreated, retired, rootReferenceRestoreRequired: true }, null, 2);
      await writeFile(info.outputPath('own-source-ledger.json'), ledger);
      await writeFile(resolve(root, `.local/coordinator-curriculum-ledger-${suffix}.json`), ledger);
    }
    async function command<T>(role: Role, path: string, body: Record<string, unknown>, key = randomUUID()): Promise<T> {
      await frozen(); const record = { role, path, key, body, receipt: undefined as unknown, retry: false }; commands.push(record); await persist();
      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response;
        try {
          response = await fetch(api + path, { method: 'POST', headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': actor(role).schoolId, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
        } catch (error) { if (attempt === 1) throw error; record.retry = true; await persist(); continue; }
        expect(response.status, `${role} command ${path}`).toBe(200); const receipt = await response.json(); record.receipt = receipt; await persist(); return receipt as T;
      }
      throw new Error('Original-key command outcome requires source review.');
    }
    async function assignment(status: 'active' | 'revoked') {
      if (!programmeId) return;
      await command('coordinator', '/v1/curriculum/learners', { programmeId, learnerId: learner.actorId, status, confirmAccessChange: true });
      const current = programmeLearnerPageSchema.parse(await source('coordinator', `/v1/curriculum/programmes/${programmeId}/learners?limit=25`));
      expect(current.programme.id).toBe(programmeId); expect(current.items.find(row => row.learnerId === learner.actorId)).toMatchObject({ programmeId, learnerId: learner.actorId, status });
      return current;
    }
    async function cleanup() {
      if (programmeId) {
        const current = programmeLearnerPageSchema.parse(await source('coordinator', `/v1/curriculum/programmes/${programmeId}/learners?limit=25`));
        if (current.items.some(row => row.learnerId === learner.actorId)) await assignment('revoked');
      }
      if (periodId) {
        const period = (await all<{ id: string; revision: number; recordState: string }>('admin', '/v1/school/report-periods')).find(row => row.id === periodId);
        if (period) expect(await command('admin', `/v1/school/records/${periodId}/cancel`, { resource: 'report-periods', expectedRevision: period.revision, reason: 'Cancel only this isolated test-owned report period.', confirmChange: true })).toMatchObject({ id: periodId, recordState: 'CANCELLED', revision: period.revision + 1 });
        expect((await all<{ id: string }>('admin', '/v1/school/report-periods')).some(row => row.id === periodId)).toBe(false);
      }
      if (sourceId) {
        let current = curriculumLifecycleResponseSchema.parse(await source('coordinator', `/v1/curriculum/versions/${sourceId}/lifecycle?limit=25`));
        expect(current.openAssessmentCount).toBe(0);
        for (const state of ['APPROVED', 'ACTIVE', 'RETIRED'] as const) {
          if (current.state === 'RETIRED' || state === 'APPROVED' && current.state !== 'DRAFT' || state === 'ACTIVE' && current.state !== 'APPROVED') continue;
          const receipt = await command<{ id: string; state: string; revision: number; customerReady: boolean }>('coordinator', `/v1/curriculum/versions/${sourceId}/lifecycle`, { state, expectedRevision: current.revision, reviewBasis: 'SCHOOL_AUTHORED', artifactDirectory: null, replacementVersionId: null, reason: 'Withdraw only this test-owned synthetic source after bounded technical acceptance.', confirmTransition: true });
          expect(receipt).toMatchObject({ id: sourceId, state, revision: current.revision + 1, customerReady: false });
          current = curriculumLifecycleResponseSchema.parse(await source('coordinator', `/v1/curriculum/versions/${sourceId}/lifecycle?limit=25`));
        }
        expect(current).toMatchObject({ state: 'RETIRED', customerReady: false, configurationAllowed: false, retainedEvidenceAllowed: true, openAssessmentCount: 0 }); retired = true;
      }
      await persist();
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'warning') warnings.push(message.text());
      if (message.type() === 'error') {
        const location = message.location().url;
        if (lost && location === api + approvalPath && /net::ERR_FAILED/.test(message.text())) expectedTransportErrors.push(message.text()); else errors.push(message.text());
      }
    });
    await page.context().routeWebSocket('**/*', socket => socket.close());
    await page.context().route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      const owned = url.origin === api && request.method() === 'POST' && [approvalPath, sourceId ? `/v1/curriculum/versions/${sourceId}/lifecycle` : ''].includes(url.pathname);
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'OPTIONS'].includes(request.method()) && !auth && !owned) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      if (approvalPath && url.origin === api && url.pathname === approvalPath && request.method() === 'POST') {
        approvalAttempts.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (!lost) {
          const committed = await route.fetch({ timeout: 10_000 }); expect(committed.status()).toBe(200); lost = await committed.json() as Approval; await persist(); return route.abort('failed');
        }
      }
      return route.continue();
    });
    let primaryError: unknown;
    try {
      const classes = await all<{ id: string; name: string; yearGroupId: string; academicYearName: string }>('teacher', '/v1/classes');
      const selectedClass = classes.find(row => row.id === classId); expect(selectedClass).toMatchObject({ yearGroupId });
      const subjects = await all<{ id: string; name: string }>('teacher', '/v1/subjects'); expect(subjects.find(row => row.id === subjectId)).toBeDefined();
      const people = await all<{ id: string; displayName: string; synthetic: boolean; status: string }>('coordinator', '/v1/school/people');
      const learnerName = people.find(row => row.id === learner.actorId)?.displayName, approverName = people.find(row => row.id === coordinator.actorId)?.displayName;
      expect(learnerName).toEqual(expect.any(String)); expect(approverName).toEqual(expect.any(String));
      expect(people.find(row => row.id === learner.actorId)).toMatchObject({ synthetic: true, status: 'active' });
      const terms = await all<{ id: string; startsOn: string; endsOn: string }>('admin', '/v1/school/terms');
      const term = terms.find(row => row.startsOn <= '2026-10-04' && row.endsOn >= '2026-10-04'); if (!term) throw new Error('Current source-backed school term required.');
      const period = await command<{ id: string }>('admin', '/v1/school/report-periods', { termId: term.id, name: `School checking period · ${recordedContext}`, startsOn: term.startsOn, endsOn: term.endsOn, parentVisible: false }); periodId = period.id;
      const course = await command<Course>('teacher', '/v1/courses', { classId, subjectId, title: courseTitle, description: 'School-authored synthetic source checking only.' }); courseId = course.id;
      await command('teacher', `/v1/courses/${courseId}/publish`, {});
      const created = await command<Receipt>('coordinator', '/v1/curriculum/versions', { packId, kind: 'school_custom', framework: 'School Custom', programme: sourceTitle, version, scope: 'Synthetic Year 1 Mathematics checking only', sourceStatus: 'VERIFIED', rightsStatus: 'PERMITTED', sourceLocation: 'repo:tests/e2e/coordinator-connected-curriculum.spec.ts', sourceChecksum: null, synthetic: true, reason }); sourceId = created.id;
      const versionSource = (await all<Version>('coordinator', '/v1/curriculum/versions')).find(row => row.id === sourceId);
      expect(versionSource).toMatchObject({ id: sourceId, packId, version, framework: 'School Custom', programme: sourceTitle, scope: 'Synthetic Year 1 Mathematics checking only', kind: 'school_custom', sourceStatus: 'VERIFIED', rightsStatus: 'PERMITTED', synthetic: true, sourceLocation: 'repo:tests/e2e/coordinator-connected-curriculum.spec.ts', sourceChecksum: null, reason });
      async function reference(title: string, parentId: string | null, type: string, sequence: number, extra = {}) {
        return command<Receipt>('coordinator', '/v1/curriculum/references', { packVersionId: sourceId, parentId, type, title, description: `${title}: school-authored example only.`, code: null, sequence, subjectId: null, yearGroupId: null, ...extra });
      }
      const stage = await reference('School stage', null, 'stage', 1), year = await reference('School Year 1', stage.id, 'year', 1, { yearGroupId });
      const subject = await reference(subjectTitle, year.id, 'subject', 1, { subjectId });
      const first = await reference(firstTitle, subject.id, 'objective', 1), second = await reference(secondTitle, subject.id, 'objective', 2);
      const hierarchy = (await all<CurriculumReference>('coordinator', '/v1/curriculum/references')).filter(row => row.packVersionId === sourceId);
      expect(hierarchy).toHaveLength(5);
      for (const [id, parentId, type, sequence, expectedSubject, expectedYear] of [
        [stage.id, null, 'stage', 1, null, null], [year.id, stage.id, 'year', 1, null, yearGroupId],
        [subject.id, year.id, 'subject', 1, subjectId, null], [first.id, subject.id, 'objective', 1, null, null], [second.id, subject.id, 'objective', 2, null, null]
      ] as const) expect(hierarchy.find(row => row.id === id)).toMatchObject({ packVersionId: sourceId, parentId, type, sequence, code: null, subjectId: expectedSubject, yearGroupId: expectedYear });
      expect(curriculumLifecycleResponseSchema.parse(await source('coordinator', `/v1/curriculum/versions/${sourceId}/lifecycle?limit=25`))).toMatchObject({ versionId: sourceId, state: 'DRAFT', revision: 1, customerReady: false });
      await login(page, coordinator);
      const record = page.locator('.curriculum-record').filter({ has: page.getByRole('heading', { name: `School Custom · ${sourceTitle}`, exact: true }) }); await expect(record).toBeVisible();
      await record.getByRole('button', { name: 'Source availability and history', exact: true }).focus(); await record.getByRole('button', { name: 'Source availability and history', exact: true }).press('Enter');
      await expect(record).toContainText('Awaiting school source review');
      for (const [label, state, revision] of [['School source reviewed', 'APPROVED', 2], ['Available for school configuration', 'ACTIVE', 3]] as const) {
        await record.getByLabel('Next source state', { exact: true }).selectOption({ label });
        const form = record.getByRole('region', { name: 'Confirm source transition', exact: true });
        await expect(form.getByLabel('I reviewed the source and affected school work and approve this transition', { exact: true })).not.toBeChecked();
        await form.getByLabel('Reason for reviewed source transition', { exact: true }).fill(reason);
        await form.getByLabel('I reviewed the source and affected school work and approve this transition', { exact: true }).check();
        expect(await post(page, `/v1/curriculum/versions/${sourceId}/lifecycle`, form.getByRole('button', { name: 'Confirm source transition', exact: true }))).toMatchObject({ id: sourceId, state, revision, customerReady: false });
        await expect(form).toHaveCount(0); await expect(record).toContainText(label);
      }
      await record.locator('details').filter({ has: page.locator('summary').getByText('Local source location / provenance', { exact: true }) }).locator('summary').click();
      await expect(record).toContainText('repo:tests/e2e/coordinator-connected-curriculum.spec.ts');
      await healthy(page); await record.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('source-active-en1366.png') });
      const programme = await command<Receipt>('coordinator', '/v1/curriculum/programmes', { packVersionId: sourceId, name: programmeTitle, classId, subjectId, yearGroupId, confirmConfiguration: true }); programmeId = programme.id;
      const currentProgramme = curriculumProgrammeSchema.parse((await all('coordinator', '/v1/curriculum/programmes')).find((row) => (row as { id: string }).id === programmeId));
      expect(currentProgramme).toMatchObject({ id: programmeId, packVersionId: sourceId, classId, subjectId, yearGroupId, packVersion: version, name: programmeTitle, className: selectedClass!.name });
      const binding = await command<Receipt>('coordinator', `/v1/curriculum/courses/${courseId}`, { programmeId, referenceId: first.id, expectedVersion: 1, confirmConfiguration: true });
      const boundCourse = await source<Course>('coordinator', `/v1/courses/${courseId}?limit=1`); expect(boundCourse).toMatchObject({ id: courseId, classId, subjectId, title: courseTitle, curriculumContext: { programmeId, referenceId: first.id, version: 1 } });
      expect(await source<Course>('teacher', `/v1/courses/${courseId}?limit=1`)).toMatchObject({ id: courseId, classId, subjectId, title: courseTitle });
      expect(binding.academicReferenceId).not.toBe(first.id);
      await assignment('active'); assignmentCreated = true;
      await page.locator('.curriculum-workspace__navigation').getByRole('button', { name: 'Refresh curriculum context', exact: true }).click();
      await page.getByRole('button', { name: 'Course assessment objectives', exact: true }).click(); await page.locator('#curriculum-course').selectOption(courseId);
      const objectives = page.getByRole('region', { name: 'Course assessment objectives', exact: true });
      const candidate = objectives.locator('article').filter({ has: page.getByRole('heading', { name: secondTitle, exact: true }) }); await expect(candidate).toBeVisible(); await expect(candidate).toContainText(subjectTitle);
      const before = await source<ObjectivePage>('coordinator', `/v1/curriculum/courses/${courseId}/objectives?limit=25`);
      expect(before).toMatchObject({ scopeStatus: 'READY', version: 1, courseTitle, programmeName: programmeTitle, packVersion: version });
      expect(before.items.find(row => row.id === second.id)).toMatchObject({ approved: false, academicReferenceId: null, parentTitle: subjectTitle, version });
      await candidate.getByRole('button', { name: 'Approve for this course', exact: true }).focus(); await candidate.getByRole('button', { name: 'Approve for this course', exact: true }).press('Enter');
      const approve = objectives.getByRole('region', { name: 'Approve for this course', exact: true }); await expect(approve).toBeFocused();
      await approve.getByLabel('Why this objective belongs in this course', { exact: true }).fill(reason); await approve.getByLabel('I approve this objective for the course subject and year', { exact: true }).check();
      approvalPath = `/v1/curriculum/courses/${courseId}/objectives`;
      await approve.getByRole('button', { name: 'Approve for this course', exact: true }).click();
      await expect(approve.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible();
      await expect(approve.getByLabel('Why this objective belongs in this course', { exact: true })).toBeDisabled();
      await expect(candidate).toContainText('Awaiting course approval');
      expect(lost).toMatchObject({ id: second.id, courseId, version: 2 }); expect(lost!.academicReferenceId).not.toBe(second.id);
      const committed = await source<ObjectivePage>('teacher', approvalPath + '?limit=25'); expect(committed.version).toBe(2);
      expect(committed.items.filter(row => row.id === second.id)).toHaveLength(1);
      expect(committed.items.find(row => row.id === second.id)).toMatchObject({ academicReferenceId: lost!.academicReferenceId, approved: true, approvalReason: reason, version });
      expect(await post(page, approvalPath, approve.getByRole('button', { name: 'Retry the same action', exact: true }))).toEqual(lost);
      expect(approvalAttempts).toHaveLength(2); expect(approvalAttempts[1]).toEqual(approvalAttempts[0]); expect(approvalAttempts[0].key).toEqual(expect.any(String));
      expect(JSON.parse(approvalAttempts[0].body!)).toEqual({ referenceId: second.id, expectedVersion: 1, reason, confirmConfiguration: true });
      await expect(candidate).toContainText('Approved for course assessments'); await expect(objectives.getByRole('heading', { name: 'Course assessment objectives', exact: true })).toBeFocused();
      const teacherReferences = await all<AcademicReference>('teacher', `/v1/courses/${courseId}/academic-references`);
      expect(teacherReferences.filter(row => row.id === lost!.academicReferenceId)).toHaveLength(1);
      expect(teacherReferences.find(row => row.id === lost!.academicReferenceId)).toMatchObject({ title: secondTitle, parentTitle: subjectTitle, version, status: 'APPROVED' });
      await healthy(page); await objectives.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('objective-confirmed-en1366.png') });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
        const arabicCandidate = page.locator('.curriculum-course-review article').filter({ has: page.getByRole('heading', { name: secondTitle, exact: true }) });
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(arabicCandidate).toContainText('معتمد لتقييمات المقرر'); await healthy(page);
        await arabicCandidate.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`objective-confirmed-ar${width}.png`) });
      }
      await page.getByRole('button', { name: 'English', exact: true }).click(); await page.setViewportSize({ width: 1366, height: 768 });
      await page.locator('.curriculum-workspace__editor-heading').getByRole('button', { name: 'Close planning action', exact: true }).click();
      await page.locator('.curriculum-workspace__navigation').getByRole('button', { name: 'School programmes', exact: true }).click();
      const programmeRecord = page.locator('.curriculum-record').filter({ has: page.getByRole('heading', { name: programmeTitle, exact: true }) });
      await programmeRecord.getByRole('button', { name: 'View current learner assignments', exact: true }).focus(); await programmeRecord.getByRole('button', { name: 'View current learner assignments', exact: true }).press('Enter');
      const assignments = programmeRecord.getByRole('region', { name: 'Current programme learner assignments', exact: true });
      await expect(assignments.getByRole('heading', { name: 'Current programme learner assignments', exact: true })).toBeFocused();
      const learnerRecord = assignments.locator('article').filter({ has: page.getByRole('heading', { name: learnerName!, exact: true }) }); await expect(learnerRecord).toContainText('Active'); await expect(learnerRecord).toContainText(approverName!);
      await assignment('revoked'); await assignments.getByRole('button', { name: 'Refresh programme assignments', exact: true }).click(); await expect(learnerRecord).toContainText('Revoked');
      expect(programmeLearnerPageSchema.parse(await source('teacher', `/v1/curriculum/programmes/${programmeId}/learners?limit=25`)).items.find(row => row.learnerId === learner.actorId)).toMatchObject({ status: 'revoked', programmeId });
      await healthy(page); await assignments.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('assignment-revoked-en1366.png') });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await page.getByRole('button', { name: 'العربية', exact: true }).click();
        const currentAssignment = page.locator('.curriculum-programme-learners article').filter({ has: page.getByRole('heading', { name: learnerName!, exact: true }) });
        await expect(currentAssignment).toContainText('ملغى'); await healthy(page); await currentAssignment.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`assignment-revoked-ar${width}.png`) });
      }
      const marking = (await source<PageResult<{ id: string; policyVersion: number; currentResult: { revision: number } | null }>>('teacher', '/v1/marking?limit=25')).items[0];
      const recommendation = (await source<PageResult<{ id: string }>>('teacher', '/v1/recommendations?limit=25')).items[0];
      if (!marking || !recommendation) throw new Error('Existing current native marking and proposal source required for deny tests.');
      const denials = [
        { path: `/v1/curriculum/courses/${courseId}/plans`, body: objectivePlanSchema.parse({ periodId, expectedPeriodRevision: 1, referenceId: lost!.academicReferenceId, reason, confirmPlanning: true }) },
        { path: `/v1/submissions/${marking.id}/results`, body: markingInputSchema.parse({ score: 1, feedback: 'This Coordinator request must be denied.', expectedPolicyVersion: marking.policyVersion, expectedRevision: marking.currentResult?.revision ?? 0, sourceEvidence: true }) },
        { path: `/v1/recommendations/${recommendation.id}/decision`, body: decisionInputSchema.parse({ decision: 'REJECT', reason: 'This Coordinator request must be denied.' }) }
      ];
      for (const denial of denials) {
        const response = await fetch(api + denial.path, { method: 'POST', headers: { Authorization: `Bearer ${tokens.coordinator}`, 'x-school-id': coordinator.schoolId, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(denial.body), signal: AbortSignal.timeout(10_000) });
        expect(response.status, `Coordinator role denial ${denial.path}`).toBe(403); expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
      }
      expect((await source<PageResult<{ id: string }>>('teacher', '/v1/marking?limit=25')).items.find(row => row.id === marking.id)).toEqual(marking);
      expect((await source<PageResult<{ id: string }>>('teacher', '/v1/recommendations?limit=25')).items.find(row => row.id === recommendation.id)).toEqual(recommendation);
      const teacherContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
      teacherPage = await teacherContext.newPage(); teacherPage.setDefaultTimeout(10_000);
      teacherPage.on('pageerror', error => errors.push(error.message)); teacherPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
      await teacherPage.context().routeWebSocket('**/*', socket => socket.close());
      await teacherPage.context().route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
        if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !['GET', 'OPTIONS'].includes(request.method()) && !auth) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
        return route.continue();
      });
      await login(teacherPage, teacher); await teacherPage.getByRole('button', { name: 'Planning and recorded coverage', exact: true }).click();
      const planning = teacherPage.getByRole('region', { name: 'Planning and recorded coverage', exact: true }); await planning.locator('#planning-course').selectOption(courseId); await planning.locator('#planning-period').selectOption(periodId);
      await planning.getByRole('button', { name: 'Plan approved objective', exact: true }).click();
      const choice = planning.getByLabel('Reference', { exact: true });
      await expect(choice.locator(`option[value="${lost!.academicReferenceId}"]`)).toHaveText(`${secondTitle} · ${subjectTitle} · ${version}`); await choice.selectOption(lost!.academicReferenceId); await expect(choice).toHaveValue(lost!.academicReferenceId);
      await healthy(teacherPage); await choice.scrollIntoViewIfNeeded(); await teacherPage.screenshot({ path: info.outputPath('teacher-approved-objective-en1366.png') });
      await expect(planning.getByLabel('I confirm this approved objective is planned for this period', { exact: true })).not.toBeChecked();
      for (const width of [390, 320]) {
        await teacherPage.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await teacherPage.getByRole('button', { name: 'العربية', exact: true }).click();
        const currentChoice = teacherPage.locator('.curriculum-planning select[name="referenceId"]'); await expect(currentChoice).toHaveValue(lost!.academicReferenceId);
        await expect(teacherPage.locator('html')).toHaveAttribute('dir', 'rtl'); await healthy(teacherPage); await currentChoice.scrollIntoViewIfNeeded(); await teacherPage.screenshot({ path: info.outputPath(`teacher-approved-objective-ar${width}.png`) });
      }
      expect((await source<ObjectivePage>('teacher', approvalPath + '?limit=25')).version).toBe(2);
      expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(blocked).toEqual([]); expect(expectedTransportErrors).toHaveLength(1);
      await info.attach('source-facts', { body: JSON.stringify({ buildId, sources: ['18', '05', '06', '07', '26', '39', '43', '63', '69', '76', '85'], currentClass: selectedClass!.name, learnerName, approverName, sourceId, programmeId, courseId, firstReferenceId: first.id, secondReferenceId: second.id, academicReferenceId: lost!.academicReferenceId, sourceVersion: version, lifecycle: 'DRAFT1 → APPROVED2 → ACTIVE3', sourceStatus: 'VERIFIED', rightsStatus: 'PERMITTED', synthetic: true, customerReady: false, receiptRecovery: 'Actual API commit followed by interrupted browser receipt; identical original key/body retry; identical generated academic source', learnerDecision: 'active → revoked; Coordinator and Teacher current readback', teacherAvailability: 'Exact approved source selected in unsent planning form', roleDenials: denials.map(row => ({ path: row.path, status: 403 })), academicSubmissions: 0, grades: 0, modelCalls: 0, viewports: ['en1366', 'ar390', 'ar320'], rootReferenceRestoreRequired: true }, null, 2), contentType: 'application/json' });
    } catch (error) { primaryError = error; }
    test.setTimeout(info.timeout + 60_000);
    let cleanupError: unknown;
    try { await cleanup(); } catch (error) { cleanupError = error; await persist(); }
    await teacherPage?.context().close();
    if (primaryError && cleanupError) throw new AggregateError([primaryError, cleanupError], 'Curriculum acceptance and test-owned source cleanup failed; root reference restore required.');
    if (primaryError) throw primaryError; if (cleanupError) throw cleanupError;
  });
});
