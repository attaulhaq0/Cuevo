import { expectTrailWorkspace } from './trail-workspace';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('current group member choice survives a roster refresh after a confirmed earlier change', async ({ page }) => {
  test.setTimeout(90000); page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const teacher = accounts.find(account => account.role === 'teacher')!;
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('School email', { exact: true }).fill(teacher.email); await page.getByLabel('Password', { exact: true }).fill(teacher.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page);
  await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Community', exact: true }).click(); await settled(page);
  if (!await page.locator('.community-room[data-room-type="CLASS"]').count()) {
    await page.getByRole('button', { name: 'Create teacher-led room', exact: true }).click();
    const room = page.getByRole('region', { name: 'Create teacher-led room', exact: true });
    await room.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' });
    await room.getByLabel('Room name', { exact: true }).fill('Cedar class discussion');
    await room.getByLabel('Room type', { exact: true }).selectOption({ label: 'Class discussion' });
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/community/rooms' && response.request().method() === 'POST');
    await room.getByRole('button', { name: 'Save', exact: true }).click(); expect((await saved).status()).toBe(200); await settled(page);
  }
  const classRoomId = await page.locator('.community-room[data-room-type="CLASS"]').first().getAttribute('data-room-id'); expect(classRoomId).toBeTruthy();
  await page.getByRole('button', { name: 'Create selected study group', exact: true }).click();
  const groupForm = page.getByRole('region', { name: 'Create selected study group', exact: true }).first();
  await groupForm.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' }); await settled(page);
  await groupForm.locator('input[type="checkbox"]').first().check();
  const title = `Current membership refresh ${new Date().toISOString()}`; await groupForm.getByLabel('Room name', { exact: true }).fill(title);
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/community/rooms' && response.request().method() === 'POST');
  await groupForm.getByRole('button', { name: 'Save', exact: true }).click(); const group = await (await created).json() as { id: string }; await settled(page);
  await page.locator('.community-room').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Open discussion', exact: true }).click(); await settled(page);
  const members = page.getByRole('region', { name: 'Group members', exact: true });
  const choice = members.getByLabel('Member', { exact: true });
  await expect.poll(() => choice.locator('option').count()).toBeGreaterThan(2);
  const options = await choice.locator('option').evaluateAll(values => values.map(value => ({ id: (value as HTMLOptionElement).value, label: value.textContent ?? '' })).filter(value => value.id));
  const nextMember = options.find(value => value.label.startsWith('Sara '))!; expect(nextMember).toBeTruthy();
  await choice.selectOption(nextMember.id); await members.getByLabel('Membership status', { exact: true }).selectOption('active'); await members.getByLabel('I approve this moderation action', { exact: true }).check();
  const added = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/community/rooms/${group.id}/members` && response.request().method() === 'POST');
  await members.getByRole('button', { name: 'Save', exact: true }).click(); expect((await added).status()).toBe(200);
  await expect(members.getByLabel('Membership status', { exact: true })).toHaveValue(''); await settled(page);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/v1/community/rooms/${classRoomId}/roster?*`, async route => { const response = await route.fetch(); started(); await held; await route.fulfill({ response }); });
  try {
    await choice.selectOption(nextMember.id); await members.getByLabel('Membership status', { exact: true }).selectOption('revoked'); await members.getByLabel('I approve this moderation action', { exact: true }).check();
    await page.getByRole('button', { name: 'Refresh community', exact: true }).click(); await requested;
    await expect(members.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    release(); await settled(page);
    await expect(choice).toHaveValue(nextMember.id); await expect(members.getByLabel('Membership status', { exact: true })).toHaveValue('revoked'); await expect(members.getByLabel('I approve this moderation action', { exact: true })).toBeChecked();
    const removed = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/community/rooms/${group.id}/members` && response.request().method() === 'POST');
    await members.getByRole('button', { name: 'Save', exact: true }).click(); const response = await removed; expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({ actorId: nextMember.id, status: 'revoked', confirmAccessChange: true });
  } finally { release(); }
});

async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0); }
