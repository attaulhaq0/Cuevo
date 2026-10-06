import { Pool } from 'pg';
import type { WorkerQueryPort } from './query-port';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase } from '@cuevo/config/synthetic-runtime';

export async function createEdgeWorkerConnection(config: { databaseUrl: string }, settings: { mode: string; ca?: string; syntheticProjectRef?: string; syntheticWebOrigin?: string; supabaseUrl?: string }) {
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^cuevo_worker(?:\.|$)/.test(url.username) || !url.password || url.search || url.hash) throw new Error('Restricted worker connection required.');
  const local = settings.mode === 'local-synthetic' && url.port === '5432' && url.pathname === '/postgres' && ['127.0.0.1', 'localhost', 'supabase_db_cuevo', 'db.supabase.internal'].includes(url.hostname);
  const hosted = hostedSyntheticRuntime({ CUEVO_DEPLOYMENT_ENVIRONMENT: settings.mode, CUEVO_SYNTHETIC_PROJECT_REF: settings.syntheticProjectRef, CUEVO_SYNTHETIC_WEB_ORIGIN: settings.syntheticWebOrigin, SUPABASE_URL: settings.supabaseUrl });
  if (hosted) requireHostedSyntheticDatabase(config.databaseUrl, hosted, 'cuevo_worker');
  if (settings.mode !== 'production' && !local && !hosted) throw new Error('Explicit local synthetic, hosted synthetic staging or production worker target required.');
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000, ssl: local ? false : { rejectUnauthorized: true, ...(settings.ca ? { ca: settings.ca } : {}) } });
  pool.on('error', () => { /* Durable lease and invocation failure state remain authoritative. */ });
  const query: WorkerQueryPort['query'] = (sql, values) => pool.query(sql, values);
  return { query, close: () => pool.end() };
}
