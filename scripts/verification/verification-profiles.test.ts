import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
  assert.equal(classifyRuntimeChanges(['apps/web/features/learning/components/task.tsx'], true).profile, 'full-runtime');
  for (const files of [['supabase/migrations/example.sql'], ['apps/web/shared/query.ts'], ['apps/web/features/auth/provider.ts'], ['apps/api/src/modules/academic/academic.ts'], ['apps/worker/src/jobs/process.ts'], ['scripts/verification/verification-profiles.ts'], ['.github/workflows/ci.yml'], ['package-lock.json'], ['unknown/path.ts'], ['apps/web/features/learning/view.tsx', 'apps/web/features/community/view.tsx']]) assert.equal(classifyRuntimeChanges(files, true).profile, 'full-runtime');
  const runtimeNames: string[] = verificationProfileSteps('full-runtime').map(step => step.name);
  for (const omitted of ['repository', 'repository-fixtures', 'architecture', 'architecture-fixtures', 'docs', 'docs-fixtures', 'cicd', 'cicd-fixtures', 'lint', 'typecheck', 'unit', 'web-unit', 'dependency-security']) assert.ok(!runtimeNames.includes(omitted));
  assert.ok(runtimeNames.includes('runtime-outage')); assert.ok(runtimeNames.includes('browser')); assert.ok(runtimeNames.includes('recovery'));
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
