import { expectTrailWorkspace } from './trail-workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('current native result pages can be browsed and exported together without missing later records', async ({ page }) => {
  test.setTimeout(180000); page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as { role: string; email: string; password: string }[];
  const teacher = accounts.find(account => account.role === 'teacher')!; const student = accounts.find(account => account.role === 'student')!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!; const school = '10000000-0000-4000-8000-000000000001';
  async function token(account: typeof teacher) { const response = await page.request.post(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: account.email, password: account.password } }); expect(response.ok()).toBe(true); return (await response.json()).access_token as string; }
  const teacherToken = await token(teacher); const studentToken = await token(student);
  async function command(actorToken: string, path: string, body: Record<string, unknown>) { const response = await page.request.post(`http://localhost:4000${path}`, { headers: { Authorization: `Bearer ${actorToken}`, 'X-School-Id': school, 'Idempotency-Key': randomUUID() }, data: body }); expect(response.status(), path).toBe(200); return response.json(); }
  const label = `Current report checking ${new Date().toISOString()}`;
  const course = await command(teacherToken, '/v1/courses', { classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', title: label, description: 'Synthetic page coverage setup' }); await command(teacherToken, `/v1/courses/${course.id}/publish`, {});
  for (let count = 0; count < 26; count++) {
    const task = await command(teacherToken, '/v1/assessments', { courseId: course.id, title: `${label} ${count + 1}`, instructions: 'Explain the school example', maxScore: 10 }); await command(teacherToken, `/v1/assessments/${task.id}/reference`, { referenceId: '61000000-0000-4000-8000-000000000001', expectedPolicyVersion: 1 });
    const source = await command(studentToken, `/v1/assessments/${task.id}/submissions`, { content: 'Synthetic current work' }); const mark = await command(teacherToken, `/v1/submissions/${source.id}/results`, { score: count % 11, feedback: 'Teacher reviewed this page source', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true }); await command(teacherToken, `/v1/results/${mark.id}/release`, { expectedRevision: 1 });
  }
  await page.goto('/'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email', { exact: true }).fill(student.email); await page.getByLabel('Password', { exact: true }).fill(student.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expectTrailWorkspace(page); await page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Progress', exact: true }).click();
  const section = page.getByRole('region', { name: 'Browse current result pages', exact: true }); await section.getByRole('button', { name: 'Browse current result pages', exact: true }).click(); await expect(section.getByRole('button', { name: 'Next result page', exact: true })).toBeVisible(); await section.getByRole('button', { name: 'Next result page', exact: true }).click(); await expect(section.getByRole('button', { name: 'Previous result page', exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download'); await section.getByRole('button', { name: 'Download current results across pages', exact: true }).click(); const download = await downloaded; expect(await download.failure()).toBeNull(); const html = await readFile((await download.path())!, 'utf8');
  for (let count = 0; count < 26; count++) expect(html).toContain(`${label} ${count + 1}`);
  expect(html).toContain('NOT_ESTABLISHED'); expect(html).not.toContain('<script>');
});
