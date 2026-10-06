import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

test('the actual native session restricts operator and worker recipients, verifies TLS and handles idle/query/close loss',async()=>{
 const source=await readFile(resolve(import.meta.dirname,'backend-hosted-fault-recovery-native.ts'),'utf8'),start=source.indexOf('async function nativeSession('),end=source.indexOf('\n/**',start),method=transformSync(source.slice(start,end),{loader:'ts',format:'cjs'}).code,project='abcdefghijklmnopqrst',host='aws-0-ap-southeast-1.pooler.supabase.com';
 for(const mode of ['normal','wrong-tls','idle-loss','close-loss','query-loss']){
  let disconnect:()=>void=()=>undefined,ended=false,connected=false;
  class ControlledClient extends EventEmitter{connection={stream:{encrypted:true,authorized:mode!=='wrong-tls',getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({})}};constructor(public config:{host:string;user:string;password:string;ssl:{rejectUnauthorized:boolean;minVersion:string}}){super();disconnect=()=>this.emit('error',Error('private-idle-canary'));assert.equal(config.host,host);assert.equal(config.user,'cuevo_worker.'+project);assert.equal(config.password,'private-runtime-password');assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.minVersion,'TLSv1.2');}async connect(){connected=true;assert(this.listenerCount('error')>0);assert(this.listenerCount('end')>0);}async query(){if(mode==='query-loss')throw Error('private-driver-canary');return{rows:[{ready:true}]};}async end(){ended=true;if(mode==='close-loss')throw Error('private-close-canary');this.emit('end');}}
  const context={Client:ControlledClient,URL,checkServerIdentity:()=>undefined,fail:()=>Error('Native recovery requires review; contents withheld.'),dsn:`postgresql://cuevo_worker.${project}:private-runtime-password@${host}:5432/postgres`,password:'',ca:'fixture',role:'cuevo_worker',project};
  let session:unknown,error:unknown;try{session=await runInNewContext(method+';nativeSession(dsn,password,ca,role,project)',context);}catch(caught){error=caught;}
  if(mode==='wrong-tls'){assert(error);assert.equal(ended,true);continue;}
  const api=session as{query(sql:string):Promise<unknown>;close():Promise<void>;live():void};assert.equal(connected,true);if(mode==='idle-loss')disconnect();
  try{await api.query('fixed-read');await api.close();}catch(caught){error=caught;try{await api.close();}catch{/* Confirm original close refusal remains safe. */}}
  assert.equal(ended,true);if(mode==='normal')assert.equal(error,undefined);else{assert(error);assert.doesNotMatch(String(error),/private-driver-canary|private-close-canary|private-idle-canary/);}
 }
 for(const dsn of [`postgresql://postgres.${project}:exposed@${host}:5432/postgres?sslmode=verify-full`,`postgresql://cuevo_worker.${project}:private@${host}:6543/postgres`,`postgresql://cuevo_worker.${project}:private@${host}:5432/postgres?sslmode=disable`]){
  const role=dsn.includes('postgres.')?'postgres':'cuevo_worker';let connected=false;class RefusedClient{constructor(){connected=true;}}
  await assert.rejects(Promise.resolve(runInNewContext(method+';nativeSession(dsn,password,ca,role,project)',{Client:RefusedClient,URL,checkServerIdentity:()=>undefined,fail:()=>Error('Native recovery requires review'),dsn,password:'private',ca:'fixture',role,project})));assert.equal(connected,false);
 }
});
test('native fault proof is a separate producer bound to existing activation and cannot accept caller proof booleans',async()=>{
 const source=await readFile(resolve(import.meta.dirname,'backend-hosted-fault-recovery-native.ts'),'utf8');
 assert.match(source,/verifyNativeWorkerFaultRecovery/);assert.match(source,/worker-activation-cleanup\.json/);assert.match(source,/worker-fault-recovery-intent\.json/);assert.match(source,/nativeSession\(runtime\.edge\.CUEVO_WORKER_DATABASE_URL/);assert.match(source,/verifyWorkerFaultRecovery/);
 const begin=source.indexOf('await writeReceipt(faultPath'),probe=source.indexOf("const login=await request(auth+'/auth/v1/token");assert(begin>0&&probe>begin);assert.doesNotMatch(source,/secrets.*POST|functions\/deploy|alter table|grant |update internal\.outbox_events/i);
});
test('the actual failure cleanup requires an acquired operation lock and persisted own fault intent',async()=>{
 const source=await readFile(resolve(import.meta.dirname,'backend-hosted-fault-recovery-native.ts'),'utf8'),start=source.indexOf('const pauseOwned=async()=>'),end=source.indexOf('\n  if(result.status',start),method=transformSync(source.slice(start,end),{loader:'ts',format:'cjs'}).code;
 for(const [locked,journalPath]of [[false,'owned-journal'],[true,'']]as const){let calls=0;await runInNewContext(method+';pauseOwned()',{operator:{query:async()=>{calls++;throw Error('Unexpected mutation');}},vaultName:'cuevo_worker_owned',locked,journalPath,endpoint:'https://fixture.supabase.co/functions/v1/cuevo-worker',result:{},jobId:42,controlSql:'fixed',fail:()=>Error('safe')});assert.equal(calls,0);}
});
