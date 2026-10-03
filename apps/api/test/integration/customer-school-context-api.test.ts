import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('current named daily school context', () => {
  let context: CustomerContext;
  beforeAll(async () => {
    context = await createCustomerContext();
    // This positive journey uses distinguishable current school-authored
    // context; the shared duplicate fixture remains intact for deny cases.
    await context.client.query("update app.classes set name=case when id=$2 then 'Synthetic daily Cedar class'else 'Synthetic daily Maple class'end where school_id=$1 and id in($2,$3)",[context.school,context.classId,context.secondClassId]);
    await context.client.query("update app.people set display_name=case when actor_id=$2 then 'Synthetic daily Alex learner'else 'Synthetic daily Jordan learner'end where school_id=$1 and actor_id in($2,$3)",[context.school,customerActor(12),customerActor(13)]);
  }, 60000);
  afterAll(async () => { await context?.close(); });
  it('parent attendance uses the exact selected child and source class labels without staff notes', async () => {
    await context.client.query("insert into app.school_policy_versions(school_id,version,parent_attendance_visible,parent_upcoming_visible,reason,approved_by)values($1,1,true,true,'Synthetic family daily context',$2)", [context.school, customerActor(1)]);
    await context.command('teacher', '/v1/school/attendance', { classId: context.classId, studentId: customerActor(12), occurredOn: '2026-10-02', status: 'late', note: 'PRIVATE STAFF NOTE', expectedRevision: 0 });
    const response = await context.request('parent', `/v1/school/attendance?limit=100&learnerId=${customerActor(12)}`);
    expect(response.statusCode, response.body).toBe(200);
    const row = response.json().items[0];
    expect(row).toMatchObject({ learnerId: customerActor(12), learnerName: 'Synthetic daily Alex learner', className: 'Synthetic daily Cedar class', academicYearName: 'Synthetic year', note: null });
    expect(response.body).not.toContain('PRIVATE STAFF NOTE');
    await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2 and student_actor_id=$3", [context.school, customerActor(72), customerActor(12)]);
    expect((await context.request('parent', `/v1/school/attendance?limit=100&learnerId=${customerActor(12)}`)).statusCode).toBe(403);
  });
  it('attendance roster contains only current selected class learners and rejects parent roster reads', async () => {
    await context.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,status,effective_from)values($1,$2,$3,'active',now()-interval '1 day')", [context.school, context.secondClassId, customerActor(21)]);
    const response = await context.request('teacher', `/v1/school/attendance-roster?limit=100&classId=${context.secondClassId}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().items.map((item: { id: string }) => item.id)).toEqual([customerActor(21)]);
    expect(response.json().items[0]).toMatchObject({ classId: context.secondClassId, displayName: expect.any(String), className: 'Synthetic daily Maple class' });
    expect((await context.request('parent', `/v1/school/attendance-roster?limit=100&classId=${context.classId}`)).statusCode).toBe(403);
    expect((await context.request('teacher', '/v1/school/attendance-roster?limit=100')).statusCode).toBe(400);
  });
  it('selected child timetable does not inherit a sibling class and carries subject and teacher meaning', async () => {
    const slot = await context.command('admin', '/v1/school/timetable', { classId: context.secondClassId, subjectId: context.subject, teacherId: customerActor(4), dayOfWeek: 4, startsAt: '14:00', endsAt: '15:00', effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31', location: 'Synthetic room' });
    await context.client.query("insert into app.parent_relationships(school_id,parent_actor_id,student_actor_id,relationship_type,status,effective_from)values($1,$2,$3,'parent','active',now()-interval '1 day')", [context.school, customerActor(72), customerActor(21)]);
    const unrelatedClass = await context.request('parent', `/v1/school/timetable?limit=100&learnerId=${customerActor(13)}`);
    expect(unrelatedClass.statusCode).toBe(200); expect(unrelatedClass.json().items.some((row: { id: string }) => row.id === slot.id)).toBe(false);
    const selected = await context.request('parent', `/v1/school/timetable?limit=100&learnerId=${customerActor(21)}`);
    expect(selected.statusCode).toBe(200); expect(selected.json().items.find((row: { id: string }) => row.id === slot.id)).toMatchObject({ className: 'Synthetic daily Maple class', subjectName: 'School Custom synthetic subject', teacherName: 'Synthetic teacher — تعلّم', academicYearName: 'Synthetic year' });
  });
});
