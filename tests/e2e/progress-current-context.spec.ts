import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Person = { id: string; displayName: string; role: string; status: string; effectiveFrom: string; effectiveTo: string | null; revision: number };
test('selected learner heading follows current authorized names after school correction and evidence refresh', async ({ page }) => {
  test.setTimeout(60000);
  const root = resolve(import.meta.dirname, '../..');
  const accounts = JSON.parse(await readFile(resolve(root, '.local/synthetic-accounts.json'), 'utf8')) as { role: string; email: string; password: string }[];
  const admin = accounts.find(account => account.role === 'admin')!; const teacher = accounts.find(account => account.role === 'teacher')!;
  const schoolId = '10000000-0000-4000-8000-000000000001'; const learnerId = '20000000-0000-4000-8000-000000000012';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY; const authUrl = process.env.SUPABASE_URL;
  if (!key || !authUrl || !['localhost', '127.0.0.1'].includes(new URL(authUrl).hostname)) throw Error('Guarded local synthetic Auth required.');
  const auth = await page.request.post(`${authUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: admin.email, password: admin.password } }); expect(auth.ok()).toBe(true);
  const adminToken = (await auth.json()).access_token as string; const headers = { Authorization: `Bearer ${adminToken}`, 'X-School-Id': schoolId };
  async function current(request: APIRequestContext): Promise<Person> {
    const response = await request.get('http://localhost:4000/v1/school/people?limit=100', { headers }); expect(response.status()).toBe(200);
    const person = (await response.json()).items.find((person: Person) => person.id === learnerId) as Person;
    expect(person?.revision).toEqual(expect.any(Number)); return person;
  }
  const original = await current(page.request); expect(original.displayName).toBe('Lina Al-Kuwari');
  const correctedName = 'Lina Al-Kuwari — corrected school spelling'; let changed = false;
  async function save(displayName: string, revision: number) {
    const response = await page.request.post(`http://localhost:4000/v1/school/people/${learnerId}/configure`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { displayName, role: original.role, status: original.status, effectiveFrom: original.effectiveFrom, effectiveTo: original.effectiveTo, expectedRevision: revision, confirmAccessChange: true } }); expect(response.status()).toBe(200);
  }
  try {
    await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email').fill(teacher.email); await page.getByLabel('Password', { exact: true }).fill(teacher.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('School access verified', { exact: true })).toBeVisible(); await page.getByRole('navigation').getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Year 1 · Cedar · Year 1 · 2026–2027' });
    const row = page.locator(`[data-class-learner-id="${learnerId}"]`); await row.getByRole('button', { name: 'Review this learner', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Current learner evidence · Lina Al-Kuwari/ })).toBeFocused();
    await save(correctedName, original.revision); changed = true;
    const refresh = page.getByRole('button', { name: 'Refresh learner state', exact: true }); await refresh.click();
    await expect(page.getByRole('heading', { name: `Current learner evidence · ${correctedName} · Year 1 · Cedar · Year 1 · 2026–2027`, exact: true })).toBeVisible();
    await expect(refresh).toBeFocused();
    await expect(page.locator('[data-class-learner-id]').filter({ has: page.getByRole('heading', { name: correctedName, exact: true }) })).toBeVisible();
  } finally {
    if (changed) { const latest = await current(page.request); await save(original.displayName, latest.revision); expect((await current(page.request)).displayName).toBe(original.displayName); }
  }
});
