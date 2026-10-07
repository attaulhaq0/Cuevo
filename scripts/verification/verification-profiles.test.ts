import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { verificationSteps } from './steps';
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'verification-profiles.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.readVerificationProfile, 'function', 'explicit routine verification profile exists');
  return subject as typeof import('./verification-profiles');
}
test('technical verification remains full by default and accepts only one explicitly recognized profile argument', async () => {
  const { readVerificationProfile } = await api();
  assert.equal(readVerificationProfile([]), 'full'); assert.equal(readVerificationProfile(['--profile=full']), 'full'); assert.equal(readVerificationProfile(['--profile=routine']), 'routine');
  for (const args of [['routine'], ['--profile=fast'], ['--profile=routine', '--profile=full'], ['--skip=database'], ['--profile', 'routine']]) assert.throws(() => readVerificationProfile(args));
});
test('routine evidence cannot become the original full verification status or contain fabricated skipped full rows', async () => {
  const { verificationEvidence, verificationProfileSteps } = await api();
  const full = verificationProfileSteps('full'); assert.equal(full, verificationSteps);
  const routine = verificationProfileSteps('routine'), names: string[] = routine.map(step => step.name);
  assert.ok(names.includes('clean-bootstrap')); assert.ok(names.includes('database')); assert.ok(names.includes('critical-integration')); assert.ok(names.includes('critical-browser')); assert.equal(names.at(-1), 'demo-seed-restore');
  assert.ok(names.includes('edge-runtime'));
  for (const excluded of ['lint', 'typecheck', 'unit', 'web-unit', 'repository', 'runtime-outage', 'recovery', 'browser-compatibility', 'browser']) assert.ok(!names.includes(excluded));
  const rows = [...routine.map(step => ({ name: step.name, exitCode: 0, required: true, durationMs: 1 })), { name: 'source-freeze', exitCode: 0, required: true, durationMs: 1 }];
  assert.equal(verificationEvidence('routine', rows).status, 'ROUTINE_VERIFIED');
  assert.equal(verificationEvidence('routine', rows.map((row, index) => index === 0 ? { ...row, exitCode: null } : row)).status, 'ROUTINE_NOT_VERIFIED');
  assert.equal(verificationEvidence('routine', rows.map((row, index) => index === 0 ? { ...row, exitCode: 1 } : row)).status, 'ROUTINE_FAILED');
  assert.throws(() => verificationEvidence('routine', [...rows, { name: 'browser', exitCode: null, required: true, durationMs: 0 }]));
  const completeRows = [...full.map(step => ({ name: step.name, exitCode: 0, required: true, durationMs: 1 })), { name: 'source-freeze', exitCode: 0, required: true, durationMs: 1 }];
  assert.equal(verificationEvidence('full', completeRows).status, 'VERIFIED'); assert.equal(Object.hasOwn(verificationEvidence('full', completeRows), 'profile'), false);
});

test('profile evidence refuses raw diagnostics unknown fields and invalid timing before safe upload', async () => {
  const { verificationEvidence, verificationProfileSteps } = await api();
  const rows = [...verificationProfileSteps('routine').map(step=>({ name:step.name,exitCode:0,required:true,durationMs:1 })),{ name:'source-freeze',exitCode:0,required:true,durationMs:1 }];
  assert.throws(()=>verificationEvidence('routine', [{ ...rows[0], error:'private-raw-diagnostic-canary' },...rows.slice(1)] as typeof rows));
  assert.throws(()=>verificationEvidence('routine', [{ ...rows[0], durationMs:-1 },...rows.slice(1)]));
});
test('CI scope stays conservative for unknown sensitive mixed or selector source and adds explicit affected web owners', async () => {
  const { classifyRuntimeChanges, verificationProfileSteps, verificationEvidence } = await api();
  assert.equal(classifyRuntimeChanges(['apps/web/features/learning/components/task.css'], true).profile, 'routine');
  assert.ok(classifyRuntimeChanges(['apps/web/features/learning/components/task.css'], true).browserFiles.includes('learning-content-lifecycle.spec.ts'));
  assert.equal(classifyRuntimeChanges(['apps/web/features/learning/components/task.css'], false).profile, 'full-runtime');
  assert.equal(classifyRuntimeChanges(['apps/web/features/learning/components/task.tsx'], true).profile, 'routine');
  for (const files of [['supabase/migrations/example.sql'], ['apps/web/shared/query.ts'], ['apps/web/features/auth/provider.ts'], ['apps/web/features/learning/server/operation.ts'], ['apps/web/features/learning/model.ts'], ['apps/web/features/learning/api.ts'], ['apps/api/src/modules/academic/academic.ts'], ['apps/worker/src/jobs/process.ts'], ['scripts/verification/verification-profiles.ts'], ['.github/workflows/ci.yml'], ['package-lock.json'], ['unknown/path.ts']]) assert.equal(classifyRuntimeChanges(files, true).profile, 'full-runtime');
  const mixed = classifyRuntimeChanges(['apps/web/features/learning/components/task.tsx', 'apps/web/features/community/components/post.tsx'], true);
  assert.equal(mixed.profile, 'routine'); assert.ok(mixed.browserFiles.includes('learning-content-lifecycle.spec.ts')); assert.ok(mixed.browserFiles.includes('community-safety.spec.ts'));
  const runtimeNames: string[] = verificationProfileSteps('full-runtime').map(step => step.name);
  for (const omitted of ['repository', 'repository-fixtures', 'architecture', 'architecture-fixtures', 'docs', 'docs-fixtures', 'cicd', 'cicd-fixtures', 'lint', 'typecheck', 'unit', 'web-unit', 'dependency-security']) assert.ok(!runtimeNames.includes(omitted));
  assert.ok(runtimeNames.includes('runtime-outage')); assert.ok(runtimeNames.includes('critical-browser')); assert.ok(runtimeNames.includes('recovery'));
  assert.equal(runtimeNames.includes('browser'), false); assert.equal(runtimeNames.includes('browser-compatibility'), false);
  const rows = [...verificationProfileSteps('full-runtime').map(step => ({ name: step.name, exitCode: 0, required: true })), { name: 'source-freeze', exitCode: 0, required: true }];
  assert.equal(verificationEvidence('full-runtime', rows).status, 'FULL_RUNTIME_VERIFIED');
});
test('CI runtime narrowing binds the actual main diff and identical immutable baseline selector before considering owner paths', async () => {
  const { readCiRuntimeSelection } = await api();
  const root=await mkdtemp(join(tmpdir(),'cuevo-profile-')),original=process.cwd();
  try {
    const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    await mkdir(join(root,'scripts/verification'),{recursive:true});await mkdir(join(root,'apps/web/features/learning'),{recursive:true});
    await writeFile(join(root,'scripts/verification/verification-profiles.ts'),'immutable owner policy\n');await writeFile(join(root,'apps/web/features/learning/view.css'),'old view\n');
    git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','base');const base=git('rev-parse','HEAD');
    await writeFile(join(root,'apps/web/features/learning/view.css'),'new view\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','view');const head=git('rev-parse','HEAD'),event=join(root,'event.json');
    await writeFile(event,JSON.stringify({before:base,after:head,ref:'refs/heads/main'}));process.chdir(root);
    const env={...process.env,CI:'true',GITHUB_ACTIONS:'true',GITHUB_SHA:head,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_EVENT_PATH:event};
    const selected=await readCiRuntimeSelection(env);assert.equal(selected.profile,'main-staging');assert.ok(selected.browserFiles.includes('learning-content-lifecycle.spec.ts'));assert.equal((await readCiRuntimeSelection({...env,GITHUB_SHA:'b'.repeat(40)})).profile,'main-staging');
    await writeFile(join(root,'scripts/verification/verification-profiles.ts'),'changed selector\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','policy');const changed=git('rev-parse','HEAD');await writeFile(event,JSON.stringify({before:base,after:changed,ref:'refs/heads/main'}));
    assert.equal((await readCiRuntimeSelection({...env,GITHUB_SHA:changed})).profile,'main-staging');
  } finally {process.chdir(original);await rm(root,{recursive:true,force:true});}
});
test('main staging repeats exact backend security and core browser while full matrix remains an explicit acceptance profile', async () => {
  const { verificationProfileSteps, verificationEvidence } = await api();
  const steps = verificationProfileSteps('main-staging'), names: string[] = steps.map(step => step.name);
  for (const required of ['clean-bootstrap','build','api-runtime-artifact','edge-runtime-artifact','browser-secrets','database','integration','edge-runtime','critical-browser','demo-seed-restore']) assert.ok(names.includes(required));
  for (const excluded of ['runtime-outage','recovery','browser','browser-compatibility','unit','typecheck','lint']) assert.ok(!names.includes(excluded));
  const rows=[...steps.map(step=>({name:step.name,exitCode:0,required:true})),{name:'source-freeze',exitCode:0,required:true}];
  assert.equal(verificationEvidence('main-staging',rows).status,'MAIN_STAGING_VERIFIED');
});
test('critical API and browser discovery are explicit source-owned files and never silently broaden or skip missing cases', async () => {
  const { criticalIntegrationFiles, criticalBrowserFiles, integrationArguments } = await api();
  assert.ok(criticalIntegrationFiles.includes('apps/api/test/integration/learning-lifecycle-api.test.ts')); assert.ok(criticalIntegrationFiles.includes('apps/api/test/integration/realtime-authorization-api.test.ts')); assert.ok(criticalIntegrationFiles.includes('apps/api/test/integration/customer-adversarial-api.test.ts'));
  assert.ok(criticalBrowserFiles.includes('role-home.spec.ts')); assert.ok(criticalBrowserFiles.includes('foundation.spec.ts')); assert.ok(criticalBrowserFiles.includes('customer-browser-learning-loop.spec.ts')); assert.ok(criticalBrowserFiles.includes('customer-command-scope.spec.ts'));
  assert.equal(new Set(criticalIntegrationFiles).size, criticalIntegrationFiles.length); assert.equal(new Set(criticalBrowserFiles).size, criticalBrowserFiles.length);
  for (const file of criticalIntegrationFiles) assert.ok((await readFile(file, 'utf8')).includes('CUEVO_REQUIRE_INTEGRATION'));
  for (const file of criticalBrowserFiles) assert.doesNotMatch(await readFile(resolve('tests/e2e', file), 'utf8'), /test\.(?:skip|fixme)\(/);
  assert.deepEqual(integrationArguments([]).slice(-1), ['apps/api/test/integration']);
  assert.deepEqual(integrationArguments(['--profile=critical']).slice(-criticalIntegrationFiles.length), criticalIntegrationFiles);
  assert.throws(() => integrationArguments(['--profile=unknown']));
});

test('unknown runtime selection includes every mapped owner and public or policy surfaces cannot narrow it', async () => {
  const { classifyRuntimeChanges, routineBrowserFiles } = await api();
  for(const file of ['apps/web/features/learning/api.ts','apps/web/features/learning/model.ts','apps/web/features/learning/ui.tsx','apps/web/features/learning/server/save.ts','apps/web/features/learning/components/permissions/access.tsx','apps/web/features/auth/components/sign-in.tsx','apps/web/app/learning/page.tsx','packages/contracts/src/learning.ts']) {
    const result=classifyRuntimeChanges([file],true);assert.equal(result.profile,'full-runtime',file);assert.deepEqual(result.browserFiles,routineBrowserFiles);
  }
  assert.deepEqual(classifyRuntimeChanges([],true).browserFiles,routineBrowserFiles);
});
test('critical integration result validation refuses missing files zero tests skipped pending and failed cases', async () => {
  const { criticalIntegrationFiles, validateCriticalIntegrationReport } = await api();
  const report = { success: true, numPendingTests: 0, numFailedTests: 0, testResults: criticalIntegrationFiles.map(file => ({ name: resolve(file), status: 'passed', assertionResults: [{ status: 'passed' }] })) };
  assert.doesNotThrow(() => validateCriticalIntegrationReport(report));
  for (const mutate of [
    (value: typeof report) => { value.testResults.pop(); },
    (value: typeof report) => { value.testResults[0].assertionResults = []; },
    (value: typeof report) => { value.testResults[0].assertionResults[0].status = 'pending'; },
    (value: typeof report) => { value.testResults[0].status = 'failed'; },
    (value: typeof report) => { value.numPendingTests = 1; },
  ]) { const value = structuredClone(report); mutate(value); assert.throws(() => validateCriticalIntegrationReport(value)); }
});
test('critical browser results require every explicit file once with successful unskipped nonretried Chromium tests', async () => {
  const { criticalBrowserFiles, validateCriticalBrowserReport } = await api();
  const report = { stats: { expected: criticalBrowserFiles.length, unexpected: 0, flaky: 0, skipped: 0 }, suites: criticalBrowserFiles.map(file => ({ file, specs: [{ ok: true, tests: [{ projectName: 'critical-chromium', status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed', retry: 0 }] }] }] })) };
  assert.doesNotThrow(() => validateCriticalBrowserReport(report));
  for (const mutate of [
    (value: typeof report) => { value.suites.pop(); },
    (value: typeof report) => { value.stats.skipped = 1; },
    (value: typeof report) => { value.suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    (value: typeof report) => { value.suites[0].specs[0].tests[0].results[0].retry = 1; },
    (value: typeof report) => { value.suites[0].specs[0].tests[0].projectName = 'firefox'; },
  ]) { const value = structuredClone(report); mutate(value); assert.throws(() => validateCriticalBrowserReport(value)); }
});

test('actual PR rename cannot hide a deleted backend owner behind a routine documentation destination', async () => {
  const { readCiRuntimeSelection } = await api();
  const root = await mkdtemp(join(tmpdir(), 'cuevo-profile-rename-')), original = process.cwd();
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
    await mkdir(join(root, 'scripts/verification'), { recursive: true });
    await mkdir(join(root, 'apps/api/src/modules/learning'), { recursive: true });
    await mkdir(join(root, 'apps/web/features/learning'), { recursive: true });
    await writeFile(join(root, 'scripts/verification/verification-profiles.ts'), 'immutable selector\n');
    const backend = join(root, 'apps/api/src/modules/learning/lifecycle.ts'), destination = join(root, 'apps/web/features/learning/lifecycle.md');
    await writeFile(backend, 'export const protectedBackendCommand = true;\n');
    git('init','--quiet'); git('add','.'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','base');
    const base = git('rev-parse','HEAD');
    await writeFile(destination, await readFile(backend)); await rm(backend);
    git('add','.'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','rename');
    const head = git('rev-parse','HEAD'), event = join(root, 'event.json');
    assert.match(git('diff','--name-status',base,head), /^R100/);
    await writeFile(event, JSON.stringify({ pull_request: { base: { sha: base, ref: 'main' }, merge_commit_sha: head } })); process.chdir(root);
    const selected = await readCiRuntimeSelection({ ...process.env, CI:'true', GITHUB_ACTIONS:'true', GITHUB_SHA:head, GITHUB_REF:'refs/pull/1/merge', GITHUB_BASE_REF:'main', GITHUB_EVENT_NAME:'pull_request', GITHUB_EVENT_PATH:event });
    assert.equal(selected.profile, 'full-runtime');
  } finally { process.chdir(original); await rm(root, { recursive:true, force:true }); }
});

test('actual PR narrows existing mapped UI behavior but new source files require broad runtime admission',async()=>{
 const {readCiRuntimeSelection}=await api(),root=await mkdtemp(join(tmpdir(),'cuevo-profile-ui-')),original=process.cwd();
 try{
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  await mkdir(join(root,'scripts/verification'),{recursive:true});await mkdir(join(root,'apps/web/features/learning/components'),{recursive:true});
  await writeFile(join(root,'scripts/verification/verification-profiles.ts'),'immutable selector\n');await writeFile(join(root,'apps/web/features/learning/components/task.tsx'),'export const task=1;\n');
  git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','base');const base=git('rev-parse','HEAD');
  const event=join(root,'event.json');process.chdir(root);
  const select=async()=>{const head=git('rev-parse','HEAD');await writeFile(event,JSON.stringify({pull_request:{base:{sha:base,ref:'main'},merge_commit_sha:head}}));return readCiRuntimeSelection({...process.env,CI:'true',GITHUB_ACTIONS:'true',GITHUB_SHA:head,GITHUB_REF:'refs/pull/1/merge',GITHUB_BASE_REF:'main',GITHUB_EVENT_NAME:'pull_request',GITHUB_EVENT_PATH:event});};
  await writeFile(join(root,'apps/web/features/learning/components/task.tsx'),'export const task=2;\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','UI');
  const focused=await select();assert.equal(focused.profile,'routine');assert.ok(focused.browserFiles.includes('learning-content-lifecycle.spec.ts'));
  await writeFile(join(root,'apps/web/features/learning/components/task.tsx'),"import { actor } from '../../../shared/session/providers';\nexport const task=2;\n");git('add','apps/web/features/learning/components/task.tsx');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','dependency');assert.equal((await select()).profile,'full-runtime');
  await writeFile(join(root,'apps/web/features/learning/components/new.tsx'),'export const newFeature=1;\n');git('add','apps/web/features/learning/components/new.tsx');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','newsource');assert.equal((await select()).profile,'full-runtime');
 }finally{process.chdir(original);await rm(root,{recursive:true,force:true});}
});

test('full integration refuses skipped missing stale or substituted test titles with explicit provider exclusion', async () => {
  const subject = await api();
  assert.equal(typeof subject.validateIntegrationRunReport, 'function');
  const file = resolve('apps/api/test/integration/academic-api.test.ts'), startedAt = Date.now(), finishedAt = startedAt + 1000;
  const inventory = [{ file, name:'native academic > retains numeric zero' }];
  const context = { startedAt, finishedAt, expectedFiles:[file] };
  const report = { success:true, startTime:startedAt, numPendingTests:0, numTodoTests:0, numFailedTests:0, numTotalTests:1, numPassedTests:1, testResults:[{ name:file, status:'passed', startTime:startedAt + 10, endTime:startedAt + 20, message:'', assertionResults:[{ ancestorTitles:['native academic'], title:'retains numeric zero', status:'passed', failureMessages:[] }] }] };
  assert.doesNotThrow(() => subject.validateIntegrationRunReport(report, inventory, context));
  for (const mutate of [
    (value:typeof report) => { value.numPendingTests = 1; },
    (value:typeof report) => { value.numTodoTests = 1; },
    (value:typeof report) => { value.testResults[0].assertionResults[0].title = 'substituted test'; },
    (value:typeof report) => { value.testResults[0].assertionResults = []; },
    (value:typeof report) => { value.startTime = startedAt - 1; },
    (value:typeof report) => { value.testResults[0].endTime = finishedAt + 1; },
  ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => subject.validateIntegrationRunReport(changed, inventory, context)); }
  assert.equal(subject.fullIntegrationFiles().includes('apps/api/test/integration/customer-foundry-live-api.test.ts'), false);
  assert.ok(subject.fullIntegrationFiles().includes('apps/api/test/integration/academic-api.test.ts'));
});

test('integration validator consumes actual Vitest discovery and fresh pure domain execution without services', async () => {
  const subject=await api(),directory=await mkdtemp(join(tmpdir(),'cuevo-integration-report-'));
  try {
    const file='packages/domain/test/authorization.test.ts',inventoryPath=join(directory,'inventory.json'),reportPath=join(directory,'report.json');
    const listed=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','list','--staticParse=false',file,`--json=${inventoryPath}`],{encoding:'utf8'});assert.equal(listed.status,0,listed.stderr);
    const startedAt=Date.now();
    const executed=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',file,'--reporter=json',`--outputFile=${reportPath}`],{encoding:'utf8'});assert.equal(executed.status,0,executed.stderr);
    const count=subject.validateIntegrationRunReport(JSON.parse(await readFile(reportPath,'utf8')),JSON.parse(await readFile(inventoryPath,'utf8')),{expectedFiles:[file],startedAt,finishedAt:Date.now()});
    assert.ok(count>1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
