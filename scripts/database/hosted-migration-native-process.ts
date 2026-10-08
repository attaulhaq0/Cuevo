import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { spawnOwnedProcess, stopOwnedProcesses } from '../runtime/process';
import type { HostedExecutionPorts } from './hosted-migration-execution';

const fail=()=>new Error('Native migration process, source or private execution requires review; contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/),imageDigest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const inputSchema=z.object({repoRoot:z.string(),projectRef:z.string().regex(/^[a-z]{20}$/),workdir:z.string(),databaseUrl:z.string(),certificate:z.object({path:z.string(),sha256:digest}).strict(),cli:z.object({shimSha256:digest,binarySha256:digest,sidecarSha256:digest}).strict(),delivery:z.object({included:z.array(z.object({name:z.string().regex(/^[0-9]{14}_[a-z0-9_]+[.]sql$/),sha256:digest}).strict()).min(1).max(1000),configSha256:digest}).strict(),timeoutMs:z.number().int().min(100).max(300000)}).strict();
type NativeProcessInput=z.infer<typeof inputSchema>;
type CliResult=Awaited<ReturnType<HostedExecutionPorts['runCli']>>;
export type PreparedHostedMigrationNativeProcess={readonly prepared:Readonly<{imageId:string;deliverySha256:string}>;runCli:(args:string[],privateEnvironment:Record<string,string>,options:{notAfterMs:number})=>Promise<CliResult>;dispose:()=>Promise<void>};
export type HostedMigrationPreparationFailure={version:1;purpose:'CUEVO_NATIVE_MIGRATION_PREPARATION_FAILURE';phase:'SUPERVISOR'|'BASE'|'BUILD'|'IMAGE'|'CREATE'|'INSPECT';ownerId:string;cleanup:'UNCONFIRMED'|'CONFIRMED_STOPPED'};
export class HostedMigrationNativePreparationError extends Error{
 readonly evidence:Readonly<HostedMigrationPreparationFailure>;
 constructor(evidence:HostedMigrationPreparationFailure){super('Native migration preparation requires review; private contents withheld.');this.evidence=Object.freeze({...evidence});}
}
const baseImage='docker.io/library/node@sha256:ca520832af80fa37a57c14077ed0fcdd83b5aefccc356059fdc3a9a05b78ae1f';
const docker='/usr/bin/docker',containerPath='/cuevo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const scratch={'/scratch':'rw,noexec,nosuid,nodev,size=64m,uid=65532,gid=65532,mode=700','/work/supabase/.temp':'rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=700'};
const environmentKeys=new Set(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','LANG','LC_ALL','TZ','PGPASSWORD','PGSSLROOTCERT']);
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function own(value:unknown,depth=0):unknown{
 if(depth>8)throw fail();if(value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail();
 if(Array.isArray(value)&&(value.length>1000||Reflect.ownKeys(value).length!==value.length+1))throw fail();const result:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw fail();Object.defineProperty(result,key,{value:own(field.value,depth+1),enumerable:true});}return result;
}
async function physical(path:string,kind:'file'|'directory'){const stat=await lstat(path);if(stat.isSymbolicLink()||(kind==='file'?!stat.isFile()||stat.nlink!==1:!stat.isDirectory())||await realpath(path)!==path)throw fail();return stat;}
async function ownedPath(root:string,path:string,kind:'file'|'directory'){
 if(!isAbsolute(path)||resolve(path)!==path)throw fail();const part=relative(root,path);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='..'||piece==='.'))throw fail();await physical(root,'directory');let current=root;const pieces=part.split(/[\\/]/);for(const[index,piece]of pieces.entries()){current=join(current,piece);await physical(current,index===pieces.length-1?kind:'directory');}
}
function requireRunner(root:string){
 // Docker is a trusted supervisor on this fresh hosted runner. Neither this
 // boundary nor read-only mounts protect against an administrator controlling it.
 if(process.platform!=='linux'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_WORKSPACE!==root||!root.startsWith('/home/runner/work/')||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT||process.env.DOCKER_CONFIG||process.env.NODE_OPTIONS)throw fail();
}
async function requireSupervisor(){
 const binary=await lstat(docker),resolved=await realpath(docker);if(!binary.isFile()||binary.isSymbolicLink()||resolved!==docker||binary.uid!==0||(binary.mode&0o022)!==0)throw fail();
 const socket=await lstat('/var/run/docker.sock');if(!socket.isSocket()||socket.isSymbolicLink()||socket.uid!==0)throw fail();
}
function validateTarget(input:NativeProcessInput){
 if(!isAbsolute(input.repoRoot)||resolve(input.repoRoot)!==input.repoRoot)throw fail();const url=new URL(input.databaseUrl),direct=url.hostname===`db.${input.projectRef}.supabase.co`&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${input.projectRef}`;
 if(url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||!(direct||pooler)||url.toString()!==input.databaseUrl)throw fail();
}
function privateEnvironment(value:unknown,input:NativeProcessInput){
 const env=z.record(z.string(),z.string()).parse(own(value));if(Object.keys(env).some(key=>!environmentKeys.has(key))||!env.PGPASSWORD?.trim()||env.PGPASSWORD.length>24576||[...env.PGPASSWORD].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||Object.entries(env).some(([key,value])=>key!=='PGPASSWORD'&&(value.includes(env.PGPASSWORD)||[...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)))||env.PGSSLROOTCERT!==input.certificate.path)throw fail();return env;
}
function argumentsFor(input:NativeProcessInput,workdir=input.workdir){return['db','push','--db-url',input.databaseUrl,'--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json'];}

// The tar is built from already hashed in-memory snapshots. Docker never reads a
// mutable host build context or bind-mounted source. No credential enters it.
function tar(files:{name:string;bytes:Buffer;mode:number}[]){
 const blocks:Buffer[]=[];for(const file of files){if(file.name.length>99||!/^[a-zA-Z0-9_./-]+$/.test(file.name)||file.name.split('/').some(piece=>!piece||piece==='.'||piece==='..'))throw fail();const header=Buffer.alloc(512);header.write(file.name);const octal=(offset:number,length:number,value:number)=>header.write(value.toString(8).padStart(length-1,'0')+'\0',offset,length,'ascii');octal(100,8,file.mode);octal(108,8,0);octal(116,8,0);octal(124,12,file.bytes.length);octal(136,12,0);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);let sum=0;for(const byte of header)sum+=byte;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');blocks.push(header,file.bytes,Buffer.alloc((512-file.bytes.length%512)%512));}blocks.push(Buffer.alloc(1024));return Buffer.concat(blocks);
}
type CommandResult={code:number;stdout:Buffer};
class CommandInterrupted extends Error{}
async function command(args:string[],stdin?:Uint8Array,env:Record<string,string>={},timeoutMs=30000,signal?:AbortSignal):Promise<CommandResult>{
 if(signal?.aborted)throw fail();const child=spawnOwnedProcess(docker,args,{env:{PATH:'/usr/bin:/bin',LANG:'C',HOME:'/home/runner',DOCKER_CONFIG:'/home/runner/.docker',...env},stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});
 return await new Promise((done,reject)=>{let settled=false,stopping=false,size=0;const output:Buffer[]=[];
  const onAbort=()=>stop(false),finish=(code:number)=>{if(settled||stopping)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);done({code,stdout:Buffer.concat(output)});};
  const stop=(timedOut:boolean)=>{if(settled||stopping)return;stopping=true;void stopOwnedProcesses([child]).then(()=>{settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);reject(timedOut?new CommandInterrupted():fail());},()=>{settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);reject(fail());});};
  const collect=(bytes:Buffer,keep:boolean)=>{size+=bytes.length;if(size>4*1024*1024)return stop(false);if(keep)output.push(Buffer.from(bytes));};const timer=setTimeout(()=>stop(true),timeoutMs);signal?.addEventListener('abort',onAbort,{once:true});
  child.stdout?.on('data',(bytes:Buffer)=>collect(bytes,true));child.stderr?.on('data',(bytes:Buffer)=>collect(bytes,false));child.once('error',()=>stop(false));child.once('close',(code,termination)=>termination||code===null?stop(false):finish(code));child.stdin?.on('error',()=>stop(false));child.stdin?.end(stdin);if(signal?.aborted)onAbort();
 });
}
async function snapshot(input:NativeProcessInput){
 const releaseRoot=join(input.repoRoot,'.local','hosted-release');for(const path of[input.workdir,input.certificate.path]){await ownedPath(input.repoRoot,path,path===input.workdir?'directory':'file');const part=relative(releaseRoot,path);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>piece==='.'||piece==='..'))throw fail();}
 const cliRoot=join(input.repoRoot,'node_modules','supabase'),packageRoot=join(input.repoRoot,'node_modules','@supabase',`cli-linux-${process.arch}`),shim=join(cliRoot,'dist','supabase.js'),binary=join(packageRoot,'bin','supabase'),sidecar=join(packageRoot,'bin','supabase-go');
 const read=async(path:string,expected:string,maximum:number)=>{await ownedPath(input.repoRoot,path,'file');const bytes=await readFile(path);if(bytes.length>maximum||hash(bytes)!==expected)throw fail();return bytes;};
 for(const path of[join(cliRoot,'package.json'),join(packageRoot,'package.json')])await ownedPath(input.repoRoot,path,'file');const cli=JSON.parse(await readFile(join(cliRoot,'package.json'),'utf8')),platform=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));if(cli.name!=='supabase'||cli.version!=='2.119.0'||cli.type!=='module'||platform.name!==`@supabase/cli-linux-${process.arch}`||platform.version!=='2.119.0')throw fail();await read(shim,input.cli.shimSha256,2*1024*1024);
 const supabase=join(input.workdir,'supabase'),migrations=join(supabase,'migrations');await ownedPath(input.repoRoot,migrations,'directory');const names=input.delivery.included.map(row=>row.name);if(new Set(names).size!==names.length||JSON.stringify((await readdir(input.workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify([...names].sort()))throw fail();
 const files=[{name:'bin/supabase',bytes:await read(binary,input.cli.binarySha256,192*1024*1024),mode:0o555},{name:'bin/supabase-go',bytes:await read(sidecar,input.cli.sidecarSha256,192*1024*1024),mode:0o555},{name:'ca.pem',bytes:await read(input.certificate.path,input.certificate.sha256,256*1024),mode:0o444},{name:'work/supabase/config.toml',bytes:await read(join(supabase,'config.toml'),input.delivery.configSha256,65536),mode:0o444}];
 let total=0;for(const row of input.delivery.included){const bytes=await read(join(migrations,row.name),row.sha256,2*1024*1024);total+=bytes.length;if(total>16*1024*1024)throw fail();files.push({name:'work/supabase/migrations/'+row.name,bytes,mode:0o444});}return files;
}

/** Prepare a private exact immutable execution image and stopped container before
 * live database admission. The existing executor remains the sole native permit,
 * source/approval/target/TLS/history/lease authority. Docker is the trusted local
 * supervisor; missing or unconfirmed Docker state never proves stopped cleanup. */
export async function createHostedMigrationNativeProcess(value:unknown,options:{signal?:AbortSignal;privateEnvironment:Record<string,string>}):Promise<PreparedHostedMigrationNativeProcess>{
 let input:NativeProcessInput,env:Record<string,string>,signal:AbortSignal|undefined;
 try{input=inputSchema.parse(own(value));if(!options||types.isProxy(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options)))throw fail();const fields=Object.getOwnPropertyDescriptors(options);if(Reflect.ownKeys(fields).some(key=>key!=='signal'&&key!=='privateEnvironment')||Object.values(fields).some(field=>!('value'in field)||!field.enumerable))throw fail();signal=fields.signal?.value;if(signal!==undefined&&!(signal instanceof AbortSignal))throw fail();env=privateEnvironment(fields.privateEnvironment?.value,input);validateTarget(input);requireRunner(input.repoRoot);if(signal?.aborted)throw fail();}catch{throw fail();}
 const deliverySha256=hash(JSON.stringify({included:input.delivery.included.map(({name,sha256})=>({name,sha256})),configSha256:input.delivery.configSha256,certificateSha256:input.certificate.sha256,cli:input.cli}));
 let files:Awaited<ReturnType<typeof snapshot>>;try{files=await snapshot(input);}catch{throw fail();}const gate=Buffer.from('set -euo pipefail\nIFS= read -r deadline\n[[ "$deadline" =~ ^[0-9]{1,16}$ ]] || exit 124\nnow=$(/usr/bin/date +%s%3N)\n(( now < deadline )) || exit 124\nexec /cuevo/bin/supabase "$@"\n');
 const sums=Buffer.from(files.map(file=>hash(file.bytes)+'  /cuevo/'+file.name+'\n').join(''));
 // A pinned base supplies the native dynamic loader, libraries, bash/date and
 // sidecar runtime. Build fails unless the complete graph and supported command
 // actually run. Inherited writable volumes are refused below.
 const owner=randomUUID(),containerName='cuevo-migration-'+owner,imageTag='cuevo-migration-private:'+owner;
 const dockerfile=Buffer.from(`FROM ${baseImage}\nUSER root\nCOPY . /cuevo/\nRUN /usr/bin/sha256sum -c /cuevo/files.sha256 && /bin/mkdir -p /work/supabase/.temp /scratch && /bin/cp -a /cuevo/work/supabase/config.toml /work/supabase/config.toml && /bin/cp -a /cuevo/work/supabase/migrations /work/supabase/migrations && /bin/chmod 755 /cuevo/bin/supabase /cuevo/bin/supabase-go /work /work/supabase /work/supabase/migrations && /cuevo/bin/supabase --version | /bin/grep -Fx 2.119.0 && /cuevo/bin/supabase db push --help >/dev/null\nENV PGSSLROOTCERT=/cuevo/ca.pem HOME=/scratch SUPABASE_HOME=/scratch TMPDIR=/scratch PATH=${containerPath}\nLABEL cuevo.migration.owner=${owner}\nWORKDIR /work\nUSER 65532:65532\nENTRYPOINT ["/bin/bash","/cuevo/launch.sh"]\nCMD []\n`);
 let imageId:string|undefined,containerId:string|undefined,createAttempted=false,buildAttempted=false,buildAcknowledged=false,createAcknowledged=false,attempted=false,disposed=false,active:Promise<CliResult>|undefined,preparationPhase:HostedMigrationPreparationFailure['phase']='SUPERVISOR';
 const containerArgs=argumentsFor(input,'/work');let expectedEnv:string[]=[];
 const inspect=async()=>{if(!containerId||!imageId)throw fail();const result=await command(['inspect',containerId]);if(result.code!==0)throw fail();const list=JSON.parse(result.stdout.toString()) as unknown[];if(!Array.isArray(list)||list.length!==1)throw fail();const row=z.object({Id:z.literal(containerId),Name:z.literal('/'+containerName),Image:z.literal(imageId),Config:z.object({Image:z.literal(imageId),User:z.literal('65532:65532'),WorkingDir:z.literal('/work'),Entrypoint:z.array(z.string()),Cmd:z.array(z.string()),Env:z.array(z.string()),OpenStdin:z.literal(true),StdinOnce:z.literal(true),Tty:z.literal(false)}),HostConfig:z.object({ReadonlyRootfs:z.literal(true),CapDrop:z.array(z.string()),SecurityOpt:z.array(z.string()),Privileged:z.literal(false),NetworkMode:z.literal('host'),Binds:z.null(),Tmpfs:z.record(z.string(),z.string()),AutoRemove:z.literal(false)}),Mounts:z.array(z.unknown()),State:z.object({Status:z.string(),Running:z.boolean(),Paused:z.literal(false),Restarting:z.literal(false),Dead:z.boolean(),ExitCode:z.number().int(),Error:z.literal('')})}).parse(list[0]);
  if(JSON.stringify(row.Config.Entrypoint)!==JSON.stringify(['/bin/bash','/cuevo/launch.sh'])||JSON.stringify(row.Config.Cmd)!==JSON.stringify(containerArgs)||JSON.stringify([...row.Config.Env].sort())!==JSON.stringify([...expectedEnv].sort())||JSON.stringify(row.HostConfig.CapDrop)!==JSON.stringify(['ALL'])||JSON.stringify(row.HostConfig.SecurityOpt)!==JSON.stringify(['no-new-privileges'])||JSON.stringify(Object.entries(row.HostConfig.Tmpfs).sort())!==JSON.stringify(Object.entries(scratch).sort()))throw fail();
  // Docker API versions can omit --tmpfs from Mounts or report the two declared
  // tmpfs entries there. HostConfig binds their exact options in both cases.
  if(row.Mounts.length){const mounts=z.array(z.object({Type:z.literal('tmpfs'),Destination:z.enum(['/scratch','/work/supabase/.temp']),Source:z.literal('').optional(),Driver:z.literal('').optional(),Name:z.literal('').optional(),RW:z.literal(true),Propagation:z.literal('').optional(),Mode:z.string().optional()}).strict()).length(2).parse(row.Mounts);if(new Set(mounts.map(mount=>mount.Destination)).size!==2)throw fail();}return row;
 };
 const stopContainer=async()=>{const before=await inspect();if(before.State.Running){const killed=await command(['kill',containerId!]);if(killed.code!==0)throw fail();}for(let attempt=0;attempt<20;attempt++){const after=await inspect();if(!after.State.Running&&['created','exited','dead'].includes(after.State.Status))return;await new Promise(done=>setTimeout(done,50));}throw fail();};
 const dispose=async()=>{if(disposed)return;if(active)await active.catch(()=>undefined);if(containerId){await stopContainer();const removed=await command(['rm',containerId]);if(removed.code!==0)throw fail();const missing=await command(['container','ls','--all','--no-trunc','--quiet','--filter','id='+containerId]);if(missing.code!==0||missing.stdout.toString().trim())throw fail();containerId=undefined;}if(imageId){const removed=await command(['rmi',imageId]);if(removed.code!==0)throw fail();imageId=undefined;}disposed=true;};
 try{
  await requireSupervisor();
  preparationPhase='BASE';
  const pulled=await command(['pull',baseImage],undefined,{},300000,signal);if(pulled.code!==0)throw fail();const base=await command(['image','inspect',baseImage]);if(base.code!==0)throw fail();z.array(z.object({Id:z.literal('sha256:d9e872c3ee59358dc71c3c99957c2d8ccd3f21419fee87b742faddcf00a6ecee'),Os:z.literal('linux'),Architecture:z.literal('amd64'),Config:z.object({Volumes:z.null(),Env:z.array(z.string())})})).length(1).parse(JSON.parse(base.stdout.toString()));
  preparationPhase='BUILD';buildAttempted=true;const built=await command(['build','--quiet','--network=none','--pull=false','--tag',imageTag,'-'],tar([...files,{name:'launch.sh',bytes:gate,mode:0o444},{name:'files.sha256',bytes:sums,mode:0o444},{name:'Dockerfile',bytes:dockerfile,mode:0o444}]),{},300000,signal);if(built.code!==0)throw fail();imageId=imageDigest.parse(built.stdout.toString().trim());buildAcknowledged=true;
  preparationPhase='IMAGE';
  const checked=await command(['image','inspect',imageId]);if(checked.code!==0)throw fail();const images=z.array(z.object({Id:z.literal(imageId),Os:z.literal('linux'),Architecture:z.literal('amd64'),Config:z.object({Volumes:z.record(z.string(),z.unknown()).nullable().optional(),Labels:z.object({'cuevo.migration.owner':z.literal(owner)}),User:z.literal('65532:65532'),WorkingDir:z.literal('/work'),Entrypoint:z.array(z.string()),Cmd:z.array(z.string()).nullable(),Env:z.array(z.string())})})).length(1).parse(JSON.parse(checked.stdout.toString()));const config=images[0].Config;
  if(config.Volumes&&Object.keys(config.Volumes).length||JSON.stringify(config.Entrypoint)!==JSON.stringify(['/bin/bash','/cuevo/launch.sh'])||config.Cmd?.length||config.Env.some(value=>!/^(?:PATH|NODE_VERSION|YARN_VERSION|PGSSLROOTCERT|HOME|SUPABASE_HOME|TMPDIR)=/.test(value))||new Set(config.Env.map(value=>value.split('=',1)[0])).size!==config.Env.length)throw fail();for(const required of ['NODE_VERSION=24.16.0','PGSSLROOTCERT=/cuevo/ca.pem','HOME=/scratch','SUPABASE_HOME=/scratch','TMPDIR=/scratch','PATH='+containerPath])if(!config.Env.includes(required))throw fail();expectedEnv=[...config.Env,'PGPASSWORD='+env.PGPASSWORD];
  preparationPhase='CREATE';createAttempted=true;const created=await command(['create','--name',containerName,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','65532:65532','--network=host','--interactive','--env','PGPASSWORD',...Object.entries(scratch).flatMap(([path,settings])=>['--tmpfs',path+':'+settings]),imageId,...containerArgs],undefined,{PGPASSWORD:env.PGPASSWORD},30000,signal);if(created.code!==0)throw fail();containerId=z.string().regex(/^[a-f0-9]{64}$/).parse(created.stdout.toString().trim());createAcknowledged=true;preparationPhase='INSPECT';if((await inspect()).State.Status!=='created'||signal?.aborted)throw fail();
 }catch{
  let cleanupConfirmed=false;try{if(buildAttempted&&!imageId){const found=await command(['image','ls','--quiet','--no-trunc','--filter','reference='+imageTag,'--filter','label=cuevo.migration.owner='+owner]);if(found.code!==0)throw fail();const ids=found.stdout.toString().trim().split('\n').filter(Boolean);if(ids.length>1)throw fail();if(ids.length)imageId=imageDigest.parse(ids[0]);}if(createAttempted&&!containerId){const found=await command(['container','ls','--all','--no-trunc','--quiet','--filter','name=^/'+containerName+'$']);if(found.code!==0)throw fail();const ids=found.stdout.toString().trim().split('\n').filter(Boolean);if(ids.length>1)throw fail();if(ids.length)containerId=z.string().regex(/^[a-f0-9]{64}$/).parse(ids[0]);}await dispose();cleanupConfirmed=(!buildAttempted||buildAcknowledged)&&(!createAttempted||createAcknowledged);}catch{/* Original owner identity remains available for private read-only inspection. */}
  throw new HostedMigrationNativePreparationError({version:1,purpose:'CUEVO_NATIVE_MIGRATION_PREPARATION_FAILURE',phase:preparationPhase,ownerId:owner,cleanup:cleanupConfirmed?'CONFIRMED_STOPPED':'UNCONFIRMED'});
 }
 const prepared=Object.freeze({imageId,deliverySha256});
 const runCli=async(args:string[],privateEnv:Record<string,string>,launchOptions:{notAfterMs:number}):Promise<CliResult>=>{
  if(attempted||disposed)return{kind:'UNKNOWN'};attempted=true;let notAfterMs:number;
  try{const argumentsCopy=z.array(z.string()).length(11).parse(own(args)),currentEnv=privateEnvironment(privateEnv,input),deadline=z.object({notAfterMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict().parse(own(launchOptions));notAfterMs=deadline.notAfterMs;if(JSON.stringify(argumentsCopy)!==JSON.stringify(argumentsFor(input))||JSON.stringify(currentEnv)!==JSON.stringify(env)||signal?.aborted)throw fail();const row=await inspect();if(row.State.Status!=='created'||row.State.Running||signal?.aborted||Date.now()>=notAfterMs)throw fail();}catch{return{kind:'UNKNOWN'};}
  const execute=async():Promise<CliResult>=>{try{if(signal?.aborted||Date.now()>=notAfterMs)return{kind:'UNKNOWN'};const result=await command(['start','--attach','--interactive',containerId!],Buffer.from(String(notAfterMs)+'\n'),{},input.timeoutMs,signal);const after=await inspect();if(after.State.Running||after.State.Status!=='exited')throw fail();return signal?.aborted?{kind:'UNKNOWN'}:result.code===0?{kind:'EXITED',exitCode:after.State.ExitCode}:after.State.ExitCode===124?{kind:'UNKNOWN'}:{kind:'EXITED',exitCode:after.State.ExitCode};}catch(error){await stopContainer();return signal?.aborted?{kind:'UNKNOWN'}:error instanceof CommandInterrupted?{kind:'TIMEOUT'}:{kind:'UNKNOWN'};}};
  active=execute();return await active;
 };
 return Object.freeze({prepared,runCli,dispose});
}
