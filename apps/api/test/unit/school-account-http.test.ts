import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { IdentityService, AccountIdentityService } from '../../src/platform/identity/identity.service';
import { createSchoolAccountController } from '../../src/modules/school/account.controller';
import type { SchoolAccountEffectsService } from '../../src/modules/school/account-effects.service';

const userId = '00000000-0000-4000-8000-000000000001'; const schoolId = '00000000-0000-4000-8000-000000000002'; const invitationId = '00000000-0000-4000-8000-000000000003'; const sessionId = '00000000-0000-4000-8000-000000000004';
const invite = { displayName: 'New learner', email: 'new@example.test', role: 'student', reason: 'Reviewed account request', confirmInvitation: true };
const receipt = { id: invitationId, schoolId, revision: 1, status: 'REQUESTED', createdAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z' };
const member = { membership_id: invitationId, actor_id: userId, school_id: schoolId, school_name: 'Reviewed school', display_name: 'Administrator', role: 'admin', entitlement_codes: ['school.context', 'school.operations'] };
let app: NestFastifyApplication;
afterEach(async () => { await app?.close(); });
async function runtime(role = 'admin', effects?: SchoolAccountEffectsService, effectStatus: unknown = { state: 'PENDING', receipt: null }) {
  let memberReads = 0; const writes: string[] = [];
  const identity = new IdentityService({ verifyUser: async () => ({ userId, sessionId }), isCurrentSession: async () => true, currentMemberships: async () => { memberReads++; return [{ ...member, role }]; } });
  const account = new AccountIdentityService({ verifyAccount: async () => ({ userId, sessionId, email: 'new@example.test', emailConfirmedAt: '2026-10-03T00:00:00Z' }), isCurrentSession: async () => true });
  const database = { actorTransaction: async (_user: string, _school: string | undefined, callback: (client: PoolClient) => Promise<unknown>) => callback({ query: async (sql: string) => {
    writes.push(sql); if (sql.includes('set_config')) return { rows: [] }; if (sql.includes('is_current_session')) return { rows: [{ active: true }] };
    if (sql.includes('read_school_account_effect')) return { rows: [{ status: effectStatus }] };
    if (sql.includes('claim_school')) return { rows: [{ receipt: { id: invitationId, schoolId, userId, role: 'student', status: 'CLAIMED', revision: 2 } }] };
    if (sql.includes('read_school')) return { rows: [{ page: { items: [], nextCursor: null } }] };
    return { rows: [{ receipt }] };
  } } as unknown as PoolClient) } as unknown as Database;
  const controller = createSchoolAccountController(identity, account, database, effects);
  @Module({ controllers: [controller] }) class TestModule {}
  app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter({ logger: false }), { logger: false });
  await app.init(); await app.getHttpAdapter().getInstance().ready();
  return { writes, memberReads: () => memberReads };
}
const headers = { authorization: 'Bearer verified-token', 'x-school-id': schoolId, 'idempotency-key': 'school-account-request-0001' };

describe('school account HTTP authorization and receipt boundary', () => {
  it('requires deliberate confirmation and exact revision before any external delivery execution', async () => {
    const calls: string[] = []; const output = { id: invitationId, schoolId, eventId: sessionId, requestRevision: 1, status: 'AWAITING_CLAIM', providerState: 'CONFIRMED', deliveryState: 'ACCEPTED' };
    const effects = { execute: async (_actor: unknown, id: string) => { calls.push(id); return output; } } as unknown as SchoolAccountEffectsService;
    await runtime('admin', effects);
    const path = `/v1/school/accounts/invitations/${invitationId}/deliver`;
    const invalid = await app.inject({ method: 'POST', url: path, headers, payload: { expectedRevision: 1, confirmDelivery: false } }); expect(invalid.statusCode).toBe(400); expect(calls).toEqual([]);
    const valid = await app.inject({ method: 'POST', url: path, headers, payload: { expectedRevision: 1, confirmDelivery: true } }); expect(valid.statusCode).toBe(200); expect(valid.json()).toEqual(output); expect(calls).toEqual([invitationId]);
    expect(valid.headers['cache-control']).toBe('no-store');
  });
  it('refuses unavailable delivery and foreign credential-bearing receipts without implying a sent invitation', async () => {
    await runtime(); const unavailable = await app.inject({ method: 'POST', url: `/v1/school/accounts/invitations/${invitationId}/deliver`, headers, payload: { expectedRevision: 1, confirmDelivery: true } }); expect(unavailable.statusCode).toBe(503);
    await app.close(); const effects = { execute: async () => ({ id: invitationId, schoolId, eventId: sessionId, requestRevision: 1, status: 'AWAITING_CLAIM', providerState: 'CONFIRMED', deliveryState: 'ACCEPTED', token: 'private-token' }) } as unknown as SchoolAccountEffectsService;
    await runtime('admin', effects); const result = await app.inject({ method: 'POST', url: `/v1/school/accounts/invitations/${invitationId}/deliver`, headers, payload: { expectedRevision: 1, confirmDelivery: true } }); expect(result.statusCode).toBe(503); expect(result.body).not.toContain('private-token');
  });
  it('denies teacher delivery before invoking the provider executor', async () => {
    let called = false; const effects = { execute: async () => { called = true; return null; } } as unknown as SchoolAccountEffectsService;
    await runtime('teacher', effects);
    const result = await app.inject({ method: 'POST', url: `/v1/school/accounts/invitations/${invitationId}/deliver`, headers, payload: { expectedRevision: 1, confirmDelivery: true } });
    expect(result.statusCode).toBe(403); expect(called).toBe(false);
  });
  it('returns an already confirmed exact receipt after the provider adapter is disabled without another effect', async () => {
    const receipt = { id: invitationId, schoolId, eventId: sessionId, requestRevision: 1, status: 'AWAITING_CLAIM', providerState: 'CONFIRMED', deliveryState: 'ACCEPTED' };
    await runtime('admin', undefined, { state: 'COMPLETED', receipt });
    const result = await app.inject({ method: 'POST', url: `/v1/school/accounts/invitations/${invitationId}/deliver`, headers, payload: { expectedRevision: 1, confirmDelivery: true } });
    expect(result.statusCode).toBe(200); expect(result.json()).toEqual(receipt);
  });
  it('returns a confirmed 200 invitation receipt with no-store and no secret fields', async () => {
    await runtime(); const result = await app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers, payload: invite });
    expect(result.statusCode).toBe(200); expect(result.json()).toEqual(receipt); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).not.toContain(invite.email);
  });
  it('requires exact selected school for invitation management before resolving identity', async () => {
    const state = await runtime(); const result = await app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers: { authorization: headers.authorization, 'idempotency-key': headers['idempotency-key'] }, payload: invite });
    expect(result.statusCode).toBe(400); expect(state.memberReads()).toBe(0); expect(state.writes).toEqual([]);
  });
  it('denies a foreign school and an ordinary teacher before database writes', async () => {
    const state = await runtime('teacher');
    const foreign = await app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers: { ...headers, 'x-school-id': invitationId }, payload: invite });
    expect(foreign.statusCode).toBe(403);
    const teacher = await app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers, payload: invite });
    expect(teacher.statusCode).toBe(403); expect(state.writes).toEqual([]);
  });
  it('denies missing authentication and secret-bearing invitation payloads', async () => {
    const state = await runtime();
    const signedOut = await app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers: { 'x-school-id': schoolId }, payload: invite }); expect(signedOut.statusCode).toBe(401);
    const forged = await app.inject({ method: 'POST', url: '/v1/school/accounts/invitations', headers, payload: { ...invite, admissionSecret: 'a'.repeat(64) } }); expect(forged.statusCode).toBe(400); expect(state.writes).toEqual([]);
  });
  it('accepts the current account claim independently of membership and never consumes an invitation on GET', async () => {
    const state = await runtime(); const result = await app.inject({ method: 'POST', url: '/v1/account/school-admission/claim', headers: { authorization: headers.authorization, 'idempotency-key': headers['idempotency-key'] }, payload: { id: invitationId, admissionSecret: 'a'.repeat(64), confirmAdmission: true } });
    expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ status: 'CLAIMED', userId }); expect(result.headers['cache-control']).toBe('no-store'); expect(state.memberReads()).toBe(0);
    const priorWrites = state.writes.length; const get = await app.inject({ method: 'GET', url: '/v1/account/school-admission/claim', headers }); expect(get.statusCode).toBe(404); expect(state.writes).toHaveLength(priorWrites);
  });
  it('rejects caller-selected school on the purpose-only claim route', async () => {
    const state = await runtime(); const result = await app.inject({ method: 'POST', url: '/v1/account/school-admission/claim', headers, payload: { id: invitationId, admissionSecret: 'a'.repeat(64), confirmAdmission: true } });
    expect(result.statusCode).toBe(400); expect(state.writes).toEqual([]); expect(state.memberReads()).toBe(0);
  });
});
