import { expectTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

test('administrator invites a new learner and the recipient accepts, saves a password and opens the school workspace', async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const admin = accounts.find(account => account.role === 'admin'); if (!admin) throw Error('Synthetic administrator required.');
  const email = `new-learner-${randomUUID()}@example.test`; const name = 'Noura · new school learner'; const password = randomBytes(24).toString('base64url');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name)); page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning' && /hydrat/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/'); await page.getByLabel('School email', { exact: true }).fill(admin.email); await page.getByLabel('Password', { exact: true }).fill(admin.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectTrailWorkspace(page); await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'School', exact: true }).click();
  await page.getByRole('button', { name: 'Accounts and invitations', exact: true }).click();
  const panel = page.getByRole('region', { name: 'School accounts and invitations', exact: true }); await panel.getByRole('button', { name: 'Invite someone to school', exact: true }).click(); const form = panel.getByRole('region', { name: 'Invite someone to school', exact: true });
  await form.getByLabel('Registered name', { exact: true }).fill(name); await form.getByLabel('Email', { exact: true }).fill(email); await form.getByLabel('Approved role', { exact: true }).selectOption('student'); await form.getByLabel('School approval reason', { exact: true }).fill('Reviewed synthetic school admission through the actual administrator screen.');
  await expect(form.getByLabel('I reviewed this person and role and approve this invitation', { exact: true })).not.toBeChecked(); await form.getByLabel('I reviewed this person and role and approve this invitation', { exact: true }).check();
  const create = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/school/accounts/invitations' && response.request().method() === 'POST'); await form.getByRole('button', { name: 'Save', exact: true }).click(); expect((await create).status()).toBe(200);
  const select = panel.getByRole('combobox', { name: 'Select an invitation to review', exact: true }); await expect(select.locator('option').filter({ hasText: email })).toHaveCount(1); await select.selectOption({ label: `${name} · ${email} · Student` });
  const deliver = page.waitForResponse(response => /\/v1\/school\/accounts\/invitations\/[a-f0-9-]+\/deliver$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST'); await panel.getByRole('button', { name: 'Send approved invitation', exact: true }).click(); expect((await deliver).status()).toBe(200);
  await expect(panel).toContainText('Local invitation capture is confirmed. School access has not been accepted yet.');
  const captureResponse = await page.request.get(`http://127.0.0.1:56324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=2`); expect(captureResponse.ok()).toBe(true);
  const captures = await captureResponse.json() as { messages: { ID: string }[] }; expect(captures.messages).toHaveLength(1); const mailId = captures.messages[0].ID;
  const messageResponse = await page.request.get(`http://127.0.0.1:56324/api/v1/message/${mailId}`); expect(messageResponse.ok()).toBe(true); const message = await messageResponse.json() as { Text: string };
  let invitationUrl = message.Text.split(/\r?\n/).find(line => line.startsWith('http://localhost:3000/account/admission#')); if (!invitationUrl) throw Error('Owned invitation continuation unavailable.');
  const recipientContext = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width: 390, height: 844 } }); const recipient = await recipientContext.newPage();
  recipient.on('pageerror', error => errors.push(error.name)); recipient.on('console', value => { if (value.type() === 'error' || value.type() === 'warning' && /hydrat/i.test(value.text())) errors.push(value.text()); });
  try {
    await recipient.goto(invitationUrl); invitationUrl = undefined;
    await expect(recipient).toHaveURL('http://localhost:3000/account/admission'); await expect(recipient.getByRole('heading', { name: 'Join your school workspace', exact: true })).toBeVisible();
    await expect(recipient.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    await recipient.getByLabel('I expected this school invitation and want to accept the approved access.', { exact: true }).check();
    const claim = recipient.waitForResponse(response => new URL(response.url()).pathname === '/v1/account/school-admission/claim' && response.request().method() === 'POST'); await recipient.getByRole('button', { name: 'Continue', exact: true }).click(); const admitted = await claim; expect(admitted.status()).toBe(200); expect(admitted.request().headers()).not.toHaveProperty('x-school-id');
    await expect(recipient.getByRole('heading', { name: 'School access accepted', exact: true })).toBeVisible();
    await recipient.getByLabel('New password', { exact: true }).fill(password); await recipient.getByLabel('Confirm password', { exact: true }).fill(password); await recipient.getByRole('button', { name: 'Save password', exact: true }).click();
    await expect(recipient.getByText('Password saved', { exact: true })).toBeVisible();
    await recipient.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(recipient.locator('html')).toHaveAttribute('dir', 'rtl'); expect((await new AxeBuilder({ page: recipient }).include('main').analyze()).violations).toEqual([]); await recipient.screenshot({ path: testInfo.outputPath('admitted-arabic-mobile.png') });
    await recipient.getByRole('button', { name: 'English', exact: true }).click(); await recipient.getByRole('button', { name: 'Open workspace', exact: true }).click(); await expect(recipient).toHaveURL('http://localhost:3000/'); await expectTrailWorkspace(recipient); await expect(recipient.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true })).toBeVisible();
    await signOutTrailWorkspace(recipient); await recipient.getByLabel('School email', { exact: true }).fill(email); await recipient.getByLabel('Password', { exact: true }).fill(password); await recipient.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(recipient); expect(errors).toEqual([]);
  } finally {
    await recipientContext.close(); const removed = await page.request.delete('http://127.0.0.1:56324/api/v1/messages', { data: { IDs: [mailId] } }); expect(removed.ok()).toBe(true);
  }
});
