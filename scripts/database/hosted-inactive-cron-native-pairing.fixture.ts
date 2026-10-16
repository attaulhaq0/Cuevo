import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {readFileSync,writeFileSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import * as actualFs from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {PassThrough} from 'node:stream';
import {types} from 'node:util';
import {transformSync} from 'esbuild';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {originalChildNative124JournalFixture} from './hosted-original-child-recovery.fixture';
import {expandOriginalNative180RecoveryTemplate,readOriginalNative180RetainedChild} from './hosted-original-child-recovery';
import {readInactiveCronLegacyTransportBody,readInactiveCronLegacyTransportSource,readInactiveCronEmptyRuntime,readInactiveCronEmptyAppCensus,inactiveCronEmptyAppCensusSql,requireOriginal231InactiveDefinitionCustody} from './hosted-original231-transport-observation';
import {prepareInactiveCronDefinitionContext,preparePersistedInactiveCronAcknowledgementSelection} from './hosted-inactive-cron-definition-contracts';
import {backendReleaseExecutionSchema,validateBackendReleaseDelivery} from '../verification/backend-release-delivery';
import {validatePreparedBackendReleaseIntent} from '../verification/backend-release-contracts';
import {readOriginal231SourceAttestationGuard} from './hosted-original231-provenance';
import {backendInactiveCronDefinitionFactsFixture} from '../verification/backend-prepared-catalogue.fixture';
import {readOriginal231TransportDisabledDefinitions} from './hosted-original231-transport-catalogue';
import {requireCompleteHostedSchemaCatalogue} from './hosted-schema-catalogue';
import {verifyHostedMigrationHistory} from './hosted-migration-history';
import {nativeHostedOperatorStorageCountsSchema,nativeHostedOperatorStorageBucketsSchema,nativeHostedOperatorStorageObjectsSchema,prepareNativeHostedInactiveCronDefinitionStorageInventory} from './hosted-operator-storage-observation';
import {observeHostedInactiveCronDefinitionStorageProject,createHostedInactiveCronDefinitionOperatorStorage} from './hosted-migration-storage-observation';
import type {HostedSchemaCatalogueRow} from './hosted-schema-catalogue';

export type PairingFailurePhase='CATALOGUE'|'BASELINE51'|'POST_ACK52'|'READ53'|'READ54';
export type PairingFailureReboundStep='PACKAGE'|'ADMISSION_PREPARE'|'ADMISSION_REFRESH'|'PERMISSIONS'|'READ'|'ASSERT';
const failurePhases:readonly string[]=['CATALOGUE','BASELINE51','POST_ACK52','READ53','READ54'];
const failureReboundSteps:readonly string[]=['PACKAGE','ADMISSION_PREPARE','ADMISSION_REFRESH','PERMISSIONS','READ','ASSERT'];
const failureCategories:readonly string[]=['ASSERTION','SYNTAX_OR_MODULE','REFUSAL','OTHER'];
const failureFrameFiles=new Set(['hosted-inactive-cron-native-pairing.fixture.ts','hosted-inactive-cron-native-pairing.test.ts','hosted-migration-executor.ts','hosted-migration-database.ts','hosted-migration-journal.ts','hosted-migration-native-process.ts'].map(name=>'scripts/database/'+name));
export const pairingFailureDiagnosticPath='.local/verification/inactive-cron-pairing/failure.json';
const failureRecord=(value:unknown,keys:readonly string[])=>{
 if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid fixed diagnostic');
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))throw Error('Invalid fixed diagnostic');
 const result:Record<string,unknown>={};for(const key of keys){const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!('value'in field)||!field.enumerable)throw Error('Invalid fixed diagnostic');result[key]=field.value;}return result;
};
const failureInteger=(value:unknown,maximum:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=maximum;
/** Closed test-only data. No raw error, journal, SQL or caller effect flag is retained. */
export function encodePairingFailureDiagnostic(value:unknown):string|null{
 try{
  const raw=failureRecord(value,['identity','phase','reboundStep','category','frame','counters']),identity=failureRecord(raw.identity,['sourceSha','treeSha','runId','runAttempt','testSha256','fixtureSha256']);
  for(const key of['sourceSha','treeSha'])if(typeof identity[key]!=='string'||!/^[a-f0-9]{40}$/.test(identity[key] as string))return null;
  for(const key of['testSha256','fixtureSha256'])if(typeof identity[key]!=='string'||!/^[a-f0-9]{64}$/.test(identity[key] as string))return null;
  if(typeof identity.runId!=='string'||!/^[1-9][0-9]{0,19}$/.test(identity.runId)||!Number.isSafeInteger(Number(identity.runId))||!failureInteger(identity.runAttempt,1000000)||identity.runAttempt===0||typeof raw.phase!=='string'||!failurePhases.includes(raw.phase)||typeof raw.category!=='string'||!failureCategories.includes(raw.category))return null;
  if(raw.phase==='READ53'||raw.phase==='READ54'){if(typeof raw.reboundStep!=='string'||!failureReboundSteps.includes(raw.reboundStep))return null;}else if(raw.reboundStep!==null)return null;
  let frame:Record<string,unknown>|null=null,counters:Record<string,unknown>|null=null;
  if(raw.frame!==null){frame=failureRecord(raw.frame,['file','line','column']);if(typeof frame.file!=='string'||!failureFrameFiles.has(frame.file)||!failureInteger(frame.line,1000000)||frame.line===0||!failureInteger(frame.column,1000000)||frame.column===0)return null;}
  if(raw.counters!==null){counters=failureRecord(raw.counters,['cliAttempts','historyRows','closed','released','ownerObjects','ackRecords','localAckRecords']);if(!failureInteger(counters.cliAttempts,2)||!failureInteger(counters.historyRows,1000)||typeof counters.closed!=='boolean'||typeof counters.released!=='boolean'||!failureInteger(counters.ownerObjects,1)||!failureInteger(counters.ackRecords,3)||counters.localAckRecords!==null&&!failureInteger(counters.localAckRecords,3))return null;}
  const encoded=JSON.stringify({version:1,purpose:'CUEVO_CONTROLLED_INACTIVE_PAIRING_FAILURE',evidence:'CONTROLLED_SOURCE_FIXTURE_FAILURE_ONLY',effectAuthority:false,hostedAcceptance:false,acceptedReceipt:false,identity,phase:raw.phase,reboundStep:raw.reboundStep,category:raw.category,frame,counters});return Buffer.byteLength(encoded)<=4096?encoded:null;
 }catch{return null;}
}
/** Read only own error data; private text never reaches the output. */
export function pairingFailureErrorDetails(value:unknown):{category:string;frame:{file:string;line:number;column:number}|null}{
 const absent={category:'OTHER',frame:null};try{
  if(!value||typeof value!=='object'||types.isProxy(value))return absent;const code=Object.getOwnPropertyDescriptor(value,'code'),stack=Object.getOwnPropertyDescriptor(value,'stack');if(code&&!('value'in code))return absent;
  const category=code?.value==='ERR_ASSERTION'?'ASSERTION':code?.value==='ERR_MODULE_NOT_FOUND'||Object.getPrototypeOf(value)===SyntaxError.prototype?'SYNTAX_OR_MODULE':'OTHER';let frame:{file:string;line:number;column:number}|null=null;
  if(stack&&'value'in stack&&typeof stack.value==='string'&&stack.value.length<=32768)for(const line of stack.value.split(/\r?\n/).slice(1)){
   const location=/^ {4}at (?:[^()\r\n]+ \(([^()\r\n]+)\)|((?:file:\/\/\/|\/|[A-Za-z]:\/)[^()\r\n]+))$/.exec(line.replaceAll('\\','/'));if(!location)continue;
   const match=/^(?:file:\/\/\/|\/|[A-Za-z]:\/)[^()\r\n]*\/scripts\/database\/([^/:]+):([1-9][0-9]{0,5}):([1-9][0-9]{0,5})$/.exec(location[1]??location[2]);if(match&&failureFrameFiles.has('scripts/database/'+match[1])){frame={file:'scripts/database/'+match[1],line:Number(match[2]),column:Number(match[3])};break;}
  }return{category,frame};
 }catch{return absent;}
}
/** Optional companion only in the actual owned source-delivery job. It cannot
 * replace an assertion, repair custody, or become a partition receipt. */
export async function retainPairingFailureDiagnostic(details:unknown):Promise<boolean>{
 try{
  const raw=failureRecord(details,['phase','reboundStep','category','frame','counters']);if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_JOB!=='source-fixtures-delivery')return false;
  const root=resolve(import.meta.dirname,'../..');if(!root.startsWith('/home/runner/work/')||await actualFs.realpath(root)!==root)return false;
  const timing=JSON.parse(process.env.CUEVO_CI_TEST_TIMING_INPUT??''),current=timing.identity,sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim(),treeSha=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
  if(current?.scope!=='source-delivery'||sourceSha!==process.env.GITHUB_SHA||sourceSha!==current.sourceSha||treeSha!==current.treeSha||current.runId!==process.env.GITHUB_RUN_ID||String(current.runAttempt)!==process.env.GITHUB_RUN_ATTEMPT||!Array.isArray(timing.files))return false;
  const testPath='scripts/database/hosted-inactive-cron-native-pairing.test.ts',fixturePath='scripts/database/hosted-inactive-cron-native-pairing.fixture.ts',testSha256=pairingHash(readFileSync(join(root,testPath))),fixtureSha256=pairingHash(readFileSync(join(root,fixturePath))),test=timing.files.filter((row:{path:unknown})=>row?.path===testPath);if(test.length!==1||test[0].sha256!==testSha256)return false;
  for(const[path,expected]of[[testPath,testSha256],[fixturePath,fixtureSha256]])if(pairingHash(execFileSync('git',['show',sourceSha+':'+path],{cwd:root,windowsHide:true,stdio:['ignore','pipe','ignore']}))!==expected)return false;
  const identity={sourceSha,treeSha,runId:current.runId,runAttempt:current.runAttempt,testSha256,fixtureSha256},encoded=encodePairingFailureDiagnostic({identity,...raw});if(!encoded)return false;
  let directory=root;for(const name of['.local','verification','inactive-cron-pairing']){directory=join(directory,name);try{await actualFs.lstat(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')return false;await mkdir(directory,{mode:0o700});}const stat=await actualFs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||await actualFs.realpath(directory)!==directory)return false;}
  await writeFile(join(root,pairingFailureDiagnosticPath),encoded+'\n',{flag:'wx',mode:0o600});return true;
 }catch{return false;}
}
import type {Original231TransportAppendPlan} from './original231-transport-plan-contracts';

/** Test-only external I/O. Production admission, source, permit, native execution
 * token, all three journal adapters and configuration readers remain original.
 * These controlled results cannot establish actual SQL/OS/hosted acceptance. */
export const pairingHash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const jsonHash=(value:unknown)=>pairingHash(canonicalReleaseExecutionJson(value));
export const pairingNow=Date.parse('2026-10-16T02:00:00Z');
// Public Supabase Root2021 CA, source locked from the credential-free URL
// https://supabase-downloads.s3.ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
// SHA256700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7.
// This is public certificate data, never a private key or approval fixture.
export const pairingPublicCa=`-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;
const ref='mqxdjvsyckzocokuikmx',bucket='cuevo-release-operator';
const password='controlled-native-pairing-private-canary';
const producerPaths=['scripts/database/hosted-child-catalogue-producer.ts','scripts/database/hosted-child-catalogue-reference.ts','scripts/database/hosted-child-catalogue-bootstrap.sql','scripts/database/hosted-schema-catalogue.ts','scripts/database/replay-plan.ts','scripts/database/unknown-prefix-catalogue-policy.json'];
export const pairingAdditionalPaths=[...producerPaths,'scripts/database/hosted-original231-transport-catalogue.ts','scripts/database/original231-transport-source.ts','supabase/migrations/20261015110814_sql_cron_managed_transport.sql'];
export function pairingCatalogueRows():HostedSchemaCatalogueRow[]{
 return [...['app','authorization','internal'].map(name=>({category:'schema' as const,key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}})),...['cuevo_api','cuevo_worker'].map(name=>({category:'role' as const,key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:false,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}})),...Array.from({length:136},(_,index)=>{const name='controlled_table_'+String(index).padStart(3,'0');return{category:'relation' as const,key:JSON.stringify(['app',name]),facts:{schema:'app',name,owner:'postgres',acl:null,kind:'r',persistence:'p',accessMethod:'heap',tablespace:null,isPartition:false,populated:true,rls:true,forceRls:true,replicaIdentity:'d',options:null,partitionKey:null,partitionBound:null,definition:null,parents:[]}};})];
}
export function pairingHistoryRow(row:{name:string;version:string},bytes:Uint8Array){return{version:row.version,name:row.name.slice(15,-4),statements:bytes.length?[new TextDecoder('utf8',{fatal:true}).decode(bytes).trim()]:[]};}
/** Cheap exact-owner packet/context preflight, before expensive native authority
 * acquisition. Parsed metadata remains supplied and grants no native permit. */
export function preflightPairingExecutionPacket(value:unknown){
 const packet=backendReleaseExecutionSchema.parse(value);assert.equal(packet.version,3);if(packet.version!==3)throw Error('Pairing requires the existing inactive execution package');
 const prepared=validatePreparedBackendReleaseIntent(packet.preparedApproval,packet.expected),plan=packet.plan as Original231TransportAppendPlan,expected=packet.expected as {releaseSha:string;treeSha:string;ciRunId:string;releaseRunId:string;runAttempt:number};
 validateBackendReleaseDelivery(packet.delivery,'inactive-cron-definitions');const stage=packet.stages[0],stageSha256=pairingHash(JSON.stringify({included:stage.included.map(({name,version,sha256})=>({name,version,sha256})),configSha256:stage.configSha256}));
 const identity={...plan.original231Recovery.template.originalIdentity,sourceSha:expected.releaseSha,treeSha:expected.treeSha,planSha256:plan.planSha256,stageSha256,approvalDigest:prepared.sha256,ciRunId:expected.ciRunId};
 return prepareInactiveCronDefinitionContext({plan,identity,catalogueReference232:packet.catalogueReference232,releaseRunId:expected.releaseRunId,releaseRunAttempt:expected.runAttempt});
}
type FixtureInput={run:{id:number;head_sha:string;repository:{full_name:string}};jobs:Record<string,unknown>[];artifacts:Record<string,unknown>[];archives:Record<string,string>;tree:string;ownerRoot:string};
type ChildProof={reference:Record<string,unknown>;original231Reference:Record<string,unknown>;receipt232:{disabledDefinitions:{facts:unknown}};plan:Original231TransportAppendPlan};
type PairingState={objects:Map<string,string>;queries:string[];events:string[];history:Record<string,unknown>[];deliveredHistoryVersions:string[];catalogue:HostedSchemaCatalogueRow[];vault:Map<string,string>;installed:boolean;closed:boolean;released:boolean;cliAttempts:number;nativeState:Record<string,unknown>|null;nativeOwner:string;mode:string;currentPrefix:string|null;clock:number;finalAckLeafReads:number;lateReadInjected:boolean;observedLocalAckRecords:number|null};

/** Exact external metadata fixture, with the same controls as the existing
 * canonical/admission fixture. No request escapes this test's local responder. */
export async function pairingMetadataHarness(input:FixtureInput){
 // The isolated source checkout has no dependency installation. Resolve the
 // existing external Zod package from this test owner while retaining source
 // aliases and all source/admission implementations in the owned checkout.
 const zodUrl=import.meta.resolve('zod');
 const dependencies=registerHooks({resolve(specifier,context,next){return specifier==='zod'?{shortCircuit:true,url:zodUrl}:next(specifier,context);}});
 const root=process.cwd(),repository=input.run.repository.full_name,sourceSha=input.run.head_sha,treeSha=input.tree,ciRunId=String(input.run.id),releaseRunId='51',now=pairingNow;let activeReleaseRunId=releaseRunId;
 const contracts=await import('../verification/backend-release-contracts');
 let approvalComment='',failurePhase:PairingFailurePhase='CATALOGUE',failureReboundStep:PairingFailureReboundStep|null=null;let failureState:PairingState|null=null;
 const backend={id:51,run_attempt:1,head_sha:sourceSha,head_branch:'main',event:'workflow_dispatch',status:'in_progress',conclusion:null,path:'.github/workflows/backend-release.yml',repository:{full_name:repository}};
 const environment={id:123,name:'staging',can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:95836629,login:'attaulhaq0',type:'User'}}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
 const read=async(path:string):Promise<unknown>=>{
  if(path==='contents/.github/workflows/ci.yml?ref='+sourceSha){const bytes=execFileSync('git',['show',sourceSha+':.github/workflows/ci.yml'],{cwd:root,windowsHide:true});return{type:'file',path:'.github/workflows/ci.yml',encoding:'base64',size:bytes.length,content:bytes.toString('base64'),sha:createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')};}
  if(path==='actions/runs/31')return input.run;
  if(path.startsWith('actions/runs/31/attempts/2/jobs?'))return{total_count:input.jobs.length,jobs:input.jobs};
  if(path==='actions/runs/31/artifacts?per_page=100')return{total_count:input.artifacts.length,artifacts:input.artifacts};
  if(path==='git/ref/heads/main')return{object:{type:'commit',sha:sourceSha}};
  if(path.startsWith('git/commits/'))return{sha:sourceSha,tree:{sha:treeSha},verification:{verified:true,reason:'valid',signature:'controlled-signature',payload:'controlled-source-payload'}};
  if(path.startsWith('actions/workflows/ci.yml/runs?'))return{total_count:1,workflow_runs:[input.run]};
  if(path==='')return{full_name:repository,name:'Cuevo',owner:{id:1,login:'attaulhaq0',type:'User'}};
  if(path==='actions/runs/'+activeReleaseRunId)return backend;
  if(path==='environments/staging')return environment;
  if(path==='environments/staging/deployment-branch-policies')return{total_count:1,branch_policies:[{name:'main',type:'branch'}]};
  if(path==='branches/main/protection')return{allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},enforce_admins:{enabled:true},required_status_checks:{strict:true,contexts:['required']},required_pull_request_reviews:{dismiss_stale_reviews:true,require_code_owner_reviews:false,required_approving_review_count:0,require_last_push_approval:false}};
  if(path==='branches/main/protection/required_signatures')return{enabled:true};
  if(path==='actions/runs/'+activeReleaseRunId+'/approvals')return[{environments:[{id:123,name:'staging'}],state:'approved',user:{id:95836629,login:'attaulhaq0',type:'User'},comment:approvalComment}];
  if(path.startsWith('actions/artifacts/')){const pins=originalMetadataPins[path.split('/').at(-1)!];if(pins)return{id:Number(path.split('/').at(-1)),name:pins[0],digest:'sha256:'+pins[1],size_in_bytes:pins[2],expired:false,expires_at:'2026-10-12T04:58:32Z',workflow_run:{id:pins[3],head_sha:pins[4],head_branch:'main'}};}
  throw Error('Unexpected controlled GitHub path: '+path);
 };
 const archive=async(id:number)=>{assert.ok(input.archives[String(id)],'only the existing retained fixture archives are read');return Buffer.from(input.archives[String(id)],'base64');};
 return{root,repository,sourceSha,treeSha,ciRunId,releaseRunId,now,contracts,read,archive,backend,environment,disposeDependencies:()=>dependencies.deregister(),setReleaseRun:(value:string)=>{activeReleaseRunId=value;backend.id=Number(value);},setApproval:(comment:string)=>{approvalComment=comment;},setFailurePhase:(value:PairingFailurePhase)=>{failurePhase=value;failureReboundStep=null;},setFailureReboundStep:(value:PairingFailureReboundStep)=>{failureReboundStep=value;},setFailureState:(value:PairingState|null)=>{failureState=value;},failureDetails:(error:unknown)=>{const state=failureState,prefix=state?.currentPrefix;return{phase:failurePhase,reboundStep:failureReboundStep,...pairingFailureErrorDetails(error),counters:state?{cliAttempts:state.cliAttempts,historyRows:state.history.length,closed:state.closed,released:state.released,ownerObjects:prefix&&state.objects.has(prefix+'owner.json')?1:0,ackRecords:prefix?['000001.record.json','000002.record.json','000003.record.json'].filter(name=>state.objects.has(prefix+name)).length:0,localAckRecords:state.observedLocalAckRecords}:null};}};
}
const originalMetadataPins:Record<string,readonly[string,string,number,number,string]>={
 '11707162912':['cuevo-backend-schema-result-38150995125-1','832e6eed86f1cb55b0928319b473a51fe4d39acdc4b5ad6bf93f5a1ce5009bcb',4369,38150995125,'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37'],
 '11706950187':['cuevo-backend-package-38150995125-1','829374e8f327bdea5903b2f0b35dac3ec7c5096ae1f3c269eaa38196bf248829',5996069,38150995125,'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37'],
 '11696892854':['cuevo-backend-schema-result-38125155826-1','96d7c415537d8c49a6de389ef118ab4c624afb875a1371fca347f36672840e1e',4316,38125155826,'9bee5e0d59d95274266158a0644139fd4df5334e'],
 '11697205637':['cuevo-backend-package-38125155826-1','bf75f2a2d6836373432e24eb6217a0d4cb051805793a97fbbae9af6aa94a54ed',4345922,38125155826,'9bee5e0d59d95274266158a0644139fd4df5334e'],
 '11660597251':['cuevo-backend-schema-result-38025787883-1','75ef473a2890878134b080b6c1dbb64a633cb1d55881869b4971f7dadb6af017',7788,38025787883,'1a493ad735798bb6d3fa0ffaabc779e62149ac37'],
 '11659824933':['cuevo-backend-package-38025787883-1','53d434d7b49895b9cb8b8e4af3aa06af67249e426bc19312b598641686b1a76f',2862235,38025787883,'1a493ad735798bb6d3fa0ffaabc779e62149ac37'],
};

function originalObjects(state:PairingState,plan:Original231TransportAppendPlan){
 const original=plan.original231Recovery.template,native=expandOriginalNative180RecoveryTemplate(JSON.parse(original.native180ReceiptJson).template,original.stageRows.slice(0,180)),child=readOriginalNative180RetainedChild(native).template,native124=originalChildNative124JournalFixture();
 for(const saved of[original,native,child]){const prefix=`migration/v1/${ref}/${saved.selection.originalOperationSha256}/`;state.objects.set(prefix+'owner.json',saved.ownerJson);saved.recordJson.forEach((bytes,index)=>state.objects.set(prefix+String(index+1).padStart(6,'0')+'.record.json',bytes));}
 const prefix=`migration/v1/${ref}/${child.native124.originalOperationSha256}/`;state.objects.set(prefix+'owner.json',native124.ownerJson);state.objects.set(prefix+'000001.record.json',native124.record1Json);state.objects.set(prefix+'000002.record.json',native124.terminalJson);
 state.vault.set('cuevo_schema_stage_'+ref,original.installedMarkerJson);state.vault.set('cuevo_original_native180_'+ref+'_'+native.selection.originalOperationSha256,original.native180ReceiptJson);state.vault.set('cuevo_original_child144_'+ref+'_'+child.selection.originalOperationSha256,native.original144ReceiptJson);original.batchReceiptJson.forEach((bytes,index)=>state.vault.set('cuevo_batch_prefix_'+ref+'_'+original.selection.originalOperationSha256+'_'+String(index+1).padStart(3,'0'),bytes));
}
function createPairingState(plan:Original231TransportAppendPlan,identity:unknown,root:string,clock:number):PairingState{
 const state:PairingState={objects:new Map(),queries:[],events:[],history:plan.migrations.slice(0,231).map(row=>pairingHistoryRow(row,readFileSync(join(root,'supabase/migrations',row.name)))),deliveredHistoryVersions:[],catalogue:pairingCatalogueRows(),vault:new Map(),installed:false,closed:false,released:false,cliAttempts:0,nativeState:null,nativeOwner:'',mode:'',currentPrefix:`migration/v1/${ref}/${pairingHash(JSON.stringify(identity))}/`,clock,finalAckLeafReads:0,lateReadInjected:false,observedLocalAckRecords:null};originalObjects(state,plan);return state;
}
const objectId=(path:string)=>{const raw=pairingHash(path);return raw.slice(0,8)+'-'+raw.slice(8,12)+'-4'+raw.slice(13,16)+'-8'+raw.slice(17,20)+'-'+raw.slice(20,32);};
const buckets=[{id:bucket,name:bucket,public:false,type:'STANDARD',file_size_limit:49152,allowed_mime_types:['application/json']},{id:'learner-private',name:'learner-private',public:false,type:'STANDARD',file_size_limit:524288,allowed_mime_types:['text/plain','image/png','image/jpeg','application/pdf']}];
function storageRows(state:PairingState){return[...state.objects].sort(([left],[right])=>left.localeCompare(right)).map(([name,bytes])=>({id:objectId(name),bucket_id:bucket,name,version:'controlled-version',size:String(Buffer.byteLength(bytes)),mimetype:'application/json',createdAt:'2026-10-16T02:00:00.000000Z',updatedAt:'2026-10-16T02:00:00.000000Z'}));}
function pgQuery(state:PairingState,plan:Original231TransportAppendPlan,disabled:unknown,sql:string,values:unknown[]){
 state.queries.push(sql);
 if(sql.includes('pg_try_advisory_lock'))return[{locked:true}];
 if(sql.includes('pg_advisory_unlock')){state.released=true;return[{released:true}];}
 if(sql.startsWith('select session_user'))return[{operator:'postgres',database:'postgres',ssl:true,serverVersion:170011}];
 if(sql.includes('CUEVO_NATIVE_QUIESCENCE'))return[{quiescent:true}];
 if(sql.includes('CUEVO_CATALOGUE_READ_ONLY'))return[{readOnly:true,isolation:'repeatable read'}];
 if(sql.includes('as "historyPresent"'))return[{historyPresent:true}];
 if(sql.startsWith('select version,coalesce(name')){const rows=structuredClone(state.history).sort((left,right)=>String(left.version).localeCompare(String(right.version)));state.deliveredHistoryVersions=rows.map(row=>String(row.version));return rows;}
 if(sql.includes('CUEVO_STAGE_BASE'))return[{foundation:true,rls:true,privateRelations:true,privateFunctions:true,runtimeRoles:true}];
 if(sql.includes('CUEVO_NATIVE_BRIDGE'))return[{nativeSourceBridge:true}];
 if(sql.includes('CUEVO_CURRICULUM_LIFECYCLE'))return[{curriculumLifecycle:true}];
 if(sql.includes('CUEVO_DISPATCH_INACTIVE'))return[{count:1,disabled:true}];
 if(sql.includes('CUEVO_ANALYTICS_INACTIVE'))return[{count:0,disabled:true}];
 if(sql.includes('CUEVO_RECOVERY_CRON_PRESENCE'))return[{present:false}];
 if(sql.includes('CUEVO_TRANSPORT_PRIVATE')||sql.includes('CUEVO_INACTIVE_CRON_LEGACY_PRIVATE'))return[{transportPrivate:false}];
 if(sql.includes('CUEVO_TRANSPORT_SOURCE')){const source=readFileSync(join(process.cwd(),'supabase/migrations/20261005132902_worker_transport_provider_trust_boundary.sql'),'utf8'),marker="create or replace function internal.worker_transport_private()returns boolean\nlanguage plpgsql stable security definer set search_path=''as $$",start=source.indexOf(marker);assert.ok(start>=0);return[{body:source.slice(start+marker.length,source.indexOf('end$$;',start)+3),valid:true}];}
 if(sql.includes('CUEVO_INACTIVE_CRON_LEGACY_TRANSPORT_SOURCE'))return[{body:readInactiveCronLegacyTransportBody(readFileSync(join(process.cwd(),'supabase/migrations/20261015110814_sql_cron_managed_transport.sql'))),valid:true}];
 if(sql.includes('CUEVO_SCHEMA_CATALOGUE_V1_STRUCTURAL'))return structuredClone(state.catalogue.filter(row=>!['role','membership','roleSetting'].includes(row.category)));
 if(sql.includes('CUEVO_SCHEMA_CATALOGUE_V1_AUTHORITY'))return structuredClone(state.catalogue.filter(row=>['role','membership','roleSetting'].includes(row.category)));
 if(sql.includes('CUEVO_INACTIVE_CRON_FULL_EMPTY_APP_CENSUS'))return[{tableCount:136,empty:true}];
 if(sql.includes('CUEVO_ORIGINAL231_TRANSPORT_DISABLED_DEFINITIONS'))return[{facts:disabled}];
 if(sql.includes('CUEVO_INACTIVE_CRON_EMPTY_RUNTIME'))return[{runtimeNoLogin:true,runtimeKeysAbsent:true,processingAbsent:true,netQueueAbsent:true,authAbsent:true}];
 if(sql.includes('CUEVO_INACTIVE_CRON_ORIGINAL_CUSTODY'))return state.vault.has(String(values[0]))?[{decrypted_secret:state.vault.get(String(values[0]))}]:[];
 if(sql.includes('CUEVO_INACTIVE_CRON_ORIGINAL_THIRD_ACK'))return[];
 if(sql.includes('CUEVO_NATIVE_STORAGE_SNAPSHOT'))return[{counts:{bucketCount:2,totalObjects:state.objects.size,operatorObjects:state.objects.size,otherObjects:0,invalidOperatorPaths:0},buckets:buckets.map(row=>({...row,file_size_limit:String(row.file_size_limit)})),objects:storageRows(state),target:{authUsers:'0',storageObjects:String(state.objects.size),appSchemas:['app','authorization','internal'],runtimeRoles:['cuevo_api','cuevo_worker'],schoolsPresent:true,schools:'0'}}];
 if(/^(BEGIN|ROLLBACK|SET LOCAL)\b/.test(sql))return[];
 if(/^select .+ from (app\.[a-z_]+ limit 1001|auth.users limit 134)$/.test(sql))return[];
 void plan;throw Error('Unexpected controlled PostgreSQL query: '+sql.slice(0,100));
}

/** Read-only format preflight through exposed production decoders. Neither a
 * supplied context nor these controlled rows creates any native capability. */
export async function preflightPairingExternalObservations(){
 const {inactiveExecutionFixture}=await import('../verification/backend-inactive-cron-package.fixture');
 const packet=await inactiveExecutionFixture(),context=preflightPairingExecutionPacket(packet),plan=packet.plan,root=process.cwd(),state=createPairingState(plan,context.identity,root,Date.now()),sources=plan.migrations.map(row=>({name:row.name,bytes:readFileSync(join(root,'supabase/migrations',row.name))})),append=sources.at(-1)!;
 verifyHostedMigrationHistory({sources,included:plan.migrations,expectedVersions:plan.stage.expectedBeforeVersions,history:state.history});
 verifyHostedMigrationHistory({sources,included:plan.migrations,expectedVersions:plan.stage.expectedAfterVersions,history:[...state.history,pairingHistoryRow(plan.pending[0],append.bytes)]});
 const facts=backendInactiveCronDefinitionFactsFixture(append.bytes.toString('utf8'));
 readOriginal231TransportDisabledDefinitions(facts,append.bytes);
 const catalogue=requireCompleteHostedSchemaCatalogue(state.catalogue),census=inactiveCronEmptyAppCensusSql(catalogue);
 readInactiveCronEmptyAppCensus(pgQuery(state,plan,facts,census,[])[0]);
 readInactiveCronEmptyRuntime(pgQuery(state,plan,facts,'/* CUEVO_INACTIVE_CRON_EMPTY_RUNTIME */',[])[0]);
 readInactiveCronLegacyTransportSource(pgQuery(state,plan,facts,'/* CUEVO_INACTIVE_CRON_LEGACY_TRANSPORT_SOURCE */',[])[0],append.bytes);
 const raw=pgQuery(state,plan,facts,'/* CUEVO_NATIVE_STORAGE_SNAPSHOT */',[])[0] as {counts:unknown;buckets:unknown;objects:unknown};
 const before={observedAtMs:state.clock,counts:nativeHostedOperatorStorageCountsSchema.parse(raw.counts),buckets:nativeHostedOperatorStorageBucketsSchema.parse(raw.buckets),rows:nativeHostedOperatorStorageObjectsSchema.parse(raw.objects)};
 const input:FixtureInput={run:packet.expected.ciRun,tree:context.identity.treeSha,jobs:[],artifacts:[],archives:{},ownerRoot:root},metadata=await pairingMetadataHarness(input),restore=await installExternalPrimitives(input,state,plan,facts,metadata,'');
 try{
  const storage=await observeHostedInactiveCronDefinitionStorageProject({projectRef:ref,boundProjectRef:ref,storageKey:password,signal:new AbortController().signal,inactiveDefinitionContext:context});
  const managed=createHostedInactiveCronDefinitionOperatorStorage({projectRef:ref,boundProjectRef:ref,storageKey:password,providerToken:password,identity:context.identity,inactiveDefinitionContext:context});await managed.bucketRead();const managedChains=await managed.inspect();assert.equal(managedChains.length,4);assert.equal(managed.objects().length,12);
  requireOriginal231InactiveDefinitionCustody(storage,plan.original231Recovery.template,{identity:context.identity,contextSha256:context.contextSha256});
  const result=prepareNativeHostedInactiveCronDefinitionStorageInventory({identity:context.identity,expectedVersions:plan.stage.expectedBeforeVersions,before,after:{...before,observedAtMs:state.clock},storage,expectedBuckets:buckets,inactiveDefinitionContext:context});
  assert.equal(result.effectAuthority,false);assert.equal(result.foundationAccepted,false);assert.equal(result.totalStorageObjects,12);assert.equal(state.cliAttempts,0);assert.equal(state.closed,false);
  return{purpose:'CONTROLLED_NATIVE_OBSERVATION_FORMATS_PREFLIGHT_ONLY',beforeRows:231,afterRows:232,emptySourceRows:state.history.filter(row=>(row.statements as unknown[]).length===0).length,appTables:136,privateRawObjects:storage.objects.length,protectedOriginalCustody:'FORMAT_VERIFIED',nativeCapability:false,actualSQL:false,actualProvider:false};
 }finally{restore();metadata.disposeDependencies();}
}
function controlledToolchainPlatformSource(source:string){
 const changed=source.replace('manifest.platform!==`${process.platform}-${process.arch}`','manifest.platform!==`linux-x64`').replace("platform=process.platform==='win32'?'windows':process.platform;","platform='linux';").replace('cli-${platform}-${process.arch}','cli-${platform}-x64');
 assert.notEqual(changed,source,'only the explicitly controlled external platform/package selector changes');return changed;
}
export async function preflightPairingToolchainReader(){
 const root=await mkdtemp(join(tmpdir(),'cuevo-pairing-toolchain-')),lock=readFileSync(join(process.cwd(),'package-lock.json')),git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/hosted-migration-stage-files.ts'))return{format:'module',shortCircuit:true,source:transformSync(controlledToolchainPlatformSource(readFileSync(new URL(url),'utf8')),{loader:'ts',format:'esm'}).code};return next(url,context);}});
 try{
  await mkdir(join(root,'.local/hosted-release'),{recursive:true});await writeFile(join(root,'.gitignore'),'.local/\nnode_modules/\n');await writeFile(join(root,'package-lock.json'),lock);git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Controlled toolchain source-lock fixture');
  const sourceSha=git('rev-parse','HEAD'),treeSha=git('rev-parse','HEAD^{tree}'),cli=await createControlledCliFiles(root),manifest={version:1,purpose:'CUEVO_HOSTED_MIGRATION_TOOLCHAIN',sourceSha,treeSha,sourceLockSha256:pairingHash(lock),cliVersion:'2.119.0',platform:'linux-x64',cli},bytes=JSON.stringify(manifest)+'\n',path=join(root,'.local/hosted-release/migration-toolchain.json');await writeFile(path,bytes,{mode:0o600});
  const {readHostedMigrationToolchainManifest}=await import('./hosted-migration-stage-files'),input={repoRoot:root,sourceSha,treeSha,manifestSha256:pairingHash(bytes),cli};
  assert.deepEqual(await readHostedMigrationToolchainManifest(input),manifest);
  await assert.rejects(readHostedMigrationToolchainManifest({...input,cli:{...cli,binarySha256:'0'.repeat(64)}}));await assert.rejects(readHostedMigrationToolchainManifest({...input,manifestSha256:'0'.repeat(64)}));await writeFile(path,bytes+'\n');await assert.rejects(readHostedMigrationToolchainManifest(input));
  return{purpose:'CONTROLLED_TOOLCHAIN_READER_PREFLIGHT_ONLY',positive:1,denials:3,manifestSha256:input.manifestSha256,sourceLockSha256:manifest.sourceLockSha256,nativePermit:false,actualSQL:false};
 }finally{hook.deregister();assert.equal(resolve(root,'..'),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}
}
/** Retained-checkout diagnostic of the actual finite native observation only.
 * It creates no backend/effect permit and never constructs or runs a process. */
export async function debugRetainedPairingNativeObservation(retained:{root:string;sourceSha:string;treeSha:string;inputPath:string}){
 assert.equal(process.cwd(),retained.root);const input=JSON.parse(readFileSync(retained.inputPath,'utf8')) as FixtureInput;
 const {original231RecoveryPlanFixture}=await import('./hosted-original-child-recovery.fixture'),{prepareOriginal231TransportAppendPlan}=await import('./hosted-original231-transport-append');
 const raw=original231RecoveryPlanFixture({sha:retained.sourceSha,tree:retained.treeSha});raw.now=pairingNow-2000;raw.target.observedAt=new Date(raw.now).toISOString();
 const append=readFileSync(join(retained.root,'supabase/migrations/20261015110814_sql_cron_managed_transport.sql')),plan=prepareOriginal231TransportAppendPlan({...raw,sources:[...raw.sources,{name:'20261015110814_sql_cron_managed_transport.sql',bytes:append}]}),identity={...plan.original231Recovery.template.originalIdentity,sourceSha:retained.sourceSha,treeSha:retained.treeSha,planSha256:plan.planSha256,stageSha256:'e'.repeat(64),approvalDigest:'f'.repeat(64),ciRunId:'31'},state=createPairingState(plan,identity,retained.root,pairingNow),metadata=await pairingMetadataHarness(input),facts=backendInactiveCronDefinitionFactsFixture(append.toString('utf8')),restore=await installExternalPrimitives(input,state,plan,facts,metadata,'');
 try{
  const sourceRows=plan.migrations.map(row=>({name:row.name,bytes:readFileSync(join(retained.root,'supabase/migrations',row.name))}));
  const covered=verifyHostedMigrationHistory({sources:sourceRows,included:plan.migrations,expectedVersions:plan.stage.expectedBeforeVersions,history:state.history});
  const native=await import('./hosted-migration-database'),database=await native.createHostedOriginal231TransportAppendDatabase({repoRoot:retained.root,projectRef:ref,databaseUrl:plan.original231Recovery.template.originalIdentity.databaseUrl,certificate:{path:join(retained.root,'.local/hosted-release/pairing-ca.pem'),sha256:pairingHash(pairingPublicCa)},password});
  let result:unknown,errorName:string|null=null;
  try{await database.withLock(ref+':HOSTED_SCHEMA_MIGRATION',async()=>{result=await database.observeOriginal231TransportDefinitions({plan,phase:'ORIGINAL231'});});}catch(error){errorName=error instanceof Error?error.name:'UNKNOWN';}
  return{purpose:'CONTROLLED_RETAINED_NATIVE_READ_ONLY_DIAGNOSTIC',nativeObservationReturned:result!==undefined,errorName,included:plan.migrations.length,expectedVersions:plan.stage.expectedBeforeVersions.length,rawRows:state.history.length,sourceCoverage:covered.history.length,queryOrderMatches:JSON.stringify(state.deliveredHistoryVersions)===JSON.stringify(plan.stage.expectedBeforeVersions),lastQueries:state.queries.slice(-7).map(sql=>sql.slice(0,200)),diagnostics:database.getDiagnostics(),nativeEffectPermit:false,actualSQL:false};
 }finally{restore();metadata.disposeDependencies();}
}

export async function runPairingAfterCatalogue(input:FixtureInput,metadata:Awaited<ReturnType<typeof pairingMetadataHarness>>,proof:ChildProof,options:{releaseRunId?:string;captureFault?:boolean}={}){
 metadata.setFailurePhase(options.captureFault?'POST_ACK52':'BASELINE51');metadata.setFailureState(null);
 const {root,sourceSha,treeSha,contracts,now}=metadata,plan=proof.plan;
 const releaseRunId=options.releaseRunId??'51';metadata.setReleaseRun(releaseRunId);
 const ca=Buffer.from(pairingPublicCa);assert.equal(pairingHash(ca),plan.original231Recovery.template.originalIdentity.certificateSha256,'original public certificate bytes remain exact');
 const certificate={path:join(root,'.local/hosted-release/pairing-ca.pem'),sha256:pairingHash(ca)};await mkdir(join(root,'.local/hosted-release'),{recursive:true});await writeFile(certificate.path,ca,{mode:0o600});
 const stage=(await (await import('./hosted-migration-workdirs')).createOriginal231TransportAppendWorkdir({repoRoot:root,sourceSha,treeSha,plan,outputRoot:join(root,'.local/hosted-release')})).stage;
 const stageSha256=pairingHash(JSON.stringify({included:plan.migrations.map(({name,version,sha256})=>({name,version,sha256})),configSha256:stage.configSha256}));
 const binding=contracts.prepareInactiveCronDefinitionBackendBinding({plan,stageSha256,catalogueReference232:proof.reference});
 const targets={web:{teamId:'team_Cuevo',projectId:'prj_Web',origin:'https://cuevo-web.vercel.app',target:'preview'},api:{teamId:'team_Cuevo',projectId:'prj_Api',origin:'https://cuevo-api.vercel.app',target:'preview'},supabase:{projectRef:ref,authOrigin:`https://${ref}.supabase.co`,edgeOrigin:`https://${ref}.supabase.co/functions/v1/cuevo-worker`}};
 const cli=await createControlledCliFiles(root),manifest={version:1,purpose:'CUEVO_HOSTED_MIGRATION_TOOLCHAIN',sourceSha,treeSha,sourceLockSha256:pairingHash(readFileSync(join(root,'package-lock.json'))),cliVersion:'2.119.0',platform:'linux-x64',cli},manifestBytes=JSON.stringify(manifest)+'\n';
 await writeFile(join(root,'.local/hosted-release/migration-toolchain.json'),manifestBytes,{mode:0o600});
 const endpoint={projectRef:ref,kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'},fingerprints={sourceManifestSha256:pairingHash(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:root})),diffSha256:pairingHash(''),migrationPlanSha256:plan.planSha256,migrationHistorySha256:binding.beforeHistorySha256,migrationToolchainSha256:pairingHash(manifestBytes),migrationEndpointSha256:jsonHash(endpoint),operatorStoragePolicySha256:'e'.repeat(64),apiArtifactSha256:null,edgeArtifactSha256:null,denoLockSha256:null};
 const reviews=[{category:'source-spec-code',taskId:'source',reportSha256:'f'.repeat(64),evidenceSha256:'1'.repeat(64)},{category:'qa-regression-operations',taskId:'qa',reportSha256:'2'.repeat(64),evidenceSha256:'3'.repeat(64)}];
 const schema=await import('../verification/canonical-schema-jobs'),canonicalSchemaVerification=await schema.readCanonicalSchemaJobs(input.run,metadata.read,metadata.archive);
 const identity={repository:metadata.repository,releaseSha:sourceSha,treeSha,baseSha:sourceSha,ciRunId:metadata.ciRunId,releaseRunId,runAttempt:1,environmentId:123,environmentName:'staging',deploymentEnvironment:'synthetic-staging',executionScope:'inactive-cron-definitions',inactiveCronDefinitions:binding,canonicalSchemaVerification};
 const expected={...identity,targets,fingerprints,reviews,now,currentMainSha:sourceSha,ciRun:input.run,backendRun:metadata.backend};
 const prepared=contracts.prepareBackendReleaseIntent({version:3,purpose:'BACKEND_SYNTHETIC_STAGING',...identity,targets,fingerprints,reviews:reviews.map(row=>({...row,releaseSha:sourceSha,treeSha,baseSha:sourceSha,sourceManifestSha256:fingerprints.sourceManifestSha256,diffSha256:fingerprints.diffSha256,reviewedAt:new Date(now-1000).toISOString()})),preparedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()},expected);metadata.setApproval(prepared.comment);
 const contextIdentity=preflightPairingExecutionPacket({version:3,purpose:'CUEVO_BACKEND_RELEASE_EXECUTION',repoRoot:root,expected,preparedApproval:prepared,plan,migrationEndpoint:endpoint,stages:[stage],toolchainManifestPath:join(root,'.local/hosted-release/migration-toolchain.json'),operatorStoragePolicyPath:join(root,'.local/hosted-release/operator-storage-policy.json'),delivery:{kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null},catalogueReference232:proof.reference,original231RecoveryEvidence:readOriginal231SourceAttestationGuard(plan.original231Recovery.template.selection).evidence}).identity;
 const state=createPairingState(plan,contextIdentity,root,now);state.mode=options.captureFault?'POST_ACK_CAPTURE_FAULT':'';metadata.setFailureState(state);
 const originals=[...state.objects],originalVault=[...state.vault],oldHistory=structuredClone(state.history);
 const restore=await installExternalPrimitives(input,state,plan,proof.receipt232.disabledDefinitions.facts,metadata,certificate.path);
 const admission=await import('../verification/backend-release-admission');let handle:Awaited<ReturnType<typeof admission.prepareNativeBackendReleaseAdmission>>|undefined;
 try{
  handle=await admission.prepareNativeBackendReleaseAdmission({repoRoot:root,prepared,expected,effectScope:'INACTIVE_CRON_DEFINITIONS',githubToken:password});
  const result=await (await import('./hosted-migration-executor')).executeNativeOriginal231TransportAppend({repoRoot:root,plan,stage,prepared,expected,identity:contextIdentity,catalogueReference232:proof.reference,releaseRunId,releaseRunAttempt:1,databaseUrl:contextIdentity.databaseUrl,certificate,migrationPassword:password,providerToken:password,storageKey:password,cli,timeoutMs:30000,privateEnvironment:{PGPASSWORD:password,PGSSLROOTCERT:certificate.path},admissionHandle:handle});
  assert.equal(result.status,options.captureFault?'REQUIRES_REVIEW':'INACTIVE_DEFINITIONS_ACKNOWLEDGED',JSON.stringify({result,events:state.events.slice(-12),queries:state.queries.slice(-3)}));assert.equal(state.cliAttempts,1);assert.equal(result.sqlCommitment,'CONFIRMED_INACTIVE_DEFINITIONS');if(options.captureFault)assert.equal(result.configuration,null);else{assert.equal(result.configuration?.effectScope,'SQL_CRON_CONFIGURATION_ONLY');assert.equal(result.configuration?.activationAuthorized,false);assert.equal(result.configuration?.configurationExecution,'NOT_EXECUTED');}assert.equal(result.foundationAccepted,false);assert.equal(result.hostedAcceptance,false);assert.equal(result.originalAcknowledgement,'UNKNOWN');assert.equal(result.cleanup,'CONFIRMED_STOPPED_AND_RELEASED');assert.equal(state.closed,true);assert.equal(state.released,true);assert.equal(state.nativeState,null);
  assert.deepEqual(state.history.slice(0,231),oldHistory);assert.equal(state.history.length,232);assert.deepEqual([...state.vault],originalVault);for(const[path,bytes]of originals)assert.equal(state.objects.get(path),bytes);
  assert.ok(result.journal);const localRoot=join(root,'.local/hosted-release/journal-'+pairingHash(JSON.stringify(contextIdentity))),localChain=await Promise.all(['owner.json','000001.record.json','000002.record.json'].map(async name=>({name,bytes:await readFile(join(localRoot,name),'utf8')})));for(const row of localChain)assert.equal(state.objects.get(state.currentPrefix+row.name),row.bytes,'actual local and fixed remote raw chain bytes match');state.observedLocalAckRecords=2;const journalChainSha256=pairingHash(localChain.map(row=>row.bytes).join(''));if(!options.captureFault)assert.equal(journalChainSha256,result.configuration?.journalChainSha256);
  const assertOriginalAckRetained=async()=>{assert.deepEqual((await actualFs.readdir(localRoot)).sort(),['000001.record.json','000002.record.json','owner.json']);for(const row of localChain){assert.equal(await readFile(join(localRoot,row.name),'utf8'),row.bytes);assert.equal(state.objects.get(state.currentPrefix+row.name),row.bytes);}assert.equal(state.objects.has(state.currentPrefix+'000003.record.json'),false);assert.equal(state.objects.size,originals.length+3);};await assertOriginalAckRetained();
  assert.equal(state.objects.size,originals.length+3);assert.equal(state.queries.some(sql=>/^(insert|update|delete|alter|create|drop|truncate|commit)\b/i.test(sql)),false,'the database observer never performs SQL mutations');
  assert.equal(JSON.stringify(result).includes(password),false);let rebound:unknown=null,lateRead:unknown=null;if(options.captureFault){assert.equal(state.mode,'POST_ACK_CAPTURE_FAULT_INJECTED','the post-ACK refusal follows the controlled provider read failure');state.mode='';await actualFs.chmod(localRoot,0o755);for(const row of localChain)await actualFs.chmod(join(localRoot,row.name),0o644);const rebindInput={input,metadata,proof,plan,state,originalContext:result.journal.context,journalPayloadSha256:pairingHash(JSON.stringify(result.journal)),journalChainSha256,expected,prepared,certificate};rebound=await runReboundPairing({...rebindInput,releaseRunId:'53'});await assertOriginalAckRetained();state.mode='FINAL_LOCAL_EXPIRY';lateRead=await runReboundPairing({...rebindInput,releaseRunId:'54',expectRefusal:true});await assertOriginalAckRetained();}
  return{evidence:'CONTROLLED_SOURCE_COMPOSITION_ONLY',clock:'CONTROLLED_SOURCE_FIXTURE_CLOCK',actualOwners:['canonical source','official-admission owner','native permit','native execution token','local journal','remote journal','durable journal','configuration reader'],cliAttempts:state.cliAttempts,matchedRawObjects:3,cleanup:result.cleanup,originalAcknowledgement:result.originalAcknowledgement,sqlCommitment:result.sqlCommitment,postAckStatus:result.status,configurationScope:result.configuration?.effectScope??(rebound as {configurationScope?:string}|null)?.configurationScope,captureFault:options.captureFault===true,ackBytesPreserved:true,extraReviewRecord:false,rebound,lateRead,hostedAcceptance:false};
 }finally{if(handle)admission.disposeNativeBackendReleaseAdmission(handle);restore();}
}

async function createControlledCliFiles(root:string){const files=[['node_modules/supabase/package.json',JSON.stringify({name:'supabase',version:'2.119.0',type:'module'})],['node_modules/@supabase/cli-linux-x64/package.json',JSON.stringify({name:'@supabase/cli-linux-x64',version:'2.119.0'})],['node_modules/supabase/dist/supabase.js','pinned wrapper'],['node_modules/@supabase/cli-linux-x64/bin/supabase','pinned binary'],['node_modules/@supabase/cli-linux-x64/bin/supabase-go','pinned sidecar']];for(const[path,bytes]of files){await mkdir(resolve(root,path,'..'),{recursive:true});await writeFile(join(root,path),bytes);}return{shimSha256:pairingHash('pinned wrapper'),binarySha256:pairingHash('pinned binary'),sidecarSha256:pairingHash('pinned sidecar')};}

async function runReboundPairing(value:{input:FixtureInput;metadata:Awaited<ReturnType<typeof pairingMetadataHarness>>;proof:ChildProof;plan:Original231TransportAppendPlan;state:PairingState;originalContext:ReturnType<typeof prepareInactiveCronDefinitionContext>;journalPayloadSha256:string;journalChainSha256:string;expected:unknown;prepared:unknown;certificate:{path:string;sha256:string};releaseRunId:string;expectRefusal?:boolean}){
 value.metadata.setFailurePhase(value.expectRefusal?'READ54':'READ53');
 // Last started wrapper step only; existing counters do not establish its cause.
 value.metadata.setFailureReboundStep('PACKAGE');
 const selection=preparePersistedInactiveCronAcknowledgementSelection({context:value.originalContext,journalPayloadSha256:value.journalPayloadSha256,journalChainSha256:value.journalChainSha256}),previous=value.expected as Record<string,unknown>,previousBody=JSON.parse((value.prepared as {canonicalJson:string}).canonicalJson),binding=previous.inactiveCronDefinitions as Record<string,unknown>;
 value.metadata.setReleaseRun(value.releaseRunId);
 const reboundBinding=value.metadata.contracts.prepareInactiveCronDefinitionBackendBinding({plan:value.plan,stageSha256:binding.stageSha256,catalogueReference232:value.proof.reference,persistedAcknowledgement:selection}),fingerprints={...(previous.fingerprints as Record<string,unknown>),migrationHistorySha256:reboundBinding.afterHistorySha256};
 const expected={...previous,releaseRunId:value.releaseRunId,inactiveCronDefinitions:reboundBinding,fingerprints,backendRun:{...value.metadata.backend,id:Number(value.releaseRunId)},now:value.state.clock};
 const prepared=value.metadata.contracts.prepareBackendReleaseIntent({...previousBody,releaseRunId:value.releaseRunId,inactiveCronDefinitions:reboundBinding,fingerprints,preparedAt:new Date(value.state.clock).toISOString(),expiresAt:new Date(value.state.clock+600000).toISOString()},expected);value.metadata.setApproval(prepared.comment);
 const currentIdentity={...value.originalContext.identity,approvalDigest:prepared.sha256},currentContext=prepareInactiveCronDefinitionContext({plan:value.plan,identity:currentIdentity,catalogueReference232:value.proof.reference,releaseRunId:value.releaseRunId,releaseRunAttempt:1}),admission=await import('../verification/backend-release-admission');
 value.metadata.setFailureReboundStep('ADMISSION_PREPARE');
 const handle=await admission.prepareNativeBackendReleaseAdmission({repoRoot:process.cwd(),prepared,expected,effectScope:'INACTIVE_CRON_DEFINITIONS',githubToken:password}),writes=value.state.events.filter(row=>row.startsWith('http:POST:/storage/v1/object/')&&!row.includes('/object/list/')).length,cliBefore=value.state.cliAttempts;
 value.state.closed=false;value.state.released=false;
 try{
  value.metadata.setFailureReboundStep('ADMISSION_REFRESH');
  const admissionBinding={repoRoot:process.cwd(),prepared,expected,effectScope:'INACTIVE_CRON_DEFINITIONS' as const};await admission.readNativeInactiveCronBackendReleaseAdmission(handle,admissionBinding);admission.assertNativeInactiveCronBackendReleaseAdmission(handle,admissionBinding);
  value.metadata.setFailureReboundStep('PERMISSIONS');
  const restored=await(await import('./hosted-migration-journal')).restorePersistedInactiveCronJournalPermissions({repoRoot:process.cwd(),persistedAcknowledgement:selection});assert.equal(restored.modeEvidence,'POSIX_MODE_VERIFIED');assert.equal(restored.journalChainSha256,value.journalChainSha256);assert.equal(restored.journalPayloadSha256,value.journalPayloadSha256);
  value.metadata.setFailureReboundStep('READ');
  const result=await(await import('./hosted-migration-executor')).executeNativePersistedInactiveCronAcknowledgementRead({repoRoot:process.cwd(),plan:value.plan,prepared,expected,identity:currentContext.identity,catalogueReference232:value.proof.reference,releaseRunId:value.releaseRunId,releaseRunAttempt:1,databaseUrl:value.originalContext.identity.databaseUrl,certificate:value.certificate,migrationPassword:password,providerToken:password,storageKey:password,admissionHandle:handle});
  value.metadata.setFailureReboundStep('ASSERT');
  assert.equal(result.status,value.expectRefusal?'REQUIRES_REVIEW':'ACK_REBOUND_READ_ONLY',JSON.stringify({result,queries:value.state.queries.slice(-3)}));if(value.expectRefusal){assert.equal(value.state.lateReadInjected,true,'the refusal follows the actual final-local-read boundary');assert.equal(result.configuration,null);}else{assert.equal(result.cleanup,'RELEASED');assert.equal(result.configuration?.effectScope,'SQL_CRON_CONFIGURATION_ONLY');assert.equal(result.configuration?.activationAuthorized,false);assert.equal(value.state.released,true);}assert.equal(result.cliExecution,'NOT_EXECUTED');assert.equal(result.sqlExecution,'NOT_EXECUTED');assert.equal(value.state.cliAttempts,cliBefore);assert.equal(value.state.events.filter(row=>row.startsWith('http:POST:/storage/v1/object/')&&!row.includes('/object/list/')).length,writes);assert.equal(value.state.closed,true);
  return{status:result.status,configurationScope:result.configuration?.effectScope,cliDelta:0,providerRecordWrites:0,permissionEvidence:restored.modeEvidence,originalContextSha256:value.originalContext.contextSha256,currentContextSha256:currentContext.contextSha256,originalJournalPayloadSha256:value.journalPayloadSha256,originalJournalChainSha256:value.journalChainSha256,lateFinalReadInjected:value.state.lateReadInjected,actualHostedAcceptance:false};
 }finally{admission.disposeNativeBackendReleaseAdmission(handle);}
}

async function installExternalPrimitives(input:FixtureInput,state:PairingState,plan:Original231TransportAppendPlan,disabled:unknown,metadata:Awaited<ReturnType<typeof pairingMetadataHarness>>,caPath:string){
 const priorFetch=globalThis.fetch,priorNow=Date.now;Date.now=()=>state.clock;
 class ControlledClient extends EventEmitter{
  connection={stream:{encrypted:true,authorized:true,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('controlled peer certificate'),subjectaltname:'DNS:aws-0-ap-southeast-1.pooler.supabase.com'})}};
  constructor(config:unknown){super();assert.equal((config as {password:string}).password,password);}
  async connect(){state.events.push('pg-connect');}async end(){state.closed=true;state.events.push('pg-end');}
  async query(value:string|{text:string},values:unknown[]=[]){return{rows:pgQuery(state,plan,disabled,typeof value==='string'?value:value.text,values)};}
 }
 Object.assign(globalThis,{inactivePairingPgClient:ControlledClient,inactivePairingSpawn:(...args:unknown[])=>controlledSpawn(state,plan,input,...args),inactivePairingStop:async(children:EventEmitter[])=>{for(const child of children)child.emit('close',137,null);}});
 // A fresh rebind's actual journal constructor reads ACK2 once, then its two
 // acknowledged snapshots read it twice each. Delay only leaf five: the final
 // physical read before metadata decoding and the unchanged native permit fence.
 Object.assign(globalThis,{inactivePairingFs:actualFs,inactivePairingOpen:async(...args:Parameters<typeof actualFs.open>)=>{const handle=await actualFs.open(...args),path=String(args[0]);if(path.endsWith('000002.record.json')){const read=handle.readFile.bind(handle);handle.readFile=(async(...readArgs:Parameters<typeof read>)=>{const bytes=await read(...readArgs),stack=new Error().stack??'';if(state.mode==='FINAL_LOCAL_EXPIRY'&&stack.includes('readAcknowledgement')){state.finalAckLeafReads++;if(state.finalAckLeafReads===5){state.clock+=29001;state.lateReadInjected=true;state.mode='FINAL_LOCAL_EXPIRY_INJECTED';}}return bytes;}) as typeof handle.readFile;}return handle;}});
 const fsSource="const fs=globalThis.inactivePairingFs;export const lstat=fs.lstat,mkdir=fs.mkdir,readdir=fs.readdir,realpath=fs.realpath,rename=fs.rename,unlink=fs.unlink,chmod=fs.chmod,readFile=fs.readFile;export const open=(...args)=>globalThis.inactivePairingOpen(...args);";
 const hook=registerHooks({resolve(specifier,context,next){if(specifier==='node:fs/promises'&&context.parentURL?.endsWith('/hosted-migration-journal.ts'))return{shortCircuit:true,url:'cuevo-fixture:journal-fs'};return next(specifier,context);},load(url,context,next){if(url==='cuevo-fixture:journal-fs')return{format:'module',shortCircuit:true,source:fsSource};if(/\/node_modules\/pg\/(?:lib\/index\.js|esm\/index\.mjs)$/.test(url.replaceAll('\\','/')))return{format:'module',shortCircuit:true,source:'export class Client{constructor(...args){return new globalThis.inactivePairingPgClient(...args);}}export default{Client};'};if(url.endsWith('/hosted-migration-native-process.ts')){const original=readFileSync(new URL(url),'utf8'),source=original.replace("import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';","const spawnOwnedProcess=(...args)=>globalThis.inactivePairingSpawn(...args);const stopOwnedProcesses=(...args)=>globalThis.inactivePairingStop(...args);");assert.notEqual(source,original);return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};}return next(url,context);}});
 globalThis.fetch=async(raw,options)=>{
  const url=new URL(String(raw)),method=options?.method??'GET';state.events.push('http:'+method+':'+url.pathname);
  if(url.origin==='https://api.github.com'){assert.equal(method,'GET');const prefix='/repos/'+metadata.repository+'/',path=url.pathname===prefix.slice(0,-1)?'':url.pathname.slice(prefix.length)+url.search,match=/^actions\/artifacts\/([0-9]+)\/zip$/.exec(path);return match?new Response(await metadata.archive(Number(match[1]))):Response.json(await metadata.read(path));}
  if(url.origin==='https://api.supabase.com'){
   if(url.pathname===`/v1/projects/${ref}/database/query`&&method==='POST'){const body=JSON.parse(String(options?.body));assert.equal(body.query,"select id,name,public,type::text as type,file_size_limit,allowed_mime_types from storage.buckets where id='cuevo-release-operator'",'the fixed managed bucket metadata query stays read-only');return Response.json([buckets[0]]);}
   assert.equal(method,'GET');if(url.pathname===`/v1/projects/${ref}`){if(state.mode==='FINAL_LOCAL_EXPIRY')state.clock+=2000;if(state.mode==='POST_ACK_CAPTURE_FAULT'&&state.currentPrefix&&state.objects.has(state.currentPrefix+'000002.record.json')){state.mode='POST_ACK_CAPTURE_FAULT_INJECTED';return new Response('',{status:503});}return Response.json({id:ref,name:'Cuevo',status:'ACTIVE_HEALTHY',database:{host:`db.${ref}.supabase.co`,version:'17.11',postgres_engine:'17'}});}if(url.pathname===`/v1/projects/${ref}/config/database/pooler`)return Response.json([{identifier:ref,database_type:'PRIMARY',db_user:'postgres.'+ref,db_host:'aws-0-ap-southeast-1.pooler.supabase.com',db_port:5432,db_name:'postgres',pool_mode:'session'}]);
  }
  assert.equal(url.origin,`https://${ref}.supabase.co`,'no external request escapes controlled exact project');assert.ok(url.pathname.startsWith('/storage/v1/'));const path=url.pathname.slice('/storage/v1/'.length);
  if(path===`bucket/${bucket}`&&method==='GET')return Response.json(buckets[0]);
  if(path===`object/list/${bucket}`&&method==='POST'){const body=JSON.parse(String(options?.body)),names=new Set([...state.objects.keys()].filter(path=>path.startsWith(body.prefix+'/')).map(path=>path.slice(body.prefix.length+1).split('/')[0]));return Response.json([...names].sort().slice(body.offset,body.offset+body.limit).map(name=>{const full=body.prefix+'/'+name,bytes=state.objects.get(full);return{name,id:bytes===undefined?null:objectId(full),metadata:bytes===undefined?null:{size:Buffer.byteLength(bytes),mimetype:'application/json'}};}));}
  if(path.startsWith(`object/info/${bucket}/`)&&method==='GET'){const name=path.slice(`object/info/${bucket}/`.length),bytes=state.objects.get(name);return bytes===undefined?new Response('',{status:404}):Response.json({id:objectId(name),name,bucket_id:bucket,size:Buffer.byteLength(bytes),content_type:'application/json',version:'controlled-version'});}
  if(path.startsWith(`object/${bucket}/`)){const name=path.slice(`object/${bucket}/`.length);if(method==='POST'){assert.ok(name.startsWith(state.currentPrefix!), 'new writes stay in the exact current operation');assert.equal(state.objects.has(name),false,'operator records are create-only');const bytes=typeof options?.body==='string'?options.body:Buffer.from(options?.body as Uint8Array).toString('utf8');state.objects.set(name,bytes);return Response.json({Key:bucket+'/'+name});}if(method==='GET'){const bytes=state.objects.get(name);return bytes===undefined?new Response('',{status:404}):new Response(bytes);}}
  void caPath;throw Error('Unexpected controlled Storage request: '+method+' '+path);
 };
 return()=>{hook.deregister();globalThis.fetch=priorFetch;Date.now=priorNow;for(const name of['inactivePairingPgClient','inactivePairingSpawn','inactivePairingStop','inactivePairingFs','inactivePairingOpen'])Reflect.deleteProperty(globalThis,name);};
}

function controlledSpawn(state:PairingState,plan:Original231TransportAppendPlan,input:FixtureInput,...values:unknown[]){
 const args=values[1] as string[],imageId='sha256:'+'d'.repeat(64),containerId='e'.repeat(64),child=new EventEmitter() as EventEmitter&{stdout:PassThrough;stderr:PassThrough;stdin:PassThrough;exitCode:number|null;pid:number};child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;child.pid=123;
 // A real child's stdin is consumed by its process. Drain this controlled pipe
 // as well, so the existing large immutable build tar cannot block its finish.
 child.stdin.resume();state.events.push('controlled-process:'+args[0]);
 writeFileSync(join(process.cwd(),'.local/inactive-pairing-progress.json'),JSON.stringify({version:1,purpose:'CONTROLLED_PAIRING_PRIMITIVE_PROGRESS',phase:args[0],cliAttempts:state.cliAttempts,actualDocker:false,actualSQL:false})+'\n');
 child.stdin.on('finish',()=>queueMicrotask(()=>{let output='',code=0;
  if(args[0]==='buildx'){const source=readFileSync(join(input.ownerRoot,'scripts/database/hosted-migration-native-process.test.ts'),'utf8'),match=/const pinnedBaseManifest=Buffer\.from\('([^']+)'/.exec(source);assert.ok(match);output=Buffer.from(match[1],'base64').toString('utf8');}
  else if(args[0]==='pull'||args[0]==='rmi')output='';
  else if(args[0]==='build'){state.nativeOwner=args[args.indexOf('--tag')+1].split(':')[1];output=imageId;}
  else if(args[0]==='image'&&args[1]==='ls')output=imageId;
  else if(args[0]==='image'&&args[1]==='inspect')output=JSON.stringify([{RepoDigests:['node@sha256:ca520832af80fa37a57c14077ed0fcdd83b5aefccc356059fdc3a9a05b78ae1f'],Id:args[2]===imageId?imageId:'sha256:d9e872c3ee59358dc71c3c99957c2d8ccd3f21419fee87b742faddcf00a6ecee',Os:'linux',Architecture:'amd64',Config:{Volumes:null,Labels:{'cuevo.migration.owner':state.nativeOwner},User:'65532:65532',WorkingDir:'/work',Entrypoint:['/bin/bash','/cuevo/launch.sh'],Cmd:[],Env:['NODE_VERSION=24.16.0','PGSSLROOTCERT=/cuevo/ca.pem','HOME=/scratch','SUPABASE_HOME=/scratch','TMPDIR=/scratch','PATH=/cuevo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']}}]);
  else if(args[0]==='create'){assert.ok(args.includes('--read-only'));assert.ok(args.includes('--cap-drop=ALL'));assert.ok(args.includes('--security-opt=no-new-privileges'));assert.equal(args.some(value=>value.includes(password)),false);state.nativeState={Id:containerId,Name:'/'+args[args.indexOf('--name')+1],Image:imageId,Config:{Image:imageId,User:'65532:65532',WorkingDir:'/work',Entrypoint:['/bin/bash','/cuevo/launch.sh'],Cmd:args.slice(args.indexOf(imageId)+1),Env:['NODE_VERSION=24.16.0','PGPASSWORD='+password,'PGSSLROOTCERT=/cuevo/ca.pem','HOME=/scratch','SUPABASE_HOME=/scratch','TMPDIR=/scratch','PATH=/cuevo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],OpenStdin:true,StdinOnce:true,Tty:false},HostConfig:{ReadonlyRootfs:true,CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],Privileged:false,NetworkMode:'host',Binds:null,Tmpfs:{'/scratch':'rw,noexec,nosuid,nodev,size=64m,uid=65532,gid=65532,mode=700','/work/supabase/.temp':'rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=700'},AutoRemove:false},Mounts:[],State:{Status:'created',Running:false,Paused:false,Restarting:false,Dead:false,ExitCode:0,Error:''}};output=containerId;}
  else if(args[0]==='inspect'){if(!state.nativeState)code=1;else output=JSON.stringify([state.nativeState]);}
  else if(args[0]==='start'){state.cliAttempts++;state.installed=true;state.history.push({version:plan.pending[0].version,name:plan.pending[0].name.slice(15,-4),statements:[readFileSync(join(process.cwd(),'supabase/migrations',plan.pending[0].name),'utf8').trim()]});Object.assign(state.nativeState!.State as object,{Status:'exited',Running:false,ExitCode:0});}
  else if(args[0]==='kill')Object.assign(state.nativeState!.State as object,{Status:'exited',Running:false,ExitCode:137});
  else if(args[0]==='rm')state.nativeState=null;
  else if(args[0]==='container'&&args[1]==='ls')output=state.nativeState?containerId:'';
  else throw Error('Unexpected controlled owned-process operation: '+args[0]);
  child.stdout.end(output);child.stderr.end();child.exitCode=code;child.emit('close',code,null);
 }));return child;
}
