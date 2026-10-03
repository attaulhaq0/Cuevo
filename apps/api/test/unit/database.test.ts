import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { QueryResult } from 'pg';
import { Database } from '../../src/platform/database/database';

const databases: Database[] = [];
const database = () => {
  const instance = new Database('postgresql://runtime:synthetic@localhost:1/synthetic');
  databases.push(instance);
  return instance;
};
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map((instance) => instance.close())); });

const readyResult = { rows: [{ ready: true }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
const executionResult = { rows: [{ membership_count: '0', session_active: false }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
// pg.query overloads include callback/void forms; this test replaces only the Promise form.
const querySpy = (instance: Database) => vi.spyOn(instance.pool!, 'query') as unknown as MockInstance<(sql: string) => Promise<QueryResult>>;

describe('database dependency readiness and idle recovery', () => {
  it('refuses SSL URL options before constructing a certificate-verified pool', () => {
    expect(() => new Database('postgresql://runtime:private@db.example/postgres?sslmode=disable', { tls: true })).toThrow('TLS');
  });
  it('rechecks hosted synthetic school authority before each protected read, mutation or replay callback', async () => {
    const instance = new Database('postgresql://runtime:synthetic@localhost:1/synthetic', { syntheticOnly: true }); databases.push(instance);
    let allowed = true; let callbacks = 0; const sql: string[] = [];
    const client = { query: async (statement: string) => { sql.push(statement); return { rows: statement.includes('synthetic_school_runtime_allowed') ? [{ allowed }] : [] }; }, release: vi.fn() };
    vi.spyOn(instance.pool!, 'connect').mockResolvedValue(client as never);
    await expect(instance.actorTransaction('actor', 'school', async () => { callbacks++; return 'read'; })).resolves.toBe('read');
    expect(sql.findIndex(statement => statement.includes('synthetic_school_runtime_allowed'))).toBeGreaterThan(sql.findIndex(statement => statement.includes('set_config')));
    allowed = false;
    for (const action of ['mutation', 'original-key replay']) await expect(instance.actorTransaction('actor', 'school', async () => { callbacks++; return action; })).rejects.toMatchObject({ code: 'SYNTHETIC_SCHOOL_REQUIRED', status: 403 });
    expect(callbacks).toBe(1); expect(sql.filter(statement => statement === 'ROLLBACK')).toHaveLength(2);
    await expect(instance.actorTransaction('actor', undefined, async () => 'verified session only')).resolves.toBe('verified session only');
  });
  it('denies missing hosted school receipts and keeps ordinary local transactions unchanged', async () => {
    const instance = new Database('postgresql://runtime:synthetic@localhost:1/synthetic', { syntheticOnly: true }); databases.push(instance);
    const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() }; vi.spyOn(instance.pool!, 'connect').mockResolvedValue(client as never);
    const callback = vi.fn(async () => 'must not run');
    await expect(instance.actorTransaction('actor', 'school', callback)).rejects.toMatchObject({ code: 'SYNTHETIC_SCHOOL_REQUIRED' }); expect(callback).not.toHaveBeenCalled();
    const local = database(); vi.spyOn(local.pool!, 'connect').mockResolvedValue(client as never); client.query.mockClear();
    await expect(local.actorTransaction('actor', 'school', async () => 'local')).resolves.toBe('local'); expect(client.query.mock.calls.flat()).not.toEqual(expect.arrayContaining([expect.stringContaining('synthetic_school_runtime_allowed')]));
  });
  it('cannot run a staged callback when the admission function is unavailable, and rolls back', async () => {
    const instance = new Database('postgresql://runtime:synthetic@localhost:1/synthetic', { syntheticOnly: true }); databases.push(instance);
    const statements: string[] = []; const client = { query: async (sql: string) => { statements.push(sql); if (sql.includes('synthetic_school_runtime_allowed')) throw Object.assign(new Error('private source failure'), { code: '42883' }); return { rows: [] }; }, release: vi.fn() };
    vi.spyOn(instance.pool!, 'connect').mockResolvedValue(client as never); const callback = vi.fn(async () => 'must not run');
    await expect(instance.actorTransaction('actor', 'school', callback)).rejects.toMatchObject({ code: '42883' });
    expect(callback).not.toHaveBeenCalled(); expect(statements.at(-1)).toBe('ROLLBACK'); expect(client.release).toHaveBeenCalledOnce();
  });
  it('pins certificate verification for hosted SQL while retaining local plaintext behavior', () => {
    const hosted = new Database('postgresql://cuevo_api:private@db.abcdefghijklmnopqrst.supabase.co:5432/postgres', { tls: true, ca: 'reviewed-ca' });
    databases.push(hosted);
    expect(hosted.pool!.options.ssl).toEqual({ rejectUnauthorized: true, ca: 'reviewed-ca' });
    expect(database().pool!.options.ssl).toBeUndefined();
  });
  it('keeps the process alive on idle pool failure and emits no raw connection error', () => {
    const instance = database();
    const error = new Error('postgresql://private:password@host/secret');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => instance.pool!.emit('error', error)).not.toThrow();
    expect(log.mock.calls.flat().join(' ')).not.toContain('password');
  });

  it('does not confuse generic SQL reachability with application schema readiness', async () => {
    const instance = database();
    querySpy(instance).mockResolvedValue({ ...readyResult, rows: [{ ready: false }] });
    expect(await instance.ready()).toBe(false);
  });

  it('verifies runtime attributes, private object ownership and required authorization privileges', async () => {
    const instance = database();
    const query = querySpy(instance).mockResolvedValueOnce(readyResult).mockResolvedValueOnce(executionResult);
    expect(await instance.ready()).toBe(true);
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('rolbypassrls'));
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('rolsuper'));
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('relowner'));
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('has_function_privilege'));
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('current_memberships'));
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('is_current_session'));
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining('"authorization".current_memberships()'));
  });

  it('reports a missing or inaccessible authorization function as unavailable', async () => {
    const instance = database();
    querySpy(instance).mockResolvedValueOnce(readyResult).mockRejectedValueOnce(new Error('private schema error'));
    expect(await instance.ready()).toBe(false);
  });

  it('can become ready again after a dependency error without replacing the application', async () => {
    const instance = database();
    querySpy(instance).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(readyResult).mockResolvedValueOnce(executionResult);
    expect(await instance.ready()).toBe(false);
    expect(await instance.ready()).toBe(true);
  });
});
