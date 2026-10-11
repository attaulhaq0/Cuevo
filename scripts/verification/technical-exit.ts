import { appendFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sameSourceManifest, restoreTechnicalState } from './rules';
import { commandArgs } from './steps';
import { readCiRuntimeSelection, verificationProfileSteps, verificationEvidence, validateCriticalBrowserReport, criticalBrowserArguments, criticalBrowserFiles } from './verification-profiles';
import { parseBrowserInventory, validateBrowserRunReport, validateBrowserPhaseReceipt, compatibilityBrowserFiles, type BrowserInventory } from './browser-runtime-scope';
import { waitForStoppedBrowserPorts } from './browser-account-phase';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';
import { verificationProgress } from './verification-progress';
import {readTechnicalRequest,runtimeLaneSteps,runtimeLaneEvidence} from './runtime-lanes';
import {canonicalReleaseExecutionJson} from './release-review';
import {readCiPartitionCoverage} from './ci-partition-coverage';
import {integrationIdentity,integrationPartitionSteps,integrationPartitionReceipt,integrationPartitionFailure,selectIntegrationPartition,integrationFileSchema,type IntegrationPartitionReceipt} from './integration-partitions';
import {z} from 'zod';
import {createFullVerificationInvocation,initialFullVerificationRows} from './full-verification-evidence';

const request=readTechnicalRequest(process.argv.slice(2)),requestedProfile=request.profile;
const selection=requestedProfile==='ci'?await readCiRuntimeSelection():{profile:requestedProfile,browserFiles:[...criticalBrowserFiles]};
const profile=selection.profile;
if((request.lane||request.partition)&&profile==='full')throw Error('Complete acceptance cannot be split into a partial runtime receipt.');
if(request.partition&&(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_JOB!==request.partition))throw Error('Integration requires its exact isolated CI owner.');
const selectedSteps=request.partition?integrationPartitionSteps(profile as Exclude<typeof profile,'full'>,request.partition):request.lane?runtimeLaneSteps(profile as Exclude<typeof profile,'full'>,request.lane):verificationProfileSteps(profile),runId=randomUUID();
const stopped=waitForStoppedBrowserPorts;
await stopped();
const invocationStartedAtMs=Date.now(),invocationDirectory='.local/verification/'+new Date(invocationStartedAtMs).toISOString().replace(/[:.]/g,'-'),directory=resolve(invocationDirectory);await mkdir(directory,{recursive:true});
const snapshot=async()=>{
 const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const manifest:{path:string;sha256:string}[]=[];
 for(const path of new Set(sourceFiles)){try{manifest.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 return manifest;
};
const manifest=await snapshot(),sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceDigest=createHash('sha256').update(JSON.stringify([...manifest].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))).digest('hex');
await writeFile(resolve(directory,'source.json'),JSON.stringify(manifest,null,2));
if(profile==='full'&&process.env.GITHUB_ACTIONS==='true'){
 const context=createFullVerificationInvocation({env:{...process.env},sourceSha,treeSha:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sourceDigest,verificationRunId:runId,directory:invocationDirectory,startedAtMs:invocationStartedAtMs});
 await writeFile(resolve(directory,'context.json'),canonicalReleaseExecutionJson(context),{flag:'wx',mode:0o600});await writeFile(resolve('.local/full-verification-input.json'),canonicalReleaseExecutionJson(context),{flag:'wx',mode:0o600});
}
const rows=profile==='full'?initialFullVerificationRows():[...selectedSteps.map(step=>({name:step.name,exitCode:null as number|null,required:true,durationMs:0 as number|null})),...(request.partition?[{name:'owned-stack-stop',exitCode:null as number|null,required:true,durationMs:0 as number|null}]:[]),{name:'source-freeze',exitCode:null as number|null,required:true,durationMs:0 as number|null}];
const laneContext=request.lane?{repository:process.env.GITHUB_REPOSITORY,sourceSha,treeSha:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sourceDigest,githubRunId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),profile,browserFiles:selection.browserFiles,lane:request.lane}:undefined;
const partitionCoverage=request.partition?readCiPartitionCoverage(resolve('.')):undefined;
const partitionSelection=request.partition?selectIntegrationPartition(partitionCoverage!,request.partition,profile):undefined;
const partitionIdentity=request.partition?integrationIdentity({repository:process.env.GITHUB_REPOSITORY,sourceSha,treeSha:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sourceDigest,githubRunId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),profile,browserFiles:selection.browserFiles,sourceLockSha256:createHash('sha256').update(await readFile('package-lock.json')).digest('hex'),partitionManifestSha256:partitionCoverage!.manifestSha256,nodeVersion:process.version,nodeBinarySha256:createHash('sha256').update(await readFile(process.execPath)).digest('hex'),platform:process.platform,arch:process.arch}):undefined;
const partitionBody=request.partition?{identity:{...partitionIdentity!,job:request.partition},partition:request.partition,scope:partitionSelection!.scope,files:partitionSelection!.files.map(path=>({path,sha256:manifest.find(row=>row.path===path)!.sha256,cases:[]as IntegrationPartitionReceipt['files'][number]['cases'],durationMs:null as number|null})),inventorySha256:null as string|null,reportSha256:null as string|null,diagnosticsSha256:null as string|null,startedAtMs:Date.now(),completedAtMs:null as number|null,executionStartedAtMs:null as number|null,executionCompletedAtMs:null as number|null,exitCode:null as number|null,signal:null as IntegrationPartitionReceipt['signal'],rows,processesStopped:false,sourceUnchanged:false,cleanupBasis:'NOT_CONFIRMED' as IntegrationPartitionReceipt['cleanupBasis'],reasons:[]as IntegrationPartitionReceipt['reasons']}:undefined;
const evidence=()=>partitionBody?partitionBody.reasons.includes('SOURCE_CHANGED')?integrationPartitionFailure(partitionBody,partitionSelection!):integrationPartitionReceipt(partitionBody,partitionCoverage!):laneContext?runtimeLaneEvidence({...laneContext,rows}):profile==='full'?{status:verificationEvidence(profile,rows.map(row=>({...row,durationMs:row.durationMs??undefined}))).status,rows}:verificationEvidence(profile,rows.map(row=>({...row,durationMs:row.durationMs??undefined})));
const markPartitionSourceChanged=()=>{if(!partitionBody)return;partitionBody.sourceUnchanged=false;partitionBody.exitCode=1;partitionBody.completedAtMs=Date.now();if(!partitionBody.reasons.includes('SOURCE_CHANGED'))partitionBody.reasons.push('SOURCE_CHANGED');Object.assign(rows.find(row=>row.name==='source-freeze')!,{exitCode:1});};
const originalPartitionSource=async()=>{if(partitionBody&&(!sameSourceManifest(manifest,await snapshot())||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==sourceSha))markPartitionSourceChanged();};
const persist=()=>writeFile(resolve(directory,'evidence.json'),JSON.stringify(evidence(),null,2));await persist();
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### ${profile} runtime verification\n\n| Phase | Result | Duration |\n| --- | --- | --- |\n`);
const progress=async(value:Parameters<typeof verificationProgress>[0])=>{const message=verificationProgress(value);console.log(message.stdout);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,message.summary);};
let failed=false,bootstrapCompleted=false,interrupted=false;
const children=new Set<ReturnType<typeof spawnOwnedProcess>>();
const stop=(signal:'SIGINT'|'SIGTERM')=>{interrupted=true;if(partitionBody){partitionBody.signal=signal;partitionBody.reasons.push('CANCELLED');}void stopOwnedProcesses([...children]).catch(()=>{process.exitCode=1;});};const stopInt=()=>stop('SIGINT'),stopTerm=()=>stop('SIGTERM');process.on('SIGINT',stopInt);process.on('SIGTERM',stopTerm);
const execute=async(args:string[],env:NodeJS.ProcessEnv)=>{
 if(interrupted)throw Error('Technical verification was interrupted.');
 const child=spawnOwnedProcess(process.execPath,args,{stdio:'inherit',env});children.add(child);
 try{return await new Promise<number|null>(done=>{child.once('error',()=>done(null));child.once('close',done);});}
 finally{await stopOwnedProcesses([child]);children.delete(child);}
};
const runStep=async(step:typeof selectedSteps[number])=>{
 await originalPartitionSource();
 if(partitionBody?.reasons.includes('SOURCE_CHANGED'))return 1;
 await progress({profile,phase:step.name,event:'START'});
 const started=Date.now(),args=commandArgs(step),browser=step.name==='critical-browser'||step.name==='browser-compatibility';
 const identity={runId,sourceSha,sourceDigest,scope:step.name};
 const env={...process.env,CUEVO_REQUIRE_INTEGRATION:'1',CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0',NEXT_TELEMETRY_DISABLED:'1',CUEVO_VERIFICATION_RUN_ID:runId,CUEVO_VERIFICATION_SOURCE_SHA:sourceSha,CUEVO_VERIFICATION_SOURCE_DIGEST:sourceDigest,CUEVO_VERIFICATION_SCOPE:step.name,CUEVO_VERIFICATION_BROWSER_RECEIPT_FILE:resolve(directory,'browser-receipt.json'),CUEVO_INTEGRATION_PHASE_RECEIPT_FILE:resolve(directory,'integration-phase.json'),CI:['browser','browser-compatibility','critical-browser'].includes(step.name)?'true':process.env.CI};
 let inventory:BrowserInventory|undefined,reportPath:string|undefined;
 if(step.name==='critical-browser')args.push(...criticalBrowserArguments(selection.browserFiles));
 let code:number|null=null;
 try{
  if(browser){
   const inventoryPath=resolve(directory,`${step.name}-inventory.json`);reportPath=resolve(directory,`${step.name}-results.json`);
   const listStartedAt=Date.now();
   const listCode=await execute([...args,'--list','--forbid-only','--reporter=json'],{...env,PLAYWRIGHT_JSON_OUTPUT_FILE:inventoryPath});
   if(listCode!==0)throw Error('Required browser inventory failed.');
   inventory=parseBrowserInventory(JSON.parse(await readFile(inventoryPath,'utf8')),step.name==='critical-browser'?selection.browserFiles:compatibilityBrowserFiles,{...identity,startedAt:listStartedAt,finishedAt:Date.now()});
   args.push('--forbid-only','--reporter=list,json');
  }
  const executionStartedAt=Date.now();code=await execute(args,reportPath?{...env,PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath}:env);const finishedAt=Date.now();
  if(code===0&&browser){
   const report:unknown=JSON.parse(await readFile(reportPath!,'utf8'));
   validateBrowserRunReport(report,inventory!,{...identity,startedAt:executionStartedAt,finishedAt});
   if(step.name==='critical-browser')validateCriticalBrowserReport(report,selection.browserFiles);
  }
  if(code===0&&step.name==='browser'){
   validateBrowserPhaseReceipt(JSON.parse(await readFile(resolve(directory,'browser-receipt.json'),'utf8')),identity,executionStartedAt,finishedAt);
  }
  if(partitionBody&&step.name===partitionBody.scope){
   const digest=z.string().regex(/^[a-f0-9]{64}$/),phase=z.object({runId:z.literal(runId),sourceSha:z.literal(sourceSha),sourceDigest:z.literal(sourceDigest),scope:z.literal(partitionBody.scope),partition:z.literal(request.partition!),startedAtMs:z.number().int().min(executionStartedAt),completedAtMs:z.number().int().max(finishedAt),files:z.array(integrationFileSchema).min(1),inventorySha256:digest.nullable(),reportSha256:digest.nullable(),diagnosticsSha256:digest.nullable(),exitCode:z.number().int().min(0).max(255),signal:z.enum(['SIGTERM','SIGKILL','SIGINT','OTHER']).nullable()}).strict().parse(JSON.parse(await readFile(resolve(directory,'integration-phase.json'),'utf8')));
   if(phase.completedAtMs<phase.startedAtMs||JSON.stringify(phase.files.map(row=>row.path))!==JSON.stringify(partitionSelection!.files)||phase.files.some(row=>manifest.find(original=>original.path===row.path)?.sha256!==row.sha256))throw Error('Original integration phase coverage changed.');
   Object.assign(partitionBody,{files:phase.files,inventorySha256:phase.inventorySha256,reportSha256:phase.reportSha256,diagnosticsSha256:phase.diagnosticsSha256,executionStartedAtMs:phase.startedAtMs,executionCompletedAtMs:phase.completedAtMs});
   if(phase.exitCode!==0||phase.signal!==null||code!==0){code=1;partitionBody.reasons.push('PROCESS_FAILED');}
  }
 }catch{code=1;}
 const durationMs=Date.now()-started;Object.assign(rows.find(row=>row.name===step.name)!,{exitCode:code,durationMs});await originalPartitionSource();if(partitionBody?.reasons.includes('SOURCE_CHANGED'))code=1;await persist();await progress({profile,phase:step.name,event:'END',exitCode:code,durationMs});return code;
};
try{
 for(const step of selectedSteps){const code=await runStep(step);if(code!==0)throw Error('Required verification failed.');if(['clean-bootstrap','clean-browser-seed'].includes(step.name))bootstrapCompleted=true;}
}catch{failed=true;}
finally{
 let processesStopped=true;await stopOwnedProcesses([...children]).catch(()=>{failed=true;processesStopped=false;});
 const restoreRow=rows.find(row=>row.name==='demo-seed-restore')!;
 if(await restoreTechnicalState(bootstrapCompleted,restoreRow.exitCode===0,{stopped,restore:async()=>{
   // A signal may stop acceptance, but confirmed stopped synthetic restoration remains required.
   const originalExit=restoreRow.exitCode,originalDuration=restoreRow.durationMs;
   interrupted=false;const restoration=(await runStep(selectedSteps.find(step=>step.name==='demo-seed-restore')!))??1;
   // A compensating retry cannot rewrite a failed required restoration as passed.
   if(originalExit!==null){restoreRow.exitCode=originalExit;restoreRow.durationMs=originalDuration;await persist();}
   return restoration;
 }})!==0){failed=true;if(restoreRow.exitCode===null)restoreRow.exitCode=1;}
 if(partitionBody){
  const startedAt=Date.now();let code:number|null=1;
  try{await stopped();interrupted=false;code=await execute([resolve('node_modules/supabase/dist/supabase.js'),'stop','--project-id','cuevo'],{...process.env,CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0'});await stopped();}catch{processesStopped=false;}
  Object.assign(rows.find(row=>row.name==='owned-stack-stop')!,{exitCode:code,durationMs:Date.now()-startedAt});partitionBody.cleanupBasis=code===0?'CLI_STOP_EXIT_SUCCESS':'NOT_CONFIRMED';partitionBody.processesStopped=processesStopped&&code===0;if(code!==0)failed=true;
 }
 const freezeStarted=Date.now();await progress({profile,phase:'source-freeze',event:'START'});
 const finalManifest=await snapshot();await writeFile(resolve(directory,'source-final.json'),JSON.stringify(finalManifest,null,2));
 const unchanged=sameSourceManifest(manifest,finalManifest)&&sourceSha===execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const freezeDuration=Date.now()-freezeStarted;Object.assign(rows.find(row=>row.name==='source-freeze')!,{exitCode:unchanged?0:1,durationMs:freezeDuration});if(!unchanged)failed=true;
 if(partitionBody){partitionBody.sourceUnchanged=unchanged;partitionBody.completedAtMs=Date.now();partitionBody.exitCode=failed?1:0;if(!unchanged)partitionBody.reasons.push('SOURCE_CHANGED');if(!partitionBody.processesStopped)partitionBody.reasons.push('STOP_UNCONFIRMED');if(failed&&!partitionBody.reasons.length)partitionBody.reasons.push('PROCESS_FAILED');}
 await persist();await progress({profile,phase:'source-freeze',event:'END',exitCode:unchanged?0:1,durationMs:freezeDuration});
 process.removeListener('SIGINT',stopInt);process.removeListener('SIGTERM',stopTerm);
}
if(request.lane){const laneFolder=resolve('.local/runtime-lanes',request.lane);await mkdir(laneFolder,{recursive:true});await writeFile(resolve(laneFolder,'lane.json'),canonicalReleaseExecutionJson(evidence()));}
if(request.partition){const folder=resolve('.local/integration-partitions',request.partition);await mkdir(folder,{recursive:true});await writeFile(resolve(folder,'result.json'),canonicalReleaseExecutionJson(evidence()));}
if(evidence().status==='NOT_VERIFIED')failed=true;
if(failed){console.error(profile+' verification failed; evidence retained in '+directory);process.exitCode=1;}else console.log('Technical evidence '+evidence().status+': '+directory);
