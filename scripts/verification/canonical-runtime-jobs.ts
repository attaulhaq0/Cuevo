import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ciRuntimeJobs} from './verification-workflows';
import {canonicalReleaseExecutionJson,canonicalReleaseReviewJson} from './release-review';

const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sha=z.string().regex(/^[a-f0-9]{40}$/);
const runSchema=z.object({id:positive,run_attempt:positive,head_sha:sha,head_branch:z.literal('main'),event:z.literal('push'),path:z.literal('.github/workflows/ci.yml'),status:z.literal('completed'),conclusion:z.literal('success'),repository:z.object({full_name:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)})});
const stepSchema=z.object({name:z.string(),number:positive,status:z.literal('completed'),conclusion:z.enum(['success','skipped'])});
const jobSchema=z.object({id:positive,name:z.string(),run_id:positive,run_attempt:positive,head_sha:sha,head_branch:z.literal('main'),status:z.literal('completed'),conclusion:z.enum(['success','skipped']),steps:z.array(stepSchema).max(100)});
const fail=()=>Error('Canonical isolated runtime source and original job attempt require review.');
/** Current official GET facade is supplied by the native admission owner.
 * Raw run_attempt must be retained; normalized legacy run metadata is refused. */
export async function readCanonicalRuntimeJobs(value:unknown,github:(path:string)=>Promise<unknown>):Promise<{runAttempt:number;jobsSha256:string}>{
 try{
  const run=runSchema.parse(JSON.parse(canonicalReleaseReviewJson(value))),path=`actions/runs/${run.id}`,same=(left:unknown,right:unknown)=>canonicalReleaseReviewJson(left)===canonicalReleaseReviewJson(right);
  const current=async()=>{if(!same(runSchema.parse(await github(path)),run))throw fail();};await current();
  const jobs:z.infer<typeof jobSchema>[]=[];let total:number|undefined;
  for(let page=1;page<=10;page++){
   const response=z.object({total_count:positive.max(1000),jobs:z.array(jobSchema).max(100)}).parse(JSON.parse(canonicalReleaseExecutionJson(await github(`${path}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`))));
   if(total!==undefined&&response.total_count!==total||!response.jobs.length)throw fail();total=response.total_count;jobs.push(...response.jobs);if(jobs.length>total)throw fail();if(jobs.length===total)break;if(response.jobs.length!==100||page===10)throw fail();
  }
  if(jobs.length!==total||new Set(jobs.map(job=>job.id)).size!==jobs.length||new Set(jobs.map(job=>job.name)).size!==jobs.length)throw fail();
  const required=['fast-checks','runtime-backend','runtime-browser','technical-mvp','codeql','secret-scan','required'];
  if(jobs.length<7||jobs.length>8||required.some(name=>!jobs.some(job=>job.name===name))||jobs.some(job=>!required.includes(job.name)&&job.name!=='dependency-review'))throw fail();
  for(const job of jobs){if(job.run_id!==run.id||job.run_attempt!==run.run_attempt||job.head_sha!==run.head_sha)throw fail();if(job.name==='dependency-review'){if(job.conclusion!=='skipped'||job.steps.length)throw fail();}else if(job.conclusion!=='success'||!job.steps.length||job.steps.some(step=>step.conclusion!=='success'&&!step.name.startsWith('Post ')))throw fail();}
  const selected=jobs.filter(job=>Object.hasOwn(ciRuntimeJobs,job.name));if(selected.length!==3)throw fail();
  for(const job of selected){
   if(job.run_id!==run.id||job.run_attempt!==run.run_attempt||job.head_sha!==run.head_sha)throw fail();
   const contract=ciRuntimeJobs[job.name as keyof typeof ciRuntimeJobs],required=contract.steps.map(step=>'name' in step?step.name:`Run ${'uses' in step?step.uses:step.run}`),actions=contract.steps.filter(step=>'uses' in step).map(step=>'name' in step?step.name:`Run ${'uses' in step?step.uses:''}`);
   const authored:string[]=[],names=new Set<string>(),numbers=new Set<number>();
   for(const[index,step]of job.steps.entries()){
    if(names.has(step.name)||numbers.has(step.number)||index>0&&step.number<=job.steps[index-1].number)throw fail();names.add(step.name);numbers.add(step.number);
    if(required.includes(step.name)){if(step.conclusion!=='success')throw fail();authored.push(step.name);}
    else if(['Set up job','Complete job'].includes(step.name)){if(step.conclusion!=='success')throw fail();}
    else if(!actions.some(action=>step.name==='Post '+action))throw fail();
   }
   if(!same(required,authored))throw fail();
  }
  await current();return{runAttempt:run.run_attempt,jobsSha256:createHash('sha256').update(canonicalReleaseReviewJson({repository:run.repository.full_name,sourceSha:run.head_sha,runId:run.id,runAttempt:run.run_attempt,jobs:jobs.sort((left,right)=>left.name.localeCompare(right.name))})).digest('hex')};
 }catch{throw fail();}
}
