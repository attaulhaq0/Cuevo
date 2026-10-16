import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {withCanonicalJobFixture} from '../verification/canonical-source-job-fixtures';
import {backendPreparedCatalogueFixtureSource} from '../verification/backend-prepared-catalogue.fixture';
import {readHistoricalMigrationSources} from './hosted-migration-plan';
import {pairingAdditionalPaths,pairingCatalogueRows,pairingHash,pairingPublicCa} from './hosted-inactive-cron-native-pairing.fixture';

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
  await writeFile(inputPath,JSON.stringify(input));await writeFile(runnerPath,`import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';const input=JSON.parse(readFileSync(process.env.CUEVO_INACTIVE_PAIRING_INPUT,'utf8')),pairing=await import(${JSON.stringify(fixtureUrl)}),metadata=await pairing.pairingMetadataHarness(input);const{root,repository,sourceSha,treeSha,ciRunId,now,contracts,read,archive}=metadata,hash=pairing.pairingHash;Date.now=()=>now;\n${backendPreparedCatalogueFixtureSource}\ntry{const proof=await createChildCatalogue();console.error('PAIRING_CATALOGUE_GUARD_PASSED');const baseline=await pairing.runPairingAfterCatalogue(input,metadata,proof,{releaseRunId:'51'}),recovery=await pairing.runPairingAfterCatalogue(input,metadata,proof,{releaseRunId:'52',captureFault:true});console.log(JSON.stringify({baseline,recovery}));}finally{metadata.disposeDependencies();}`);
  if(retain){
   // Explicit local debug custody only: no cached capability/receipt is created,
   // and ordinary/CI execution retains the shared fixture's original cleanup.
   value.fixture.destroy=async()=>undefined;
   await writeFile(join(ownerRoot,'.local/inactive-cron-pairing-retained.json'),JSON.stringify({version:1,purpose:'CONTROLLED_SOURCE_DEBUG_FIXTURE',root:value.fixture.root,sourceSha:value.fixture.sourceSha,treeSha:value.fixture.treeSha,inputPath,inputSha256:pairingHash(readFileSync(inputPath)),runnerPath,runnerSha256:pairingHash(readFileSync(runnerPath)),hook:value.fixture.hook,hookSha256:pairingHash(readFileSync(value.fixture.hook)),hookInput:value.fixture.hookInput,hookInputSha256:pairingHash(readFileSync(value.fixture.hookInput)),nativeEffects:false,capabilityRetained:false})+'\n');
  }
  return spawnSync(process.execPath,['--import',pathToFileURL(join(ownerRoot,'node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(value.fixture.hook).href,runnerPath],{cwd:value.fixture.root,encoding:'utf8',env:{...process.env,GITHUB_WORKSPACE:value.fixture.root,CUEVO_CANONICAL_FIXTURE_CONFIG:value.fixture.hookInput,CUEVO_INACTIVE_PAIRING_INPUT:inputPath},maxBuffer:2*1024*1024});
 });}finally{if(priorTmpdir===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=priorTmpdir;}
 assert.equal(result.status,0,String(result.stderr));const proofs=JSON.parse(String(result.stdout));for(const proof of[proofs.baseline,proofs.recovery]){assert.equal(proof.evidence,'CONTROLLED_SOURCE_COMPOSITION_ONLY');assert.equal(proof.cliAttempts,1);assert.equal(proof.matchedRawObjects,3);assert.equal(proof.originalAcknowledgement,'UNKNOWN');assert.equal(proof.configurationScope,'SQL_CRON_CONFIGURATION_ONLY');assert.equal(proof.sqlCommitment,'CONFIRMED_INACTIVE_DEFINITIONS');assert.equal(proof.ackBytesPreserved,true);assert.equal(proof.extraReviewRecord,false);assert.equal(proof.hostedAcceptance,false);}
 assert.equal(proofs.baseline.postAckStatus,'INACTIVE_DEFINITIONS_ACKNOWLEDGED');assert.equal(proofs.baseline.captureFault,false);assert.equal(proofs.recovery.postAckStatus,'REQUIRES_REVIEW');assert.equal(proofs.recovery.captureFault,true);assert.equal(proofs.recovery.rebound.status,'ACK_REBOUND_READ_ONLY');assert.equal(proofs.recovery.lateRead.status,'REQUIRES_REVIEW');assert.equal(proofs.recovery.lateRead.lateFinalReadInjected,true);
 for(const read of[proofs.recovery.rebound,proofs.recovery.lateRead]){assert.equal(read.permissionEvidence,'POSIX_MODE_VERIFIED');assert.equal(read.cliDelta,0);assert.equal(read.providerRecordWrites,0);assert.equal(read.actualHostedAcceptance,false);assert.notEqual(read.originalContextSha256,read.currentContextSha256);}
 assert.equal(proofs.recovery.rebound.originalJournalPayloadSha256,proofs.recovery.lateRead.originalJournalPayloadSha256);assert.equal(proofs.recovery.rebound.originalJournalChainSha256,proofs.recovery.lateRead.originalJournalChainSha256);
});
