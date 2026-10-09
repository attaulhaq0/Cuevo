import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {types} from 'node:util';
import {z} from 'zod';
import {statelessVerificationSteps} from './steps';
import {criticalIntegrationFiles,fullIntegrationFiles,integrationExclusions} from './verification-profiles';

const fail=()=>Error('Fixed CI partition coverage requires review; contents withheld.');
const sha=z.string().regex(/^[a-f0-9]{40}$/);
const sourcePath=z.string().regex(/^scripts\/[a-z0-9_./-]+[.]test[.]ts$/).refine(path=>path.split('/').every(part=>part&&part!=='.'&&part!=='..'));
const integrationPath=z.string().regex(/^apps\/api\/test\/integration\/[a-z0-9_./-]+[.]test[.]ts$/).refine(path=>path.split('/').every(part=>part&&part!=='.'&&part!=='..'));
const separateSourceFiles=['pilot-evidence','pilot-private-cleanup','pilot-window-rules','pilot-window','pilot-workflow-contracts','secret-scan-policy','secret-scan'].map(name=>'scripts/verification/'+name+'.test.ts');
const sourcePart=z.object({id:z.enum(['source-native','source-contracts','source-delivery']),files:z.array(sourcePath).min(1).max(300)}).strict();
const integrationPart=z.object({id:z.enum(['integration-learning','integration-state']),files:z.array(integrationPath).min(1).max(300)}).strict();
const measure=(path:z.ZodType<string>)=>z.object({path,durationMs:z.number().int().nonnegative().max(86400000).nullable()}).strict();
const manifestSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_FIXED_CI_PARTITIONS'),source:z.array(sourcePart).length(3),integration:z.array(integrationPart).length(2),nonTestChecks:z.array(z.object({name:z.string(),commandSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(30),
 separateSource:z.array(z.object({file:sourcePath,reason:z.enum(['SEPARATE_PILOT_ACCEPTANCE','SEPARATE_SECRET_SCANNER_OWNER'])}).strict()).max(20),
 separateIntegration:z.array(z.object({file:integrationPath,reason:z.literal('LIVE_PROVIDER_APPROVAL_AND_BUDGET_REQUIRED')}).strict()).max(5),
 measurements:z.object({source:z.array(measure(sourcePath)).max(300),integration:z.array(measure(integrationPath)).max(300),provenance:z.object({sourceSha:sha,treeSha:sha.optional(),releaseSha:sha.optional(),runId:z.string().regex(/^[1-9][0-9]{0,18}$/),runAttempt:z.number().int().positive(),basis:z.literal('ORIGINAL_CASE_FILE_DURATION')}).strict()}).strict()}).strict();
export type CiPartitionManifest=z.infer<typeof manifestSchema>;
export type CiPartitionInventory={sourceFiles:string[];integrationFiles:string[];criticalFiles:string[]};
export type CiPartitionCoverage=CiPartitionManifest&{manifestSha256:string;effectAuthority:false;timeTargetAchieved:false};
function snapshot(value:unknown,depth=0):unknown{
 if(depth>12)throw fail();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail();
 if(Array.isArray(value)&&(value.length>1000||Reflect.ownKeys(value).length!==value.length+1))throw fail();
 const copy:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw fail();Object.defineProperty(copy,key,{value:snapshot(field.value,depth+1),enumerable:true});}return copy;
}
const equal=(left:readonly string[],right:readonly string[])=>JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
function unique(paths:readonly string[]){if(new Set(paths).size!==paths.length)throw fail();}
/** Fixed whole-file assignments; changing one input requires a reviewed manifest. No partial result or approval is produced. */
export function validateCiPartitionCoverage(value:unknown,expectedValue:CiPartitionInventory):CiPartitionManifest{
 try{
  const manifest=manifestSchema.parse(snapshot(value)),expected=z.object({sourceFiles:z.array(sourcePath).min(1),integrationFiles:z.array(integrationPath).min(1),criticalFiles:z.array(integrationPath).min(1)}).strict().parse(snapshot(expectedValue));
  const checks=statelessVerificationSteps.filter(step=>!(step.args as readonly string[]).includes('--test')).map(step=>({name:step.name,commandSha256:createHash('sha256').update(JSON.stringify([...step.args])).digest('hex')}));if(JSON.stringify(manifest.nonTestChecks)!==JSON.stringify(checks))throw fail();
  for(const group of [manifest.source,manifest.integration]){unique(group.map(part=>part.id));for(const part of group){unique(part.files);if(part.files.some((path,index)=>index>0&&part.files[index-1].localeCompare(path)>=0))throw fail();}}
  const source=manifest.source.flatMap(part=>part.files),integration=manifest.integration.flatMap(part=>part.files);for(const files of [source,integration,expected.sourceFiles,expected.integrationFiles,expected.criticalFiles])unique(files);
  if(!equal(source,expected.sourceFiles)||!equal(integration,expected.integrationFiles)||expected.criticalFiles.some(path=>!integration.includes(path)))throw fail();
  unique(manifest.separateSource.map(row=>row.file));unique(manifest.separateIntegration.map(row=>row.file));if(manifest.separateSource.some(row=>source.includes(row.file)||!separateSourceFiles.includes(row.file)||row.reason!==(row.file.includes('secret-scan')?'SEPARATE_SECRET_SCANNER_OWNER':'SEPARATE_PILOT_ACCEPTANCE'))||manifest.separateIntegration.some(row=>integration.includes(row.file)||!integrationExclusions.some(original=>original.file===row.file&&original.reason===row.reason)))throw fail();
  for(const [measures,files]of [[manifest.measurements.source,source],[manifest.measurements.integration,integration]] as const){unique(measures.map(row=>row.path));if(!equal(measures.map(row=>row.path),files))throw fail();}
  return manifest;
 }catch{throw fail();}
}
function discovered(root:string,folder:string):string[]{const absolute=join(root,folder),stat=lstatSync(absolute);if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(absolute)!==absolute)throw fail();return readdirSync(absolute,{withFileTypes:true}).flatMap(entry=>{const path=folder+'/'+entry.name;if(entry.isSymbolicLink())throw fail();return entry.isDirectory()?discovered(root,path):entry.isFile()&&entry.name.endsWith('.test.ts')?[path]:[];});}
/** Actual authored filesystem discovery detects unassigned additions and missing owners; no arbitrary glob or skip list is accepted. */
export function validateCiPartitionDiscovery(repoRoot:string,value:unknown,expected:CiPartitionInventory):CiPartitionManifest{
 try{if(!isAbsolute(repoRoot)||resolve(repoRoot)!==repoRoot||realpathSync(repoRoot)!==repoRoot)throw fail();const manifest=validateCiPartitionCoverage(value,expected);
  if(!equal(discovered(repoRoot,'scripts'),[...expected.sourceFiles,...manifest.separateSource.map(row=>row.file)])||!equal(discovered(repoRoot,'apps/api/test/integration'),[...expected.integrationFiles,...manifest.separateIntegration.map(row=>row.file)]))throw fail();return manifest;
 }catch{throw fail();}
}
export function readCiPartitionCoverage(repoRoot:string):CiPartitionCoverage{
 try{const path=resolve(repoRoot,'scripts/verification/ci-partitions.json'),part=relative(repoRoot,path),stat=lstatSync(path);if(isAbsolute(part)||part.split(/[\\/]/).some(value=>value==='..')||!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>131072||realpathSync(path)!==path)throw fail();const bytes=readFileSync(path),sourceFiles=statelessVerificationSteps.flatMap(step=>[...step.args].filter(path=>path.endsWith('.test.ts')));
  const manifest=validateCiPartitionDiscovery(repoRoot,JSON.parse(bytes.toString('utf8')),{sourceFiles,integrationFiles:fullIntegrationFiles(),criticalFiles:[...criticalIntegrationFiles]});
  if(!equal(manifest.separateIntegration.map(row=>row.file),integrationExclusions.map(row=>row.file)))throw fail();return{...manifest,manifestSha256:createHash('sha256').update(bytes).digest('hex'),effectAuthority:false,timeTargetAchieved:false};
 }catch{throw fail();}
}
export function ciPartitionFiles(value:CiPartitionCoverage,scope:'source'|'integration',id:string,profile:'full'|'critical'):string[]{
 if(!['source','integration'].includes(scope)||!['full','critical'].includes(profile)||scope==='source'&&profile!=='full')throw fail();const safe=snapshot(value) as CiPartitionCoverage,original=readCiPartitionCoverage(resolve(import.meta.dirname,'../..'));if(JSON.stringify(safe)!==JSON.stringify(original))throw fail();const{manifestSha256:_digest,effectAuthority:_authority,timeTargetAchieved:_target,...manifest}=safe;void _digest;void _authority;void _target;
 const checked=validateCiPartitionCoverage(manifest,{sourceFiles:statelessVerificationSteps.flatMap(step=>[...step.args].filter(path=>path.endsWith('.test.ts'))),integrationFiles:fullIntegrationFiles(),criticalFiles:[...criticalIntegrationFiles]});const part=checked[scope].find(part=>part.id===id);if(!part)throw fail();return profile==='critical'?part.files.filter(path=>(criticalIntegrationFiles as readonly string[]).includes(path)):[...part.files];
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const coverage=readCiPartitionCoverage(resolve(import.meta.dirname,'../..'));console.log(JSON.stringify({purpose:coverage.purpose,manifestSha256:coverage.manifestSha256,sourceFiles:coverage.source.reduce((sum,part)=>sum+part.files.length,0),integrationFiles:coverage.integration.reduce((sum,part)=>sum+part.files.length,0),effectAuthority:false,timeTargetAchieved:false}));}
