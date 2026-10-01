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
