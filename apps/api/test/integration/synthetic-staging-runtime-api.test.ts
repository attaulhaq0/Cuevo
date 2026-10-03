import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import { createApp } from '../../src/app';
import { customerActor, createCustomerContext } from './customer-test-context';
import { withFixtureCleanup } from './fixture-cleanup';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('general staging source admission with real local Auth and restricted SQL', () => {
  it('denies mixed or missing school populations and original-key replay before ordinary domain writes, then recovers', async () => {
    const context = await createCustomerContext({ committed: true });
    let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
    try {
      const config = parseServerConfig({ ...process.env, NODE_ENV: 'test', AI_GENERATION_MODE: 'DISABLED', AI_FIXTURE_ENABLED: 'false' }, 'api');
      if (!config.databaseUrl || !config.supabaseUrl || !config.supabasePublishableKey || !['127.0.0.1', 'localhost'].includes(new URL(config.databaseUrl).hostname) || new URL(config.databaseUrl).port !== '56322') throw new Error('Verified local synthetic integration target required.');
      // Exercise production createApp staging composition on the separately guarded local fixture.
      // Exact hosted configuration and certificate validation have their own configuration/transport tests.
      runtime = await createApp({ ...config, deploymentEnvironment: 'synthetic-staging', databaseTls: false });
      const identities = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] };
      const password = (JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
      const auth = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const signIn = await auth.auth.signInWithPassword({ email: identities.actors.find(actor => actor.actorId === customerActor(1))!.email, password });
      if (!signIn.data.session) throw new Error('Verified local synthetic administrator required.');
      const headers = { authorization: `Bearer ${signIn.data.session.access_token}`, 'x-school-id': context.school, 'idempotency-key': 'staging-original-source-command' };
      const request = (path: string, payload?: Record<string, unknown>) => runtime!.app.inject({ method: payload ? 'POST' : 'GET', url: path, headers, payload });
      const input = { name: 'Staging source-admitted subject' };
      expect((await request('/v1/me')).statusCode).toBe(200);
      const created = await request('/v1/school/subjects', input); expect(created.statusCode).toBe(200); const source = created.json();
      const counts = async () => (await context.client.query('select (select count(*)from internal.audit_events where school_id=$1)as audits,(select count(*)from internal.outbox_events where school_id=$1)as events,(select count(*)from internal.idempotency_keys where school_id=$1)as commands', [context.school])).rows[0];
      const before = await counts();
      const staleActor = { userId: customerActor(1), schoolId: context.school };
      await context.client.query('update app.people set synthetic=false where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]);
      const identity = await request('/v1/me'); expect(identity.statusCode).toBe(403); expect(JSON.stringify(identity.json())).not.toMatch(/Synthetic|Customer acceptance synthetic school|displayName|entitlement/);
      expect((await request('/v1/school/subjects?limit=100')).statusCode).toBe(403);
      expect((await request('/v1/school/subjects', input)).statusCode).toBe(403);
      let callbackRan = false;
      await expect(runtime.database.actorTransaction(staleActor.userId, staleActor.schoolId, async client => { callbackRan = true; await client.query('select internal.begin_command($1,$2,$3)', ['staging-original-source-command', 'school.subject.create', context.fingerprint(input)]); })).rejects.toMatchObject({ code: 'SYNTHETIC_SCHOOL_REQUIRED' });
      expect(callbackRan).toBe(false); expect(await counts()).toEqual(before);
      // Ordinary local mode does not acquire the staging population restriction.
      expect((await context.request('admin', '/v1/school/subjects?limit=100')).statusCode).toBe(200);
      await context.client.query('update app.people set synthetic=true where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]);
      const recovered = await request('/v1/school/subjects', input); expect(recovered.statusCode).toBe(200); expect(recovered.json()).toEqual(source); expect(await counts()).toEqual(before);
      await context.client.query("update app.memberships set status='suspended'where school_id=$1 and actor_id=$2", [context.school, customerActor(1)]);
      expect((await request('/v1/me')).statusCode).toBe(403);
      await expect(runtime.database.actorTransaction(staleActor.userId, staleActor.schoolId, async () => 'must not return')).rejects.toMatchObject({ code: 'SYNTHETIC_SCHOOL_REQUIRED' });
      await context.client.query("update app.memberships set status='active'where school_id=$1 and actor_id=$2", [context.school, customerActor(1)]);
      await context.client.query('delete from app.people where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]);
      expect((await request('/v1/me')).statusCode).toBe(403);
      await context.client.query('insert into app.people(school_id,actor_id,display_name,synthetic)values($1,$2,$3,true)', [context.school, customerActor(13), 'Restored synthetic learner']);
      expect((await request('/v1/me')).statusCode).toBe(200);
      expect((await request('/v1/school/subjects?limit=100')).json().items.some((item: { id: string }) => item.id === source.id)).toBe(true);
    } finally {
      await withFixtureCleanup(async () => undefined, [() => runtime?.close(), () => context.close()]);
    }
  }, 60000);
});
