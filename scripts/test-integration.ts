import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { integrationArguments, criticalIntegrationFiles, fullIntegrationFiles, validateCriticalIntegrationReport, validateIntegrationRunReport,readCiRuntimeSelection } from './verification/verification-profiles';
import {integrationPartitionIds,selectIntegrationPartition,partitionIntegrationArguments,integrationExecutedFiles,integrationFailureFiles} from './verification/integration-partitions';
import {readCiPartitionCoverage} from './verification/ci-partition-coverage';
import {canonicalReleaseExecutionJson} from './verification/release-review';
const args=process.argv.slice(2),partition=args.length===1?integrationPartitionIds.find(id=>args[0]==='--ci-partition='+id):undefined;
if(partition&&(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_JOB!==partition))throw Error('Integration partition requires its exact isolated CI owner.');
const selection=partition?selectIntegrationPartition(readCiPartitionCoverage(resolve('.')),partition,(await readCiRuntimeSelection()).profile):undefined;
const invocation=selection?partitionIntegrationArguments(readCiPartitionCoverage(resolve('.')),selection.partition,selection.profile):integrationArguments(args);
const directory = resolve('.local/customer-readiness/integration-phase', randomUUID()); mkdirSync(directory, { recursive:true });
const inventoryPath=resolve(directory,'inventory.json'), reportPath=resolve(directory,'results.json');
const expectedFiles=selection?.files??(args.length?[...criticalIntegrationFiles]:fullIntegrationFiles());
const scope=selection?.scope??(args.length?'critical-integration':'integration');
const git = (argumentsList:string[]) => execFileSync('git',argumentsList,{encoding:'utf8',shell:false,windowsHide:true});
const sourceSha=git(['rev-parse','HEAD']).trim();
const snapshot=()=>{
  const sourceFiles=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
  const rows=sourceFiles.flatMap(path=>{try{return [{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}];}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}}).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
const sourceDigest=snapshot(), runId=process.env.CUEVO_VERIFICATION_RUN_ID??randomUUID();
if(process.env.CUEVO_VERIFICATION_SOURCE_SHA&&process.env.CUEVO_VERIFICATION_SOURCE_SHA!==sourceSha)throw Error('Integration original source identity changed.');
if(process.env.CUEVO_VERIFICATION_SOURCE_DIGEST&&process.env.CUEVO_VERIFICATION_SOURCE_DIGEST!==sourceDigest)throw Error('Integration original source digest changed.');
const identity={runId,sourceSha,sourceDigest,scope};
const capturedFiles=expectedFiles.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const diagnosticPath=resolve(directory,'diagnostic.json'),env={...process.env,CUEVO_REQUIRE_INTEGRATION:'1',CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0',CUEVO_INTEGRATION_DIAGNOSTIC_PATH:diagnosticPath};
const list=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','list','--staticParse=false','--allowOnly=false',`--json=${inventoryPath}`,...(selection||args.length?expectedFiles:['--exclude','apps/api/test/integration/customer-foundry-live-api.test.ts','apps/api/test/integration'])],{env,stdio:'inherit'});
if(list.status!==0)process.exit(list.status??1);
const inventory=JSON.parse(readFileSync(inventoryPath,'utf8')) as unknown;
writeFileSync(resolve(directory,'original.json'),JSON.stringify({...identity,expectedFiles,inventory}),{flag:'wx',mode:0o600});
const startedAt=Date.now();
const result = spawnSync(process.execPath, [...invocation.map(argument=>argument.startsWith('--outputFile=')?`--outputFile=${reportPath}`:argument),'--reporter='+resolve('scripts/verification/integration-partitions.ts')], { env, stdio:'inherit' });
const finishedAt=Date.now();
let exitCode=result.status??1;
try{if(exitCode===0){
  const report=JSON.parse(readFileSync(reportPath,'utf8')) as unknown;
  if(!selection&&args.length)validateCriticalIntegrationReport(report);
  const testCount=validateIntegrationRunReport(report,inventory,{expectedFiles,startedAt,finishedAt});
  if(snapshot()!==sourceDigest||git(['rev-parse','HEAD']).trim()!==sourceSha)throw Error('Integration source changed during execution.');
  const files=integrationExecutedFiles(report,inventory,JSON.parse(readFileSync(diagnosticPath,'utf8')),{expectedFiles,startedAt,finishedAt,repoRoot:resolve('.')});
  writeFileSync(resolve(directory,'verified.json'),JSON.stringify({...identity,startedAt,finishedAt,testCount,inventorySha256:createHash('sha256').update(readFileSync(inventoryPath)).digest('hex'),reportSha256:createHash('sha256').update(readFileSync(reportPath)).digest('hex')}),{flag:'wx',mode:0o600});
  if(selection){
   const output=process.env.CUEVO_INTEGRATION_PHASE_RECEIPT_FILE;if(!output)throw Error('Original integration parent receipt destination is missing.');
   writeFileSync(output,canonicalReleaseExecutionJson({...identity,partition:selection.partition,startedAtMs:startedAt,completedAtMs:finishedAt,files,inventorySha256:createHash('sha256').update(readFileSync(inventoryPath)).digest('hex'),reportSha256:createHash('sha256').update(readFileSync(reportPath)).digest('hex'),diagnosticsSha256:createHash('sha256').update(readFileSync(diagnosticPath)).digest('hex'),exitCode:0,signal:null}),{flag:'wx',mode:0o600});
  }
}}catch{exitCode=1;}
if(selection&&exitCode!==0){
 const output=process.env.CUEVO_INTEGRATION_PHASE_RECEIPT_FILE;
 const observed=(path:string)=>{try{const bytes=readFileSync(path);if(bytes.length>16*1024*1024)throw Error();return{value:JSON.parse(bytes.toString('utf8'))as unknown,sha256:createHash('sha256').update(bytes).digest('hex')};}catch{return{value:null,sha256:null};}};
 const inventorySource=observed(inventoryPath),reportSource=observed(reportPath),diagnosticSource=observed(diagnosticPath),files=integrationFailureFiles(inventorySource.value,diagnosticSource.value,{files:capturedFiles,repoRoot:resolve('.')});
 if(output)writeFileSync(output,canonicalReleaseExecutionJson({...identity,partition:selection.partition,startedAtMs:startedAt,completedAtMs:finishedAt,files,inventorySha256:inventorySource.sha256,reportSha256:reportSource.sha256,diagnosticsSha256:diagnosticSource.sha256,exitCode,signal:result.signal===null?null:['SIGINT','SIGTERM','SIGKILL'].includes(result.signal)?result.signal:'OTHER'}),{flag:'wx',mode:0o600});
}
process.exit(exitCode);
