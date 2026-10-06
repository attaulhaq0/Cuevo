import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { BrowserDiagnosticsService } from '../../src/platform/telemetry/browser-diagnostics.service';

const id = '00000000-0000-4000-8000-000000000001';
const actor = { userId: id, schoolId: id, membershipId: id, role: 'student' as const, entitlements: ['school.context'] };
const diagnostic = { diagnosticId: id, category: 'api_error', feature: 'learning', status: 'denied', timing: 'under_250ms', locale: 'en', viewport: 'mobile' };

describe('current authorized browser diagnostic service', () => {
  it('rejects missing school context and unsafe content before accessing a database', async () => {
    const service = new BrowserDiagnosticsService({} as Database);
    await expect(service.config({ ...actor, entitlements: [] })).rejects.toMatchObject({ status: 403 });
    await expect(service.record(actor, { ...diagnostic, stack: 'private' }, id, 'test')).rejects.toMatchObject({ status: 400 });
    await expect(service.record(actor, diagnostic, 'wrong-identity', 'test')).rejects.toMatchObject({ status: 400 });
  });
  it('requires confirmed strict server configuration and sanitized recording receipts', async () => {
    const database = { actorTransaction: async (_user: string, _school: string, action: (client: PoolClient) => Promise<unknown>) => action({ query: async () => ({ rows: [{ configuration: { enabled: true, secret: 'private' }, receipt: { recorded: true, duplicate: false, payload: 'private' } }] }) } as unknown as PoolClient) } as unknown as Database;
    const service = new BrowserDiagnosticsService(database);
    await expect(service.config(actor)).rejects.toMatchObject({ status: 503 });
    await expect(service.record(actor, diagnostic, id, 'test')).rejects.toMatchObject({ status: 503 });
  });
  it('maps policy denial and rate refusal without exposing database exceptions', async () => {
    let code = '42501';
    const database = { actorTransaction: async () => { throw { code, message: 'private query and actor identity' }; } } as unknown as Database;
    const service = new BrowserDiagnosticsService(database);
    await expect(service.record(actor, diagnostic, id, 'test')).rejects.toMatchObject({ status: 403, message: 'Browser diagnostics are unavailable for the current school session.' });
    code = 'P0003'; await expect(service.record(actor, diagnostic, id, 'test')).rejects.toMatchObject({ status: 429 });
  });
});
