import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Account = { role: string; email: string; password: string };
test('teacher-led group membership, peer replies, moderation and family notification receipts work through UI controls', async ({ page }) => {
  test.setTimeout(180000); page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const identity = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { email: string; displayName: string }[] };
  const studentName = identity.actors.find(actor => actor.email === accounts.find(account => account.role === 'student')!.email)!.displayName;
  let otherName = '';
  const title = `Checking study group ${new Date().toISOString()}`;
  const directory = resolve('.local/customer-readiness/community-actions', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(directory, { recursive: true });
  const writes: { action: string; status: number; id: string }[] = [];
  async function signIn(role: string) { const account = accounts.find(item => item.role === role)!; await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page, role); await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Community', exact: true }).click(); await settled(page); }
  async function signOut() { await signOutTrailWorkspace(page); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(); }
  async function mutate(action: string, path: RegExp, click: () => Promise<unknown>) { const pending = page.waitForResponse(response => path.test(new URL(response.url()).pathname) && response.request().method() === 'POST'); await click(); const response = await pending; expect(response.ok(), action).toBe(true); const receipt = await response.json() as { id: string }; writes.push({ action, status: response.status(), id: receipt.id }); await settled(page); return receipt; }
  async function openGroup() { const row = page.locator('.community-room').filter({ has: page.getByRole('heading', { name: title, exact: true }) }); await target(page, row); await row.getByRole('button', { name: 'Open discussion', exact: true }).click(); await settled(page); }
  try {
    await signIn('teacher');
    const classRoom = page.locator('.community-room[data-room-type="CLASS"]').first();
    if (!await classRoom.count()) { await page.getByRole('button', { name: 'Create teacher-led room', exact: true }).click(); const form = page.getByRole('region', { name: 'Create teacher-led room', exact: true }); await form.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' }); await form.getByLabel('Room name', { exact: true }).fill('Cedar class discussion'); await form.getByLabel('Room type', { exact: true }).selectOption({ label: 'Class discussion' }); await mutate('class discussion created', /\/v1\/community\/rooms$/, () => form.getByRole('button', { name: 'Save', exact: true }).click()); }
    await page.getByRole('button', { name: 'Create selected study group', exact: true }).click();
    const groupForm = page.getByRole('region', { name: 'Create selected study group', exact: true }).first();
    await groupForm.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' }); await settled(page);
    await groupForm.getByLabel(studentName, { exact: true }).check();
    await groupForm.getByLabel('Room name', { exact: true }).fill(title);
    const group = await mutate('selected teacher group created', /\/v1\/community\/rooms$/, () => groupForm.getByRole('button', { name: 'Save', exact: true }).click());
    await openGroup();
    let members = page.getByRole('region', { name: 'Group members', exact: true });
    await settled(page); await expect.poll(async () => { const candidateNames = await members.getByLabel('Member', { exact: true }).locator('option').allTextContents(); otherName = candidateNames.find(name => name.startsWith('Sara ') && name !== studentName) ?? ''; return otherName; }, { timeout: 15000, message: 'Wait for the authorized current class learner choice.' }).not.toBe(''); await members.getByLabel('Member', { exact: true }).selectOption({ label: otherName }); await members.getByLabel('Membership status', { exact: true }).selectOption({ label: 'Active member' }); await members.getByLabel('I approve this moderation action').check();
    await mutate('teacher adds a current class member', /\/members$/, () => members.getByRole('button', { name: 'Save', exact: true }).click());
    members = page.getByRole('region', { name: 'Group members', exact: true }); await expect.poll(async()=>await members.getByLabel('Membership status', { exact: true }).inputValue()).toBe(''); await members.getByLabel('Member', { exact: true }).selectOption({ label: otherName }); await expect(members.getByLabel('Member', { exact: true }).locator('option:checked')).toHaveText(otherName); await members.getByLabel('Membership status', { exact: true }).selectOption({ label: 'Remove from group' }); await members.getByLabel('I approve this moderation action').check();
    await mutate('teacher revokes selected group membership', /\/members$/, () => members.getByRole('button', { name: 'Save', exact: true }).click());
    await signOut(); await signIn('student'); await openGroup();
    const postForm = page.getByRole('region', { name: 'Post to room', exact: true }); await postForm.getByLabel('Message', { exact: true }).fill('I checked the example by explaining each step.');
    const post = await mutate('student posts inside selected group', /\/posts$/, () => postForm.getByRole('button', { name: 'Post to room', exact: true }).click());
    await postForm.getByLabel('Message', { exact: true }).fill('A second example checks each step in another order.');
    const secondPost = await mutate('student creates a second source for distinct reply drafts', /\/posts$/, () => postForm.getByRole('button', { name: 'Post to room', exact: true }).click());
    let postRow = page.locator(`[data-post-id="${post.id}"]`); await target(page, postRow);
    await expect(postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true})).toBeVisible();await expect(postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true})).toBeEnabled();await expect(postRow.getByRole('button',{name:'Helpful · 0',exact:true})).toHaveCount(0);
    let releaseReaction!: () => void; const heldReaction = new Promise<void>(resolve => { releaseReaction = resolve; }); let reactionCommitted!: () => void; const committedReaction = new Promise<void>(resolve => { reactionCommitted = resolve; }); let reactionHandled!: () => void; const handledReaction = new Promise<void>(resolve => { reactionHandled = resolve; });
    const reactionPath = `/v1/community/posts/${post.id}/reactions`; let holdFirstReaction = true; const reactionKeys: string[] = [];
    await page.route('**' + reactionPath, async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      reactionKeys.push(route.request().headers()['idempotency-key']);
      if (!holdFirstReaction) { await route.continue(); return; }
      holdFirstReaction = false; const response = await route.fetch(); expect(response.ok()).toBe(true); reactionCommitted(); await heldReaction;
      try { await route.fulfill({ response }); } finally { reactionHandled(); }
    });
    try {
      await postRow.getByRole('button', { name: 'Helpful · Count unavailable', exact: true }).click(); await committedReaction;
      const currentPosts = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/community/rooms/${group.id}/posts` && response.request().method() === 'GET');
      await page.getByRole('button', { name: 'Refresh community', exact: true }).click(); await settled(page);
      const currentPostResponse = await currentPosts; expect(currentPostResponse.ok()).toBe(true);
      const currentPostPage = await currentPostResponse.json() as { items: { id: string; reactions: { reaction: string; count: number; mine: boolean }[] }[] };
      const currentPost = currentPostPage.items.filter(item => item.id === post.id); expect(currentPost).toHaveLength(1);
      expect(currentPost[0].reactions.filter(item => item.reaction === 'HELPFUL')).toEqual([{ reaction: 'HELPFUL', count: 1, mine: true }]);
      await expect(postRow.getByRole('button', { name: 'Retry the same action', exact: true })).toHaveCount(3);
      const returnedReaction = page.waitForResponse(response => new URL(response.url()).pathname === reactionPath && response.request().method() === 'POST');
      releaseReaction(); await handledReaction; const response = await returnedReaction; expect(response.status()).toBe(200);expect(response.request().postDataJSON()).toEqual({reaction:'HELPFUL',active:true}); const reactionReceipt = await response.json() as { id: string };expect(reactionReceipt).toEqual({id:post.id,command:'reaction.configure'}); writes.push({ action: 'student adds helpful reaction across source refresh', status: response.status(), id: reactionReceipt.id });
      await expect(postRow.getByRole('button', { name: 'Retry the same action', exact: true })).toHaveCount(0);
      await expect(postRow.getByRole('button', { name: 'Helpful · 1', exact: true })).toBeEnabled(); expect(reactionKeys).toHaveLength(1);
    } finally { releaseReaction(); }
    await expect(postRow.getByRole('button',{name:'Helpful · 1',exact:true})).toBeVisible();await expect(postRow.getByRole('button',{name:'Helpful · 1',exact:true})).toBeEnabled();
    await mutate('student removes same reaction', /\/reactions$/, () => postRow.getByRole('button', { name: 'Helpful · 1', exact: true }).click());
    expect(reactionKeys).toHaveLength(2); expect(reactionKeys[1]).not.toBe(reactionKeys[0]);
    await page.unroute('**' + reactionPath);
    await expect(postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true})).toBeVisible();await expect(postRow.getByRole('button',{name:'Helpful · 0',exact:true})).toHaveCount(0);
    await postRow.getByRole('button', { name: 'Reply', exact: true }).click(); const reply = page.getByRole('region', { name: 'Reply', exact: true }); await reply.getByLabel('Message', { exact: true }).fill('My checking step uses the same school example.');
    const secondPostRow = page.locator(`[data-post-id="${secondPost.id}"]`); await secondPostRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue('');
    await reply.getByLabel('Message', { exact: true }).fill('This reply belongs to the second example.');
    await postRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue('My checking step uses the same school example.');
    await secondPostRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue('This reply belongs to the second example.');
    await postRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh community', exact: true }).click(); await settled(page);
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue('My checking step uses the same school example.');
    await expect(page.getByRole('region', { name: 'Post to room', exact: true }).getByLabel('Message', { exact: true })).not.toHaveValue('My checking step uses the same school example.');
    const replyRequest = page.waitForRequest(request => /\/v1\/community\/rooms\/[^/]+\/posts$/.test(new URL(request.url()).pathname) && request.method() === 'POST');
    await mutate('student replies to group source', /\/posts$/, () => reply.getByRole('button', { name: 'Save', exact: true }).click());
    expect((await replyRequest).postDataJSON()).toMatchObject({ replyToId: post.id, body: 'My checking step uses the same school example.' });
    await postRow.getByRole('button', { name: 'Report post', exact: true }).click(); const report = page.getByRole('region', { name: 'Report post', exact: true }); await report.getByLabel('Reason', { exact: true }).fill('Please review this school example.'); await mutate('student reports with an explicit reason', /\/report$/, () => report.getByRole('button', { name: 'Save', exact: true }).click());
    await signOut(); await signIn('teacher'); await openGroup();
    await page.getByRole('button', { name: 'Manage participation', exact: true }).click(); let restriction = page.getByRole('region', { name: 'Manage participation', exact: true });
    await restriction.getByLabel('Member', { exact: true }).selectOption({ label: studentName }); await restriction.getByLabel('Participation restriction', { exact: true }).selectOption({ label: 'Mute posting' }); await restriction.getByLabel('Reason', { exact: true }).fill('Temporary moderated practice pause.'); await restriction.getByLabel('I approve this moderation action').check(); await mutate('teacher mutes posting', /\/restrict$/, () => restriction.getByRole('button', { name: 'Save', exact: true }).click());
    await signOut(); await signIn('student'); await openGroup(); await expect(page.getByRole('region', { name: 'Post to room', exact: true })).toHaveCount(0); await expect(page.getByText('Your current access permits reading only.', { exact: true })).toBeVisible();
    await signOut(); await signIn('teacher'); await openGroup(); await page.getByRole('button', { name: 'Manage participation', exact: true }).click(); restriction = page.getByRole('region', { name: 'Manage participation', exact: true });
    await restriction.getByLabel('Member', { exact: true }).selectOption({ label: studentName }); await restriction.getByLabel('Participation restriction', { exact: true }).selectOption({ label: 'Remove restriction' }); await restriction.getByLabel('Reason', { exact: true }).fill('Staff restored normal group participation.'); await restriction.getByLabel('I approve this moderation action').check(); await mutate('teacher removes restriction', /\/restrict$/, () => restriction.getByRole('button', { name: 'Save', exact: true }).click());
    postRow = page.locator(`[data-post-id="${post.id}"]`); await target(page, postRow); await postRow.getByRole('button', { name: 'Hide post', exact: true }).click(); let moderation = page.getByRole('region', { name: 'Staff review', exact: true }); await moderation.getByLabel('Reason', { exact: true }).fill('Staff hides the example during review.'); await moderation.getByLabel('I approve this moderation action').check(); await mutate('staff hides reported source', /\/moderate$/, () => moderation.getByRole('button', { name: 'Save', exact: true }).click()); await expect(postRow).not.toContainText('I checked the example');
    await postRow.getByRole('button', { name: 'Restore post', exact: true }).click(); moderation = page.getByRole('region', { name: 'Staff review', exact: true }); await moderation.getByLabel('Reason', { exact: true }).fill('Staff completes review and restores the source.'); await moderation.getByLabel('I approve this moderation action').check(); await mutate('staff restores reviewed source', /\/moderate$/, () => moderation.getByRole('button', { name: 'Save', exact: true }).click()); await expect(postRow).toContainText('I checked the example');
    await page.getByRole('button', { name: 'Back to rooms', exact: true }).click(); await page.getByRole('button', { name: 'Announcements', exact: true }).click(); await page.getByRole('button', { name: 'Publish announcement', exact: true }).click(); const announcement = page.getByRole('region', { name: 'Publish announcement', exact: true }); await announcement.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' }); await announcement.getByLabel('Title', { exact: true }).fill(title + ' family update'); await announcement.getByLabel('Message', { exact: true }).fill('School-reviewed class practice is ready.'); await announcement.getByLabel('Approve this announcement for current parents / guardians').check(); await mutate('teacher approves current family announcement', /\/announcements$/, () => announcement.getByRole('button', { name: 'Save', exact: true }).click()); await signOut();
    await signIn('parent'); await page.locator('[data-workspace-sections]').getByRole('button', { name: 'Notifications', exact: true }).click(); const notification = page.locator('.community-post').filter({ has: page.getByRole('heading', { name: title + ' family update', exact: true }) }); await target(page, notification); await expect(notification.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0); await notification.getByRole('button', { name: 'Open announcement', exact: true }).click(); await expect(notification).toContainText('School-reviewed class practice is ready.'); await mutate('parent records notification read receipt', /\/read$/, () => notification.getByRole('button', { name: 'Mark read', exact: true }).click()); await expect(notification).toContainText('Read'); await expect(notification.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0);
    await page.screenshot({ path: resolve(directory, 'parent-notification-confirmed.png') }); await writeFile(resolve(directory, 'evidence.json'), JSON.stringify({ status: 'VERIFIED', mutationMode: 'VISIBLE_UI_ONLY', group: group.id, writes, limitations: ['Group post attachments are not implemented.'] }, null, 2));
  } catch (failure) { if (!page.isClosed()) await page.screenshot({ path: resolve(directory, 'failure.png') }).catch(() => undefined); await writeFile(resolve(directory, 'failure.json'), JSON.stringify({ status: 'FAILED', confirmedWriteCount: writes.length }, null, 2)); throw failure; }
});

async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0); }
async function target(page: Page, locator: Locator) { await expect.poll(async()=>await locator.count()>0||await page.getByRole('button',{name:'Load more',exact:true}).count()>0).toBe(true); for (let count = 0; count < 20 && !await locator.count(); count++) { const more = page.getByRole('button', { name: 'Load more', exact: true }).first(); if (!await more.count()) break; await more.click(); await expect(page.getByRole('button',{name:'Loading more…',exact:true})).toHaveCount(0); } await expect(locator).toBeVisible(); }
