import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {combineRuntimeLanes,runtimeLaneEvidence} from './runtime-lanes';
import {readCiRuntimeSelection} from './verification-profiles';

if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||process.env.GITHUB_JOB!=='technical-mvp'||!['push','pull_request','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME??''))throw Error('Runtime aggregation requires the exact CI owner.');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(sourceSha!==process.env.GITHUB_SHA)throw Error('Runtime aggregate source mismatch.');
const snapshot=async()=>{
 const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),manifest:{path:string;sha256:string}[]=[];
 for(const path of new Set(paths)){try{manifest.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 return manifest.sort((a,b)=>a.path.localeCompare(b.path));
};
const manifest=await snapshot();
const sourceDigest=createHash('sha256').update(JSON.stringify([...manifest].sort((a,b)=>a.path.localeCompare(b.path)))).digest('hex'),selection=await readCiRuntimeSelection();
const inputFolder=resolve('.local/runtime-lane-inputs');
if(JSON.stringify((await readdir(inputFolder)).sort())!==JSON.stringify(['backend','browser']))throw Error('Only both exact lane directories may be consumed.');
const values:unknown[]=[];
for(const lane of ['backend','browser']){const folder=resolve(inputFolder,lane),path=resolve(folder,'lane.json'),stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>49152||await realpath(path)!==path||JSON.stringify(await readdir(folder))!==JSON.stringify(['lane.json']))throw Error('Runtime lane artifact requires bounded exact files.');values.push(JSON.parse(await readFile(path,'utf8')));}
const expected={repository:process.env.GITHUB_REPOSITORY,sourceSha,treeSha:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sourceDigest,githubRunId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),profile:selection.profile,browserFiles:selection.browserFiles};
const combined=combineRuntimeLanes(values,expected);
for(const value of values){const raw=value as Record<string,unknown>;runtimeLaneEvidence(Object.fromEntries(Object.entries(raw).filter(([key])=>!['version','purpose','status'].includes(key))));}
const finalManifest=await snapshot(),finalDigest=createHash('sha256').update(JSON.stringify(finalManifest)).digest('hex');
if(finalDigest!==sourceDigest)throw Error('Runtime aggregate source changed after lane consumption.');
execFileSync('git',['diff','--quiet','--no-ext-diff','--no-textconv','HEAD','--'],{stdio:'ignore'});
if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==sourceSha)throw Error('Runtime aggregate source changed before completion.');
const output=resolve('.local/verification',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(output,{recursive:true});await writeFile(resolve(output,'source.json'),JSON.stringify(manifest));await writeFile(resolve(output,'source-final.json'),JSON.stringify(finalManifest));await writeFile(resolve(output,'evidence.json'),JSON.stringify(combined));
console.log(`Combined exact ${selection.profile} backend and browser lanes; hosted/customer acceptance remains separate.`);
