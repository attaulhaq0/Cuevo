import{test}from'node:test';import assert from'node:assert/strict';import{validateRecoveryTarget,technicalResult,sameSourceManifest}from'./rules';
import{commandArgs,verificationSteps,statelessVerificationSteps}from'./steps';
import productionConfig from'./playwright.production.config';import{resolve}from'node:path';
import customerConfig from './playwright.customer.config';
import accountConfig from './playwright.accounts.config';
import ordinaryConfig from './playwright.ordinary.config';
import { readFileSync } from 'node:fs';

test('fast and complete technical CI discover the same backend release contract tests without starting a browser', () => {
 const root = resolve(import.meta.dirname, '../..');
 const packageScripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts as Record<string, string>;
 const fast = packageScripts['test:cicd'].split(/\s+/).filter(argument => argument.endsWith('.test.ts')).sort();
 const technical = [...verificationSteps.find(step => step.name === 'cicd-fixtures')!.args].filter(argument => argument.endsWith('.test.ts')).sort();
 assert.deepEqual(technical, fast);
 assert.ok(fast.includes('scripts/verification/backend-hosted-browser.test.ts'));
 const testSource = readFileSync(resolve(root, 'scripts/verification/backend-hosted-browser.test.ts'), 'utf8');
 assert.doesNotMatch(testSource, /chromium\.launch|actual Chromium normal forms/);
 const browserSource = readFileSync(resolve(root, 'tests/e2e/hosted-browser-protocol.spec.ts'), 'utf8');
 assert.match(browserSource, /actual Chromium normal forms/);
 assert.match(browserSource, /runHostedRoleBrowser/);
});

test('required source inventory executes docs reference audit asset contracts and local runtime fixtures once', () => {
 const argumentsList:string[] = verificationSteps.flatMap(step => [...step.args]);
 for (const file of ['scripts/docs/reference-inventory.test.ts','scripts/verification/dependency-security.test.ts','scripts/verification/web-test-assets.test.ts']) assert.ok(argumentsList.includes(file), file);
 const packageScripts = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')).scripts as Record<string,string>;
 assert.equal(packageScripts.test.includes('scripts/local-runtime.test.ts'), false);
});

test('reviewed schema continuation fixtures run once in their required replay and CI owners', () => {
 const packageScripts = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')).scripts as Record<string,string>;
 const stateless = statelessVerificationSteps.flatMap(step => [...step.args]);
 const owners = [
  { script:'test:hosted-plan', step:'migration-replay-rules', files:[
   'scripts/database/hosted-active-runtime-state.test.ts',
   'scripts/database/hosted-schema-recovery-completion.test.ts',
   'scripts/database/hosted-schema-continuation-native.test.ts',
   'scripts/database/hosted-schema-continuation-executor.test.ts',
   'scripts/database/hosted-migration-batch-receipt.test.ts',
  ] },
  { script:'test:cicd', step:'cicd-fixtures', files:['scripts/verification/backend-schema-completion-admission.test.ts'] },
 ];
 for (const owner of owners) {
  const direct = packageScripts[owner.script].split(/\s+/), required = [...verificationSteps.find(step => step.name === owner.step)!.args];
  for (const file of owner.files) {
   assert.equal(direct.filter(argument => argument === file).length, 1, `${owner.script}: ${file}`);
   assert.equal(required.filter(argument => argument === file).length, 1, `${owner.step}: ${file}`);
   assert.equal(stateless.filter(argument => argument === file).length, 1, `stateless discovery: ${file}`);
  }
 }
});

test('isolated source-contract placement preserves complete stateless inventory without a runtime operation',()=>{
 const repo=resolve(import.meta.dirname,'../..'),ci=readFileSync(resolve(repo,'.github/workflows/ci.yml'),'utf8');
 const source=ci.slice(ci.indexOf('\n  source-fixtures-native:'),ci.indexOf('\n  runtime-backend:'));
 const fast=ci.slice(ci.indexOf('\n  fast-checks:'),ci.indexOf('\n  source-fixtures-native:'));
 assert.equal(source.split('node --import tsx scripts/verification/stateless-checks.ts --partition=').length-1,3);
 assert.equal(source.split('node --import tsx scripts/verification/stateless-source-aggregate.ts').length-1,1);
 assert.equal(fast.includes('stateless-checks.ts'),false);
 assert.equal(fast.split('npm run lint && npm run typecheck && npm test').length-1,1);
 const files=statelessVerificationSteps.flatMap(step=>[...step.args]).filter(argument=>argument.endsWith('.test.ts'));
 assert.equal(new Set(files).size,files.length);
 for(const step of statelessVerificationSteps)assert.ok(verificationSteps.some(original=>original===step),step.name);
 for(const name of ['database','integration','browser','runtime-outage','recovery','clean-bootstrap'])assert.equal(statelessVerificationSteps.some(step=>step.name===name),false,name);
});

test('every bootstrapped verification failure restores only after confirmed owned runtime stop', async () => {
 const rules = await import('./rules');
 assert.equal(typeof rules.restoreTechnicalState, 'function');
 for(const profile of ['full','full-runtime','routine','main-staging']) {
  const calls:string[]=[];
  assert.equal(await rules.restoreTechnicalState(true,false,{stopped:async()=>{calls.push('stopped');},restore:async()=>{calls.push('restore');return 0;}}),0,profile);
  assert.deepEqual(calls,['stopped','restore']);
 }
 let restored=false;
 assert.equal(await rules.restoreTechnicalState(true,false,{stopped:async()=>{throw Error('unknown');},restore:async()=>{restored=true;return 0;}}),1);assert.equal(restored,false);
 assert.equal(await rules.restoreTechnicalState(false,false,{stopped:async()=>{},restore:async()=>{throw Error('must not mutate');}}),0);
 assert.equal(await rules.restoreTechnicalState(true,true,{stopped:async()=>{},restore:async()=>{throw Error('already restored');}}),0);
});
test('recovery only accepts dedicated local Cuevo database and scratch name',()=>{assert.doesNotThrow(()=>validateRecoveryTarget('postgresql://postgres:private@127.0.0.1:56322/postgres','cuevo_recovery_123'));for(const[url,name]of[['postgresql://postgres:private@remote.example:5432/postgres','cuevo_recovery_123'],['postgresql://postgres:private@127.0.0.1:54322/postgres','cuevo_recovery_123'],['postgresql://postgres:private@127.0.0.1:56322/postgres','postgres']])assert.throws(()=>validateRecoveryTarget(url!,name!));});
test('missing skipped or failed evidence cannot yield technical completion',()=>{assert.equal(technicalResult([{name:'unit',exitCode:0,required:true},{name:'db',exitCode:null,required:true}]).status,'NOT_VERIFIED');assert.equal(technicalResult([{name:'unit',exitCode:0,required:true},{name:'db',exitCode:1,required:true}]).status,'FAILED');assert.equal(technicalResult([{name:'unit',exitCode:0,required:true},{name:'db',exitCode:0,required:true}]).status,'VERIFIED');});
test('configured build and mutation runners load the current bootstrap environment',()=>{for(const name of['build','integration','browser','browser-compatibility','runtime-outage','recovery']){const step=verificationSteps.find(s=>s.name===name)!;assert.equal(commandArgs(step)[0],'--env-file=.env.local');}for(const name of['clean-bootstrap','clean-browser-seed','demo-seed-restore']){const bootstrap=verificationSteps.find(s=>s.name===name)!;assert.notEqual(commandArgs(bootstrap)[0],'--env-file=.env.local');}});
test('technical browser uses the complete account and ordinary acceptance wrapper',()=>{const browser=verificationSteps.find(s=>s.name==='browser')!;assert.ok(commandArgs(browser).includes('scripts/verification/browser-complete.ts'));for(const name of['repository-fixtures','architecture-fixtures','docs-fixtures','local-runtime','verification-rules'])assert.ok(verificationSteps.some(step=>step.name===name));const rules=verificationSteps.find(step=>step.name==='verification-rules')!;for(const file of['scripts/verification/browser-account-phase.test.ts','scripts/verification/account-capture-cleanup.test.ts'])assert.ok(commandArgs(rules).includes(file));});
test('production server starts from the repository root instead of the config directory',()=>{const server=productionConfig.webServer as{cwd?:string;command?:string};assert.equal(server.cwd,resolve(import.meta.dirname,'../..'));assert.equal(resolve(server.cwd!,'scripts/verification/production-runtime.ts'),resolve(import.meta.dirname,'production-runtime.ts'));});
test('every production browser phase gives its owned launcher time to terminate detached children', () => {
  for (const config of [productionConfig, customerConfig, accountConfig, ordinaryConfig]) {
    const server = config.webServer as { gracefulShutdown?: { signal: string; timeout: number } };
    assert.deepEqual(server.gracefulShutdown, { signal: 'SIGTERM', timeout: 10000 });
  }
});
test('source edits additions and deletions invalidate a frozen verification run',()=>{const before=[{path:'apps/api/source.ts',sha256:'one'}];assert.equal(sameSourceManifest(before,[...before]),true);assert.equal(sameSourceManifest(before,[{path:'apps/api/source.ts',sha256:'two'}]),false);assert.equal(sameSourceManifest(before,[]),false);assert.equal(sameSourceManifest(before,[...before,{path:'new.ts',sha256:'one'}]),false);});
test('customer verification serializes mutation windows and restores readable demo data',()=>{const order=verificationSteps.map(step=>step.name);assert.ok(order.indexOf('runtime-outage')>order.indexOf('integration'));assert.ok(order.indexOf('recovery')>order.indexOf('runtime-outage'));assert.ok(order.indexOf('clean-browser-seed')>order.indexOf('recovery'));assert.ok(order.indexOf('browser-compatibility')>order.indexOf('clean-browser-seed'));assert.ok(order.indexOf('browser')>order.indexOf('browser-compatibility'));assert.equal(order.at(-1),'demo-seed-restore');});
