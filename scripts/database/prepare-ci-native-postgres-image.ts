import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureCanonicalSourceContext} from '../verification/canonical-source-jobs';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {createNativeIsolationFailureRecorder} from '../verification/ci-test-timings';
import {prepareSourceChildCatalogueImageCache} from './hosted-child-catalogue-reference';

const fail=()=>Error('CI native PostgreSQL image preparation requires review; contents withheld.');
/** Required CI setup only: one approved image acquisition and actual admission.
 * No containers, SQL, credentials, hosted state or scheduler effects enter. */
export async function prepareCiNativePostgresImage(){
 if(process.argv.length!==2||!process.argv[1]||pathToFileURL(resolve(process.argv[1])).href!==import.meta.url)throw fail();
 if(process.platform!=='linux'||process.arch!=='x64'||process.version!=='v24.16.0'||process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_JOB!=='source-fixtures-native'||process.env.GITHUB_REPOSITORY!=='attaulhaq0/Cuevo'||process.argv.length!==2||!/^\/home\/runner\/work\//.test(process.env.GITHUB_WORKSPACE??'')||['SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','WORKER_DATABASE_URL','VERCEL_TOKEN','VERCEL_API_KEY','SUPABASE_DB_PASSWORD','GH_TOKEN','GITHUB_TOKEN'].some(key=>process.env[key]!==undefined))throw fail();
 const sourceSha=process.env.GITHUB_SHA;if(!/^[a-f0-9]{40}$/.test(sourceSha??''))throw fail();
 const root=resolve('.');if(root!==resolve(process.env.GITHUB_WORKSPACE!))throw fail();
 const context=captureCanonicalSourceContext(root,sourceSha!,undefined),directory=resolve(root,'.local/verification/native-image-preparation'),diagnostic=createNativeIsolationFailureRecorder();
 const startedAt=new Date().toISOString();
 // Network acquisition has the existing catalogue producer's120s command
 // budget. Native fixture commands retain their independent unchanged30s.
 const command=(args:string[])=>execFileSync('/usr/bin/docker',args,{env:{PATH:'/usr/bin:/bin',HOME:'/home/runner',DOCKER_CONFIG:'/home/runner/.docker'},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}).toString('utf8').trim();
 let image:ReturnType<typeof prepareSourceChildCatalogueImageCache>|null=null;
 try{image=prepareSourceChildCatalogueImageCache(command,(step,kind,error)=>diagnostic.recordFailure(step,kind,error));context.finalMetadata();}
 catch{
  await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'failure.json'),canonicalReleaseExecutionJson({version:1,purpose:'CUEVO_CI_NATIVE_POSTGRES_IMAGE_PREPARATION_FAILURE',sourceSha,treeSha:context.treeSha,startedAt,completedAt:new Date().toISOString(),diagnostic:diagnostic.snapshot('NOT_ATTEMPTED'),hostedWrites:0,containerEffects:false,scheduledExecution:false}),{flag:'wx',mode:0o600});throw fail();
 }
 await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'receipt.json'),canonicalReleaseExecutionJson({version:1,purpose:'CUEVO_CI_NATIVE_POSTGRES_IMAGE_PREPARATION',sourceSha,treeSha:context.treeSha,startedAt,completedAt:new Date().toISOString(),image,acquisitionAttemptsAtMost:1,hostedWrites:0,containerEffects:false,scheduledExecution:false,nativeAcceptance:false}),{flag:'wx',mode:0o600});
 return image;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{await prepareCiNativePostgresImage();console.log('Verified exact CI PostgreSQL image; native fixture acceptance remains separate.');}
 catch{console.error('CI native PostgreSQL image preparation requires review; private contents withheld.');process.exitCode=1;}
}
