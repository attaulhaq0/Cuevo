import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseServerConfig } from '@cuevo/config';
import { schoolAccountClaimReceiptSchema, schoolAccountEffectReceiptSchema, schoolAccountInvitationReceiptSchema } from '@cuevo/contracts';
import { createApp } from '../../src/app';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../../../../scripts/configure-local';
import { requireLocalInvitationCapture } from '../../../../scripts/runtime/local-school-accounts';
import { withFixtureCleanup } from './fixture-cleanup';

const school = '10000000-0000-4000-8000-000000000001';
const administrator = '20000000-0000-4000-8000-000000000001';
const otherStudent = '20000000-0000-4000-8000-000000000012';
const authOrigin = 'http://127.0.0.1:56321';
const captureOrigin = 'http://127.0.0.1:56324';
type Runtime = Awaited<ReturnType<typeof createApp>>;
type Counts = { auth: number; people: number; memberships: number; requests: number; revisions: number; claims: number; tokens: number; consumptions: number; leases: number; attempts: number; receipts: number; results: number; processed: number; audit: number; events: number; commands: number; access: number };
type InvitationSource = { id: string; school_id: string; requested_by: string; provider_user_id: string; display_name: string; email: string; role: string; current_status: string; current_revision: number };
type CapturedMessage = { Text: string; Subject: string; To: { Name: string; Address: string }[] };
const countsSql = `select (select count(*)::integer from auth.users)auth,
 (select count(*)::integer from app.people)people,(select count(*)::integer from app.memberships)memberships,
 (select count(*)::integer from internal.school_account_requests)requests,
 (select count(*)::integer from internal.school_account_request_revisions)revisions,
 (select count(*)::integer from internal.school_account_claims)claims,
 (select count(*)::integer from internal.school_account_token_digests)tokens,
 (select count(*)::integer from internal.school_account_token_consumptions)consumptions,
 (select count(*)::integer from internal.school_account_effect_leases)leases,
 (select count(*)::integer from internal.school_account_effect_attempts)attempts,
 (select count(*)::integer from internal.school_account_effect_receipts)receipts,
 (select count(*)::integer from internal.school_account_effect_results)results,
 (select count(*)::integer from internal.processed_events)processed,
 (select count(*)::integer from internal.audit_events)audit,(select count(*)::integer from internal.outbox_events)events,
 (select count(*)::integer from internal.idempotency_keys)commands,(select count(*)::integer from internal.school_access_revisions)access`;
const sourceSql = 'select id,school_id,requested_by,provider_user_id,display_name,email,role,current_status,current_revision from internal.school_account_requests where email=$1';

/** Committed local journey: no mocked provider, role substitution, external mail or app listeners. */
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('school account admission through normal Auth, API pool and captured invitation', () => {
  it('creates a new identity, redeems the actual invite, admits once under concurrent replay and denies revoked access', async () => {
    const email = `admission-${randomUUID()}@example.test`;
    const displayName = 'New invited learner · متعلم مدعو جديد';
    const inviteKey = randomUUID(); const claimKey = randomUUID(); const revokeKey = randomUUID();
    let owner: Pool | undefined; let connection: PoolClient | undefined; let runtime: Runtime | undefined; let disabledRuntime: Runtime | undefined;
    let adminAuth: SupabaseClient | undefined; let studentAuth: SupabaseClient | undefined; let recipientAuth: SupabaseClient | undefined; let providerAuth: SupabaseClient | undefined;
    let baseline: Counts | undefined; let initialControlRevision: number | undefined; let activatedRevision: number | undefined;
    let initialControlHistory: unknown[] = []; let targetVerified = false; let captureVerified = false;
    let invitationId = ''; let providerId = ''; let admissionSecret = ''; let redemption = ''; let recipientToken = '';
    const ownedMessageIds = new Set<string>();
    const localFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== authOrigin || url.username || url.password) throw Error('Admission fixture refuses another Auth target.');
      return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) });
    };
    const lookupMessages = async (cleanup = false): Promise<string[]> => {
      if (!captureVerified) throw Error('Exact local invitation capture has not been verified.');
      const response = await fetch(`${captureOrigin}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=2`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw Error('Owned invitation capture lookup unavailable.');
      const body = await response.json() as { messages?: { ID?: unknown }[]; total?: unknown };
      if (!Array.isArray(body.messages) || body.messages.length > (cleanup ? 2 : 1) || typeof body.total === 'number' && body.total > (cleanup ? 2 : 1) || body.messages.some(row => typeof row.ID !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.ID))) throw Error('Owned invitation capture identity requires review.');
      const ids = body.messages.map(row => row.ID as string);
      if (new Set(ids).size !== ids.length) throw Error('Owned invitation capture IDs are ambiguous.');
      return ids;
    };
    const readMessage = async (id: string): Promise<CapturedMessage> => {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error('Owned capture message ID invalid.');
      const response = await fetch(`${captureOrigin}/api/v1/message/${id}`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw Error('Owned invitation capture read unavailable.');
      const message = await response.json() as CapturedMessage;
      if (message.Subject !== 'Cuevo school invitation · دعوة المدرسة' || typeof message.Text !== 'string' || message.Text.length > 16384 || !Array.isArray(message.To) || message.To.length !== 1 || message.To[0].Address !== email) throw Error('Invitation capture ownership or content requires review.');
      return message;
    };
    const source = async (): Promise<InvitationSource | undefined> => {
      if (!connection || !targetVerified) throw Error('Verified local owner connection required.');
      const rows = (await connection.query<InvitationSource>(sourceSql, [email])).rows;
      if (rows.length > 1) throw Error('Disposable admission source is ambiguous.');
      const row = rows[0];
      if (row && (row.school_id !== school || row.requested_by !== administrator || row.display_name !== displayName || row.email !== email || row.role !== 'student' || invitationId && row.id !== invitationId || providerId && row.provider_user_id !== providerId)) throw Error('Admission cleanup refuses a source outside exact fixture ownership.');
      if (row) { invitationId = row.id; providerId = row.provider_user_id; }
      return row;
    };
    const configureControl = async (enabled: boolean) => {
      if (!connection || !targetVerified) throw Error('Verified local owner connection required.');
      await connection.query('BEGIN');
      try {
        await connection.query("select set_config('app.runtime_env','local',true)");
        const current = (await connection.query<{ revision: number }>('select revision from internal.school_account_runtime_control where singleton for update')).rows[0];
        if (!current || !Number.isInteger(current.revision)) throw Error('Current local admission approval unavailable.');
        const result = await connection.query<{ revision: number }>('select internal.configure_local_school_account_runtime($1,(select oid from pg_catalog.pg_database where datname=current_database()),$2,$3,$4,$5,true)as revision', [enabled, 'LOCAL_CUEVO', administrator, enabled ? 'Actual local synthetic invitation and recipient admission verification' : 'Completed disposable local admission verification; disable execution', current.revision]);
        if (result.rows[0]?.revision !== current.revision + 1) throw Error('Local admission approval revision unavailable.');
        await connection.query('COMMIT'); return result.rows[0].revision;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
    };
    const assertSecretFree = (body: string) => {
      if (/token_hash|admission_secret|admissionSecret|access_token|refresh_token|service_role|password/i.test(body) || admissionSecret && body.includes(admissionSecret) || redemption && body.includes(redemption) || recipientToken && body.includes(recipientToken)) throw Error('Credential found in admission response.');
    };

    await withFixtureCleanup(async () => {
      const projectConfig = await readFile('supabase/config.toml', 'utf8'); assertCuevoLocalConfig(projectConfig);
      // Capture the dedicated local provider credential directly; never read the Storage recipient.
      const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 })) as LocalStatus & { INBUCKET_URL?: string };
      assertCuevoLocalTarget(status); requireLocalInvitationCapture(projectConfig, status);
      if (new URL(status.API_URL).origin !== authOrigin || new URL(status.DB_URL).hostname !== '127.0.0.1') throw Error('Admission fixture requires exact loopback Cuevo targets.');
      const input = { NODE_ENV: 'test', CUEVO_DEPLOYMENT_ENVIRONMENT: 'local', DATABASE_URL: process.env.DATABASE_URL,
        SUPABASE_URL: authOrigin, SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, API_ALLOWED_ORIGIN: 'http://localhost:3000',
        AI_GENERATION_MODE: 'DISABLED', AI_FIXTURE_ENABLED: 'false', POSTHOG_CAPTURE_MODE: 'DISABLED',
        CUEVO_AUTH_PROVISIONING_MODE: 'LOCAL_SYNTHETIC', CUEVO_AUTH_PROVISIONING_URL: authOrigin,
        CUEVO_AUTH_PROVISIONING_PROJECT_REF: 'LOCAL_CUEVO', CUEVO_AUTH_PROVISIONING_WEB_ORIGIN: 'http://localhost:3000', CUEVO_AUTH_PROVISIONING_KEY: status.SERVICE_ROLE_KEY };
      const config = parseServerConfig(input, 'api');
      if (!config.databaseUrl) throw Error('Restricted local API database configuration required.');
      const databaseUrl = new URL(config.databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || databaseUrl.hostname !== '127.0.0.1' || databaseUrl.port !== '56322' || databaseUrl.pathname !== '/postgres' || databaseUrl.username !== 'cuevo_api' || databaseUrl.search || databaseUrl.hash) throw Error('Admission fixture refuses another API database target.');
      for (const port of [3000, 4000, 4001]) {
        try { await fetch(`http://127.0.0.1:${port}/health/live`, { redirect: 'error', signal: AbortSignal.timeout(1000) }); }
        catch (error) { if ((error as Error & { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') continue; throw Error('Admission fixture cannot prove shared runtimes are stopped.'); }
        throw Error('Admission fixture requires stopped shared runtimes.');
      }
      owner = new Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
      connection = await owner.connect();
      if ((await connection.query('select session_user,current_user')).rows[0]?.session_user !== 'postgres') throw Error('Exact local owner login required.');
      const population = (await connection.query<{ count: number; synthetic: boolean }>('select count(*)::integer count,bool_and(synthetic)synthetic from app.people')).rows[0];
      baseline = (await connection.query<Counts>(countsSql)).rows[0];
      if (baseline.auth !== 133 || baseline.people !== 133 || population.synthetic !== true || baseline.requests !== 0) throw Error('Admission fixture requires the restored entirely synthetic reference school.');
      const queue = (await connection.query<{ count: number }>("select count(*)::integer count from internal.outbox_events where state in('PENDING','PROCESSING')")).rows[0];
      if (queue.count !== 0) throw Error('Admission fixture requires an idle shared outbox.');
      const control = (await connection.query<{ revision: number; enabled: boolean }>('select revision,enabled from internal.school_account_runtime_control where singleton')).rows[0];
      if (!control || control.enabled !== false) throw Error('Admission fixture requires disabled local account execution.');
      initialControlRevision = control.revision;
      initialControlHistory = (await connection.query('select *from internal.school_account_runtime_revisions order by revision')).rows;
      targetVerified = true; captureVerified = true;
      expect(await lookupMessages()).toEqual([]); expect(await source()).toBeUndefined();
      const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch } };
      adminAuth = createClient(authOrigin, status.PUBLISHABLE_KEY, options); studentAuth = createClient(authOrigin, status.PUBLISHABLE_KEY, options); recipientAuth = createClient(authOrigin, status.PUBLISHABLE_KEY, options);
      providerAuth = createClient(authOrigin, status.SERVICE_ROLE_KEY, options);
      const identities = (JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { actors: { actorId: string; email: string }[] }).actors;
      let password = (JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string }).syntheticPassword;
      if (!password) throw Error('Synthetic login source unavailable.');
      const signIn = async (client: SupabaseClient, actorId: string) => {
        const identity = identities.find(candidate => candidate.actorId === actorId); if (!identity) throw Error('Synthetic actor source unavailable.');
        const result = await client.auth.signInWithPassword({ email: identity.email, password });
        if (result.error || !result.data.session || result.data.user?.id !== actorId) throw Error('Actual synthetic sign-in unavailable.');
        return result.data.session.access_token;
      };
      const adminToken = await signIn(adminAuth, administrator); const studentToken = await signIn(studentAuth, otherStudent); password = '';
      activatedRevision = await configureControl(true);
      runtime = await createApp(config);
      if (!runtime.database.pool || (await runtime.database.pool.query('select session_user,current_user')).rows[0]?.session_user !== 'cuevo_api') throw Error('Admission journey must use the normal restricted API login.');
      expect(await runtime.database.ready()).toBe(true);
      for (const table of ['school_account_requests', 'school_account_runtime_control', 'school_account_token_digests', 'school_account_claims', 'school_account_effect_receipts']) await expect(runtime.database.pool.query(`select *from internal.${table}`)).rejects.toMatchObject({ code: '42501' });
      const command = (token: string, path: string, payload: Record<string, unknown>, key: string, selectedSchool?: string, target = runtime!) => target.app.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, ...(selectedSchool ? { 'x-school-id': selectedSchool } : {}) }, payload });
      const adminRequest = (path: string, target = runtime!) => target.app.inject({ method: 'GET', url: path, headers: { authorization: `Bearer ${adminToken}`, 'x-school-id': school } });
      const invite = { displayName, email, role: 'student', reason: 'Explicitly reviewed disposable synthetic learner account', confirmInvitation: true };
      const created = await command(adminToken, '/v1/school/accounts/invitations', invite, inviteKey, school);
      expect(created.statusCode).toBe(200); assertSecretFree(created.body); expect(created.headers['cache-control']).toBe('no-store');
      const createdReceipt = schoolAccountInvitationReceiptSchema.parse(created.json()); invitationId = createdReceipt.id;
      expect(createdReceipt).toMatchObject({ schoolId: school, revision: 1, status: 'REQUESTED' });
      expect((await command(adminToken, '/v1/school/accounts/invitations', invite, inviteKey, school)).json()).toEqual(createdReceipt);
      expect(await source()).toMatchObject({ current_status: 'REQUESTED', current_revision: 1 });
      const beforeEffects = (await connection.query<{ auth: number; memberships: number; people: number }>('select(select count(*)::integer from auth.users where id=$1)auth,(select count(*)::integer from app.memberships where actor_id=$1)memberships,(select count(*)::integer from app.people where actor_id=$1)people', [providerId])).rows[0];
      expect(beforeEffects).toEqual({ auth: 0, memberships: 0, people: 0 });
      const deliveryPath = `/v1/school/accounts/invitations/${invitationId}/deliver`;
      const delivery = await command(adminToken, deliveryPath, { expectedRevision: 1, confirmDelivery: true }, randomUUID(), school);
      expect(delivery.statusCode).toBe(200); assertSecretFree(delivery.body);
      const effect = schoolAccountEffectReceiptSchema.parse(delivery.json());
      expect(effect).toMatchObject({ id: invitationId, schoolId: school, requestRevision: 1, status: 'AWAITING_CLAIM', providerState: 'CONFIRMED', deliveryState: 'ACCEPTED' });
      const pendingAccount = await providerAuth.auth.admin.getUserById(providerId);
      if (pendingAccount.error || pendingAccount.data.user?.id !== providerId || pendingAccount.data.user.email !== email || pendingAccount.data.user.email_confirmed_at !== null && pendingAccount.data.user.email_confirmed_at !== undefined) throw Error('Actual invitation provider identity is not the exact unconfirmed recipient.');
      const messages = await lookupMessages(); expect(messages).toHaveLength(1); ownedMessageIds.add(messages[0]);
      let message: CapturedMessage | undefined = await readMessage(messages[0]);
      if (!message.Text.includes('تابع فقط')) throw Error('Captured invitation is missing its Arabic safety explanation.');
      let continuation: string | undefined = message.Text.split(/\r?\n/).find(line => line.startsWith('http://localhost:3000/account/admission#')); message = undefined;
      if (!continuation) throw Error('Exact owned invitation continuation unavailable.');
      let link: URL | undefined = new URL(continuation); continuation = undefined;
      const fragment = new URLSearchParams(link.hash.slice(1));
      if (link.origin !== 'http://localhost:3000' || link.pathname !== '/account/admission' || link.search || link.username || link.password || [...fragment.keys()].length !== 4 || new Set(fragment.keys()).size !== 4 || [...fragment.keys()].some(key => !['id', 'type', 'token_hash', 'admission_secret'].includes(key)) || fragment.get('id') !== invitationId || fragment.get('type') !== 'invite') throw Error('Captured admission continuation is outside its approved context.');
      redemption = fragment.get('token_hash') ?? ''; admissionSecret = fragment.get('admission_secret') ?? ''; fragment.delete('token_hash'); fragment.delete('admission_secret'); link = undefined;
      if (!redemption || redemption.length > 4096 || !/^[a-f0-9]{64}$/.test(admissionSecret)) throw Error('Captured admission credentials are invalid.');
      const storedDigest = (await connection.query<{ matches: boolean }>('select token_digest=$2 as matches from internal.school_account_token_digests where request_id=$1', [invitationId, createHash('sha256').update(admissionSecret).digest('hex')])).rows;
      expect(storedDigest).toEqual([{ matches: true }]);
      expect((await adminRequest(`/v1/school/accounts/invitations/${invitationId}/delivery`)).json()).toEqual({ state: 'COMPLETED', receipt: effect });
      disabledRuntime = await createApp(parseServerConfig({ ...input, CUEVO_AUTH_PROVISIONING_MODE: 'DISABLED', CUEVO_AUTH_PROVISIONING_KEY: undefined }, 'api'));
      const replayDelivery = await command(adminToken, deliveryPath, { expectedRevision: 1, confirmDelivery: true }, randomUUID(), school, disabledRuntime);
      expect(replayDelivery.statusCode).toBe(200); expect(replayDelivery.json()).toEqual(effect); assertSecretFree(replayDelivery.body);
      expect(await lookupMessages()).toEqual(messages);
      const attempts = (await connection.query('select attempt.step,attempt.step_number,receipt.state,receipt.code from internal.school_account_effect_attempts attempt join internal.school_account_effect_receipts receipt using(attempt_id)where attempt.request_id=$1 order by attempt.step', [invitationId])).rows;
      expect(attempts).toEqual([{ step: 'CREATE', step_number: 1, state: 'CONFIRMED', code: 'IDENTITY_CONFIRMED' }, { step: 'DELIVERY', step_number: 1, state: 'CONFIRMED', code: 'DELIVERY_ACCEPTED' }, { step: 'LINK', step_number: 1, state: 'CONFIRMED', code: 'LINK_GENERATED' }]);
      const redeemed = await recipientAuth.auth.verifyOtp({ token_hash: redemption, type: 'invite' });
      if (redeemed.error || !redeemed.data.session || redeemed.data.user?.id !== providerId || redeemed.data.user.email !== email || !redeemed.data.user.email_confirmed_at) throw Error('Actual public invitation redemption unavailable.');
      recipientToken = redeemed.data.session.access_token;
      const reused = await recipientAuth.auth.verifyOtp({ token_hash: redemption, type: 'invite' }); redemption = '';
      if (!reused.error || reused.data.session) throw Error('A consumed provider invitation must not create another recipient session.');
      const me = () => runtime!.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${recipientToken}`, 'x-school-id': school } });
      expect((await me()).statusCode).toBe(403);
      const claimPath = '/v1/account/school-admission/claim';
      const claim = { id: invitationId, admissionSecret, confirmAdmission: true };
      expect((await command(studentToken, claimPath, claim, randomUUID())).statusCode).toBe(403);
      expect((await command(recipientToken, claimPath, { ...claim, admissionSecret: randomBytes(32).toString('hex') }, randomUUID())).statusCode).toBe(403);
      expect((await command(recipientToken, claimPath, { ...claim, role: 'admin' }, randomUUID())).statusCode).toBe(400);
      expect((await command(recipientToken, claimPath, { ...claim, schoolId: school }, randomUUID())).statusCode).toBe(400);
      expect((await command(recipientToken, claimPath, claim, randomUUID(), school)).statusCode).toBe(400);
      // Both requests run concurrently through the normal pool, with the same verified actor and original key.
      const admitted = await Promise.all([command(recipientToken, claimPath, claim, claimKey), command(recipientToken, claimPath, claim, claimKey)]);
      for (const response of admitted) { expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('no-store'); assertSecretFree(response.body); }
      const claimReceipt = schoolAccountClaimReceiptSchema.parse(admitted[0].json());
      expect(claimReceipt).toEqual({ id: invitationId, schoolId: school, userId: providerId, role: 'student', status: 'CLAIMED', revision: 2 }); expect(admitted[1].json()).toEqual(claimReceipt);
      const exactState = (await connection.query(`select (select count(*)::integer from app.memberships where school_id=$1 and actor_id=$2)memberships,
       (select count(*)::integer from app.people where school_id=$1 and actor_id=$2 and display_name=$4 and synthetic)people,
       (select count(*)::integer from internal.school_account_claims where request_id=$3)claims,
       (select count(*)::integer from internal.school_account_token_consumptions where request_id=$3)consumptions,
       (select count(*)::integer from internal.school_account_request_revisions where request_id=$3)revisions,
       (select count(*)::integer from internal.audit_events where school_id=$1 and entity_id=$3 and action='school.account.claimed')audits,
       (select count(*)::integer from internal.outbox_events where school_id=$1 and entity_id=$3 and type='school.account.claimed')events,
       (select count(*)::integer from internal.idempotency_keys where school_id=$1 and actor_id=$2 and key=$5 and command='school.account.claim')commands`, [school, providerId, invitationId, displayName, claimKey])).rows[0];
      expect(exactState).toEqual({ memberships: 1, people: 1, claims: 1, consumptions: 1, revisions: 2, audits: 1, events: 1, commands: 1 });
      const metadata = (await connection.query('select metadata from internal.audit_events where school_id=$1 and entity_id=$2 union all select metadata from internal.outbox_events where school_id=$1 and entity_id=$2', [school, invitationId])).rows;
      assertSecretFree(JSON.stringify(metadata));
      if (JSON.stringify(metadata).includes(email)) throw Error('Invitation audit and event metadata must not contain recipient email.');
      expect(await source()).toMatchObject({ current_status: 'CLAIMED', current_revision: 2 });
      const admittedMe = await me(); expect(admittedMe.statusCode).toBe(200); expect(admittedMe.json()).toMatchObject({ userId: providerId, schoolId: school, role: 'student', displayName, school: { id: school } }); assertSecretFree(admittedMe.body);
      expect((await command(recipientToken, claimPath, claim, randomUUID())).statusCode).toBe(409);
      const relationships = (await connection.query(`select(select count(*)::integer from app.enrollments where student_actor_id=$1)enrollments,
       (select count(*)::integer from app.parent_relationships where parent_actor_id=$1 or student_actor_id=$1)guardians,
       (select count(*)::integer from app.teacher_assignments where teacher_actor_id=$1)assignments`, [providerId])).rows[0];
      expect(relationships).toEqual({ enrollments: 0, guardians: 0, assignments: 0 });
      const member = (await connection.query<{ revision: number; effectiveFrom: string; effectiveTo: string | null }>('select revision,effective_from::text as "effectiveFrom",effective_to::text as "effectiveTo"from app.memberships where school_id=$1 and actor_id=$2', [school, providerId])).rows[0];
      const revoked = await command(adminToken, `/v1/school/people/${providerId}/configure`, { displayName, role: 'student', status: 'revoked', effectiveFrom: new Date(member.effectiveFrom).toISOString(), effectiveTo: member.effectiveTo ? new Date(member.effectiveTo).toISOString() : null, expectedRevision: member.revision, confirmAccessChange: true }, revokeKey, school);
      expect(revoked.statusCode).toBe(200); expect(revoked.json()).toMatchObject({ revision: member.revision + 1 }); assertSecretFree(revoked.body);
      expect((await command(recipientToken, claimPath, claim, claimKey)).statusCode).toBe(403); expect((await me()).statusCode).toBe(403);
      const signedOut = await providerAuth.auth.admin.signOut(recipientToken, 'global'); if (signedOut.error) throw Error('Owned recipient global session revocation unavailable.');
      expect((await command(recipientToken, claimPath, claim, claimKey)).statusCode).toBe(401); expect((await me()).statusCode).toBe(401);
      expect((await connection.query('select role,status,revision from app.memberships where school_id=$1 and actor_id=$2', [school, providerId])).rows).toEqual([{ role: 'student', status: 'revoked', revision: member.revision + 1 }]);
    }, [
      async () => { await runtime?.close(); runtime = undefined; },
      async () => { await disabledRuntime?.close(); disabledRuntime = undefined; },
      async () => {
        if (!captureVerified) return;
        for (const id of await lookupMessages(true)) { await readMessage(id); ownedMessageIds.add(id); }
        if (ownedMessageIds.size) {
          for (const id of ownedMessageIds) await readMessage(id);
          const result = await fetch(`${captureOrigin}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...ownedMessageIds] }), redirect: 'error', signal: AbortSignal.timeout(3000) });
          if (!result.ok) throw Error('Owned invitation capture removal unavailable.');
        }
        expect(await lookupMessages()).toEqual([]);
      },
      async () => {
        if (!connection || !targetVerified || !providerAuth) return;
        const row = await source(); if (!row) return;
        const account = await providerAuth.auth.admin.getUserById(row.provider_user_id);
        if (account.error?.status === 404) return;
        if (account.error || account.data.user?.id !== row.provider_user_id || account.data.user.email !== email) throw Error('Auth cleanup refuses a recipient outside its exact disposable source.');
        const remainingSessions = async () => (await connection!.query<{ count: number }>('select count(*)::integer count from auth.sessions where user_id=$1', [row.provider_user_id])).rows[0].count;
        if (await remainingSessions() > 0) {
          if (!recipientToken) throw Error('Owned recipient session cleanup requires its exact verified token.');
          const result = await providerAuth.auth.admin.signOut(recipientToken, 'global');
          if (result.error && await remainingSessions() > 0) throw Error('Owned recipient session cleanup unavailable.');
        }
        if (await remainingSessions() !== 0) throw Error('Owned recipient session removal is not confirmed.');
        const removed = await providerAuth.auth.admin.deleteUser(row.provider_user_id); if (removed.error) throw Error('Owned recipient Auth removal unavailable.');
        const absent = await providerAuth.auth.admin.getUserById(row.provider_user_id); if (absent.data.user || absent.error?.status !== 404) throw Error('Owned recipient Auth removal is not confirmed.');
      },
      async () => {
        if (!connection || !targetVerified || initialControlRevision === undefined) return;
        const current = (await connection.query<{ enabled: boolean; revision: number }>('select enabled,revision from internal.school_account_runtime_control where singleton')).rows[0];
        if (current.enabled) {
          if (current.revision !== activatedRevision && current.revision !== initialControlRevision + 1) throw Error('Control cleanup refuses another operator approval.');
          await configureControl(false);
        }
      },
      async () => {
        if (!connection || !targetVerified || !baseline) return;
        const row = await source(); if (!row) return;
        await connection.query('BEGIN');
        try {
          // Preserve the reconciliation source if provider cleanup failed or remained unknown.
          if ((await connection.query<{ count: number }>('select count(*)::integer count from auth.users where id=$1', [providerId])).rows[0].count !== 0) throw Error('Owner cleanup preserves the source until exact provider removal is confirmed.');
          const person = (await connection.query<{ display_name: string; synthetic: boolean }>('select display_name,synthetic from app.people where actor_id=$1', [providerId])).rows;
          if (person.some(value => value.synthetic !== true || value.display_name !== displayName)) throw Error('Owner cleanup refuses nonsynthetic recipient content.');
          const childRecords = (await connection.query<{ enrollments: number; guardians: number; assignments: number }>(`select
           (select count(*)::integer from app.enrollments where student_actor_id=$1)enrollments,
           (select count(*)::integer from app.parent_relationships where parent_actor_id=$1 or student_actor_id=$1)guardians,
           (select count(*)::integer from app.teacher_assignments where teacher_actor_id=$1)assignments`, [providerId])).rows[0];
          if (Object.values(childRecords).some(count => count !== 0)) throw Error('Owner cleanup preserves unexpected recipient relationship records for review.');
          const events = (await connection.query<{ id: string; type: string; entity_id: string }>('select id,type,entity_id from internal.outbox_events where school_id=$1 and entity_id=any($2::uuid[])', [school, [invitationId, providerId]])).rows;
          if (events.some(value => value.entity_id === invitationId ? !['school.account.provisioning_requested', 'school.account.claimed'].includes(value.type) : value.type !== 'school.updated')) throw Error('Owner cleanup refuses unrelated recipient events.');
          const eventIds = events.map(value => value.id);
          await connection.query("set local session_replication_role='replica'");
          for (const table of ['processed_events', 'analytics_delivery', 'posthog_delivery', 'community_broadcast_receipts']) await connection.query(`delete from internal.${table} where event_id=any($1::uuid[])`, [eventIds]);
          await connection.query('delete from internal.school_account_token_consumptions where request_id=$1 and school_id=$2', [invitationId, school]);
          await connection.query('delete from internal.school_account_claims where request_id=$1 and school_id=$2 and actor_id=$3', [invitationId, school, providerId]);
          await connection.query('delete from internal.school_account_token_digests where request_id=$1 and school_id=$2', [invitationId, school]);
          await connection.query('delete from internal.school_account_effect_receipts where attempt_id in(select attempt_id from internal.school_account_effect_attempts where request_id=$1 and school_id=$2)', [invitationId, school]);
          for (const table of ['school_account_effect_results', 'school_account_effect_attempts', 'school_account_effect_leases', 'school_account_request_revisions']) await connection.query(`delete from internal.${table} where request_id=$1 and school_id=$2`, [invitationId, school]);
          await connection.query('delete from internal.school_account_requests where id=$1 and school_id=$2 and provider_user_id=$3', [invitationId, school, providerId]);
          await connection.query('delete from internal.audit_events where school_id=$1 and entity_id=any($2::uuid[])', [school, [invitationId, providerId]]);
          await connection.query("delete from internal.idempotency_keys where school_id=$1 and((actor_id=$2 and key=$3 and command='school.account.invite')or(actor_id=$4 and key=$5 and command='school.account.claim')or(actor_id=$2 and key=$6 and command='school.person.configure'))", [school, administrator, inviteKey, providerId, claimKey, revokeKey]);
          await connection.query('delete from internal.outbox_events where id=any($1::uuid[])', [eventIds]);
          await connection.query("delete from internal.school_access_revisions where school_id=$1 and resource='memberships'and source_key=$2", [school, providerId]);
          await connection.query('delete from app.people where school_id=$1 and actor_id=$2 and synthetic and display_name=$3', [school, providerId, displayName]);
          await connection.query('delete from app.memberships where school_id=$1 and actor_id=$2', [school, providerId]);
          await connection.query("set local session_replication_role='origin'"); await connection.query('COMMIT');
        } catch (error) { await connection.query('ROLLBACK'); throw error; }
      },
      async () => {
        if (!connection || !targetVerified || !baseline) return;
        expect((await connection.query<Counts>(countsSql)).rows[0]).toEqual(baseline);
        expect(await source()).toBeUndefined();
        if (providerId) expect((await connection.query('select(select count(*)::integer from auth.users where id=$1)auth,(select count(*)::integer from app.people where actor_id=$1)people,(select count(*)::integer from app.memberships where actor_id=$1)memberships', [providerId])).rows).toEqual([{ auth: 0, people: 0, memberships: 0 }]);
        const history = (await connection.query('select *from internal.school_account_runtime_revisions where revision<=$1 order by revision', [initialControlRevision])).rows;
        expect(history).toEqual(initialControlHistory);
        const control = (await connection.query('select enabled,mode,revision from internal.school_account_runtime_control where singleton')).rows[0];
        expect(control).toMatchObject({ enabled: false, mode: 'DISABLED' });
        if (activatedRevision !== undefined) expect(control.revision).toBe(activatedRevision + 1);
        if (activatedRevision !== undefined) expect((await connection.query('select revision,enabled from internal.school_account_runtime_revisions where revision>$1 order by revision', [initialControlRevision])).rows).toEqual([{ revision: activatedRevision, enabled: true }, { revision: activatedRevision + 1, enabled: false }]);
      },
      async () => {
        // Recipient sessions were proved absent before provider deletion; clear that client's memory only.
        for (const client of [adminAuth, studentAuth]) {
          if (!client) continue; const result = await client.auth.signOut({ scope: 'local' });
          if (result.error) throw Error('Owned seeded admission session cleanup unavailable.');
        }
        if (recipientAuth) {
          const result = await recipientAuth.auth.signOut({ scope: 'local' });
          if (result.error && ![401, 403, 404].includes(result.error.status ?? 0) && result.error.code !== 'session_not_found') throw Error('Owned recipient memory-session cleanup unavailable.');
        }
      },
      () => { admissionSecret = ''; redemption = ''; recipientToken = ''; },
      () => connection?.release(),
      () => owner?.end(),
    ]);
  }, 120000);
});
