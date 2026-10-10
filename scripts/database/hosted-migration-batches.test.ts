import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve, join } from 'node:path';
import { readHistoricalMigrationSources, createCanonicalHostedMigrationPlan, prepareCanonicalMigrationOperation, readCanonicalMigrationOperation, disposeCanonicalMigrationOperation } from './hosted-migration-plan';
import { execFileSync } from 'node:child_process';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
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

test('explicit SQL file materialization preserves original batch hashes while metadata-only stages refuse',()=>{
 const original=stage(2),legacy=deriveHostedMigrationBatches({sources,stage:original}),materialized=deriveHostedMigrationBatches({sources,stage:{...original,materialization:'SQL_FILES'}});assert.deepEqual(materialized,legacy);
 assert.throws(()=>deriveHostedMigrationBatches({sources,stage:{...original,materialization:'METADATA_ONLY'} as never}));
});

test('arbitrary middle prefixes, changed hashes and reordered stage rows require review',()=>{
 const arbitrary=stage(0,120);assert.throws(()=>deriveHostedMigrationBatches({sources,stage:arbitrary}));
 for(const mutate of [(s:ReturnType<typeof stage>)=>{s.included[0].sha256='0'.repeat(64);},(s:ReturnType<typeof stage>)=>{s.pending.reverse();},(s:ReturnType<typeof stage>)=>{s.expectedAfterVersions.pop();},(s:ReturnType<typeof stage>)=>{s.configSha256='0'.repeat(64);},(s:ReturnType<typeof stage>)=>{s.commandArgs.push('--include-seed');}]){const changed=structuredClone(stage(2));mutate(changed);assert.throws(()=>deriveHostedMigrationBatches({sources,stage:changed}));}
});
test('closed child144 residual batches start at144 and never replay the original installed20 files',async()=>{
 const fixture=(await import('./hosted-original-child-recovery.fixture')).originalChildRecoveryPlanFixture({sha:'a'.repeat(40),tree:'b'.repeat(40)}),template=fixture.originalChildRecovery.template,workdir='/new/pre-observability',inputStage={id:'pre-observability' as const,workdir,included:template.stageRows,pending:template.stageRows.slice(144),expectedBeforeVersions:template.stageRows.slice(0,144).map(row=>row.version).sort(),expectedAfterVersions:template.stageRows.map(row=>row.version).sort(),configSha256:template.configSha256,commandArgs:['db','push','--linked','--project-ref',template.originalIdentity.projectRef,'--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json']},result=deriveHostedMigrationBatches({sources:fixture.sources,stage:inputStage,originalChildRecovery:fixture.originalChildRecovery});assert.deepEqual(result.batches.map(batch=>[batch.expectedBeforeVersions.length,batch.expectedAfterVersions.length,batch.pending.length]),[[144,164,20],[164,180,16]]);assert.equal(result.batches[0].pending.some(row=>template.firstChild.pending.some(old=>old.name===row.name)),false);assert.throws(()=>deriveHostedMigrationBatches({sources:fixture.sources,stage:inputStage}));assert.throws(()=>deriveHostedMigrationBatches({sources:fixture.sources,stage:{...inputStage,expectedBeforeVersions:template.stageRows.slice(0,145).map(row=>row.version).sort(),pending:template.stageRows.slice(145)},originalChildRecovery:fixture.originalChildRecovery}));assert.throws(()=>deriveHostedMigrationBatches({sources:fixture.sources,stage:inputStage,originalChildRecovery:{...fixture.originalChildRecovery,catalogueReference:undefined}}));
});

test('completed stage boundaries become no-op metadata and never reapply historical files',()=>{
 for(const count of [123,124,180,230])for(let index=0;index<4;index++){
  const result=deriveHostedMigrationBatches({sources,stage:stage(index,count)});
  if(count>=boundaries[index]){assert.deepEqual(result.batches,[]);assert.deepEqual(result.pending,[]);assert.equal(result.included.length,count);}
  else assert.equal(result.batches.at(-1)?.expectedAfterVersions.length,boundaries[index]);
 }
});

function singleAppend(){
 const appended={name:'20261008120000_completed_batch_append.sql',bytes:Buffer.from('begin;\nselect 231;\ncommit;\n')},current=[...sources,appended],next={name:appended.name,version:appended.name.slice(0,14),sha256:hash(appended.bytes)};
 const final=stage(3,230);final.included=[...rows,next];final.pending=[next];final.expectedAfterVersions=final.included.map(row=>row.version).sort();
 return{current,final,next};
}

test('exact completed230 source permits one231 append and unchanged earlier no-op stages',()=>{
 const{current,final,next}=singleAppend();
 const result=deriveHostedMigrationBatches({sources:current,stage:final,completedSource:sources});
 assert.deepEqual(result.batches.map(batch=>batch.pending),[[next]]);assert.equal(result.batches[0].expectedBeforeVersions.length,230);assert.equal(result.batches[0].expectedAfterVersions.length,231);
 for(let index=0;index<3;index++){const noop=deriveHostedMigrationBatches({sources:current,stage:stage(index,230),completedSource:sources});assert.deepEqual(noop.pending,[]);assert.deepEqual(noop.batches,[]);assert.equal(noop.included.length,230);}
 assert.throws(()=>deriveHostedMigrationBatches({sources:current,stage:final}));
});

test('historical append boundary refuses changed incomplete nonprefix sparse and proxy source evidence',()=>{
 const{current,final}=singleAppend();let traps=0;
 for(const completedSource of[sources.slice(0,-1),[...sources,current.at(-1)!],sources.map((row,index)=>index?row:{...row,bytes:Buffer.from('select forged;')}),new Array(sources.length),new Proxy(sources,{get(){traps++;return undefined;}})])assert.throws(()=>deriveHostedMigrationBatches({sources:current,stage:final,completedSource}));
 const changed=structuredClone(final);changed.expectedBeforeVersions.pop();changed.pending=changed.included.slice(229);assert.throws(()=>deriveHostedMigrationBatches({sources:current,stage:changed,completedSource:sources}));
 const coherent=structuredClone(final);coherent.included[200].sha256=hash('coherently forged historical statement');const forged=current.map(row=>row.name===coherent.included[200].name?{...row,bytes:Buffer.from('coherently forged historical statement')}:row);assert.throws(()=>deriveHostedMigrationBatches({sources:forged,stage:coherent,completedSource:sources}));
 assert.throws(()=>deriveHostedMigrationBatches({...{sources:current,stage:final},completedSourceCount:230} as never));
 assert.throws(()=>deriveHostedMigrationBatches({sources:current,stage:final,get completedSource(){traps++;return sources;}}));assert.equal(traps,0);
 assert.throws(()=>deriveHostedMigrationBatches({sources,stage:stage(0,120),completedSource:sources.slice(0,120)}));
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

function actualGit(root:string,...args:string[]){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();}
async function canonicalFixture(run:(input:{repoRoot:string;sourceSha:string;treeSha:string;plan:ReturnType<typeof createCanonicalHostedMigrationPlan>['plan']},loaded:typeof sources)=>Promise<void>,baseSource=source){
 const root=mkdtempSync(join(tmpdir(),'cuevo-canonical-batches-')),repository=resolve(import.meta.dirname,'../..');try{actualGit(root,'clone','--shared','--no-checkout','--quiet',repository,'.');actualGit(root,'checkout','--quiet','--detach',baseSource);const sourceSha=actualGit(root,'rev-parse','HEAD'),treeSha=actualGit(root,'rev-parse','HEAD^{tree}'),loaded=readHistoricalMigrationSources(root,sourceSha,treeSha),plan=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,now:Date.parse('2026-10-10T06:01:00Z'),target:{projectRef:'mqxdjvsyckzocokuikmx',boundProjectRef:'mqxdjvsyckzocokuikmx',projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:'2026-10-10T06:01:00Z',authUsers:0,storageObjects:0,appSchemas:[],migrationVersions:[],dispatchDisabled:true,population:'EMPTY'}}).plan;await run({repoRoot:root,sourceSha,treeSha,plan},loaded);}finally{assert.ok(root.startsWith(resolve(tmpdir())+'\\')||root.startsWith(resolve(tmpdir())+'/'));rmSync(root,{recursive:true,force:true});}
}

test('canonical batch reads reuse one actual source replay while every current source read remains live',async()=>{
 const subject=await import('./hosted-migration-batches');await canonicalFixture(async(input,loaded)=>{
  const selected={...stage(2),workdir:join(input.repoRoot,'.local/hosted-release/probe/pre-observability')};selected.commandArgs[8]=selected.workdir;const value={...input,stage:selected},expected=deriveHostedMigrationBatches({sources:loaded,stage:selected}),cp=createRequire(import.meta.url)('node:child_process')as typeof import('node:child_process'),nativeExec=cp.execFileSync,nativeDecode=TextDecoder.prototype.decode;let replayDecodes=0,payloads=0,currentChecks=0;
  cp.execFileSync=((file:string,args:readonly string[],...rest:unknown[])=>{if(file==='git'&&args[0]==='-C'&&args[1]===input.repoRoot){if(args.includes('--batch'))payloads++;if(args.includes('--batch-check'))currentChecks++;}return Reflect.apply(nativeExec,cp,[file,args,...rest]);})as typeof nativeExec;syncBuiltinESMExports();
  TextDecoder.prototype.decode=function(...args:Parameters<TextDecoder['decode']>){if(new Error().stack?.includes('replay-plan.ts'))replayDecodes++;return Reflect.apply(nativeDecode,this,args);};let operation:ReturnType<typeof prepareCanonicalMigrationOperation>|undefined;
  try{operation=prepareCanonicalMigrationOperation(input);const canonical=(subject as unknown as {deriveCanonicalHostedMigrationBatches?: (request:typeof value,token:typeof operation)=>ReturnType<typeof deriveHostedMigrationBatches>}).deriveCanonicalHostedMigrationBatches;
   const invoke=()=>canonical?canonical(value,operation):deriveHostedMigrationBatches({sources:loaded,stage:selected});assert.deepEqual(invoke(),expected);assert.deepEqual(invoke(),expected);assert.equal(payloads,1);assert.equal(replayDecodes,loaded.filter(row=>row.bytes.length>0).length,'Two canonical derivations must keep only the initial actual SQL replay, not replay immutable SQL again');assert.equal(currentChecks,2,'Each canonical derivation must still inspect original blob existence and current physical source');
  }finally{TextDecoder.prototype.decode=nativeDecode;cp.execFileSync=nativeExec;syncBuiltinESMExports();if(operation)disposeCanonicalMigrationOperation(operation);}
 });
});

test('canonical batches refuse invalid stage or source owners without fallback or cached stage acceptance',async()=>{
 const subject=await import('./hosted-migration-batches');await canonicalFixture(async input=>{const token=prepareCanonicalMigrationOperation(input),selected=stage(2),value={...input,stage:selected};let traps=0;
  try{
   for(const invalid of[undefined,null,Object.freeze({}),new Proxy(token,{})])assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches(value,invalid as never));
   for(const mutate of[(s:typeof selected)=>{s.pending.reverse();},(s:typeof selected)=>{s.expectedAfterVersions.pop();},(s:typeof selected)=>{s.configSha256='0'.repeat(64);},(s:typeof selected)=>{s.commandArgs.push('--include-seed');},(s:typeof selected)=>{s.commandArgs[4]='a'.repeat(20);},(s:typeof selected)=>{s.included[0].sha256='f'.repeat(64);},(s:typeof selected)=>{s.materialization='METADATA_ONLY';}]){const changed=structuredClone(selected);mutate(changed);assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...input,stage:changed},token));assert.equal(readCanonicalMigrationOperation(token,input).rows.length,input.plan.migrations.length);}
   for(const bad of[{...value,sources}, {...value,completedSourceCount:230},{...value,rows:input.plan.migrations},{...value,get stage(){traps++;return selected;}},new Proxy(value,{get(){traps++;return undefined;}})])assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches(bad as never,token));assert.equal(traps,0);
   const first=subject.deriveCanonicalHostedMigrationBatches(value,token);first.batches[0].pending[0].sha256='0'.repeat(64);assert.deepEqual(subject.deriveCanonicalHostedMigrationBatches(value,token),deriveHostedMigrationBatches({sources,stage:selected}));
   const file=join(input.repoRoot,'supabase/migrations',input.plan.migrations[0].name),bytes=readFileSync(file);writeFileSync(file,'select source_changed;\n');assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches(value,token));writeFileSync(file,bytes);assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches(value,token),'A failed actual source owner cannot reacquire after restoration');
  }finally{disposeCanonicalMigrationOperation(token);}
  for(const key of['repoRoot','sourceSha','treeSha','plan']as const){const held=prepareCanonicalMigrationOperation(input),changed={...value};if(key==='repoRoot')changed.repoRoot=input.repoRoot+'/other';if(key==='sourceSha')changed.sourceSha='0'.repeat(40);if(key==='treeSha')changed.treeSha='0'.repeat(40);if(key==='plan')changed.plan={...input.plan,observedAt:'2026-10-10T06:00:00Z'};assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches(changed,held));assert.throws(()=>readCanonicalMigrationOperation(held,input));disposeCanonicalMigrationOperation(held);}
 });
});

test('canonical closed child144 batches preserve genuine original source and residual20 plus16',async()=>{
 const subject=await import('./hosted-migration-batches');await canonicalFixture(async input=>{
  actualGit(input.repoRoot,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','--allow-empty','-m','Distinct canonical child batches');const sourceSha=actualGit(input.repoRoot,'rev-parse','HEAD'),treeSha=actualGit(input.repoRoot,'rev-parse','HEAD^{tree}'),raw=(await import('./hosted-original-child-recovery.fixture')).originalChildRecoveryPlanFixture({sha:sourceSha,tree:treeSha}),plan=createCanonicalHostedMigrationPlan({repoRoot:input.repoRoot,sourceSha,treeSha,target:raw.target,priorReceipt:raw.priorReceipt,originalChildRecovery:raw.originalChildRecovery,now:raw.now}).plan,binding={repoRoot:input.repoRoot,sourceSha,treeSha,plan},token=prepareCanonicalMigrationOperation(binding),selected={...stage(2),included:plan.migrations.slice(0,180),pending:plan.migrations.slice(144,180),expectedBeforeVersions:plan.migrations.slice(0,144).map(row=>row.version).sort(),expectedAfterVersions:plan.migrations.slice(0,180).map(row=>row.version).sort()};
  try{const result=subject.deriveCanonicalHostedMigrationBatches({...binding,stage:selected},token);assert.deepEqual(result,deriveHostedMigrationBatches({sources:raw.sources,stage:selected,originalChildRecovery:plan.originalChildRecovery}));assert.deepEqual(result.batches.map(batch=>batch.pending.length),[20,16]);assert.equal(plan.priorSchemaRelease!.migrationCount,124);assert.equal(plan.applied.length,144);assert.equal(result.batches.flatMap(batch=>batch.pending).some(row=>raw.originalChildRecovery.template.firstChild.pending.some(old=>old.name===row.name)),false);const changed=structuredClone(selected);changed.pending=plan.migrations.slice(145,180);changed.expectedBeforeVersions=plan.migrations.slice(0,145).map(row=>row.version).sort();assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...binding,stage:changed},token));assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...binding,stage:selected,originalChildRecovery:undefined}as never,token));}finally{disposeCanonicalMigrationOperation(token);}
 },'1a493ad735798bb6d3fa0ffaabc779e62149ac37');
});

test('canonical exact120 template and completed230 append use bound original historical evidence',async()=>{
 const subject=await import('./hosted-migration-batches');await canonicalFixture(async(input,loaded)=>{
  const template=reconciliationTemplate();template.recoverySource.sourceSha=input.sourceSha;template.recoverySource.treeSha=input.treeSha;const prefix=rows.slice(0,120),priorReceipt={projectRef:input.plan.projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,migrations:prefix.map(({version,sha256})=>({version,sha256}))},target={projectRef:input.plan.projectRef,boundProjectRef:input.plan.projectRef,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:'2026-10-10T06:01:00Z',authUsers:0,storageObjects:3,appSchemas:['app','authorization','internal'],migrationVersions:prefix.map(row=>row.version),dispatchDisabled:true,population:'SCHEMA_ONLY'},plan=createCanonicalHostedMigrationPlan({...input,target,priorReceipt,reconciliationTemplate:template,now:Date.parse(target.observedAt)}).plan,binding={...input,plan},token=prepareCanonicalMigrationOperation(binding),selected=stage(0,120);
  try{assert.deepEqual(subject.deriveCanonicalHostedMigrationBatches({...binding,stage:selected},token),deriveHostedMigrationBatches({sources:loaded,stage:selected,reconciliationTemplate:template}));const changed=structuredClone(selected);changed.expectedBeforeVersions.pop();changed.pending=rows.slice(119,123);assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...binding,stage:changed},token));assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...binding,stage:selected,reconciliationTemplate:template}as never,token));}finally{disposeCanonicalMigrationOperation(token);}
  const append=singleAppend(),name=append.next.name;writeFileSync(join(input.repoRoot,'supabase/migrations',name),append.current.at(-1)!.bytes);actualGit(input.repoRoot,'add','supabase/migrations');actualGit(input.repoRoot,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','One canonical append');const sourceSha=actualGit(input.repoRoot,'rev-parse','HEAD'),treeSha=actualGit(input.repoRoot,'rev-parse','HEAD^{tree}'),prior={projectRef:input.plan.projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,migrations:rows.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:230},completedPlan=createCanonicalHostedMigrationPlan({repoRoot:input.repoRoot,sourceSha,treeSha,target:{...target,authUsers:133,migrationVersions:rows.map(row=>row.version),population:'GUARDED_SYNTHETIC'},priorReceipt:prior,now:Date.parse(target.observedAt)}).plan,completedBinding={repoRoot:input.repoRoot,sourceSha,treeSha,plan:completedPlan},held=prepareCanonicalMigrationOperation(completedBinding);
  try{assert.deepEqual(subject.deriveCanonicalHostedMigrationBatches({...completedBinding,stage:append.final},held),deriveHostedMigrationBatches({sources:append.current,stage:append.final,completedSource:loaded}));assert.equal(subject.deriveCanonicalHostedMigrationBatches({...completedBinding,stage:append.final},held).batches[0].pending.length,1);const changed=structuredClone(append.final);changed.expectedBeforeVersions.pop();changed.pending=changed.included.slice(229);assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...completedBinding,stage:changed},held));assert.throws(()=>subject.deriveCanonicalHostedMigrationBatches({...completedBinding,stage:append.final,completedSource:loaded}as never,held));}finally{disposeCanonicalMigrationOperation(held);}
 });
});
