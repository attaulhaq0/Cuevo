import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('sanitized current school audit', () => {
  let context: CustomerContext;
  beforeAll(async () => {
    context = await createCustomerContext();
    // Audit success needs one identifiable current source. The shared fixture's
    // same-caption people/classes remain available to the selection-denial suites.
    await context.client.query('update app.people set display_name=$3 where school_id=$1 and actor_id=$2', [context.school, customerActor(12), 'Audit current learner']);
    await context.client.query('update app.classes set name=case id when $2 then $4 else $5 end where school_id=$1 and id=any($3::uuid[])', [context.school, context.classId, [context.classId, context.secondClassId], 'Audit Cedar class', 'Audit Palm class']);
  }, 60000);
  afterAll(async () => { await context?.close(); });
  it('administrator can inspect actions without raw metadata while other roles are denied', async () => {
    const roster = await context.request('teacher', `/v1/school/attendance-roster?limit=100&classId=${context.classId}`);
    expect(roster.statusCode, roster.body).toBe(200);
    expect(roster.json().items.find((item: { id: string }) => item.id === customerActor(12))).toMatchObject({ displayName: 'Audit current learner', className: 'Audit Cedar class', yearGroupName: 'Synthetic group', academicYearName: 'Synthetic year', selectionContext: { status: 'READY' } });
    await context.command('teacher', '/v1/school/attendance', { classId: context.classId, studentId: customerActor(12), occurredOn: '2026-10-02', status: 'late', note: 'RAW PRIVATE NOTE MUST NOT APPEAR', expectedRevision: 0 });
    const audit = await context.request('admin', '/v1/school/audit?limit=100');
    expect(audit.statusCode, audit.body).toBe(200);
    const row = audit.json().items.find((item: { action: string }) => item.action === 'school.attendance.record');
    expect(row).toMatchObject({ actorName: 'Synthetic teacher — تعلّم', action: 'school.attendance.record', outcome: 'succeeded', objectType: 'school_operation' });
    expect(audit.body).not.toMatch(/RAW PRIVATE NOTE|metadata|access_token|session_id/);
    for (const actor of ['teacher', 'coordinator', 'parent', 'strong'] as const) expect((await context.request(actor, '/v1/school/audit?limit=100')).statusCode).toBe(403);
  });
});
