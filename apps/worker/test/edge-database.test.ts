import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEdgeWorkerConnection } from '../src/platform/edge-database';
import { Pool } from 'pg';
vi.mock('pg', () => ({ Pool: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('Edge worker connection authority', () => {
  it('uses verified TLS for only the explicitly bound hosted synthetic project', async () => {
    vi.mocked(Pool).mockImplementation(function () { return { on: vi.fn(), query: vi.fn(), end: vi.fn(async () => undefined) } as unknown as Pool; });
    const projectRef = 'abcdefghijklmnopqrst';
    const settings = { mode: 'synthetic-staging', syntheticProjectRef: projectRef, supabaseUrl: `https://${projectRef}.supabase.co`, syntheticWebOrigin: 'https://cuevo.example' };
    await createEdgeWorkerConnection({ databaseUrl: `postgresql://cuevo_worker:private@db.${projectRef}.supabase.co:5432/postgres` }, settings);
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: { rejectUnauthorized: true } }));
    vi.mocked(Pool).mockClear();
    for (const databaseUrl of [`postgresql://cuevo_worker:private@db.foreign.supabase.co:5432/postgres`, `postgresql://cuevo_worker.other:private@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`, 'postgresql://cuevo_worker:private@localhost:5432/postgres']) await expect(createEdgeWorkerConnection({ databaseUrl }, settings)).rejects.toThrow();
    expect(Pool).not.toHaveBeenCalled();
  });
  it('rejects owner, service and unapproved plaintext targets before pool creation', async () => {
    for (const [databaseUrl, mode] of [
      ['postgresql://postgres:private@db.example:5432/postgres', 'production'],
      ['postgresql://service_role:private@db.example:5432/postgres', 'production'],
      ['postgresql://cuevo_worker:private@unrelated.example:5432/postgres', 'local-synthetic'],
      ['postgresql://cuevo_worker:private@localhost:1111/postgres', 'local-synthetic'],
      ['postgresql://cuevo_worker:private@db.example:5432/postgres?sslmode=disable', 'production'],
    ]) await expect(createEdgeWorkerConnection({ databaseUrl }, { mode })).rejects.toThrow();
    expect(Pool).not.toHaveBeenCalled();
  });
  it('uses certificate validation and one connection with bounded SQL on the approved runtime path', async () => {
    const end = vi.fn(async () => undefined); const query = vi.fn(async () => ({ rows: [] }));
    vi.mocked(Pool).mockImplementation(function () { return { on: vi.fn(), query, end } as unknown as Pool; });
    const connection = await createEdgeWorkerConnection({ databaseUrl: 'postgresql://cuevo_worker.project:private@db.example:5432/postgres' }, { mode: 'production', ca: 'reviewed certificate' });
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ max: 1, statement_timeout: 5000, connectionTimeoutMillis: 3000, ssl: { rejectUnauthorized: true, ca: 'reviewed certificate' } }));
    await connection.query('select internal.worker_health()'); await connection.close();
    expect(query).toHaveBeenCalledOnce(); expect(end).toHaveBeenCalledOnce();
  });
  it('plaintext is restricted to explicit local synthetic Cuevo target', async () => {
    vi.mocked(Pool).mockImplementation(function () { return { on: vi.fn(), query: vi.fn(), end: vi.fn(async () => undefined) } as unknown as Pool; });
    await createEdgeWorkerConnection({ databaseUrl: 'postgresql://cuevo_worker:private@supabase_db_cuevo:5432/postgres' }, { mode: 'local-synthetic' });
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: false, statement_timeout: 5000 }));
  });
  it('admits the verified local Docker DNS alias with the same Cuevo port and database', async () => {
    vi.mocked(Pool).mockImplementation(function () { return { on: vi.fn(), query: vi.fn(), end: vi.fn(async () => undefined) } as unknown as Pool; });
    await createEdgeWorkerConnection({ databaseUrl: 'postgresql://cuevo_worker:private@db.supabase.internal:5432/postgres' }, { mode: 'local-synthetic' });
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ connectionString: 'postgresql://cuevo_worker:private@db.supabase.internal:5432/postgres', ssl: false, statement_timeout: 5000, max: 1 }));
  });
});
