import { Pool } from 'pg';
export function createWorkerPool(url: string | undefined, settings: { tls?: boolean; ca?: string } = {}): Pool | undefined {
  if (!url) return undefined;
  if (settings.tls && new URL(url).search) throw new Error('Certificate-verified TLS database connections forbid URL options.');
  const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 3000, statement_timeout: 5000, ...(settings.tls ? { ssl: { rejectUnauthorized: true, ...(settings.ca ? { ca: settings.ca } : {}) } } : {}) });
  // The failed idle client is removed by pg-pool; subsequent probes can reconnect.
  pool.on('error', () => { console.error(JSON.stringify({ service: 'cuevo-worker', code: 'DATABASE_IDLE_CONNECTION_FAILED' })); });
  return pool;
}
