import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, Socket as SocketConstructor, type Socket } from 'node:net';
import { createServer as tlsServer } from 'node:tls';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { registerHooks } from 'node:module';
import { Client, type ClientConfig } from 'pg';
import { transformSync } from 'esbuild';
import type { createHostedMigrationDatabase } from './hosted-migration-database';

// Test transport routes only this fixture to loopback; production host/CA validation remains unchanged.
let fixturePort=0;
Object.assign(globalThis,{migrationTlsFixtureClient:class extends Client{constructor(config:ClientConfig){super({...config,stream:()=>{const socket=new SocketConstructor();socket.connect=(()=>{const connect=socket.connect.bind(socket);return()=>connect(fixturePort,'127.0.0.1');})();return socket;}});}}});
// This isolated test module already imported pg; intercept only the adapter's import in a fresh dynamic module.
registerHooks({load(url,context,next){if(url.replaceAll('\\','/').endsWith('/hosted-migration-database.ts'))return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8').replace("import { Client } from 'pg';",'const Client=globalThis.migrationTlsFixtureClient;'),{loader:'ts',format:'esm'}).code};return next(url,context);}});

const ref='mqxdjvsyckzocokuikmx',host=`db.${ref}.supabase.co`;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const field=(value:string)=>Buffer.from(value+'\0');
function message(kind:string,body:Buffer){const header=Buffer.alloc(5);header.write(kind);header.writeInt32BE(body.length+4,1);return Buffer.concat([header,body]);}
function results(columns:{name:string;type:number;value:string}[]){const count=Buffer.alloc(2);count.writeInt16BE(columns.length);const description=Buffer.concat([count,...columns.map(col=>{const metadata=Buffer.alloc(18);metadata.writeInt32BE(col.type,6);metadata.writeInt16BE(-1,10);metadata.writeInt32BE(-1,12);return Buffer.concat([field(col.name),metadata]);})]);const row=Buffer.concat([count,...columns.map(col=>{const bytes=Buffer.from(col.value),length=Buffer.alloc(4);length.writeInt32BE(bytes.length);return Buffer.concat([length,bytes]);})]);return Buffer.concat([message('T',description),message('D',row),message('C',field('SELECT 1')),message('Z',Buffer.from('I'))]);}
async function fixture(run:(input:Parameters<typeof createHostedMigrationDatabase>[0],capture:{startup:number;queries:string[]})=>Promise<void>,wrongName=false){
 const root=await mkdtemp(join(tmpdir(),'cuevo-native-tls-'));const sockets=new Set<Socket>();let server:ReturnType<typeof createServer>|null=null;
 try{
  await mkdir(join(root,'.local/hosted-release'),{recursive:true});await writeFile(join(root,'.gitignore'),'.local/\n');execFileSync('git',['init','--quiet',root],{stdio:'ignore',windowsHide:true});
  const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl',cert=join(root,'.local/hosted-release/ca.pem'),key=join(root,'.local/hosted-release/key.pem');
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=cuevo-tls-fixture','-addext',`subjectAltName=DNS:${wrongName?'wrong.fixture.invalid':host}`],{stdio:'ignore',windowsHide:true});
  await chmod(cert,0o600);
  const capture={startup:0,queries:[]as string[]},tls=tlsServer({key:await readFile(key),cert:await readFile(cert)},stream=>{
   sockets.add(stream);let buffer=Buffer.alloc(0),startup=true;
   stream.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);for(;;){if(startup){if(buffer.length<4||buffer.length<buffer.readInt32BE(0))return;buffer=buffer.subarray(buffer.readInt32BE(0));startup=false;capture.startup++;stream.write(Buffer.concat([message('R',Buffer.alloc(4)),message('Z',Buffer.from('I'))]));continue;}if(buffer.length<5)return;const length=buffer.readInt32BE(1);if(buffer.length<length+1)return;const kind=buffer.toString('utf8',0,1),body=buffer.subarray(5,length+1);buffer=buffer.subarray(length+1);if(kind==='X'){stream.end();return;}if(kind==='P'){stream.write(message('1',Buffer.alloc(0)));continue;}if(kind==='B'){stream.write(message('2',Buffer.alloc(0)));continue;}if(kind==='D'){stream.write(message('n',Buffer.alloc(0)));continue;}if(kind==='E'){stream.write(results([{name:'locked',type:16,value:'t'},{name:'released',type:16,value:'t'}]).subarray(0,-6));continue;}if(kind==='S'){stream.write(message('Z',Buffer.from('I')));continue;}if(kind!=='Q')throw Error('Unexpected fixture protocol '+kind);const sql=body.toString('utf8').replace(/\0$/,'');capture.queries.push(sql);if(sql.includes('session_user'))stream.write(results([{name:'operator',type:25,value:'postgres'},{name:'database',type:25,value:'postgres'},{name:'ssl',type:16,value:'t'},{name:'serverVersion',type:23,value:'170011'}]));else if(sql.includes('CUEVO_NATIVE_QUIESCENCE'))stream.write(results([{name:'quiescent',type:16,value:'t'}]));else if(sql.includes('pg_try_advisory_lock'))stream.write(results([{name:'locked',type:16,value:'t'}]));else if(sql.includes('pg_advisory_unlock'))stream.write(results([{name:'released',type:16,value:'t'}]));else stream.write(results([{name:'historyPresent',type:16,value:'f'}]));}});
  });tls.on('tlsClientError',()=>undefined);
  server=createServer(socket=>{sockets.add(socket);socket.once('data',bytes=>{assert.equal(bytes.length,8);assert.equal(bytes.readInt32BE(4),80877103);socket.write('S');tls.emit('connection',socket);});});await new Promise<void>(done=>server!.listen(0,'127.0.0.1',done));fixturePort=(server.address() as {port:number}).port;
  const input={repoRoot:resolve(root),projectRef:ref,databaseUrl:`postgresql://postgres@${host}:5432/postgres?sslmode=verify-full`,certificate:{path:cert,sha256:hash(await readFile(cert))},password:'tls-private-fixture'};
  await run(input,capture);
 }finally{for(const socket of sockets)socket.destroy();if(server)await new Promise<void>(done=>server!.close(()=>done()));await rm(root,{recursive:true,force:true});}
}
test('real PostgreSQL SSL negotiation verifies the matching peer and rejects a trusted wrong hostname before startup',async()=>{
 // Adapter is loaded after the test-only pg factory has been registered.
 const {createHostedMigrationDatabase:create}=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-migration-database.ts')).href) as typeof import('./hosted-migration-database');
 await fixture(async(input,capture)=>{const db=await create(input);await db.withLock(`${ref}:HOSTED_SCHEMA_MIGRATION`,async()=>{assert.equal((await db.observe()).tls.protocol,'TLSv1.3');});assert.equal(capture.startup,1);});
 await fixture(async(input,capture)=>{const db=await create(input);await assert.rejects(db.withLock(`${ref}:HOSTED_SCHEMA_MIGRATION`,async()=>{throw Error('Must not reach callback');}),/requires review; contents withheld/);assert.equal(capture.startup,0);},true);
});
