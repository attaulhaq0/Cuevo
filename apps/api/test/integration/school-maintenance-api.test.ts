import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCustomerContext, type CustomerContext } from './customer-test-context';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('current school calendar maintenance', () => {
  let context: CustomerContext;
  beforeAll(async () => {
    context = await createCustomerContext();
    // Positive maintenance requires current distinguishable classes; retain
    // the shared duplicate identity fixture and separate authorization cases.
    await context.client.query("update app.classes set name=case when id=$2 then 'Synthetic maintenance Cedar class'else 'Synthetic maintenance Maple class'end where school_id=$1 and id in($2,$3)",[context.school,context.classId,context.secondClassId]);
  }, 60000);
  afterAll(async () => { await context?.close(); });
  it('corrects and cancels an exact event with history, expected revisions and current admin authority', async () => {
    const record = { classId: context.classId, title: 'Family school meeting', description: 'School-approved current event', startsAt: '2027-02-01T10:00:00Z', endsAt: '2027-02-01T11:00:00Z', parentVisible: true };
    const original = await context.command('admin', '/v1/school/calendar', record);
    const edited = await context.command('admin', `/v1/school/records/${original.id}/edit`, { resource: 'calendar', record: { ...record, title: 'Corrected family meeting' }, expectedRevision: 1, reason: 'School corrects the meeting title', confirmChange: true });
    expect(edited).toMatchObject({ id: original.id, revision: 2 });
    const current = await context.request('admin', '/v1/school/calendar?limit=100'); expect(current.statusCode).toBe(200); expect(current.json().items.find((row: { id: string }) => row.id === original.id)).toMatchObject({ title: 'Corrected family meeting', revision: 2 });
    const cancel = { resource: 'calendar', expectedRevision: 2, reason: 'School cancelled the meeting', confirmChange: true };
    expect((await context.request('teacher', `/v1/school/records/${original.id}/cancel`, cancel)).statusCode).toBe(403);
    expect((await context.request('admin', `/v1/school/records/${original.id}/cancel`, { ...cancel, expectedRevision: 1 })).statusCode).toBe(409);
    await context.command('admin', `/v1/school/records/${original.id}/cancel`, cancel);
    expect((await context.request('admin', '/v1/school/calendar?limit=100')).json().items.some((row: { id: string }) => row.id === original.id)).toBe(false);
    expect((await context.client.query('select count(*)::integer count from app.school_record_revisions where school_id=$1 and source_id=$2', [context.school, original.id])).rows[0].count).toBe(2);
  });
  it('current parent calendar honors publication withdrawal and new approval', async () => {
    await context.command('admin', '/v1/school/policies', { expectedVersion: 0, parentAttendanceVisible: false, parentUpcomingVisible: true, studentMessagingEnabled: false, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false, reason: 'Synthetic parent calendar approval', confirmPolicyApproval: true });
    const record = { classId: context.classId, title: 'Approved family event', description: 'Current event', startsAt: '2028-02-01T10:00:00Z', endsAt: '2028-02-01T11:00:00Z', parentVisible: true };
    const original = await context.command('admin', '/v1/school/calendar', record);
    expect((await context.request('parent', '/v1/school/calendar?limit=100')).json().items.some((row: { id: string }) => row.id === original.id)).toBe(true);
    await context.command('admin', `/v1/school/records/${original.id}/edit`, { resource: 'calendar', record: { ...record, parentVisible: false }, expectedRevision: 1, reason: 'Withdraw family publication', confirmChange: true });
    expect((await context.request('parent', '/v1/school/calendar?limit=100')).json().items.some((row: { id: string }) => row.id === original.id)).toBe(false);
    await context.command('admin', `/v1/school/records/${original.id}/edit`, { resource: 'calendar', record, expectedRevision: 2, reason: 'School reviewed and restored publication', confirmChange: true });
    expect((await context.request('parent', '/v1/school/calendar?limit=100')).json().items.some((row: { id: string }) => row.id === original.id)).toBe(true);
  });
  it('cancelled timetable slots stop blocking new current schedule work', async () => {
    const slot = { classId: context.classId, subjectId: context.subject, teacherId: '20000000-0000-4000-8000-000000000004', dayOfWeek: 4, startsAt: '14:00', endsAt: '15:00', effectiveFrom: '2027-01-01', effectiveTo: '2027-12-31', location: 'Current room' };
    const original = await context.command('admin', '/v1/school/timetable', slot);
    await context.command('admin', `/v1/school/records/${original.id}/cancel`, { resource: 'timetable', expectedRevision: 1, reason: 'School reschedules the lesson', confirmChange: true });
    const replacement = await context.request('admin', '/v1/school/timetable', slot);
    expect(replacement.statusCode, replacement.body).toBe(200);
  });
  it('admits newly approved current events and keeps context aligned after revision and cancellation', async () => {
    const record = { classId: context.classId, title: 'Initially private school meeting', description: 'Exact current approval regression', startsAt: '2029-02-01T10:00:00Z', endsAt: '2029-02-01T11:00:00Z', parentVisible: false };
    const original = await context.command('admin', '/v1/school/calendar', record);
    expect((await context.request('parent', '/v1/school/calendar?limit=100')).json().items.some((row: { id: string }) => row.id === original.id)).toBe(false);
    await context.command('admin', `/v1/school/records/${original.id}/edit`, { resource: 'calendar', record: { ...record, title: 'Newly approved school meeting', parentVisible: true }, expectedRevision: 1, reason: 'Current reviewed family publication', confirmChange: true });
    const parent = await context.request('parent', `/v1/school/calendar?limit=100&learnerId=20000000-0000-4000-8000-000000000012`);
    expect(parent.statusCode, parent.body).toBe(200);
    expect(parent.json().items.find((row: { id: string }) => row.id === original.id)).toMatchObject({ title: 'Newly approved school meeting', parentVisible: true, revision: 2 });
    const current = await context.request('parent', '/v1/school/context');
    expect(current.statusCode, current.body).toBe(200);
    expect(current.json().calendar.items.find((row: { id: string }) => row.id === original.id)).toMatchObject({ title: 'Newly approved school meeting', revision: 2 });
    await context.command('admin', `/v1/school/records/${original.id}/cancel`, { resource: 'calendar', expectedRevision: 2, reason: 'School cancels the current event', confirmChange: true });
    expect((await context.request('parent', '/v1/school/context')).json().calendar.items.some((row: { id: string }) => row.id === original.id)).toBe(false);
  });
  it('uses current class ownership before paging and selected-child filtering', async () => {
    const record = { classId: context.secondClassId, title: 'Moved current school event', description: 'Current class ownership regression', startsAt: '2029-03-01T10:00:00Z', endsAt: '2029-03-01T11:00:00Z', parentVisible: true };
    const original = await context.command('admin', '/v1/school/calendar', record);
    expect((await context.request('parent', '/v1/school/calendar?limit=100')).json().items.some((row: { id: string }) => row.id === original.id)).toBe(false);
    await context.command('admin', `/v1/school/records/${original.id}/edit`, { resource: 'calendar', record: { ...record, classId: context.classId }, expectedRevision: 1, reason: 'Move to the current learner class', confirmChange: true });
    const path = `/v1/school/calendar?limit=1&classId=${context.classId}&learnerId=20000000-0000-4000-8000-000000000012`;
    let cursor: string | null = null; const ids: string[] = [];
    for (let page = 0; page < 20; page++) {
      const result = await context.request('parent', path + (cursor ? `&cursor=${cursor}` : ''));
      expect(result.statusCode, result.body).toBe(200);
      ids.push(...result.json().items.map((item: { id: string }) => item.id));
      cursor = result.json().nextCursor; if (!cursor) break;
    }
    expect(ids).toContain(original.id); expect(new Set(ids).size).toBe(ids.length);
    expect((await context.request('otherTeacher', `/v1/school/calendar?limit=100&classId=${context.classId}`)).statusCode).toBe(403);
    await context.command('admin', `/v1/school/records/${original.id}/edit`, { resource: 'calendar', record, expectedRevision: 2, reason: 'Move away from the learner class', confirmChange: true });
    expect((await context.request('parent', path.replace('limit=1', 'limit=100'))).json().items.some((row: { id: string }) => row.id === original.id)).toBe(false);
  });
});
