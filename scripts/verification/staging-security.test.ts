import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { canonicalReleaseReviewJson } from './release-review';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const { yazl }=createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {yazl:{ZipFile:new()=>{outputStream:Readable;addBuffer(bytes:Buffer,name:string):void;end():void}}};
async function receiptZip(value:unknown){const zip=new yazl.ZipFile(),chunks:Buffer[]=[];const done=new Promise<Buffer>((resolve,reject)=>{zip.outputStream.on('data',chunk=>chunks.push(chunk));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});zip.addBuffer(Buffer.from(canonicalReleaseReviewJson(value)),'receipt.json');zip.end();return done;}
const receipt=()=>({version:1,purpose:'ORIGINAL_PROCESSED_CODEQL_RECEIPT',policy:'CODEQL_MEDIUM_HIGH_CRITICAL_V1',repository:expected.repository,sourceSha:expected.sha,ref:'refs/heads/main',runId:'41',runAttempt:2,observedAt:'2026-10-07T00:01:00Z',analysis:{id:20,sarifId:'01234567-89ab-cdef-0123-456789abcdef',key:'.github/workflows/ci.yml:codeql',toolVersion:'2.27.1',createdAt:'2026-10-07T00:00:30Z'},result:{check:'codeql-open-security-alerts',status:'VERIFIED',analysisResults:0,analysisRules:87,openAlerts:0,blockingAlerts:0,severities:{low:0,medium:0,high:0,critical:0,nonsecurity:0},snapshotPasses:2}});
const expected = { sha: 'a'.repeat(40), repository: 'owner/repo' };
const sourceBytes=readFileSync(resolve('.github/workflows/ci.yml'));
const sourceMetadata=()=>({type:'file',path:'.github/workflows/ci.yml',encoding:'base64',size:sourceBytes.length,content:sourceBytes.toString('base64'),sha:createHash('sha1').update(Buffer.from('blob '+sourceBytes.length+'\0')).update(sourceBytes).digest('hex')});
const run = { id: 41, run_attempt: 2, head_sha: expected.sha, head_branch: 'main', event: 'push', status: 'in_progress', conclusion: null, path: '.github/workflows/ci.yml', repository: { full_name: expected.repository } };
const requiredSteps = ['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund', 'Run npm ci --ignore-scripts --no-audit --no-fund', 'Run node node_modules/esbuild/install.js', 'Run github/codeql-action/init@24c54180a607b1449ed407dd24f251e4e9147c8d', 'Run github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d', 'Require current processed CodeQL security findings to be clear','Retain original processed CodeQL receipt'];
const job = () => ({ id: 51, name: 'codeql', run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, head_branch: 'main', status: 'completed', conclusion: 'success', started_at:'2026-10-07T00:00:00Z',completed_at:'2026-10-07T00:02:00Z',steps: requiredSteps.map((name, index) => ({ name, number: index + 1, status: 'completed', conclusion: 'success' })) });
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'staging-security.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.readCanonicalStagingSecurity, 'function', 'canonical same-source security job reader exists');
  return subject as typeof import('./staging-security');
}
function fixture(mutate: (path: string, value: unknown, count: number) => unknown = (_path, value) => value) {
  const calls: string[] = [];
  const reader = async (path: string): Promise<unknown> => {
    calls.push(path); let value: unknown;
    if (path === 'git/ref/heads/main') value = { object: { type: 'commit', sha: expected.sha } };
    else if(path==='git/commits/'+expected.sha)value={sha:expected.sha,tree:{sha:'b'.repeat(40)},verification:{verified:true,reason:'valid',signature:'controlled signed source',payload:'controlled source tuple'}};
    else if(path==='contents/.github/workflows/ci.yml?ref='+expected.sha)value=sourceMetadata();
    else if (path.startsWith('actions/workflows/ci.yml/runs?')) value = { total_count: 1, workflow_runs: [run] };
    else if (path === 'actions/runs/41') value = run;
    else if (path === 'actions/runs/41/attempts/2/jobs?per_page=100&page=1') value = { total_count: 2, jobs: [job(), { id: 52, name: 'technical-mvp', run_id: run.id, run_attempt: 2, head_sha: run.head_sha, head_branch: 'main', status: 'in_progress', conclusion: null,started_at:null,completed_at:null }] };
    else assert.fail('unexpected fixed official route');
    return mutate(path, value, calls.filter(value => value === path).length);
  };
  return { reader, calls };
}
async function withReceipt(f:ReturnType<typeof fixture>,value:unknown=receipt()){
 const archive=await receiptZip(value);const reader=async(path:string)=>path==='actions/runs/41/artifacts?per_page=100'?{total_count:1,artifacts:[{id:72,name:'cuevo-codeql-41-2',size_in_bytes:archive.length,expired:false,digest:'sha256:'+createHash('sha256').update(archive).digest('hex'),created_at:'2026-10-07T00:01:10Z',expires_at:'2026-10-21T00:00:00Z',workflow_run:{id:41,head_sha:expected.sha,head_branch:'main'}}]}:f.reader(path);
 return{...f,reader,artifact:async()=>archive};
}

test('current official security admits the actual reviewed new paired CodeQL action and cleanup names',async()=>{
 const f=await withReceipt(fixture((path,value)=>{
  if(path==='actions/runs/41/attempts/2/jobs?per_page=100&page=1'){
   const result=structuredClone(value) as {jobs:ReturnType<typeof job>[]};
   const current=result.jobs[0];
   current.steps[5].name='Run github/codeql-action/init@24c54180a607b1449ed407dd24f251e4e9147c8d';
   current.steps[6].name='Run github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d';
   current.steps.push({name:'Post Run github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d',number:17,status:'completed',conclusion:'success'},{name:'Post Run github/codeql-action/init@24c54180a607b1449ed407dd24f251e4e9147c8d',number:18,status:'completed',conclusion:'success'});
   return result;
  }return value;
 }));
 const subject=await api(),result=await subject.readCanonicalStagingSecurityAndGuard(expected,f.reader,f.artifact);
 assert.equal(result.proof.status,'VERIFIED');await result.refreshOriginalMetadata();
});

test('official security refuses invalid source bytes signature and whole-job drift before any receipt ZIP',async()=>{
 const subject=await api();
 for(const mode of ['blob','base64','length','size','utf8','path','encoding','signature','tree','source','pair','old-pair','gate','hidden','permission']){
  const f=await withReceipt(fixture((path,value)=>{
   if(path.startsWith('git/commits/')){const data=structuredClone(value) as {sha:string;tree:{sha:string};verification:{verified:boolean}};if(mode==='signature')data.verification.verified=false;if(mode==='tree')data.tree.sha='not-a-tree';if(mode==='source')data.sha='c'.repeat(40);return data;}
   if(path.startsWith('contents/')){const data=structuredClone(value) as ReturnType<typeof sourceMetadata>;
    if(mode==='blob')data.sha='0'.repeat(40);if(mode==='base64')data.content='not canonical!';if(mode==='length')data.size--;if(mode==='size')data.size=128*1024+1;if(mode==='path')data.path='.github/workflows/other.yml';if(mode==='encoding')data.encoding='none';
    let bytes:Buffer|undefined;
    if(mode==='utf8')bytes=Buffer.from([0xff]);
    if(['pair','old-pair','gate','hidden','permission'].includes(mode)){const flow=createRequire(import.meta.url)('js-yaml').load(sourceBytes.toString()) as {jobs:{codeql:{steps:Record<string,unknown>[];permissions:Record<string,unknown>}}},job=flow.jobs.codeql;
     if(mode==='pair'||mode==='old-pair')job.steps[5].uses='github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2';if(mode==='old-pair')job.steps[6].uses='github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2';if(mode==='gate')(job.steps[6].with as Record<string,unknown>)['wait-for-processing']=false;if(mode==='hidden')(job.steps[8].with as Record<string,unknown>)['include-hidden-files']=false;if(mode==='permission')job.permissions.contents='write';bytes=Buffer.from(createRequire(import.meta.url)('js-yaml').dump(flow));
    }
    if(bytes){data.size=bytes.length;data.content=bytes.toString('base64');data.sha=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');}return data;
   }return value;
  }));let zipReads=0;
  await assert.rejects(subject.readCanonicalStagingSecurityAndGuard(expected,f.reader,async()=>{zipReads++;return f.artifact();}),/requires review/,mode);assert.equal(zipReads,0,mode);
 }
});

test('original new-pair source metadata cannot renew receipts or recover after source drift',async()=>{
 const subject=await api(),f=await withReceipt(fixture());let zipReads=0,changed=false;
 const github=async(path:string)=>{const value=await f.reader(path);return changed&&path.startsWith('contents/')?{...value as object,sha:'0'.repeat(40)}:value;};
 const result=await subject.readOriginalCanonicalStagingSecurityAndGuard({...run,status:'completed',conclusion:'success'},async path=>path==='actions/runs/41'?{...run,status:'completed',conclusion:'success'}:github(path),async()=>{zipReads++;return f.artifact();});
 const original=canonicalReleaseReviewJson(result.proof);await result.refreshOriginalMetadata();assert.equal(zipReads,1);assert.equal(canonicalReleaseReviewJson(result.proof),original);
 changed=true;await assert.rejects(result.refreshOriginalMetadata());changed=false;assert.throws(result.assertOriginalValidity);await assert.rejects(result.refreshOriginalMetadata());assert.equal(zipReads,1);
});

test('official new source refuses old action or cleanup names independently of successful job metadata',async()=>{
 const subject=await api();
 for(const mode of ['old-actions','old-post']){
  const f=await withReceipt(fixture((path,value)=>{
   if(!path.includes('/jobs?'))return value;const data=structuredClone(value) as {jobs:ReturnType<typeof job>[]},steps=data.jobs[0].steps;
   if(mode==='old-actions'){steps[5].name='Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2';steps[6].name='Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2';}
   else steps.push({name:'Post Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',number:17,status:'completed',conclusion:'success'});return data;
  }));let zipReads=0;await assert.rejects(subject.readCanonicalStagingSecurityAndGuard(expected,f.reader,async()=>{zipReads++;return f.artifact();}));assert.equal(zipReads,0);
 }
});

test('original old CodeQL receipts retain actual source ancestry and never admit current or dirty source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-original-codeql-'));
 try{
  execFileSync('git',['clone','--shared','--no-checkout','--quiet',resolve('.'),root],{windowsHide:true});
  execFileSync('git',['-C',root,'checkout','--detach','--quiet','c4e734d07b1484262bbedbc4b9fcc73baf3eeff2'],{windowsHide:true});
  await mkdir(join(root,'.local'),{recursive:true});
  const runner=join(root,'.local/codeql-original.mjs');
  await writeFile(runner,`import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{readFileSync,writeFileSync}from'node:fs';
const input=JSON.parse(readFileSync(process.env.CUEVO_ORIGINAL_CODEQL_INPUT,'utf8')),api=await import(input.url),{canonicalReleaseExecutionJson}=await import(input.reviewUrl),{yazl}=createRequire(input.packageJson)('playwright-core/lib/utilsBundle'),yaml=createRequire(input.packageJson)('js-yaml');
const git=args=>execFileSync('git',args,{windowsHide:true}),date=delta=>new Date(Date.now()+delta).toISOString();
for(const source of input.sources){
const bytes=git(['show',source+':.github/workflows/ci.yml']),tree=git(['rev-parse',source+'^{tree}']).toString().trim(),flow=yaml.load(bytes.toString()),names=flow.jobs.codeql.steps.map(step=>step.name??'Run '+(step.uses??step.run));
const run={id:41,run_attempt:2,head_sha:source,head_branch:'main',event:'push',path:'.github/workflows/ci.yml',status:'completed',conclusion:'success',repository:{full_name:'attaulhaq0/Cuevo'}};
const started=date(-20000),completed=date(-2000),observed=date(-5000),created=date(-10000),expiry=date(60000),value={version:1,purpose:'ORIGINAL_PROCESSED_CODEQL_RECEIPT',policy:'CODEQL_MEDIUM_HIGH_CRITICAL_V1',repository:run.repository.full_name,sourceSha:source,ref:'refs/heads/main',runId:'41',runAttempt:2,observedAt:observed,analysis:{id:20,sarifId:'01234567-89ab-cdef-0123-456789abcdef',key:'.github/workflows/ci.yml:codeql',toolVersion:'controlled-original',createdAt:created},result:{check:'codeql-open-security-alerts',status:'VERIFIED',analysisResults:0,analysisRules:87,openAlerts:0,blockingAlerts:0,severities:{low:0,medium:0,high:0,critical:0,nonsecurity:0},snapshotPasses:2}};
const zip=new yazl.ZipFile(),parts=[],done=new Promise((yes,no)=>{zip.outputStream.on('data',p=>parts.push(p));zip.outputStream.on('error',no);zip.outputStream.on('end',()=>yes(Buffer.concat(parts)));});zip.addBuffer(Buffer.from(canonicalReleaseExecutionJson(value)),'receipt.json');zip.end();const archive=await done;let archives=0;
const get=async path=>{if(path==='git/ref/heads/main')return{object:{type:'commit',sha:source}};if(path==='git/commits/'+source)return{sha:source,tree:{sha:tree},verification:{verified:true,reason:'valid',signature:'controlled source signature metadata',payload:'controlled signed source tuple'}};if(path==='contents/.github/workflows/ci.yml?ref='+source)return{type:'file',path:'.github/workflows/ci.yml',encoding:'base64',size:bytes.length,content:bytes.toString('base64'),sha:createHash('sha1').update(Buffer.from('blob '+bytes.length+'\\0')).update(bytes).digest('hex')};if(path==='actions/runs/41')return run;if(path==='actions/runs/41/attempts/2/jobs?per_page=100&page=1')return{total_count:1,jobs:[{id:51,name:'codeql',run_id:41,run_attempt:2,head_sha:source,head_branch:'main',status:'completed',conclusion:'success',started_at:started,completed_at:completed,steps:names.map((name,index)=>({name,number:index+1,status:'completed',conclusion:'success'}))}]};if(path==='actions/runs/41/artifacts?per_page=100')return{total_count:1,artifacts:[{id:72,name:'cuevo-codeql-41-2',size_in_bytes:archive.length,expired:false,digest:'sha256:'+createHash('sha256').update(archive).digest('hex'),created_at:observed,expires_at:expiry,workflow_run:{id:41,head_sha:source,head_branch:'main'}}]};throw Error('Unexpected fixed test route');};
if(input.dirty)writeFileSync('README.md','Changed local original source');
if(input.dirty||input.current){await assert.rejects(input.current?api.readCanonicalStagingSecurityAndGuard({sha:source,repository:run.repository.full_name},get,async()=>{archives++;return archive;}):api.readOriginalCanonicalStagingSecurityAndGuard(run,get,async()=>{archives++;return archive;}));assert.equal(archives,0);}
else{const result=await api.readOriginalCanonicalStagingSecurityAndGuard(run,get,async()=>{archives++;return archive;});const original=JSON.stringify(result.proof);await result.refreshOriginalMetadata();await result.refreshOriginalMetadata();assert.equal(archives,1);assert.equal(JSON.stringify(result.proof),original);result.assertOriginalValidity();}
}
console.log(JSON.stringify({controlledOriginalSource:true}));`);
  for(const mode of ['original','current','dirty']){
   const input=join(root,'.local/input.json');await writeFile(input,JSON.stringify({url:pathToFileURL(resolve('scripts/verification/staging-security.ts')).href,packageJson:resolve('package.json'),reviewUrl:pathToFileURL(resolve('scripts/verification/release-review.ts')).href,sources:mode==='original'?['08006c085d5030178bc104129b7ff28f7273346e','561085f8df13c40fbd23ba51f422ed3445d3a4a9','c4e734d07b1484262bbedbc4b9fcc73baf3eeff2','239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37']:['c4e734d07b1484262bbedbc4b9fcc73baf3eeff2'],current:mode==='current',dirty:mode==='dirty'}));
   const result=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,runner],{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,CUEVO_ORIGINAL_CODEQL_INPUT:input}});
   assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).controlledOriginalSource,true);
  }
 }finally{assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}
});
test('missing malformed stale or changed processed receipt never falls back to successful job metadata',async()=>{
 const subject=await api();const original=fixture();await assert.rejects(subject.readCanonicalStagingSecurity(expected,original.reader));
 for(const mode of ['source','attempt','policy','time','private','digest','changed-metadata','missing']){
  const value=receipt();if(mode==='source')value.sourceSha='b'.repeat(40);else if(mode==='attempt')value.runAttempt=3;else if(mode==='policy')value.policy='OTHER';else if(mode==='time')value.observedAt='2026-10-07T00:03:00Z';else if(mode==='private')Object.assign(value,{rawAlerts:'PRIVATE CANARY'});
  const f=await withReceipt(fixture(),value);let reads=0;
  const reader=async(path:string)=>{const data=await f.reader(path);if(path.includes('/artifacts?')){reads++;const changed=structuredClone(data) as {total_count:number;artifacts:{digest:string}[]};if(mode==='missing')return{total_count:0,artifacts:[]};if(mode==='digest'||mode==='changed-metadata'&&reads>1)changed.artifacts[0].digest='sha256:'+'0'.repeat(64);return changed;}return data;};
  await assert.rejects(subject.readCanonicalStagingSecurity(expected,reader,f.artifact),error=>error instanceof Error&&!error.message.includes('PRIVATE'));
 }
});

test('frozen diagnostic proof refuses a foreign workflow source or changed original full attempt',async()=>{
 const subject=await api(),f=await withReceipt(fixture());
 for(const mode of ['source','event','attempt']){let reads=0;const reader=async(path:string)=>path==='actions/runs/91'?{id:91,run_attempt:mode==='attempt'&&++reads>1?2:1,head_sha:mode==='source'?'b'.repeat(40):expected.sha,head_branch:'main',event:mode==='event'?'pull_request':'schedule',status:'in_progress',conclusion:null,path:'.github/workflows/full-regression.yml',repository:{full_name:expected.repository}}:f.reader(path);await assert.rejects(subject.readFullRegressionSecurity({...expected,runId:91,runAttempt:1},reader,f.artifact));}
});
test('diagnostic receipt may refresh through same-source manual CI without changing canonical release authority',async()=>{
 const subject=await api(),f=await withReceipt(fixture());
 const reader=async(path:string)=>{if(path==='actions/runs/91')return{id:91,run_attempt:1,head_sha:expected.sha,head_branch:'main',event:'schedule',status:'in_progress',conclusion:null,path:'.github/workflows/full-regression.yml',repository:{full_name:expected.repository}};const data=await f.reader(path);if(path.startsWith('actions/workflows/ci.yml/runs?'))return{total_count:1,workflow_runs:[{...run,event:'workflow_dispatch'}]};if(path==='actions/runs/41')return{...run,event:'workflow_dispatch'};return data;};
 assert.equal((await subject.readFullRegressionSecurity({...expected,runId:91,runAttempt:1},reader,f.artifact)).status,'VERIFIED');
 await assert.rejects(subject.readCanonicalStagingSecurity(expected,reader,f.artifact));
});
test('expired unrelated CI summary does not erase a retained original security receipt',async()=>{
 const subject=await api(),f=await withReceipt(fixture());const reader=async(path:string)=>{const value=await f.reader(path);if(path.includes('/artifacts?')){const row=value as {artifacts:Record<string,unknown>[]};return{total_count:2,artifacts:[...row.artifacts,{...row.artifacts[0],id:73,name:'cuevo-safe-source',expired:true,expires_at:'2026-10-01T00:00:00Z'}]};}return value;};
 assert.equal((await subject.readCanonicalStagingSecurity(expected,reader,f.artifact)).status,'VERIFIED');
});

test('official artifact redirect strips the GitHub token and refuses foreign or oversized responses',async()=>{
 const subject=await api(),previous=globalThis.fetch;
 try{
  const seen:string[]=[];globalThis.fetch=async(url,init)=>{seen.push(String(url));if(seen.length===1){assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer fixture-token');return new Response(null,{status:302,headers:{location:'https://productionresultssa1.blob.core.windows.net/receipt.zip?signature=synthetic'}});}assert.equal(new Headers(init?.headers).get('Authorization'),null);return new Response(new Uint8Array([1,2,3]));};
  assert.equal((await subject.createGithubCodeqlArtifactReader('owner/repo','fixture-token')(72)).length,3);
  for(const response of [new Response(null,{status:302,headers:{location:'https://evil.invalid/receipt.zip'}}),new Response('{}',{headers:{'content-length':'3000000'}})]){globalThis.fetch=async()=>response;await assert.rejects(subject.createGithubCodeqlArtifactReader('owner/repo','fixture-token')(72));}
 }finally{globalThis.fetch=previous;}
});

test('original recovery package transport accepts its fixed 16 MiB boundary while CodeQL remains at 2 MiB',async()=>{
 const subject=await api(),previous=globalThis.fetch,token='package-limit-private-canary';
 try{
  const bytes=new Uint8Array(16*1024*1024);bytes[0]=7;bytes[bytes.length-1]=9;
  globalThis.fetch=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
  const result=await subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72);assert.equal(result.length,16777216);assert.equal(result[0],7);assert.equal(result.at(-1),9);
  globalThis.fetch=async()=>new Response(new Uint8Array(2097153),{headers:{'content-length':'2097153'}});
  await assert.rejects(subject.createGithubCodeqlArtifactReader('owner/repo',token)(72));
 }finally{globalThis.fetch=previous;}
});

test('recovery package declared and streamed oversize responses refuse and cancel the active reader',async()=>{
 const subject=await api(),previous=globalThis.fetch,token='package-limit-private-canary';
 try{
  for(const declared of ['16777217','invalid']){let pulls=0;globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array(1));}}, {highWaterMark:0}),{headers:{'content-length':declared}});await assert.rejects(subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72));assert.equal(pulls,0,'Declared oversize refuses before reading any body');}
  for(const declared of [undefined,'1']){
   let pulls=0,cancelled=false;const stream=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array(pulls===1?16777216:1));},cancel(){cancelled=true;}}, {highWaterMark:0});
   globalThis.fetch=async()=>new Response(stream,{headers:declared?{'content-length':declared}:{}});
   await assert.rejects(subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72));assert.equal(pulls,2);assert.equal(cancelled,true);assert.equal(stream.locked,false);
  }
  let cancelled=false;globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(2097153));},cancel(){cancelled=true;}}, {highWaterMark:0}));await assert.rejects(subject.createGithubCodeqlArtifactReader('owner/repo',token)(72));assert.equal(cancelled,true,'CodeQL retains streamed2MiB denial without a header');
 }finally{globalThis.fetch=previous;}
});

test('recovery package redirects retain fixed official GETs and exclude the token on both signed host families',async()=>{
 const subject=await api(),previous=globalThis.fetch,token='redirect-private-canary';
 try{
  for(const host of ['productionresultssa123.blob.core.windows.net','results-123.actions.githubusercontent.com']){
   let requests=0;globalThis.fetch=async(raw,init)=>{requests++;assert.equal(init?.method,'GET');assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.body,undefined);assert.ok(init?.signal);
    if(requests===1){assert.equal(String(raw),'https://api.github.com/repos/owner/repo/actions/artifacts/72/zip');assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+token);return new Response(null,{status:302,headers:{location:'https://'+host+'/package.zip?signature=synthetic'}});}
    assert.equal(new URL(String(raw)).hostname,host);assert.equal(init?.redirect,'error');assert.equal(init?.headers,undefined);return new Response(new Uint8Array([4,5,6]));
   };
   assert.deepEqual(await subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72),Buffer.from([4,5,6]));assert.equal(requests,2);
  }
  for(const target of ['http://productionresultssa1.blob.core.windows.net/package.zip','https://user@productionresultssa1.blob.core.windows.net/package.zip','https://productionresultssa1.blob.core.windows.net:444/package.zip','https://productionresultssa1.blob.core.windows.net/package.zip#fragment','https://productionresultssa1.blob.core.windows.net.evil.invalid/package.zip']){
   let requests=0;globalThis.fetch=async()=>{requests++;return new Response(null,{status:302,headers:{location:target}});};await assert.rejects(subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72),error=>error instanceof Error&&!error.message.includes(token)&&!error.message.includes(target));assert.equal(requests,1);
  }
  let requests=0;globalThis.fetch=async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://productionresultssa1.blob.core.windows.net/package.zip?signature=synthetic'}});};await assert.rejects(subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72));assert.equal(requests,2,'A second redirect is refused');
  const response=new Response(new Uint8Array([1]));Object.defineProperty(response,'url',{value:'https://evil.invalid/package.zip'});globalThis.fetch=async()=>response;await assert.rejects(subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token)(72));
 }finally{globalThis.fetch=previous;}
});

test('recovery package transport retains the 20 second deadline and aborts hanging streams with cleanup',async()=>{
 const subject=await api(),previous=globalThis.fetch,previousTimeout=AbortSignal.timeout,token='abort-private-canary';
 try{
  for(const mode of ['parent','deadline'] as const){
   const parent=new AbortController(),deadline=new AbortController();let cancelled=false,pulls=0;const timeouts:number[]=[];
   AbortSignal.timeout=milliseconds=>{timeouts.push(milliseconds);return deadline.signal;};
   const stream=new ReadableStream<Uint8Array>({pull(){pulls++;(mode==='parent'?parent:deadline).abort();},cancel(){cancelled=true;}}, {highWaterMark:0});
   globalThis.fetch=async()=>new Response(stream);await assert.rejects(subject.createGithubOriginalRecoveryPackageArtifactReader('owner/repo',token,parent.signal)(72),error=>error instanceof Error&&!error.message.includes(token));
   assert.deepEqual(timeouts,[20000]);assert.equal(pulls,1);assert.equal(cancelled,true);assert.equal(stream.locked,false);
  }
 }finally{globalThis.fetch=previous;AbortSignal.timeout=previousTimeout;}
});

test('frozen full regression consumes original security receipt after main advances but release admission remains current',async()=>{
  const subject=await api(); assert.equal(typeof subject.readFullRegressionSecurity,'function');
  const archive=await receiptZip(receipt());
  const f=fixture((path,value)=>path==='git/ref/heads/main'?{object:{type:'commit',sha:'b'.repeat(40)}}:value);
  const original=f.reader;
  const reader=async(path:string)=>path==='actions/runs/91'?{id:91,run_attempt:1,head_sha:expected.sha,head_branch:'main',event:'schedule',status:'in_progress',conclusion:null,path:'.github/workflows/full-regression.yml',repository:{full_name:expected.repository}}:path==='actions/runs/41/artifacts?per_page=100'?{total_count:1,artifacts:[{id:72,name:'cuevo-codeql-41-2',size_in_bytes:archive.length,expired:false,digest:'sha256:'+createHash('sha256').update(archive).digest('hex'),created_at:'2026-10-07T00:01:10Z',expires_at:'2026-10-21T00:00:00Z',workflow_run:{id:41,head_sha:expected.sha,head_branch:'main'}}]}:path.includes('/jobs?')?{total_count:1,jobs:[job()]}:original(path);
  const proof=await subject.readFullRegressionSecurity({...expected,runId:91,runAttempt:1},reader,async id=>{assert.equal(id,72);return archive;});assert.equal(proof.status,'VERIFIED');
  await assert.rejects(subject.readCanonicalStagingSecurity(expected,reader,async()=>archive));
});
test('same-main completed canonical security admits focused staging while browser and full CI are still running', async () => {
  const { readCanonicalStagingSecurity } = await api(), f = await withReceipt(fixture());
  const result = await readCanonicalStagingSecurity(expected, f.reader,f.artifact);
  assert.equal(result.status, 'VERIFIED'); if (result.status !== 'VERIFIED') assert.fail();
  assert.equal(result.runId, 41); assert.equal(result.runAttempt, 2); assert.equal(result.jobId, 51); assert.match(result.jobsSha256, /^[a-f0-9]{64}$/);
  assert.equal(f.calls.filter(path => path === 'actions/runs/41').length, 2);
  assert.equal(f.calls.filter(path => path === 'git/ref/heads/main').length, 2);
  assert.ok(f.calls.some(path => path.includes(`head_sha=${expected.sha}`)));
});

test('canonical security guard rechecks original metadata without a second receipt ZIP and ignores unrelated job progress',async()=>{
 const subject=await api();assert.equal(typeof subject.readCanonicalStagingSecurityAndGuard,'function');
 const f=await withReceipt(fixture());let state='stable',archives=0;const reader=async(path:string)=>{const value=await f.reader(path);if(path.includes('/jobs?')){const page=value as {jobs:Record<string,unknown>[]};if(state==='progress')return{...page,jobs:page.jobs.map(row=>row.name==='technical-mvp'?{...row,status:'completed',conclusion:'failure'}:row)};}return value;};
 const guarded=await subject.readCanonicalStagingSecurityAndGuard(expected,reader,async id=>{archives++;assert.equal(id,72);return f.artifact();});assert.equal(guarded.proof.status,'VERIFIED');assert.equal(archives,1);state='progress';await guarded.refreshOriginalMetadata();await guarded.refreshOriginalMetadata();assert.equal(archives,1);assert.deepEqual(Object.keys(guarded.proof).sort(),['analysisId','jobId','jobsSha256','receiptSha256','runAttempt','runId','sarifId','status']);
 for(const mode of ['job','artifact','expiry','run-attempt','source','duplicate-job']){const f=await withReceipt(fixture());let changed=false,zipReads=0;const reader=async(path:string)=>{const value=await f.reader(path);if(!changed)return value;if(path==='actions/runs/41'&&mode==='run-attempt')return{...(value as object),run_attempt:3};if(path==='git/ref/heads/main'&&mode==='source')return{object:{type:'commit',sha:'b'.repeat(40)}};if(path.includes('/jobs?')){const page=value as {jobs:Record<string,unknown>[]};if(mode==='job')return{...page,jobs:page.jobs.map(row=>row.name==='codeql'?{...row,steps:[]}:row)};if(mode==='duplicate-job')return{...page,total_count:page.jobs.length+1,jobs:[...page.jobs,page.jobs[0]]};}if(path.includes('/artifacts?')){const page=value as {artifacts:Record<string,unknown>[]};if(mode==='artifact'||mode==='expiry')return{...page,artifacts:page.artifacts.map(row=>({...row,...(mode==='artifact'?{digest:'sha256:'+'0'.repeat(64)}:{expires_at:'2026-10-01T00:00:00Z'})}))};}return value;};const guarded=await subject.readCanonicalStagingSecurityAndGuard(expected,reader,async()=>{zipReads++;return f.artifact();});changed=true;await assert.rejects(guarded.refreshOriginalMetadata(),mode);assert.equal(zipReads,1,mode);}
});

test('canonical security guard refuses selected job drift before its initial proof is returned',async()=>{
 const subject=await api(),f=await withReceipt(fixture((path,value,count)=>path.includes('/jobs?')&&count>1?{total_count:1,jobs:[{...job(),conclusion:'failure'}]}:value));let archives=0;await assert.rejects(subject.readCanonicalStagingSecurityAndGuard(expected,f.reader,async()=>{archives++;return f.artifact();}));assert.equal(archives,1);assert.equal(f.calls.filter(path=>path.includes('/jobs?')).length,2);
});

test('canonical security original validity refuses expiry after the final source await without another ZIP',async()=>{
 const subject=await api(),f=await withReceipt(fixture()),clock=Date.now,expires=Date.parse('2026-10-21T00:00:00Z');let now=expires-1,expireAtMain=false,zipReads=0;Date.now=()=>now;try{const reader=async(path:string)=>{const value=await f.reader(path);if(expireAtMain&&path==='git/ref/heads/main')now=expires;return value;};const guarded=await subject.readCanonicalStagingSecurityAndGuard(expected,reader,async()=>{zipReads++;return f.artifact();});assert.equal(typeof guarded.assertOriginalValidity,'function');guarded.assertOriginalValidity();now=expires;assert.throws(()=>guarded.assertOriginalValidity());now=expires-1;expireAtMain=true;await assert.rejects(guarded.refreshOriginalMetadata());assert.equal(zipReads,1);}finally{Date.now=clock;}
});
test('pending known canonical security returns NOT_READY without claiming zero findings or completed full CI', async () => {
  const { readCanonicalStagingSecurity } = await api();
  const pending = fixture((path, value) => path.includes('/jobs?') ? { total_count: 1, jobs: [{ ...job(), status: 'in_progress', conclusion: null, steps: [] }] } : value);
  assert.deepEqual(await readCanonicalStagingSecurity(expected, pending.reader), { status: 'NOT_READY', runId: 41, runAttempt: 2 });
  const notStarted = fixture((path, value) => path.startsWith('actions/workflows/') ? { total_count: 0, workflow_runs: [] } : value);
  assert.deepEqual(await readCanonicalStagingSecurity(expected, notStarted.reader), { status: 'NOT_READY' });
});
test('failed skipped missing security steps stale source cancelled run changed attempts and unknown metadata refuse', async () => {
  const { readCanonicalStagingSecurity } = await api();
  for (const mode of ['failed-job', 'skipped-step', 'missing-gate', 'wrong-source', 'cancelled-run', 'wrong-attempt', 'changed-attempt', 'changed-main', 'missing-job', 'bad-page']) {
    const f = fixture((path, value, count) => {
      if (path.includes('/jobs?')) {
        const row = job();
        if (mode === 'failed-job') row.conclusion = 'failure';
        if (mode === 'skipped-step') row.steps[6].conclusion = 'skipped';
        if (mode === 'missing-gate') row.steps.pop();
        if (mode === 'wrong-attempt') row.run_attempt++;
        if (mode === 'wrong-source') row.head_sha = 'b'.repeat(40);
        if (mode === 'missing-job') return { total_count: 1, jobs: [{ ...row, name: 'technical-mvp' }] };
        if (mode === 'bad-page') return { total_count: 2, jobs: [row] };
        return { total_count: 1, jobs: [row] };
      }
      if (path === 'actions/runs/41' && mode === 'cancelled-run') return { ...run, status: 'completed', conclusion: 'cancelled' };
      if (path === 'actions/runs/41' && mode === 'missing-job') return { ...run, status: 'completed', conclusion: 'success' };
      if (path === 'actions/runs/41' && mode === 'changed-attempt' && count > 1) return { ...run, run_attempt: 3 };
      if (path === 'git/ref/heads/main' && mode === 'changed-main' && count > 1) return { object: { type: 'commit', sha: 'b'.repeat(40) } };
      return value;
    });
    const admitted=await withReceipt(f);await assert.rejects(readCanonicalStagingSecurity(expected, admitted.reader,admitted.artifact), mode);
  }
});
test('staging security runner context is exact main secret-free Actions source and provider errors are redacted', async () => {
  const { readStagingSecurityContext, readCanonicalStagingSecurity } = await api();
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_JOB: 'codeql', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: expected.sha, GITHUB_WORKFLOW_SHA: expected.sha, GITHUB_REPOSITORY: expected.repository, GITHUB_WORKFLOW_REF: `${expected.repository}/.github/workflows/staging-verification.yml@refs/heads/main`, GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com', GITHUB_EVENT_NAME: 'push', GH_TOKEN: 'fixture-token' };
  assert.deepEqual(readStagingSecurityContext(env, expected.sha), { ...expected, token: 'fixture-token' });
  assert.deepEqual(readStagingSecurityContext({ ...env, GITHUB_JOB: 'codeql-evidence', GITHUB_WORKFLOW_REF: `${expected.repository}/.github/workflows/full-regression.yml@refs/heads/main`, GITHUB_EVENT_NAME: 'schedule',GITHUB_RUN_ID:'91',GITHUB_RUN_ATTEMPT:'1' }, expected.sha), { ...expected, token: 'fixture-token',fullRun:{runId:91,runAttempt:1} });
  for (const change of [{ GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_JOB: 'other' }, { GITHUB_API_URL: 'https://other.invalid' }, { GITHUB_REF: 'refs/heads/other' }, { GH_TOKEN: 'bad\nsecret' }]) assert.throws(() => readStagingSecurityContext({ ...env, ...change }, expected.sha));
  await assert.rejects(readCanonicalStagingSecurity(expected, async () => { throw Error('private provider credential'); }), error => error instanceof Error && !error.message.includes('private provider credential'));
});
