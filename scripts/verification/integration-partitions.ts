import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {z} from 'zod';
import type {Reporter,TestModule,TestRunEndReason} from 'vitest/node';
import {ciPartitionFiles,type CiPartitionCoverage} from './ci-partition-coverage';
import {canonicalReleaseExecutionJson} from './release-review';
import {criticalIntegrationFiles,fullIntegrationFiles,routineBrowserFiles,criticalBrowserFiles,validateIntegrationRunReport,type VerificationProfile} from './verification-profiles';
import {integrationExclusions} from './verification-profiles';
import {verificationSteps} from './steps';

export const integrationPartitionIds=['integration-learning','integration-state']as const;
export type IntegrationPartition=typeof integrationPartitionIds[number];
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(left:unknown,right:unknown)=>canonicalReleaseExecutionJson(left)===canonicalReleaseExecutionJson(right);
const fail=()=>Error('Original isolated integration evidence requires review; contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),clock=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const profile=z.enum(['routine','full-runtime','main-staging']);
const path=z.string().regex(/^apps\/api\/test\/integration\/[a-z0-9_./-]+[.]test[.]ts$/).refine(value=>value.split('/').every(part=>part&&part!=='.'&&part!=='..'));
const baseIdentity=z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:sha,treeSha:sha,sourceDigest:digest,githubRunId:z.string().regex(/^[1-9][0-9]*$/),runAttempt:z.number().int().positive(),profile,browserFiles:z.array(z.string()).min(1).max(100),sourceLockSha256:digest,partitionManifestSha256:digest,nodeVersion:z.string().regex(/^v24[.][0-9]+[.][0-9]+$/),nodeBinarySha256:digest,platform:z.enum(['linux','win32','darwin']),arch:z.enum(['x64','arm64'])}).strict();
export const integrationIdentitySchema=baseIdentity.extend({toolchainSha256:digest,environmentPolicySha256:digest}).strict();
export type IntegrationIdentity=z.infer<typeof integrationIdentitySchema>;
export function integrationIdentity(value:unknown):IntegrationIdentity{
 try{const input=baseIdentity.parse(JSON.parse(canonicalReleaseExecutionJson(value)));if(new Set(input.browserFiles).size!==input.browserFiles.length||input.browserFiles.some(file=>!routineBrowserFiles.includes(file))||criticalBrowserFiles.some(file=>!input.browserFiles.includes(file)))throw fail();
  return{...input,toolchainSha256:hash(canonicalReleaseExecutionJson({nodeVersion:input.nodeVersion,nodeBinarySha256:input.nodeBinarySha256,sourceLockSha256:input.sourceLockSha256,platform:input.platform,arch:input.arch})),environmentPolicySha256:hash(canonicalReleaseExecutionJson({CI:'true',CUEVO_REQUIRE_INTEGRATION:'1',CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0',fileParallelism:false,allowOnly:false,partitionManifestSha256:input.partitionManifestSha256}))};
 }catch{throw fail();}
}
export function selectIntegrationPartition(coverage:CiPartitionCoverage,idValue:string,profileValue:string){
 try{const id=z.enum(integrationPartitionIds).parse(idValue),selected=profile.parse(profileValue),scope=selected==='routine'?'critical-integration' as const:'integration' as const,files=ciPartitionFiles(coverage,'integration',id,scope==='integration'?'full':'critical');if(!files.length)throw fail();return{partition:id,profile:selected,scope,files};}catch{throw fail();}
}
export function partitionIntegrationArguments(coverage:CiPartitionCoverage,id:string,selectedProfile:string){const selected=selectIntegrationPartition(coverage,id,selectedProfile);return['node_modules/vitest/vitest.mjs','run','--allowOnly=false','--fileParallelism=false','--reporter=default','--reporter=json','--outputFile=.local/customer-readiness/'+selected.scope+'-results.json',...selected.files];}
export function integrationPartitionSteps(selectedProfile:Exclude<VerificationProfile,'full'>,partition:IntegrationPartition){
 const scope=selectedProfile==='routine'?'critical-integration':'integration';
 return[verificationSteps.find(step=>step.name==='clean-bootstrap')!,{name:scope,args:['--import','tsx','scripts/test-integration.ts','--ci-partition='+partition],configured:true},verificationSteps.find(step=>step.name==='demo-seed-restore')!];
}
const caseSchema=z.object({definitionSha256:digest,outcome:z.enum(['PASSED','FAILED','SKIPPED','TODO','CANCELLED']),retryCount:z.number().int().nonnegative(),repeatCount:z.number().int().nonnegative()}).strict();
export const integrationFileSchema=z.object({path,sha256:digest,cases:z.array(caseSchema).max(10000),durationMs:z.number().finite().nonnegative().max(86400000).nullable()}).strict();
const rowSchema=z.object({name:z.string(),exitCode:z.number().int().min(0).max(255).nullable(),required:z.literal(true),durationMs:z.number().int().nonnegative()}).strict();
const receiptBody=z.object({identity:integrationIdentitySchema.extend({job:z.enum(integrationPartitionIds)}).strict(),partition:z.enum(integrationPartitionIds),scope:z.enum(['integration','critical-integration']),files:z.array(integrationFileSchema).min(1).max(300),inventorySha256:digest.nullable(),reportSha256:digest.nullable(),diagnosticsSha256:digest.nullable(),startedAtMs:clock,completedAtMs:clock.nullable(),executionStartedAtMs:clock.nullable(),executionCompletedAtMs:clock.nullable(),exitCode:z.number().int().min(0).max(255).nullable(),signal:z.enum(['SIGTERM','SIGKILL','SIGINT','OTHER']).nullable(),rows:z.array(rowSchema).length(5),processesStopped:z.boolean(),sourceUnchanged:z.boolean(),cleanupBasis:z.enum(['NOT_CONFIRMED','CLI_STOP_EXIT_SUCCESS']),reasons:z.array(z.enum(['INPUT_REQUIRES_REVIEW','PROCESS_FAILED','COVERAGE_UNCONFIRMED','SOURCE_CHANGED','STOP_UNCONFIRMED','CANCELLED'])).max(10)}).strict();
export const integrationPartitionReceiptSchema=receiptBody.extend({version:z.literal(1),purpose:z.literal('CUEVO_ISOLATED_INTEGRATION_PARTITION'),status:z.enum(['NOT_VERIFIED','PASSED','FAILED','CANCELLED']),payloadSha256:digest}).strict();
export type IntegrationPartitionReceipt=z.infer<typeof integrationPartitionReceiptSchema>;
function validateBodyShape(value:z.infer<typeof receiptBody>,selection:{partition:IntegrationPartition;profile:'routine'|'full-runtime'|'main-staging';scope:'integration'|'critical-integration';files:readonly string[]}){
 const{job,...identity}=value.identity;
 const{toolchainSha256:_toolchain,environmentPolicySha256:_environment,...base}=identity;void _toolchain;void _environment;
 if(job!==value.partition||selection.partition!==value.partition||selection.profile!==identity.profile||!same(integrationIdentity(base),identity)||!same(value.files.map(file=>file.path),selection.files)||value.scope!==selection.scope||new Set(value.files.map(file=>file.path)).size!==value.files.length||value.files.some(file=>new Set(file.cases.map(row=>row.definitionSha256)).size!==file.cases.length))throw fail();
 if(!same(value.rows.map(row=>row.name),['clean-bootstrap',selection.scope,'demo-seed-restore','owned-stack-stop','source-freeze']))throw fail();
 if(value.completedAtMs!==null&&value.completedAtMs<value.startedAtMs||value.executionStartedAtMs!==null&&value.executionStartedAtMs<value.startedAtMs||value.executionCompletedAtMs!==null&&(value.executionStartedAtMs===null||value.executionCompletedAtMs<value.executionStartedAtMs||value.completedAtMs!==null&&value.executionCompletedAtMs>value.completedAtMs))throw fail();
 return value;
}
function validateBody(value:z.infer<typeof receiptBody>,coverage:CiPartitionCoverage){if(value.identity.partitionManifestSha256!==coverage.manifestSha256)throw fail();return validateBodyShape(value,selectIntegrationPartition(coverage,value.partition,value.identity.profile));}
function status(value:z.infer<typeof receiptBody>){
 if(value.signal!==null||value.reasons.includes('CANCELLED'))return'CANCELLED' as const;
 if(value.exitCode!==null&&value.exitCode!==0||value.rows.some(row=>row.exitCode!==null&&row.exitCode!==0)||value.reasons.length)return'FAILED' as const;
 if(value.exitCode!==0||value.completedAtMs===null||value.executionStartedAtMs===null||value.executionCompletedAtMs===null||value.rows.some(row=>row.exitCode!==0)||!value.inventorySha256||!value.reportSha256||!value.diagnosticsSha256||!value.processesStopped||!value.sourceUnchanged||value.cleanupBasis!=='CLI_STOP_EXIT_SUCCESS'||value.files.some(file=>file.durationMs===null||!file.cases.length||file.cases.some(row=>row.outcome!=='PASSED'||row.retryCount!==0||row.repeatCount!==0)))return'NOT_VERIFIED' as const;
 return'PASSED' as const;
}
export function integrationPartitionReceipt(value:unknown,coverage:CiPartitionCoverage):IntegrationPartitionReceipt{
 try{const body=validateBody(receiptBody.parse(JSON.parse(canonicalReleaseExecutionJson(value))),coverage),output={version:1 as const,purpose:'CUEVO_ISOLATED_INTEGRATION_PARTITION' as const,...body,status:status(body)};return{...output,payloadSha256:hash(canonicalReleaseExecutionJson(output))};}catch{throw fail();}
}
/** Captured selection is usable only to preserve sanitized failure evidence.
 * This path never certifies current discovery and cannot produce PASSED. */
export function integrationPartitionFailure(value:unknown,captured:ReturnType<typeof selectIntegrationPartition>):IntegrationPartitionReceipt{
 try{const selection=z.object({partition:z.enum(integrationPartitionIds),profile,scope:z.enum(['integration','critical-integration']),files:z.array(path).min(1).max(300)}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(captured))),body=validateBodyShape(receiptBody.parse(JSON.parse(canonicalReleaseExecutionJson(value))),selection);
  if(body.sourceUnchanged||!body.reasons.includes('SOURCE_CHANGED')||body.exitCode!==1||body.rows.find(row=>row.name==='source-freeze')!.exitCode!==1)throw fail();
  const output={version:1 as const,purpose:'CUEVO_ISOLATED_INTEGRATION_PARTITION' as const,...body,status:body.signal===null?'FAILED' as const:'CANCELLED' as const};return{...output,payloadSha256:hash(canonicalReleaseExecutionJson(output))};
 }catch{throw fail();}
}
/** Strict data/payload/outcome validation for signed historical metadata readers.
 * Original file selection and byte authority remain with that reader. */
export function validateParsedIntegrationPartition(value:unknown){
 try{const parsed=integrationPartitionReceiptSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),{version:_version,purpose:_purpose,status:_status,payloadSha256,...body}=parsed;void _version;void _purpose;void _status;
  validateBodyShape(body,{partition:body.partition,profile:body.identity.profile,scope:body.scope,files:body.files.map(row=>row.path)});
  const output={version:1 as const,purpose:'CUEVO_ISOLATED_INTEGRATION_PARTITION' as const,...body,status:status(body)};if(output.status!==parsed.status||hash(canonicalReleaseExecutionJson(output))!==payloadSha256)throw fail();return parsed;
 }catch{throw fail();}
}
export function validateIntegrationPartitionReceipt(value:unknown,expected:IntegrationIdentity,coverage:CiPartitionCoverage){
 try{const parsed=integrationPartitionReceiptSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),{version:_version,purpose:_purpose,status:_status,payloadSha256:_payload,...body}=parsed;void _version;void _purpose;void _status;void _payload;const rebuilt=integrationPartitionReceipt(body,coverage);
  if(!same(rebuilt,parsed)||!same(Object.fromEntries(Object.entries(parsed.identity).filter(([key])=>key!=='job')),expected))throw fail();
  if(parsed.status==='PASSED')for(const file of parsed.files)if(hash(readFileSync(resolve(file.path)))!==file.sha256)throw fail();return parsed;
 }catch{throw fail();}
}
function combineParsedIntegrationPartitions(parsed:IntegrationPartitionReceipt[],expected:IntegrationIdentity,selected:readonly string[]){
 if(new Set(parsed.map(row=>row.partition)).size!==2||parsed.some(row=>row.status!=='PASSED'||!same(Object.fromEntries(Object.entries(row.identity).filter(([key])=>key!=='job')),expected)))throw fail();
 const files=parsed.flatMap(row=>row.files).sort((a,b)=>a.path.localeCompare(b.path));if(!same(files.map(row=>row.path),[...selected].sort())||new Set(files.map(row=>row.path)).size!==files.length)throw fail();
 const start=Math.min(...parsed.map(row=>row.executionStartedAtMs!)),end=Math.max(...parsed.map(row=>row.executionCompletedAtMs!));
 return{status:'PASSED' as const,scope:expected.profile==='routine'?'critical-integration' as const:'integration' as const,files,caseCount:files.reduce((sum,file)=>sum+file.cases.length,0),durationMs:end-start,overlapSpanMs:end-start,partitions:parsed.map(row=>({partition:row.partition,job:row.identity.job,payloadSha256:row.payloadSha256,receiptSha256:hash(canonicalReleaseExecutionJson(row)),inventorySha256:row.inventorySha256!,reportSha256:row.reportSha256!,diagnosticsSha256:row.diagnosticsSha256!})).sort((a,b)=>a.partition.localeCompare(b.partition))};
}
export type CommittedIntegrationDescriptor={integration:{id:IntegrationPartition;files:string[]}[];files:{path:string;sha256:string}[]};
/** Metadata-only historical proof. The caller obtains this descriptor from the
 * independently checked immutable Git source, never a mutable local cache. */
export function combineCommittedIntegrationPartitions(values:unknown,expected:IntegrationIdentity,descriptorValue:CommittedIntegrationDescriptor){
 try{if(!['main-staging','full-runtime'].includes(expected.profile))throw fail();
  const descriptor=z.object({integration:z.array(z.object({id:z.enum(integrationPartitionIds),files:z.array(path).min(1).max(300)}).strict()).length(2),files:z.array(z.object({path:z.string().min(1),sha256:digest}).strict()).min(1).max(20000)}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(descriptorValue))),selected=descriptor.integration.flatMap(row=>row.files),physical=descriptor.files.filter(row=>/^apps\/api\/test\/integration\/.+[.]test[.]ts$/.test(row.path)&&!integrationExclusions.some(exclusion=>exclusion.file===row.path)).map(row=>row.path).sort();
  if(new Set(descriptor.integration.map(row=>row.id)).size!==2||new Set(descriptor.files.map(row=>row.path)).size!==descriptor.files.length||new Set(selected).size!==selected.length||!same([...selected].sort(),physical))throw fail();
  const parsed=z.array(z.unknown()).length(2).parse(JSON.parse(canonicalReleaseExecutionJson(values))).map(validateParsedIntegrationPartition);
  for(const receipt of parsed){const assignment=descriptor.integration.find(row=>row.id===receipt.partition);if(!assignment||!same(receipt.files.map(row=>row.path),assignment.files)||receipt.scope!=='integration')throw fail();for(const file of receipt.files)if(descriptor.files.find(row=>row.path===file.path)?.sha256!==file.sha256)throw fail();}
  return combineParsedIntegrationPartitions(parsed,expected,selected);
 }catch{throw fail();}
}
export function combineIntegrationPartitions(values:unknown,expected:IntegrationIdentity,coverage:CiPartitionCoverage){
 try{const parsed=z.array(z.unknown()).length(2).parse(JSON.parse(canonicalReleaseExecutionJson(values))).map(value=>validateIntegrationPartitionReceipt(value,expected,coverage));if(new Set(parsed.map(row=>row.partition)).size!==2||parsed.some(row=>row.status!=='PASSED'))throw fail();
  return combineParsedIntegrationPartitions(parsed,expected,expected.profile==='routine'?[...criticalIntegrationFiles].sort():fullIntegrationFiles());
 }catch{throw fail();}
}

const diagnosticSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_VITEST_ORIGINAL_CASE_DIAGNOSTICS'),reason:z.enum(['passed','failed','interrupted']),unhandledErrors:z.number().int().nonnegative(),files:z.array(z.object({file:z.string(),durationMs:z.number().finite().nonnegative(),cases:z.array(z.object({definitionSha256:digest,state:z.enum(['passed','failed','skipped','pending']),mode:z.enum(['run','only','skip','todo']),retryCount:z.number().int().nonnegative().nullable(),repeatCount:z.number().int().nonnegative().nullable(),configuredRetry:z.number().int().nonnegative(),configuredRepeats:z.number().int().nonnegative()}).strict()).max(10000)}).strict()).min(1).max(300)}).strict();
/** Existing Vitest lifecycle, narrowed to safe identifiers and original attempt
 * diagnostics. The standard private JSON remains with the integration runner. */
export default class IntegrationCaseDiagnostics implements Reporter{
 async onTestRunEnd(modules:readonly TestModule[],errors:readonly unknown[],reason:TestRunEndReason){
  const output=process.env.CUEVO_INTEGRATION_DIAGNOSTIC_PATH;if(!output)throw fail();
  const result=diagnosticSchema.parse({version:1,purpose:'CUEVO_VITEST_ORIGINAL_CASE_DIAGNOSTICS',reason,unhandledErrors:errors.length,files:modules.map(module=>({file:module.moduleId,durationMs:module.diagnostic().duration,cases:[...module.children.allTests()].map(test=>{const diagnostic=test.diagnostic(),retry=test.options.retry;return{definitionSha256:hash(test.fullName),state:test.result().state,mode:test.options.mode,retryCount:diagnostic?.retryCount??null,repeatCount:diagnostic?.repeatCount??null,configuredRetry:typeof retry==='number'?retry:retry?.count??0,configuredRepeats:test.options.repeats??0};})}))});
  await writeFile(output,canonicalReleaseExecutionJson(result),{mode:0o600});
 }
}
export function integrationExecutedFiles(report:unknown,inventory:unknown,diagnosticsValue:unknown,context:{expectedFiles:readonly string[];startedAt:number;finishedAt:number;repoRoot:string}){
 try{
  validateIntegrationRunReport(report,inventory,context);const diagnostics=diagnosticSchema.parse(JSON.parse(canonicalReleaseExecutionJson(diagnosticsValue)));
  if(diagnostics.reason!=='passed'||diagnostics.unhandledErrors!==0||!same(diagnostics.files.map(row=>resolve(row.file)).sort(),context.expectedFiles.map(file=>resolve(file)).sort()))throw fail();
  const cases=z.array(z.object({file:z.string(),name:z.string()})).parse(inventory);
  return context.expectedFiles.map(file=>{const actual=diagnostics.files.filter(row=>resolve(row.file)===resolve(file));if(actual.length!==1)throw fail();const selected=actual[0],expected=cases.filter(row=>resolve(row.file)===resolve(file)).map(row=>hash(row.name)).sort();
   if(!expected.length||!same(selected.cases.map(row=>row.definitionSha256).sort(),expected)||new Set(expected).size!==expected.length||selected.cases.some(row=>row.state!=='passed'||row.mode!=='run'||row.retryCount!==0||row.repeatCount!==0||row.configuredRetry!==0||row.configuredRepeats!==0))throw fail();
   return{path:relative(context.repoRoot,resolve(file)).split('\\').join('/'),sha256:hash(readFileSync(resolve(file))),durationMs:selected.durationMs,cases:selected.cases.map(row=>({definitionSha256:row.definitionSha256,outcome:'PASSED' as const,retryCount:0,repeatCount:0}))};
  });
 }catch{throw fail();}
}
/** Failure metadata can describe only observed original listed case hashes.
 * Missing/malformed diagnostics remain empty and can never certify success. */
export function integrationFailureFiles(inventoryValue:unknown,diagnosticsValue:unknown,context:{files:{path:string;sha256:string}[];repoRoot:string}){
 const empty=()=>context.files.map(file=>({path:relative(context.repoRoot,resolve(file.path)).split('\\').join('/'),sha256:file.sha256,durationMs:null as number|null,cases:[]as z.infer<typeof caseSchema>[]}));
 try{const inventory=z.array(z.object({file:z.string(),name:z.string()})).max(10000).parse(inventoryValue),diagnostics=diagnosticSchema.parse(JSON.parse(canonicalReleaseExecutionJson(diagnosticsValue)));if(new Set(diagnostics.files.map(row=>resolve(row.file))).size!==diagnostics.files.length)throw fail();
  return context.files.map(file=>{const selected=diagnostics.files.find(row=>resolve(row.file)===resolve(file.path)),names=inventory.filter(row=>resolve(row.file)===resolve(file.path)).map(row=>hash(row.name));if(!selected||!names.length)return empty().find(row=>row.path===relative(context.repoRoot,resolve(file.path)).split('\\').join('/'))!;
   const observed=selected.cases.filter(row=>names.includes(row.definitionSha256)&&row.retryCount!==null&&row.repeatCount!==null);if(new Set(observed.map(row=>row.definitionSha256)).size!==observed.length)throw fail();
   return{path:relative(context.repoRoot,resolve(file.path)).split('\\').join('/'),sha256:file.sha256,durationMs:selected.durationMs,cases:observed.map(row=>({definitionSha256:row.definitionSha256,outcome:row.state==='failed'?'FAILED' as const:row.mode==='todo'?'TODO' as const:row.state==='skipped'?'SKIPPED' as const:row.state==='passed'?'PASSED' as const:'CANCELLED' as const,retryCount:row.retryCount!,repeatCount:row.repeatCount!}))};
  });
 }catch{return empty();}
}
