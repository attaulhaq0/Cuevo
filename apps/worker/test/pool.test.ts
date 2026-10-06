import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerPool } from '../src/platform/database';

afterEach(() => vi.restoreAllMocks());
describe('worker idle connection recovery', () => {
  it('rejects PostgreSQL URL options that could override mandatory TLS settings', () => {
    expect(() => createWorkerPool('postgresql://worker:private@db.example/postgres?sslmode=no-verify', { tls: true })).toThrow('TLS');
  });
  it('validates hosted SQL certificates with the same bounded worker pool', async () => {
    const pool = createWorkerPool('postgresql://cuevo_worker:private@db.abcdefghijklmnopqrst.supabase.co:5432/postgres', { tls: true });
    try { expect(pool!.options.ssl).toEqual({ rejectUnauthorized: true }); } finally { await pool?.end(); }
  });
  it('does not terminate the worker or log secrets when an idle connection is lost', async () => {
    const pool = createWorkerPool('postgresql://worker:synthetic@localhost:1/synthetic');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => pool!.emit('error', new Error('private password=never-log'))).not.toThrow();
      expect(log.mock.calls.flat().join(' ')).not.toContain('never-log');
    } finally { await pool?.end(); }
  });

  it('does not fabricate a pool for missing worker credentials', () => {
    expect(createWorkerPool(undefined)).toBeUndefined();
  });
});
