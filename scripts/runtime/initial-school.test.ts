import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { initialSchoolApprovalSchema, admitInitialSchool } from './initial-school';

const operator = '37000000-0000-4000-8000-000000000001'; const admin = '37000000-0000-4000-8000-000000000002'; const school = '37000000-0000-4000-8000-000000000003'; const session = '37000000-0000-4000-8000-000000000004';
const source = { schoolId: school, name: 'New reviewed school', countryCode: 'QA', languages: ['en', 'ar'], adminId: admin, adminEmail: 'new-admin@example.test', adminDisplayName: 'New administrator', controlRevision: 1, entitlements: ['school.context', 'school.operations'], reason: 'Reviewed local synthetic admission', confirmApproval: true };
const identity = (id: string, email: string) => ({ id, email, email_confirmed_at: '2026-10-03T00:00:00Z', is_anonymous: false });
const token = () => new SignJWT({ session_id: session }).setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32));
test('initial source rejects invented access, missing confirmation and duplicate axes', () => {
  assert.equal(initialSchoolApprovalSchema.parse(source).adminEmail, 'new-admin@example.test');
  for (const value of [{ ...source, entitlements: ['school.context', 'payroll'] }, { ...source, role: 'admin' }, { ...source, confirmApproval: false }, { ...source, entitlements: ['school.context', 'school.context'] }, { ...source, languages: ['en', 'en'] }]) assert.equal(initialSchoolApprovalSchema.safeParse(value).success, false);
});
test('operator verifies both exact identities before owner admission and validates its receipt', async () => {
  const jwt = await token(); const calls: { sql: string; args?: unknown[] }[] = []; let verifies = 0;
  const receipt = { id: school, administratorId: admin, admissionId: session, status: 'ADMITTED' };
  assert.deepEqual(await admitInitialSchool(source, 'original-school-key', { operatorToken: jwt, administratorToken: jwt, verify: async () => ++verifies === 1 ? identity(operator, 'operator@example.test') : identity(admin, source.adminEmail), query: async (sql, args) => { calls.push({ sql, args }); return { rows: [{ receipt }] }; } }), receipt);
  assert.equal(verifies, 2); assert.equal(calls[0].sql, 'BEGIN'); assert.equal(calls.at(-1)?.sql, 'COMMIT');
  const payload = JSON.parse(String(calls.find(call => call.sql.includes('admit_initial_school'))?.args?.[0])); assert.equal(payload.operatorSessionId, session); assert.equal(payload.adminSessionId, session);
  assert.ok(!JSON.stringify(calls).includes(jwt));
});
test('foreign or unconfirmed administrator cannot enter the database transaction', async () => {
  const jwt = await token(); for (const administrator of [identity(operator, source.adminEmail), identity(admin, 'other@example.test'), { ...identity(admin, source.adminEmail), email_confirmed_at: null }, { ...identity(admin, source.adminEmail), is_anonymous: true }]) {
    let calls = 0; let reads = 0; await assert.rejects(() => admitInitialSchool(source, 'original-school-key', { operatorToken: jwt, administratorToken: jwt, verify: async () => ++reads === 1 ? identity(operator, 'operator@example.test') : administrator, query: async () => { calls++; return { rows: [] }; } })); assert.equal(calls, 0);
  }
});
test('unknown owner receipt rolls back and never exposes raw database details', async () => {
  const jwt = await token(); let reads = 0; const calls: string[] = [];
  await assert.rejects(() => admitInitialSchool(source, 'original-school-key', { operatorToken: jwt, administratorToken: jwt, verify: async () => ++reads === 1 ? identity(operator, 'operator@example.test') : identity(admin, source.adminEmail), query: async sql => { calls.push(sql); if (sql.includes('admit_initial_school')) throw Error('database-secret'); return { rows: [] }; } }), /Reconcile the original request/);
  assert.equal(calls.at(-1), 'ROLLBACK'); assert.ok(!calls.includes('COMMIT'));
});
