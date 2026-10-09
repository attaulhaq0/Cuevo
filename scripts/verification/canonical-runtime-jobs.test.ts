import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runCanonicalJobFixture,type CanonicalMetadataMutation} from './canonical-source-job-fixtures';
import {createHash} from 'node:crypto';
import {canonicalReleaseExecutionJson} from './release-review';
function denied(result:Awaited<ReturnType<typeof runCanonicalJobFixture>>,label='',marker?:string){assert.match(result.stderr,/FIXTURE_CANONICAL_READER_ENTERED/,label);assert.equal(result.stderr.includes('SyntaxError'),false,label);if(marker)assert.ok(result.stderr.includes(marker),label+': '+result.stderr);assert.notEqual(result.status,0,label);}

test('canonical runtime admission binds original run attempt and every successful isolated lane and source artifact',async()=>{
 const positive=await runCanonicalJobFixture('runtime');assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).runAttempt,2);assert.match(JSON.parse(positive.stdout).jobsSha256,/^[a-f0-9]{64}$/);
 const skipped=await runCanonicalJobFixture('runtime',value=>value.jobs.push({id:999,name:'dependency-review',run_id:31,run_attempt:2,head_sha:value.run.head_sha,head_branch:'main',status:'completed',conclusion:'skipped',steps:[]}));assert.equal(skipped.status,0,skipped.stderr);
 for(const mode of ['attempt-missing','attempt','missing','skipped','extra','missing-security','failed-security','extra-job','dependency','missing-artifact']){
  const result=await runCanonicalJobFixture('runtime',value=>{if(mode==='attempt-missing')delete value.run.run_attempt;if(mode==='attempt')value.jobs[0].run_attempt=1;if(mode==='missing')value.jobs.pop();if(mode==='skipped')(value.jobs[0].steps as {conclusion:string}[])[5].conclusion='skipped';if(mode==='extra')(value.jobs[0].steps as unknown[]).push({name:'Unreviewed shell',number:99,status:'completed',conclusion:'success'});if(mode==='missing-security')value.jobs.splice(value.jobs.findIndex(row=>row.name==='codeql'),1);if(mode==='failed-security')value.jobs.find(row=>row.name==='secret-scan')!.conclusion='failure';if(mode==='extra-job')value.jobs.push({...value.jobs[0],id:999,name:'unreviewed-job'});if(mode==='dependency')value.jobs.push({id:999,name:'dependency-review',run_id:31,run_attempt:2,head_sha:value.run.head_sha,head_branch:'main',status:'completed',conclusion:'success',steps:[]});if(mode==='missing-artifact')value.artifacts.splice(value.artifacts.findIndex(row=>row.name==='cuevo-source-contracts-31-2'),1);});denied(result,mode);
 }
 const drift=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:{kind:'RUN_ATTEMPT_DRIFT'}});denied(drift,'run drift','FIXTURE_METADATA_RUN_ATTEMPT_DRIFT');
});

test('canonical admission requires all three independently successful source producers and their exact original aggregate',async()=>{
 for(const mode of ['missing','failed','skipped','attempt','source','command','duplicate','order','cancelled','summary']){
  const result=await runCanonicalJobFixture('runtime',value=>{const producer=value.jobs.find(row=>row.name==='source-fixtures-contracts')!;if(mode==='missing')value.jobs.splice(value.jobs.indexOf(producer),1);if(mode==='failed'||mode==='skipped')producer.conclusion=mode==='failed'?'failure':'skipped';if(mode==='attempt')producer.run_attempt=1;if(mode==='source')producer.head_sha='b'.repeat(40);if(mode==='command')(producer.steps as {name:string}[]).find(step=>step.name.startsWith('Verify exact'))!.name='Run echo omitted';if(mode==='duplicate')value.jobs.push({...producer,id:999});if(mode==='order')(producer.steps as unknown[]).reverse();if(mode==='cancelled')producer.status='cancelled';if(mode==='summary')(value.bodies[0] as {status:string}).status='FAILED';});denied(result,mode);
 }
});

test('canonical runtime refuses checkout mutation during its final outer run and job reads',async()=>{
 for(const boundary of ['run','jobs']as const)for(const mode of ['head','replace','graft','dirty']as const){
  const result=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:{kind:'CHECKOUT',boundary,reads:2,mutation:mode}});
  denied(result,boundary+': '+mode,'LATE_OUTER_CHECKOUT_MUTATION');
 }
});

test('historical canonical runtime preserves a distinct current checkout through the final outer metadata boundary',async()=>{
 const stable=await runCanonicalJobFixture('runtime',undefined,{sourcePurpose:'ORIGINAL_RUNTIME_METADATA',advanceCheckout:true});assert.equal(stable.status,0,stable.stderr);assert.equal(JSON.parse(stable.stdout).runAttempt,2);
 const current=await runCanonicalJobFixture('runtime',undefined,{advanceCheckout:true});denied(current);
 for(const boundary of ['run','jobs']as const){
  const changed=await runCanonicalJobFixture('runtime',undefined,{sourcePurpose:'ORIGINAL_RUNTIME_METADATA',advanceCheckout:true,metadataMutation:{kind:'CHECKOUT',boundary,reads:2,mutation:'historical-head'}});denied(changed,boundary,'LATE_HISTORICAL_CHECKOUT_MUTATION');
 }
});

test('canonical runtime requires all six original runtime archives and binds their coherent source claims to Git',async()=>{
 for(const name of ['cuevo-runtime-backend-31-2','cuevo-runtime-browser-31-2','cuevo-runtime-database-31-2','cuevo-integration-integration-learning-31-2','cuevo-integration-integration-state-31-2','cuevo-runtime-aggregate-31-2']){
  const missing=await runCanonicalJobFixture('runtime',value=>value.artifacts.splice(value.artifacts.findIndex(row=>row.name===name),1));denied(missing,name);
 }
 const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
 const changed=await runCanonicalJobFixture('runtime',value=>{
  const digest='0'.repeat(64),lanes=[4,6,7].map(index=>value.bodies[index]as Record<string,unknown>),partitions=[8,9].map(index=>value.bodies[index]as Record<string,unknown>),aggregate=value.bodies[10]as Record<string,unknown>;
  for(const lane of lanes)lane.sourceDigest=digest;
  for(const receipt of partitions){(receipt.identity as Record<string,unknown>).sourceDigest=digest;const{payloadSha256:_hash,...body}=receipt;void _hash;receipt.payloadSha256=hash(body);}
  (aggregate.identity as Record<string,unknown>).sourceDigest=digest;
  (aggregate.integration as Record<string,unknown>).partitions=partitions.map(receipt=>({partition:receipt.partition,job:(receipt.identity as Record<string,unknown>).job,payloadSha256:receipt.payloadSha256,receiptSha256:hash(receipt),inventorySha256:receipt.inventorySha256,reportSha256:receipt.reportSha256,diagnosticsSha256:receipt.diagnosticsSha256})).sort((a,b)=>String(a.partition).localeCompare(String(b.partition)));
  aggregate.runtime=lanes.map(lane=>({lane:lane.lane,receiptSha256:hash(lane)})).sort((a,b)=>String(a.lane).localeCompare(String(b.lane)));
  const{payloadSha256:_hash,...body}=aggregate;void _hash;aggregate.payloadSha256=hash(body);
 });denied(changed,'Coherent runtime claims must match actual Git source digest.');
 const drift=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:{kind:'LAST_RUNTIME_ARTIFACT_DRIFT'}});denied(drift,'Last runtime archive metadata must remain unchanged.','FIXTURE_METADATA_LAST_RUNTIME_ARTIFACT_DRIFT');
});

test('historical runtime uses the original integration inventory after a new committed inventory is added',async()=>{
 const historical=await runCanonicalJobFixture('runtime',undefined,{sourcePurpose:'ORIGINAL_RUNTIME_METADATA',advanceIntegrationInventory:true});assert.equal(historical.status,0,historical.stderr);
 const current=await runCanonicalJobFixture('runtime',undefined,{advanceIntegrationInventory:true});denied(current,'Current source cannot borrow an old integration inventory.');
});

test('canonical runtime final metadata refresh retains original archives without another download',async()=>{
 const positive=await runCanonicalJobFixture('runtime',undefined,{guarded:true});assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).archiveReads,10);
 for(const mode of ['source-artifact','runtime-artifact','expiry','job','run']as const){
  const result=await runCanonicalJobFixture('runtime',undefined,{guarded:true,guardMutation:{kind:'GUARDED_RUNTIME',mode}});denied(result,mode,'FIXTURE_METADATA_GUARDED_RUNTIME');
 }
});

test('canonical runtime refuses artifact expiry occurring during its final run observation',async()=>{
 const result=await runCanonicalJobFixture('runtime',undefined,{guarded:true,guardMutation:{kind:'FINAL_RUNTIME_EXPIRY'}});denied(result,'expiry','FINAL_ORIGINAL_ARTIFACT_EXPIRED');
});

test('canonical fixture rejects unknown nested modes as data before reader execution',async()=>{
 for(const mutation of [{kind:'GUARDED_RUNTIME',mode:'untrusted'}, {kind:'GUARDED_SCHEMA',mode:'untrusted'}, {kind:'CHECKOUT',boundary:'untrusted',reads:2,mutation:'head'}, {kind:'CHECKOUT',boundary:'run',reads:2,mutation:'untrusted'}, {kind:'CHECKOUT',boundary:'run',reads:99,mutation:'head'}]){
  const result=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:mutation as unknown as CanonicalMetadataMutation});assert.notEqual(result.status,0);assert.match(result.stderr,/FIXTURE_MODE_INVALID/);assert.equal(result.stderr.includes('FIXTURE_CANONICAL_READER_ENTERED'),false);assert.equal(result.stderr.includes('SyntaxError'),false);
 }
});
