import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const fail=()=>Error('Hosted native certificate requires review; private contents withheld.');
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const filename=z.enum(['community-native-database-ca.pem','community-live-prefix-database-ca.pem']);
const inputSchema=z.object({directory:z.string(),filename,bytes:z.string().min(1).refine(bytes=>Buffer.byteLength(bytes)<=65536)}).strict();
declare const caBrand:unique symbol;
export type HostedNativeCa={readonly [caBrand]:true};
export type HostedNativeCaCertificate={path:string;sha256:string};
type NodeProof={path:string;stat:Stats};
type Owner={certificate:HostedNativeCaCertificate;stat:Stats;nodes:NodeProof[];directory:string;invalid:boolean;active:boolean;retirementAttempted:boolean};
const owners=new WeakMap<object,Owner>();
const sameIdentity=(left:Stats,right:Stats)=>left.dev===right.dev&&left.ino===right.ino&&left.birthtimeMs===right.birthtimeMs;
const sameFile=(left:Stats,right:Stats)=>left.isFile()&&right.isFile()&&left.nlink===1&&right.nlink===1&&sameIdentity(left,right)&&(['size','mtimeMs','ctimeMs','mode','uid'] as const).every(key=>left[key]===right[key]);
const privateMode=(stat:Stats,mode:number)=>process.platform==='win32'||(stat.mode&0o777)===mode&&(typeof process.geteuid!=='function'||stat.uid===process.geteuid());
function retained(value:unknown):Owner{if(!value||typeof value!=='object'||types.isProxy(value))throw fail();const owner=owners.get(value);if(!owner||owner.invalid)throw fail();return owner;}
function revoke(value:unknown,owner:Owner){owner.invalid=true;if(value&&typeof value==='object')owners.delete(value);}
async function directoryNodes(nodes:NodeProof[],directory:string,invalid:()=>boolean=()=>false){
 for(const original of nodes){const current=await lstat(original.path);if(invalid()||!current.isDirectory()||current.isSymbolicLink()||await realpath(original.path)!==original.path||!sameIdentity(original.stat,current)||original.path===directory&&(current.mode!==original.stat.mode||current.uid!==original.stat.uid||!privateMode(current,0o700)))throw fail();}
}
const directories=(owner:Owner)=>directoryNodes(owner.nodes,owner.directory,()=>owner.invalid);
async function verify(owner:Owner){
 await directories(owner);const path=owner.certificate.path,before=await lstat(path);
 if(owner.invalid||before.isSymbolicLink()||!sameFile(owner.stat,before)||!privateMode(before,0o600)||await realpath(path)!==path)throw fail();
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const initial=await file.stat();if(owner.invalid||!sameFile(owner.stat,initial)||!privateMode(initial,0o600))throw fail();
  const bytes=Buffer.alloc(owner.stat.size+1);let position=0;
  while(position<bytes.length){if(owner.invalid)throw fail();const read=await file.read(bytes,position,bytes.length-position,position);if(!read.bytesRead)break;position+=read.bytesRead;}
  const after=await file.stat();if(position!==owner.stat.size||!sameFile(owner.stat,after)||hash(bytes.subarray(0,position))!==owner.certificate.sha256)throw fail();
 }finally{await file.close();}
 await directories(owner);const after=await lstat(path);if(owner.invalid||after.isSymbolicLink()||!sameFile(owner.stat,after)||!privateMode(after,0o600)||await realpath(path)!==path)throw fail();
}

/** Owns one fixed create-only private CA file. Returned data is an opaque local
 * lifecycle reference, never approval or native execution authority. */
export async function prepareHostedNativeCa(value:{directory:string;filename:z.infer<typeof filename>;bytes:string}):Promise<HostedNativeCa>{
 try{
  const input=inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),directory=input.directory;
  if(!isAbsolute(directory)||resolve(directory)!==directory)throw fail();
  const paths=[dirname(directory)];while(dirname(paths[0])!==paths[0])paths.unshift(dirname(paths[0]));
  const nodes:NodeProof[]=[];
  for(const path of paths){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw fail();nodes.push({path,stat});}
  let directoryStat:Stats;
  try{directoryStat=await lstat(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw fail();await directoryNodes(nodes,directory);await mkdir(directory,{mode:0o700});directoryStat=await lstat(directory);}
  if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink()||await realpath(directory)!==directory||!privateMode(directoryStat,0o700))throw fail();
  if(nodes.at(-1)?.path!==directory)nodes.push({path:directory,stat:directoryStat});await directoryNodes(nodes,directory);
  const path=join(directory,input.filename),file=await open(path,'wx',0o600);let stat:Stats;
  try{await file.writeFile(input.bytes);await file.sync();stat=await file.stat();}finally{await file.close();}
  const owner:Owner={certificate:{path,sha256:hash(input.bytes)},stat,nodes,directory,invalid:false,active:false,retirementAttempted:false};
  await verify(owner);const token=Object.freeze({}) as HostedNativeCa;owners.set(token,owner);return token;
 }catch{throw fail();}
}

/** Revalidates the original file, directory and bounded bytes on every use. */
export async function consumeHostedNativeCa(value:unknown):Promise<HostedNativeCaCertificate>{
 const owner=retained(value);if(owner.active||owner.retirementAttempted){revoke(value,owner);throw fail();}owner.active=true;
 try{await verify(owner);return{...owner.certificate};}catch{revoke(value,owner);throw fail();}finally{owner.active=false;}
}

/** Attempts retirement once; detected substitutions and unknown references are
 * untouched. The verified private directory must exclude concurrent untrusted
 * writers: the OS provides no inode-conditional unlink. An uncertain native
 * unlink outcome cannot be retried using the same reference. */
export async function retireHostedNativeCa(value:unknown):Promise<void>{
 const owner=retained(value);if(owner.active||owner.retirementAttempted){revoke(value,owner);throw fail();}owner.active=true;owner.retirementAttempted=true;
 try{await verify(owner);const final=await lstat(owner.certificate.path);if(owner.invalid||final.isSymbolicLink()||!sameFile(owner.stat,final)||!privateMode(final,0o600))throw fail();await unlink(owner.certificate.path);}catch{throw fail();}finally{revoke(value,owner);owner.active=false;}
}
