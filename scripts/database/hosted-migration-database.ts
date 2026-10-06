import { Client } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { TLSSocket, checkServerIdentity } from 'node:tls';
import { types } from 'node:util';
import { z } from 'zod';
import type { HostedExecutionPorts } from './hosted-migration-execution';

const failure=()=>new Error('Hosted migration database identity, TLS or lock requires review; contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema=z.object({repoRoot:z.string(),projectRef:z.string().regex(/^[a-z]{20}$/),databaseUrl:z.string().max(400),certificate:z.object({path:z.string(),sha256:digest}).strict(),password:z.string().min(1).max(24576).refine(value=>value.trim().length>0&&[...value].every(c=>c.charCodeAt(0)>31&&c.charCodeAt(0)!==127))}).strict();
const rawHistoryRow=z.object({version:z.string().regex(/^\d{14}$/),name:z.string().max(200),statements:z.array(z.string().max(2*1024*1024)).max(20000)}).strict();
const identityRow=z.object({operator:z.literal('postgres'),database:z.literal('postgres'),ssl:z.literal(true),serverVersion:z.number().int().min(170000).max(179999)}).strict();
type Input=z.infer<typeof inputSchema>;
export type HostedMigrationDatabaseObservation={operator:'postgres';database:'postgres';serverVersion:number;tls:{kind:'PEER_VERIFIED';host:string;certificateSha256:string;peerCertificateSha256:string;protocol:string};historyPresent:boolean;history:z.infer<typeof rawHistoryRow>[]};
export type HostedMigrationDatabase=Pick<HostedExecutionPorts,'withLock'>&{readonly signal:AbortSignal;observe():Promise<HostedMigrationDatabaseObservation>};
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function privateProcessEnvironment(){if(Object.keys(process.env).some(key=>/^PG/i.test(key)&&process.env[key]!==undefined&&process.env[key]!==''))throw failure();}
function json(value:unknown,depth=0):unknown{
 if(depth>6)throw failure();
 if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 const output:Record<string,unknown>=Object.create(null);
 for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();output[key]=json(field.value,depth+1);}
 return output;
}
async function certificate(input:Input):Promise<string>{
 const root=input.repoRoot,path=input.certificate.path,part=relative(root,path);
 if(!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root||!isAbsolute(path)||resolve(path)!==path||!part||isAbsolute(part)||part.split(/[\\/]/).some(p=>!p||p==='.'||p==='..')||!part.replaceAll('\\','/').startsWith('.local/hosted-release/'))throw failure();
 let current=root;const pieces=part.split(/[\\/]/);
 for(const[index,piece]of pieces.entries()){current=join(current,piece);const stat=await lstat(current);if(stat.isSymbolicLink()||await realpath(current)!==current||(index===pieces.length-1?!stat.isFile()||stat.nlink!==1:!stat.isDirectory()))throw failure();if(process.platform!=='win32'&&index===pieces.length-1&&(stat.mode&0o077)!==0)throw failure();}
 const gitEnvironment=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]).concat([['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null'],['GIT_NO_REPLACE_OBJECTS','1']]));
 const checkIgnore=execFileSync('git',['-C',root,'check-ignore','--no-index','--stdin'],{input:part.replaceAll('\\','/')+'\n',encoding:'utf8',stdio:['pipe','pipe','ignore'],timeout:5000,windowsHide:true,shell:false,env:gitEnvironment}).trim();
 if(checkIgnore!==part.replaceAll('\\','/'))throw failure();
 if(execFileSync('git',['-C',root,'ls-files','--cached','--',part.replaceAll('\\','/')],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000,windowsHide:true,shell:false,env:gitEnvironment}).length)throw failure();
 const handle=await open(path,'r');try{const before=await handle.stat(),bytes=await handle.readFile();const after=await handle.stat();if(before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.size>512*1024||hash(bytes)!==input.certificate.sha256||!bytes.toString().includes('-----BEGIN CERTIFICATE-----'))throw failure();return bytes.toString('utf8');}finally{await handle.close();}
}
/** Actual operator connection and session lock. It reads catalog/history only; SQL migration execution remains in its exact CLI consumer. */
export async function createHostedMigrationDatabase(value:unknown):Promise<HostedMigrationDatabase>{
 let input:Input,url:URL,ca:string;
 try{privateProcessEnvironment();input=inputSchema.parse(json(value));url=new URL(input.databaseUrl);const direct=url.hostname===`db.${input.projectRef}.supabase.co`&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${input.projectRef}`;if(url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||!(direct||pooler)||url.toString()!==input.databaseUrl)throw failure();ca=await certificate(input);}catch{throw failure();}
 const controller=new AbortController();let entered=false,active:Client|null=null,leaseLive=false,ending=false,unlocking=false;
 const check=()=>{if(!active||!leaseLive||controller.signal.aborted||unlocking)throw failure();};
 const tls=()=>{check();const stream=active!.connection.stream as TLSSocket;if(!stream.encrypted||stream.authorized!==true)throw failure();const protocol=stream.getProtocol(),peer=stream.getPeerCertificate();if(!protocol||!['TLSv1.2','TLSv1.3'].includes(protocol)||!peer?.raw?.length||checkServerIdentity(url.hostname,peer))throw failure();return{kind:'PEER_VERIFIED' as const,host:url.hostname,certificateSha256:input.certificate.sha256,peerCertificateSha256:hash(peer.raw),protocol};};
 async function identity(){check();const response=await active!.query(`select session_user::text as operator,current_database()::text as database,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) as ssl,current_setting('server_version_num')::integer as "serverVersion"`);check();if(response.rows.length!==1)throw failure();return identityRow.parse(response.rows[0]);}
 const observe=async()=>{try{check();if(unlocking)throw failure();await certificate(input);const peer=tls(),who=await identity();const presence=await active!.query(`select to_regclass('supabase_migrations.schema_migrations') is not null as "historyPresent"`);check();if(presence.rows.length!==1||typeof presence.rows[0].historyPresent!=='boolean')throw failure();const historyPresent=presence.rows[0].historyPresent as boolean;let history:z.infer<typeof rawHistoryRow>[]=[];if(historyPresent){const result=await active!.query(`select version,coalesce(name,'') as name,statements from supabase_migrations.schema_migrations order by version limit 1001`);check();history=z.array(rawHistoryRow).max(1000).parse(result.rows);if(new Set(history.map(row=>row.version)).size!==history.length||Buffer.byteLength(JSON.stringify(history))>8*1024*1024)throw failure();}return{...who,tls:peer,historyPresent,history};}catch{throw failure();}};
 const withLock:HostedExecutionPorts['withLock']=async(key,run)=>{
  privateProcessEnvironment();if(entered||key!==`${input.projectRef}:HOSTED_SCHEMA_MIGRATION`||controller.signal.aborted)throw failure();entered=true;
  const client=new Client({host:url.hostname,port:5432,database:'postgres',user:url.username,password:input.password,ssl:{rejectUnauthorized:true,ca,minVersion:'TLSv1.2'},options:'-c search_path=pg_catalog',client_encoding:'UTF8',application_name:'cuevo-hosted-migration-operator',connectionTimeoutMillis:10000,statement_timeout:5000,query_timeout:7000,lock_timeout:2000,keepAlive:true});
  active=client;const lost=()=>{if(!ending){leaseLive=false;controller.abort();}};client.on('error',lost);client.on('end',lost);
  let released=false;try{await client.connect();leaseLive=true;tls();await identity();const locked=await client.query(`select pg_try_advisory_lock(hashtextextended($1,0)) as locked`,[key]);check();if(locked.rows.length!==1||locked.rows[0].locked!==true)throw failure();await run({kind:'HELD',id:randomUUID(),key});check();unlocking=true;const unlock=await client.query(`select pg_advisory_unlock(hashtextextended($1,0)) as released`,[key]);if(controller.signal.aborted||!leaseLive)throw failure();released=unlock.rows.length===1&&unlock.rows[0].released===true;if(!released)throw failure();}catch{throw failure();}finally{leaseLive=false;ending=true;controller.abort();try{await client.end();}catch{released=false;}active=null;}
  return released?{kind:'RELEASED'}:{kind:'RELEASE_UNCONFIRMED'};
 };
 return{signal:controller.signal,observe,withLock};
}
