import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runCanonicalJobFixture} from './canonical-source-job-fixtures';

test('schema metadata refresh preserves required original evidence without downloading or waiting for runtime',async()=>{
 const positive=await runCanonicalJobFixture('schema',undefined,{guarded:true,guardMutation:"(path,reads,value,input,refreshing)=>refreshing&&path.includes('/jobs?')?{...value,jobs:[...value.jobs,{id:999,name:'runtime-backend',run_id:31,run_attempt:2,head_sha:input.run.head_sha,head_branch:'main',status:'in_progress',conclusion:null,started_at:null,completed_at:null,steps:[]}],total_count:value.total_count+1}:value"});assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).archiveReads,6);
 for(const mode of ['source','database','security','job','run']){
  const result=await runCanonicalJobFixture('schema',undefined,{guarded:true,guardMutation:`(path,reads,value,input,refreshing)=>{if(!refreshing)return value;if(${JSON.stringify(mode)}==='run'&&path==='actions/runs/31')return{...value,run_attempt:3};if(${JSON.stringify(mode)}==='job'&&path.includes('/jobs?'))return{...value,jobs:value.jobs.map(row=>row.name==='source-contracts'?{...row,conclusion:'failure'}:row)};if(['source','database','security'].includes(${JSON.stringify(mode)})&&path.includes('/artifacts?'))return{...value,artifacts:value.artifacts.map(row=>row.name===(${JSON.stringify(mode)}==='source'?'cuevo-source-contracts-31-2':${JSON.stringify(mode)}==='database'?'cuevo-runtime-database-31-2':'cuevo-codeql-31-2')?{...row,digest:'sha256:'+'0'.repeat(64)}:row)};return value;}`});assert.notEqual(result.status,0,mode);
 }
});

test('canonical schema refuses original artifact expiry during its final source observation',async()=>{
 const result=await runCanonicalJobFixture('schema',undefined,{guarded:true,guardMutation:"(path,reads,value,input,refreshing)=>{if(refreshing&&path==='git/ref/heads/main'){console.error('FINAL_SCHEMA_ARTIFACT_EXPIRED');Date.now=()=>Date.parse('2026-11-02T00:00:00Z');}return value;}"});assert.match(result.stderr,/FINAL_SCHEMA_ARTIFACT_EXPIRED/);assert.notEqual(result.status,0);
});

test('canonical source and database proof admits original archives while unrelated runtime may still run or fail',async()=>{
 const original=await runCanonicalJobFixture('schema');assert.equal(original.status,0,original.stderr);assert.equal(JSON.parse(original.stdout).status,'VERIFIED');assert.equal(JSON.parse(original.stdout).runAttempt,2);
 for(const failed of [false,true]){const result=await runCanonicalJobFixture('schema',value=>{value.jobs.push({id:999,name:'runtime-backend',run_id:31,run_attempt:2,head_sha:value.run.head_sha,head_branch:'main',status:'in_progress',conclusion:null,started_at:null,completed_at:null,steps:[]});if(failed){value.run.status='completed';value.run.conclusion='failure';}});assert.equal(result.status,0,result.stderr);}
});

test('canonical database proof requires its original exact same source run attempt lane archive',async()=>{
 for(const mode of ['missing','attempt','source','tree','row','failed','private','noncanonical','filename','expiry','window','metadata-source']){
  const result=await runCanonicalJobFixture('schema',value=>{const lane=value.bodies[4]as Record<string,unknown>;if(mode==='missing')value.artifacts.splice(value.artifacts.findIndex(row=>row.id===75),1);if(mode==='attempt')lane.runAttempt=1;if(mode==='source')lane.sourceSha='d'.repeat(40);if(mode==='tree')lane.treeSha='d'.repeat(40);if(mode==='row')(lane.rows as unknown[]).pop();if(mode==='failed')(lane.rows as {exitCode:number}[])[0].exitCode=1;if(mode==='private')lane.privateConsole='private-canary';const item=value.artifacts.find(row=>row.id===75);if(item){if(mode==='expiry')item.expires_at='2026-10-07T00:00:00Z';if(mode==='window')item.created_at='2026-10-08T00:03:00Z';if(mode==='metadata-source')(item.workflow_run as {head_sha:string}).head_sha='d'.repeat(40);}}, {noncanonical:mode==='noncanonical',archiveName:mode==='filename'?'other.json':undefined});assert.notEqual(result.status,0,mode);assert.equal(result.stderr.includes('private-canary'),false);
 }
 for(const mode of ['metadata-drift','tree-drift']){const result=await runCanonicalJobFixture('schema',undefined,{metadataMutation:mode==='metadata-drift'?"(path,reads,value)=>path.includes('artifacts?')&&reads>1?{...value,artifacts:value.artifacts.map(row=>row.id===75?{...row,id:99}:row)}:value":"(path,reads,value)=>path.startsWith('git/commits/')&&reads>1?{...value,tree:{sha:'d'.repeat(40)}}:value"});assert.notEqual(result.status,0,mode);}
});

test('pending canonical producers have explicit not ready metadata without downloading artifacts or borrowing failed work',async()=>{
 const pending=await runCanonicalJobFixture('schema',value=>Object.assign(value.jobs.find(row=>row.name==='database-checks')!,{status:'in_progress',conclusion:null}),{artifactMutation:"()=>{throw Error('Artifact download forbidden while pending');}"});assert.equal(pending.status,0,pending.stderr);assert.deepEqual(JSON.parse(pending.stdout).pendingJobs,['database-checks']);
 const failed=await runCanonicalJobFixture('schema',value=>Object.assign(value.jobs.find(row=>row.name==='database-checks')!,{conclusion:'failure'}));assert.notEqual(failed.status,0);
});

test('scoped canonical proof refuses missing failed skipped changed or hidden mandatory source and database evidence',async()=>{
 for(const mode of ['missing','failed','skipped','attempt','source','step','duplicate','private-step','security','cancelled','extra-job','page-count','page-empty']){
  const result=await runCanonicalJobFixture('schema',value=>{const database=value.jobs.find(row=>row.name==='database-checks')!;if(mode==='missing'){value.jobs.splice(value.jobs.indexOf(database),1);value.run.status='completed';value.run.conclusion='failure';}if(mode==='failed')database.conclusion='failure';if(mode==='skipped')(database.steps as {conclusion:string}[])[5].conclusion='skipped';if(mode==='attempt')database.run_attempt=1;if(mode==='source')database.head_sha='b'.repeat(40);if(mode==='step')(database.steps as {name:string}[])[5].name='Run echo bypass';if(mode==='duplicate')value.jobs.push({...database,id:999});if(mode==='private-step')(database.steps as unknown[]).push({name:'Leak private context',number:99,status:'completed',conclusion:'success'});if(mode==='security')value.jobs.find(row=>row.name==='codeql')!.conclusion='failure';if(mode==='cancelled'){value.run.status='completed';value.run.conclusion='cancelled';}if(mode==='extra-job')value.jobs.push({...database,id:999,name:'untrusted-job'});},{metadataMutation:mode==='page-count'?"(path,reads,value)=>path.includes('jobs?')?{...value,total_count:value.total_count+1}:value":mode==='page-empty'?"(path,reads,value)=>path.includes('jobs?')?{...value,jobs:[]}:value":undefined});assert.notEqual(result.status,0,mode);
 }
});

test('settled original proof refuses run job or main drift and never exposes raw transport errors',async()=>{
 for(const mode of ['wrong-main','run-drift','job-drift','archive','error']){const result=await runCanonicalJobFixture('schema',undefined,{metadataMutation:mode==='wrong-main'?"(path,reads,value)=>path==='git/ref/heads/main'?{object:{type:'commit',sha:'b'.repeat(40)}}:value":mode==='run-drift'?"(path,reads,value)=>path==='actions/runs/31'&&reads>1?{...value,run_attempt:3}:value":mode==='job-drift'?"(path,reads,value)=>path.includes('jobs?')&&reads>1?{...value,jobs:value.jobs.map(row=>row.name==='database-checks'?{...row,conclusion:'failure'}:row)}:value":mode==='error'?"()=>{throw Error('PRIVATE credential');}":undefined,artifactMutation:mode==='archive'?"()=>Buffer.from('{}')":undefined});assert.notEqual(result.status,0,mode);assert.equal(result.stderr.includes('PRIVATE credential'),false);}
});

test('canonical schema refuses checkout mutation after source artifacts during final outer metadata reads',async()=>{
 for(const boundary of ['main','jobs'])for(const mode of ['head','replace','graft','dirty']){
  const result=await runCanonicalJobFixture('schema',undefined,{metadataMutation:`(path,reads,value,input)=>{if(${JSON.stringify(boundary)}==='main'?path==='git/ref/heads/main'&&reads===5:path.includes('/jobs?')&&reads===3){const fs=process.getBuiltinModule('fs'),exec=process.getBuiltinModule('child_process').execFileSync,git=args=>exec('git',args,{encoding:'utf8',windowsHide:true});console.error('LATE_OUTER_CHECKOUT_MUTATION');if(${JSON.stringify(mode)}==='head'){fs.writeFileSync('late-source.txt','changed source');git(['add','late-source.txt']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Late source change']);}if(${JSON.stringify(mode)}==='replace')git(['update-ref','refs/replace/'+input.run.head_sha,input.run.head_sha]);if(${JSON.stringify(mode)}==='graft')fs.writeFileSync(git(['rev-parse','--git-path','info/grafts']).trim(),'untrusted graft');if(${JSON.stringify(mode)}==='dirty')fs.writeFileSync('late-untracked.txt','unreviewed source');}return value;}`});
  assert.match(result.stderr,/LATE_OUTER_CHECKOUT_MUTATION/,boundary+': '+mode);assert.notEqual(result.status,0,boundary+': '+mode);
 }
});

test('pending canonical schema refuses checkout mutation during its final diagnostic metadata read',async()=>{
 for(const mode of ['head','replace','graft','dirty']){
  const result=await runCanonicalJobFixture('schema',value=>Object.assign(value.jobs.find(row=>row.name==='database-checks')!,{status:'in_progress',conclusion:null}),{artifactMutation:"()=>{throw Error('Artifact download forbidden while pending');}",metadataMutation:`(path,reads,value,input)=>{if(path==='git/ref/heads/main'&&reads===3){const fs=process.getBuiltinModule('fs'),exec=process.getBuiltinModule('child_process').execFileSync,git=args=>exec('git',args,{encoding:'utf8',windowsHide:true});console.error('LATE_OUTER_CHECKOUT_MUTATION');if(${JSON.stringify(mode)}==='head'){fs.writeFileSync('late-source.txt','changed source');git(['add','late-source.txt']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Late source change']);}if(${JSON.stringify(mode)}==='replace')git(['update-ref','refs/replace/'+input.run.head_sha,input.run.head_sha]);if(${JSON.stringify(mode)}==='graft')fs.writeFileSync(git(['rev-parse','--git-path','info/grafts']).trim(),'untrusted graft');if(${JSON.stringify(mode)}==='dirty')fs.writeFileSync('late-untracked.txt','unreviewed source');}return value;}`});
  assert.match(result.stderr,/LATE_OUTER_CHECKOUT_MUTATION/,mode);assert.notEqual(result.status,0,mode);
 }
});
