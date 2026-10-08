import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { readHistoricalMigrationSources } from './hosted-migration-plan';
import { createHash } from 'node:crypto';
import { deriveHostedMigrationBatches } from './hosted-migration-batches';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const source='d87455114cac2d22d63d040ce5b13e6b2e74e743';
const sources=readHistoricalMigrationSources(resolve(import.meta.dirname,'../..'),source,'1e85393d46beb4f5356e07277a13a7ef33cc67d9');
const replay=replayPlan(sources),order=[...replay.before,replay.prerequisite,...replay.remaining],rows=order.map(name=>({name,version:name.slice(0,14),sha256:hash(sources.find(row=>row.name===name)!.bytes)}));
const boundary=replay.remaining.indexOf(posthogIntelligenceMigration),boundaries=[replay.before.length,replay.before.length+1,replay.before.length+1+boundary,rows.length];
const configSha256='cc91534b07b96e61b993f179225a9929b65e965d19a5a02e242c79126166b4ff';
function stage(index:number,applied=0):HostedMigrationWorkdirs['stages'][number]{
 const id=(['prefix','native','pre-observability','remaining'] as const)[index],before=Math.max(applied,index?boundaries[index-1]:0),after=Math.max(applied,boundaries[index]),workdir='G:\\Cuevo\\.local\\hosted-release\\batch-fixture\\'+id;
 return {id,workdir,included:rows.slice(0,after),pending:rows.slice(before,after),expectedBeforeVersions:rows.slice(0,before).map(r=>r.version).sort(),expectedAfterVersions:rows.slice(0,after).map(r=>r.version).sort(),configSha256,commandArgs:['db','push','--linked','--project-ref','mqxdjvsyckzocokuikmx','--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json']};
}

test('real stages123/124/180/230 retain exact full stage and children never exceed20 pending migrations',()=>{
 assert.deepEqual(boundaries,[123,124,180,230]);
 for(let index=0;index<4;index++){
  const input=stage(index),result=deriveHostedMigrationBatches({sources,stage:input});
  assert.ok(result.batches.every(batch=>batch.pending.length<=20&&batch.pending.length>0));
  assert.deepEqual(result.batches.flatMap(batch=>batch.pending),input.pending);
  assert.deepEqual(result.batches.at(-1)?.cumulativeIncluded,input.included);
  assert.deepEqual(result.batches.at(-1)?.expectedAfterVersions,input.expectedAfterVersions);
  assert.equal(result.stageId,input.id);
 }
});

test('arbitrary middle prefixes, changed hashes and reordered stage rows require review',()=>{
 const arbitrary=stage(0,120);assert.throws(()=>deriveHostedMigrationBatches({sources,stage:arbitrary}));
 for(const mutate of [(s:ReturnType<typeof stage>)=>{s.included[0].sha256='0'.repeat(64);},(s:ReturnType<typeof stage>)=>{s.pending.reverse();},(s:ReturnType<typeof stage>)=>{s.expectedAfterVersions.pop();},(s:ReturnType<typeof stage>)=>{s.configSha256='0'.repeat(64);},(s:ReturnType<typeof stage>)=>{s.commandArgs.push('--include-seed');}]){const changed=structuredClone(stage(2));mutate(changed);assert.throws(()=>deriveHostedMigrationBatches({sources,stage:changed}));}
});

test('completed stage boundaries become no-op metadata and never reapply historical files',()=>{
 for(const count of [123,124,180,230])for(let index=0;index<4;index++){
  const result=deriveHostedMigrationBatches({sources,stage:stage(index,count)});
  if(count>=boundaries[index]){assert.deepEqual(result.batches,[]);assert.deepEqual(result.pending,[]);assert.equal(result.included.length,count);}
  else assert.equal(result.batches.at(-1)?.expectedAfterVersions.length,boundaries[index]);
 }
});

function reconciliationTemplate(){
 const identity={projectRef:'mqxdjvsyckzocokuikmx',sourceSha:source,treeSha:'1e85393d46beb4f5356e07277a13a7ef33cc67d9',planSha256:'413d23ed86f7379b3e88b90e09370762ce576d0395f4c4fceaa44d0f3abf3cf1',stageId:'prefix',stageSha256:hash(JSON.stringify({included:rows.slice(0,123),configSha256})),databaseUrl:'postgresql://postgres.mqxdjvsyckzocokuikmx@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',approvalDigest:'d46d4616c1b9eecdcd474b080bfefac98ee959fb7c54819d510773fc661a98de',ciRunId:'37702851953',certificateSha256:'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'};
 const ownerJson=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',identity})+'\n';
 const payload=(state:string)=>({version:1,identity,state,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'});
 const first=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:payload('INTENT'),payloadSha256:hash(JSON.stringify(payload('INTENT')))})+'\n';
 const second=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:2,previousSha256:hash(first),payload:payload('REQUIRES_REVIEW'),payloadSha256:hash(JSON.stringify(payload('REQUIRES_REVIEW')))})+'\n';
 return{version:1,purpose:'CUEVO_UNKNOWN_PREFIX_RECONCILIATION_TEMPLATE',recoverySource:{sourceSha:'4'.repeat(40),treeSha:'5'.repeat(40),ciRunId:'37710000000',releaseRunId:'37710000001',runAttempt:1},originalRunId:'37703459549',originalRunAttempt:1,originalIdentity:identity,ownerJson,recordJson:[first,second],stageRows:rows.slice(0,123),configSha256,prefixRows:rows.slice(0,120),historySha256:'e'.repeat(64),cataloguePolicySha256:'f'.repeat(64),catalogueSha256:'1'.repeat(64),absencePolicySha256:'2'.repeat(64),endpointSha256:'3'.repeat(64)};
}

test('only the exact original120-of123 template permits three-file recovery metadata',()=>{
 const input=stage(0,120),template=reconciliationTemplate(),result=deriveHostedMigrationBatches({sources,stage:input,reconciliationTemplate:template});
 assert.equal(result.evidence,'SUPPLIED_SOURCE_BATCH_METADATA_ONLY');assert.equal(result.batches.length,1);
 assert.deepEqual(result.batches[0].pending,rows.slice(120,123));assert.equal(result.batches[0].expectedBeforeVersions.length,120);assert.equal(result.batches[0].expectedAfterVersions.length,123);
 assert.throws(()=>deriveHostedMigrationBatches({sources,stage:stage(0,119),reconciliationTemplate:template}));
 assert.throws(()=>deriveHostedMigrationBatches({sources,stage:input,reconciliationTemplate:{...template,originalRunId:'37703459550'}}));
});

test('accessors proxies source-byte drift and extra configuration are denied before reading traps',()=>{
 let traps=0;const input=stage(0);
 assert.throws(()=>deriveHostedMigrationBatches({sources,get stage(){traps++;return input;}}));
 assert.throws(()=>deriveHostedMigrationBatches(new Proxy({sources,stage:input},{get(){traps++;return undefined;}})));
 assert.equal(traps,0);
 const changed=sources.map((row,index)=>index?row:{name:row.name,bytes:new TextEncoder().encode('select 99;')});assert.throws(()=>deriveHostedMigrationBatches({sources:changed,stage:input}));
 assert.throws(()=>deriveHostedMigrationBatches({...{sources,stage:input},maxPendingPerBatch:100} as never));
});
