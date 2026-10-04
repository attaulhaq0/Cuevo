import { test, expect, type Browser, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { conversationChoiceSchema, conversationResponseSchema, conversationMessageResponseSchema } from '@cuevo/contracts';

type Account = { actorId: string; schoolId: string; role: string; email: string; password: string };
type Runtime = { config: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; DATABASE_URL: string; API_PORT: string; AI_GENERATION_MODE: string }; accounts: Account[] };
type Choice = ReturnType<typeof conversationChoiceSchema.parse>;
type Thread = ReturnType<typeof conversationResponseSchema.parse>;
type Message = ReturnType<typeof conversationMessageResponseSchema.parse>;
type PageResult<T> = { items: T[]; nextCursor: string | null };
const root = resolve(import.meta.dirname, '../..'), runtimePath = process.env.CUEVO_PARENT_CONVERSATION_ISOLATED_RUNTIME;
const base = 'http://127.0.0.1:54121', api = 'http://127.0.0.1:54122', path = '/v1/community/conversations';
const exclusiveRevocation = process.env.CUEVO_PARENT_CONVERSATION_EXCLUSIVE_REVOCATION === '1';

// The ignored execution config must have no webServer. Root owns policy setup,
// runtime services and the exclusive relationship-revocation window.
test.describe('isolated actual Parent conversation acceptance', () => {
  test.skip(!runtimePath, 'Requires the separate synthetic runtime and frozen build.');
  let runtime: Runtime, buildId: string, accounts: Record<string, Account>, tokens: Record<string, string>, choice: Choice;

  async function request<T>(role: string, route: string, body?: Record<string, unknown>, key: string = randomUUID(), expected = 200): Promise<T> {
    if (!route.startsWith('/v1/') || new URL(api).port !== '54122') throw new Error('Isolated source route required.');
    const reply = await fetch(api + route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, 'x-school-id': accounts[role].schoolId, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
    expect(reply.status, `Isolated ${role} ${route} status`).toBe(expected);
    return await reply.json() as T;
  }
  async function all<T>(role: string, route: string): Promise<T[]> {
    const rows: T[] = []; let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const result: PageResult<T> = await request(role, `${route}${route.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${cursor}` : ''}`);
      rows.push(...result.items); if (!result.nextCursor) return rows; expect(result.nextCursor).not.toBe(cursor); cursor = result.nextCursor;
    }
    throw new Error('Current isolated page capacity requires review.');
  }
  test.beforeAll(async () => {
    if (!runtimePath || resolve(runtimePath) !== resolve(root, '.local/bloom-runtime/runtime.json')) throw new Error('Dedicated ignored runtime path required.');
    buildId = (await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
    if (!process.env.CUEVO_PARENT_CONVERSATION_BUILD || process.env.CUEVO_PARENT_CONVERSATION_BUILD !== buildId) throw new Error('Exact frozen isolated web build required.');
    runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as Runtime;
    const auth = new URL(runtime.config.SUPABASE_URL), db = new URL(runtime.config.DATABASE_URL);
    if (auth.hostname !== '127.0.0.1' || auth.port !== '57421' || db.hostname !== '127.0.0.1' || db.port !== '57422' || runtime.config.API_PORT !== '54122' || runtime.config.AI_GENERATION_MODE !== 'DISABLED' || runtime.accounts.length !== 133) throw new Error('Isolated synthetic/provider boundary failed.');
    accounts = {}; tokens = {};
    for (const [role, suffix] of Object.entries({ parent: '072', teacher: '004', student: '012', peerParent: '073', admin: '001' })) {
      const account = runtime.accounts.find(value => value.actorId.endsWith(suffix));
      if (!account || account.role !== (role === 'peerParent' ? 'parent' : role)) throw new Error('Current isolated actor unavailable.');
      accounts[role] = account;
      const client = createClient(runtime.config.SUPABASE_URL, runtime.config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (signedIn.error || !signedIn.data.session) throw new Error('Isolated actor authentication unavailable.');
      tokens[role] = signedIn.data.session.access_token;
    }
    expect(new Set(Object.values(accounts).map(account => account.schoolId)).size).toBe(1);
    const policy = await request<{ enabled: boolean; version: number }>('parent', `${path}/policy`);
    if (!policy.enabled) throw new Error('Root must approve current conversation policy before connected acceptance.');
    const choices = (await all<unknown>('parent', `${path}/choices?learnerId=${accounts.student.actorId}`)).map(value => conversationChoiceSchema.parse(value));
    const matches = choices.filter(value => value.learnerId === accounts.student.actorId && value.teacherId === accounts.teacher.actorId && value.parentId === accounts.parent.actorId);
    expect(matches, 'Exactly one actual child/class/subject Teacher tuple required').toHaveLength(1); choice = matches[0];
  });
  test.afterAll(async () => { if (buildId) expect((await readFile(resolve(root, 'apps/web/.next/BUILD_ID'), 'utf8')).trim()).toBe(buildId); });

  async function openPage(browser: Browser, role: string) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors: string[] = [], warnings: string[] = [], blocked: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), read = ['GET', 'OPTIONS'].includes(request.method());
      const auth = url.origin === runtime.config.SUPABASE_URL && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method() === 'POST';
      const conversation = [base, api].includes(url.origin) && request.method() === 'POST' && url.pathname.startsWith(path) && url.pathname !== `${path}/policy`;
      if (![base, api, runtime.config.SUPABASE_URL].includes(url.origin) || !read && !auth && !conversation) { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    try {
      await page.goto(`${base}/?view=community`); await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.locator('#email').fill(accounts[role].email); await page.locator('#password').fill(accounts[role].password); await page.locator('.auth-submit').click();
      await expect(page.locator('.community-workspace')).toBeVisible();
      await page.locator('.community-workspace > .learning-toolbar').getByRole('button', { name: 'Parent and teacher conversations', exact: true }).click();
      const panel = page.locator('.conversation-workspace'); await expect(panel).toBeVisible();
      if (role === 'parent') { await panel.locator('.parent-conversation-child select').selectOption(accounts.student.actorId); await expect(panel.getByRole('button', { name: 'Start a school conversation', exact: true })).toBeEnabled(); }
      return { page, context, errors, warnings, blocked, panel };
    } catch (error) { await context.close(); throw error; }
  }
  function posted(page: Page, route: string) { return page.waitForResponse(reply => [base, api].includes(new URL(reply.url()).origin) && new URL(reply.url()).pathname === route && reply.request().method() === 'POST', { timeout: 10_000 }); }
  async function openThread(page: Page, title: string) {
    const panel = page.locator('.conversation-workspace');
    const row = panel.locator('.conversation-list-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    for (let count = 0; count < 10 && !await row.count(); count++) {
      const more = panel.getByRole('button', { name: 'Load more', exact: true }).last(); if (!await more.count()) break;
      await more.click(); await expect(panel.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
    }
    await expect(row).toBeVisible(); const opener = row.getByRole('button', { name: 'Open conversation', exact: true }); await opener.focus(); await opener.press('Enter');
    const thread = page.locator('.conversation-thread'); await expect(thread.locator('h2')).toHaveText(title); await expect(thread.locator('h2')).toBeFocused();
    return thread;
  }
  async function messageRow(thread: Locator, body: string) { const row = thread.locator('.conversation-message').filter({ has: thread.page().getByText(body, { exact: true }) }); await expect(row).toBeVisible(); return row; }
  async function healthy(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  }

  test('actual child conversation, recipient read, concern and original-key recovery remain private', async ({ browser }, info) => {
    test.setTimeout(90_000);
    const parent = await openPage(browser, 'parent'); let teacherSession: Awaited<ReturnType<typeof openPage>> | undefined;
    const title = `Checking one learning step ${randomUUID().slice(0, 8)}`, question = 'Which checking step from the school example should we review together?', replyText = 'Compare one step with the school example and ask for the reason.', followUp = 'We will review that step with the school example.', reason = 'Please have the school review the clarity of this learning explanation.';
    const facts: Record<string, unknown> = { buildId, currentChildren: 1, childSwitchScope: 'Injected unavailable selection then restore existing child; no second approved child or new relationship', interceptedReceipt: 'One actual committed send receipt has an invalid sender in browser response only.' };
    try {
      const teacher = teacherSession = await openPage(browser, 'teacher');
      await parent.panel.getByRole('button', { name: 'Start a school conversation', exact: true }).click();
      const composer = parent.panel.locator('.conversation-create'); await expect(composer.locator('select')).toBeEnabled(); await composer.locator('select').selectOption(choice.id);
      const create = composer.getByRole('region', { name: 'Start a school conversation', exact: true });
      await create.getByLabel('Conversation topic').fill(title); await create.getByLabel('Your message').fill(question);
      const created = posted(parent.page, path); await create.getByRole('button', { name: 'Send message', exact: true }).click();
      const creation = await created; expect(creation.status()).toBe(200);
      const thread = conversationResponseSchema.parse(await creation.json());
      expect(thread).toMatchObject({ learnerId: choice.learnerId, parentId: choice.parentId, teacherId: choice.teacherId, classId: choice.classId, subjectId: choice.subjectId, title, canModerate: false });
      expect(creation.request().postDataJSON()).toEqual({ learnerId: choice.learnerId, parentId: choice.parentId, teacherId: choice.teacherId, classId: choice.classId, subjectId: choice.subjectId, title, body: question });
      let parentThread = parent.page.locator('.conversation-thread'); await expect(parentThread.locator('h2')).toHaveText(title); await messageRow(parentThread, question);
      const createKey = creation.request().headers()['idempotency-key']; expect(createKey).toBeTruthy();
      const initial = (await all<Message>('teacher', `${path}/${thread.id}/messages`)).map(value => conversationMessageResponseSchema.parse(value));
      expect(initial).toHaveLength(1); expect(initial[0]).toMatchObject({ conversationId: thread.id, body: question, senderId: accounts.parent.actorId, recipientReadAt: null, delivery: 'DELIVERED_IN_APP' });
      await request('peerParent', `${path}/${thread.id}/messages?limit=100`, undefined, undefined, 403);
      await request('student', `${path}/${thread.id}/messages?limit=100`, undefined, undefined, 403);
      const adminBefore = await all<Message>('admin', `${path}/${thread.id}/messages`); expect(adminBefore).toHaveLength(0);

      await teacher.panel.getByRole('button', { name: 'Refresh conversations', exact: true }).first().click();
      const teacherThread = await openThread(teacher.page, title), incoming = await messageRow(teacherThread, question);
      const teacherRead = posted(teacher.page, `${path}/messages/${initial[0].id}/read`);
      await incoming.getByRole('button', { name: 'Confirm I read this message', exact: true }).click(); expect((await teacherRead).status()).toBe(200);
      const teacherForm = teacherThread.getByRole('region', { name: 'Send message', exact: true }); await teacherForm.getByLabel('Your message').fill(replyText);
      const sent = posted(teacher.page, `${path}/${thread.id}/messages`); await teacherForm.getByRole('button', { name: 'Send message', exact: true }).click();
      const send = await sent; expect(send.status()).toBe(200); const reply = conversationMessageResponseSchema.parse(await send.json());
      expect(reply).toMatchObject({ conversationId: thread.id, senderId: accounts.teacher.actorId, body: replyText, recipientReadAt: null });
      await parentThread.getByRole('button', { name: 'Refresh conversations', exact: true }).click();
      const incomingReply = await messageRow(parentThread, replyText), read = posted(parent.page, `${path}/messages/${reply.id}/read`);
      await incomingReply.getByRole('button', { name: 'Confirm I read this message', exact: true }).click(); expect((await read).status()).toBe(200);
      await expect(incomingReply.getByText('Recipient confirmed reading', { exact: true })).toBeVisible();
      await incomingReply.getByRole('button', { name: 'Report a message concern', exact: true }).click();
      const reportForm = parentThread.getByRole('region', { name: 'Report a message concern', exact: true }); await reportForm.getByLabel('Reason').fill(reason);
      const reported = posted(parent.page, `${path}/messages/${reply.id}/report`); await reportForm.getByRole('button', { name: 'Save', exact: true }).click(); expect((await reported).status()).toBe(200);
      const reports = await all<{ messageId: string; reason: string }>('teacher', `${path}/${thread.id}/reports`); expect(reports).toHaveLength(1); expect(reports[0]).toMatchObject({ messageId: reply.id, reason });
      const adminAfter = await all<Message>('admin', `${path}/${thread.id}/messages`); expect(adminAfter).toHaveLength(1); expect(adminAfter[0].id).toBe(reply.id);

      const sendPath = `${path}/${thread.id}/messages`, sendPattern = `**${sendPath}`;
      let firstKey: string | undefined, firstBody: unknown, corrupt = true;
      await parent.page.route(sendPattern, async route => {
        if (route.request().method() !== 'POST') return route.continue();
        firstKey ??= route.request().headers()['idempotency-key']; firstBody ??= route.request().postDataJSON();
        const actual = await route.fetch(); expect(actual.status()).toBe(200);
        if (corrupt) { corrupt = false; const committed = conversationMessageResponseSchema.parse(await actual.json()); await route.fulfill({ response: actual, json: { ...committed, senderId: accounts.peerParent.actorId } }); }
        else await route.fulfill({ response: actual });
      });
      let parentForm = parentThread.getByRole('region', { name: 'Send message', exact: true }); await parentForm.getByLabel('Your message').fill(followUp);
      const uncertain = posted(parent.page, sendPath); await parentForm.getByRole('button', { name: 'Send message', exact: true }).click(); expect((await uncertain).status()).toBe(200);
      await expect(parentForm.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible(); await expect(parentForm.getByLabel('Your message')).toBeDisabled();
      const committed = await all<Message>('parent', `${path}/${thread.id}/messages`); expect(committed.filter(message => message.body === followUp)).toHaveLength(1);
      const unavailableChild = runtime.accounts.find(account => account.role === 'student' && account.actorId.endsWith('013'));
      expect(unavailableChild, 'Existing different pupil used only as unavailable selection required').toBeTruthy();
      // The real account has one approved child, so clearing defaults to that child.
      // Injecting an unavailable option tests browser scope cancellation without granting a second relationship.
      await parent.panel.locator('.parent-conversation-child select').evaluate((select, value) => { const option = document.createElement('option'); option.value = value; option.textContent = 'Unavailable selection test'; select.append(option); }, unavailableChild!.actorId);
      await parent.panel.locator('.parent-conversation-child select').selectOption(unavailableChild!.actorId);
      await expect(parent.panel.getByRole('heading', { name: 'Original conversation context', exact: true })).toBeVisible();
      await expect(parent.page.locator('.conversation-thread')).toHaveCount(0); await expect(parent.panel.getByText(followUp, { exact: true })).toHaveCount(0);
      await parent.panel.locator('.parent-conversation-child select').selectOption(accounts.student.actorId);
      parentThread = parent.page.locator('.conversation-thread'); await expect(parentThread.locator('h2')).toHaveText(title);
      parentForm = parentThread.getByRole('region', { name: 'Send message', exact: true }); await expect(parentForm.getByLabel('Your message')).toHaveValue(followUp);
      const retried = posted(parent.page, sendPath); await parentForm.getByRole('button', { name: 'Retry the same action', exact: true }).click(); const retry = await retried;
      expect(retry.status()).toBe(200); expect(retry.request().headers()['idempotency-key']).toBe(firstKey); expect(retry.request().postDataJSON()).toEqual(firstBody);
      await parent.page.unroute(sendPattern); const finalMessages = await all<Message>('parent', `${path}/${thread.id}/messages`); expect(finalMessages.filter(message => message.body === followUp)).toHaveLength(1);
      await expect(parentThread.getByRole('button', { name: 'Retry the same action', exact: true })).toHaveCount(0);
      let releaseRead!: () => void, observedRead!: () => void, completedRead!: (state: string) => void;
      const held = new Promise<void>(resolveHeld => { releaseRead = resolveHeld; });
      const started = new Promise<void>(resolveStarted => { observedRead = resolveStarted; });
      const completed = new Promise<string>(resolveCompleted => { completedRead = resolveCompleted; });
      const messageReadPattern = `**${sendPath}?limit=100`;
      await parent.page.route(messageReadPattern, async route => {
        const actual = await route.fetch(); expect(actual.status()).toBe(200); observedRead(); await held;
        try { await route.fulfill({ response: actual }); completedRead('fulfilled'); }
        catch (error) { if (/already handled|closed|cancelled|canceled|aborted/i.test(String(error))) completedRead('cancelled-after-selection'); else throw error; }
      });
      await parentThread.getByRole('button', { name: 'Refresh conversations', exact: true }).click();
      await started;
      await parent.panel.locator('.parent-conversation-child select').evaluate((select, value) => { const option = document.createElement('option'); option.value = value; option.textContent = 'Unavailable selection test'; select.append(option); }, unavailableChild!.actorId);
      await parent.panel.locator('.parent-conversation-child select').selectOption(unavailableChild!.actorId);
      releaseRead();
      facts.delayedReadCompletion = await completed;
      await parent.page.evaluate(() => new Promise<void>(resolveSettled => requestAnimationFrame(() => requestAnimationFrame(() => resolveSettled()))));
      await expect(parent.page.locator('.conversation-thread')).toHaveCount(0);
      await expect(parent.panel.getByText(replyText, { exact: true })).toHaveCount(0);
      await parent.page.unroute(messageReadPattern);
      await parent.panel.locator('.parent-conversation-child select').selectOption(accounts.student.actorId);
      parentThread = parent.page.locator('.conversation-thread'); await expect(parentThread.locator('h2')).toHaveText(title); await messageRow(parentThread, followUp);
      const replayCreate = await request<Thread>('parent', path, creation.request().postDataJSON(), createKey); expect(replayCreate.id).toBe(thread.id);
      const invalidTuple = { ...creation.request().postDataJSON(), parentId: accounts.peerParent.actorId };
      await request('parent', path, invalidTuple, undefined, 403);

      await healthy(parent.page); await info.attach('parent-en-connected', { body: await parent.page.screenshot({ fullPage: true }), contentType: 'image/png' });
      for (const width of [390, 320]) {
        await parent.page.setViewportSize({ width, height: width === 390 ? 844 : 568 }); await parent.page.getByRole('button', { name: 'العربية', exact: true }).click();
        await expect(parent.page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(parentThread.locator('h2')).toHaveText(title);
        await healthy(parent.page); await info.attach(`parent-ar-${width}-connected`, { body: await parent.page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
      await request('teacher', `${path}/messages/${reply.id}/moderate`, { action: 'HIDE', expectedVersion: reply.moderationVersion, reason: 'Review the reported wording in this isolated school exchange.', confirmModeration: true });
      const current = await request<Thread>('teacher', `${path}/${thread.id}`); await request('teacher', `${path}/${thread.id}/state`, { state: 'PAUSED', expectedVersion: current.stateVersion, reason: 'Pause this isolated conversation after the concern review.', confirmModeration: true });
      await parentThread.getByRole('button', { name: 'تحديث المحادثات', exact: true }).click();
      await expect(parentThread.getByText(replyText, { exact: true })).toHaveCount(0); await expect(parentThread.getByText('أخفت المدرسة هذه الرسالة للمراجعة.', { exact: true })).toBeVisible();
      await expect(parentThread.getByRole('region', { name: 'إرسال الرسالة', exact: true })).toHaveCount(0);
      const hidden = (await all<Message>('parent', `${path}/${thread.id}/messages`)).find(message => message.id === reply.id)!; expect(hidden).toMatchObject({ body: null, status: 'HIDDEN' });
      await request('parent', `${path}/${thread.id}/messages`, { body: 'This paused send must be denied.' }, undefined, 403);
      facts.actualCreate = true; facts.actualRecipientRead = true; facts.actualReport = true; facts.actualSingleSendAfterRetry = true; facts.delayedPriorSelectionReadWithheld = true; facts.peerAndStudentDenied = true; facts.reportedOnlyAdmin = true; facts.hiddenAndPaused = true;
      await info.attach('scope-and-results', { body: JSON.stringify(facts, null, 2), contentType: 'application/json' });
    } finally {
      await Promise.allSettled([parent.context.close(), teacherSession?.context.close()]);
      expect(parent.blocked).toEqual([]); expect(teacherSession?.blocked ?? []).toEqual([]); expect(parent.errors).toEqual([]); expect(teacherSession?.errors ?? []).toEqual([]); expect(parent.warnings).toEqual([]); expect(teacherSession?.warnings ?? []).toEqual([]);
    }
  });

  test('exclusive current guardian revocation removes future conversation reads and replay', async ({ browser }, info) => {
    test.skip(!exclusiveRevocation, 'Root must explicitly schedule the exclusive current guardian window after other Parent journeys.');
    test.setTimeout(60_000);
    const createInput = { learnerId: choice.learnerId, parentId: choice.parentId, teacherId: choice.teacherId, classId: choice.classId, subjectId: choice.subjectId, title: `School conversation access review ${randomUUID().slice(0, 8)}`, body: 'Review the current school conversation access.' };
    const createKey = randomUUID(), source = await request<Thread>('parent', path, createInput, createKey);
    const rows = await all<Record<string, unknown>>('admin', '/v1/school/guardian-relationships');
    const matches = rows.filter(row => row.parentId === accounts.parent.actorId && row.studentId === accounts.student.actorId); expect(matches).toHaveLength(1);
    const relationship = matches[0]; expect(relationship.status).toBe('active'); let restorationRequired = false;
    const input = { parentId: relationship.parentId, studentId: relationship.studentId, relationshipType: relationship.relationshipType, effectiveFrom: relationship.effectiveFrom, effectiveTo: relationship.effectiveTo, confirmAccessChange: true };
    const revokeKey = randomUUID(), parent = await openPage(browser, 'parent');
    try {
      const thread = await openThread(parent.page, source.title); await messageRow(thread, 'Review the current school conversation access.');
      restorationRequired = true;
      await request('admin', '/v1/school/guardian-relationships', { ...input, status: 'revoked', expectedRevision: relationship.revision }, revokeKey);
      await request('parent', `${path}/${source.id}/messages?limit=100`, undefined, undefined, 403);
      await request('parent', path, createInput, createKey, 403);
      await parent.panel.locator('.parent-conversation-child').getByRole('button', { name: 'Refresh conversations', exact: true }).click();
      await expect(parent.page.locator('.conversation-thread')).toHaveCount(0); await expect(parent.panel.getByText('Review the current school conversation access.', { exact: true })).toHaveCount(0);
      await info.attach('guardian-revocation', { body: JSON.stringify({ exactReadDenied: true, originalCreateReplayDenied: true, retainedBodyRemoved: true }), contentType: 'application/json' });
    } finally {
      try {
        if (restorationRequired) {
          const current = (await all<Record<string, unknown>>('admin', '/v1/school/guardian-relationships')).find(row => row.parentId === accounts.parent.actorId && row.studentId === accounts.student.actorId);
          expect(current, 'Current relationship restoration source required').toBeTruthy();
          if (current!.status !== relationship.status) await request('admin', '/v1/school/guardian-relationships', { ...input, status: relationship.status, expectedRevision: current!.revision });
          const restored = (await all<Record<string, unknown>>('admin', '/v1/school/guardian-relationships')).find(row => row.parentId === accounts.parent.actorId && row.studentId === accounts.student.actorId);
          expect(restored).toMatchObject({ parentId: relationship.parentId, studentId: relationship.studentId, relationshipType: relationship.relationshipType, effectiveFrom: relationship.effectiveFrom, effectiveTo: relationship.effectiveTo, status: relationship.status });
          const restoredChoices = await all<Choice>('parent', `${path}/choices?learnerId=${accounts.student.actorId}`);
          expect(restoredChoices.some(value => value.id === choice.id)).toBe(true);
          await info.attach('guardian-restoration', { body: JSON.stringify({ currentStatusRestored: true, currentAuthorizedChoicesRestored: true }), contentType: 'application/json' });
        }
      } finally {
        await parent.context.close(); expect(parent.blocked).toEqual([]); expect(parent.errors).toEqual([]); expect(parent.warnings).toEqual([]);
      }
    }
  });
});
