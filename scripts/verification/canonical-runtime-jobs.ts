import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ciRuntimeJobs,ciSourceJobs,ciDatabaseJob} from './verification-workflows';
import {canonicalReleaseExecutionJson,canonicalReleaseReviewJson} from './release-review';
import {captureCanonicalSourceContext,readCanonicalSourceArtifactsAndInputs} from './canonical-source-jobs';
import type {GithubArtifactReader} from './staging-security';
import {readLegacy752RuntimeMetadataAndGuard} from './canonical-source-legacy';
import {readSingleJsonArchive} from './single-json-archive';
import {validateTechnicalAggregateReceipt,validateCommittedTechnicalAggregateReceipt} from './runtime-lanes';
import {integrationIdentitySchema} from './integration-partitions';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {types} from 'node:util';

const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sha=z.string().regex(/^[a-f0-9]{40}$/);
const runSchema=z.object({id:positive,run_attempt:positive,head_sha:sha,head_branch:z.literal('main'),event:z.literal('push'),path:z.literal('.github/workflows/ci.yml'),status:z.literal('completed'),conclusion:z.literal('success'),repository:z.object({full_name:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)})});
const stepSchema=z.object({name:z.string(),number:positive,status:z.literal('completed'),conclusion:z.enum(['success','skipped'])});
const jobSchema=z.object({id:positive,name:z.string(),run_id:positive,run_attempt:positive,head_sha:sha,head_branch:z.literal('main'),status:z.literal('completed'),conclusion:z.enum(['success','skipped']),started_at:z.iso.datetime({offset:true}).nullable().optional(),completed_at:z.iso.datetime({offset:true}).nullable().optional(),steps:z.array(stepSchema).max(100)});
const fail=()=>Error('Canonical isolated runtime source and original job attempt require review.');
const contextBindingSchema=z.object({repoRoot:z.string(),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:sha,treeSha:sha,runId:z.string().regex(/^[1-9][0-9]*$/),runAttempt:positive,purpose:z.enum(['CURRENT_SOURCE','ORIGINAL_RUNTIME_METADATA'])}).strict();
export type CanonicalRuntimeContextBinding=z.infer<typeof contextBindingSchema>;
declare const canonicalRuntimeContextBrand:unique symbol;
export type CanonicalRuntimeContext={proof:{runAttempt:number;jobsSha256:string};refreshOriginalMetadata:()=>Promise<void>;assertOriginalValidity:()=>void;readonly[canonicalRuntimeContextBrand]:true};
type RegisteredCanonicalContext={binding:string;assert:()=>void;assertOriginal:()=>void;assertCompletion:()=>void;refresh:()=>Promise<void>;invalidate:()=>void;lease?:CanonicalRuntimeArtifactConsumption};
const canonicalContexts=new WeakMap<object,RegisteredCanonicalContext>();
declare const canonicalRuntimeArtifactConsumptionBrand:unique symbol;
export type CanonicalRuntimeArtifactConsumption={readonly[canonicalRuntimeArtifactConsumptionBrand]:true};
const canonicalArtifactConsumers=new WeakMap<object,{context:RegisteredCanonicalContext;completed:boolean}>();
function registerCanonicalRuntimeContext(binding:CanonicalRuntimeContextBinding,proof:CanonicalRuntimeContext['proof'],original:{assertOriginalValidity:()=>void;refreshOriginalMetadata:()=>Promise<void>},context:ReturnType<typeof captureCanonicalSourceContext>):CanonicalRuntimeContext{
 const originalProof=canonicalReleaseExecutionJson(proof);let invalid=false,refreshing=false;
 const assertOriginalValidity=()=>{try{if(invalid||canonicalReleaseExecutionJson(proof)!==originalProof)throw fail();context.finalMetadata();original.assertOriginalValidity();}catch{invalid=true;throw fail();}};
 const refreshOriginalMetadata=async(lease?:CanonicalRuntimeArtifactConsumption)=>{if(invalid||refreshing||registered?.lease!==lease){invalid=true;throw fail();}refreshing=true;try{assertOriginalValidity();await original.refreshOriginalMetadata();assertOriginalValidity();}catch{invalid=true;throw fail();}finally{refreshing=false;}};
 assertOriginalValidity();const guard=Object.freeze({proof,refreshOriginalMetadata:()=>refreshOriginalMetadata(),assertOriginalValidity}) as CanonicalRuntimeContext;const registered:RegisteredCanonicalContext={binding:canonicalReleaseExecutionJson(contextBindingSchema.parse(binding)),assert:()=>{if(refreshing||registered.lease){invalid=true;throw fail();}assertOriginalValidity();},assertOriginal:assertOriginalValidity,assertCompletion:()=>{if(refreshing){invalid=true;throw fail();}assertOriginalValidity();},refresh:()=>refreshOriginalMetadata(registered.lease),invalidate:()=>{invalid=true;}};canonicalContexts.set(guard,registered);return guard;
}
/** Only this owner's exact process-local context can reuse immutable archives. */
export function consumeCanonicalRuntimeContext(value:unknown,binding:CanonicalRuntimeContextBinding):CanonicalRuntimeContext{
 if(!value||typeof value!=='object'||types.isProxy(value))throw fail();const registered=canonicalContexts.get(value);if(!registered)throw fail();try{const checked=contextBindingSchema.parse(JSON.parse(canonicalReleaseExecutionJson(binding)));if(resolve(checked.repoRoot)!==checked.repoRoot||registered.binding!==canonicalReleaseExecutionJson(checked))throw fail();registered.assert();return value as CanonicalRuntimeContext;}catch{registered.invalidate();throw fail();}
}
/** One fixed artifact reader reserves its original context until terminal cleanup. */
export function beginCanonicalRuntimeArtifactConsumption(value:unknown,binding:CanonicalRuntimeContextBinding):CanonicalRuntimeArtifactConsumption{
 const guard=consumeCanonicalRuntimeContext(value,binding),context=canonicalContexts.get(guard)!;const lease=Object.freeze({}) as CanonicalRuntimeArtifactConsumption;context.lease=lease;canonicalArtifactConsumers.set(lease,{context,completed:false});return lease;
}
function canonicalArtifactConsumer(value:unknown){if(!value||typeof value!=='object'||types.isProxy(value))throw fail();const registered=canonicalArtifactConsumers.get(value);if(!registered||registered.completed||registered.context.lease!==value)throw fail();return registered;}
export async function refreshCanonicalRuntimeArtifactConsumption(value:CanonicalRuntimeArtifactConsumption){const registered=canonicalArtifactConsumer(value);try{await registered.context.refresh();}catch{registered.context.invalidate();throw fail();}}
export function completeCanonicalRuntimeArtifactConsumption(value:CanonicalRuntimeArtifactConsumption){const registered=canonicalArtifactConsumer(value);try{registered.context.assertCompletion();registered.completed=true;registered.context.lease=undefined;}catch{registered.context.invalidate();throw fail();}}
export function abortCanonicalRuntimeArtifactConsumption(value:CanonicalRuntimeArtifactConsumption){const registered=canonicalArtifactConsumer(value);registered.context.invalidate();registered.completed=true;registered.context.lease=undefined;}
const ciCanonicalJobs={...ciRuntimeJobs,...ciSourceJobs,'database-checks':ciDatabaseJob};
async function runtimeArtifacts(run:z.infer<typeof runSchema>,treeSha:string,jobs:z.infer<typeof jobSchema>[],github:(path:string)=>Promise<unknown>,artifact:GithubArtifactReader|undefined,inputs:Awaited<ReturnType<typeof readCanonicalSourceArtifactsAndInputs>>,purpose:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA',git:ReturnType<typeof captureCanonicalSourceContext>['git']){
 if(!artifact)throw fail();
 const targets=[{job:'runtime-backend',name:`cuevo-runtime-backend-${run.id}-${run.run_attempt}`,file:'lane.json'},{job:'runtime-browser',name:`cuevo-runtime-browser-${run.id}-${run.run_attempt}`,file:'lane.json'},{job:'database-checks',name:`cuevo-runtime-database-${run.id}-${run.run_attempt}`,file:'lane.json'},{job:'integration-learning',name:`cuevo-integration-integration-learning-${run.id}-${run.run_attempt}`,file:'result.json'},{job:'integration-state',name:`cuevo-integration-integration-state-${run.id}-${run.run_attempt}`,file:'result.json'},{job:'technical-mvp',name:`cuevo-runtime-aggregate-${run.id}-${run.run_attempt}`,file:'result.json'}];
 const shape=z.object({id:positive,name:z.string(),size_in_bytes:positive.max(2*1024*1024),expired:z.literal(false),digest:z.string().regex(/^sha256:[a-f0-9]{64}$/),created_at:z.iso.datetime({offset:true}),expires_at:z.iso.datetime({offset:true}),workflow_run:z.object({id:z.literal(run.id),head_sha:z.literal(run.head_sha),head_branch:z.literal('main')})});
 const read=async()=>{const page=z.object({total_count:z.number().int().nonnegative().max(100),artifacts:z.array(z.object({id:positive,name:z.string()}).passthrough()).max(100)}).parse(JSON.parse(canonicalReleaseExecutionJson(await github(`actions/runs/${run.id}/artifacts?per_page=100`))));if(page.total_count!==page.artifacts.length||new Set(page.artifacts.map(row=>row.id)).size!==page.artifacts.length)throw fail();return targets.map(target=>{const matched=page.artifacts.filter(row=>row.name===target.name),job=jobs.find(job=>job.name===target.job);if(matched.length!==1||!job?.started_at||!job.completed_at)throw fail();const item=shape.parse(matched[0]);if(Date.parse(item.expires_at)<=Date.now()||Date.parse(item.created_at)>Date.now()||Date.parse(item.created_at)<Date.parse(job.started_at)||Date.parse(item.created_at)>Date.parse(job.completed_at))throw fail();return item;});};
 const original=await read(),receipts:Awaited<ReturnType<typeof readSingleJsonArchive>>[]=[];
 for(const[index,item]of original.entries()){const bytes=await artifact(item.id);if(bytes.length!==item.size_in_bytes)throw fail();receipts.push(await readSingleJsonArchive(bytes,{archiveSha256:item.digest.slice(7),fileName:targets[index].file,maximumJsonBytes:1024*1024}));}
 const {descriptor,sourceIdentity}=inputs,aggregate=z.object({identity:integrationIdentitySchema}).passthrough().parse(receipts[5].value),identity=aggregate.identity;
 if(identity.repository!==run.repository.full_name||identity.sourceSha!==run.head_sha||identity.treeSha!==treeSha||identity.githubRunId!==String(run.id)||identity.runAttempt!==run.run_attempt||identity.platform!=='linux'||identity.arch!=='x64'||!['main-staging','full-runtime'].includes(identity.profile)||identity.sourceDigest!==descriptor.sourceDigest||identity.sourceLockSha256!==descriptor.sourceLockSha256||identity.partitionManifestSha256!==descriptor.coverage.manifestSha256||identity.nodeVersion!==sourceIdentity.nodeVersion||identity.nodeBinarySha256!==sourceIdentity.nodeBinarySha256)throw fail();
 if(purpose==='ORIGINAL_RUNTIME_METADATA'){
  for(const path of ['scripts/verification/runtime-lanes.ts','scripts/verification/integration-partitions.ts','scripts/verification/verification-profiles.ts','scripts/verification/steps.ts'])if(descriptor.files.find(row=>row.path===path)?.sha256!==createHash('sha256').update(readFileSync(resolve(path))).digest('hex'))throw fail();
  const yaml=createRequire(import.meta.url)('js-yaml')as{load(value:string):unknown},workflow=z.object({jobs:z.record(z.string(),z.unknown())}).parse(yaml.load(git(['show',run.head_sha+':.github/workflows/ci.yml']).toString('utf8')));
  for(const[name,job]of Object.entries({...ciRuntimeJobs,'database-checks':ciDatabaseJob}))if(canonicalReleaseExecutionJson(workflow.jobs[name])!==canonicalReleaseExecutionJson(job))throw fail();
 }
 const lanes=receipts.slice(0,3).map(row=>row.value),integration=receipts.slice(3,5).map(row=>row.value),verified=purpose==='CURRENT_SOURCE'?validateTechnicalAggregateReceipt(receipts[5].value,lanes,integration,identity,descriptor.coverage):validateCommittedTechnicalAggregateReceipt(receipts[5].value,lanes,integration,identity,{integration:descriptor.coverage.integration,files:descriptor.files});
 for(const[index,row]of receipts.slice(3,5).entries()){const value=z.object({startedAtMs:z.number().int(),completedAtMs:z.number().int()}).passthrough().parse(row.value),job=jobs.find(job=>job.name===targets[index+3].job)!;if(value.startedAtMs<Date.parse(job.started_at!)||Math.floor(value.completedAtMs/1000)>Math.floor(Date.parse(job.completed_at!)/1000)||Math.floor(value.completedAtMs/1000)>Math.floor(Date.parse(jobs.find(job=>job.name==='technical-mvp')!.started_at!)/1000))throw fail();}
 if(canonicalReleaseExecutionJson(original)!==canonicalReleaseExecutionJson(await read()))throw fail();
 const proof={aggregateSha256:createHash('sha256').update(canonicalReleaseExecutionJson(verified)).digest('hex'),artifacts:original.map((row,index)=>({id:row.id,archiveSha256:row.digest.slice(7),jsonSha256:receipts[index].jsonSha256,expiresAt:row.expires_at}))};
 const expiresAtMs=Math.min(...original.map(row=>Date.parse(row.expires_at))),assertOriginalValidity=()=>{if(Date.now()>=expiresAtMs)throw fail();};return{proof,assertOriginalValidity,refreshOriginalMetadata:async()=>{if(canonicalReleaseExecutionJson(original)!==canonicalReleaseExecutionJson(await read()))throw fail();assertOriginalValidity();}};
}
/** Current official GET facade is supplied by the native admission owner.
 * Raw run_attempt must be retained; normalized legacy run metadata is refused. */
export async function readCanonicalRuntimeJobsAndGuard(value:unknown,github:(path:string)=>Promise<unknown>,artifact?:GithubArtifactReader,purpose:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA'='CURRENT_SOURCE'):Promise<CanonicalRuntimeContext>{
 try{
  const run=runSchema.parse(JSON.parse(canonicalReleaseReviewJson(value))),context=captureCanonicalSourceContext('.',run.head_sha,undefined,purpose),path=`actions/runs/${run.id}`,same=(left:unknown,right:unknown)=>canonicalReleaseReviewJson(left)===canonicalReleaseReviewJson(right);
  const current=async()=>{if(!same(runSchema.parse(await github(path)),run))throw fail();};await current();
  const readJobs=async()=>{const jobs:z.infer<typeof jobSchema>[]=[];let total:number|undefined;
  for(let page=1;page<=10;page++){
   const response=z.object({total_count:positive.max(1000),jobs:z.array(jobSchema).max(100)}).parse(JSON.parse(canonicalReleaseExecutionJson(await github(`${path}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`))));
   if(total!==undefined&&response.total_count!==total||!response.jobs.length)throw fail();total=response.total_count;jobs.push(...response.jobs);if(jobs.length>total)throw fail();if(jobs.length===total)break;if(response.jobs.length!==100||page===10)throw fail();
  }
  if(jobs.length!==total||new Set(jobs.map(job=>job.id)).size!==jobs.length||new Set(jobs.map(job=>job.name)).size!==jobs.length)throw fail();return jobs;};const jobs=await readJobs();
  const binding={repoRoot:context.root,repository:run.repository.full_name,sourceSha:run.head_sha,treeSha:context.treeSha,runId:String(run.id),runAttempt:run.run_attempt,purpose};
  if(purpose==='ORIGINAL_RUNTIME_METADATA'&&run.head_sha==='752c2e1fc5c244222a5df9f86dfb085b1a777894'&&run.id===37928686446&&run.run_attempt===1){if(!artifact)throw fail();const legacy=await readLegacy752RuntimeMetadataAndGuard({...run,purpose},jobs,github,artifact);context.finalMetadata();legacy.assertOriginalValidity();return registerCanonicalRuntimeContext(binding,legacy.proof,{assertOriginalValidity:legacy.assertOriginalValidity,refreshOriginalMetadata:async()=>{await legacy.refreshOriginalMetadata();await current();context.finalMetadata();legacy.assertOriginalValidity();}},context);}
  const required=[...Object.keys(ciCanonicalJobs),'codeql','secret-scan','required'];
  if(jobs.length<required.length||jobs.length>required.length+1||required.some(name=>!jobs.some(job=>job.name===name))||jobs.some(job=>!required.includes(job.name)&&job.name!=='dependency-review'))throw fail();
  for(const job of jobs){if(job.run_id!==run.id||job.run_attempt!==run.run_attempt||job.head_sha!==run.head_sha)throw fail();if(job.name==='dependency-review'){if(job.conclusion!=='skipped'||job.steps.length)throw fail();}else if(job.conclusion!=='success'||!job.steps.length||job.steps.some(step=>step.conclusion!=='success'&&!step.name.startsWith('Post ')))throw fail();}
  const selected=jobs.filter(job=>Object.hasOwn(ciCanonicalJobs,job.name));if(selected.length!==Object.keys(ciCanonicalJobs).length)throw fail();
  for(const job of selected){
   if(job.run_id!==run.id||job.run_attempt!==run.run_attempt||job.head_sha!==run.head_sha)throw fail();
   const contract=ciCanonicalJobs[job.name as keyof typeof ciCanonicalJobs],required=contract.steps.map(step=>'name' in step?step.name:`Run ${'uses' in step?step.uses:step.run}`),actions=contract.steps.filter(step=>'uses' in step).map(step=>'name' in step?step.name:`Run ${'uses' in step?step.uses:''}`);
   const authored:string[]=[],names=new Set<string>(),numbers=new Set<number>();
   for(const[index,step]of job.steps.entries()){
    if(names.has(step.name)||numbers.has(step.number)||index>0&&step.number<=job.steps[index-1].number)throw fail();names.add(step.name);numbers.add(step.number);
    if(required.includes(step.name)){if(step.conclusion!=='success')throw fail();authored.push(step.name);}
    else if(['Set up job','Complete job'].includes(step.name)){if(step.conclusion!=='success')throw fail();}
    else if(!actions.some(action=>step.name==='Post '+action))throw fail();
   }
   if(!same(required,authored))throw fail();
  }
  const commit=z.object({sha:z.literal(run.head_sha),tree:z.object({sha})}).parse(await github('git/commits/'+run.head_sha));if(commit.tree.sha!==context.treeSha)throw fail();const inputs=await readCanonicalSourceArtifactsAndInputs(run,commit.tree.sha,selected,github,artifact,purpose),runtime=await runtimeArtifacts(run,commit.tree.sha,jobs,github,artifact,inputs,purpose,context.git);
  if(!same(jobs,await readJobs()))throw fail();await current();context.finalMetadata();const proof={runAttempt:run.run_attempt,jobsSha256:createHash('sha256').update(canonicalReleaseReviewJson({repository:run.repository.full_name,sourceSha:run.head_sha,treeSha:commit.tree.sha,runId:run.id,runAttempt:run.run_attempt,jobs:[...jobs].sort((left,right)=>left.name.localeCompare(right.name)),canonicalSource:inputs.proof,canonicalRuntime:runtime.proof})).digest('hex')};
  const assertOriginalValidity=()=>{inputs.assertOriginalValidity();runtime.assertOriginalValidity();},refreshOriginalMetadata=async()=>{await inputs.refreshOriginalMetadata();await runtime.refreshOriginalMetadata();if(!same(jobs,await readJobs()))throw fail();await current();context.finalMetadata();assertOriginalValidity();};assertOriginalValidity();return registerCanonicalRuntimeContext(binding,proof,{refreshOriginalMetadata,assertOriginalValidity},context);
 }catch{throw fail();}
}

export async function readCanonicalRuntimeJobs(value:unknown,github:(path:string)=>Promise<unknown>,artifact?:GithubArtifactReader,purpose:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA'='CURRENT_SOURCE'):Promise<{runAttempt:number;jobsSha256:string}>{return(await readCanonicalRuntimeJobsAndGuard(value,github,artifact,purpose)).proof;}
