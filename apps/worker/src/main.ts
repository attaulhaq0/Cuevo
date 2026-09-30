import { createServer } from 'node:http';
import { createWorkerPool } from './database';
import { parseServerConfig } from '@cuevo/config';
const config = parseServerConfig(process.env);
const pool = createWorkerPool(config.workerDatabaseUrl);
let ready = false;
const probe = async () => { try { await pool?.query('select 1'); ready = Boolean(pool); } catch { ready = false; } };
await probe();
const interval = setInterval(() => { void probe(); }, 10000);
const server = createServer((request, response) => {
  if (request.url !== '/health/live' && request.url !== '/health/ready') { response.writeHead(404).end(); return; }
  response.writeHead(request.url === '/health/ready' && !ready ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ service: 'cuevo-worker', status: ready ? 'ready' : 'unavailable', database: ready, processor: 'not_configured' }));
});
server.listen(config.workerPort, '0.0.0.0', () => console.log(`Cuevo worker health listening on ${config.workerPort}`));
const close = async () => { clearInterval(interval); server.close(); await pool?.end(); };
process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
