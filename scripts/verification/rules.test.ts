import{test}from'node:test';import assert from'node:assert/strict';import{validateRecoveryTarget,technicalResult,sameSourceManifest}from'./rules';
import{commandArgs,verificationSteps}from'./steps';
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
