import { appendFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sameSourceManifest, restoreTechnicalState } from './rules';
import { commandArgs } from './steps';
import { readCiRuntimeSelection, verificationProfileSteps, verificationEvidence, validateCriticalBrowserReport, criticalBrowserArguments, criticalBrowserFiles } from './verification-profiles';
import { parseBrowserInventory, validateBrowserRunReport, validateBrowserPhaseReceipt, compatibilityBrowserFiles, type BrowserInventory } from './browser-runtime-scope';
import { requireStoppedBrowserPorts, type BrowserPortState } from './browser-account-phase';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';
import { verificationProgress } from './verification-progress';
import {readTechnicalRequest,runtimeLaneSteps,runtimeLaneEvidence} from './runtime-lanes';

const request=readTechnicalRequest(process.argv.slice(2)),requestedProfile=request.profile;
const selection=requestedProfile==='ci'?await readCiRuntimeSelection():{profile:requestedProfile,browserFiles:[...criticalBrowserFiles]};
const profile=selection.profile;
if(request.lane&&profile==='full')throw Error('Complete acceptance cannot be split into a partial runtime receipt.');
const selectedSteps=request.lane?runtimeLaneSteps(profile as Exclude<typeof profile,'full'>,request.lane):verificationProfileSteps(profile),runId=randomUUID();
const probe=(port:number)=>new Promise<BrowserPortState>(done=>{
  const socket=createConnection({host:'127.0.0.1',port});let settled=false;
  const finish=(state:BrowserPortState)=>{if(settled)return;settled=true;socket.destroy();done(state);};
  socket.setTimeout(1000);socket.once('connect',()=>finish('OPEN'));socket.once('timeout',()=>finish('UNKNOWN'));
  socket.once('error',error=>finish((error as NodeJS.ErrnoException).code==='ECONNREFUSED'?'REFUSED':'UNKNOWN'));
});
const stopped=async()=>{const deadline=Date.now()+10000;for(;;){try{await requireStoppedBrowserPorts(probe);return;}catch{if(Date.now()>=deadline)throw Error('Stop Cuevo application processes before clean technical verification.');}await new Promise(done=>setTimeout(done,100));}};
await stopped();
const directory=resolve('.local/verification',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true});
const snapshot=async()=>{
 const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const manifest:{path:string;sha256:string}[]=[];
 for(const path of new Set(sourceFiles)){try{manifest.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 return manifest;
};
const manifest=await snapshot(),sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceDigest=createHash('sha256').update(JSON.stringify([...manifest].sort((a,b)=>a.path.localeCompare(b.path)))).digest('hex');
await writeFile(resolve(directory,'source.json'),JSON.stringify(manifest,null,2));
const rows=[...selectedSteps.map(step=>({name:step.name,exitCode:null as number|null,required:true,durationMs:0})),{name:'source-freeze',exitCode:null as number|null,required:true,durationMs:0}];
const laneContext=request.lane?{repository:process.env.GITHUB_REPOSITORY,sourceSha,treeSha:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sourceDigest,githubRunId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),profile,browserFiles:selection.browserFiles,lane:request.lane}:undefined;
const evidence=()=>laneContext?runtimeLaneEvidence({...laneContext,rows}):verificationEvidence(profile,rows);
const persist=()=>writeFile(resolve(directory,'evidence.json'),JSON.stringify(evidence(),null,2));await persist();
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### ${profile} runtime verification\n\n| Phase | Result | Duration |\n| --- | --- | --- |\n`);
const progress=async(value:Parameters<typeof verificationProgress>[0])=>{const message=verificationProgress(value);console.log(message.stdout);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,message.summary);};
let failed=false,bootstrapCompleted=false,interrupted=false;
const children=new Set<ReturnType<typeof spawnOwnedProcess>>();
const stop=()=>{interrupted=true;void stopOwnedProcesses([...children]).catch(()=>{process.exitCode=1;});};process.on('SIGINT',stop);process.on('SIGTERM',stop);
const execute=async(args:string[],env:NodeJS.ProcessEnv)=>{
 if(interrupted)throw Error('Technical verification was interrupted.');
 const child=spawnOwnedProcess(process.execPath,args,{stdio:'inherit',env});children.add(child);
 try{return await new Promise<number|null>(done=>{child.once('error',()=>done(null));child.once('close',done);});}
 finally{await stopOwnedProcesses([child]);children.delete(child);}
};
const runStep=async(step:typeof selectedSteps[number])=>{
 await progress({profile,phase:step.name,event:'START'});
 const started=Date.now(),args=commandArgs(step),browser=step.name==='critical-browser'||step.name==='browser-compatibility';
 const identity={runId,sourceSha,sourceDigest,scope:step.name};
 const env={...process.env,CUEVO_REQUIRE_INTEGRATION:'1',CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0',NEXT_TELEMETRY_DISABLED:'1',CUEVO_VERIFICATION_RUN_ID:runId,CUEVO_VERIFICATION_SOURCE_SHA:sourceSha,CUEVO_VERIFICATION_SOURCE_DIGEST:sourceDigest,CUEVO_VERIFICATION_SCOPE:step.name,CUEVO_VERIFICATION_BROWSER_RECEIPT_FILE:resolve(directory,'browser-receipt.json'),CI:['browser','browser-compatibility','critical-browser'].includes(step.name)?'true':process.env.CI};
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
 }catch{code=1;}
 const durationMs=Date.now()-started;Object.assign(rows.find(row=>row.name===step.name)!,{exitCode:code,durationMs});await persist();await progress({profile,phase:step.name,event:'END',exitCode:code,durationMs});return code;
};
try{
 for(const step of selectedSteps){const code=await runStep(step);if(code!==0)throw Error('Required verification failed.');if(['clean-bootstrap','clean-browser-seed'].includes(step.name))bootstrapCompleted=true;}
}catch{failed=true;}
finally{
 await stopOwnedProcesses([...children]).catch(()=>{failed=true;});
 const restoreRow=rows.find(row=>row.name==='demo-seed-restore')!;
 if(await restoreTechnicalState(bootstrapCompleted,restoreRow.exitCode===0,{stopped,restore:async()=>{
   // A signal may stop acceptance, but confirmed stopped synthetic restoration remains required.
   const originalExit=restoreRow.exitCode,originalDuration=restoreRow.durationMs;
   interrupted=false;const restoration=(await runStep(selectedSteps.find(step=>step.name==='demo-seed-restore')!))??1;
   // A compensating retry cannot rewrite a failed required restoration as passed.
   if(originalExit!==null){restoreRow.exitCode=originalExit;restoreRow.durationMs=originalDuration;await persist();}
   return restoration;
 }})!==0){failed=true;if(restoreRow.exitCode===null)restoreRow.exitCode=1;}
 const freezeStarted=Date.now();await progress({profile,phase:'source-freeze',event:'START'});
 const finalManifest=await snapshot();await writeFile(resolve(directory,'source-final.json'),JSON.stringify(finalManifest,null,2));
 const unchanged=sameSourceManifest(manifest,finalManifest)&&sourceSha===execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const freezeDuration=Date.now()-freezeStarted;Object.assign(rows.find(row=>row.name==='source-freeze')!,{exitCode:unchanged?0:1,durationMs:freezeDuration});await persist();await progress({profile,phase:'source-freeze',event:'END',exitCode:unchanged?0:1,durationMs:freezeDuration});if(!unchanged)failed=true;
 process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
}
if(request.lane){const laneFolder=resolve('.local/runtime-lanes',request.lane);await mkdir(laneFolder,{recursive:true});await writeFile(resolve(laneFolder,'lane.json'),JSON.stringify(evidence()));}
if(failed){console.error(profile+' verification failed; evidence retained in '+directory);process.exitCode=1;}else console.log('Technical evidence '+evidence().status+': '+directory);
