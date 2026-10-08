import {z} from 'zod';
import {verificationProfileSteps,verificationEvidence,readVerificationProfile,routineBrowserFiles,criticalBrowserFiles,type VerificationProfile} from './verification-profiles';
import {canonicalReleaseReviewJson} from './release-review';

export type RuntimeLane='backend'|'browser'|'database';
export function readTechnicalRequest(args:readonly string[]):{profile:VerificationProfile|'ci';lane?:RuntimeLane}{
 if(args.length===2&&args[0]==='--profile=ci'&&['--lane=backend','--lane=browser','--lane=database'].includes(args[1]))return{profile:'ci',lane:args[1].slice(7) as RuntimeLane};
 return{profile:readVerificationProfile(args)};
}
export function runtimeLaneSteps(profile:Exclude<VerificationProfile,'full'>,lane:RuntimeLane){
 const steps=verificationProfileSteps(profile);
 if(lane==='database')return ['clean-bootstrap','database-advisors','database','demo-seed-restore'].map(name=>steps.find(step=>step.name===name)!);
 if(lane==='browser')return ['clean-browser-seed','build','critical-browser','demo-seed-restore'].map(name=>steps.find(step=>step.name===name)!);
 return steps.filter(step=>!['critical-browser','clean-browser-seed','database-advisors','database'].includes(step.name));
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
export function combineRuntimeLanes(values:unknown,expectedValue:unknown){
 const expected=common.parse(JSON.parse(canonicalReleaseReviewJson(expectedValue))),lanes=z.array(laneSchema).length(3).parse(JSON.parse(canonicalReleaseReviewJson(values)));
 checkBrowser(expected.browserFiles);
 if(new Set(lanes.map(value=>value.lane)).size!==3)throw Error('Database, backend and browser lanes are required.');
 for(const lane of lanes){const input=Object.fromEntries(Object.entries(lane).filter(([key])=>!['version','purpose','status'].includes(key)));const validated=runtimeLaneEvidence(input);if(canonicalReleaseReviewJson(validated)!==canonicalReleaseReviewJson(lane)||lane.status!=='LANE_VERIFIED')throw Error('Runtime lane is incomplete or changed.');
  for(const key of ['repository','sourceSha','treeSha','sourceDigest','githubRunId','runAttempt','profile','browserFiles'] as const)if(canonicalReleaseReviewJson(lane[key])!==canonicalReleaseReviewJson(expected[key]))throw Error('Runtime lanes must share exact source/run/attempt and selected scope.');
 }
 const rows=[...verificationProfileSteps(expected.profile).map(step=>{
  const matches=lanes.flatMap(lane=>lane.rows.filter(row=>row.name===step.name));if(!matches.length||matches.some(row=>row.exitCode!==0))throw Error('Required runtime row is missing.');
  return{name:step.name,required:true,exitCode:0,durationMs:matches.reduce((total,row)=>total+row.durationMs,0)};
 }),{name:'source-freeze',required:true,exitCode:0,durationMs:lanes.reduce((total,lane)=>total+lane.rows.find(row=>row.name==='source-freeze')!.durationMs,0)}];
 return verificationEvidence(expected.profile,rows);
}
