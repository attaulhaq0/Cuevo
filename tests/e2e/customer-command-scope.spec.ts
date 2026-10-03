import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
type Account = { role: string; email: string; password: string };
async function signIn(page: Page, account: Account, navigate = true) { if (navigate) await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email', { exact: true }).fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByText('School access verified', { exact: true })).toBeVisible(); }

test('a delayed prior actor save cannot announce success or clear the current actor original-key retry', async ({ page }) => {
  test.setTimeout(90000); page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[]; const teacher = accounts.find(account => account.role === 'teacher')!; const admin = accounts.find(account => account.role === 'admin')!;
  await signIn(page, teacher); await page.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true }).click(); await page.getByRole('button', { name: 'Create course', exact: true }).click();
  const form = page.getByRole('region', { name: 'Create course', exact: true }); const firstTitle = `Earlier actor checking course ${new Date().toISOString()}`; const nextTitle = `Current actor checking course ${new Date().toISOString()}`;
  async function fill(title: string) { await form.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' }); await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'Mathematics' }); await form.getByLabel('Title', { exact: true }).fill(title); await form.getByLabel('Description', { exact: true }).fill('Synthetic mutation completion scope test.'); }
  let releaseOld!: () => void; const held = new Promise<void>(resolve => { releaseOld = resolve; }); let observed!: () => void; const oldObserved = new Promise<void>(resolve => { observed = resolve; }); let finished!: () => void; const oldHandled = new Promise<void>(resolve => { finished = resolve; });
  const keys: string[] = []; let currentAttempts = 0;
  await page.route('**/v1/courses', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const body = route.request().postDataJSON() as { title: string }; const key = route.request().headers()['idempotency-key'];
    if (body.title === firstTitle) { const response = await route.fetch(); expect(response.ok()).toBe(true); observed(); await held; try { await route.fulfill({ response }); } finally { finished(); } return; }
    if (body.title === nextTitle) { keys.push(key); currentAttempts++; await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'REQUEST_UNAVAILABLE', requestId: `current-save-${currentAttempts}` }) }); return; }
    await route.continue();
  });
  await fill(firstTitle); await form.getByRole('button', { name: 'Save', exact: true }).click(); await oldObserved;
  await page.getByRole('button', { name: 'Sign out', exact: true }).last().click(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  // Keep the document and its old await alive while the verified actor changes.
  await signIn(page, admin, false); await page.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true }).click(); await page.getByRole('button', { name: 'Create course', exact: true }).click(); await fill(nextTitle); await form.getByRole('button', { name: 'Save', exact: true }).click(); await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible(); expect(keys).toHaveLength(1);
  const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/courses' && response.request().method() === 'POST' && response.request().postDataJSON().title === firstTitle); releaseOld(); await oldHandled; expect((await oldResponse).ok()).toBe(true); await page.waitForTimeout(200);
  await expect(page.getByRole('status').filter({ hasText: 'Create course: Saved.' })).toHaveCount(0); await expect(form.getByLabel('Title', { exact: true })).toHaveValue(nextTitle); await expect(form.getByRole('button', { name: 'Retry the same action', exact: true })).toBeVisible();
  const retried = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/courses' && response.request().method() === 'POST' && response.request().postDataJSON().title === nextTitle); await form.getByRole('button', { name: 'Retry the same action', exact: true }).click(); expect((await retried).status()).toBe(503); expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
});

test('a delayed prior actor authorization refusal cannot clear the current actor unsent draft', async ({ page }) => {
  test.setTimeout(90000); page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[]; const teacher = accounts.find(account => account.role === 'teacher')!; const admin = accounts.find(account => account.role === 'admin')!;
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let observed!: () => void; const started = new Promise<void>(resolve => { observed = resolve; }); let finished!: () => void; const handled = new Promise<void>(resolve => { finished = resolve; });
  await page.route('**/v1/courses', async route => { if (route.request().method() !== 'POST') { await route.continue(); return; } observed(); await held; try { await route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'FORBIDDEN', requestId: 'prior-actor-refusal' }) }); } finally { finished(); } });
  await signIn(page, teacher); await page.getByRole('navigation').getByRole('button', { name: 'Learning', exact: true }).click(); await page.getByRole('button', { name: 'Create course', exact: true }).click();
  const form = page.getByRole('region', { name: 'Create course', exact: true }); await form.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' }); await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'Mathematics' }); await form.getByLabel('Title', { exact: true }).fill('Earlier actor refused course'); await form.getByRole('button', { name: 'Save', exact: true }).click(); await started;
  await page.getByRole('button', { name: 'Sign out', exact: true }).last().click(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(); await signIn(page, admin, false); await page.getByRole('navigation').getByRole('button', { name: 'School', exact: true }).click(); await page.getByRole('button', { name: 'Create academic year', exact: true }).click();
  const draft = page.getByRole('region', { name: 'Create academic year', exact: true }); await draft.getByLabel('Name', { exact: true }).fill('Current actor unsent year draft');
  const refused = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/courses' && response.request().method() === 'POST'); release(); await handled; expect((await refused).status()).toBe(403); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Refresh school records', exact: true }).click(); await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0); await expect(draft.getByLabel('Name', { exact: true })).toHaveValue('Current actor unsent year draft');
});
