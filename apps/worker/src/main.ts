import { createServer } from 'node:http';
import { createWorkerPool } from './platform/database';
import { parseServerConfig } from '@cuevo/config';
import { OutboxProcessor } from './jobs/outbox/processor';
import{workerQueueRecord,deliveryRecord}from'./platform/telemetry';
import{AnalyticsFixtureDelivery}from'./platform/analytics-fixture';
import{randomBytes}from'node:crypto';import{mkdir,readFile,writeFile}from'node:fs/promises';
const config = parseServerConfig(process.env);
const pool = createWorkerPool(config.workerDatabaseUrl);
let ready = false;
let metrics:unknown=null;
const processor=pool?new OutboxProcessor(pool,value=>console.log(JSON.stringify(deliveryRecord(value)))):undefined;
let analytics:AnalyticsFixtureDelivery|undefined;
if(pool&&process.env.ANALYTICS_FIXTURE_ENABLED==='true'){
 if(config.nodeEnv==='production'||!config.workerDatabaseUrl||!['localhost','127.0.0.1'].includes(new URL(config.workerDatabaseUrl).hostname)||new URL(config.workerDatabaseUrl).port!=='56322')throw Error('Fixture analytics requires local Cuevo.');
 await mkdir('.local/analytics',{recursive:true});let key:string;try{key=await readFile('.local/analytics/pseudonym.key','utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Analytics fixture configuration unavailable');key=randomBytes(32).toString('hex');try{await writeFile('.local/analytics/pseudonym.key',key,{mode:0o600,flag:'wx'});}catch(collision){if((collision as NodeJS.ErrnoException).code!=='EEXIST')throw collision;key=await readFile('.local/analytics/pseudonym.key','utf8');}}
 if(!/^[a-f0-9]{64}$/.test(key))throw Error('Analytics fixture pseudonym configuration invalid.');
 analytics=new AnalyticsFixtureDelivery(pool,{enabled:true,nodeEnv:config.nodeEnv,directory:'.local/analytics/events',pseudonymKey:key});
}
const probe = async () => { try { const result=await pool?.query('select internal.worker_health()as health');metrics=workerQueueRecord(result?.rows[0]?.health);ready=Boolean(result?.rows[0]?.health?.ready);console.log(JSON.stringify(metrics)); } catch { ready = false;metrics=null; } };
await probe();
const interval = setInterval(() => { void probe(); }, 10000);
const processingInterval=setInterval(()=>{void processor?.tick().catch(()=>{ready=false;});},1000);
const analyticsInterval=setInterval(()=>{void analytics?.tick().catch(()=>{console.error(JSON.stringify({service:'cuevo-worker',code:'ANALYTICS_FIXTURE_UNAVAILABLE'}));});},1000);
const server = createServer((request, response) => {
  if (request.url !== '/health/live' && request.url !== '/health/ready') { response.writeHead(404).end(); return; }
  response.writeHead(request.url === '/health/ready' && !ready ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ service: 'cuevo-worker', status: ready ? 'ready' : 'unavailable', database: ready, processor: 'configured',queue:metrics }));
});
server.listen(config.workerPort, '0.0.0.0', () => console.log(`Cuevo worker health listening on ${config.workerPort}`));
const close = async () => { clearInterval(interval);clearInterval(processingInterval);clearInterval(analyticsInterval); server.close(); await pool?.end(); };
process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
