import { z } from 'zod';
import { validatePilotWindowEvidence, type PilotRunIdentity } from './pilot-window-rules';
import{lstat,realpath,readdir,mkdir,open,rename,unlink}from'node:fs/promises';
import{resolve,relative,isAbsolute,sep}from'node:path';
import{pathToFileURL}from'node:url';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identitySchema = z.object({ repository: z.literal('attaulhaq0/Cuevo'), commitSha: z.string().regex(/^[a-f0-9]{40}$/), ref: z.enum(['refs/heads/main', 'refs/heads/codex/cuevo-integrated-review']), runId: z.string().regex(/^[1-9][0-9]*$/), runAttempt: z.number().int().positive(), ciRunId: z.string().regex(/^[1-9][0-9]*$/) }).strict();
export const pilotArtifactSchema = z.object({ schemaVersion: z.literal(1), identity: identitySchema, sourceStartSha256: digest.nullable(), sourceFinalSha256: digest.nullable(), migrationsSha256: digest.nullable(), count: z.number().int().positive().nullable(), packageLockSha256: digest.nullable(), seedSha256: digest.nullable(), buildId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).nullable(), runtimeSourceSha256: digest.nullable() }).strict();
export type PilotArtifacts = z.infer<typeof pilotArtifactSchema>;
function sameIdentity(actual: PilotRunIdentity, expected: PilotRunIdentity) { return Object.keys(expected).every(key => actual[key as keyof PilotRunIdentity] === expected[key as keyof PilotRunIdentity]); }
export function safePilotEvidence(raw: unknown, manifest: unknown, expected: PilotRunIdentity) {
  const identity = identitySchema.parse(expected);
  const evidence = raw === null ? null : validatePilotWindowEvidence(raw);
  const artifacts = manifest === null ? null : pilotArtifactSchema.parse(manifest);
  if (evidence && !sameIdentity(evidence.identity, identity) || artifacts && !sameIdentity(artifacts.identity, identity)) throw Error('Pilot summary source identity differs.');
  const sourceUnchanged = artifacts?.sourceStartSha256 && artifacts.sourceFinalSha256 ? artifacts.sourceStartSha256 === artifacts.sourceFinalSha256 : null;
  if (evidence?.status === 'VERIFIED' && (!artifacts || Object.entries(artifacts).some(([key, value]) => key !== 'schemaVersion' && key !== 'identity' && value === null) || sourceUnchanged !== true)) throw Error('Successful pilot evidence requires complete matching artifact identity.');
  return { schemaVersion: 1 as const, identity, dataClass: 'SYNTHETIC' as const, status: evidence?.status ?? 'NOT_VERIFIED' as const, runtime: { web: 'LOCAL_PRODUCTION_NEXT_BUILD', api: 'LOCAL_SOURCE_API', worker: 'LOCAL_NODE_POLLER' }, sourceUnchanged, artifacts, rows: evidence?.rows.map(row => ({ ...row })) ?? [] };
}

const refused=()=>Error('Pilot evidence export requires review.');
function inside(root:string,path:string){const local=relative(root,path);if(local.startsWith('..'+sep)||local==='..'||isAbsolute(local))throw refused();}
async function checkedPath(root:string,path:string,kind:'file'|'directory',missing=false):Promise<boolean>{
 inside(root,path);const portions=relative(root,path).split(sep);let current=root;
 for(let index=0;index<portions.length;index++){current=resolve(current,portions[index]);let metadata;try{metadata=await lstat(current);}catch(error){if(missing&&(error as NodeJS.ErrnoException).code==='ENOENT')return false;throw refused();}if(metadata.isSymbolicLink()||index<portions.length-1&&!metadata.isDirectory())throw refused();inside(root,await realpath(current));if(index===portions.length-1&&(kind==='file'?!metadata.isFile():!metadata.isDirectory()))throw refused();}
 return true;
}
async function boundedJson(root:string,path:string,limit:number):Promise<unknown|null>{if(!await checkedPath(root,path,'file',true))return null;const handle=await open(path,'r');try{const metadata=await handle.stat();if(!metadata.isFile()||metadata.size>limit||metadata.size===0)throw refused();const data=Buffer.alloc(limit+1);const read=await handle.read(data,0,limit+1,0);if(read.bytesRead>limit)throw refused();try{return JSON.parse(data.subarray(0,read.bytesRead).toString('utf8'));}catch{throw refused();}}finally{await handle.close();}}
export async function writeSafePilotEvidence(args:{workspaceRoot:string;identity:PilotRunIdentity;expectedSha:string}):Promise<ReturnType<typeof safePilotEvidence>>{
 const identity=identitySchema.parse(args.identity);if(args.expectedSha!==identity.commitSha)throw refused();
 const root=await realpath(resolve(args.workspaceRoot)),run=resolve(root,'.local/pilot',`${identity.runId}-${identity.runAttempt}`),outputDirectory=resolve(root,'.local/cicd-safe'),output=resolve(outputDirectory,'pilot-summary.json');
 if(await checkedPath(root,run,'directory',true)){if((await readdir(run)).length>64)throw refused();}
 const evidence=await boundedJson(root,resolve(run,'evidence.json'),262144),artifacts=await boundedJson(root,resolve(run,'artifact-manifest.json'),32768);
 const summary=safePilotEvidence(evidence,artifacts,identity);
 await checkedPath(root,outputDirectory,'directory',true);await mkdir(outputDirectory,{recursive:true,mode:0o700});await checkedPath(root,outputDirectory,'directory');await checkedPath(root,output,'file',true);
 const temporary=resolve(outputDirectory,`pilot-summary.${identity.runId}-${identity.runAttempt}.tmp`);let created=false;
 try{const handle=await open(temporary,'wx',0o600);created=true;try{await handle.writeFile(JSON.stringify(summary,null,2)+'\n');await handle.sync();}finally{await handle.close();}await checkedPath(root,outputDirectory,'directory');await checkedPath(root,output,'file',true);await rename(temporary,output);created=false;}finally{if(created)await unlink(temporary);}
 return summary;
}
async function main(){
 try{if(process.argv.length!==2&&(process.argv.length!==6||process.argv[2]!=='--expected-sha'||process.argv[4]!=='--ci-run-id'))throw refused();const expectedSha=process.argv.length===2?process.env.CUEVO_PILOT_EXPECTED_SHA:process.argv[3],ciRunId=process.argv.length===2?process.env.CUEVO_PILOT_CI_RUN_ID:process.argv[5];
  if(process.platform!=='linux'||process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw refused();
  const identity=identitySchema.parse({repository:process.env.GITHUB_REPOSITORY,commitSha:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF,runId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),ciRunId});
  if(expectedSha!==identity.commitSha)throw refused();
  const summary=await writeSafePilotEvidence({workspaceRoot:resolve(import.meta.dirname,'../..'),identity,expectedSha});
  console.log(JSON.stringify({schemaVersion:1,status:summary.status,sourceUnchanged:summary.sourceUnchanged,migrationCount:summary.artifacts?.count??null,rows:summary.rows.length}));if(summary.status!=='VERIFIED')process.exitCode=1;
 }catch{console.error('Pilot evidence export refused; source or evidence requires review.');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
