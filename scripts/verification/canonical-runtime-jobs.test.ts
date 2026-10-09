import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runCanonicalJobFixture} from './canonical-source-job-fixtures';
import {createHash} from 'node:crypto';
import {canonicalReleaseExecutionJson} from './release-review';

test('canonical runtime admission binds original run attempt and every successful isolated lane and source artifact',async()=>{
 const positive=await runCanonicalJobFixture('runtime');assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).runAttempt,2);assert.match(JSON.parse(positive.stdout).jobsSha256,/^[a-f0-9]{64}$/);
 const skipped=await runCanonicalJobFixture('runtime',value=>value.jobs.push({id:999,name:'dependency-review',run_id:31,run_attempt:2,head_sha:value.run.head_sha,head_branch:'main',status:'completed',conclusion:'skipped',steps:[]}));assert.equal(skipped.status,0,skipped.stderr);
 for(const mode of ['attempt-missing','attempt','missing','skipped','extra','missing-security','failed-security','extra-job','dependency','missing-artifact']){
  const result=await runCanonicalJobFixture('runtime',value=>{if(mode==='attempt-missing')delete value.run.run_attempt;if(mode==='attempt')value.jobs[0].run_attempt=1;if(mode==='missing')value.jobs.pop();if(mode==='skipped')(value.jobs[0].steps as {conclusion:string}[])[5].conclusion='skipped';if(mode==='extra')(value.jobs[0].steps as unknown[]).push({name:'Unreviewed shell',number:99,status:'completed',conclusion:'success'});if(mode==='missing-security')value.jobs.splice(value.jobs.findIndex(row=>row.name==='codeql'),1);if(mode==='failed-security')value.jobs.find(row=>row.name==='secret-scan')!.conclusion='failure';if(mode==='extra-job')value.jobs.push({...value.jobs[0],id:999,name:'unreviewed-job'});if(mode==='dependency')value.jobs.push({id:999,name:'dependency-review',run_id:31,run_attempt:2,head_sha:value.run.head_sha,head_branch:'main',status:'completed',conclusion:'success',steps:[]});if(mode==='missing-artifact')value.artifacts.splice(value.artifacts.findIndex(row=>row.name==='cuevo-source-contracts-31-2'),1);});assert.notEqual(result.status,0,mode);
 }
 const drift=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:"(path,reads,value)=>path==='actions/runs/31'&&reads>1?{...value,run_attempt:3}:value"});assert.notEqual(drift.status,0);
});

test('canonical admission requires all three independently successful source producers and their exact original aggregate',async()=>{
 for(const mode of ['missing','failed','skipped','attempt','source','command','duplicate','order','cancelled','summary']){
  const result=await runCanonicalJobFixture('runtime',value=>{const producer=value.jobs.find(row=>row.name==='source-fixtures-contracts')!;if(mode==='missing')value.jobs.splice(value.jobs.indexOf(producer),1);if(mode==='failed'||mode==='skipped')producer.conclusion=mode==='failed'?'failure':'skipped';if(mode==='attempt')producer.run_attempt=1;if(mode==='source')producer.head_sha='b'.repeat(40);if(mode==='command')(producer.steps as {name:string}[]).find(step=>step.name.startsWith('Verify exact'))!.name='Run echo omitted';if(mode==='duplicate')value.jobs.push({...producer,id:999});if(mode==='order')(producer.steps as unknown[]).reverse();if(mode==='cancelled')producer.status='cancelled';if(mode==='summary')(value.bodies[0] as {status:string}).status='FAILED';});assert.notEqual(result.status,0,mode);
 }
});

test('canonical runtime refuses checkout mutation during its final outer run and job reads',async()=>{
 for(const boundary of ['run','jobs'])for(const mode of ['head','replace','graft','dirty']){
  const result=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:`(path,reads,value,input)=>{if(${JSON.stringify(boundary)}==='run'?path==='actions/runs/31'&&reads===2:path.includes('/jobs?')&&reads===2){const fs=process.getBuiltinModule('fs'),exec=process.getBuiltinModule('child_process').execFileSync,git=args=>exec('git',args,{encoding:'utf8',windowsHide:true});console.error('LATE_OUTER_CHECKOUT_MUTATION');if(${JSON.stringify(mode)}==='head'){fs.writeFileSync('late-source.txt','changed source');git(['add','late-source.txt']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Late source change']);}if(${JSON.stringify(mode)}==='replace')git(['update-ref','refs/replace/'+input.run.head_sha,input.run.head_sha]);if(${JSON.stringify(mode)}==='graft')fs.writeFileSync(git(['rev-parse','--git-path','info/grafts']).trim(),'untrusted graft');if(${JSON.stringify(mode)}==='dirty')fs.writeFileSync('late-untracked.txt','unreviewed source');}return value;}`});
  assert.match(result.stderr,/LATE_OUTER_CHECKOUT_MUTATION/,boundary+': '+mode);assert.notEqual(result.status,0,boundary+': '+mode);
 }
});

test('historical canonical runtime preserves a distinct current checkout through the final outer metadata boundary',async()=>{
 const stable=await runCanonicalJobFixture('runtime',undefined,{sourcePurpose:'ORIGINAL_RUNTIME_METADATA',advanceCheckout:true});assert.equal(stable.status,0,stable.stderr);assert.equal(JSON.parse(stable.stdout).runAttempt,2);
 const current=await runCanonicalJobFixture('runtime',undefined,{advanceCheckout:true});assert.notEqual(current.status,0);
 for(const boundary of ['run','jobs']){
  const changed=await runCanonicalJobFixture('runtime',undefined,{sourcePurpose:'ORIGINAL_RUNTIME_METADATA',advanceCheckout:true,metadataMutation:`(path,reads,value)=>{if(${JSON.stringify(boundary)}==='run'?path==='actions/runs/31'&&reads===2:path.includes('/jobs?')&&reads===2){const fs=process.getBuiltinModule('fs'),exec=process.getBuiltinModule('child_process').execFileSync,git=args=>exec('git',args,{encoding:'utf8',windowsHide:true});console.error('LATE_HISTORICAL_CHECKOUT_MUTATION');fs.writeFileSync('changed-current.txt','changed current checkout');git(['add','changed-current.txt']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Late historical observer checkout change']);}return value;}`});assert.match(changed.stderr,/LATE_HISTORICAL_CHECKOUT_MUTATION/);assert.notEqual(changed.status,0,boundary);
 }
});

test('canonical runtime requires all six original runtime archives and binds their coherent source claims to Git',async()=>{
 for(const name of ['cuevo-runtime-backend-31-2','cuevo-runtime-browser-31-2','cuevo-runtime-database-31-2','cuevo-integration-integration-learning-31-2','cuevo-integration-integration-state-31-2','cuevo-runtime-aggregate-31-2']){
  const missing=await runCanonicalJobFixture('runtime',value=>value.artifacts.splice(value.artifacts.findIndex(row=>row.name===name),1));assert.notEqual(missing.status,0,name);
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
 });assert.notEqual(changed.status,0,'Coherent runtime claims must match actual Git source digest.');
 const drift=await runCanonicalJobFixture('runtime',undefined,{metadataMutation:"(path,reads,value)=>path.includes('/artifacts?')&&reads===4?{...value,artifacts:value.artifacts.map(row=>row.name==='cuevo-runtime-aggregate-31-2'?{...row,digest:'sha256:'+'0'.repeat(64)}:row)}:value"});assert.notEqual(drift.status,0,'Last runtime archive metadata must remain unchanged.');
});

test('historical runtime uses the original integration inventory after a new committed inventory is added',async()=>{
 const historical=await runCanonicalJobFixture('runtime',undefined,{sourcePurpose:'ORIGINAL_RUNTIME_METADATA',advanceIntegrationInventory:true});assert.equal(historical.status,0,historical.stderr);
 const current=await runCanonicalJobFixture('runtime',undefined,{advanceIntegrationInventory:true});assert.notEqual(current.status,0,'Current source cannot borrow an old integration inventory.');
});

test('canonical runtime final metadata refresh retains original archives without another download',async()=>{
 const positive=await runCanonicalJobFixture('runtime',undefined,{guarded:true});assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).archiveReads,10);
 for(const mode of ['source-artifact','runtime-artifact','expiry','job','run']){
  const result=await runCanonicalJobFixture('runtime',undefined,{guarded:true,guardMutation:`(path,reads,value,input,refreshing)=>{if(!refreshing)return value;if(${JSON.stringify(mode)}==='run'&&path==='actions/runs/31')return{...value,run_attempt:3};if(${JSON.stringify(mode)}==='job'&&path.includes('/jobs?'))return{...value,jobs:value.jobs.map(row=>row.name==='runtime-backend'?{...row,conclusion:'failure'}:row)};if(['source-artifact','runtime-artifact','expiry'].includes(${JSON.stringify(mode)})&&path.includes('/artifacts?'))return{...value,artifacts:value.artifacts.map(row=>row.name===(${JSON.stringify(mode)}==='source-artifact'?'cuevo-source-contracts-31-2':'cuevo-runtime-aggregate-31-2')?{...row,...(${JSON.stringify(mode)}==='expiry'?{expires_at:'2026-10-01T00:00:00Z'}:{digest:'sha256:'+'0'.repeat(64)})}:row)};return value;}`});assert.notEqual(result.status,0,mode);
 }
});

test('canonical runtime refuses artifact expiry occurring during its final run observation',async()=>{
 const result=await runCanonicalJobFixture('runtime',undefined,{guarded:true,guardMutation:"(path,reads,value,input,refreshing)=>{if(refreshing&&path==='actions/runs/31'){console.error('FINAL_ORIGINAL_ARTIFACT_EXPIRED');Date.now=()=>Date.parse('2026-11-02T00:00:00Z');}return value;}"});assert.match(result.stderr,/FINAL_ORIGINAL_ARTIFACT_EXPIRED/);assert.notEqual(result.status,0);
});
