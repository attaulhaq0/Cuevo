import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import * as adapter from './pilot-window';

const env={CI:'true',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'attaulhaq0/Cuevo',GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'1',CUEVO_PILOT_EXPECTED_SHA:'a'.repeat(40),CUEVO_PILOT_CI_RUN_ID:'99'};
test('native pilot admission refuses this laptop and untrusted markers before side effects',()=>{
 assert.throws(()=>adapter.pilotEnvironment('win32',env));
 for(const patch of[{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_EVENT_NAME:'push'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_RUN_ATTEMPT:'0'},{CUEVO_PILOT_CI_RUN_ID:'99;echo bad'}])assert.throws(()=>adapter.pilotEnvironment('linux',{...env,...patch}));
 assert.equal(adapter.pilotEnvironment('linux',env).runId,'100');
});
test('fast nonzero child completion is retained before delayed ownership inspection',async()=>{
 const child=spawn(process.execPath,['-e','process.exit(7)'],{stdio:'ignore',windowsHide:true});const completion=adapter.pilotProcessCompletion(child);await new Promise(resolveWait=>setTimeout(resolveWait,150));assert.equal(await completion,7);
});
test('native reset comparison excludes only a verified regenerated rubric identity and retains every native value',()=>{
 const first={type:'rubric',rubricId:'40000000-0000-4000-8000-000000000001',rubricTitle:'School approach',rubricVersion:'reviewed-1',policyVersion:1,normalized:null,criteria:[{criterionKey:'method',criterionTitle:'Explain a method',levelKey:'shown',levelLabel:'Shown',levelDescription:'Shows the recorded method.'}]};
 const second={...first,rubricId:'40000000-0000-4000-8000-000000000002'};
 const definition=(value:typeof first)=>({id:value.rubricId,title:value.rubricTitle,version:value.rubricVersion});
 assert.deepEqual(adapter.pilotResetNative(first,definition(first)),adapter.pilotResetNative(second,definition(second)));
 assert.throws(()=>adapter.pilotResetNative(first,definition(second)));assert.throws(()=>adapter.pilotResetNative(first));
 for(const patch of[{rubricTitle:'Changed title'},{rubricVersion:'reviewed-2'},{policyVersion:2},{criteria:[{...first.criteria[0],levelDescription:'Changed descriptor.'}]}]){const changed={...first,...patch};assert.notDeepEqual(adapter.pilotResetNative(first,definition(first)),adapter.pilotResetNative(changed,definition(changed)));}
 assert.deepEqual(adapter.pilotResetNative({type:'numeric',score:0,maxScore:10,policyVersion:1}),{type:'numeric',score:0,maxScore:10,policyVersion:1});
});
test('measurement commands use bounded direct argv and isolate flags and credentials',()=>{
 const base={...env,PATH:'toolchain',GH_TOKEN:'private',NODE_OPTIONS:'--require bad',OPENAI_API_KEY:'private',VERCEL_TOKEN:'private',CUEVO_REQUIRE_BROWSER_PERFORMANCE:'1',CUEVO_REQUIRE_BROWSER_PILOT_VOLUME:'1'};
 for(const window of ['performance','volume'] as const){const child=adapter.pilotChildEnvironment(base,window);assert.equal(child.GH_TOKEN,undefined);assert.equal(child.OPENAI_API_KEY,undefined);assert.equal(child.VERCEL_TOKEN,undefined);assert.equal(child.NODE_OPTIONS,undefined);assert.equal(child.CUEVO_REQUIRE_BROWSER_PERFORMANCE,window==='performance'?'1':undefined);assert.equal(child.CUEVO_REQUIRE_BROWSER_PILOT_VOLUME,window==='volume'?'1':undefined);assert.equal(child.PATH,'toolchain');}
 const ordinary=adapter.pilotChildEnvironment(base);assert.equal(ordinary.CUEVO_REQUIRE_BROWSER_PERFORMANCE,undefined);assert.equal(ordinary.CUEVO_REQUIRE_BROWSER_PILOT_VOLUME,undefined);
 const command=adapter.pilotBrowserArgs('performance','/ignored/current.json');assert.ok(command.includes('tests/e2e/customer-performance.spec.ts'));assert.ok(command.includes('--reporter=list,json'));assert.ok(!command.some(x=>x.includes('private')));
});
test('durable journal commits exact ignored evidence and refuses authored or escaping paths',{skip:process.platform==='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-pilot-'));try{await mkdir(join(root,'.local/pilot/100-1'),{recursive:true});await adapter.writePilotJournal(root,'.local/pilot/100-1/current.json',{original:'unchanged'});assert.deepEqual(JSON.parse(await readFile(join(root,'.local/pilot/100-1/current.json'),'utf8')),{original:'unchanged'});await assert.rejects(adapter.writePilotJournal(root,'README.md',{}));await assert.rejects(adapter.writePilotJournal(root,'.local/pilot/../../README.md',{}));}finally{await rm(root,{recursive:true,force:true});}
});
test('owned Linux process identity rejects pid reuse and command replacement before signalling',()=>{
 const current={pid:123,ppid:1,group:123,start:'100',commandSha256:'a'.repeat(64)};
 assert.equal(adapter.samePilotProcess(current,current),true);assert.equal(adapter.samePilotProcess(current,{...current,start:'101'}),false);assert.equal(adapter.samePilotProcess(current,{...current,commandSha256:'b'.repeat(64)}),false);
 assert.throws(()=>adapter.collectPilotProcesses([{...current,start:'101'}],[current],999));
 assert.throws(()=>adapter.collectPilotProcesses([current],[],0));
 assert.deepEqual(adapter.collectPilotProcesses([current,{...current,pid:124,ppid:123}],[current],123).map(row=>row.pid),[123,124]);
 assert.throws(()=>adapter.requirePilotChildProcess(current,5,'a'.repeat(64)));assert.throws(()=>adapter.requirePilotChildProcess(current,1,'b'.repeat(64)));assert.equal(adapter.requirePilotChildProcess(current,1,'a'.repeat(64)).pid,123);
});
test('performance measured timestamp and declared source cannot be fabricated by missing values',()=>{
 const started=Date.parse('2026-10-05T12:00:00Z'),environment={web:'LOCAL_PRODUCTION_NEXT_BUILD',api:'LOCAL_SOURCE_NEST_FASTIFY',worker:'LOCAL_NODE_POLLER',dataClass:'SYNTHETIC',populationRecords:133,browser:'production-chromium'};
 assert.doesNotThrow(()=>adapter.requirePilotMeasured('performance',{schemaVersion:1,status:'MEASURED',measuredAt:'2026-10-05T12:00:01Z',environment},started,started+2000));
 for(const measuredAt of[undefined,'invalid','2026-10-05T11:59:59Z'])assert.throws(()=>adapter.requirePilotMeasured('performance',{schemaVersion:1,status:'MEASURED',measuredAt,environment},started,started+2000));
 assert.throws(()=>adapter.requirePilotMeasured('performance',{schemaVersion:1,status:'MEASURED',measuredAt:'2026-10-05T12:00:01Z',environment:{...environment,dataClass:'REAL'}},started,started+2000));
});
test('confirmed same-run terminal recovery admits validation only, while absent or stale receipt never becomes restored',()=>{
 const identity=adapter.pilotEnvironment('linux',env),receipt={schema:'a'.repeat(64),policy:'b'.repeat(64),counts:'c'.repeat(64),population:'d'.repeat(64)};
 assert.deepEqual(adapter.validatedPilotTerminal({identity,window:'volume',restored:true,receipt},identity),receipt);
 assert.equal(adapter.validatedPilotTerminal(null,identity),null);
 assert.throws(()=>adapter.validatedPilotTerminal({identity:{...identity,runAttempt:2},window:'volume',restored:true,receipt},identity));
 assert.throws(()=>adapter.validatedPilotTerminal({identity,window:'volume',restored:false,receipt},identity));
});
test('partial volume recovery precedes an older confirmed performance terminal',()=>{
 assert.equal(adapter.latestPilotRecoveryWindow(['performance','volume']),'volume');assert.equal(adapter.latestPilotRecoveryWindow(['performance']),'performance');assert.equal(adapter.latestPilotRecoveryWindow([]),null);
});
test('physical byte proof reads a bounded body rather than trusting declared provider size',async()=>{
 assert.deepEqual(await adapter.boundedPilotBytes(new Response(new Uint8Array([1,2,3])),4),new Uint8Array([1,2,3]));
 await assert.rejects(adapter.boundedPilotBytes(new Response(new Uint8Array([1,2,3,4,5])),4));
 await assert.rejects(adapter.boundedPilotBytes(new Response(new Uint8Array([1]),{headers:{'content-length':'100'}}),4));
});
test('private bytes are admitted only after exact native school actor path and provider metadata checks',()=>{
 const context={version:1 as const,runId:'100',window:'performance' as const,sourceSha:'a'.repeat(40),sourceManifestSha256:'a'.repeat(64),schemaSha256:'b'.repeat(64),migrationSha256:'c'.repeat(64),populationSha256:'d'.repeat(64),schoolId:'10000000-0000-4000-8000-000000000001',allowedActorIds:['20000000-0000-4000-8000-000000000012'],apiUrl:'http://127.0.0.1:56321',databaseTarget:'postgresql://127.0.0.1:56322/postgres',stopped:true};
 const asset={id:'40000000-0000-4000-8000-000000000001',schoolId:context.schoolId,ownerId:context.allowedActorIds[0],createdBy:context.allowedActorIds[0],name:'current.txt',contentType:'text/plain' as const,byteSize:4,sha256:'a'.repeat(64),state:'RETIRED' as const,objectPath:`${context.schoolId}/${context.allowedActorIds[0]}/40000000-0000-4000-8000-000000000001`,purpose:'PERSONAL' as const,courseId:null,assessmentId:null,createdAt:'2026-10-05T12:00:00Z',availableAt:null,retiredAt:'2026-10-05T12:01:00Z'};
 const object={id:'50000000-0000-4000-8000-000000000001',bucket_id:'learner-private',name:asset.objectPath,metadata:{size:4,mimetype:'text/plain'}};
 assert.doesNotThrow(()=>adapter.requirePilotPrivateDownload(context,[asset],object));
 for(const changed of[{...asset,ownerId:'20000000-0000-4000-8000-000000000013'},{...asset,objectPath:'../../outside'},{...asset,schoolId:'10000000-0000-4000-8000-000000000002'}])assert.throws(()=>adapter.requirePilotPrivateDownload(context,[changed],object));
 assert.throws(()=>adapter.requirePilotPrivateDownload(context,[asset],{...object,metadata:{size:8,mimetype:'text/plain'}}));
});
