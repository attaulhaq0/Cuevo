import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import type { IdentityService } from '../../src/platform/identity/identity.service';
import { createImprovementController } from '../../src/modules/improvement/improvement.controller';

const actor = { userId: '20000000-0000-4000-8000-000000000004', schoolId: '10000000-0000-4000-8000-000000000001', membershipId: '00000000-0000-4000-8000-000000000001', role: 'teacher', entitlements: ['improvement'] };

describe('current recommendation page transport', () => {
  async function request(role: string, reply: unknown, query = '') {
    const calls: { sql: string; values: unknown[] }[] = [];
    const database = { actorTransaction: async (_actor: string, _school: string, run: (client: PoolClient) => Promise<unknown>) => run({ query: async (sql: string, values: unknown[]) => { calls.push({ sql, values }); return { rows: [{ page: reply }] }; } } as unknown as PoolClient) } as unknown as Database;
    const identity = { resolve: async () => ({ ...actor, role }) } as unknown as IdentityService;
    @Module({ controllers: [createImprovementController(identity, database)] }) class TestModule {}
    const app = await NestFactory.create(TestModule, new FastifyAdapter({ logger: false }), { logger: false });
    try { await app.init(); const result = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/v1/recommendations' + query, headers: { authorization: 'Bearer fixture' } }); return { status: result.statusCode, body: result.json(), calls }; }
    finally { await app.close(); }
  }

  it('uses the source-authorized bounded SQL page and passes the original cursor', async () => {
    const cursor = '00000000-0000-4000-8000-000000000002';
    const result = await request('teacher', { items: [{ id: cursor }], nextCursor: cursor }, '?limit=100&cursor=' + cursor);
    expect(result.status).toBe(200);
    expect(result.calls).toEqual([{ sql: 'select internal.read_current_recommendation_page($1,$2)as page', values: [100, cursor] }]);
    expect(result.body).toEqual({ items: [{ id: cursor }], nextCursor: cursor });
  });

  it('denies learner review and refuses an unconfirmed SQL page', async () => {
    const denied = await request('student', { items: [], nextCursor: null });
    expect(denied.status).toBe(403); expect(denied.calls).toHaveLength(0);
    expect((await request('teacher', null)).status).toBe(503);
  });
});
