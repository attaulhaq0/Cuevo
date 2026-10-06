import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import type { ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';
import type { HostedExecutionPorts } from './hosted-migration-execution';

const fail=()=>new Error('Native migration process, source or private execution requires review; contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema=z.object({repoRoot:z.string(),projectRef:z.string().regex(/^[a-z]{20}$/),workdir:z.string(),databaseUrl:z.string(),certificate:z.object({path:z.string(),sha256:digest}).strict(),cli:z.object({shimSha256:digest,binarySha256:digest,sidecarSha256:digest}).strict(),timeoutMs:z.number().int().min(100).max(300000)}).strict();
type NativeProcessInput=z.infer<typeof inputSchema>;
const environmentKeys=new Set(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','LANG','LC_ALL','TZ','PGPASSWORD','PGSSLROOTCERT']);
function own(value:unknown,depth=0):unknown{if(depth>6)throw fail();if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail();const result:Record<string,unknown>=Object.create(null);for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw fail();result[key]=own(field.value,depth+1);}return result;}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function physical(path:string,kind:'file'|'directory'){const stat=await lstat(path);if(stat.isSymbolicLink()||(kind==='file'?!stat.isFile()||stat.nlink!==1:!stat.isDirectory())||await realpath(path)!==path)throw fail();return stat;}
async function ownedPath(root:string,path:string,kind:'file'|'directory'){
 if(!isAbsolute(path)||resolve(path)!==path)throw fail();const part=relative(root,path);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='..'||piece==='.'))throw fail();await physical(root,'directory');const pieces=part.split(/[\\/]/);let current=root;for(const[index,piece]of pieces.entries()){current=join(current,piece);await physical(current,index===pieces.length-1?kind:'directory');}
}
function cliPackage(){if(process.arch!=='x64'&&process.arch!=='arm64')throw fail();if(process.platform==='win32')return`cli-windows-${process.arch}`;if(process.platform==='linux')return`cli-linux-${process.arch}`;if(process.platform==='darwin')return`cli-darwin-${process.arch}`;throw fail();}
function argumentSnapshot(value:unknown):string[]{if(!Array.isArray(value)||types.isProxy(value))throw fail();const length=Object.getOwnPropertyDescriptor(value,'length');if(!length||!('value'in length)||length.value!==11)throw fail();const result:string[]=[];for(let index=0;index<length.value;index++){const field=Object.getOwnPropertyDescriptor(value,String(index));if(!field||!('value'in field)||!field.enumerable||typeof field.value!=='string')throw fail();result.push(field.value);}if(Reflect.ownKeys(value).length!==result.length+1)throw fail();return result;}
function argumentsFor(input:NativeProcessInput){return['db','push','--db-url',input.databaseUrl,'--include-all','--skip-vault','--workdir',input.workdir,'--yes','--output-format','json'];}
async function admitFiles(input:NativeProcessInput){
 await physical(input.repoRoot,'directory');const releaseRoot=join(input.repoRoot,'.local','hosted-release');await ownedPath(input.repoRoot,input.workdir,'directory');await ownedPath(input.repoRoot,input.certificate.path,'file');for(const path of[input.workdir,input.certificate.path]){const part=relative(releaseRoot,path);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>piece==='..'||piece==='.'))throw fail();}
 if(hash(await readFile(input.certificate.path))!==input.certificate.sha256)throw fail();const cliRoot=join(input.repoRoot,'node_modules','supabase'),packageRoot=join(input.repoRoot,'node_modules','@supabase',cliPackage()),shim=join(cliRoot,'dist','supabase.js'),binary=join(packageRoot,'bin','supabase'+(process.platform==='win32'?'.exe':'')),sidecar=join(packageRoot,'bin','supabase-go'+(process.platform==='win32'?'.exe':''));
 for(const file of[shim,binary,sidecar,join(cliRoot,'package.json'),join(packageRoot,'package.json')])await ownedPath(input.repoRoot,file,'file');const cli=JSON.parse(await readFile(join(cliRoot,'package.json'),'utf8')),platform=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));if(cli.name!=='supabase'||cli.version!=='2.119.0'||cli.type!=='module'||platform.name!=='@supabase/'+cliPackage()||platform.version!=='2.119.0')throw fail();for(const[path,expected]of[[shim,input.cli.shimSha256],[binary,input.cli.binarySha256],[sidecar,input.cli.sidecarSha256]])if(hash(await readFile(path))!==expected)throw fail();return shim;
}
function validateTarget(input:NativeProcessInput){if(!isAbsolute(input.repoRoot)||resolve(input.repoRoot)!==input.repoRoot)throw fail();const url=new URL(input.databaseUrl),direct=url.hostname===`db.${input.projectRef}.supabase.co`&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${input.projectRef}`;if(url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||!(direct||pooler)||url.toString()!==input.databaseUrl)throw fail();}

/** Native private CLI port only. Source/approval/TLS/target/history and database lock remain independently admitted by the execution protocol. */
export async function createHostedMigrationNativeProcess(value:unknown,options:{signal?:AbortSignal}={}):Promise<Pick<HostedExecutionPorts,'runCli'>>{
 let signal:AbortSignal|undefined;try{if(!options||typeof options!=='object'||types.isProxy(options))throw fail();const descriptor=Object.getOwnPropertyDescriptor(options,'signal');if(![Object.prototype,null].includes(Object.getPrototypeOf(options))||Reflect.ownKeys(options).some(key=>key!=='signal')||descriptor&&(!('value'in descriptor)||descriptor.value!==undefined&&!(descriptor.value instanceof AbortSignal)))throw fail();signal=descriptor?.value;}catch{throw fail();}
 let input:NativeProcessInput;try{input=inputSchema.parse(own(value));validateTarget(input);await admitFiles(input);}catch{throw fail();}let attempted=false;
 return{runCli:async(args,privateEnvironment)=>{
  if(attempted||signal?.aborted)return{kind:'UNKNOWN'};attempted=true;let shim:string,env:Record<string,string>,argumentsCopy:string[];
  try{argumentsCopy=argumentSnapshot(args);env=z.record(z.string(),z.string()).parse(own(privateEnvironment));if(Object.keys(env).some(key=>!environmentKeys.has(key))||!env.PGPASSWORD?.trim()||env.PGPASSWORD.length>24576||[...env.PGPASSWORD].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||Object.entries(env).some(([key,value])=>key!=='PGPASSWORD'&&(value.includes(env.PGPASSWORD)||[...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)))||env.PGSSLROOTCERT!==input.certificate.path||JSON.stringify(argumentsCopy)!==JSON.stringify(argumentsFor(input)))throw fail();shim=await admitFiles(input);const home=join(input.repoRoot,'.local','hosted-release','process-'+randomUUID());await mkdir(home,{mode:0o700});await ownedPath(input.repoRoot,home,'directory');if((await readdir(home)).length)throw fail();env.SUPABASE_HOME=home;env.HOME=home;env.USERPROFILE=home;env.APPDATA=home;env.LOCALAPPDATA=home;if(signal?.aborted)throw fail();}catch{return{kind:'UNKNOWN'};}
  let child:ChildProcess;try{child=spawnOwnedProcess(process.execPath,[shim,...argumentsCopy],{cwd:input.workdir,env,stdio:'ignore',shell:false,windowsHide:true});}catch{return{kind:'UNKNOWN'};}
  return await new Promise<Awaited<ReturnType<HostedExecutionPorts['runCli']>>>((done,reject)=>{
   let settled=false,stopping=false,cancelled=false,closed=false;
   const finish=(result:Awaited<ReturnType<HostedExecutionPorts['runCli']>>)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);done(result);};
   const stop=()=>{if(stopping||settled)return;stopping=true;void stopOwnedProcesses([child]).then(()=>{if(!closed&&child.exitCode===null&&child.signalCode===null)throw fail();finish(cancelled?{kind:'UNKNOWN'}:{kind:'TIMEOUT'});}).catch(()=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);reject(fail());});};
   const onAbort=()=>{cancelled=true;stop();};
   const timer=setTimeout(stop,input.timeoutMs);signal?.addEventListener('abort',onAbort,{once:true});
   child.once('error',()=>{if(!stopping)finish({kind:'UNKNOWN'});});
   child.once('close',(code,termination)=>{closed=true;if(stopping)return;finish(signal?.aborted?{kind:'UNKNOWN'}:code!==null&&termination===null?{kind:'EXITED',exitCode:code}:{kind:'UNKNOWN'});});
   if(signal?.aborted)onAbort();
  });
 }};
}
