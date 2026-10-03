import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('exact authorized notification source', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60000);
  afterAll(async () => { await context?.close(); });
  it('carries its own title and reads exact approved content with current guardian authorization', async () => {
    const announcement = await context.command('teacher', '/v1/community/announcements', { classId: context.classId, title: 'Exact family review', body: 'Review this exact school-approved source.', parentVisible: true });
    const notifications = await context.request('parent', '/v1/community/notifications?limit=1');
    expect(notifications.statusCode, notifications.body).toBe(200);
    expect(notifications.json().items.find((item: { id: string }) => item.id === announcement.id)).toMatchObject({ title: 'Exact family review', announcementId: announcement.id });
    const exact = await context.request('parent', `/v1/community/announcements/${announcement.id}`);
    expect(exact.statusCode, exact.body).toBe(200);
    expect(exact.json()).toMatchObject({ id: announcement.id, title: 'Exact family review', body: 'Review this exact school-approved source.', parentVisible: true });
    await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2", [context.school, customerActor(72)]);
    expect((await context.request('parent', `/v1/community/announcements/${announcement.id}`)).statusCode).toBe(403);
  });
});
