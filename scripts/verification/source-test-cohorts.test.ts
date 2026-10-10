import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import type {SourceTestCohortPlan} from './source-test-cohorts';
import {canonicalReleaseExecutionJson} from './release-review';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex'),repoRoot=resolve(import.meta.dirname,'../..');
const identity={sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceLockSha256:'c'.repeat(64),nodeVersion:process.version,runId:'51',runAttempt:1,scope:'source-contracts' as const,partitionSha256:'d'.repeat(64)};
type MutableCase={titleSha256:string;suiteSha256:string|null;line:number;column:number;nesting:number;startedAtMs:number;completedAtMs:number;outcome:string};
type MutableReport={files:{path:string;sha256:string;cases:MutableCase[];summary:{counts:{tests:number}}}[];reasons:string[]};
type MutableReceipt={id:string;commandSha256:string;reportSha256:string;receiptSha256:string;cases:MutableCase[];reportCompletedAtMs:number;startedAtMs:number;file:{sha256:string};identity:{runAttempt:number}};
async function fixture(run:(value:{root:string;plan:SourceTestCohortPlan;reports:Record<string,unknown>[];commands:string[][]})=>Promise<void>){
 const api=await import('./source-test-cohorts'),original=api.readSourceTestCohortPlan(repoRoot),root=await mkdtemp(join(tmpdir(),'cv-cohort-'));
 try{
  await mkdir(join(root,'scripts/database'),{recursive:true});await mkdir(join(root,'scripts/verification'),{recursive:true});
  const titleFor=(digest:string)=>{const require=createRequire(import.meta.url),ts=require('typescript')as typeof import('typescript'),file=ts.createSourceFile('owner.ts',readFileSync(resolve(repoRoot,api.SOURCE_TEST_COHORT_FILE),'utf8'),ts.ScriptTarget.Latest,true);let title='';const visit=(node:import('typescript').Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='test'&&ts.isStringLiteral(node.arguments[0])&&hash(node.arguments[0].text)===digest)title=node.arguments[0].text;ts.forEachChild(node,visit);};visit(file);assert.ok(title);return title;};
  const source="import{test}from'node:test';\n"+original.inventory.map(row=>row.ordinal===21?`test(${JSON.stringify(titleFor(row.titleSha256))},async t=>{for(const mode of ['COMMIT_REPLY_LOST','READBACK_MISMATCH','LEASE_LOST_AFTER_CREATE'] as const)await t.test(mode,async()=>{});});`:`test(${JSON.stringify(titleFor(row.titleSha256))},async()=>{});`).join('\n')+'\n';
  await writeFile(join(root,api.SOURCE_TEST_COHORT_FILE),source);const plan=api.readSourceTestCohortPlan(root);
  const reporter=pathToFileURL(resolve(import.meta.dirname,'ci-test-timings-reporter.ts')).href,tsx=pathToFileURL(resolve(repoRoot,'node_modules/tsx/dist/loader.mjs')).href,environment={...process.env};delete environment.NODE_TEST_CONTEXT;const reports:Record<string,unknown>[]=[],commands:string[][]=[];
  for(const cohort of plan.cohorts){const command=api.sourceTestCohortCommand({repoRoot:root,plan,cohortId:cohort.id});commands.push(command);const actual=[...command];actual[1]=tsx;actual[4]='--test-reporter='+reporter;const result=spawnSync(process.execPath,actual,{cwd:root,env:{...environment,CUEVO_CI_TEST_TIMING_INPUT:JSON.stringify({repoRoot:root,files:[plan.file],identity})},encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024,windowsHide:true,shell:false});assert.equal(result.status,0,result.stderr);reports.push(JSON.parse(result.stdout));}
  await run({root,plan,reports,commands});
 }finally{await rm(root,{recursive:true,force:true});}
}

test('the closed continuation cohort owner exposes source discovery and exact report union',async()=>{
 const api=await import('./source-test-cohorts').catch(()=>null);
 assert.equal(typeof api?.readSourceTestCohortPlan,'function');
 assert.equal(typeof api?.recordSourceTestCohort,'function');
 assert.equal(typeof api?.aggregateSourceTestCohorts,'function');
});

test('real isolated Node reports cover every original title and nested parent once with original definition identity',async()=>{
 const api=await import('./source-test-cohorts');await fixture(async({root,plan,reports,commands})=>{
  const receipts=reports.map((report,index)=>api.recordSourceTestCohort({repoRoot:root,plan,cohortId:plan.cohorts[index].id,identity,report,commandArgs:commands[index],exitCode:0,signal:null,cleanupConfirmed:true})),file=api.aggregateSourceTestCohorts(plan,receipts,identity);
  assert.equal(file.cases.length,28);assert.equal(new Set(file.cases.map(row=>row.definitionSha256)).size,28);assert.equal(file.cohortEvidence.receipts.length,5);assert.equal(file.durationMs,Math.max(...receipts.map(row=>row.completedAtMs))-Math.min(...receipts.map(row=>row.startedAtMs)));assert.ok(file.durationMs<receipts.reduce((sum,row)=>sum+row.durationMs,0)+10000);
  const allCommand=['--import',pathToFileURL(resolve(repoRoot,'node_modules/tsx/dist/loader.mjs')).href,'--test','--test-reporter='+pathToFileURL(resolve(import.meta.dirname,'ci-test-timings-reporter.ts')).href,api.SOURCE_TEST_COHORT_FILE],env={...process.env};delete env.NODE_TEST_CONTEXT;const whole=spawnSync(process.execPath,allCommand,{cwd:root,env:{...env,CUEVO_CI_TEST_TIMING_INPUT:JSON.stringify({repoRoot:root,files:[plan.file],identity})},encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});assert.equal(whole.status,0);const wholeCases=JSON.parse(whole.stdout).files[0].cases as{titleSha256:string;suiteSha256:string|null;line:number;column:number;nesting:number}[];assert.deepEqual(file.cases.map(row=>row.definitionSha256).sort(),wholeCases.map(row=>hash(canonicalReleaseExecutionJson({titleSha256:row.titleSha256,suiteSha256:row.suiteSha256,line:row.line,column:row.column,nesting:row.nesting}))).sort());
 });
});

test('partial or altered real reports cannot claim a cohort or a complete current file union',async()=>{
 const api=await import('./source-test-cohorts');await fixture(async({root,plan,reports,commands})=>{
  const input={repoRoot:root,plan,cohortId:plan.cohorts[0].id,identity,report:reports[0],commandArgs:commands[0],exitCode:0,signal:null,cleanupConfirmed:true},record=(value:unknown)=>api.recordSourceTestCohort(value);
  const mutations=[{exitCode:1},{signal:'SIGTERM'},{cleanupConfirmed:false},{cohortId:plan.cohorts[1].id},{identity:{...identity,runAttempt:2}},{commandArgs:[...commands[0].slice(0,3),'--test-name-pattern=.*',...commands[0].slice(4)]},{plan:{...plan,policySha256:'0'.repeat(64)}}];for(const changed of mutations)assert.throws(()=>record({...input,...changed}),/requires review/);
  for(const mode of['missing','extra','duplicate','skip','todo','clock','parent','source','summary','stream','foreign','only-file']as const){const report=structuredClone(reports[0])as unknown as MutableReport,file=report.files[0];if(mode==='missing')file.cases.pop();if(mode==='extra')file.cases.push(structuredClone((reports[1]as unknown as MutableReport).files[0].cases[0]));if(mode==='duplicate')file.cases[1]=structuredClone(file.cases[0]);if(mode==='skip')file.cases[0].outcome='SKIPPED';if(mode==='todo')file.cases[0].outcome='TODO';if(mode==='clock')file.cases[0].completedAtMs=file.cases[0].startedAtMs-1;if(mode==='parent')file.cases[0].suiteSha256='f'.repeat(64);if(mode==='source')file.sha256='f'.repeat(64);if(mode==='summary')file.summary.counts.tests++;if(mode==='stream')report.reasons=['EVENT_STREAM_FAILED'];if(mode==='foreign')file.path='scripts/database/foreign.test.ts';if(mode==='only-file')file.cases=[];assert.throws(()=>record({...input,report}),/requires review/,mode);}
  const receipts=reports.map((report,index)=>record({...input,cohortId:plan.cohorts[index].id,report,commandArgs:commands[index]}));
  for(const mode of['missing-shard','duplicate-shard','command','report','receipt','case','clock','wrong-source','wrong-run']as const){const changed=structuredClone(receipts)as unknown as MutableReceipt[];if(mode==='missing-shard')changed.pop();else if(mode==='duplicate-shard')changed[1]=structuredClone(changed[0]);else{const first=changed[0];if(mode==='command')first.commandSha256='0'.repeat(64);if(mode==='report')first.reportSha256='0'.repeat(64);if(mode==='receipt')first.receiptSha256='0'.repeat(64);if(mode==='case')first.cases[0].titleSha256='0'.repeat(64);if(mode==='clock')first.reportCompletedAtMs=first.startedAtMs-1;if(mode==='wrong-source')first.file.sha256='0'.repeat(64);if(mode==='wrong-run')first.identity.runAttempt=2;if(mode!=='receipt'){const{receiptSha256,...body}=first;void receiptSha256;first.receiptSha256=hash(canonicalReleaseExecutionJson(body));}}assert.throws(()=>api.aggregateSourceTestCohorts(plan,changed,identity),/requires review/,mode);}
  const union=api.aggregateSourceTestCohorts(plan,receipts,identity);assert.deepEqual(api.validateSourceTestCohortEvidence(plan,union.cohortEvidence,identity),union);assert.ok(Buffer.byteLength(JSON.stringify(union.cohortEvidence))<1024*1024);
  let traps=0;for(const hostile of[{...input,get report(){traps++;throw Error('private-cohort-canary');}},new Proxy(input,{get(){traps++;throw Error('private-cohort-canary');},ownKeys(){traps++;return[];}})])assert.throws(()=>record(hostile),error=>error instanceof Error&&error.message==='Closed continuation test cohort evidence requires review; private contents withheld.');assert.equal(traps,0);assert.equal(JSON.stringify(union).includes(root),false);assert.equal(JSON.stringify(union).includes('private-cohort-canary'),false);
  const nestedIndex=plan.cohorts.findIndex(row=>row.expectedCases>row.expectedTopLevel),nestedReport=structuredClone(reports[nestedIndex])as unknown as MutableReport;nestedReport.files[0].cases.find(row=>row.nesting===1)!.suiteSha256='f'.repeat(64);assert.throws(()=>record({...input,cohortId:plan.cohorts[nestedIndex].id,commandArgs:commands[nestedIndex],report:nestedReport}),/requires review/);
 });
});

test('source inventory admits all original declarations and rejects changed skipped or dynamically registered cases',async()=>{
 const api=await import('./source-test-cohorts'),root=resolve(import.meta.dirname,'../..'),source=readFileSync(resolve(root,api.SOURCE_TEST_COHORT_FILE),'utf8'),plan=api.readSourceTestCohortPlan(root);
 assert.equal(plan.inventory.length,25);assert.equal(plan.inventory.reduce((sum,row)=>sum+row.children.length,0),3);assert.equal(plan.cohorts.length,5);assert.equal(plan.cohorts.reduce((sum,row)=>sum+row.expectedCases,0),28);
 for(const changed of[source+"\ntest('unexpected',()=>{});",source+"\nconst alias=test;alias('hidden',()=>{});",source.replace("test('controlled continuation executor runs","test.skip('controlled continuation executor runs"),source.replace("test('controlled continuation executor runs","test['only']('controlled continuation executor runs"),source.replace("test('controlled continuation executor runs","test('changed continuation executor runs"),source.replace("'COMMIT_REPLY_LOST','READBACK_MISMATCH','LEASE_LOST_AFTER_CREATE'","'COMMIT_REPLY_LOST','READBACK_MISMATCH','READBACK_MISMATCH'"),source.replace("test('controlled continuation executor runs","test(title+'controlled continuation executor runs")])assert.throws(()=>api.discoverSourceTestCohortPlan(changed),/requires review/);
});
