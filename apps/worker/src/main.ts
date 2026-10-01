import { createServer } from 'node:http';
import { createWorkerPool } from './database';
import { parseServerConfig } from '@cuevo/config';
import { OutboxProcessor } from './processor';
const config = parseServerConfig(process.env);
const pool = createWorkerPool(config.workerDatabaseUrl);
let ready = false;
let metrics:unknown=null;
const processor=pool?new OutboxProcessor(pool):undefined;
const probe = async () => { try { const result=await pool?.query('select internal.worker_health()as health');metrics=result?.rows[0]?.health??null;ready=Boolean(result?.rows[0]?.health?.ready); } catch { ready = false;metrics=null; } };
await probe();
const interval = setInterval(() => { void probe(); }, 10000);
const processingInterval=setInterval(()=>{void processor?.tick().catch(()=>{ready=false;});},1000);
const server = createServer((request, response) => {
  if (request.url !== '/health/live' && request.url !== '/health/ready') { response.writeHead(404).end(); return; }
  response.writeHead(request.url === '/health/ready' && !ready ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ service: 'cuevo-worker', status: ready ? 'ready' : 'unavailable', database: ready, processor: 'configured',queue:metrics }));
});
server.listen(config.workerPort, '0.0.0.0', () => console.log(`Cuevo worker health listening on ${config.workerPort}`));
const close = async () => { clearInterval(interval);clearInterval(processingInterval); server.close(); await pool?.end(); };
process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
