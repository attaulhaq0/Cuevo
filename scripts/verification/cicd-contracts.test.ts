import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile,lstat,realpath } from 'node:fs/promises';
import { existsSync,readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve,relative,isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateWorkflows, safeEvidence, validateCiRun, validateReleaseManifest, vercelTarget, validateVercelDeployment, releaseContext, validateReleaseControls } from './cicd-contracts';
import {canonicalReleaseReviewJson,prepareReleaseReviewPackage} from './release-review';
import {runInNewContext} from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import ts from 'typescript';

test('actual web CLI resolves pinned executable before delayed current approval and launches once without PATH discovery',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-web-cli-'));
 try{
  const globalRoot=join(root,'global'),cliRoot=join(globalRoot,'vercel');await mkdir(join(cliRoot,'dist'),{recursive:true});await writeFile(join(cliRoot,'package.json'),JSON.stringify({name:'vercel',version:'62.1.0',bin:{vercel:'dist/index.js'}}));await writeFile(join(cliRoot,'dist/index.js'),'// Controlled tool never executed.\n');
  const file=resolve(import.meta.dirname,'cicd-release.ts'),source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),selected=source.statements.filter(ts.isFunctionDeclaration).filter(node=>['prepareWebCli','webCliFile'].includes(node.name?.text??''));const body=ts.transpileModule(selected.map(node=>node.getText(source)).join('\n')+'\n(typeof prepareWebCli==="undefined"?undefined:prepareWebCli);',{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
  let now=1000,admissions=0,launches=0;const env={VERCEL_TOKEN:'private-web-cli-canary',VERCEL_ORG_ID:'team_Cuevo',VERCEL_PROJECT_ID:'prj_Web'};
  const execute=(command:string,args:string[])=>{if(command==='npm'){now+=32000;assert.deepEqual(Array.from(args),['root','--global']);return globalRoot;}assert.equal(command,'controlled-node');assert.equal(args[0],join(cliRoot,'dist/index.js'));assert.ok(args.includes('--target=preview'));assert.equal(admissions,1);launches++;return'https://cuevo-prepared-web.vercel.app';};
  const prepare=runInNewContext(body,{execFileSync:execute,readFile,lstat,realpath,resolve,join,relative,isAbsolute,createHash,process:{platform:'linux',execPath:'controlled-node',env},runtimeEnvironment:()=>({}),required:(key:keyof typeof env)=>env[key],webIdentity:()=>({teamId:env.VERCEL_ORG_ID,projectId:env.VERCEL_PROJECT_ID,target:'preview'}),isDeepStrictEqual}) as ((args:string[])=>Promise<(admit:()=>Promise<()=>Promise<()=>void>>)=>Promise<string>>)|undefined;
  assert.equal(typeof prepare,'function','actual executable preparation must be independent of the final approval');const launch=await prepare!(['deploy','--prebuilt','--yes','--target=preview']);assert.equal(now,33000);assert.equal(launches,0);
  const admit=async()=>{await Promise.resolve();admissions++;return async()=>()=>undefined;};assert.equal(await launch(admit),'https://cuevo-prepared-web.vercel.app');assert.equal(launches,1);await assert.rejects(launch(admit));assert.equal(launches,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('prepared web CLI refuses tool or recipient drift during approval and preserves original package expiry before execution',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-web-cli-denial-'));
 try{
  const globalRoot=join(root,'global'),cliRoot=join(globalRoot,'vercel'),packagePath=join(cliRoot,'package.json'),cliPath=join(cliRoot,'dist/index.js'),packageBytes=JSON.stringify({name:'vercel',version:'62.1.0',bin:{vercel:'dist/index.js'}});await mkdir(join(cliRoot,'dist'),{recursive:true});
  const file=resolve(import.meta.dirname,'cicd-release.ts'),source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),selected=source.statements.filter(ts.isFunctionDeclaration).filter(node=>['prepareWebCli','webCliFile','requireOriginalWebPackageClock'].includes(node.name?.text??'')),body=ts.transpileModule(selected.map(node=>node.getText(source)).join('\n')+'\n({prepareWebCli,requireOriginalWebPackageClock});',{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
  for(const mode of ['executable','package','target','expiry','consume-executable','consume-package','final-hash-expiry']as const){await writeFile(packagePath,packageBytes);await writeFile(cliPath,'// original\n');let launches=0,now=1000,consumed=false;const env={VERCEL_TOKEN:'private-web-canary',VERCEL_ORG_ID:'team_Cuevo',VERCEL_PROJECT_ID:'prj_Web'};
   const scopedRead=async(...args:Parameters<typeof readFile>)=>{const bytes=await readFile(...args);if(mode==='final-hash-expiry'&&consumed)now=24*60*60*1000+1001;return bytes;};
   const subject=runInNewContext(body,{execFileSync:(command:string)=>{if(command==='npm')return globalRoot;launches++;return'https://cuevo-invalid.vercel.app';},readFile:scopedRead,lstat,realpath,resolve,join,relative,isAbsolute,createHash,process:{platform:'linux',execPath:'controlled-node',env},runtimeEnvironment:()=>({}),required:(key:keyof typeof env)=>env[key],webIdentity:()=>({teamId:env.VERCEL_ORG_ID,projectId:env.VERCEL_PROJECT_ID,target:'preview'}),isDeepStrictEqual,z:createRequire(import.meta.url)('zod').z,parseCanonicalReleaseReviewJson:JSON.parse,Date:{parse:Date.parse,now:()=>now}})as{prepareWebCli:(args:string[])=>Promise<(admit:()=>Promise<()=>Promise<()=>void>>)=>Promise<string>>;requireOriginalWebPackageClock:(prepared:{canonicalJson:string})=>void};
   const launch=await subject.prepareWebCli(['deploy','--prebuilt','--yes','--target=preview']);await assert.rejects(launch(async()=>{if(mode==='executable')await writeFile(cliPath,'substituted during approval');if(mode==='package')await writeFile(packagePath,'{}');if(mode==='target')env.VERCEL_PROJECT_ID='prj_Foreign';if(mode==='expiry')now=24*60*60*1000+1001;return async()=>{if(mode==='consume-executable')await writeFile(cliPath,'substituted during final input digest');if(mode==='consume-package')await writeFile(packagePath,'{}');consumed=true;return()=>{subject.requireOriginalWebPackageClock({canonicalJson:'{"preparedAt":"1970-01-01T00:00:01.000Z"}'});};};}));assert.equal(launches,0,mode);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

const sha = 'a'.repeat(40); const digest = 'b'.repeat(64); const now = Date.parse('2026-10-02T12:00:00Z');
test('required aggregate cannot bypass executed producers with dead guard text environment overrides or omitted checks',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml'),ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
 for(const mode of ['early-success','fast-omitted','technical-omitted','codeql-omitted','override','skip']){const flow=yaml.load(ci),job=flow.jobs.required,step=job.steps[0];if(mode==='early-success')step.run='exit 0\n'+step.run;else if(mode==='override')step.env.FAST='success';else if(mode==='skip')step.if='false';else{const name=mode.split('-')[0].toUpperCase();step.run=step.run.replace(new RegExp('\\[ "\\$'+name+'" != success \\] \\|\\| '),'');}assert.ok(validateWorkflows(yaml.dump(flow),release).includes('Required status must preserve the exact aggregate execution and original job results.'),mode);}
});

test('two isolated runtime jobs and exact same-attempt aggregate refuse skipped private or substituted lanes',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:Record<string,Record<string,unknown>>};dump(value:unknown):string};
 const ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
 assert.deepEqual(validateWorkflows(ci,release),[]);
 for(const change of ['skip','continue','dependency','artifact','cross-run','runtime','env','browser-engine']){
  const flow=yaml.load(ci),backend=flow.jobs['runtime-backend'],browser=flow.jobs['runtime-browser'],aggregate=flow.jobs['technical-mvp'];
  if(change==='skip')backend.if='false';if(change==='continue')browser['continue-on-error']=true;if(change==='dependency')aggregate.needs=['runtime-backend'];
  if(change==='artifact')((backend.steps as Record<string,unknown>[]).find(step=>step.name==='Retain exact safe backend lane')!.with as Record<string,unknown>).path='.local/';
  if(change==='cross-run')((aggregate.steps as Record<string,unknown>[]).find(step=>step.name==='Read exact backend lane from this run attempt')!.with as Record<string,unknown>)['run-id']='other-run';
  if(change==='runtime')(backend.steps as Record<string,unknown>[]).find(step=>step.name==='Verify isolated backend runtime')!.run='echo success';
  if(change==='env')browser.env={NODE_OPTIONS:'--import private.js'};
  if(change==='browser-engine')(browser.steps as Record<string,unknown>[]).find(step=>String(step.run).includes('playwright install'))!.run='echo skipped';
  assert.ok(validateWorkflows(yaml.dump(flow),release).length,change);
 }
});

test('only the same-job minimized CodeQL receipt can be retained with serialized processed uploads',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:Record<string,{steps:Record<string,unknown>[];concurrency?:unknown}>};dump(value:unknown):string};
 const ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
 assert.deepEqual(validateWorkflows(ci,release),[]);
 for(const mode of ['path','skip','private-env','other-owner','queue','cancel','missing']){
  const flow=yaml.load(ci),job=flow.jobs.codeql,step=job.steps.find(row=>row.name==='Retain original processed CodeQL receipt')!;
  if(mode==='path')(step.with as Record<string,unknown>).path='.local/';else if(mode==='skip')step.if='always()';else if(mode==='private-env')step.env={GH_TOKEN:'${{ github.token }}'};else if(mode==='other-owner'){job.steps=job.steps.filter(row=>row!==step);flow.jobs['fast-checks'].steps.push(step);}else if(mode==='queue')job.concurrency={group:'cuevo-codeql-${{ github.ref }}','cancel-in-progress':false};else if(mode==='cancel')job.concurrency={group:'cuevo-codeql-${{ github.ref }}','cancel-in-progress':true,queue:'max'};else job.steps=job.steps.filter(row=>row!==step);
  assert.ok(validateWorkflows(yaml.dump(flow),release).length>0,mode);
 }
});

test('hosted web source and browser budget cannot silently return to the shorter pre-loop limit',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:Record<string,Record<string,unknown>>};dump(value:unknown):string};
 const root=resolve(import.meta.dirname,'../..'),ci=await readFile(join(root,'.github/workflows/ci.yml'),'utf8'),release=await readFile(join(root,'.github/workflows/release.yml'),'utf8');
 assert.equal(validateWorkflows(ci,release).some(issue=>issue.includes('budget')),false);
 for(const minutes of [30,59,61]){const changed=yaml.load(release);changed.jobs['web-release']['timeout-minutes']=minutes;assert(validateWorkflows(ci,yaml.dump(changed)).some(issue=>issue.includes('60-minute')));}
});

test('CodeQL processing success must be followed by the same-job current security-alert gate',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:{codeql:{steps:Record<string,unknown>[]}}}};
 const workflow=yaml.load(await readFile('.github/workflows/ci.yml','utf8')),steps=workflow.jobs.codeql.steps;
 const analyzer=steps.findIndex(step=>String(step.uses??'').startsWith('github/codeql-action/analyze@'));
 const gate=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/codeql-alerts.ts');
 assert.ok(analyzer>=0&&gate>analyzer);assert.equal(steps[analyzer].id,'codeql-analyze');assert.deepEqual(steps[analyzer].with,{'wait-for-processing':true});
 assert.deepEqual(steps[gate].env,{GH_TOKEN:'${{ github.token }}',CUEVO_CODEQL_SARIF_ID:'${{ steps.codeql-analyze.outputs.sarif-id }}'});assert.equal(steps[gate].if,undefined);assert.equal(steps[gate]['continue-on-error'],undefined);
});

test('completed-backend staging frontend includes verified origin and browser checks with scoped password recipient',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:{'web-release':{steps:Record<string,unknown>[]}}}};
 const steps=yaml.load(await readFile('.github/workflows/release.yml','utf8')).jobs['web-release'].steps;
 const verified=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts verify'),bound=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts bind-staging-origin'),browser=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts verify-browser'),learning=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts verify-learning-loop');
 assert.ok(bound>verified&&browser>bound&&learning>browser);
 const condition="needs.release-admission.outputs.backend-selection-base64 != ''";assert.equal(steps[bound].if,condition);assert.equal(steps[browser].if,condition);assert.equal(steps[learning].if,condition+" && inputs.backend_handoff != 'operating-staging'");
 const env=steps[browser].env as Record<string,string>;assert.equal(env.CUEVO_SYNTHETIC_PILOT_PASSWORD,'${{ secrets.CUEVO_SYNTHETIC_PILOT_PASSWORD }}');assert.equal(env.BACKEND_SELECTION_BASE64,'${{ needs.release-admission.outputs.backend-selection-base64 }}');
 assert.ok(steps.some(step=>step.run==='npx --no-install playwright install --with-deps chromium'&&step.if===condition));
 const evidence=steps.find(step=>(step.with as Record<string,unknown>|undefined)?.name==='cuevo-web-staging-evidence-${{ github.run_id }}-${{ github.run_attempt }}')!;assert.ok(evidence);assert.equal(evidence.if,"always() && needs.release-admission.outputs.backend-selection-base64 != ''");
 assert.equal((evidence.with as Record<string,unknown>).path,['web-deployment-result.json','web-origin-intent.json','web-origin-protection-intent.json','web-origin-result.json','protected-preview-web-intent.json','protected-preview-web-result.json','hosted-browser-intent.json','hosted-browser-result.json','hosted-browser-cleanup.json'].map(name=>'.local/cicd-release/'+name).join('\n')+'\n');
});

test('learning-loop evidence stays within its exact metadata directories and conditional retention',async()=>{
 const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:{'web-release':{steps:Record<string,unknown>[]}}};dump(value:unknown):string};
 const ci=await readFile('.github/workflows/ci.yml','utf8'),source=await readFile('.github/workflows/release.yml','utf8');
 const name='cuevo-learning-loop-ui-${{ github.run_id }}-${{ github.run_attempt }}';
 const current=yaml.load(source),step=current.jobs['web-release'].steps.find(row=>(row.with as Record<string,unknown>|undefined)?.name===name)!;
 assert.ok(step);assert.equal((step.with as Record<string,unknown>).path,'.local/cicd-release/hosted-learning-loop/\n.local/cicd-release/hosted-learning-loop-ui/\n');
 const omitted=yaml.load(source);omitted.jobs['web-release'].steps=omitted.jobs['web-release'].steps.filter(row=>(row.with as Record<string,unknown>|undefined)?.name!==name);
 assert.ok(validateWorkflows(ci,yaml.dump(omitted)).includes('Learning-loop original evidence must be retained exactly once after its consumer.'));
 for(const mutate of[(row:Record<string,unknown>)=>{(row.with as Record<string,unknown>).path='.local/';},(row:Record<string,unknown>)=>{delete row.if;},(row:Record<string,unknown>)=>{row['continue-on-error']=true;}]){
  const altered=yaml.load(source),selected=altered.jobs['web-release'].steps.find(row=>(row.with as Record<string,unknown>|undefined)?.name===name)!;mutate(selected);
  assert.ok(validateWorkflows(ci,yaml.dump(altered)).includes('Unsafe artifact path.'));
 }
});
const manifest = () => ({
  version: 2, environment: 'staging', commitSha: sha, ciRunId: '42', verifiedAt: '2026-10-02T11:00:00Z',
  api: { origin: 'https://api.stage.example.com', commitSha: sha, imageDigest: `sha256:${digest}`, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
  worker: { kind: 'container', origin: 'https://worker.stage.example.com', commitSha: sha, imageDigest: `sha256:${digest}`, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
  database: { projectRef: 'stageproject', migrations: [{ version: '20261002074258', sha256: digest }], grantsVerified: true, rlsVerified: true, privateStorageVerified: true, privateRealtimeVerified: true, recoveryVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41', dataApi: { state:'DISABLED' as const,projectRef:'stageproject',commitSha:sha,verifiedAt:'2026-10-02T11:00:00Z',configurationVerified:true,anonymousRestDenied:true,authenticatedRestDenied:true,serviceRestDenied:true,graphqlDenied:true,rpcDenied:true,evidenceUrl:'https://github.com/owner/repo/actions/runs/41' } },
  approval: { reviewer: 'school-owner', basis: 'SYNTHETIC_STAGING', evidenceUrl: 'https://github.com/owner/repo/issues/3' },
  publicConfig: { apiUrl: 'https://api.stage.example.com', supabaseUrl: 'https://stageproject.supabase.co', supabasePublishableKey: 'sb_publishable_public-only-value' },
});
const context = { sha, environment: 'staging', ciRunId: '42', now, migrations: [{ version: '20261002074258', sha256: digest }] };
const trustedRun = () => ({ id: 42, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'owner/repo' } });
const releaseControls = () => ({ repository:{full_name:'owner/repo',name:'repo',owner:{id:1,login:'owner',type:'Organization'}}, environment: { id:123,name: 'production', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 95836629, login: 'attaulhaq0', type: 'User' } }] }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }, branches: { branch_policies: [{ name: 'main', type: 'branch' }] }, signatures: { enabled: true }, main: { allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['required'] }, required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 0,require_last_push_approval:false,bypass_pull_request_allowances:{users:[],teams:[],apps:[]} } } });
test('release controls require existing protected environment and reviewed signed current main', () => {
  validateReleaseControls(releaseControls(), { environment: 'production', repository: 'owner/repo' });
  for (const change of [
    (v: ReturnType<typeof releaseControls>) => { v.environment.protection_rules = []; },
    (v: ReturnType<typeof releaseControls>) => { v.environment.can_admins_bypass = true; },
    (v: ReturnType<typeof releaseControls>) => { v.environment.protection_rules[0].prevent_self_review = true; },
    (v: ReturnType<typeof releaseControls>) => { v.environment.protection_rules[0].reviewers = []; },
    (v: ReturnType<typeof releaseControls>) => { v.branches.branch_policies[0].name = '*'; },
    (v: ReturnType<typeof releaseControls>) => { v.main.enforce_admins.enabled = false; },
    (v: ReturnType<typeof releaseControls>) => { v.signatures.enabled = false; },
    (v: ReturnType<typeof releaseControls>) => { v.main.required_status_checks.contexts = []; },
    (v: ReturnType<typeof releaseControls>) => { v.main.required_pull_request_reviews.require_code_owner_reviews = true; },
    (v: ReturnType<typeof releaseControls>) => { v.main.required_pull_request_reviews.dismiss_stale_reviews = false; },
    (v: ReturnType<typeof releaseControls>) => { v.main.required_pull_request_reviews.required_approving_review_count = 1; },
  ]) { const value = releaseControls(); change(value); assert.throws(() => validateReleaseControls(value, { environment: 'production', repository: 'owner/repo' })); }
  assert.throws(() => validateReleaseControls({}, { environment: 'production', repository: 'owner/repo' }));
  const bypass = { ...releaseControls(), main: { ...releaseControls().main, required_pull_request_reviews: { ...releaseControls().main.required_pull_request_reviews, bypass_pull_request_allowances: { users: [{ id: 1 }], teams: [], apps: [] } } } };
  assert.throws(() => validateReleaseControls(bypass, { environment: 'production', repository: 'owner/repo' }));
});
test('automatic metadata cannot replace explicit manual production candidate admission', () => {
  const expected = { sha, ref: 'refs/heads/main', repository: 'owner/repo', eventName: 'workflow_run' };
  const full = { ...trustedRun(), event: 'workflow_dispatch', path: '.github/workflows/full-regression.yml', run_attempt: 1 };
  assert.throws(() => releaseContext({ workflow_run: full }, expected));
  assert.throws(() => releaseContext({ workflow_run: trustedRun() }, expected), 'routine main CI cannot initiate production');
  for (const fields of [{ event: 'pull_request' }, { conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' }, { head_branch: 'feature' }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'fork/repo' } }, { id: null }]) {
    assert.throws(() => releaseContext({ workflow_run: { ...full, ...fields } }, expected));
  }
  for (const fields of [{ ref: 'refs/heads/feature' }, { eventName: 'pull_request' }, { repository: 'other/repo' }]) {
    assert.throws(() => releaseContext({ workflow_run: full }, { ...expected, ...fields }));
  }
  assert.throws(() => releaseContext({}, expected));
});
test('manual release context retains exact-main staging and production admission', () => {
  const expected = { sha, ref: 'refs/heads/main', repository: 'owner/repo', eventName: 'workflow_dispatch' };
  assert.deepEqual(releaseContext({ inputs: { environment:'staging', commit_sha: sha, ci_run_id:'42' } },expected),{sha,ciRunId:'42',environment:'staging'});
  assert.deepEqual(releaseContext({ inputs: { environment:'production', commit_sha: sha, ci_run_id:'42',full_verification_run_id:'84' } },expected),{sha,ciRunId:'42',environment:'production',fullVerificationRunId:'84'});
  for(const [environment,full_verification_run_id]of [['production',''],['production','42'],['staging','84'],['production','bad']]as const)assert.throws(()=>releaseContext({inputs:{environment,commit_sha:sha,ci_run_id:'42',full_verification_run_id}},expected));
  for (const fields of [{ environment: 'preview' }, { commit_sha: 'c'.repeat(40) }, { commit_sha: '$(command)' }, { ci_run_id: '42\nurl=untrusted' }]) {
    assert.throws(() => releaseContext({ inputs: { environment: 'staging', commit_sha: sha, ci_run_id: '42', ...fields } }, expected));
  }
});
test('actual release context writes only admitted outputs and rejects stale main before provider actions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cuevo-release-admission-'));
  const eventPath = join(directory, 'event.json'); const outputPath = join(directory, 'outputs');
  try {
    await writeFile(eventPath, JSON.stringify({ inputs:{environment:'production',commit_sha:sha,ci_run_id:'42',full_verification_run_id:'84'} }));
    const expected = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'owner/repo', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath, RELEASE_SHA: sha, CI_RUN_ID: '42', FULL_VERIFICATION_RUN_ID:'84', GH_TOKEN: 'synthetic-token' };
    const execute = (mode: 'context' | 'ci' | 'deploy' | 'controls', currentSha = sha, run = trustedRun(), checkoutSha = sha, protectedEnvironment = true) => spawnSync(process.execPath, ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, '--input-type=module', '--eval', `
      const childProcess = (await import('node:module')).createRequire(import.meta.url)('node:child_process');
      childProcess.execFileSync = (command,args) => {
        if (command === 'git' && JSON.stringify(args) === JSON.stringify(['rev-parse','HEAD'])) return ${JSON.stringify(checkoutSha + '\n')};
        throw Error('Unexpected command action');
      };
      (await import('node:module')).syncBuiltinESMExports();
      (await import('node:module')).registerHooks({load(url,context,next){if(url.endsWith('/canonical-runtime-jobs.ts'))return{format:'module',shortCircuit:true,source:'export async function readCanonicalRuntimeJobs(){return{runAttempt:2,jobsSha256:"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"};}export async function readCanonicalRuntimeJobsAndGuard(){throw Error("Native backend canonical guard is outside this controlled web fixture");}'};if(url.endsWith('/full-release-evidence.ts'))return{format:'module',shortCircuit:true,source:'export function validateProductionCiRun(value,expected){if(value.path!==".github/workflows/full-regression.yml"||value.event!=="workflow_dispatch"||value.head_sha!==expected.sha||value.conclusion!=="success"||value.run_attempt!==1)throw Error("Full source evidence refused");}export async function readFullReleaseEvidence(){return{profile:"CUSTOMER_CANDIDATE",sourceSha:${JSON.stringify(sha)},runId:"42",runAttempt:1};}'};return next(url,context);}});
      process.argv[2] = ${JSON.stringify(mode)};
      globalThis.fetch = async input => {
        const url = String(input); console.log('FETCH ' + url);
        if(url==='https://api.github.com/repos/owner/repo')return Response.json({full_name:'owner/repo',name:'repo',owner:{id:1,login:'owner',type:'Organization'}});
        if (url === 'https://api.github.com/repos/owner/repo/actions/runs/42') return new Response(JSON.stringify(${JSON.stringify(run)}));
        if (url === 'https://api.github.com/repos/owner/repo/git/ref/heads/main') return new Response(JSON.stringify({ object: { type: 'commit', sha: ${JSON.stringify(currentSha)} } }));
        if (url === 'https://api.github.com/repos/owner/repo/environments/production') return new Response(JSON.stringify(${JSON.stringify(releaseControls().environment)}), { status: ${protectedEnvironment ? 200 : 404} });
        if (url === 'https://api.github.com/repos/owner/repo/environments/production/deployment-branch-policies') return new Response(JSON.stringify(${JSON.stringify(releaseControls().branches)}));
        if (url === 'https://api.github.com/repos/owner/repo/branches/main/protection') return new Response(JSON.stringify(${JSON.stringify(releaseControls().main)}));
        if (url === 'https://api.github.com/repos/owner/repo/branches/main/protection/required_signatures') return new Response(JSON.stringify(${JSON.stringify(releaseControls().signatures)}));
        throw Error('Unexpected network action');
      };
      await import(${JSON.stringify(pathToFileURL(resolve('scripts/verification/cicd-release.ts')).href)});
    `], { cwd: directory, env: { ...expected, RELEASE_ENVIRONMENT: 'production' }, encoding: 'utf8', timeout: 20000 });
    const contextResult = execute('context'); assert.equal(contextResult.status, 0, contextResult.stderr);
    assert.equal(contextResult.stdout.includes('FETCH '), false);
    assert.equal(await readFile(outputPath, 'utf8'), `sha=${sha}\nci-run-id=42\nfull-run-id=84\nenvironment=production\n`);
    assert.equal(execute('ci').status, 0);
    const controls = execute('controls'); assert.equal(controls.status, 0, controls.stderr); assert.ok(controls.stdout.includes('/protection/required_signatures'));
    const missing = execute('controls', sha, trustedRun(), sha, false); assert.equal(missing.status, 1); assert.ok(missing.stderr.includes('control or approval evidence'));
    const stale = execute('ci', 'c'.repeat(40)); assert.equal(stale.status, 1);
    assert.ok(stale.stderr.includes('Main changed'));
    const staleUpload = execute('deploy', 'c'.repeat(40)); assert.equal(staleUpload.status, 1);
    assert.equal(staleUpload.stdout.includes('FETCH https://api.vercel.com'),false);
    await writeFile(join(directory,'.local/cicd-release/canonical-runtime-proof.json'),JSON.stringify({runAttempt:3,jobsSha256:'e'.repeat(64)}));
    const changedAttempt=execute('ci');assert.equal(changedAttempt.status,1);assert.match(changedAttempt.stderr,/job attempt changed/);
    await writeFile(join(directory,'.local/cicd-release/canonical-runtime-proof.json'),JSON.stringify({runAttempt:2,jobsSha256:'0'.repeat(64)}));
    assert.equal(execute('ci').status,1);
    const wrongCheckout = execute('ci', sha, trustedRun(), 'c'.repeat(40)); assert.equal(wrongCheckout.status, 1);
    assert.equal(wrongCheckout.stdout.includes('FETCH '), false); assert.ok(wrongCheckout.stderr.includes('checkout'));
    await writeFile(eventPath, JSON.stringify({inputs:{environment:'production',commit_sha:'c'.repeat(40),ci_run_id:'42',full_verification_run_id:'84'}}));
    const refused = execute('context'); assert.equal(refused.status, 1);
    assert.equal(await readFile(outputPath, 'utf8'), `sha=${sha}\nci-run-id=42\nfull-run-id=84\nenvironment=production\n`);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir())); assert.ok(basename(directory).startsWith('cuevo-release-admission-'));
    await rm(directory, { recursive: true, force: true });
  }
});
const edgeManifest = () => ({
  ...manifest(),
  worker: { kind: 'supabase-edge', commitSha: sha, projectRef: 'stageproject', functionName: 'cuevo-worker', artifactSha256: digest, denoLockSha256: 'd'.repeat(64), authVerified: true, queueRecoveryVerified: true, roleGrantsVerified: true, transportPrivateVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
});
const vercelApiManifest = () => ({
  ...edgeManifest(),
  api: { kind: 'vercel', origin: 'https://api.stage.example.com', commitSha: sha, projectId: 'prj_cuevoApi', teamId: 'team_cuevo', deploymentId: 'dpl_cuevoApi', deploymentUrl: 'https://cuevo-api-build.vercel.app', target: 'preview', artifactSha256: digest, metadataVerified: true, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
});

test('API admission names the Vercel runtime and verified deployment identity without inventing a container digest', () => {
  const value = vercelApiManifest(); const admitted = validateReleaseManifest(value, context);
  assert.deepEqual(admitted.api, value.api);
  assert.equal(Object.hasOwn(admitted.api, 'imageDigest'), false);
  assert.equal(validateReleaseManifest(manifest(), context).api.kind, 'container');
  for (const fields of [
    { kind: 'unknown' }, { imageDigest: `sha256:${digest}` }, { metadataVerified: false }, { healthVerified: false },
    { commitSha: 'c'.repeat(40) }, { projectId: 'not-a-project' }, { teamId: 'wrong-team' }, { deploymentId: 'wrong-deployment' },
    { artifactSha256: 'not-a-hash' }, { target: 'production' }, { deploymentUrl: 'https://other.example.com' },
  ]) assert.throws(() => validateReleaseManifest({ ...value, api: { ...value.api, ...fields } }, context));
  for (const field of ['metadataVerified', 'projectId', 'teamId', 'deploymentId', 'deploymentUrl', 'artifactSha256']) {
    const api: Record<string, unknown> = { ...value.api }; delete api[field];
    assert.throws(() => validateReleaseManifest({ ...value, api }, context));
  }
});

const bash = process.platform === 'win32' ? ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe'].find(existsSync) : '/bin/bash';
test('actual required-status Bash rejects every failed, cancelled or skipped required job', { skip: !bash }, async () => {
  const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): { jobs: { required: { steps: { run: string }[] } } } };
  const workflow = yaml.load(await readFile('.github/workflows/ci.yml', 'utf8'));
  const command = workflow.jobs.required.steps[0].run;
  const execute = (event: 'push' | 'pull_request', fields: Record<string, string> = {}) => {
    const result = spawnSync(bash!, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', command], {
      env: { ...process.env, BASH_ENV: '', FAST: 'success', SOURCE_CONTRACTS: 'success', DATABASE: 'success', TECHNICAL: 'success', CODEQL: 'success', SECRET_SCAN: 'success', DEPENDENCY: event === 'push' ? 'skipped' : 'success', GITHUB_EVENT_NAME: event, ...fields },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    return result.status;
  };
  assert.equal(execute('push'), 0); assert.equal(execute('pull_request'), 0);
  for (const event of ['push', 'pull_request'] as const) for (const job of ['FAST', 'SOURCE_CONTRACTS', 'DATABASE', 'TECHNICAL', 'CODEQL', 'SECRET_SCAN']) for (const state of ['failure', 'cancelled', 'skipped', '']) {
    assert.notEqual(execute(event, { [job]: state }), 0, `${event} ${job} ${state} must fail the required status`);
  }
  assert.notEqual(execute('pull_request', { DEPENDENCY: 'skipped' }), 0);
  assert.notEqual(execute('pull_request', { DEPENDENCY: 'failure' }), 0);
  assert.notEqual(execute('push', { DEPENDENCY: 'success' }), 0);
});

test('staging application environment uses supported Vercel preview consistently', () => {
  assert.equal(vercelTarget('staging'), 'preview'); assert.equal(vercelTarget('production'), 'production');
  assert.throws(() => vercelTarget('unapproved'));
});

test('raw Vercel deployment must match exact project, team, target, URL and SHA metadata', () => {
  const url = 'https://cuevo-build.vercel.app'; const expected = { sha, projectId: 'prj_cuevo', teamId: 'team_cuevo', target: 'preview', url };
  const deployment = { id: 'dpl_cuevo', projectId: 'prj_cuevo', ownerId: 'team_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: sha } };
  validateVercelDeployment(deployment, expected);
  for (const fields of [{ ownerId: 'team_other' }, { projectId: 'prj_other' }, { meta: { cuevoCommitSha: 'c'.repeat(40) } }, { meta: undefined }, { target: 'production' }, { readyState: 'BUILDING' }, { url: 'other.vercel.app' }]) {
    assert.throws(() => validateVercelDeployment({ ...deployment, ...fields }, expected));
  }
  // CLI inspect summary omits ownership/metadata and is not sufficient evidence.
  assert.throws(() => validateVercelDeployment({ id: 'dpl_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: 'preview' }, expected));
});

test('release admission requires exact verified commit, dependency images and complete migration/security evidence', () => {
  assert.equal(validateReleaseManifest(manifest(), context).apiUrl, 'https://api.stage.example.com');
  for (const mutate of [
    (m: ReturnType<typeof manifest>) => { m.api.commitSha = 'c'.repeat(40); },
    (m: ReturnType<typeof manifest>) => { m.worker.healthVerified = false; },
    (m: ReturnType<typeof manifest>) => { m.database.rlsVerified = false; },
    (m: ReturnType<typeof manifest>) => { m.database.migrations = []; },
    (m: ReturnType<typeof manifest>) => { m.publicConfig.apiUrl = 'https://other.example.com'; },
    (m: ReturnType<typeof manifest>) => { m.publicConfig.supabaseUrl = 'http://localhost:56321'; },
    (m: ReturnType<typeof manifest>) => { m.verifiedAt = '2026-09-30T12:00:00Z'; },
    (m: ReturnType<typeof manifest>) => { m.approval.basis = 'PRODUCTION_APPROVED'; },
  ]) { const value = manifest(); mutate(value); assert.throws(() => validateReleaseManifest(value, context)); }
  assert.throws(() => validateReleaseManifest({ ...manifest(), secrets: { token: 'not-public' } }, context));
  assert.throws(() => validateReleaseManifest(manifest(), { ...context, environment: 'production' }));
});

test('release admission preserves a container worker descriptor and its readiness origin', () => {
  const admitted = validateReleaseManifest(manifest(), context);
  assert.deepEqual(admitted.worker, manifest().worker);
  assert.equal(admitted.workerOrigin, 'https://worker.stage.example.com');
});

test('release admission accepts Edge attestations without inventing a container origin', () => {
  const admitted = validateReleaseManifest(edgeManifest(), context);
  assert.deepEqual(admitted.worker, edgeManifest().worker);
  assert.equal(Object.hasOwn(admitted, 'workerOrigin'), false);
});

test('release admission rejects a worker whose execution kind is missing or unknown', () => {
  const worker: Record<string, unknown> = { ...manifest().worker }; delete worker.kind;
  assert.throws(() => validateReleaseManifest({ ...manifest(), worker }, context));
  assert.throws(() => validateReleaseManifest({ ...manifest(), worker: { ...worker, kind: 'unknown' } }, context));
});

test('Edge admission requires every authentication, queue, role and transport proof', () => {
  for (const field of ['authVerified', 'queueRecoveryVerified', 'roleGrantsVerified', 'transportPrivateVerified'] as const) {
    const value = edgeManifest(); value.worker[field] = false;
    assert.throws(() => validateReleaseManifest(value, context), `${field}=false must fail`);
    const worker: Record<string, unknown> = { ...edgeManifest().worker }; delete worker[field];
    assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker }, context), `missing ${field} must fail`);
  }
});

test('hosted release requires current exact-project Data API disabled and observed endpoint denials',()=>{
  const value=manifest();assert.doesNotThrow(()=>validateReleaseManifest(value,context));
  for(const field of ['configurationVerified','anonymousRestDenied','authenticatedRestDenied','serviceRestDenied','graphqlDenied','rpcDenied'] as const){assert.throws(()=>validateReleaseManifest({...value,database:{...value.database,dataApi:{...value.database.dataApi,[field]:false}}},context));}
  for(const fields of [{state:'ENABLED'},{projectRef:'otherproject'},{commitSha:baseShaForDenied()},{verifiedAt:'2026-09-30T00:00:00Z'},{verifiedAt:'2026-10-03T00:00:00Z'}])assert.throws(()=>validateReleaseManifest({...value,database:{...value.database,dataApi:{...value.database.dataApi,...fields}}},context));
  const database:Record<string,unknown>={...value.database};delete database.dataApi;assert.throws(()=>validateReleaseManifest({...value,database},context));
  assert.throws(()=>validateReleaseManifest({...value,version:1},context));
});
function baseShaForDenied(){return 'c'.repeat(40);}

test('Edge admission binds project, function, source and locked dependency identity', () => {
  for (const fields of [
    { projectRef: 'otherproject' }, { projectRef: 'stage-project' }, { commitSha: 'c'.repeat(40) }, { functionName: 'another-worker' },
    { artifactSha256: `sha256:${digest}` }, { artifactSha256: 'B'.repeat(64) }, { denoLockSha256: 'd'.repeat(63) }, { denoLockSha256: 'not-a-lock-hash' },
  ]) assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker: { ...edgeManifest().worker, ...fields } }, context));
  for (const field of ['artifactSha256', 'denoLockSha256', 'projectRef', 'functionName', 'evidenceUrl']) {
    const worker: Record<string, unknown> = { ...edgeManifest().worker }; delete worker[field];
    assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker }, context));
  }
});

test('worker admission rejects mixed container and Edge execution fields', () => {
  for (const fields of [{ origin: 'https://worker.stage.example.com' }, { imageDigest: `sha256:${digest}` }, { healthVerified: true }]) {
    assert.throws(() => validateReleaseManifest({ ...edgeManifest(), worker: { ...edgeManifest().worker, ...fields } }, context));
  }
  assert.throws(() => validateReleaseManifest({ ...manifest(), worker: { ...manifest().worker, projectRef: 'stageproject' } }, context));
});

test('worker attestations expire after 24 hours and cannot be future dated', () => {
  for (const value of [manifest(), edgeManifest()]) {
    assert.doesNotThrow(() => validateReleaseManifest({ ...value, verifiedAt: '2026-10-01T12:00:00.000Z' }, context));
    assert.throws(() => validateReleaseManifest({ ...value, verifiedAt: '2026-10-01T11:59:59.999Z' }, context));
    assert.throws(() => validateReleaseManifest({ ...value, verifiedAt: '2026-10-02T12:00:00.001Z' }, context));
  }
});

const verifyRelease = async (value: ReturnType<typeof manifest> | ReturnType<typeof edgeManifest> | ReturnType<typeof vercelApiManifest>, options: { savedWorker?: Record<string, unknown>; savedApi?: Record<string, unknown>; verifyAt?: number; workerReady?: boolean; apiDeployment?: Record<string, unknown> } = {}) => {
  const directory = await mkdtemp(join(tmpdir(), 'cuevo-release-contract-'));
  try {
    const releaseDirectory = join(directory, '.local/cicd-release'); await mkdir(releaseDirectory, { recursive: true });
    const migrationDirectory = join(directory, 'supabase/migrations'); await mkdir(migrationDirectory, { recursive: true });
    const sql = '-- synthetic release contract migration\n';
    await writeFile(join(migrationDirectory, '20261002074258_contract.sql'), sql);
    value.database.migrations = [{ version: '20261002074258', sha256: createHash('sha256').update(sql).digest('hex') }];
    await writeFile(join(releaseDirectory, 'deployment.json'), JSON.stringify({ url: 'https://cuevo-build.vercel.app', commitSha: sha }));
    const webArtifactPath = join(directory, '.vercel/output/static/index.html'), webArtifact = '<p>Controlled immutable web output</p>';
    await mkdir(dirname(webArtifactPath), { recursive: true }); await writeFile(webArtifactPath, webArtifact);
    await writeFile(join(releaseDirectory, 'artifact.sha256'), createHash('sha256').update('/static/index.html').update(createHash('sha256').update(webArtifact).digest()).digest('hex'));
    const assignments={baseSha:'c'.repeat(40),reviews:[{category:'source-spec-code' as const,taskId:'/root/source-review',reportSha256:'d'.repeat(64),evidenceSha256:'e'.repeat(64)},{category:'qa-regression-operations' as const,taskId:'/root/qa-review',reportSha256:'f'.repeat(64),evidenceSha256:'0'.repeat(64)}]};
    const treeBytes='exact synthetic tree',diffBytes='exact synthetic diff';
    const sourceManifestSha256=createHash('sha256').update(treeBytes).digest('hex'),diffSha256=createHash('sha256').update(diffBytes).digest('hex'),manifestSha256=createHash('sha256').update(canonicalReleaseReviewJson(value)).digest('hex');
    const web={teamId:'team_cuevo',projectId:'prj_cuevo',target:'preview' as const};
    const canonicalRuntimeVerification={runAttempt:2,jobsSha256:'e'.repeat(64)};const reviewInput={web,canonicalRuntimeVerification,version:1 as const,repository:'owner/repo',releaseSha:sha,baseSha:assignments.baseSha,ciRunId:'42',manifestSha256,sourceManifestSha256,diffSha256,reviews:assignments.reviews.map(row=>({...row,releaseSha:sha,baseSha:assignments.baseSha,sourceManifestSha256,diffSha256,reviewedAt:'2026-10-02T11:00:00Z',provenance:'RETAINED_INDEPENDENT_AGENT_REPORT' as const,independenceAttested:true as const}))};
    const prepared=prepareReleaseReviewPackage(reviewInput,{repository:'owner/repo',releaseSha:sha,baseSha:assignments.baseSha,ciRunId:'42',releaseRunId:'51',runAttempt:1,environmentId:123,environmentName:'staging',web,canonicalRuntimeVerification,now,manifestSha256,sourceManifestSha256,diffSha256,reviews:assignments.reviews});
    const protectedControls={...releaseControls(),environment:{...releaseControls().environment,name:'staging'}};
    const script = (mode: 'manifest' | 'approval' | 'verify') => `
      const cp=(await import('node:module')).createRequire(import.meta.url)('node:child_process');cp.execFileSync=(command,args)=>{if(command!=='git')throw Error('Unexpected executable before verified approval');if(args[0]==='rev-parse')return args[1]==='HEAD'?'${sha}':'${assignments.baseSha}';if(args[0]==='merge-base'||args[0]==='diff'&&args[1]==='--quiet'||args[0]==='ls-files')return '';if(args[0]==='ls-tree')return '${treeBytes}';if(args[0]==='diff')return '${diffBytes}';throw Error('Unexpected source read')};(await import('node:module')).syncBuiltinESMExports();
            (await import('node:module')).registerHooks({load(url,context,next){if(url.endsWith('/canonical-runtime-jobs.ts'))return{format:'module',shortCircuit:true,source:'export async function readCanonicalRuntimeJobs(){return{runAttempt:2,jobsSha256:"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"};}export async function readCanonicalRuntimeJobsAndGuard(){throw Error("Native backend canonical guard is outside this controlled web fixture");}'};if(url.endsWith('/protected-preview.ts'))return{format:'module',shortCircuit:true,source:'export async function createProtectedPreview(input,ports){await ports.admit();return{status:"CONFIRMED"};}export async function protectedPreviewHeaders(input){if(new URL(input.url).origin!==input.binding.origin)throw Error("Foreign web origin");return{"x-vercel-protection-bypass":"private-web-contract-canary"};}'};if(url.endsWith('/git-source-digest.ts'))return{format:'module',shortCircuit:true,source:'export async function readGitBinaryDiffDigest(){return{sha256:"${diffSha256}",bytes:20}}'};return next(url,context);}});
      process.argv[2] = '${mode}';
      Date.now = () => ${mode !== 'verify' ? now : options.verifyAt ?? now};
      globalThis.fetch = async (input,options={}) => {
        const url = String(input); console.log('FETCH ' + url);
        const gateway=new Headers(options.headers).get('x-vercel-protection-bypass');
        if(url==='https://cuevo-build.vercel.app'){if(gateway!=='private-web-contract-canary')return new Response('Protected web preview',{status:401});}
        else if(gateway)throw Error('Private web transport forwarded outside its immutable origin');
        if(url==='https://api.github.com/repos/owner/repo')return Response.json({full_name:'owner/repo',name:'repo',owner:{id:1,login:'owner',type:'Organization'}});
        if(url==='https://api.github.com/repos/owner/repo/actions/runs/42')return new Response(JSON.stringify(${JSON.stringify(trustedRun())}));
        if(url==='https://api.github.com/repos/owner/repo/git/ref/heads/main')return new Response(JSON.stringify({object:{type:'commit',sha:'${sha}'}}));
        if(url==='https://api.github.com/repos/owner/repo/actions/runs/51')return new Response(JSON.stringify({id:51,run_attempt:1,repository:{full_name:'owner/repo'},head_sha:'${sha}',head_branch:'main',path:'.github/workflows/release.yml',event:'workflow_dispatch',status:'in_progress',conclusion:null}));
        if(url==='https://api.github.com/repos/owner/repo/actions/runs/51/approvals')return new Response(JSON.stringify([{environments:[{id:123,name:'staging'}],state:'approved',user:{id:95836629,login:'attaulhaq0',type:'User'},comment:${JSON.stringify(prepared.comment)}}]));
        if(url==='https://api.github.com/repos/owner/repo/environments/staging')return new Response(JSON.stringify(${JSON.stringify(protectedControls.environment)}));
        if(url==='https://api.github.com/repos/owner/repo/environments/staging/deployment-branch-policies')return new Response(JSON.stringify(${JSON.stringify(protectedControls.branches)}));
        if(url==='https://api.github.com/repos/owner/repo/branches/main/protection')return new Response(JSON.stringify(${JSON.stringify(protectedControls.main)}));
        if(url==='https://api.github.com/repos/owner/repo/branches/main/protection/required_signatures')return new Response(JSON.stringify(${JSON.stringify(protectedControls.signatures)}));
        if (url === 'https://api.vercel.com/v13/deployments/cuevo-build.vercel.app?teamId=team_cuevo') return new Response(JSON.stringify({ id: 'dpl_cuevo', projectId: 'prj_cuevo', ownerId: 'team_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: '${sha}' } }));
        if (url === 'https://api.vercel.com/v13/deployments/dpl_cuevoApi?teamId=team_cuevo') return new Response(JSON.stringify({ id: 'dpl_cuevoApi', projectId: 'prj_cuevoApi', ownerId: 'team_cuevo', url: 'cuevo-api-build.vercel.app', readyState: 'READY', target: null, meta: { cuevoCommitSha: '${sha}' }, ...${JSON.stringify(options.apiDeployment ?? {})} }));
        if (url === 'https://cuevo-build.vercel.app' || url === 'https://api.stage.example.com/health/ready') return new Response(null, { status: 200 });
        if (url === 'https://worker.stage.example.com/health/ready') return new Response(null, { status: ${options.workerReady === false ? 503 : 200} });
        throw Error('Unexpected network request');
      };
      await import(${JSON.stringify(pathToFileURL(resolve('scripts/verification/cicd-release.ts')).href)});
    `;
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, RELEASE_SHA: sha, RELEASE_ENVIRONMENT: 'staging', VERCEL_ORG_ID: 'team_cuevo', VERCEL_PROJECT_ID: 'prj_cuevo', GITHUB_SHA:sha,GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'owner/repo',GITHUB_RUN_ID:'51',GITHUB_RUN_ATTEMPT:'1',GH_TOKEN:'synthetic-github-token',CI_RUN_ID:'42',RELEASE_MANIFEST:canonicalReleaseReviewJson(value),RELEASE_ENVIRONMENT_ID:'123',REVIEW_BASE64:prepared.base64,REVIEW_DIGEST:prepared.sha256,CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON:canonicalReleaseReviewJson(assignments) };
    const execute = (mode: 'manifest' | 'approval' | 'verify', extra: Record<string, string> = {}) => spawnSync(process.execPath, ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, '--input-type=module', '--eval', script(mode)], { cwd: directory, env: { ...env, ...(mode==='verify'?{VERCEL_TOKEN:'synthetic-verification-token'}:{}),...extra }, encoding: 'utf8', timeout: 20000 });
    const admission = execute('approval');
    assert.equal(admission.error, undefined); assert.equal(admission.status, 0, admission.stderr);
    if (options.savedWorker || options.savedApi) {
      const path = join(releaseDirectory, 'public.json');
      const receipt = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      await writeFile(path, JSON.stringify({ ...receipt, ...(options.savedWorker ? { worker: options.savedWorker } : {}), ...(options.savedApi ? { api: options.savedApi } : {}) }));
    }
    // The actual workflow supplies neither manifest nor CI run ID again in its verify step.
    return execute('verify');
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()), 'release test cleanup must stay in the temporary directory');
    assert.ok(basename(directory).startsWith('cuevo-release-contract-'), 'release test cleanup requires its own directory prefix');
    await rm(directory, { recursive: true, force: true });
  }
};

test('release verify reads exact API deployment metadata and refuses changed host ownership or source before readiness', async () => {
  const passed = await verifyRelease(vercelApiManifest()); assert.equal(passed.status, 0, passed.stderr);
  assert.ok(passed.stdout.includes('FETCH https://api.vercel.com/v13/deployments/dpl_cuevoApi?teamId=team_cuevo'));
  for (const apiDeployment of [{ id: 'dpl_other' }, { projectId: 'prj_other' }, { ownerId: 'team_other' }, { meta: { cuevoCommitSha: 'c'.repeat(40) } }, { readyState: 'ERROR' }, { url: 'other-api.vercel.app' }, { target: 'production' }]) {
    const rejected = await verifyRelease(vercelApiManifest(), { apiDeployment }); assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout.includes('FETCH https://api.stage.example.com/health/ready'), false);
  }
  const modified = await verifyRelease(vercelApiManifest(), { savedApi: { ...vercelApiManifest().api, deploymentId: 'dpl_changed' } });
  assert.equal(modified.status, 1); assert.equal(modified.stdout.includes('FETCH https://api.vercel.com'), false);
});

test('release verify fetches container readiness and refuses an unavailable worker', async () => {
  const ready = await verifyRelease(manifest()); assert.equal(ready.error, undefined); assert.equal(ready.status, 0, ready.stderr);
  assert.ok(ready.stdout.includes('FETCH https://worker.stage.example.com/health/ready'));
  const unavailable = await verifyRelease(manifest(), { workerReady: false }); assert.equal(unavailable.status, 1);
});

test('release verify consumes admitted Edge attestations without any worker request', async () => {
  const result = await verifyRelease(edgeManifest()); assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split(/\r?\n/).filter(line => line.startsWith('FETCH ')&&!line.startsWith('FETCH https://api.github.com')), [
    'FETCH https://api.vercel.com/v13/deployments/cuevo-build.vercel.app?teamId=team_cuevo',
    'FETCH https://cuevo-build.vercel.app', 'FETCH https://api.stage.example.com/health/ready',
  ]);
  assert.ok(result.stdout.includes('Edge worker security/queue evidence remains admitted attestations'));
});

test('release verify rejects expired Edge evidence or a modified admitted worker before network checks', async () => {
  const expired = await verifyRelease(edgeManifest(), { verifyAt: now + 86400000 }); assert.equal(expired.status, 1);
  assert.equal(expired.stdout.includes('FETCH https://api.vercel.com'), false);
  for (const savedWorker of [{ ...edgeManifest().worker, kind: 'unknown' }, { ...edgeManifest().worker, authVerified: false }]) {
    const modified = await verifyRelease(edgeManifest(), { savedWorker }); assert.equal(modified.status, 1);
    assert.equal(modified.stdout.includes('FETCH https://api.vercel.com'), false);
  }
});

test('successful CI proof is restricted to this repository main push, exact SHA and canonical workflow', () => {
  const run = { id: 42, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'owner/repo' } };
  validateCiRun(run, { sha, repository: 'owner/repo', ciRunId: '42' });
  for (const fields of [{ event: 'pull_request' }, { conclusion: 'failure' }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'fork/repo' } }]) {
    assert.throws(() => validateCiRun({ ...run, ...fields }, { sha, repository: 'owner/repo', ciRunId: '42' }));
  }
});

test('safe evidence exports only validated counts, statuses and hashes without source output or fixture secrets', () => {
  const result = safeEvidence({ status: 'FAILED', rows: [{ name: 'integration', exitCode: 1, required: true, durationMs: 1000, raw: 'secret', failure: 'private pupil answer' }] }, [{ path: 'apps/api/src/main.ts', sha256: digest }], { sha, runId: '42' });
  assert.deepEqual(result.rows, [{ name: 'integration', exitCode: 1, durationMs: 1000 }]);
  assert.equal(JSON.stringify(result).includes('private pupil'), false); assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.throws(() => safeEvidence({ status: 'VERIFIED', rows: [{ name: '../../.env.local', exitCode: 0, durationMs: 1 }] }, [], { sha, runId: '42' }));
  assert.throws(() => safeEvidence({ status: 'FAILED', rows: [{ name: 'private-password-value', exitCode: 1, durationMs: 1 }] }, [], { sha, runId: '42' }));
});

test('workflow guard consumes YAML structure and rejects changed deployment trust or unsafe artifact boundaries', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8'); const release = await readFile('.github/workflows/release.yml', 'utf8');
  assert.deepEqual(validateWorkflows(ci, release), []);
  assert.ok(validateWorkflows(ci.replace('npx --no-install playwright install --with-deps chromium', 'echo missing browser engine'), release).some(issue => issue.includes('isolated')));
  for (const minutes of [30, 90, 119, 121, 360, 120.5]) assert.ok(validateWorkflows(ci.replace('timeout-minutes: 120', `timeout-minutes: ${minutes}`), release).some(issue => issue.includes('isolated')));
  assert.ok(validateWorkflows(ci.replace('path: .local/cicd-safe/', 'path: .local/'), release).some(issue => issue.includes('artifact')));
  assert.ok(validateWorkflows(ci, release.replace('cancel-in-progress: false', 'cancel-in-progress: true')).some(issue => issue.includes('release concurrency')));
  assert.ok(validateWorkflows(ci, release.replace("github.ref == 'refs/heads/main'", "github.ref != 'refs/heads/main'")).some(issue => issue.includes('main')));
  const triggerYaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):Record<string,unknown>;dump(value:unknown):string};
  const privileged=triggerYaml.load(ci);privileged.on={pull_request_target:null};
  assert.ok(validateWorkflows(triggerYaml.dump(privileged), release).some(issue => issue.includes('Privileged')));
  assert.ok(validateWorkflows(ci, release.replace('needs: release-admission', 'needs: other-job')).some(issue => issue.includes('admission')));
  assert.ok(validateWorkflows(ci, release.replace('name: ${{ needs.release-admission.outputs.environment }}', 'name: unprotected')).some(issue => issue.includes('environment')));
  assert.ok(validateWorkflows(ci, release.replace('full_verification_run_id:', 'removed_full_run_id:')).some(issue => issue.includes('separate')));
  assert.ok(validateWorkflows(ci, release.replace("github.event_name == 'workflow_dispatch'", "github.event_name == 'workflow_run'")).some(issue => issue.includes('main')));
  assert.ok(validateWorkflows(ci, release.replace('id: context', 'id: unvalidated')).some(issue => issue.includes('context')));
  assert.ok(validateWorkflows(ci, release.replace('RELEASE_SHA: ${{ needs.release-admission.outputs.sha }}', 'RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}')).some(issue => issue.includes('validated')));
  assert.ok(validateWorkflows(ci, release.replace('ref: ${{ needs.release-admission.outputs.sha }}', 'ref: main')).some(issue => issue.includes('checkout')));
  assert.ok(validateWorkflows(ci, release.replaceAll('run: node --import tsx scripts/verification/cicd-release.ts ci', 'run: node --import tsx scripts/verification/cicd-release.ts ci-omitted')).some(issue => issue.includes('current main')));
  assert.ok(validateWorkflows(ci, release + '\n      - uses: actions/download-artifact@' + 'a'.repeat(40) + '\n        with: { path: .vercel/output }\n').some(issue => issue.includes('artifacts')));
  assert.ok(validateWorkflows(ci, release + '\n      - run: echo ${{ github.event.workflow_run.head_branch }}\n').some(issue => issue.includes('shell')));
  assert.ok(validateWorkflows(ci, release + '\n      - uses: actions/checkout@' + 'a'.repeat(40) + '\n        with: { persist-credentials: false, ref: untrusted }\n').some(issue => issue.includes('checkout')));
  for(const field of ['REVIEW_BASE64','REVIEW_DIGEST','RELEASE_ENVIRONMENT_ID','CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON'])assert.ok(validateWorkflows(ci,release.replaceAll(field,`OMITTED_${field}`)).length>0,`${field} must remain admitted at every boundary`);
  assert.ok(validateWorkflows(ci,release.replace('run: node --import tsx scripts/verification/cicd-release.ts approval','run: node --import tsx scripts/verification/cicd-release.ts approval-omitted')).some(issue=>issue.includes('approval')));
  assert.ok(validateWorkflows(ci,release.replace('review-base64: ${{ steps.review.outputs.review-base64 }}','review-base64: unverified')).some(issue=>issue.includes('outputs')));
  for (const field of ['BACKEND_SELECTION_BASE64','BACKEND_MANIFEST_BASE64','BACKEND_BRIDGE_BASE64']) assert.ok(validateWorkflows(ci, release.replaceAll(field, `OMITTED_${field}`)).some(issue => issue.includes('backend') || issue.includes('Backend')));
  assert.ok(validateWorkflows(ci, release.replace('path: .local/cicd-release/web-deployment-result.json','path: .local/cicd-release/')).some(issue => issue.includes('artifact')));
  const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):{jobs:{'web-release':{steps:Record<string,unknown>[]}}};dump(value:unknown):string};
  const altered=yaml.load(release);altered.jobs['web-release'].steps.splice(3,0,{name:'Unexpected direct upload',env:{VERCEL_TOKEN:'${{ secrets.VERCEL_TOKEN }}'},run:'vercel deploy --prebuilt --yes --prod'});
  assert.ok(validateWorkflows(ci,yaml.dump(altered)).length>0,'A direct credential consumer must not bypass the release owner or approval');
  const inherited=yaml.load(release) as {jobs:{'web-release':{steps:Record<string,unknown>[];env?:Record<string,string>}}};inherited.jobs['web-release'].env={VERCEL_TOKEN:'${{ secrets.VERCEL_TOKEN }}'};inherited.jobs['web-release'].steps.unshift({run:'node unreviewed-action.js'});assert.ok(validateWorkflows(ci,yaml.dump(inherited)).some(issue=>issue.includes('job-level')));
});

test('CI selects one PR run per branch change while preserving main-push release evidence and manual verification', async () => {
  const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):Record<string,unknown>};
  const workflow=yaml.load(await readFile('.github/workflows/ci.yml','utf8'));
  assert.deepEqual(workflow.on,{push:{branches:['main']},pull_request:null,workflow_dispatch:null});
});

test('workflow guard rejects duplicate branch-push CI, missing release/PR events and unsupported filtered events', async () => {
  const ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
  const yaml=createRequire(import.meta.url)('js-yaml') as {load(text:string):Record<string,unknown>;dump(value:unknown):string};
  for(const trigger of [
    ['push','pull_request','workflow_dispatch'],
    {push:null,pull_request:null,workflow_dispatch:null},
    {push:{branches:['main','codex/**']},pull_request:null,workflow_dispatch:null},
    {push:{branches:['main'],tags:['*']},pull_request:null,workflow_dispatch:null},
    {push:{branches:['main'],paths:['apps/web/**']},pull_request:null,workflow_dispatch:null},
    {push:{branches:['feature']},pull_request:null,workflow_dispatch:null},
    {push:{branches:['main']},workflow_dispatch:null},
    {pull_request:null,workflow_dispatch:null},
    {push:{branches:['main']},pull_request:null},
    {push:{branches:['main']},pull_request:{paths:['apps/web/**']},workflow_dispatch:null},
    {push:{branches:['main']},pull_request:{types:['opened']},workflow_dispatch:null},
    {push:{branches:['main']},pull_request:null,workflow_dispatch:null,schedule:[{cron:'17 0 * * *'}]},
  ]) {
    const altered=yaml.load(ci);altered.on=trigger;
    assert.ok(validateWorkflows(yaml.dump(altered),release).some(issue=>issue.includes('without duplicate feature-branch pushes')),JSON.stringify(trigger));
  }
});
test('web and API automatic Git builds cannot bypass reviewed Actions deployment', async () => {
  for (const owner of ['web', 'api']) {
    const config = JSON.parse(await readFile(`apps/${owner}/vercel.json`, 'utf8'));
    assert.equal(config.git.deploymentEnabled, false);
  }
});
test('web release uses only the scoped metadata credential before approval and keeps provider credentials gated',async()=>{
 const ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
 const updated=release.replaceAll('GH_TOKEN: ${{ github.token }}','GH_TOKEN: ${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}');
 assert.deepEqual(validateWorkflows(ci,updated),[]);
 assert.ok(validateWorkflows(ci,updated.replace('GH_TOKEN: ${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}','GH_TOKEN: ${{ secrets.VERCEL_TOKEN }}')).length>0);
 assert.ok(validateWorkflows(ci,updated.replace('CUEVO_RELEASE_REVIEW_INPUT_JSON: ${{ vars.CUEVO_RELEASE_REVIEW_INPUT_JSON }}','CUEVO_RELEASE_REVIEW_INPUT_JSON: ${{ secrets.VERCEL_TOKEN }}')).length>0);
 assert.ok(validateWorkflows(ci,updated.replaceAll('GH_TOKEN: ${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}','GH_TOKEN: ${{ github.token }}')).length>0,'Default workflow token does not attest administration metadata permissions');
});

test('required CI includes a secret-free full-history scanner with strict success aggregation', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8'); const release = await readFile('.github/workflows/release.yml', 'utf8');
  const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): { jobs: Record<string, { steps: Record<string, unknown>[] }> }; dump(value: unknown): string };
  const shallowSecret = yaml.load(ci); const secretCheckout = shallowSecret.jobs['secret-scan'].steps.find(step => String(step.uses ?? '').startsWith('actions/checkout@'))!; (secretCheckout.with as Record<string, unknown>)['fetch-depth'] = 1;
  const missingSecret = yaml.load(ci); (missingSecret.jobs.required as { needs?: string[] }).needs = ((missingSecret.jobs.required as { needs?: string[] }).needs ?? []).filter(name => name !== 'secret-scan');
  assert.match(ci, /secret-scan:/);
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /node --import tsx scripts\/verification\/secret-scan.ts/);
  for (const changed of [
    yaml.dump(shallowSecret),
    ci.replace('node --import tsx scripts/verification/secret-scan.ts', 'echo scan-omitted'),
    yaml.dump(missingSecret),
    ci.replace('SECRET_SCAN: ${{ needs.secret-scan.result }}', 'SECRET_SCAN: success'),
    ci.replace('|| [ "$SECRET_SCAN" != success ]', ''),
  ]) { assert.notEqual(changed, ci, 'Each negative fixture must actually mutate the workflow.'); assert.ok(validateWorkflows(changed, release).some(issue => issue.includes('secret'))); }
});

test('source contracts are mandatory in the required aggregate without a substitute success value',async()=>{
 const ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
 const yaml=createRequire(import.meta.url)('js-yaml')as{load(text:string):{jobs:Record<string,{needs:string[]}>};dump(value:unknown):string},missing=yaml.load(ci);missing.jobs.required.needs=missing.jobs.required.needs.filter(name=>name!=='source-contracts');
 for(const changed of[
  yaml.dump(missing),
  ci.replace('SOURCE_CONTRACTS: ${{ needs.source-contracts.result }}','SOURCE_CONTRACTS: success'),
  ci.replace(' || [ "$SOURCE_CONTRACTS" != success ]',''),
 ]){assert.notEqual(changed,ci,'Each negative fixture must actually mutate the workflow.');assert.ok(validateWorkflows(changed,release).some(issue=>issue.includes('source contracts')));}
});

test('fast source-contract and technical verification require one unconditional complete-history checkout for canonical migration source checks', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8'), release = await readFile('.github/workflows/release.yml', 'utf8');
  const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): { jobs: Record<string, { steps: Record<string, unknown>[] }> }; dump(value: unknown): string };
  for (const owner of ['fast-checks','source-contracts','technical-mvp']) {
    const current = yaml.load(ci), checkout = current.jobs[owner].steps.find(step => String(step.uses ?? '').startsWith('actions/checkout@'))!;
    assert.equal((checkout.with as Record<string, unknown>)['fetch-depth'], 0, `${owner} must acquire complete history before source guards run`);
    for (const mutate of [
      (step: Record<string, unknown>) => { (step.with as Record<string, unknown>)['fetch-depth'] = 1; },
      (step: Record<string, unknown>) => { delete (step.with as Record<string, unknown>)['fetch-depth']; },
      (step: Record<string, unknown>) => { (step.with as Record<string, unknown>)['fetch-depth'] = '0'; },
      (step: Record<string, unknown>) => { step.if = 'false'; },
      (step: Record<string, unknown>) => { step['continue-on-error'] = true; },
    ]) {
      const changed = yaml.load(ci), step = changed.jobs[owner].steps.find(row => String(row.uses ?? '').startsWith('actions/checkout@'))!;
      mutate(step); assert.ok(validateWorkflows(yaml.dump(changed), release).some(issue => issue.includes(owner) && issue.includes('history')));
    }
    const duplicate = yaml.load(ci), duplicateStep = duplicate.jobs[owner].steps.find(step => String(step.uses ?? '').startsWith('actions/checkout@'))!;
    duplicate.jobs[owner].steps.unshift(structuredClone(duplicateStep)); assert.ok(validateWorkflows(yaml.dump(duplicate), release).some(issue => issue.includes(owner) && issue.includes('history')));
    const absent = yaml.load(ci); absent.jobs[owner].steps = absent.jobs[owner].steps.filter(step => !String(step.uses ?? '').startsWith('actions/checkout@')); assert.ok(validateWorkflows(yaml.dump(absent), release).some(issue => issue.includes(owner) && issue.includes('history')));
  }
});

test('provider Data API posture remains distinct from endpoint denials and rejects missing or relabeled evidence',async()=>{const owner=await import('./data-api-configuration'),at=new Date().toISOString(),source='a'.repeat(40),tree='b'.repeat(40),project='abcdefghijklmnopqrst',evidence={version:1,purpose:'CUEVO_DATA_API_CONFIGURATION_OBSERVATION',source:'SUPABASE_MANAGEMENT_POSTGREST_CONFIG',projectRef:project,sourceSha:source,treeSha:tree,url:`https://api.supabase.com/v1/projects/${project}/postgrest`,configurationState:'DISABLED',configurationValueSha256:(await import('node:crypto')).createHash('sha256').update(JSON.stringify('')).digest('hex'),metadataBasis:'SUPPLIED_CURRENT_METADATA_PORT',metadataObservedAt:at,observedAt:at,verifiedAt:at,expiresAt:new Date(Date.parse(at)+3600000).toISOString(),effectAuthority:false,hostedAcceptance:false};assert.equal(owner.validateDisabledDataApiConfigurationEvidence(evidence,{projectRef:project,sourceSha:source,treeSha:tree,now:Date.parse(at)}).basis,'SUPABASE_MANAGEMENT_POSTGREST_CONFIG');assert.throws(()=>owner.validateDisabledDataApiConfigurationEvidence({anonymousRestDenied:true,authenticatedRestDenied:true,serviceRestDenied:true},{projectRef:project,sourceSha:source,treeSha:tree,now:Date.parse(at)}));});

test('integration partition artifacts and complete aggregate retain exact release evidence and reject broad paths',async()=>{
 const ci=await readFile('.github/workflows/ci.yml','utf8'),release=await readFile('.github/workflows/release.yml','utf8');
 assert.deepEqual(validateWorkflows(ci,release),[]);
 for(const path of ['.local/integration-partitions/integration-learning/result.json','.local/integration-partitions/integration-state/result.json','.local/runtime-aggregate/result.json'])assert.ok(validateWorkflows(ci.replace('path: '+path,'path: .local/'),release).some(issue=>issue.includes('artifact')));
 const parse=createRequire(import.meta.url)('js-yaml') as{load(text:string):{jobs:Record<string,Record<string,unknown>>};dump(value:unknown):string};
 const changed=parse.load(ci);const aggregate=changed.jobs['technical-mvp'];aggregate.needs=['database-checks','runtime-backend','runtime-browser'];assert.ok(validateWorkflows(parse.dump(changed),release).some(issue=>issue.includes('isolated')));
});
