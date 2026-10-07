import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { canonicalReleaseReviewJson } from './release-review';
const { yazl }=createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {yazl:{ZipFile:new()=>{outputStream:Readable;addBuffer(bytes:Buffer,name:string):void;end():void}}};
async function receiptZip(value:unknown){const zip=new yazl.ZipFile(),chunks:Buffer[]=[];const done=new Promise<Buffer>((resolve,reject)=>{zip.outputStream.on('data',chunk=>chunks.push(chunk));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});zip.addBuffer(Buffer.from(canonicalReleaseReviewJson(value)),'receipt.json');zip.end();return done;}
const receipt=()=>({version:1,purpose:'ORIGINAL_PROCESSED_CODEQL_RECEIPT',policy:'CODEQL_MEDIUM_HIGH_CRITICAL_V1',repository:expected.repository,sourceSha:expected.sha,ref:'refs/heads/main',runId:'41',runAttempt:2,observedAt:'2026-10-07T00:01:00Z',analysis:{id:20,sarifId:'01234567-89ab-cdef-0123-456789abcdef',key:'.github/workflows/ci.yml:codeql',toolVersion:'2.27.1',createdAt:'2026-10-07T00:00:30Z'},result:{check:'codeql-open-security-alerts',status:'VERIFIED',analysisResults:0,analysisRules:87,openAlerts:0,blockingAlerts:0,severities:{low:0,medium:0,high:0,critical:0,nonsecurity:0},snapshotPasses:2}});
const expected = { sha: 'a'.repeat(40), repository: 'owner/repo' };
const run = { id: 41, run_attempt: 2, head_sha: expected.sha, head_branch: 'main', event: 'push', status: 'in_progress', conclusion: null, path: '.github/workflows/ci.yml', repository: { full_name: expected.repository } };
const requiredSteps = ['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund', 'Run npm ci --ignore-scripts --no-audit --no-fund', 'Run node node_modules/esbuild/install.js', 'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2', 'Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2', 'Require current processed CodeQL security findings to be clear','Retain original processed CodeQL receipt'];
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
