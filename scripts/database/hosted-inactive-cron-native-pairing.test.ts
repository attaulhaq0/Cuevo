import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {withCanonicalJobFixture} from '../verification/canonical-source-job-fixtures';
import {backendPreparedCatalogueFixtureSource} from '../verification/backend-prepared-catalogue.fixture';
import {readHistoricalMigrationSources} from './hosted-migration-plan';
import {pairingAdditionalPaths,pairingCatalogueRows,pairingHash,pairingPublicCa} from './hosted-inactive-cron-native-pairing.fixture';
import * as pairingFailure from './hosted-inactive-cron-native-pairing.fixture';

const failureInput=()=>({identity:{sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),runId:'51',runAttempt:1,testSha256:'c'.repeat(64),fixtureSha256:'d'.repeat(64)},phase:'READ53',reboundStep:'READ',category:'ASSERTION',frame:{file:'scripts/database/hosted-inactive-cron-native-pairing.fixture.ts',line:278,column:4},counters:{cliAttempts:1,historyRows:232,closed:true,released:true,ownerObjects:1,ackRecords:2,localAckRecords:null}});

test('pairing failure encoder retains only fixed source identity phase and bounded observed counters',()=>{
 const encoded=pairingFailure.encodePairingFailureDiagnostic(failureInput());assert.ok(encoded);const result=JSON.parse(encoded);
 assert.equal(result.purpose,'CUEVO_CONTROLLED_INACTIVE_PAIRING_FAILURE');assert.equal(result.evidence,'CONTROLLED_SOURCE_FIXTURE_FAILURE_ONLY');assert.equal(result.effectAuthority,false);assert.equal(result.hostedAcceptance,false);assert.equal(result.acceptedReceipt,false);
 assert.deepEqual(result.identity,failureInput().identity);assert.equal(result.phase,'READ53');assert.equal(result.reboundStep,'READ');assert.equal(result.counters.localAckRecords,null);assert.deepEqual(Object.keys(result).sort(),['acceptedReceipt','category','counters','effectAuthority','evidence','frame','hostedAcceptance','identity','phase','purpose','reboundStep','version']);
});

test('pairing failure encoder rejects getters proxies and extra private fields without reading hooks',()=>{
 let reads=0;const input=failureInput(),accessor={...input,get phase(){reads++;return'READ53';}},proxy=new Proxy(input,{ownKeys(){reads++;return Reflect.ownKeys(input);}});
 for(const value of[accessor,proxy,{...input,get reboundStep(){reads++;return'READ';}},{...input,reboundStep:new Proxy({},{get(){reads++;return'READ';}})},{...input,counters:new Proxy(input.counters,{get(){reads++;return 1;}})},{...input,stderr:'PRIVATE SQL credentials journal bytes'},{...input,identity:{...input.identity,password:'PRIVATE'}}])assert.equal(pairingFailure.encodePairingFailureDiagnostic(value),null);
 assert.equal(reads,0);
});

test('pairing failure encoder refuses unknown phases frames identities and unbounded or missing counters',()=>{
 const input=failureInput();for(const patch of[{phase:'ACTIVATED'},{category:'RAW_ERROR'},{identity:{...input.identity,sourceSha:'unknown'}},{identity:{...input.identity,runAttempt:0}},{identity:{...input.identity,runId:'9007199254740993'}},{frame:{...input.frame,file:'/private/secret.sql'}},{frame:{...input.frame,line:1000001}},{counters:{...input.counters,historyRows:1001}},{counters:{...input.counters,ackRecords:4}},{counters:{...input.counters,localAckRecords:-1}},{counters:{...input.counters,closed:'unknown'}}])assert.equal(pairingFailure.encodePairingFailureDiagnostic({...input,...patch}),null);
 assert.ok(pairingFailure.encodePairingFailureDiagnostic({...input,phase:'CATALOGUE',reboundStep:null,frame:null,counters:null}));
});

test('pairing rebound diagnostics require a finite last-started step only during READ53 and READ54',()=>{
 const input=failureInput(),steps=['PACKAGE','ADMISSION_PREPARE','ADMISSION_REFRESH','PERMISSIONS','READ','ASSERT'];
 for(const phase of['READ53','READ54'])for(const reboundStep of steps){const encoded=pairingFailure.encodePairingFailureDiagnostic({...input,phase,reboundStep});assert.ok(encoded);assert.equal(JSON.parse(encoded).reboundStep,reboundStep);assert.ok(Buffer.byteLength(encoded)<=4096);}
 for(const phase of['CATALOGUE','BASELINE51','POST_ACK52']){assert.ok(pairingFailure.encodePairingFailureDiagnostic({...input,phase,reboundStep:null}));for(const reboundStep of steps)assert.equal(pairingFailure.encodePairingFailureDiagnostic({...input,phase,reboundStep}),null);}
 for(const reboundStep of[null,undefined,'UNKNOWN','PRIVATE failure message',{},1])assert.equal(pairingFailure.encodePairingFailureDiagnostic({...input,reboundStep}),null);
 const{reboundStep,...missing}=input;void reboundStep;assert.equal(pairingFailure.encodePairingFailureDiagnostic(missing),null);
});

test('pairing error reduction drops raw messages credentials absolute paths and unknown stack frames',()=>{
 const error=new Error('PRIVATE password SQL journal content');Object.defineProperty(error,'code',{value:'ERR_ASSERTION'});Object.defineProperty(error,'stack',{value:'PRIVATE secret\n    at run (file:///private/work/scripts/database/hosted-inactive-cron-native-pairing.fixture.ts:278:4)\n    at secret (/private/secret.sql:9:2)'});
 const reduced=pairingFailure.pairingFailureErrorDetails(error);assert.deepEqual(reduced,{category:'ASSERTION',frame:{file:'scripts/database/hosted-inactive-cron-native-pairing.fixture.ts',line:278,column:4}});assert.equal(JSON.stringify(reduced).includes('PRIVATE'),false);assert.equal(JSON.stringify(reduced).includes('/private'),false);
 assert.deepEqual(pairingFailure.pairingFailureErrorDetails(new SyntaxError('PRIVATE')), {category:'SYNTAX_OR_MODULE',frame:null});assert.deepEqual(pairingFailure.pairingFailureErrorDetails({stack:'at unknown (/private/secret.sql:9:2)'}),{category:'OTHER',frame:null});
});

test('pairing error reduction and optional retention never invoke hostile error or detail getters',async()=>{
 let reads=0;const error={get stack(){reads++;return'PRIVATE';}},proxy=new Proxy(new Error('PRIVATE'),{get(){reads++;return'PRIVATE';}});
 assert.deepEqual(pairingFailure.pairingFailureErrorDetails(error),{category:'OTHER',frame:null});assert.deepEqual(pairingFailure.pairingFailureErrorDetails(proxy),{category:'OTHER',frame:null});
 assert.equal(await pairingFailure.retainPairingFailureDiagnostic({get phase(){reads++;return'READ54';}}),false);assert.equal(reads,0);
});

test('pairing error reduction ignores source-looking messages and recognizes anchored allowlisted test frames',()=>{
 const message='Error: PRIVATE failure during scripts/database/hosted-inactive-cron-native-pairing.fixture.ts:12:3';
 assert.deepEqual(pairingFailure.pairingFailureErrorDetails({code:'ERR_ASSERTION',stack:message+'\n    at TestContext.<anonymous> (file:///private/work/scripts/database/hosted-inactive-cron-native-pairing.test.ts:73:9)'}),{category:'ASSERTION',frame:{file:'scripts/database/hosted-inactive-cron-native-pairing.test.ts',line:73,column:9}});
 assert.deepEqual(pairingFailure.pairingFailureErrorDetails({stack:message+'\n    at run (node:internal/test_runner/test:1306:25)'}),{category:'OTHER',frame:null});
 assert.deepEqual(pairingFailure.pairingFailureErrorDetails({stack:'Error: PRIVATE\n    at run (G:\\private\\work\\scripts\\database\\hosted-inactive-cron-native-pairing.test.ts:73:9)'}),{category:'OTHER',frame:{file:'scripts/database/hosted-inactive-cron-native-pairing.test.ts',line:73,column:9}});
 for(const stack of['Error: PRIVATE\n    at run (file:///private/work/scripts/database/hosted-inactive-cron-native-pairing.ts:12:3)','Error: PRIVATE\nmessage has at run (file:///private/work/scripts/database/hosted-migration-executor.ts:12:3)','Error: PRIVATE\n    at run (file:///private/work/scripts/database/hosted-migration-executor.ts:12:3) PRIVATE'])assert.deepEqual(pairingFailure.pairingFailureErrorDetails({stack}),{category:'OTHER',frame:null});
});

test('pairing diagnostic Git reads explicitly silence stdin and stderr while the owned action retains a separate fixed companion',()=>{
 const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript'),root=resolve(import.meta.dirname,'../..'),file='scripts/database/hosted-inactive-cron-native-pairing.fixture.ts',source=ts.createSourceFile(file,readFileSync(join(root,file),'utf8'),ts.ScriptTarget.Latest,true);
 const owner=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='retainPairingFailureDiagnostic');assert.ok(owner);const calls:import('typescript').CallExpression[]=[];
 const visit=(node:import('typescript').Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='execFileSync')calls.push(node);ts.forEachChild(node,visit);};visit(owner);assert.equal(calls.length,3);
 for(const call of calls){assert.ok(ts.isStringLiteral(call.arguments[0]));assert.equal(call.arguments[0].text,'git');const options=call.arguments[2];assert.ok(ts.isObjectLiteralExpression(options));const stdio=options.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(source)==='stdio');assert.ok(stdio&&ts.isPropertyAssignment(stdio)&&ts.isArrayLiteralExpression(stdio.initializer));assert.deepEqual(stdio.initializer.elements.map(element=>ts.isStringLiteral(element)?element.text:null),['ignore','pipe','ignore']);}
 const yaml=require('js-yaml') as {load(text:string):unknown},workflow=yaml.load(readFileSync(join(root,'.github/workflows/ci.yml'),'utf8')) as {jobs:Record<string,{steps:Record<string,unknown>[]}>},steps=workflow.jobs['source-fixtures-delivery'].steps,companion=steps.find(step=>step.name==='Retain minimized inactive-Cron pairing failure');assert.ok(companion);assert.equal(companion.if,'always()');assert.equal(companion.uses,'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9');
 const retained=companion.with as Record<string,unknown>;assert.equal(retained.name,'cuevo-inactive-cron-pairing-failure-${{ github.run_id }}-${{ github.run_attempt }}');assert.equal(retained.path,pairingFailure.pairingFailureDiagnosticPath);assert.equal(retained['include-hidden-files'],true);assert.equal(retained['if-no-files-found'],'ignore');
 const original=steps.find(step=>step.name==='Retain exact source-delivery fixture receipt');assert.ok(original);assert.equal((original.with as Record<string,unknown>).path,'.local/verification/source-partitions/source-delivery/result.json');assert.notEqual(retained.name,(original.with as Record<string,unknown>).name);
});

/** A real source-owner composition with controlled external I/O. This test
 * cannot certify native SQL, hosted configuration, activation or deployment. */
test('controlled native inactive append pairs actual source issuers and raw durable chains with configuration-only admission',async(context)=>{
 if(process.platform!=='linux'){context.skip('Requires supported real Linux directory fsync; Windows refusal is retained and cannot establish native journal acknowledgement.');return;}
 const ownerRoot=resolve(import.meta.dirname,'../..');
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'){context.skip('The unchanged native runner requires a real GitHub-hosted Linux source job.');return;}
 assert.equal(process.arch,'x64');assert.equal(process.env.GITHUB_WORKSPACE,ownerRoot);assert.ok(ownerRoot.startsWith('/home/runner/work/'));
 const retain=process.env.CUEVO_RETAIN_INACTIVE_PAIRING_FIXTURE==='1';
 assert.equal(retain&&process.env.GITHUB_ACTIONS==='true',false,'CI never retains or retries a controlled source fixture');
 assert.equal(pairingHash(pairingPublicCa),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7','fixture uses the original publicly available Supabase CA bytes');
 // Keep the real fixture checkout in this hosted job's ignored workspace so
 // the unchanged native owner can verify its actual child working directory.
 const priorTmpdir=process.env.TMPDIR,tempParent=join(ownerRoot,'.local/inactive-pairing-temp');await mkdir(tempParent,{recursive:true,mode:0o700});process.env.TMPDIR=tempParent;
 let result:ReturnType<typeof spawnSync>;
 try{result=await withCanonicalJobFixture('schema',()=>undefined,{original231Base:true,repository:'attaulhaq0/Cuevo',additionalSources:[{path:'.gitignore',bytes:'.local/\nnode_modules/\n'},{path:'package-lock.json',bytes:readFileSync(join(ownerRoot,'package-lock.json'),'utf8')},...pairingAdditionalPaths.map(path=>({path,bytes:readFileSync(join(ownerRoot,path),'utf8')})),...readHistoricalMigrationSources(ownerRoot,'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37','a58fa0bef6f6c0ea9cc57d12156b6c3464ac5559').map(row=>({path:'supabase/migrations/'+row.name,bytes:new TextDecoder().decode(row.bytes)}))]},async value=>{
  const paths={admission:'../verification/backend-release-admission.ts',contracts:'../verification/backend-release-contracts.ts',schema:'../verification/canonical-schema-jobs.ts',childReference:'../verification/backend-child-catalogue-admission.ts',childFixture:'hosted-original-child-recovery.fixture.ts',childOwner:'hosted-original-child-recovery.ts',childSummary:'hosted-child-catalogue-reference.ts',transportOwner:'hosted-original231-transport-catalogue.ts',appendPlanOwner:'hosted-original231-transport-append.ts',policy:'unknown-prefix-catalogue-policy.json'};
  const input={run:value.run,jobs:value.jobs,artifacts:value.artifacts,archives:value.archives,tree:value.tree,childCatalogue:232,nativeCatalogueRows:pairingCatalogueRows(),ownerRoot,...Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,pathToFileURL(resolve(import.meta.dirname,path)).href]))};
  const inputPath=join(value.fixture.root,'.local/inactive-pairing-input.json'),runnerPath=join(value.fixture.root,'.local/inactive-pairing-runner.mjs'),fixtureUrl=pathToFileURL(resolve(import.meta.dirname,'hosted-inactive-cron-native-pairing.fixture.ts')).href;
  await writeFile(inputPath,JSON.stringify(input));await writeFile(runnerPath,`import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';const input=JSON.parse(readFileSync(process.env.CUEVO_INACTIVE_PAIRING_INPUT,'utf8')),pairing=await import(${JSON.stringify(fixtureUrl)});let metadata;try{metadata=await pairing.pairingMetadataHarness(input);const{root,repository,sourceSha,treeSha,ciRunId,now,contracts,read,archive}=metadata,hash=pairing.pairingHash;Date.now=()=>now;\n${backendPreparedCatalogueFixtureSource}\nconst proof=await createChildCatalogue();console.error('PAIRING_CATALOGUE_GUARD_PASSED');const baseline=await pairing.runPairingAfterCatalogue(input,metadata,proof,{releaseRunId:'51'}),recovery=await pairing.runPairingAfterCatalogue(input,metadata,proof,{releaseRunId:'52',captureFault:true}),publicationRenewal=await pairing.runPairingAfterCatalogue(input,metadata,proof,{releaseRunId:'55',publicationDelay:true});console.log(JSON.stringify({baseline,recovery,publicationRenewal}));}catch(error){try{await pairing.retainPairingFailureDiagnostic(metadata?metadata.failureDetails(error):{phase:'CATALOGUE',reboundStep:null,...pairing.pairingFailureErrorDetails(error),counters:null});}catch{}throw error;}finally{metadata?.disposeDependencies();}`);
  if(retain){
   // Explicit local debug custody only: no cached capability/receipt is created,
   // and ordinary/CI execution retains the shared fixture's original cleanup.
   value.fixture.destroy=async()=>undefined;
   await writeFile(join(ownerRoot,'.local/inactive-cron-pairing-retained.json'),JSON.stringify({version:1,purpose:'CONTROLLED_SOURCE_DEBUG_FIXTURE',root:value.fixture.root,sourceSha:value.fixture.sourceSha,treeSha:value.fixture.treeSha,inputPath,inputSha256:pairingHash(readFileSync(inputPath)),runnerPath,runnerSha256:pairingHash(readFileSync(runnerPath)),hook:value.fixture.hook,hookSha256:pairingHash(readFileSync(value.fixture.hook)),hookInput:value.fixture.hookInput,hookInputSha256:pairingHash(readFileSync(value.fixture.hookInput)),nativeEffects:false,capabilityRetained:false})+'\n');
  }
  return spawnSync(process.execPath,['--import',pathToFileURL(join(ownerRoot,'node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(value.fixture.hook).href,runnerPath],{cwd:value.fixture.root,encoding:'utf8',env:{...process.env,GITHUB_WORKSPACE:value.fixture.root,CUEVO_CANONICAL_FIXTURE_CONFIG:value.fixture.hookInput,CUEVO_INACTIVE_PAIRING_INPUT:inputPath},maxBuffer:2*1024*1024});
 });}finally{if(priorTmpdir===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=priorTmpdir;}
 assert.equal(result.status,0,String(result.stderr));const proofs=JSON.parse(String(result.stdout));for(const proof of[proofs.baseline,proofs.recovery,proofs.publicationRenewal]){assert.equal(proof.evidence,'CONTROLLED_SOURCE_COMPOSITION_ONLY');assert.equal(proof.cliAttempts,1);assert.equal(proof.matchedRawObjects,3);assert.equal(proof.originalAcknowledgement,'UNKNOWN');assert.equal(proof.configurationScope,'SQL_CRON_CONFIGURATION_ONLY');assert.equal(proof.sqlCommitment,'CONFIRMED_INACTIVE_DEFINITIONS');assert.equal(proof.ackBytesPreserved,true);assert.equal(proof.extraReviewRecord,false);assert.equal(proof.hostedAcceptance,false);}
 assert.equal(proofs.baseline.postAckStatus,'INACTIVE_DEFINITIONS_ACKNOWLEDGED');assert.equal(proofs.baseline.captureFault,false);assert.equal(proofs.recovery.postAckStatus,'REQUIRES_REVIEW');assert.equal(proofs.recovery.captureFault,true);assert.equal(proofs.recovery.rebound.status,'ACK_REBOUND_READ_ONLY');assert.equal(proofs.recovery.lateRead.status,'REQUIRES_REVIEW');assert.equal(proofs.recovery.lateRead.lateFinalReadInjected,true);
 assert.equal(proofs.publicationRenewal.postAckStatus,'INACTIVE_DEFINITIONS_ACKNOWLEDGED');assert.equal(proofs.publicationRenewal.publicationDelayInjected,true);assert.equal(proofs.baseline.publicationDelayInjected,false);assert.equal(proofs.recovery.publicationDelayInjected,false);
 for(const read of[proofs.recovery.rebound,proofs.recovery.lateRead]){assert.equal(read.permissionEvidence,'POSIX_MODE_VERIFIED');assert.equal(read.cliDelta,0);assert.equal(read.providerRecordWrites,0);assert.equal(read.actualHostedAcceptance,false);assert.notEqual(read.originalContextSha256,read.currentContextSha256);}
 assert.equal(proofs.recovery.rebound.originalJournalPayloadSha256,proofs.recovery.lateRead.originalJournalPayloadSha256);assert.equal(proofs.recovery.rebound.originalJournalChainSha256,proofs.recovery.lateRead.originalJournalChainSha256);
});
