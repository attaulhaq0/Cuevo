import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fullVerificationSummary } from './full-verification-evidence';
import * as fullEvidenceOwner from './full-verification-evidence';
import { verificationSteps } from './steps';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sourceSha = 'a'.repeat(40), treeSha = 'b'.repeat(40), before = [{ path: 'source.ts', sha256: 'c'.repeat(64) }];
const env = { GITHUB_SHA: sourceSha, GITHUB_WORKFLOW_SHA: sourceSha, GITHUB_REF: 'refs/heads/main', GITHUB_JOB: 'technical-mvp', GITHUB_ACTIONS: 'true', CI: 'true', GITHUB_REPOSITORY: 'owner/repo', GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/full-regression.yml@refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', CUEVO_FULL_VERIFICATION_PURPOSE: 'customer-candidate', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' };
const input = () => ({ env: { ...env }, sourceSha, treeSha, before, after: structuredClone(before), evidence: { status: 'VERIFIED', rows: [...verificationSteps.map(step => ({ name: step.name, exitCode: 0, required: true as const, durationMs: 1 })), { name: 'source-freeze', exitCode: 0, required: true as const, durationMs: 1 }] } });
function diagnosticOwner(value:unknown){assert.equal(typeof fullEvidenceOwner.fullVerificationDiagnostic,'function','full owner must export failed-run diagnostics');return fullEvidenceOwner.fullVerificationDiagnostic(value);}
test('full source receipt distinguishes scheduled regression from an explicit customer candidate', () => {
  assert.equal(fullVerificationSummary(input()).profile, 'CUSTOMER_CANDIDATE');
  assert.equal(fullVerificationSummary({ ...input(), env: { ...env, GITHUB_EVENT_NAME: 'schedule', CUEVO_FULL_VERIFICATION_PURPOSE: 'regression' } }).profile, 'FULL_REGRESSION');
  assert.throws(() => fullVerificationSummary({ ...input(), env: { ...env, GITHUB_EVENT_NAME: 'schedule' } }));
});
test('missing checks source drift routine evidence and wrong run context cannot produce full acceptance', () => {
  const missing = input(); missing.evidence.rows.pop(); assert.throws(() => fullVerificationSummary(missing));
  const failed = input(); failed.evidence.rows[0].exitCode = 1; assert.throws(() => fullVerificationSummary(failed));
  assert.throws(() => fullVerificationSummary({ ...input(), after: [] }));
  assert.throws(() => fullVerificationSummary({ ...input(), env: { ...env, GITHUB_REF: 'refs/heads/other' } }));
  assert.throws(() => fullVerificationSummary({ ...input(), evidence: { status: 'ROUTINE_VERIFIED', rows: [] } }));
});

test('full receipt refuses unknown private fields before projecting any source evidence', () => {
  const raw = input();
  assert.throws(() => fullVerificationSummary({ ...raw, evidence: { ...raw.evidence, privateDiagnostic: 'private-canary' } }));
  assert.throws(() => fullVerificationSummary({ ...raw, evidence: { ...raw.evidence, rows: [{ ...raw.evidence.rows[0], privateDiagnostic: 'private-canary' }, ...raw.evidence.rows.slice(1)] } }));
  assert.throws(() => fullVerificationSummary({ ...raw, privateDiagnostic:'private-canary' } as typeof raw));
});

test('full candidate receipt declares its fixture scope and separate acceptance windows without claiming customer acceptance', () => {
  const summary=fullVerificationSummary(input()) as unknown as { technicalAcceptanceScope?:{version:number;hostedAcceptance:boolean;customerAcceptance:boolean;separateBrowserWindows:unknown[];separateIntegrationWindows:unknown[]};technicalAcceptanceScopeSha256?:string };
  assert.ok(summary.technicalAcceptanceScope);
  assert.equal(summary.technicalAcceptanceScope.version,1);
  assert.equal(summary.technicalAcceptanceScope.hostedAcceptance,false);assert.equal(summary.technicalAcceptanceScope.customerAcceptance,false);
  assert.equal(summary.technicalAcceptanceScope.separateBrowserWindows.length,18);assert.equal(summary.technicalAcceptanceScope.separateIntegrationWindows.length,1);
  assert.match(summary.technicalAcceptanceScopeSha256??'',/^[a-f0-9]{64}$/);
});

test('failed and cancelled full phases retain bounded diagnostics without producing customer acceptance', () => {
  const raw=input(),failed={...raw,evidence:{status:'NOT_VERIFIED',rows:raw.evidence.rows.map((row,index)=>({...row,exitCode:index===0?1:index===1?null:0}))},acceptanceOutcome:'failure' as const};
  const diagnostic=diagnosticOwner(failed);
  assert.equal(diagnostic.purpose,'CUEVO_FULL_VERIFICATION_DIAGNOSTIC');
  assert.equal(diagnostic.status,'FAILED');assert.equal(diagnostic.phases[0].status,'FAILED');assert.equal(diagnostic.phases[1].status,'UNCONFIRMED');
  assert.equal(diagnostic.effectAuthority,false);assert.equal(diagnostic.hostedAcceptance,false);assert.equal(diagnostic.customerAcceptance,false);
  const unstarted=diagnosticOwner({...failed,evidence:{...failed.evidence,rows:failed.evidence.rows.map((row,index)=>index===1?{...row,durationMs:null}:row)}});assert.equal(unstarted.phases[1].durationMs,null);
  assert.throws(()=>fullVerificationSummary(failed));
  const cancelled=diagnosticOwner({...failed,acceptanceOutcome:'cancelled',after:null});
  assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.sourceUnchanged,null);assert.equal(cancelled.finalSourceSha256,null);
  assert.equal(cancelled.phases.find(row=>row.name==='demo-seed-restore')!.status,'PASSED');
});

test('diagnostic source drift remains explicit and unsafe fields or execution context cannot be exported', () => {
  const raw=input(),request={...raw,acceptanceOutcome:'failure' as const};
  const drift=diagnosticOwner({...request,after:[{...before[0],sha256:'d'.repeat(64)}]});
  assert.equal(drift.sourceUnchanged,false);assert.notEqual(drift.initialSourceSha256,drift.finalSourceSha256);
  const text=JSON.stringify(drift);assert.doesNotMatch(text,/source\.ts|private-canary/);
  assert.throws(()=>diagnosticOwner({...request,privateDiagnostic:'private-canary'}));
  assert.throws(()=>diagnosticOwner({...request,evidence:{...raw.evidence,privateDiagnostic:'private-canary'}}));
  assert.throws(()=>diagnosticOwner({...request,evidence:{...raw.evidence,rows:raw.evidence.rows.slice(1)}}));
  assert.throws(()=>diagnosticOwner({...request,evidence:{...raw.evidence,rows:[{...raw.evidence.rows[0],privateDiagnostic:'private-canary'},...raw.evidence.rows.slice(1)]}}));
  assert.throws(()=>diagnosticOwner({...request,env:{...env,GITHUB_JOB:'foreign'}}));
  assert.throws(()=>diagnosticOwner({...request,env:{...env,GITHUB_EVENT_NAME:'schedule'}}));
  assert.throws(()=>diagnosticOwner({...request,acceptanceOutcome:'success',after:null}));
});

test('actual full exporter keeps failed cancelled and dirty receipts separate from the success artifact',async()=>{
  const tempRoot=resolve(tmpdir()),root=await mkdtemp(join(tempRoot,'cuevo-full-diagnostic-')),owner=resolve('scripts/verification/full-verification-evidence.ts'),loader=pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href;
  const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();
  try{
    await writeFile(join(root,'.gitignore'),'.local/\n');await writeFile(join(root,'source.txt'),'Original source\n');git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Diagnostic fixture');
    const current=git('rev-parse','HEAD'),manifest=[{path:'source.txt',sha256:createHash('sha256').update('Original source\n').digest('hex')}],folder='.local/verification/2026-10-10T00-00-00-000Z',directory=join(root,folder),context={version:1,purpose:'CUEVO_FULL_VERIFICATION_INVOCATION',profile:'full',repository:'owner/repo',sourceSha:current,treeSha:git('rev-parse','HEAD^{tree}'),workflowSha:current,workflowRef:'owner/repo/.github/workflows/full-regression.yml@refs/heads/main',ref:'refs/heads/main',event:'workflow_dispatch',job:'technical-mvp',runId:'42',runAttempt:1,verificationPurpose:'customer-candidate',verificationRunId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',directory:folder,startedAtMs:Date.parse('2026-10-10T00:00:00Z'),sourceDigest:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};await mkdir(directory,{recursive:true});await writeFile(join(directory,'context.json'),JSON.stringify(context));await writeFile(join(root,'.local/full-verification-input.json'),JSON.stringify(context));
    const run=async(outcome:'success'|'failure'|'cancelled',final:unknown,dirty=false)=>{
      const raw=input().evidence; if(outcome!=='success'){raw.status='NOT_VERIFIED';raw.rows[0].exitCode=1;raw.rows[1].exitCode=null as unknown as number;}
      await writeFile(join(directory,'evidence.json'),JSON.stringify(raw));await writeFile(join(directory,'source.json'),JSON.stringify(manifest));
      if(final!==null)await writeFile(join(directory,'source-final.json'),JSON.stringify(final));else await rm(join(directory,'source-final.json'),{force:true});
      if(dirty)await writeFile(join(root,'source.txt'),'Changed source\n');
      const result=spawnSync(process.execPath,['--import',loader,owner],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,...env,GITHUB_SHA:current,GITHUB_WORKFLOW_SHA:current,CUEVO_FULL_ACCEPTANCE_OUTCOME:outcome}}),output=join(root,'.local/full-verification');
      assert.equal(result.status,outcome==='success'?0:1,result.stderr);assert.equal(result.stdout.includes('CUEVO_FULL_VERIFICATION_DIAGNOSTIC')||outcome==='success',true,result.stderr);
      const diagnostic=JSON.parse(await readFile(join(output,'diagnostic.json'),'utf8'));assert.equal(diagnostic.runId,'42');assert.equal(diagnostic.runAttempt,1);assert.equal(diagnostic.sourceSha,current);
      if(outcome==='success')assert.equal(JSON.parse(await readFile(join(output,'summary.json'),'utf8')).evidence.status,'VERIFIED');else await assert.rejects(readFile(join(output,'summary.json'),'utf8'),{code:'ENOENT'});
      assert.doesNotMatch(JSON.stringify(diagnostic),/source\.txt|private-canary/);
      await rm(output,{recursive:true,force:true});return diagnostic;
    };
    assert.equal((await run('success',manifest)).status,'COMPLETED');
    assert.equal((await run('failure',manifest)).status,'FAILED');
    assert.equal((await run('cancelled',null)).sourceUnchanged,null);
    assert.equal((await run('failure',[{...manifest[0],sha256:'d'.repeat(64)}],true)).sourceUnchanged,false);
    await writeFile(join(root,'.local/full-verification-input.json'),JSON.stringify({...context,verificationPurpose:'regression'}));await writeFile(join(directory,'context.json'),JSON.stringify({...context,verificationPurpose:'regression'}));
    const relabeled=spawnSync(process.execPath,['--import',loader,owner],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,...env,GITHUB_SHA:current,GITHUB_WORKFLOW_SHA:current,CUEVO_FULL_ACCEPTANCE_OUTCOME:'failure'}});assert.equal(relabeled.status,1);await assert.rejects(readFile(join(root,'.local/full-verification/diagnostic.json'),'utf8'),{code:'ENOENT'});
    await writeFile(join(directory,'context.json'),JSON.stringify(context));
    await writeFile(join(root,'.local/full-verification-input.json'),JSON.stringify({...context,runAttempt:2}));
    const wrongAttempt=spawnSync(process.execPath,['--import',loader,owner],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,...env,GITHUB_SHA:current,GITHUB_WORKFLOW_SHA:current,CUEVO_FULL_ACCEPTANCE_OUTCOME:'failure'}});assert.equal(wrongAttempt.status,1);await assert.rejects(readFile(join(root,'.local/full-verification/diagnostic.json'),'utf8'),{code:'ENOENT'});
    await rm(join(root,'.local/full-verification-input.json'));const missing=spawnSync(process.execPath,['--import',loader,owner],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,...env,GITHUB_SHA:current,GITHUB_WORKFLOW_SHA:current,CUEVO_FULL_ACCEPTANCE_OUTCOME:'failure'}});assert.equal(missing.status,1);await assert.rejects(readFile(join(root,'.local/full-verification/diagnostic.json'),'utf8'),{code:'ENOENT'});
  }finally{assert.ok(root.startsWith(tempRoot+'\\')||root.startsWith(tempRoot+'/'));await rm(root,{recursive:true,force:true});}
});

test('full producer initializes unknown durations and binds original invocation before any phase',async()=>{
  const text=await readFile('scripts/verification/technical-exit.ts','utf8');
  assert.match(text,/initialFullVerificationRows\(\)/);assert.match(text,/writeFile\(resolve\(directory,'context\.json'\).*flag:'wx'/);assert.match(text,/writeFile\(resolve\('\.local\/full-verification-input\.json'\).*flag:'wx'/);
  assert.ok(text.indexOf('full-verification-input.json')<text.indexOf('const persist='));
  const rows=fullEvidenceOwner.initialFullVerificationRows();assert.equal(rows.length,verificationSteps.length+1);assert.ok(rows.every(row=>row.exitCode===null&&row.durationMs===null&&row.required===true));
});
