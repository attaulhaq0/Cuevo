import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson } from './release-review';
import { readSingleJsonArchive } from './single-json-archive';
import { validateCodeqlReceipt } from './codeql-alerts';
import { createRequire } from 'node:module';
import { ciCodeqlJobBeforeUpgrade,deriveCodeqlJobStepContract } from './verification-workflows';
import { captureCanonicalSourceContext } from './git-source-digest';

const unavailable = () => new Error('Canonical staging security evidence is unavailable or requires review; contents withheld.');
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER), sha = z.string().regex(/^[a-f0-9]{40}$/);
const repository = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => ['.', '..'].includes(part)));
const expectedSchema = z.object({ sha, repository }).strict();
const runSchema = z.object({ id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), event: z.enum(['push','workflow_dispatch']), path: z.literal('.github/workflows/ci.yml'), status: z.enum(['queued', 'in_progress', 'completed']), conclusion: z.string().nullable(), repository: z.object({ full_name: repository }) });
const stepSchema = z.object({ name: z.string().min(1).max(200), number: positive, status: z.string(), conclusion: z.string().nullable() });
const jobSchema = z.object({ id: positive, name: z.string().min(1).max(200), run_id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), status: z.string(), conclusion: z.string().nullable(), started_at: z.iso.datetime({offset:true}).nullable(), completed_at: z.iso.datetime({offset:true}).nullable(), steps: z.array(stepSchema).max(100).optional() });
const listQuery = (source: string, page: number, diagnostic:boolean) => `actions/workflows/ci.yml/runs?branch=main&${diagnostic?'':'event=push&'}head_sha=${source}&per_page=100&page=${page}`;
export type CanonicalStagingSecurity = { status: 'VERIFIED'; runId: number; runAttempt: number; jobId: number; jobsSha256: string; receiptSha256: string; analysisId: number; sarifId: string } | { status: 'NOT_READY'; runId?: number; runAttempt?: number };
type GithubReader = (path: string) => Promise<unknown>;
/** Fixed authenticated source reads confer no run/receipt/native authority. */
async function readSecuritySource(expected:z.infer<typeof expectedSchema>,github:GithubReader,purpose:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA'){
 const commitPath='git/commits/'+expected.sha,contentsPath='contents/.github/workflows/ci.yml?ref='+expected.sha;
 const read=async()=>{
  const commitRaw=JSON.parse(canonicalReleaseExecutionJson(await github(commitPath))) as unknown;
  const contentsRaw=JSON.parse(canonicalReleaseExecutionJson(await github(contentsPath))) as unknown;
  const commit=z.object({sha:z.literal(expected.sha),tree:z.object({sha}),verification:z.object({verified:z.literal(true),reason:z.literal('valid'),signature:z.string().min(1),payload:z.string().min(1)})}).parse(commitRaw);
  const contents=z.object({type:z.literal('file'),path:z.literal('.github/workflows/ci.yml'),sha,encoding:z.literal('base64'),size:positive.max(128*1024),content:z.string().max(192*1024)}).parse(contentsRaw);
  const encoded=contents.content.replace(/\r?\n/g,'');if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw unavailable();
  const bytes=Buffer.from(encoded,'base64');if(bytes.length!==contents.size||bytes.toString('base64')!==encoded||createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')!==contents.sha)throw unavailable();
  const text=new TextDecoder('utf8',{fatal:true}).decode(bytes),yaml=createRequire(import.meta.url)('js-yaml') as{load(text:string):unknown},job=z.object({jobs:z.object({codeql:z.unknown()})}).parse(yaml.load(text)).jobs.codeql;
  return{commit,bytes,job,raw:canonicalReleaseExecutionJson({commit:commitRaw,contents:contentsRaw})};
 };
 const original=await read();let context:ReturnType<typeof captureCanonicalSourceContext>|undefined;
 if(canonicalReleaseReviewJson(original.job)===canonicalReleaseReviewJson(ciCodeqlJobBeforeUpgrade)){
  if(purpose!=='ORIGINAL_RUNTIME_METADATA')throw unavailable();
  context=captureCanonicalSourceContext(resolve('.'),expected.sha,original.commit.tree.sha,purpose);
  if(!context.git(['show',expected.sha+':.github/workflows/ci.yml']).equals(original.bytes))throw unavailable();
 }
 const contract=deriveCodeqlJobStepContract(original.job,purpose,context?{sha:expected.sha,git:context.git}:undefined);
 let poisoned=false,refreshing=false;
 const assertOriginalValidity=()=>{try{if(poisoned)throw unavailable();context?.finalMetadata();}catch{poisoned=true;throw unavailable();}};
 const refreshOriginalMetadata=async()=>{if(poisoned||refreshing){poisoned=true;throw unavailable();}refreshing=true;try{if((await read()).raw!==original.raw)throw unavailable();assertOriginalValidity();}catch{poisoned=true;throw unavailable();}finally{refreshing=false;}};
 return{contract,assertOriginalValidity,refreshOriginalMetadata};
}
export type GuardedCanonicalStagingSecurity={proof:CanonicalStagingSecurity;refreshOriginalMetadata:()=>Promise<void>;assertOriginalValidity:()=>void};
export type GithubArtifactReader = (artifactId: number) => Promise<Uint8Array>;

const artifactSchema=z.object({id:positive,name:z.string().max(200),size_in_bytes:positive.max(2*1024*1024),expired:z.literal(false),digest:z.string().regex(/^sha256:[a-f0-9]{64}$/),
  created_at:z.iso.datetime({offset:true}),expires_at:z.iso.datetime({offset:true}),workflow_run:z.object({id:positive,head_sha:sha,head_branch:z.literal('main')})});
async function originalReceipt(expected:z.infer<typeof expectedSchema>,run:z.infer<typeof runSchema>,job:z.infer<typeof jobSchema>,github:GithubReader,artifact?:GithubArtifactReader){
  if(!artifact||!job.started_at||!job.completed_at)throw unavailable();
  const path=`actions/runs/${run.id}/artifacts?per_page=100`,read=async()=>{
    const rows=z.object({total_count:z.number().int().nonnegative().max(100),artifacts:z.array(z.object({id:positive,name:z.string().max(200)}).passthrough()).max(100)}).parse(JSON.parse(canonicalReleaseExecutionJson(await github(path))));
    if(rows.artifacts.length!==rows.total_count||new Set(rows.artifacts.map(row=>row.id)).size!==rows.artifacts.length)throw unavailable();
    const matching=rows.artifacts.filter(row=>row.name===`cuevo-codeql-${run.id}-${run.run_attempt}`);if(matching.length!==1)throw unavailable();const selected=artifactSchema.parse(matching[0]);
    if(selected.workflow_run.id!==run.id||selected.workflow_run.head_sha!==expected.sha||Date.parse(selected.expires_at)<=Date.now()
      ||Date.parse(selected.created_at)<Date.parse(job.started_at!)||Date.parse(selected.created_at)>Date.parse(job.completed_at!))throw unavailable();return selected;
  };
  const original=await read(),bytes=await artifact(original.id);if(bytes.byteLength!==original.size_in_bytes)throw unavailable();
  const receipt=await readSingleJsonArchive(bytes,{archiveSha256:original.digest.slice(7),fileName:'receipt.json',maximumJsonBytes:16*1024});
  const proof=validateCodeqlReceipt(receipt.value,{repository:expected.repository,sourceSha:expected.sha,ref:'refs/heads/main',runId:String(run.id),runAttempt:run.run_attempt,startedAt:job.started_at,completedAt:job.completed_at,now:Date.now()});
  const expiresAtMs=Date.parse(original.expires_at),assertOriginalValidity=()=>{if(!Number.isSafeInteger(expiresAtMs)||Date.now()>=expiresAtMs)throw unavailable();},refreshOriginalMetadata=async()=>{if(canonicalReleaseReviewJson(await read())!==canonicalReleaseReviewJson(original))throw unavailable();assertOriginalValidity();};await refreshOriginalMetadata();return{proof:{receiptSha256:receipt.jsonSha256,analysisId:proof.analysis.id,sarifId:proof.analysis.sarifId},refreshOriginalMetadata,assertOriginalValidity};
}

/** Read only the canonical security job. Overall CI may remain running or fail unrelated acceptance checks. */
async function readOriginalSecurity(value: unknown, github: GithubReader, artifact: GithubArtifactReader|undefined, admitSource: (expected:z.infer<typeof expectedSchema>)=>Promise<void>,diagnostic=false,purpose:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA'='CURRENT_SOURCE'): Promise<GuardedCanonicalStagingSecurity> {
  try {
    const expected = expectedSchema.parse(JSON.parse(canonicalReleaseReviewJson(value)));
    await admitSource(expected);
    const runs: z.infer<typeof runSchema>[] = [], runIds = new Set<number>(); let total: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const response = z.object({ total_count: z.number().int().nonnegative().max(1000), workflow_runs: z.array(runSchema).max(100) }).parse(JSON.parse(canonicalReleaseExecutionJson(await github(listQuery(expected.sha, page,diagnostic)))));
      if (total !== undefined && total !== response.total_count) throw unavailable(); total = response.total_count;
      for (const row of response.workflow_runs) { if (runIds.has(row.id) || row.head_sha !== expected.sha || row.repository.full_name !== expected.repository||!diagnostic&&row.event!=='push') throw unavailable(); runIds.add(row.id); runs.push(row); }
      if (runs.length > total) throw unavailable(); if (runs.length === total) break;
      if (response.workflow_runs.length !== 100 || page === 10) throw unavailable();
    }
    if (runs.length !== total) throw unavailable(); if (!runs.length) return {proof:{status:'NOT_READY'},refreshOriginalMetadata:async()=>{throw unavailable();},assertOriginalValidity:()=>{throw unavailable();}};
    const selected = [...runs].sort((a, b) => b.id - a.id)[0], runPath = `actions/runs/${selected.id}`;
    const currentRun = async () => {
      const row = runSchema.parse(JSON.parse(canonicalReleaseReviewJson(await github(runPath))));
      if (row.id !== selected.id || row.run_attempt !== selected.run_attempt || row.head_sha !== expected.sha || row.repository.full_name !== expected.repository||row.event!==selected.event
        || row.status === 'completed' && !['success', 'failure'].includes(row.conclusion ?? '') || row.status !== 'completed' && row.conclusion !== null) throw unavailable();
      return row;
    };
    const initial = await currentRun();
    const readJobs=async()=>{
      const rows: z.infer<typeof jobSchema>[] = [], ids = new Set<number>(); let jobsTotal: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const response = z.object({ total_count: z.number().int().nonnegative().max(1000), jobs: z.array(jobSchema).max(100) }).parse(JSON.parse(canonicalReleaseExecutionJson(await github(`${runPath}/attempts/${selected.run_attempt}/jobs?per_page=100&page=${page}`))));
      if (jobsTotal !== undefined && jobsTotal !== response.total_count) throw unavailable(); jobsTotal = response.total_count;
      for (const row of response.jobs) { if (ids.has(row.id) || row.run_id !== selected.id || row.run_attempt !== selected.run_attempt || row.head_sha !== expected.sha) throw unavailable(); ids.add(row.id); rows.push(row); }
      if (rows.length > jobsTotal) throw unavailable(); if (rows.length === jobsTotal) break;
      if (response.jobs.length !== 100 || page === 10) throw unavailable();
    }
    if (rows.length !== jobsTotal) throw unavailable();
      return rows;
    };const rows=await readJobs();
    const codeql = rows.filter(row => row.name === 'codeql');
    if (codeql.length === 0 && ['queued', 'in_progress'].includes(initial.status)) return{proof:{status:'NOT_READY',runId:selected.id,runAttempt:selected.run_attempt},refreshOriginalMetadata:async()=>{throw unavailable();},assertOriginalValidity:()=>{throw unavailable();}};
    if (codeql.length !== 1) throw unavailable(); const exact = codeql[0];
    if (['queued', 'in_progress'].includes(exact.status) && exact.conclusion === null) return{proof:{status:'NOT_READY',runId:selected.id,runAttempt:selected.run_attempt},refreshOriginalMetadata:async()=>{throw unavailable();},assertOriginalValidity:()=>{throw unavailable();}};
    if (exact.status !== 'completed' || exact.conclusion !== 'success' || !exact.steps||!exact.started_at||!exact.completed_at) throw unavailable();
    const source=await readSecuritySource(expected,github,purpose),{requiredSteps,allowedPostSteps}=source.contract;
    const names = new Set<string>(), numbers = new Set<number>(), authored: string[] = [];
    for (const [index, step] of exact.steps.entries()) {
      if (names.has(step.name) || numbers.has(step.number) || index > 0 && step.number <= exact.steps[index - 1].number) throw unavailable(); names.add(step.name); numbers.add(step.number);
      if (requiredSteps.includes(step.name)) { if (step.status !== 'completed' || step.conclusion !== 'success') throw unavailable(); authored.push(step.name); }
      else if (step.name === 'Set up job' || step.name === 'Complete job') { if (step.status !== 'completed' || step.conclusion !== 'success') throw unavailable(); }
      else if (!allowedPostSteps.includes(step.name)
        || step.status !== 'completed' || !['success', 'skipped'].includes(step.conclusion ?? '')) throw unavailable();
    }
    if (canonicalReleaseReviewJson(authored) !== canonicalReleaseReviewJson(requiredSteps)) throw unavailable();
    const receipt=await originalReceipt(expected,selected,exact,github,artifact),proof=receipt.proof;
    const assertOriginalValidity=()=>{source.assertOriginalValidity();receipt.assertOriginalValidity();};
    const refreshOriginalMetadata=async()=>{try{await currentRun();const current=(await readJobs()).filter(row=>row.name==='codeql');if(current.length!==1||canonicalReleaseExecutionJson(current[0])!==canonicalReleaseExecutionJson(exact))throw unavailable();await source.refreshOriginalMetadata();await receipt.refreshOriginalMetadata();await admitSource(expected);assertOriginalValidity();}catch{throw unavailable();}};
    await refreshOriginalMetadata();
    const jobsSha256 = createHash('sha256').update(canonicalReleaseReviewJson({ repository: expected.repository, sha: expected.sha, runId: selected.id, runAttempt: selected.run_attempt, jobId: exact.id, steps: exact.steps,...proof })).digest('hex');
    return {proof:{status:'VERIFIED',runId:selected.id,runAttempt:selected.run_attempt,jobId:exact.id,jobsSha256,...proof},refreshOriginalMetadata,assertOriginalValidity};
  } catch { throw unavailable(); }
}

/** Release/focused admission keeps current main; an immutable receipt cannot relax source freshness. */
export function readCanonicalStagingSecurityAndGuard(value:unknown,github:GithubReader,artifact?:GithubArtifactReader){
  return readOriginalSecurity(value,github,artifact,async expected=>{const main=z.object({object:z.object({type:z.literal('commit'),sha})}).parse(await github('git/ref/heads/main'));if(main.object.sha!==expected.sha)throw unavailable();});
}
/** An original completed canonical run retains its own processed security job.
 * This is historical evidence only; it grants no current source admission. */
export function readOriginalCanonicalStagingSecurityAndGuard(value:unknown,github:GithubReader,artifact?:GithubArtifactReader){
 const selected=runSchema.parse(JSON.parse(canonicalReleaseReviewJson(value)));if(selected.status!=='completed'||!['success','failure'].includes(selected.conclusion??'')||selected.event!=='push')throw unavailable();
 const admit=async()=>{const current=runSchema.parse(JSON.parse(canonicalReleaseReviewJson(await github('actions/runs/'+selected.id))));if(canonicalReleaseReviewJson(current)!==canonicalReleaseReviewJson(selected))throw unavailable();};
 const originalReader:GithubReader=path=>path.startsWith('actions/workflows/ci.yml/runs?')?Promise.resolve({total_count:1,workflow_runs:[selected]}):github(path);
 return readOriginalSecurity({sha:selected.head_sha,repository:selected.repository.full_name},originalReader,artifact,admit,false,'ORIGINAL_RUNTIME_METADATA');
}

/** Existing callers retain exactly the original public proof shape. */
export async function readCanonicalStagingSecurity(value:unknown,github:GithubReader,artifact?:GithubArtifactReader){return(await readCanonicalStagingSecurityAndGuard(value,github,artifact)).proof;}
/** Diagnostic authority comes from the original official full run, never an operator skip/current-main flag. */
export async function readFullRegressionSecurity(value:unknown,github:GithubReader,artifact?:GithubArtifactReader){
  const input=expectedSchema.extend({runId:positive,runAttempt:positive}).strict().parse(JSON.parse(canonicalReleaseReviewJson(value)));
  let original:string|undefined;
  const admit=async()=>{
    const run=z.object({id:z.literal(input.runId),run_attempt:z.literal(input.runAttempt),head_sha:z.literal(input.sha),head_branch:z.literal('main'),event:z.enum(['schedule','workflow_dispatch']),path:z.literal('.github/workflows/full-regression.yml'),status:z.enum(['queued','in_progress','waiting','completed']),conclusion:z.string().nullable(),repository:z.object({full_name:z.literal(input.repository)})}).parse(JSON.parse(canonicalReleaseReviewJson(await github(`actions/runs/${input.runId}`))));
    if(run.status==='completed'?!['success','failure'].includes(run.conclusion??''):run.conclusion!==null)throw unavailable();
    const normalized=canonicalReleaseReviewJson({id:run.id,run_attempt:run.run_attempt,head_sha:run.head_sha,event:run.event,path:run.path,repository:run.repository});if(original&&original!==normalized)throw unavailable();original=normalized;
  };
  return(await readOriginalSecurity({sha:input.sha,repository:input.repository},github,artifact,admit,true,'ORIGINAL_RUNTIME_METADATA')).proof;
}

export function readStagingSecurityContext(env: Record<string, string | undefined>, checkoutSha: string) {
  const expected = expectedSchema.parse({ sha: env.GITHUB_SHA, repository: env.GITHUB_REPOSITORY });
  const staging = env.GITHUB_JOB === 'codeql' && env.GITHUB_WORKFLOW_REF === `${expected.repository}/.github/workflows/staging-verification.yml@refs/heads/main` && ['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '');
  const full = env.GITHUB_JOB === 'codeql-evidence' && env.GITHUB_WORKFLOW_REF === `${expected.repository}/.github/workflows/full-regression.yml@refs/heads/main` && ['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '');
  if (checkoutSha !== expected.sha || env.GITHUB_WORKFLOW_SHA !== expected.sha || env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || (!staging && !full)
    || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SERVER_URL !== 'https://github.com' || env.GITHUB_API_URL !== 'https://api.github.com'
    || !env.GH_TOKEN || env.GH_TOKEN.length > 24576 || /[^\x21-\x7e]/.test(env.GH_TOKEN)) throw unavailable();
  const fullRun=full?z.object({runId:positive,runAttempt:positive}).parse({runId:Number(env.GITHUB_RUN_ID),runAttempt:Number(env.GITHUB_RUN_ATTEMPT)}):undefined;
  return { ...expected, token: env.GH_TOKEN,...(fullRun?{fullRun}:{}) };
}

/** Small security/result ZIPs retain their original transport bound. */
export function createGithubCodeqlArtifactReader(repositoryName:string,token:string,parentSignal?:AbortSignal):GithubArtifactReader{
  return boundedGithubArtifactReader(repositoryName,token,2*1024*1024,parentSignal);
}
/** Original recovery packages have a separate fixed bound; archive and original evidence validation remain with their owner. */
export function createGithubOriginalRecoveryPackageArtifactReader(repositoryName:string,token:string,parentSignal?:AbortSignal):GithubArtifactReader{
  return boundedGithubArtifactReader(repositoryName,token,16*1024*1024,parentSignal);
}
/** Official bounded ZIP fetch; the reusable token is never forwarded to the signed artifact host. */
function boundedGithubArtifactReader(repositoryName:string,token:string,maximumBytes:number,parentSignal?:AbortSignal):GithubArtifactReader{
  repository.parse(repositoryName);z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/).parse(token);
  return async artifactId=>{
    positive.parse(artifactId);const signal=AbortSignal.any([...(parentSignal?[parentSignal]:[]),AbortSignal.timeout(20000)]);
    const url=`https://api.github.com/repos/${repositoryName}/actions/artifacts/${artifactId}/zip`;
    let response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',credentials:'omit',cache:'no-store',signal});
    if(response.url&&response.url!==url)throw unavailable();
    if(response.status===302){const target=new URL(response.headers.get('location')??'');void response.body?.cancel().catch(()=>undefined);if(target.protocol!=='https:'||target.username||target.password||target.port||target.hash||!(/^productionresultssa[a-z0-9]+\.blob\.core\.windows\.net$/.test(target.hostname)||/^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(target.hostname)))throw unavailable();response=await fetch(target,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal});}
    if(response.status!==200||response.redirected||!response.body)throw unavailable();const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximumBytes))throw unavailable();
    const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
    try{for(;;){const chunk=await new Promise<ReadableStreamReadResult<Uint8Array>>((done,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(unavailable());};if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});void reader.read().then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(unavailable());else done(value);},()=>{signal.removeEventListener('abort',abort);reject(unavailable());});});if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maximumBytes)throw unavailable();parts.push(chunk.value);}return Buffer.concat(parts);}
    finally{void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* Active cancellation owns cleanup. */}}
  };
}
async function boundedJson(response: Response, signal: AbortSignal) {
  if (response.status !== 200 || response.redirected || !response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw unavailable();
  const size = response.headers.get('content-length'); if (size !== null && (!/^\d+$/.test(size) || Number(size) > 1024 * 1024)) throw unavailable();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try { for (;;) {
    const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(unavailable()); };
      if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true });
      void reader.read().then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(unavailable()); else done(value); }, () => { signal.removeEventListener('abort', abort); reject(unavailable()); });
    });
    if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 1024 * 1024) throw unavailable(); chunks.push(chunk.value);
  } return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown; }
  finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Active cancellation owns cleanup. */ } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const gitEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
    const git = (args: string[]) => execFileSync('git', args, { env: gitEnv, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString().trim();
    const checkout = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    const context = readStagingSecurityContext(process.env, checkout), { token,fullRun,...expected } = context;
    git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', 'HEAD', '--']);
    if (git(['ls-files', '--others', '--exclude-standard'])) throw unavailable();
    const started = Date.now(); let original: { runId: number; runAttempt: number } | undefined;
    const github: GithubReader = async path => {
      const remaining = 600000 - (Date.now() - started); if (remaining <= 0) throw unavailable();
      const signal = AbortSignal.timeout(Math.min(15000, remaining)), url = `https://api.github.com/repos/${context.repository}/${path}`;
      const response = await fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal });
      if (response.url && response.url !== url) throw unavailable(); return boundedJson(response, signal);
    };
    for (;;) {
      const artifact=createGithubCodeqlArtifactReader(context.repository,token);
      const result = fullRun?await readFullRegressionSecurity({...expected,...fullRun},github,artifact):await readCanonicalStagingSecurity(expected, github,artifact);
      if (result.runId !== undefined && result.runAttempt !== undefined) {
        if (original && (original.runId !== result.runId || original.runAttempt !== result.runAttempt)) throw unavailable();
        original = { runId: result.runId, runAttempt: result.runAttempt };
      } else if (original) throw unavailable();
      if (result.status === 'VERIFIED') {
        console.log(JSON.stringify({ check: 'canonical-staging-codeql', ...result })); break;
      }
      if (Date.now() - started >= 600000) throw unavailable();
      console.log(JSON.stringify({ check: 'canonical-staging-codeql', status: 'NOT_READY' }));
      await new Promise<void>(done => setTimeout(done, Math.min(15000, 600000 - (Date.now() - started))));
    }
  } catch { console.log(JSON.stringify({ check: 'canonical-staging-codeql', status: 'UNAVAILABLE' })); process.exitCode = 1; }
}
