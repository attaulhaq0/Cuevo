import { config as dotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCustomerContext, customerActor } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';

describe.skipIf(!enabled)('current Auth/API/browser diagnostics privacy source', () => {
  it('denies unapproved, unsafe, mixed-school and revoked actor writes and records one audited source', async () => {
    const context = await createCustomerContext();
    try {
      const observation = { diagnosticId: randomUUID(), category: 'api_error', feature: 'learning', status: 'denied', timing: 'under_250ms', locale: 'ar', viewport: 'mobile' };
      expect((await context.request('strong', '/v1/diagnostics/config')).json()).toEqual({ enabled: false });
      expect((await context.request('strong', '/v1/diagnostics/browser', observation, observation.diagnosticId)).statusCode).toBe(403);
      await context.client.query("set local app.runtime_env='local'");
      await context.client.query("insert into app.school_policy_versions(school_id,version,reason,approved_by,analytics_enabled)values($1,1,'Synthetic diagnostics API approval',$2,true)", [context.school, customerActor(1)]);
      await context.client.query('select internal.configure_posthog_school($1,true,\'QA\',1)', [context.school]);
      expect((await context.request('strong', '/v1/diagnostics/config')).json()).toEqual({ enabled: true });
      const unsafe = await context.request('strong', '/v1/diagnostics/browser', { ...observation, message: 'private child answer', url: '/private' }, observation.diagnosticId);
      expect(unsafe.statusCode).toBe(400); expect(unsafe.body).not.toContain('private child answer');
      expect((await context.request('strong', '/v1/diagnostics/browser', observation, observation.diagnosticId)).json()).toEqual({ recorded: true, duplicate: false });
      expect((await context.request('strong', '/v1/diagnostics/browser', observation, observation.diagnosticId)).json()).toEqual({ recorded: true, duplicate: true });
      await context.drain();
      const source = (await context.client.query('select payload from internal.browser_diagnostics where id=$1', [observation.diagnosticId])).rows[0]?.payload;
      expect(source).toEqual({ category: 'api_error', feature: 'learning', status: 'denied', timing: 'under_250ms', locale: 'ar', viewport: 'mobile' });
      const events = (await context.client.query("select id,state from internal.outbox_events where school_id=$1 and entity_id=$2 and type='diagnostic.browser'", [context.school, observation.diagnosticId])).rows;
      expect(events).toHaveLength(1); expect(events[0].state).toBe('COMPLETED');
      expect((await context.client.query('select internal.posthog_source_event_allowed($1) allowed', [events[0].id])).rows[0].allowed).toBe(true);
      await context.client.query('update app.people set synthetic=false where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]);
      expect((await context.request('strong', '/v1/diagnostics/config')).json()).toEqual({ enabled: false });
      const next = { ...observation, diagnosticId: randomUUID() };
      expect((await context.request('strong', '/v1/diagnostics/browser', next, next.diagnosticId)).statusCode).toBe(403);
      await context.client.query('update app.people set synthetic=true where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]);
      await context.client.query("update app.memberships set status='revoked' where school_id=$1 and actor_id=$2", [context.school, customerActor(12)]);
      expect((await context.request('strong', '/v1/diagnostics/config')).statusCode).toBe(403);
    } finally { await context.close(); }
  });
});
