import { expectTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

test('school administrator approves recovery and the member changes password, revokes old sessions and signs in again', async ({ page, browser }) => {
  test.setTimeout(120000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[]; const admin = accounts.find(row => row.role === 'admin')!; const student = accounts.find(row => row.role === 'student')!;
  const identities = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { email: string; actorId: string; displayName: string }[] }; const studentIdentity = identities.actors.find(row => row.email === student.email)!;
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY; if (!pub) throw Error('Local Auth required.');
  const oldSignIn = await page.request.post('http://127.0.0.1:56321/auth/v1/token?grant_type=password', { headers: { apikey: pub }, data: { email: student.email, password: student.password } }); expect(oldSignIn.ok()).toBe(true); const oldTokens = await oldSignIn.json() as { access_token: string; refresh_token: string };
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name)); page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning' && /hydrat/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/'); await page.getByLabel('School email', { exact: true }).fill(admin.email); await page.getByLabel('Password', { exact: true }).fill(admin.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page); await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'School', exact: true }).click(); await page.getByRole('button', { name: 'Accounts and invitations', exact: true }).click();
  const panel = page.getByRole('region', { name: 'School accounts and invitations', exact: true }); await panel.getByRole('button', { name: 'Recover a school member account', exact: true }).click(); const recovery = panel.getByRole('region', { name: 'Recover a school member account', exact: true });
  const currentMember = recovery.getByRole('combobox', { name: 'Current member', exact: true });
  for (let part = 0; part < 30; part++) {
    await expect.poll(async () => await currentMember.isEnabled().catch(() => false) || await recovery.getByRole('button', { name: 'Load more', exact: true }).isVisible().catch(() => false)).toBe(true);
    if (await currentMember.isEnabled()) break;
    const continuation = page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === '/v1/school/people' && url.searchParams.has('cursor') && response.request().method() === 'GET'; });
    await recovery.getByRole('button', { name: 'Load more', exact: true }).click();
    const received = await continuation; expect(received.status()).toBe(200); const memberPage = await received.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(Array.isArray(memberPage.items) && memberPage.items.length <= 100).toBe(true); expect(memberPage.nextCursor === null || typeof memberPage.nextCursor === 'string').toBe(true);
    await expect(recovery.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
    for (const item of memberPage.items) await expect(currentMember.locator(`option[value="${item.id}"]`)).toHaveCount(1);
    if (memberPage.nextCursor === null) await expect(currentMember).toBeEnabled();
  }
  await expect(currentMember).toBeEnabled();
  const memberOption = currentMember.locator(`option[value="${studentIdentity.actorId}"]`); await expect(memberOption).toHaveCount(1); await expect(memberOption).toContainText(studentIdentity.displayName); await expect(memberOption).toBeEnabled();
  await currentMember.selectOption(studentIdentity.actorId);
  const approve = recovery.getByRole('region', { name: 'Approve account recovery', exact: true }); await approve.getByLabel('School approval reason', { exact: true }).fill('Verified school-assisted synthetic account recovery.'); await approve.getByLabel('I reviewed this member identity and approve recovery', { exact: true }).check();
  const created = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/school/accounts/${studentIdentity.actorId}/recovery` && response.request().method() === 'POST'); await approve.getByRole('button', { name: 'Save', exact: true }).click(); const approved = await created; expect(approved.status()).toBe(200); const receipt = await approved.json() as { id: string };
  const select = panel.getByRole('combobox', { name: 'Select an invitation to review', exact: true }); await expect(select.locator(`option[value="${receipt.id}"]`)).toContainText('Account recovery'); await select.selectOption(receipt.id);
  const sent = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/school/accounts/invitations/${receipt.id}/deliver` && response.request().method() === 'POST'); await panel.getByRole('button', { name: 'Send approved recovery link', exact: true }).click(); expect((await sent).status()).toBe(200); await expect(panel).toContainText('Recovery changes only the password.');
  const search = await page.request.get(`http://127.0.0.1:56324/api/v1/search?query=${encodeURIComponent(`to:${student.email} subject:"Cuevo account recovery"`)}&limit=5`); expect(search.ok()).toBe(true); const captures = await search.json() as { messages: { ID: string }[] };
  let url = ''; let messageId = '';
  for (const capture of captures.messages) { const response = await page.request.get(`http://127.0.0.1:56324/api/v1/message/${capture.ID}`); const body = await response.json() as { Text: string }; const link = body.Text.split(/\r?\n/).find(line => line.startsWith('http://localhost:3000/account/recovery#') && new URLSearchParams(new URL(line).hash.slice(1)).get('id') === receipt.id); if (link) { url = link; messageId = capture.ID; } }
  if (!url || !messageId) throw Error('Exact recovery continuation unavailable.');
  const context = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width: 390, height: 844 } }); const member = await context.newPage(); const newPassword = randomBytes(24).toString('base64url'); member.on('pageerror', error => errors.push(error.name)); member.on('console', value => { if (value.type() === 'error' || value.type() === 'warning' && /hydrat/i.test(value.text())) errors.push(value.text()); });
  try {
    await member.goto(url); url = ''; await expect(member).toHaveURL('http://localhost:3000/account/recovery'); await member.getByLabel('I requested this school account recovery and want to reset my password.', { exact: true }).check();
    const authorization = member.waitForResponse(response => new URL(response.url()).pathname === '/v1/account/recovery/authorize' && response.request().method() === 'POST'); await member.getByRole('button', { name: 'Continue', exact: true }).click(); expect((await authorization).status()).toBe(200);
    await member.getByLabel('New password', { exact: true }).fill(newPassword); await member.getByLabel('Confirm password', { exact: true }).fill(newPassword); const completion = member.waitForResponse(response => new URL(response.url()).pathname === '/v1/account/recovery/complete' && response.request().method() === 'POST'); await member.getByRole('button', { name: 'Save password', exact: true }).click(); expect((await completion).status()).toBe(200);
    await expect(member.getByText('Password recovery confirmed', { exact: true })).toBeVisible(); await member.getByRole('button', { name: 'Sign out all sessions', exact: true }).click(); await expect(member.getByRole('heading', { name: 'Recovery finished', exact: true })).toBeVisible();
    const stale = await page.request.get('http://localhost:4000/v1/me', { headers: { authorization: `Bearer ${oldTokens.access_token}`, 'x-school-id': '10000000-0000-4000-8000-000000000001' } }); expect(stale.status()).toBe(401); const staleRefresh = await page.request.post('http://127.0.0.1:56321/auth/v1/token?grant_type=refresh_token', { headers: { apikey: pub }, data: { refresh_token: oldTokens.refresh_token } }); expect(staleRefresh.ok()).toBe(false);
    await member.getByRole('button', { name: 'العربية', exact: true }).click(); expect((await new AxeBuilder({ page: member }).include('main').analyze()).violations).toEqual([]); await member.getByRole('button', { name: 'English', exact: true }).click(); await member.getByRole('button', { name: 'Return to sign in', exact: true }).click(); await member.getByLabel('School email', { exact: true }).fill(student.email); await member.getByLabel('Password', { exact: true }).fill(newPassword); await member.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(member); expect(errors).toEqual([]);
  } finally { await context.close(); const removed = await page.request.delete('http://127.0.0.1:56324/api/v1/messages', { data: { IDs: [messageId] } }); expect(removed.ok()).toBe(true); }
});
