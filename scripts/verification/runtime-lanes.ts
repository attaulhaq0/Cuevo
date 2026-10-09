import {z} from 'zod';
import {verificationProfileSteps,verificationEvidence,readVerificationProfile,routineBrowserFiles,criticalBrowserFiles,type VerificationProfile} from './verification-profiles';
import {canonicalReleaseReviewJson,canonicalReleaseExecutionJson} from './release-review';
import {combineIntegrationPartitions,combineCommittedIntegrationPartitions,integrationPartitionIds,integrationIdentitySchema,type IntegrationPartition,type IntegrationIdentity,type CommittedIntegrationDescriptor} from './integration-partitions';
import {readCiPartitionCoverage,type CiPartitionCoverage} from './ci-partition-coverage';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

export type RuntimeLane='backend'|'browser'|'database';
const scopedBuild=(scope:'backend'|'web')=>({name:scope+'-build',args:['--import','tsx','scripts/verification/build-workspaces.ts','--scope='+scope],configured:true}as const);
export function readTechnicalRequest(args:readonly string[]):{profile:VerificationProfile|'ci';lane?:RuntimeLane;partition?:IntegrationPartition}{
 if(args.length===2&&args[0]==='--profile=ci'&&['--lane=backend','--lane=browser','--lane=database'].includes(args[1]))return{profile:'ci',lane:args[1].slice(7) as RuntimeLane};
 if(args.length===2&&args[0]==='--profile=ci'&&integrationPartitionIds.some(id=>args[1]==='--ci-partition='+id))return{profile:'ci',partition:args[1].slice(15) as IntegrationPartition};
 return{profile:readVerificationProfile(args)};
}
export function runtimeLaneSteps(profile:Exclude<VerificationProfile,'full'>,lane:RuntimeLane){
 const steps=verificationProfileSteps(profile);
 if(lane==='database')return ['clean-bootstrap','database-advisors','database','demo-seed-restore'].map(name=>steps.find(step=>step.name===name)!);
 if(lane==='browser')return [steps.find(step=>step.name==='clean-browser-seed')!,scopedBuild('web'),steps.find(step=>step.name==='browser-secrets')!,steps.find(step=>step.name==='critical-browser')!,steps.find(step=>step.name==='demo-seed-restore')!];
 return steps.filter(step=>!['critical-browser','clean-browser-seed','database-advisors','database','browser-secrets','integration','critical-integration'].includes(step.name)).map(step=>step.name==='build'?scopedBuild('backend'):step);
}
const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[1-9][0-9]*$/);
const profileSchema=z.enum(['routine','full-runtime','main-staging']);
const row=z.object({name:z.string(),exitCode:z.number().int().nullable(),required:z.literal(true),durationMs:z.number().int().nonnegative()}).strict();
const common=z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:sha,treeSha:sha,sourceDigest:digest,githubRunId:id,runAttempt:z.number().int().positive(),profile:profileSchema,browserFiles:z.array(z.string()).min(1).max(100)}).strict();
const laneSchema=common.extend({version:z.literal(1),purpose:z.literal('CUEVO_ISOLATED_RUNTIME_LANE'),lane:z.enum(['backend','browser','database']),status:z.enum(['LANE_VERIFIED','LANE_FAILED','LANE_NOT_VERIFIED']),rows:z.array(row).min(1).max(100)}).strict();
export type RuntimeLaneEvidence=z.infer<typeof laneSchema>;
function checkBrowser(files:readonly string[]){if(new Set(files).size!==files.length||files.some(file=>!routineBrowserFiles.includes(file))||criticalBrowserFiles.some(file=>!files.includes(file)))throw Error('Runtime lane browser scope requires review.');}
export function runtimeLaneEvidence(value:unknown):RuntimeLaneEvidence{
 const input=common.extend({lane:z.enum(['backend','browser','database']),rows:z.array(row).min(1).max(100)}).strict().parse(JSON.parse(canonicalReleaseReviewJson(value)));
 checkBrowser(input.browserFiles);
 const names=[...runtimeLaneSteps(input.profile,input.lane).map(step=>step.name),'source-freeze'];if(JSON.stringify(names)!==JSON.stringify(input.rows.map(row=>row.name)))throw Error('Runtime lane requires exact original rows.');
 const status=input.rows.some(row=>row.exitCode!==null&&row.exitCode!==0)?'LANE_FAILED':input.rows.some(row=>row.exitCode===null)?'LANE_NOT_VERIFIED':'LANE_VERIFIED';
 return{version:1,purpose:'CUEVO_ISOLATED_RUNTIME_LANE',...input,status};
}
function combineRuntimeProof(values:unknown,expectedValue:unknown,integrationExpected:IntegrationIdentity,integration:ReturnType<typeof combineIntegrationPartitions>){
 const expected=common.parse(JSON.parse(canonicalReleaseReviewJson(expectedValue))),lanes=z.array(laneSchema).length(3).parse(JSON.parse(canonicalReleaseReviewJson(values)));
 checkBrowser(expected.browserFiles);
 for(const key of ['repository','sourceSha','treeSha','sourceDigest','githubRunId','runAttempt','profile','browserFiles']as const)if(canonicalReleaseExecutionJson(integrationExpected[key])!==canonicalReleaseExecutionJson(expected[key]))throw Error('Runtime and integration producers require exact original source and selected scope.');
 if(new Set(lanes.map(value=>value.lane)).size!==3)throw Error('Database, backend and browser lanes are required.');
 for(const lane of lanes){const input=Object.fromEntries(Object.entries(lane).filter(([key])=>!['version','purpose','status'].includes(key)));const validated=runtimeLaneEvidence(input);if(canonicalReleaseReviewJson(validated)!==canonicalReleaseReviewJson(lane)||lane.status!=='LANE_VERIFIED')throw Error('Runtime lane is incomplete or changed.');
  for(const key of ['repository','sourceSha','treeSha','sourceDigest','githubRunId','runAttempt','profile','browserFiles'] as const)if(canonicalReleaseReviewJson(lane[key])!==canonicalReleaseReviewJson(expected[key]))throw Error('Runtime lanes must share exact source/run/attempt and selected scope.');
 }
 const rows=[...verificationProfileSteps(expected.profile).map(step=>{
  if(step.name==='integration'||step.name==='critical-integration'){if(step.name!==integration.scope)throw Error('Complete integration scope is required.');return{name:step.name,required:true,exitCode:0,durationMs:integration.durationMs};}
  const matches=step.name==='build'?[lanes.find(lane=>lane.lane==='backend')!.rows.find(row=>row.name==='backend-build')!,lanes.find(lane=>lane.lane==='browser')!.rows.find(row=>row.name==='web-build')!]:lanes.flatMap(lane=>lane.rows.filter(row=>row.name===step.name));if(!matches.length||matches.some(row=>!row||row.exitCode!==0))throw Error('Required runtime row is missing.');
  return{name:step.name,required:true,exitCode:0,durationMs:matches.reduce((total,row)=>total+row.durationMs,0)};
 }),{name:'source-freeze',required:true,exitCode:0,durationMs:lanes.reduce((total,lane)=>total+lane.rows.find(row=>row.name==='source-freeze')!.durationMs,0)}];
 return{result:verificationEvidence(expected.profile,rows),integration,lanes};
}
export function combineRuntimeLanes(values:unknown,expectedValue:unknown,integrationValues:unknown,integrationExpected:IntegrationIdentity,coverage:CiPartitionCoverage=readCiPartitionCoverage(resolve('.'))){return combineRuntimeProof(values,expectedValue,integrationExpected,combineIntegrationPartitions(integrationValues,integrationExpected,coverage)).result;}

const originalHash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
function technicalAggregate(lanes:unknown,expected:IntegrationIdentity,summary:ReturnType<typeof combineIntegrationPartitions>){
 const identity=integrationIdentitySchema.parse(JSON.parse(canonicalReleaseExecutionJson(expected))),commonValue=Object.fromEntries(Object.entries(identity).filter(([key])=>Object.hasOwn(common.shape,key))),{result,integration,lanes:runtime}=combineRuntimeProof(lanes,commonValue,identity,summary);
 const body={version:1 as const,purpose:'CUEVO_ORIGINAL_TECHNICAL_AGGREGATE' as const,status:'PASSED' as const,identity,result,runtime:runtime.map(row=>({lane:row.lane,receiptSha256:originalHash(row)})).sort((a,b)=>a.lane.localeCompare(b.lane)),integration};
 return{...body,payloadSha256:originalHash(body)};
}
export function technicalAggregateReceipt(lanes:unknown,integrationValues:unknown,expected:IntegrationIdentity,coverage:CiPartitionCoverage){return technicalAggregate(lanes,expected,combineIntegrationPartitions(integrationValues,expected,coverage));}
export function validateTechnicalAggregateReceipt(value:unknown,lanes:unknown,integrationValues:unknown,expected:IntegrationIdentity,coverage:CiPartitionCoverage){
 const rebuilt=technicalAggregateReceipt(lanes,integrationValues,expected,coverage);if(canonicalReleaseExecutionJson(value)!==canonicalReleaseExecutionJson(rebuilt))throw Error('Original complete technical aggregate changed.');return rebuilt;
}
export function validateCommittedTechnicalAggregateReceipt(value:unknown,lanes:unknown,integrationValues:unknown,expected:IntegrationIdentity,descriptor:CommittedIntegrationDescriptor){const rebuilt=technicalAggregate(lanes,expected,combineCommittedIntegrationPartitions(integrationValues,expected,descriptor));if(canonicalReleaseExecutionJson(value)!==canonicalReleaseExecutionJson(rebuilt))throw Error('Original committed technical aggregate changed.');return rebuilt;}
