import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { integrationArguments, criticalIntegrationFiles, fullIntegrationFiles, validateCriticalIntegrationReport, validateIntegrationRunReport } from './verification/verification-profiles';
const args = process.argv.slice(2), invocation = integrationArguments(args);
const directory = resolve('.local/customer-readiness/integration-phase', randomUUID()); mkdirSync(directory, { recursive:true });
const inventoryPath=resolve(directory,'inventory.json'), reportPath=resolve(directory,'results.json');
const expectedFiles=args.length?[...criticalIntegrationFiles]:fullIntegrationFiles();
const scope=args.length?'critical-integration':'integration';
const git = (argumentsList:string[]) => execFileSync('git',argumentsList,{encoding:'utf8',shell:false,windowsHide:true});
const sourceSha=git(['rev-parse','HEAD']).trim();
const snapshot=()=>{
  const sourceFiles=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
  const rows=sourceFiles.flatMap(path=>{try{return [{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}];}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}}).sort((a,b)=>a.path.localeCompare(b.path));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
const sourceDigest=snapshot(), runId=process.env.CUEVO_VERIFICATION_RUN_ID??randomUUID();
if(process.env.CUEVO_VERIFICATION_SOURCE_SHA&&process.env.CUEVO_VERIFICATION_SOURCE_SHA!==sourceSha)throw Error('Integration original source identity changed.');
if(process.env.CUEVO_VERIFICATION_SOURCE_DIGEST&&process.env.CUEVO_VERIFICATION_SOURCE_DIGEST!==sourceDigest)throw Error('Integration original source digest changed.');
const identity={runId,sourceSha,sourceDigest,scope};
const env={...process.env,CUEVO_REQUIRE_INTEGRATION:'1',CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0'};
const list=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','list','--staticParse=false','--allowOnly=false',`--json=${inventoryPath}`,...(args.length?expectedFiles:['--exclude','apps/api/test/integration/customer-foundry-live-api.test.ts','apps/api/test/integration'])],{env,stdio:'inherit'});
if(list.status!==0)process.exit(list.status??1);
const inventory=JSON.parse(readFileSync(inventoryPath,'utf8')) as unknown;
writeFileSync(resolve(directory,'original.json'),JSON.stringify({...identity,expectedFiles,inventory}),{flag:'wx',mode:0o600});
const startedAt=Date.now();
const result = spawnSync(process.execPath, invocation.map(argument=>argument.startsWith('--outputFile=')?`--outputFile=${reportPath}`:argument), { env, stdio:'inherit' });
const finishedAt=Date.now();
if(result.status===0){
  const report=JSON.parse(readFileSync(reportPath,'utf8')) as unknown;
  if(args.length)validateCriticalIntegrationReport(report);
  const testCount=validateIntegrationRunReport(report,inventory,{expectedFiles,startedAt,finishedAt});
  if(snapshot()!==sourceDigest||git(['rev-parse','HEAD']).trim()!==sourceSha)throw Error('Integration source changed during execution.');
  writeFileSync(resolve(directory,'verified.json'),JSON.stringify({...identity,startedAt,finishedAt,testCount,inventorySha256:createHash('sha256').update(readFileSync(inventoryPath)).digest('hex'),reportSha256:createHash('sha256').update(readFileSync(reportPath)).digest('hex')}),{flag:'wx',mode:0o600});
}
process.exit(result.status??1);
