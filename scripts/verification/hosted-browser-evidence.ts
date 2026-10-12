import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';
import type { HostedCommandJournalIdentity, HostedCommandJournalRecipe } from './hosted-command-journal-contracts';

const failure=()=>Error('Hosted browser evidence requires review; private contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const sources=['supabase/seed/identities.json','scripts/verification/backend-hosted-learning-loop.ts',
 'scripts/verification/backend-hosted-community.ts','scripts/verification/hosted-acceptance-context.ts',
 'scripts/verification/hosted-browser-evidence.ts'] as const;
export type HostedBrowserSourceFile=typeof sources[number];
export type HostedBrowserCompanionWriter=(name:string,value:unknown)=>Promise<string>;
export type HostedBrowserCompanionSnapshotEntry={path:string;sha256:string};
type CompanionProof={path:string;stat:Stats;sha256:string};
type CompanionOwner={directory:string;nodes:{path:string;stat:Stats}[];published:Map<string,CompanionProof>;stopped:boolean;active:boolean;checked:()=>Promise<void>};
const companionOwners=new WeakMap<HostedBrowserCompanionWriter,CompanionOwner>();
const commandCompanion=/^\d{6}\.(?:intent|http)\.json$/;
const sameIdentity=(before:Stats,after:Stats)=>before.dev===after.dev&&before.ino===after.ino&&before.birthtimeMs===after.birthtimeMs;
const sameProof=(before:Stats,after:Stats)=>sameIdentity(before,after)&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&before.nlink===after.nlink&&before.mode===after.mode&&before.uid===after.uid;
async function ownedOperation<T>(owner:CompanionOwner,work:()=>Promise<T>):Promise<T>{
 if(owner.stopped||owner.active){owner.stopped=true;throw failure();}
 owner.active=true;
 try{return await work();}catch{owner.stopped=true;throw failure();}finally{owner.active=false;}
}
async function checkedCompanion(owner:CompanionOwner,proof:CompanionProof):Promise<Stats>{
 const stat=await lstat(proof.path);
 if(owner.stopped||!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>512*1024||!sameProof(proof.stat,stat)||await realpath(proof.path)!==proof.path)throw failure();
 return stat;
}
async function readPublishedCompanion(owner:CompanionOwner,proof:CompanionProof):Promise<Buffer>{
 await checkedCompanion(owner,proof);const handle=await open(proof.path,'r');
 try{
  const before=await handle.stat();if(owner.stopped||!before.isFile()||before.nlink!==1||!sameProof(proof.stat,before))throw failure();
  const bytes=Buffer.alloc(proof.stat.size+1);let position=0;
  while(position<bytes.length){if(owner.stopped)throw failure();const read=await handle.read(bytes,position,bytes.length-position,position);if(!read.bytesRead)break;position+=read.bytesRead;}
  const after=await handle.stat();if(position!==proof.stat.size||!after.isFile()||after.nlink!==1||!sameProof(proof.stat,after)||hash(bytes.subarray(0,position))!==proof.sha256)throw failure();
  await checkedCompanion(owner,proof);return bytes.subarray(0,position);
 }finally{await handle.close();}
}

/** Only named, source-owned producers and the fictional identity source can be
 * read. Root and every path component retain the original no-link boundary. */
export async function readHostedBrowserSource(root:string,name:HostedBrowserSourceFile):Promise<Buffer>{
 try{
  if(!sources.includes(name)||!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root)throw failure();
  const path=join(root,name);let current=root;
  for(const part of name.split('/')){current=join(current,part);const stat=await lstat(current);if(stat.isSymbolicLink()||await realpath(current)!==current)throw failure();}
  const before=await lstat(path);if(!before.isFile()||before.nlink!==1||before.size>1024*1024)throw failure();
  const bytes=await readFile(path),after=await lstat(path);
  if(bytes.length>1024*1024||!after.isFile()||after.isSymbolicLink()||after.nlink!==1||await realpath(path)!==path||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||before.birthtimeMs!==after.birthtimeMs)throw failure();
  return bytes;
 }catch{throw failure();}
}
async function privateDirectory(path:string){
 try{await mkdir(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw failure();}
 const stat=await lstat(path);
 if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path||process.platform!=='win32'&&((stat.mode&0o777)!==0o700||typeof process.geteuid==='function'&&stat.uid!==process.geteuid()))throw failure();
}
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),runId=z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value=>Number.isSafeInteger(Number(value)));
const inputSchema=z.object({repoRoot:z.string(),recipe:z.enum(['learning-loop','community']),identity:z.object({
 projectRef:z.string().regex(/^[a-z]{20}$/),schoolId:z.uuid(),sourceSha:sha,treeSha:sha,ciRunId:runId,runId,
 runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),backendTransferSha256:digest,webDeploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),
}).strict()}).strict();

/** Fixed recipe directories and create-only companion names preserve the
 * learning version-one byte format. Callers cannot select paths or budgets. */
export async function createHostedBrowserCompanions(value:{repoRoot:string;recipe:HostedCommandJournalRecipe;identity:HostedCommandJournalIdentity}):Promise<HostedBrowserCompanionWriter>{
 try{
  const input=inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),root=input.repoRoot;
  if(!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root)throw failure();
  for(const part of ['.local','.local/cicd-release']){const path=join(root,part),stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw failure();}
  const parent=join(root,'.local/cicd-release'),recipeRoot=join(parent,input.recipe==='learning-loop'?'hosted-learning-loop-ui':'hosted-community-ui');
  const scopeRoot=join(recipeRoot,'scope-'+hash(JSON.stringify([input.identity.projectRef,input.identity.schoolId])));
  await privateDirectory(recipeRoot);await privateDirectory(scopeRoot);
  const directory=join(scopeRoot,'run-'+input.identity.runId+'-'+input.identity.runAttempt);
  await mkdir(directory,{mode:0o700});await privateDirectory(directory);
  const paths=[directory];while(paths[0]!==root){const parent=dirname(paths[0]),part=relative(root,parent);if(parent===paths[0]||isAbsolute(part)||part.split(/[\\/]/).includes('..'))throw failure();paths.unshift(parent);}
  const nodes=await Promise.all(paths.map(async path=>({path,stat:await lstat(path)})));
   const owner:CompanionOwner={directory,nodes,published:new Map(),stopped:false,active:false,checked:async()=>{}};
   const checked=async()=>{for(const node of nodes){const stat=await lstat(node.path),privateNode=[recipeRoot,scopeRoot,directory].includes(node.path);if(owner.stopped||!stat.isDirectory()||stat.isSymbolicLink()||await realpath(node.path)!==node.path||!sameIdentity(node.stat,stat)||privateNode&&(stat.mode!==node.stat.mode||stat.uid!==node.stat.uid||process.platform!=='win32'&&((stat.mode&0o777)!==0o700||typeof process.geteuid==='function'&&stat.uid!==process.geteuid())))throw failure();}if(owner.stopped)throw failure();};
   owner.checked=checked;await checked();
   const write:HostedBrowserCompanionWriter=async(name,value)=>ownedOperation(owner,async()=>{
    if(!/^(?:\d{6}\.(?:intent|http)|run-intent|command-manifest|result)\.json$/.test(name)&&!(input.recipe==='community'&&['prefix-snapshot.json','prefix-proof.json'].includes(name)))throw failure();
   await checked();const bytes=canonicalReleaseExecutionJson(value);if(Buffer.byteLength(bytes)>512*1024)throw failure();
   const path=join(directory,name),handle=await open(path,'wx',0o600);let stat;
   try{await handle.writeFile(bytes);await handle.sync();stat=await handle.stat();}finally{await handle.close();}
   await checked();const current=await lstat(path);
   if(!current.isFile()||current.isSymbolicLink()||current.nlink!==1||current.dev!==stat.dev||current.ino!==stat.ino||await realpath(path)!==path||process.platform!=='win32'&&((current.mode&0o777)!==0o600||typeof process.geteuid==='function'&&current.uid!==process.geteuid())||hash(await readFile(path))!==hash(bytes))throw failure();
   for(const node of nodes.toReversed()){await checked();const parent=await open(node.path,'r');try{await parent.sync();}finally{await parent.close();}}
   await checked();const final=await lstat(path);
   if(!final.isFile()||final.isSymbolicLink()||final.nlink!==1||final.dev!==stat.dev||final.ino!==stat.ino||final.size!==stat.size||final.mtimeMs!==stat.mtimeMs||final.ctimeMs!==stat.ctimeMs||final.birthtimeMs!==stat.birthtimeMs||await realpath(path)!==path)throw failure();
    if(owner.stopped)throw failure();const sha256=hash(bytes);owner.published.set(name,{path,stat:final,sha256});return sha256;
   });
   companionOwners.set(write,owner);return write;
 }catch{throw failure();}
}

/** Only the genuine create-only writer can read its complete published original
 * command inventory. This is local byte/identity evidence, never native authority. */
export async function readHostedBrowserCompanionSnapshot(writer:unknown,entries:readonly HostedBrowserCompanionSnapshotEntry[]):Promise<Map<string,Buffer>>{
 if(typeof writer!=='function'||types.isProxy(writer))throw failure();
 const owner=companionOwners.get(writer as HostedBrowserCompanionWriter);if(!owner)throw failure();
 return ownedOperation(owner,async()=>{
  const selected=z.array(z.object({path:z.string().regex(commandCompanion),sha256:digest}).strict()).max(36).parse(JSON.parse(canonicalReleaseExecutionJson(entries)));
  const originals=[...owner.published.keys()].filter(name=>commandCompanion.test(name));
  if(selected.length!==originals.length||new Set(selected.map(row=>row.path)).size!==selected.length||selected.some(row=>owner.published.get(row.path)?.sha256!==row.sha256))throw failure();
  await owner.checked();const directories=await Promise.all(owner.nodes.map(async node=>({path:node.path,stat:await lstat(node.path)})));
  const inventory=async()=>{const names=await readdir(owner.directory);if(owner.stopped||names.length!==owner.published.size||names.some(name=>!owner.published.has(name)))throw failure();};
  await inventory();
  const result=new Map<string,Buffer>();
  for(const row of selected)result.set(row.path,await readPublishedCompanion(owner,owner.published.get(row.path)!));
  for(const proof of owner.published.values())await checkedCompanion(owner,proof);
  await inventory();await owner.checked();
  for(const node of directories){const stat=await lstat(node.path);if(owner.stopped||!stat.isDirectory()||stat.isSymbolicLink()||!sameProof(node.stat,stat)||await realpath(node.path)!==node.path)throw failure();}
  if(owner.stopped)throw failure();return result;
 });
}

/** Bounded JSON transport only. Domain routing and approval remain with each
 * recipe; redirects, credential-bearing URLs and fragments are unavailable. */
export async function requestHostedBrowserJson(url:string,method:'GET'|'POST',headers:Record<string,string>,body?:unknown):Promise<{status:number;value:unknown}>{
 let response:Response|undefined;
 try{
  const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||target.hash||!['GET','POST'].includes(method))throw failure();
  const signal=AbortSignal.timeout(10000);
  response=await fetch(url,{method,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',cache:'no-store',credentials:'omit',signal});
  if(response.redirected||response.url&&response.url!==url)throw failure();
  if(response.status===204){void response.body?.cancel().catch(()=>undefined);return{status:204,value:null};}
  const declared=response.headers.get('content-length');if(!response.body||declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>65536))throw failure();
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await new Promise<ReadableStreamReadResult<Uint8Array>>((done,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(failure());};if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});void reader.read().then(value=>{signal.removeEventListener('abort',abort);done(value);},()=>{signal.removeEventListener('abort',abort);reject(failure());});});if(signal.aborted)throw failure();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw failure();parts.push(part.value);}return{status:response.status,value:JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(parts))) as unknown};}
  finally{void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* Pending reads remain canceled. */}}
 }catch{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>undefined);throw failure();}
}
