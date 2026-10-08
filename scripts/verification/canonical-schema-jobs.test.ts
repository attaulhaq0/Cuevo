import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import type {Readable} from 'node:stream';
import {ciSourceJobs,ciDatabaseJob} from './verification-workflows';
import {canonicalReleaseExecutionJson} from './release-review';
import {criticalBrowserFiles} from './verification-profiles';
import {runtimeLaneEvidence,runtimeLaneSteps} from './runtime-lanes';

const source='a'.repeat(40),tree='b'.repeat(40),repository='owner/repo';
const run={id:31,run_attempt:2,head_sha:source,head_branch:'main',event:'push',path:'.github/workflows/ci.yml',status:'in_progress',conclusion:null,repository:{full_name:repository}};
const setup=['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1','Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020','Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund','Run npm ci --ignore-scripts --no-audit --no-fund','Run node node_modules/esbuild/install.js'];
const names=(steps:readonly ({name?:string;uses?:string;run?:string})[])=>steps.map(step=>step.name??'Run '+(step.uses??step.run));
function jobs(){return Object.entries({...Object.fromEntries(Object.entries(ciSourceJobs).map(([name,value])=>[name,names(value.steps)])), 'database-checks':names(ciDatabaseJob.steps),'secret-scan':[...setup,'Verify pinned scanner and scan full history plus authored worktree','Scan full history plus authored worktree'],codeql:[...setup,'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2','Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2','Require current processed CodeQL security findings to be clear','Retain original processed CodeQL receipt']}).map(([name,names],index)=>({id:index+1,name,run_id:31,run_attempt:2,head_sha:source,head_branch:'main',status:'completed',conclusion:'success',started_at:'2026-10-08T00:00:00Z',completed_at:'2026-10-08T00:02:00Z',steps:names.map((name,number)=>({name,number:number+1,status:'completed',conclusion:'success'}))}));}
const {yazl}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {yazl:{ZipFile:new()=>{outputStream:Readable;addBuffer(bytes:Buffer,name:string):void;end():void}}};
async function archive(value:unknown,name:string,canonical=true){const zip=new yazl.ZipFile(),parts:Buffer[]=[],done=new Promise<Buffer>((resolve,reject)=>{zip.outputStream.on('data',part=>parts.push(part));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(parts)));});zip.addBuffer(Buffer.from(canonical?canonicalReleaseExecutionJson(value):JSON.stringify(value)),name);zip.end();return done;}
async function fixture(){
 const receipt={version:1,purpose:'ORIGINAL_PROCESSED_CODEQL_RECEIPT',policy:'CODEQL_MEDIUM_HIGH_CRITICAL_V1',repository,sourceSha:source,ref:'refs/heads/main',runId:'31',runAttempt:2,observedAt:'2026-10-08T00:01:00Z',analysis:{id:20,sarifId:'01234567-89ab-cdef-0123-456789abcdef',key:'.github/workflows/ci.yml:codeql',toolVersion:'2.27.1',createdAt:'2026-10-08T00:00:30Z'},result:{check:'codeql-open-security-alerts',status:'VERIFIED',analysisResults:0,analysisRules:87,openAlerts:0,blockingAlerts:0,severities:{low:0,medium:0,high:0,critical:0,nonsecurity:0},snapshotPasses:2}};
 const lane=runtimeLaneEvidence({repository,sourceSha:source,treeSha:tree,sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'main-staging',browserFiles:[...criticalBrowserFiles],lane:'database',rows:[...runtimeLaneSteps('main-staging','database').map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]});
 const security=await archive(receipt,'receipt.json'),database=await archive(lane,'lane.json');
 const metadata=(id:number,name:string,bytes:Buffer)=>({id,name,size_in_bytes:bytes.length,expired:false,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),created_at:'2026-10-08T00:01:10Z',expires_at:'2026-10-21T00:00:00Z',workflow_run:{id:31,head_sha:source,head_branch:'main'}});
 return{lane,security,database,artifacts:[metadata(71,'cuevo-codeql-31-2',security),metadata(72,'cuevo-runtime-database-31-2',database)]};
}
async function subject(){return import('./canonical-schema-jobs');}
function reader(rows:ReturnType<typeof jobs>,proof:Awaited<ReturnType<typeof fixture>>,mutate?:(path:string,number:number,value:unknown)=>unknown){const calls=new Map<string,number>();return async(path:string)=>{const count=(calls.get(path)??0)+1;calls.set(path,count);const value=path==='git/ref/heads/main'?{object:{type:'commit',sha:source}}:path==='git/commits/'+source?{sha:source,tree:{sha:tree}}:path==='actions/runs/31'?run:path.startsWith('actions/workflows/ci.yml/runs?')?{total_count:1,workflow_runs:[run]}:path==='actions/runs/31/artifacts?per_page=100'?{total_count:proof.artifacts.length,artifacts:proof.artifacts}:path==='actions/runs/31/attempts/2/jobs?per_page=100&page=1'?{total_count:rows.length,jobs:rows}:undefined;if(value===undefined)throw Error('Unexpected scoped metadata path');return structuredClone(mutate?mutate(path,count,value):value);};}
const bytes=(proof:Awaited<ReturnType<typeof fixture>>)=>async(id:number)=>id===71?proof.security:proof.database;

test('canonical source and database proof admits original archives while unrelated runtime may still run or fail',async()=>{
 const api=await subject(),proof=await fixture(),rows=jobs(),result=await api.readCanonicalSchemaJobs(run,reader(rows,proof),bytes(proof));assert.equal(result.runAttempt,2);assert.match(result.jobsSha256,/^[a-f0-9]{64}$/);
 const withRuntime=[...rows,{...rows[0],id:99,name:'runtime-backend',status:'in_progress',conclusion:null}] as ReturnType<typeof jobs>;
 assert.deepEqual(await api.readCanonicalSchemaJobs(run,reader(withRuntime,proof),bytes(proof)),result);
 assert.deepEqual(await api.readCanonicalSchemaJobs({...run,status:'completed',conclusion:'failure'},reader(withRuntime,proof,(path,_count,value)=>path==='actions/runs/31'?{...run,status:'completed',conclusion:'failure'}:value),bytes(proof)),result);
});

test('canonical database proof requires its original exact same source run attempt lane archive',async()=>{
 const api=await subject();for(const change of ['missing','attempt','source','tree','row','failed','private','noncanonical','filename','expiry','window','metadata-source','metadata-drift','tree-drift']){
  const proof=await fixture(),lane=structuredClone(proof.lane) as Record<string,unknown>;
  if(change==='missing')proof.artifacts.pop();if(change==='attempt')lane.runAttempt=1;if(change==='source')lane.sourceSha='d'.repeat(40);if(change==='tree')lane.treeSha='d'.repeat(40);if(change==='row')(lane.rows as unknown[]).pop();if(change==='failed')(lane.rows as {exitCode:number}[])[0].exitCode=1;if(change==='private')lane.privateConsole='secret';
  proof.database=await archive(lane,change==='filename'?'other.json':'lane.json',change!=='noncanonical');const meta=proof.artifacts.find(row=>row.id===72);if(meta){meta.size_in_bytes=proof.database.length;meta.digest='sha256:'+createHash('sha256').update(proof.database).digest('hex');if(change==='expiry')meta.expires_at='2026-10-07T00:00:00Z';if(change==='window')meta.created_at='2026-10-08T00:03:00Z';if(change==='metadata-source')meta.workflow_run.head_sha='d'.repeat(40);}
  const read=reader(jobs(),proof,(path,count,value)=>change==='metadata-drift'&&path.includes('/artifacts?')&&count>1?{total_count:proof.artifacts.length,artifacts:proof.artifacts.map(row=>row.id===72?{...row,id:73}:row)}:change==='tree-drift'&&path==='git/commits/'+source&&count>1?{sha:source,tree:{sha:'d'.repeat(40)}}:value);
  await assert.rejects(api.readCanonicalSchemaJobs(run,read,bytes(proof)),change);
 }
});

test('pending canonical producers have explicit not ready metadata without downloading artifacts or borrowing failed work',async()=>{
 const api=await subject(),proof=await fixture(),rows=jobs();Object.assign(rows.find(row=>row.name==='database-checks')!,{status:'in_progress',conclusion:null});let downloads=0;const result=await api.observeCanonicalSchemaJobs(run,reader(rows,proof),async()=>{downloads++;return proof.database;});assert.equal(result.status,'NOT_READY');if(result.status==='NOT_READY')assert.deepEqual(result.pendingJobs,['database-checks']);assert.equal(downloads,0);
 rows.find(row=>row.name==='database-checks')!.status='completed';rows.find(row=>row.name==='database-checks')!.conclusion='failure';await assert.rejects(api.observeCanonicalSchemaJobs(run,reader(rows,proof),bytes(proof)));
});

test('scoped canonical proof refuses missing failed skipped changed or hidden mandatory source and database evidence',async()=>{
 const api=await subject();for(const mode of ['missing','failed','skipped','attempt','source','step','duplicate','private-step','security','cancelled','wrong-main','run-drift','job-drift','extra-job','page-count','page-empty']){
  const proof=await fixture(),rows=jobs(),database=rows.find(row=>row.name==='database-checks')!;
  if(mode==='missing')rows.splice(rows.indexOf(database),1);if(mode==='failed')database.conclusion='failure';if(mode==='skipped')database.steps[5].conclusion='skipped';if(mode==='attempt')database.run_attempt=1;if(mode==='source')database.head_sha='b'.repeat(40);if(mode==='step')database.steps[5].name='Run echo bypass';if(mode==='duplicate')rows.push({...database,id:99});if(mode==='private-step')database.steps.push({name:'Leak private context',number:99,status:'completed',conclusion:'success'});if(mode==='security')rows.find(row=>row.name==='codeql')!.conclusion='failure';if(mode==='extra-job')rows.push({...rows[0],id:99,name:'untrusted-job'});
  const read=reader(rows,proof,(path,count,value)=>mode==='wrong-main'&&path==='git/ref/heads/main'?{object:{type:'commit',sha:'b'.repeat(40)}}:mode==='run-drift'&&path==='actions/runs/31'&&count>1?{...run,run_attempt:3}:mode==='job-drift'&&path.includes('/jobs?')&&count>1?{total_count:rows.length,jobs:rows.map(row=>row.name==='database-checks'?{...row,conclusion:'failure'}:row)}:mode==='page-count'&&path.includes('/jobs?')?{total_count:rows.length+1,jobs:rows}:mode==='page-empty'&&path.includes('/jobs?')?{total_count:rows.length,jobs:[]}:value);
  await assert.rejects(api.readCanonicalSchemaJobs(mode==='cancelled'?{...run,status:'completed',conclusion:'cancelled'}:run,read,bytes(proof)),mode);
 }
});

test('settled original proof stays stable across unrelated completion but never exposes raw transport errors',async()=>{
 const api=await subject(),proof=await fixture();assert.equal((await api.readCanonicalSchemaJobs(run,reader(jobs(),proof,(path,count,value)=>path==='actions/runs/31'&&count>1?{...run,status:'completed',conclusion:'failure'}:value),bytes(proof))).runAttempt,2);
 await assert.rejects(api.readCanonicalSchemaJobs(run,reader(jobs(),proof),async()=>Buffer.from('{}')));await assert.rejects(api.readCanonicalSchemaJobs(run,async()=>{throw Error('PRIVATE credential');},bytes(proof)),error=>!String(error).includes('PRIVATE credential'));
});
