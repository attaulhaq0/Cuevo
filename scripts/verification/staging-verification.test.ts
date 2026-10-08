import assert from 'node:assert/strict';
import { readFile,mkdtemp,writeFile,rm } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve,join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { validateCiRun } from './cicd-contracts';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown; dump(value: unknown): string };
const expected = { sha: 'a'.repeat(40), repository: 'owner/repo', ciRunId: '31' };
const legacy = { id: 31, head_sha: expected.sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: expected.repository } };
const focused = { ...legacy, event: 'workflow_dispatch', path: '.github/workflows/staging-verification.yml', run_attempt: 2 };
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'staging-verification.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.validateBackendVerificationRun, 'function', 'focused backend verification admission exists');
  return subject as typeof import('./staging-verification');
}

test('backend verification preserves canonical CI and admits only exact main focused successful run attempts', async () => {
  const { validateBackendVerificationRun, backendVerificationRunSchema } = await api();
  assert.deepEqual(validateBackendVerificationRun({ ...legacy, run_attempt: 7, extra: 'provider metadata' }, expected), legacy);
  assert.deepEqual(validateBackendVerificationRun({ ...focused, repository: { ...focused.repository, id: 77, owner: { login: 'owner' } }, run_number: 8 }, expected), focused);
  assert.deepEqual(validateBackendVerificationRun(focused, expected), focused);
  assert.deepEqual(validateBackendVerificationRun({ ...focused, event: 'push' }, expected), { ...focused, event: 'push' });
  assert.deepEqual(backendVerificationRunSchema.parse(focused), focused);
  assert.throws(() => backendVerificationRunSchema.parse({ ...legacy, run_attempt: 1 }));
  assert.throws(() => validateCiRun(focused, expected), 'the production validator cannot admit focused staging verification');
});

test('wrong source repository run branch event status path and unknown attempt cannot become staging evidence', async () => {
  const { validateBackendVerificationRun } = await api();
  for (const fields of [{ head_sha: 'b'.repeat(40) }, { repository: { full_name: 'fork/repo' } }, { id: 32 }, { head_branch: 'feature' }, { event: 'pull_request' }, { event: 'pull_request_target' }, { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'skipped' }, { path: '.github/workflows/other.yml' }, { run_attempt: 0 }, { run_attempt: 0.5 }, { run_attempt: undefined }]) {
    assert.throws(() => validateBackendVerificationRun({ ...focused, ...fields }, expected));
  }
  assert.throws(() => validateBackendVerificationRun({ ...legacy, event: 'workflow_dispatch' }, expected));
  let reads = 0;
  assert.throws(() => validateBackendVerificationRun({ ...focused, get path() { reads++; return focused.path; } }, expected));
  assert.equal(reads, 0);
});

test('canonical schema run normalization retains exact attempt without borrowing unrelated runtime completion',async()=>{
 const subject=await api() as unknown as {validateCanonicalSchemaRun:(value:unknown,context:typeof expected)=>Record<string,unknown>};assert.equal(typeof subject.validateCanonicalSchemaRun,'function');for(const fields of [{status:'in_progress',conclusion:null},{status:'completed',conclusion:'failure'},{status:'completed',conclusion:'success'}]){const value={...legacy,run_attempt:2,...fields};assert.deepEqual(subject.validateCanonicalSchemaRun(value,expected),value);}for(const fields of [{run_attempt:undefined},{head_sha:'b'.repeat(40)},{status:'completed',conclusion:'cancelled'},{event:'pull_request'},{path:focused.path}])assert.throws(()=>subject.validateCanonicalSchemaRun({...legacy,run_attempt:2,...fields},expected));
});

test('focused verification is manual-only and never repeats every canonical main push automatically',async()=>{const {validateStagingVerificationWorkflow}=await api(),text=await readFile('.github/workflows/staging-verification.yml','utf8'),workflow=yaml.load(text) as {on:Record<string,unknown>};assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);assert.deepEqual(validateStagingVerificationWorkflow(text),[]);workflow.on.push={branches:['main']};assert.ok(validateStagingVerificationWorkflow(yaml.dump(workflow)).length>0);});

test('manual focused workflow observes original canonical proof through one read only job without replay', async () => {
  const { validateStagingVerificationWorkflow } = await api();
  const text = await readFile('.github/workflows/staging-verification.yml', 'utf8');
  assert.deepEqual(validateStagingVerificationWorkflow(text), []);
  const flow = yaml.load(text) as { jobs: Record<string, { steps: { name: string;run?:string }[] }>;on:{workflow_dispatch:{inputs:Record<string,unknown>}} };
  assert.deepEqual(Object.keys(flow.jobs),['canonical-schema']);assert.deepEqual(Object.keys(flow.on.workflow_dispatch.inputs),['ci_run_id']);
  assert.ok(flow.jobs['canonical-schema'].steps.some(step=>step.run==='node --import tsx scripts/verification/staging-verification.ts'));
  assert.doesNotMatch(text,/db:test|local:bootstrap|test:cicd|npm test|supabase stop|secrets\./);
});

test('workflow contract rejects broadened trigger secret exposure skipped security altered commands and missing dependencies', async () => {
  const { validateStagingVerificationWorkflow } = await api();
  const text = await readFile('.github/workflows/staging-verification.yml', 'utf8');
  for (const mutate of [
    (flow: Record<string, unknown>) => { flow.on = { pull_request: null }; },
    (flow: Record<string, unknown>) => { flow.env = { SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}' }; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs['canonical-schema'].if = 'false'; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; (jobs['canonical-schema'].steps as Record<string, unknown>[]).find(step => step.run === 'node --import tsx scripts/verification/staging-verification.ts')!.run = 'echo passed'; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs['canonical-schema'].permissions = {contents:'write'}; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs['replay-database'] = {run:'npm run db:test'}; },
    (flow: Record<string, unknown>) => { const jobs = flow.jobs as Record<string, Record<string, unknown>>; jobs['canonical-schema']['continue-on-error'] = true; },
  ]) {
    const flow = yaml.load(text) as Record<string, unknown>; mutate(flow);
    assert.ok(validateStagingVerificationWorkflow(yaml.dump(flow)).length > 0);
  }
});

test('manual observation context refuses another job event ref source or missing original CI identity',async()=>{
 const subject=await api(),env={GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:expected.sha,GITHUB_WORKFLOW_SHA:expected.sha,GITHUB_WORKFLOW_REF:'owner/repo/.github/workflows/staging-verification.yml@refs/heads/main',GITHUB_JOB:'canonical-schema',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTIONS:'true',CI:'true',GITHUB_SERVER_URL:'https://github.com',GITHUB_API_URL:'https://api.github.com',GH_TOKEN:'private-fixture',CUEVO_CANONICAL_CI_RUN_ID:'31'};
 assert.deepEqual(subject.readStagingVerificationContext(env,expected.sha),{repository:'owner/repo',sourceSha:expected.sha,ciRunId:'31'});
 for(const fields of [{GITHUB_JOB:'schema'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_WORKFLOW_SHA:'b'.repeat(40)},{GITHUB_API_URL:'https://other.invalid'},{CUEVO_CANONICAL_CI_RUN_ID:undefined},{CUEVO_CANONICAL_CI_RUN_ID:'031'},{GH_TOKEN:'with space'}])assert.throws(()=>subject.readStagingVerificationContext({...env,...fields},expected.sha));
});

test('actual manual command retains safe pending or review receipt with GET only and no database reset',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-schema-observation-'));try{
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();await writeFile(join(root,'README.md'),'Synthetic command fixture\n');git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','source');const sourceSha=git('rev-parse','HEAD'),treeSha=git('rev-parse','HEAD^{tree}');
  for(const mode of ['pending','denied','changed-source']){
   const hook=join(root,'fixture-fetch.mjs'),calls=join(root,'calls.json');await writeFile(hook,`import {writeFileSync} from 'node:fs';const calls=[];globalThis.fetch=async(url,options)=>{if(options.method!=='GET')throw Error('Unexpected mutation');calls.push(String(url));writeFileSync(${JSON.stringify(calls)},JSON.stringify(calls));const path=new URL(url).pathname.replace('/repos/owner/repo/','');if(${JSON.stringify(mode)}==='denied')throw Error('PRIVATE fixture credential');const run={id:31,run_attempt:2,head_sha:${JSON.stringify(mode==='changed-source'?'a'.repeat(40):sourceSha)},head_branch:'main',event:'push',path:'.github/workflows/ci.yml',status:'in_progress',conclusion:null,repository:{full_name:'owner/repo'}};const value=path==='actions/runs/31'?run:path==='git/ref/heads/main'?{object:{type:'commit',sha:${JSON.stringify(sourceSha)}}}:path==='git/commits/'+${JSON.stringify(sourceSha)}?{sha:${JSON.stringify(sourceSha)},tree:{sha:${JSON.stringify(treeSha)}}}:path==='actions/runs/31/attempts/2/jobs'?{total_count:0,jobs:[]}:null;if(value===null)throw Error('Unexpected non-read path');return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});};`);
   const result=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(hook).href,resolve('scripts/verification/staging-verification.ts')],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:sourceSha,GITHUB_WORKFLOW_SHA:sourceSha,GITHUB_WORKFLOW_REF:'owner/repo/.github/workflows/staging-verification.yml@refs/heads/main',GITHUB_JOB:'canonical-schema',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTIONS:'true',CI:'true',GITHUB_SERVER_URL:'https://github.com',GITHUB_API_URL:'https://api.github.com',GH_TOKEN:'private-fixture',CUEVO_CANONICAL_CI_RUN_ID:'31'}});
   assert.equal(result.status,1,result.stderr);const observation=JSON.parse(await readFile(join(root,'.local/staging-schema/observation.json'),'utf8')) as {status:string;pendingJobs?:string[]};assert.equal(observation.status,mode==='pending'?'NOT_READY':'REQUIRES_REVIEW');assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE fixture|private-fixture/);const paths=JSON.parse(await readFile(calls,'utf8')) as string[];assert.ok(paths.length);assert.ok(paths.every(path=>path.startsWith('https://api.github.com/repos/owner/repo/')));assert.ok(paths.every(path=>!/artifacts|dispatch|rerun/.test(path)));assert.equal(git('rev-parse','HEAD'),sourceSha);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
