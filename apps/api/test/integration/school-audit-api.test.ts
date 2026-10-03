import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('sanitized current school audit', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  it('administrator can inspect actions without raw metadata while other roles are denied', async () => {
    await context.command('teacher', '/v1/school/attendance', { classId: context.classId, studentId: customerActor(12), occurredOn: '2026-10-02', status: 'late', note: 'RAW PRIVATE NOTE MUST NOT APPEAR', expectedRevision: 0 });
    const audit = await context.request('admin', '/v1/school/audit?limit=100');
    expect(audit.statusCode, audit.body).toBe(200);
    const row = audit.json().items.find((item: { action: string }) => item.action === 'school.attendance.record');
    expect(row).toMatchObject({ actorName: 'Synthetic teacher — تعلّم', action: 'school.attendance.record', outcome: 'succeeded', objectType: 'school_operation' });
    expect(audit.body).not.toMatch(/RAW PRIVATE NOTE|metadata|access_token|session_id/);
    for (const actor of ['teacher', 'coordinator', 'parent', 'strong'] as const) expect((await context.request(actor, '/v1/school/audit?limit=100')).statusCode).toBe(403);
  });
});
