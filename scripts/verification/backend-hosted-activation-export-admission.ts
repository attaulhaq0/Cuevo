import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from './release-review';
import {readSingleJsonArchive} from './single-json-archive';
import {createGithubCodeqlArtifactReader} from './staging-security';
import {validateOriginalWorkerActivationExecutionExport,type ValidatedOriginalWorkerActivationExecution} from './backend-hosted-activation-export-contracts';

const fail=()=>Error('Original worker execution artifact admission requires review; private contents withheld.');
const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),id=z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value=>Number.isSafeInteger(Number(value))),date=z.iso.datetime({offset:true});
const selectionSchema=z.object({repository:z.literal('attaulhaq0/Cuevo'),sourceSha:sha,originalRunId:id,runAttempt:positive,artifactId:id,exportJsonSha256:digest}).strict();
export type OriginalWorkerActivationSelection=z.infer<typeof selectionSchema>;
export type OriginalWorkerActivationExecutionEvidence=ValidatedOriginalWorkerActivationExecution&{evidence:'OFFICIAL_ORIGINAL_WORKER_EXECUTION_METADATA';artifactId:string;artifactSha256:string;exportJsonSha256:string;jobsSha256:string;artifactExpiresAt:string;originalFounderId:95836629;effectAuthority:false};
export type OriginalWorkerActivationExecutionGuard={admitted:OriginalWorkerActivationExecutionEvidence;assertOriginalValidity:()=>void;refreshOriginalMetadata:()=>Promise<void>};
const runSchema=z.object({id:positive,run_attempt:positive,head_sha:sha,head_branch:z.literal('main'),repository:z.object({full_name:z.literal('attaulhaq0/Cuevo')}),path:z.literal('.github/workflows/backend-release.yml'),event:z.literal('workflow_dispatch'),status:z.literal('completed'),conclusion:z.enum(['success','failure']),created_at:date,updated_at:date});
const approvalSchema=z.object({environments:z.array(z.object({id:positive,name:z.string()})).min(1).max(20),state:z.enum(['approved','pending','rejected']),user:z.object({id:positive,login:z.string(),type:z.string()}),comment:z.string().max(2000)});
const stepSchema=z.object({name:z.string().min(1).max(200),number:positive,status:z.literal('completed'),conclusion:z.string().nullable(),started_at:date.nullable(),completed_at:date.nullable()});
const jobSchema=z.object({id:positive,name:z.string().min(1).max(200),run_id:positive,run_attempt:positive,head_sha:sha,head_branch:z.literal('main'),status:z.literal('completed'),conclusion:z.enum(['success','failure','skipped']),started_at:date.nullable(),completed_at:date.nullable(),steps:z.array(stepSchema).max(100)});
const jobPageSchema=z.object({total_count:positive.max(100),jobs:z.array(jobSchema).min(1).max(100)});
const requiredSteps=['Re-admit official founder package before private credentials','Verify signed worker execution and scheduled recovery','Export immutable original worker execution evidence','Retain original worker activation execution evidence'];
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const snapshot=(value:unknown)=>JSON.parse(canonicalReleaseExecutionJson(value)) as unknown;
const same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
const parse=<T>(schema:z.ZodType<T>,value:unknown)=>schema.parse(snapshot(value));
const time=(value:string)=>Date.parse(value);
const before=(a:string,b:string)=>{if(time(a)>time(b))throw fail();};
// GitHub's whole-second metadata cannot distinguish native subsecond order.
const beforeOfficial=(native:string,official:string)=>{if(time(native)>time(official)&&! /\.\d+(?:Z|[+-]\d{2}:\d{2})$/.test(official)&&Math.floor(time(native)/1000)===Math.floor(time(official)/1000))return;before(native,official);};

/** Historical official observations only. A completed original approval never
 * becomes current mutation authority and is checked at its original clocks. */
export function validateOriginalWorkerActivationExecutionApproval(rawRun:unknown,rawApprovals:unknown,value:unknown,now:number):ValidatedOriginalWorkerActivationExecution&{originalFounderId:95836629}{
 try{
  if(!Number.isSafeInteger(now)||now<0)throw fail();const validated=validateOriginalWorkerActivationExecutionExport(value,now),run=parse(runSchema,rawRun),envelope=validated.envelope,expected=envelope.originalExpected,original=validated.original;
  if(String(run.id)!==original.originalRunId||run.run_attempt!==original.originalRunAttempt||run.head_sha!==original.sourceSha||expected.repository!==run.repository.full_name||time(run.updated_at)>now)throw fail();
  const body=JSON.parse(envelope.originalPreparedApproval.canonicalJson) as{preparedAt:string;expiresAt:string;environmentId:number};
  if(Math.floor(time(run.created_at)/1000)>Math.floor(time(body.preparedAt)/1000))throw fail();before(run.created_at,run.updated_at);before(envelope.originalCleanup.observedAt,envelope.exportedAt);beforeOfficial(envelope.exportedAt,run.updated_at);
  const approvals=z.array(approvalSchema).max(100).parse(snapshot(rawApprovals)),matching=approvals.filter(row=>row.environments.some(environment=>environment.id===body.environmentId||environment.name==='staging'));
  if(matching.length!==1)throw fail();const approval=matching[0];
  if(approval.environments.length!==1||approval.environments[0].id!==body.environmentId||approval.environments[0].name!=='staging'||approval.state!=='approved'||approval.user.id!==95836629||approval.user.login!=='attaulhaq0'||approval.user.type!=='User'||approval.comment!==envelope.originalPreparedApproval.comment)throw fail();
  return{...validated,originalFounderId:95836629};
 }catch{throw fail();}
}

type GithubReader=(path:string)=>Promise<unknown>;
/** Supplied read-only transport does not establish a native permit. The exact
 * official metadata contract is identical for supplied and fixed GET readers. */
export async function readOriginalWorkerActivationExecutionEvidenceAndGuard(value:OriginalWorkerActivationSelection&{now:number},github:GithubReader,artifactReader:(artifactId:number)=>Promise<Uint8Array>):Promise<OriginalWorkerActivationExecutionGuard>{
 try{
  const selection=parse(selectionSchema.extend({now:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict(),value),runPath='actions/runs/'+selection.originalRunId,artifactPath='actions/artifacts/'+selection.artifactId,jobsPath=runPath+'/attempts/'+selection.runAttempt+'/jobs?per_page=100&page=1',approvalsPath=runPath+'/approvals';
  const rawRun=snapshot(await github(runPath)),run=parse(runSchema,rawRun);if(String(run.id)!==selection.originalRunId||run.run_attempt!==selection.runAttempt||run.head_sha!==selection.sourceSha||time(run.updated_at)>selection.now)throw fail();
  const artifactSchema=z.object({id:z.literal(Number(selection.artifactId)),name:z.literal('cuevo-worker-activation-execution-'+selection.originalRunId+'-'+selection.runAttempt),size_in_bytes:positive.max(2*1024*1024),expired:z.literal(false),digest:z.string().regex(/^sha256:[a-f0-9]{64}$/),created_at:date,expires_at:date,workflow_run:z.object({id:z.literal(run.id),head_sha:z.literal(selection.sourceSha),head_branch:z.literal('main')})});
  const rawArtifact=snapshot(await github(artifactPath)),artifact=parse(artifactSchema,rawArtifact);if(time(artifact.expires_at)<=selection.now||time(artifact.created_at)>selection.now)throw fail();before(run.created_at,artifact.created_at);before(artifact.created_at,run.updated_at);
  const rawJobs=snapshot(await github(jobsPath)),jobs=parse(jobPageSchema,rawJobs);if(jobs.total_count!==jobs.jobs.length||new Set(jobs.jobs.map(job=>job.id)).size!==jobs.jobs.length||jobs.jobs.some(job=>job.run_id!==run.id||job.run_attempt!==selection.runAttempt||job.head_sha!==selection.sourceSha))throw fail();
  const matching=jobs.jobs.filter(job=>job.name==='schema');if(matching.length!==1)throw fail();const job=matching[0];if(!job.started_at||!job.completed_at||!['success','failure'].includes(job.conclusion)||run.conclusion==='success'&&job.conclusion!=='success')throw fail();before(run.created_at,job.started_at);before(job.started_at,job.completed_at);before(job.completed_at,run.updated_at);
  if(new Set(job.steps.map(step=>step.name)).size!==job.steps.length||new Set(job.steps.map(step=>step.number)).size!==job.steps.length||job.steps.some((step,index)=>index>0&&step.number<=job.steps[index-1].number))throw fail();
  const selected=job.steps.filter(step=>requiredSteps.includes(step.name));if(!same(selected.map(step=>step.name),requiredSteps))throw fail();
  for(const[index,step]of selected.entries()){
   if(!step.started_at||!step.completed_at||(index===1?!['success','failure'].includes(step.conclusion??''):step.conclusion!=='success'))throw fail();
   before(job.started_at,step.started_at!);before(step.started_at!,step.completed_at!);before(step.completed_at!,job.completed_at);if(index>0)before(selected[index-1].completed_at!,step.started_at!);
  }
  if(run.conclusion==='success'&&selected[1].conclusion!=='success'||selected[1].conclusion==='failure'&&job.conclusion!=='failure')throw fail();
  const bytes=await artifactReader(artifact.id);if(!(bytes instanceof Uint8Array)||bytes.byteLength!==artifact.size_in_bytes)throw fail();
  const archive=await readSingleJsonArchive(bytes,{archiveSha256:artifact.digest.slice(7),jsonSha256:selection.exportJsonSha256,fileName:'worker-activation-execution-export.json',maximumJsonBytes:256*1024});
  const rawApprovals=snapshot(await github(approvalsPath)),admitted=validateOriginalWorkerActivationExecutionApproval(rawRun,rawApprovals,archive.value,selection.now),envelope=admitted.envelope;
  if(admitted.original.sourceSha!==selection.sourceSha||admitted.original.originalRunId!==selection.originalRunId||admitted.original.originalRunAttempt!==selection.runAttempt||admitted.originalExportSha256!==selection.exportJsonSha256)throw fail();
  const prepared=JSON.parse(envelope.originalPreparedApproval.canonicalJson) as{preparedAt:string};beforeOfficial(prepared.preparedAt,selected[0].started_at!);before(selected[0].completed_at!,envelope.originalIdentity.createdAt);before(selected[1].started_at!,envelope.originalIdentity.createdAt);beforeOfficial(envelope.originalCleanup.observedAt,selected[1].completed_at!);before(selected[2].started_at!,envelope.exportedAt);beforeOfficial(envelope.exportedAt,selected[2].completed_at!);beforeOfficial(envelope.exportedAt,artifact.created_at);before(selected[3].started_at!,artifact.created_at);before(artifact.created_at,selected[3].completed_at!);
  const evidence:OriginalWorkerActivationExecutionEvidence={...admitted,evidence:'OFFICIAL_ORIGINAL_WORKER_EXECUTION_METADATA',artifactId:selection.artifactId,artifactSha256:artifact.digest.slice(7),exportJsonSha256:selection.exportJsonSha256,jobsSha256:hash(canonicalReleaseExecutionJson(rawJobs)),artifactExpiresAt:artifact.expires_at,effectAuthority:false},originalEvidence=canonicalReleaseExecutionJson(evidence),originalMetadata=[rawRun,rawArtifact,rawJobs,rawApprovals].map(row=>canonicalReleaseExecutionJson(row));let invalid=false,refreshing=false;
  const assertOriginalValidity=()=>{try{if(invalid||Math.max(selection.now,Date.now())>=time(artifact.expires_at)||canonicalReleaseExecutionJson(evidence)!==originalEvidence)throw fail();}catch{invalid=true;throw fail();}};
  const refreshOriginalMetadata=async()=>{
   if(invalid||refreshing){invalid=true;throw fail();}refreshing=true;
   try{assertOriginalValidity();const second=await Promise.allSettled([runPath,artifactPath,jobsPath,approvalsPath].map(path=>Promise.resolve().then(()=>github(path))));for(const[index,row]of second.entries())if(row.status!=='fulfilled'||canonicalReleaseExecutionJson(snapshot(row.value))!==originalMetadata[index])throw fail();assertOriginalValidity();}
   catch{invalid=true;throw fail();}finally{refreshing=false;}
  };
  await refreshOriginalMetadata();return Object.freeze({admitted:evidence,assertOriginalValidity,refreshOriginalMetadata});
 }catch{throw fail();}
}
/** One-shot compatibility observation retains the original data-only shape. */
export async function readOriginalWorkerActivationExecutionEvidence(value:OriginalWorkerActivationSelection&{now:number},github:GithubReader,artifactReader:(artifactId:number)=>Promise<Uint8Array>):Promise<OriginalWorkerActivationExecutionEvidence>{return(await readOriginalWorkerActivationExecutionEvidenceAndGuard(value,github,artifactReader)).admitted;}

/** Fixed GitHub GET and safe bounded archive transport. No provider, SQL,
 * current package approval, private runtime or effect capability is returned. */
export async function readOriginalWorkerActivationExecutionAdmissionAndGuard(value:OriginalWorkerActivationSelection&{githubToken:string}):Promise<OriginalWorkerActivationExecutionGuard>{
 try{
  const input=parse(selectionSchema.extend({githubToken:z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/)}).strict(),value),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
  let acquisition=true;const github:GithubReader=async path=>{
   const signal=AbortSignal.any([...(acquisition?[controller.signal]:[]),AbortSignal.timeout(15000)]),url='https://api.github.com/repos/'+input.repository+'/'+path,response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+input.githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',credentials:'omit',cache:'no-store',signal});
   if(response.status!==200||response.redirected||response.url&&response.url!==url||!response.body)throw fail();const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>512*1024))throw fail();
   const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;try{for(;;){const chunk=await new Promise<ReadableStreamReadResult<Uint8Array>>((done,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(fail());};if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});void reader.read().then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(fail());else done(value);},()=>{signal.removeEventListener('abort',abort);reject(fail());});});if(chunk.done)break;size+=chunk.value.byteLength;if(size>512*1024)throw fail();parts.push(chunk.value);}return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(parts))) as unknown;}finally{void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* Pending read cancellation owns cleanup. */}}
  };
  try{const {githubToken,...selection}=input,guard=await readOriginalWorkerActivationExecutionEvidenceAndGuard({...selection,now:Date.now()},github,createGithubCodeqlArtifactReader(input.repository,githubToken,controller.signal));if(controller.signal.aborted)throw fail();guard.assertOriginalValidity();return guard;}finally{acquisition=false;clearTimeout(timer);controller.abort();}
 }catch{throw fail();}
}
export async function readOriginalWorkerActivationExecutionAdmission(value:OriginalWorkerActivationSelection&{githubToken:string}):Promise<OriginalWorkerActivationExecutionEvidence>{return(await readOriginalWorkerActivationExecutionAdmissionAndGuard(value)).admitted;}
