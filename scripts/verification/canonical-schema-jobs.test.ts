import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runCanonicalJobFixture} from './canonical-source-job-fixtures';
function denied(result:Awaited<ReturnType<typeof runCanonicalJobFixture>>,label='',marker?:string){assert.match(result.stderr,/FIXTURE_CANONICAL_READER_ENTERED/,label);assert.equal(result.stderr.includes('SyntaxError'),false,label);if(marker)assert.ok(result.stderr.includes(marker),label+': '+result.stderr);assert.notEqual(result.status,0,label);}

test('schema metadata refresh preserves required original evidence without downloading or waiting for runtime',async()=>{
 const positive=await runCanonicalJobFixture('schema',undefined,{guarded:true,guardMutation:{kind:'REFRESH_UNRELATED_RUNTIME'}});assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).archiveReads,6);assert.match(positive.stderr,/FIXTURE_METADATA_REFRESH_UNRELATED_RUNTIME/);
 for(const mode of ['source','database','security','job','run']as const){
  const result=await runCanonicalJobFixture('schema',undefined,{guarded:true,guardMutation:{kind:'GUARDED_SCHEMA',mode}});denied(result,mode,'FIXTURE_METADATA_GUARDED_SCHEMA');
 }
});

test('canonical schema refuses original artifact expiry during its final source observation',async()=>{
 const result=await runCanonicalJobFixture('schema',undefined,{guarded:true,guardMutation:{kind:'FINAL_SCHEMA_EXPIRY'}});denied(result,'expiry','FINAL_SCHEMA_ARTIFACT_EXPIRED');
});

test('canonical source and database proof admits original archives while unrelated runtime may still run or fail',async()=>{
 const original=await runCanonicalJobFixture('schema');assert.equal(original.status,0,original.stderr);assert.equal(JSON.parse(original.stdout).status,'VERIFIED');assert.equal(JSON.parse(original.stdout).runAttempt,2);
 for(const failed of [false,true]){const result=await runCanonicalJobFixture('schema',value=>{value.jobs.push({id:999,name:'runtime-backend',run_id:31,run_attempt:2,head_sha:value.run.head_sha,head_branch:'main',status:'in_progress',conclusion:null,started_at:null,completed_at:null,steps:[]});if(failed){value.run.status='completed';value.run.conclusion='failure';}});assert.equal(result.status,0,result.stderr);}
});

test('canonical database proof requires its original exact same source run attempt lane archive',async()=>{
 for(const mode of ['missing','attempt','source','tree','row','failed','private','noncanonical','filename','expiry','window','metadata-source']){
  const result=await runCanonicalJobFixture('schema',value=>{const lane=value.bodies[4]as Record<string,unknown>;if(mode==='missing')value.artifacts.splice(value.artifacts.findIndex(row=>row.id===75),1);if(mode==='attempt')lane.runAttempt=1;if(mode==='source')lane.sourceSha='d'.repeat(40);if(mode==='tree')lane.treeSha='d'.repeat(40);if(mode==='row')(lane.rows as unknown[]).pop();if(mode==='failed')(lane.rows as {exitCode:number}[])[0].exitCode=1;if(mode==='private')lane.privateConsole='private-canary';const item=value.artifacts.find(row=>row.id===75);if(item){if(mode==='expiry')item.expires_at='2026-10-07T00:00:00Z';if(mode==='window')item.created_at='2026-10-08T00:03:00Z';if(mode==='metadata-source')(item.workflow_run as {head_sha:string}).head_sha='d'.repeat(40);}}, {noncanonical:mode==='noncanonical',archiveName:mode==='filename'?'other.json':undefined});denied(result,mode);assert.equal(result.stderr.includes('private-canary'),false);
 }
 for(const mode of ['metadata-drift','tree-drift']){const kind=mode==='metadata-drift'?'DATABASE_METADATA_DRIFT':'TREE_DRIFT';const result=await runCanonicalJobFixture('schema',undefined,{metadataMutation:{kind}});denied(result,mode,'FIXTURE_METADATA_'+kind);}
});

test('pending canonical producers have explicit not ready metadata without downloading artifacts or borrowing failed work',async()=>{
 const pending=await runCanonicalJobFixture('schema',value=>Object.assign(value.jobs.find(row=>row.name==='database-checks')!,{status:'in_progress',conclusion:null}),{artifactMutation:'FORBIDDEN'});assert.equal(pending.status,0,pending.stderr);assert.deepEqual(JSON.parse(pending.stdout).pendingJobs,['database-checks']);assert.equal(pending.stderr.includes('FIXTURE_ARTIFACT_FORBIDDEN'),false);
 const failed=await runCanonicalJobFixture('schema',value=>Object.assign(value.jobs.find(row=>row.name==='database-checks')!,{conclusion:'failure'}));denied(failed);
});

test('scoped canonical proof refuses missing failed skipped changed or hidden mandatory source and database evidence',async()=>{
 for(const mode of ['missing','failed','skipped','attempt','source','step','duplicate','private-step','security','cancelled','extra-job','page-count','page-empty']){
  const result=await runCanonicalJobFixture('schema',value=>{const database=value.jobs.find(row=>row.name==='database-checks')!;if(mode==='missing'){value.jobs.splice(value.jobs.indexOf(database),1);value.run.status='completed';value.run.conclusion='failure';}if(mode==='failed')database.conclusion='failure';if(mode==='skipped')(database.steps as {conclusion:string}[])[5].conclusion='skipped';if(mode==='attempt')database.run_attempt=1;if(mode==='source')database.head_sha='b'.repeat(40);if(mode==='step')(database.steps as {name:string}[])[5].name='Run echo bypass';if(mode==='duplicate')value.jobs.push({...database,id:999});if(mode==='private-step')(database.steps as unknown[]).push({name:'Leak private context',number:99,status:'completed',conclusion:'success'});if(mode==='security')value.jobs.find(row=>row.name==='codeql')!.conclusion='failure';if(mode==='cancelled'){value.run.status='completed';value.run.conclusion='cancelled';}if(mode==='extra-job')value.jobs.push({...database,id:999,name:'untrusted-job'});},{metadataMutation:mode==='page-count'?{kind:'PAGE_COUNT'}:mode==='page-empty'?{kind:'PAGE_EMPTY'}:undefined});denied(result,mode,mode==='page-count'?'FIXTURE_METADATA_PAGE_COUNT':mode==='page-empty'?'FIXTURE_METADATA_PAGE_EMPTY':undefined);
 }
});

test('settled original proof refuses run job or main drift and never exposes raw transport errors',async()=>{
 for(const mode of ['wrong-main','run-drift','job-drift','archive','error']){const kind=mode==='wrong-main'?'WRONG_MAIN':mode==='run-drift'?'RUN_ATTEMPT_DRIFT':mode==='job-drift'?'JOB_DRIFT':mode==='error'?'PRIVATE_ERROR':undefined;const result=await runCanonicalJobFixture('schema',undefined,{metadataMutation:kind?{kind}:undefined,artifactMutation:mode==='archive'?'INVALID_JSON':undefined});denied(result,mode,kind?'FIXTURE_METADATA_'+kind:'FIXTURE_ARTIFACT_INVALID_JSON');assert.equal(result.stderr.includes('PRIVATE credential'),false);}
});

test('canonical schema refuses checkout mutation after source artifacts during final outer metadata reads',async()=>{
 for(const boundary of ['main','jobs']as const)for(const mode of ['head','replace','graft','dirty']as const){
  const result=await runCanonicalJobFixture('schema',undefined,{metadataMutation:{kind:'CHECKOUT',boundary,reads:boundary==='main'?5:3,mutation:mode}});
  denied(result,boundary+': '+mode,'LATE_OUTER_CHECKOUT_MUTATION');
 }
});

test('pending canonical schema refuses checkout mutation during its final diagnostic metadata read',async()=>{
 for(const mode of ['head','replace','graft','dirty']as const){
  const result=await runCanonicalJobFixture('schema',value=>Object.assign(value.jobs.find(row=>row.name==='database-checks')!,{status:'in_progress',conclusion:null}),{artifactMutation:'FORBIDDEN',metadataMutation:{kind:'CHECKOUT',boundary:'main',reads:3,mutation:mode}});
  denied(result,mode,'LATE_OUTER_CHECKOUT_MUTATION');assert.equal(result.stderr.includes('FIXTURE_ARTIFACT_FORBIDDEN'),false);
 }
});
