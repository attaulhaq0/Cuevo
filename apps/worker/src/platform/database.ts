import { Pool } from 'pg';
export function createWorkerPool(url: string | undefined): Pool | undefined {
  if (!url) return undefined;
  const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  // The failed idle client is removed by pg-pool; subsequent probes can reconnect.
  pool.on('error', () => { console.error(JSON.stringify({ service: 'cuevo-worker', code: 'DATABASE_IDLE_CONNECTION_FAILED' })); });
  return pool;
}
