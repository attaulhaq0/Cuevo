import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ciRuntimeJobs} from './verification-workflows';

test('canonical runtime admission binds original run attempt and every successful isolated lane step',async()=>{
 const {readCanonicalRuntimeJobs}=await import('./canonical-runtime-jobs');
 const run={id:31,run_attempt:2,head_sha:'a'.repeat(40),head_branch:'main',event:'push',path:'.github/workflows/ci.yml',status:'completed',conclusion:'success',repository:{full_name:'owner/repo'}};
 const jobs=Object.entries(ciRuntimeJobs).map(([name,job],index)=>({id:index+1,name,run_id:31,run_attempt:2,head_sha:run.head_sha,head_branch:'main',status:'completed',conclusion:'success',steps:job.steps.map((step,position)=>({name:'name' in step?step.name:`Run ${'uses' in step?step.uses:step.run}`,number:position+1,status:'completed',conclusion:'success'}))}));
 for(const[name,index]of ['fast-checks','codeql','secret-scan','required'].map((name,index)=>[name,index] as const))jobs.push({id:10+index,name,run_id:31,run_attempt:2,head_sha:run.head_sha,head_branch:'main',status:'completed',conclusion:'success',steps:[{name:'Required source-owned check',number:1,status:'completed',conclusion:'success'}]});
 const get=async(path:string)=>path==='actions/runs/31'?run:{total_count:jobs.length,jobs};
 const result=await readCanonicalRuntimeJobs(run,get);assert.equal(result.runAttempt,2);assert.match(result.jobsSha256,/^[a-f0-9]{64}$/);
 const skippedDependency={id:99,name:'dependency-review',run_id:31,run_attempt:2,head_sha:run.head_sha,head_branch:'main',status:'completed',conclusion:'skipped',steps:[]};
 assert.equal((await readCanonicalRuntimeJobs(run,async(path)=>path==='actions/runs/31'?run:{total_count:8,jobs:[...jobs,skippedDependency]})).runAttempt,2);
 await assert.rejects(readCanonicalRuntimeJobs(run,async(path)=>path==='actions/runs/31'?run:{total_count:8,jobs:[...jobs,{...skippedDependency,conclusion:'success'}]}));
 for(const mode of ['attempt-missing','attempt','missing','skipped','extra','drift','missing-security','failed-security','extra-job']){
  const current=structuredClone(run),rows=structuredClone(jobs);let reads=0;
  if(mode==='attempt-missing')delete(current as Partial<typeof run>).run_attempt;
  if(mode==='attempt')rows[0].run_attempt=1;if(mode==='missing')rows.pop();if(mode==='skipped')rows[0].steps[5].conclusion='skipped';if(mode==='extra')rows[0].steps.push({name:'Unreviewed shell',number:99,status:'completed',conclusion:'success'});
  if(mode==='missing-security')rows.splice(rows.findIndex(row=>row.name==='codeql'),1);if(mode==='failed-security')rows.find(row=>row.name==='secret-scan')!.conclusion='failure';if(mode==='extra-job')rows.push({...rows[3],id:99,name:'unreviewed-job'});
  await assert.rejects(readCanonicalRuntimeJobs(current,async(path:string)=>{if(path==='actions/runs/31'){reads++;return mode==='drift'&&reads>1?{...run,run_attempt:3}:run;}return{total_count:rows.length,jobs:rows};}),mode);
 }
});
