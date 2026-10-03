import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseServerConfig } from '@cuevo/config';
import type { Database } from '../../src/platform/database/database';
import { AccountIdentityService, IdentityService, type MembershipRow } from '../../src/platform/identity/identity.service';
import { createAccountVerifier, createUserVerifier } from '../../src/platform/identity/supabase-auth';
import { createSchoolAccountController } from '../../src/modules/school/account.controller';
import { assertCuevoLocalConfig } from '../../../../scripts/configure-local';
import { withFixtureCleanup } from './fixture-cleanup';

/** Real Auth/controller/SQL, with purpose-restricted roles inside a rollback-only source fixture. */
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('school account invitation source actual Auth and private API', () => {
  const school = randomUUID(); const foreignSchool = randomUUID(); const recipient = `source-${randomUUID()}@example.test`;
  const actor = (index: number) => `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const roles = { admin: 1, coordinator: 2, teacher: 4, student: 12, parent: 72 } as const;
  type Role = keyof typeof roles;
  const tokens: Partial<Record<Role, string>> = {}; const clients: SupabaseClient[] = [];
  let owner: Pool; let connection: PoolClient; let restricted: Pool; let app: NestFastifyApplication;
  let baseline: { auth: number; people: number; memberships: number; requests: number; control: unknown };
  let invitationId = ''; let providerId = '';
  const inviteKey = randomUUID(); const invitation = { displayName: 'New school learner · طالب جديد', email: recipient, role: 'student', reason: 'Reviewed disposable synthetic invitation source', confirmInvitation: true };
  const request = (role: Role, path: string, body?: Record<string, unknown>, key = randomUUID(), selectedSchool = school) => app.inject({ method: body ? 'POST' : 'GET', url: path, headers: { authorization: `Bearer ${tokens[role]}`, 'x-school-id': selectedSchool, 'idempotency-key': key }, payload: body });

  beforeAll(async () => {
    const config = parseServerConfig(process.env, 'api');
    await readFile('supabase/config.toml', 'utf8').then(assertCuevoLocalConfig);
    if (!config.databaseUrl || !config.supabaseUrl || !config.supabasePublishableKey) throw Error('Configured local Cuevo required.');
    const databaseUrl = new URL(config.databaseUrl); const authUrl = new URL(config.supabaseUrl);
    if (databaseUrl.hostname !== '127.0.0.1' || databaseUrl.port !== '56322' || databaseUrl.pathname !== '/postgres' || databaseUrl.username !== 'cuevo_api' || databaseUrl.search || databaseUrl.hash || authUrl.origin !== 'http://127.0.0.1:56321' || authUrl.pathname !== '/' || authUrl.search || authUrl.hash || authUrl.username || authUrl.password) throw Error('Invitation source fixture refuses another target.');
    restricted = new Pool({ connectionString: config.databaseUrl, max: 1, statement_timeout: 5000 });
    databaseUrl.username = 'postgres'; databaseUrl.password = 'postgres'; owner = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
    connection = await owner.connect();
    const population = (await connection.query('select count(*)::integer count,bool_and(synthetic)is_synthetic from app.people')).rows[0];
    if (population.count !== 133 || population.is_synthetic !== true) throw Error('Source fixture requires restored entirely synthetic reference people.');
    baseline = (await connection.query('select(select count(*)::integer from auth.users)auth,(select count(*)::integer from app.people)people,(select count(*)::integer from app.memberships)memberships,(select count(*)::integer from internal.school_account_requests)requests,(select to_jsonb(control)from internal.school_account_runtime_control control where singleton)control')).rows[0];
    if (typeof baseline.control !== 'object' || baseline.control === null || (baseline.control as { enabled?: unknown }).enabled !== false) throw Error('Source fixture requires disabled shared provisioning control.');
    const password = (JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
    const identities = (JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
    for (const [role, index] of Object.entries(roles)) {
      const identity = identities.find(candidate => candidate.actorId === actor(index)); if (!identity) throw Error('Synthetic actor source missing.');
      const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); clients.push(client);
      const signed = await client.auth.signInWithPassword({ email: identity.email, password }); if (!signed.data.session) throw Error('Actual synthetic sign-in unavailable.'); tokens[role as Role] = signed.data.session.access_token;
    }
    await connection.query('BEGIN');
    await connection.query("select set_config('app.runtime_env','local',true)");
    const control = (await connection.query('select revision from internal.school_account_runtime_control where singleton')).rows[0];
    await connection.query('select internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),$1,$2,$3,$4,true)', ['LOCAL_CUEVO', actor(1), 'Rollback-only actual Auth invitation source verification', control.revision]);
    for (const id of [school, foreignSchool]) {
      await connection.query("insert into app.schools(id,name,country_code)values($1,'Invitation source synthetic school','QA')", [id]);
      for (const [role, index] of Object.entries(roles)) {
        if (id === foreignSchool && role !== 'teacher') continue;
        await connection.query("insert into app.memberships(school_id,actor_id,role,effective_from)values($1,$2,$3,clock_timestamp()-interval'1 day')", [id, actor(index), role]);
        await connection.query('insert into app.people(school_id,actor_id,display_name,synthetic)values($1,$2,$3,true)', [id, actor(index), `Source ${role}`]);
      }
      for (const code of ['school.context', 'school.operations']) await connection.query("insert into app.entitlements(school_id,code,enabled,effective_from)values($1,$2,true,clock_timestamp()-interval'1 day')", [id, code]);
    }
    const database = { actorTransaction: async <T>(userId: string, schoolId: string | undefined, callback: (client: PoolClient) => Promise<T>) => {
      await connection.query('SAVEPOINT invitation_request');
      try {
        await connection.query('set local role cuevo_api'); await connection.query("set local statement_timeout='5s'");
        await connection.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [userId, schoolId ?? '']);
        const result = await callback(connection); await connection.query('reset role'); await connection.query("set local statement_timeout='0'"); await connection.query('RELEASE SAVEPOINT invitation_request'); return result;
      } catch (error) { await connection.query('ROLLBACK TO SAVEPOINT invitation_request'); await connection.query('reset role'); await connection.query('RELEASE SAVEPOINT invitation_request'); throw error; }
    } } as unknown as Database;
    const currentSession = (userId: string, sessionId: string) => database.actorTransaction(userId, undefined, async client => (await client.query('select "authorization".is_current_session($1::uuid)as active', [sessionId])).rows[0]?.active === true);
    const identity = new IdentityService({ verifyUser: createUserVerifier(config), isCurrentSession: currentSession, currentMemberships: userId => database.actorTransaction(userId, undefined, async client => (await client.query<MembershipRow>('select *from "authorization".current_memberships()')).rows) });
    const accountIdentity = new AccountIdentityService({ verifyAccount: createAccountVerifier(config), isCurrentSession: currentSession });
    const controller = createSchoolAccountController(identity, accountIdentity, database); @Module({ controllers: [controller] }) class SourceModule {}
    app = await NestFactory.create<NestFastifyApplication>(SourceModule, new FastifyAdapter({ logger: false }), { logger: false }); await app.init(); await app.getHttpAdapter().getInstance().ready();
  }, 60000);

  afterAll(async () => {
    await withFixtureCleanup(async () => {}, [
      () => app?.close(), () => connection?.query('ROLLBACK'),
      async () => {
        if (!connection || !baseline) return;
        const restored = (await connection.query('select(select count(*)::integer from auth.users)auth,(select count(*)::integer from app.people)people,(select count(*)::integer from app.memberships)memberships,(select count(*)::integer from internal.school_account_requests)requests,(select to_jsonb(control)from internal.school_account_runtime_control control where singleton)control')).rows[0];
        expect(restored).toEqual(baseline); expect((await connection.query('select count(*)::integer count from app.schools where id=any($1::uuid[])', [[school, foreignSchool]])).rows[0].count).toBe(0);
      },
      async () => { for (const client of clients) { const result = await client.auth.signOut({ scope: 'local' }); if (result.error) throw Error('Owned source-session cleanup failed.'); } },
      () => connection?.release(), () => restricted?.end(), () => owner?.end(),
    ]);
  });

  it('admin creates one immutable source, reads it and replays its exact original key without provider or membership effects', async () => {
    const created = await request('admin', '/v1/school/accounts/invitations', invitation, inviteKey); expect(created.statusCode).toBe(200);
    const receipt = created.json(); invitationId = receipt.id; expect(receipt).toMatchObject({ schoolId: school, revision: 1, status: 'REQUESTED' }); expect(created.headers['cache-control']).toBe('no-store'); expect(created.body).not.toContain(recipient);
    const replay = await request('admin', '/v1/school/accounts/invitations', invitation, inviteKey); expect(replay.statusCode).toBe(200); expect(replay.json()).toEqual(receipt);
    const page = await request('admin', '/v1/school/accounts/invitations?limit=25'); expect(page.statusCode).toBe(200); expect(page.json().items).toEqual([{ ...receipt, displayName: invitation.displayName, email: invitation.email, role: invitation.role, userId: null }]);
    const source = (await connection.query('select provider_user_id,display_name,email,role,approving_member_revision,control_revision from internal.school_account_requests where school_id=$1 and id=$2', [school, invitationId])).rows[0]; providerId = source.provider_user_id;
    expect(source).toMatchObject({ display_name: invitation.displayName, email: recipient, role: 'student', approving_member_revision: 1 }); expect(providerId).toMatch(/^[a-f0-9-]{36}$/);
    expect((await connection.query('select count(*)::integer count from app.memberships where actor_id=$1', [providerId])).rows[0].count).toBe(0); expect((await connection.query('select count(*)::integer count from auth.users where id=$1', [providerId])).rows[0].count).toBe(0);
    const event = (await connection.query('select type,metadata,state,attempt_count from internal.outbox_events where school_id=$1 and entity_id=$2', [school, invitationId])).rows; expect(event).toEqual([{ type: 'school.account.provisioning_requested', metadata: { requestRevision: 1 }, state: 'PENDING', attempt_count: 0 }]);
    const audit = (await connection.query('select action,metadata from internal.audit_events where school_id=$1 and entity_id=$2', [school, invitationId])).rows; expect(audit).toEqual([{ action: 'school.account.invited', metadata: { requestRevision: 1 } }]);
  }, 30000);

  it('denies duplicate recipients, forged privileges, wrong roles, wrong school and unauthorized cursors through actual API requests', async () => {
    expect(invitationId).toBeTruthy();
    expect((await request('admin', '/v1/school/accounts/invitations', { ...invitation, email: recipient.toUpperCase() })).statusCode).toBe(409);
    expect((await request('admin', '/v1/school/accounts/invitations', { ...invitation, entitlements: ['all'] })).statusCode).toBe(400);
    for (const role of ['teacher', 'student', 'parent', 'coordinator'] as const) expect((await request(role, '/v1/school/accounts/invitations', { ...invitation, email: `${role}-${recipient}` })).statusCode).toBe(403);
    expect((await request('admin', '/v1/school/accounts/invitations', invitation, randomUUID(), foreignSchool)).statusCode).toBe(403);
    expect((await request('admin', `/v1/school/accounts/invitations?cursor=${randomUUID()}`)).statusCode).toBe(403);
    expect((await connection.query('select count(*)::integer count from internal.school_account_requests where school_id=$1', [school])).rows[0].count).toBe(1);
  }, 30000);

  it('revokes the exact current source with original-key reconciliation and truthful untouched Auth cancellation', async () => {
    const key = randomUUID(); const body = { expectedRevision: 1, reason: 'Reviewed recipient cancellation', confirmRevocation: true };
    expect((await request('admin', `/v1/school/accounts/invitations/${invitationId}/revoke`, { ...body, expectedRevision: 2 })).statusCode).toBe(409);
    const revoked = await request('admin', `/v1/school/accounts/invitations/${invitationId}/revoke`, body, key); expect(revoked.statusCode).toBe(200); expect(revoked.json()).toMatchObject({ id: invitationId, status: 'REVOKED', revision: 2 });
    const replay = await request('admin', `/v1/school/accounts/invitations/${invitationId}/revoke`, body, key); expect(replay.statusCode).toBe(200); expect(replay.json()).toEqual(revoked.json());
    expect((await request('admin', '/v1/school/accounts/invitations', invitation, inviteKey)).statusCode).toBe(403);
    const sources = (await connection.query('select revision,status from internal.school_account_request_revisions where request_id=$1 order by revision', [invitationId])).rows; expect(sources).toEqual([{ revision: 1, status: 'REQUESTED' }, { revision: 2, status: 'REVOKED' }]);
    const event = (await connection.query("select state,last_error_code from internal.outbox_events where school_id=$1 and entity_id=$2 and type='school.account.provisioning_requested'", [school, invitationId])).rows; expect(event).toEqual([{ state: 'COMPLETED', last_error_code: 'REQUEST_REVOKED' }]);
    expect((await connection.query('select count(*)::integer count from app.memberships where actor_id=$1', [providerId])).rows[0].count).toBe(0);
  }, 30000);

  it('actual restricted API login cannot read source or control tables or execute the owner activation helper', async () => {
    expect((await restricted.query('select current_user')).rows[0].current_user).toBe('cuevo_api');
    for (const table of ['school_account_requests', 'school_account_request_revisions', 'school_account_runtime_control', 'school_account_runtime_revisions']) await expect(restricted.query(`select *from internal.${table}`)).rejects.toMatchObject({ code: '42501' });
    await expect(restricted.query('select internal.configure_local_school_account_runtime(true,(select oid from pg_catalog.pg_database where datname=current_database()),$1,$2,$3,0,true)', ['LOCAL_CUEVO', actor(1), 'Denied API activation'])).rejects.toMatchObject({ code: '42501' });
  });
});
