import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readFile, rename, rm, writeFile, utimes } from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { canonicalReleaseExecutionJson } from './release-review';

const identity={projectRef:'mqxdjvsyckzocokuikmx',schoolId:'10000000-0000-4000-8000-000000000001',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),ciRunId:'31',runId:'81',runAttempt:2,backendTransferSha256:'c'.repeat(64),webDeploymentId:'dpl_Web'};
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
async function api(){let value:Record<string,unknown>={};try{value=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-browser-evidence.ts')).href);}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof value.createHostedBrowserCompanions,'function','Shared fixed-recipe evidence owner is required');return value as typeof import('./hosted-browser-evidence');}
async function fixture(context:TestContext,run:(root:string,flushes:string[])=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'cuevo-hosted-evidence-')),flushes:string[]=[];
 const probe=await open(join(root,'probe'),'wx'),prototype=Object.getPrototypeOf(probe) as FileHandle;await probe.close();await rm(join(root,'probe'));const native=prototype.sync;
 const mock=context.mock.method(prototype,'sync',async function(this:FileHandle){const stat=await this.stat();flushes.push(stat.isFile()?'file':'directory');if(stat.isFile()||process.platform!=='win32')await native.call(this);});
 try{await mkdir(join(root,'.local/cicd-release'),{recursive:true});await mkdir(join(root,'supabase/seed'),{recursive:true});await writeFile(join(root,'supabase/seed/identities.json'),'original');await run(root,flushes);}finally{mock.mock.restore();assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}
}
const folder=(root:string,recipe='learning-loop')=>join(root,'.local/cicd-release','hosted-'+recipe+'-ui','scope-'+hash(JSON.stringify([identity.projectRef,identity.schoolId])),'run-81-2');

test('shared evidence preserves legacy canonical bytes and fixed learning paths while isolating community',async context=>{const owner=await api();await fixture(context,async(root,flushes)=>{
 const learning=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'learning-loop',identity}),community=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity});
 const row={version:1,purpose:'CUEVO_HOSTED_LEARNING_LOOP_UI',identity};const bytes=canonicalReleaseExecutionJson(row);
 assert.equal(await learning('run-intent.json',row),hash(bytes));assert.equal(await readFile(join(folder(root),'run-intent.json'),'utf8'),bytes);
 await community('run-intent.json',{version:1,purpose:'CUEVO_HOSTED_COMMUNITY_UI',identity});assert(flushes.includes('file'));assert(flushes.includes('directory'));
 await assert.rejects(learning('run-intent.json',row));await assert.rejects(owner.createHostedBrowserCompanions({repoRoot:root,recipe:'learning-loop',identity}));
});});

test('source and evidence paths, recipe and budgets are closed before any file is written',async context=>{const owner=await api();await fixture(context,async root=>{
 assert.equal((await owner.readHostedBrowserSource(root,'supabase/seed/identities.json')).toString(),'original');
 for(const file of ['../identities.json','supabase/seed/../../.env.local','.env.local'])await assert.rejects(owner.readHostedBrowserSource(root,file as never));
 await assert.rejects(owner.createHostedBrowserCompanions({repoRoot:root,recipe:'foreign' as never,identity}));
 await assert.rejects(owner.createHostedBrowserCompanions({...{repoRoot:root,recipe:'community',identity},directory:'../outside'} as never));
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'learning-loop',identity});
 for(const name of ['../result.json','000001.native.json','result.json/extra','private.txt'])await assert.rejects(write(name,{}));
 const bounded=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity});
 await assert.rejects(bounded('result.json',{value:'a'.repeat(512*1024)}));
 await assert.rejects(readFile(join(folder(root,'community'),'result.json')));
 await writeFile(join(root,'supabase/seed/identities.json'),Buffer.alloc(1024*1024+1));await assert.rejects(owner.readHostedBrowserSource(root,'supabase/seed/identities.json'));
});});

test('hard-linked sources and replaced evidence parents cannot be consumed or extended',async context=>{const owner=await api();await fixture(context,async root=>{
 await link(join(root,'supabase/seed/identities.json'),join(root,'duplicate'));await assert.rejects(owner.readHostedBrowserSource(root,'supabase/seed/identities.json'));
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'learning-loop',identity}),directory=folder(root);
 await rename(directory,directory+'-retained');await mkdir(directory,{mode:0o700});await assert.rejects(write('result.json',{}));
});});

test('a hard link introduced during a source read fails its final file check',async context=>{const owner=await api();await fixture(context,async root=>{
 const native=fsPromises.readFile,source=join(root,'supabase/seed/identities.json');let linked=false;
 const mocked=context.mock.method(fsPromises,'readFile',async(...args:Parameters<typeof fsPromises.readFile>)=>{const bytes=await native(...args);if(String(args[0])===source&&!linked){linked=true;await link(source,join(root,'late-duplicate'));}return bytes;});syncBuiltinESMExports();
 try{await assert.rejects(owner.readHostedBrowserSource(root,'supabase/seed/identities.json'));assert.equal(linked,true);}finally{mocked.mock.restore();syncBuiltinESMExports();}
});});

test('a companion changed during readback cannot return a valid evidence digest',async context=>{const owner=await api();await fixture(context,async root=>{
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'learning-loop',identity}),native=fsPromises.readFile,source=join(folder(root),'result.json');let linked=false;
 const mocked=context.mock.method(fsPromises,'readFile',async(...args:Parameters<typeof fsPromises.readFile>)=>{const bytes=await native(...args);if(String(args[0])===source&&!linked){linked=true;await link(source,join(root,'late-companion-duplicate'));}return bytes;});syncBuiltinESMExports();
 try{await assert.rejects(write('result.json',{version:1,identity}));assert.equal(linked,true);}finally{mocked.mock.restore();syncBuiltinESMExports();}
});});

test('HTTP evidence bounds decoding, size and redirect policy and cancels rejected streams',async context=>{
 const owner=await api();let cancelled=0,options:RequestInit|undefined;
 const response=(bytes:Uint8Array,closed=true)=>new Response(new ReadableStream({start(controller){controller.enqueue(bytes);if(closed)controller.close();},cancel(){cancelled++;}}));
 const native=globalThis.fetch;context.mock.method(globalThis,'fetch',async(_url:unknown,input?:RequestInit)=>{options=input;return Response.json({available:false});});
 assert.deepEqual(await owner.requestHostedBrowserJson('https://fixture.invalid/path','GET',{}),{status:200,value:{available:false}});assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');assert.equal(options?.credentials,'omit');
 for(const invalid of ['http://fixture.invalid/path','https://user:private@fixture.invalid/path','https://fixture.invalid/path#fragment'])await assert.rejects(owner.requestHostedBrowserJson(invalid,'GET',{}));
 for(const bytes of [Buffer.alloc(65537),Buffer.from([0xff])]){globalThis.fetch=async()=>response(bytes,bytes.length<=65536);await assert.rejects(owner.requestHostedBrowserJson('https://fixture.invalid/path','GET',{}));}
 globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-length':'65537'}});await assert.rejects(owner.requestHostedBrowserJson('https://fixture.invalid/path','GET',{}));
 assert(cancelled>=2);globalThis.fetch=native;
});

test('HTTP evidence cancels a stalled pending reader when the original bounded signal aborts',async context=>{
 const owner=await api(),controller=new AbortController();let cancelled=0;
 context.mock.method(AbortSignal,'timeout',(milliseconds:number)=>{assert.equal(milliseconds,10000);return controller.signal;});
 context.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(){queueMicrotask(()=>controller.abort());},cancel(){cancelled++;}})));
 await assert.rejects(owner.requestHostedBrowserJson('https://fixture.invalid/path','GET',{}));assert.equal(cancelled,1);
});

test('a genuine writer reads exactly its published original command inventory without rewriting bytes',async context=>{const owner=await api();await fixture(context,async root=>{
 assert.equal(typeof owner.readHostedBrowserCompanionSnapshot,'function','published original companion snapshots have one shared owner');
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity});
 const first='000001.intent.json',second='000001.http.json',one={version:1,key:'original-command-key',input:{body:'Fixed synthetic text'}},two={version:1,status:200};
 await write('run-intent.json',{identity});const firstHash=await write(first,one),secondHash=await write(second,two);
 const bytes=await owner.readHostedBrowserCompanionSnapshot(write,[{path:second,sha256:secondHash},{path:first,sha256:firstHash}]);
 assert.deepEqual([...bytes.keys()],[second,first]);assert.equal(bytes.get(first)!.toString(),canonicalReleaseExecutionJson(one));assert.equal(bytes.get(second)!.toString(),canonicalReleaseExecutionJson(two));
 bytes.get(first)!.fill(0);assert.equal((await owner.readHostedBrowserCompanionSnapshot(write,[{path:first,sha256:firstHash},{path:second,sha256:secondHash}])).get(first)!.toString(),canonicalReleaseExecutionJson(one));
 await write('prefix-snapshot.json',{version:1});await write('prefix-proof.json',{version:1});
 assert.equal((await owner.readHostedBrowserCompanionSnapshot(write,[{path:first,sha256:firstHash},{path:second,sha256:secondHash}])).size,2);
 await assert.rejects(write('prefix-proof.json',{}));
});});

test('snapshot authority rejects forged copied and proxied writers without poisoning the genuine reference',async context=>{const owner=await api();await fixture(context,async root=>{
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1});
 for(const falseWriter of [async()=>sha256,write.bind(null),new Proxy(write,{}),{},null])await assert.rejects(owner.readHostedBrowserCompanionSnapshot(falseWriter,[{path:name,sha256}]));
 assert.equal((await owner.readHostedBrowserCompanionSnapshot(write,[{path:name,sha256}])).size,1);
});});

test('snapshot missing duplicate extra mismatched and oversized inventories poison only their owning writer',async context=>{const owner=await api();
 for(const mode of ['missing','duplicate','extra','digest','excluded','too-many'])await fixture(context,async root=>{
  const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1}),entry={path:name,sha256};
  const entries=mode==='missing'?[]:mode==='duplicate'?[entry,entry]:mode==='extra'?[entry,{path:'000002.http.json',sha256}]:mode==='digest'?[{path:name,sha256:'0'.repeat(64)}]:mode==='excluded'?[entry,{path:'run-intent.json',sha256}]:Array.from({length:37},(_,index)=>({path:String(index+1).padStart(6,'0')+'.intent.json',sha256}));
  await assert.rejects(owner.readHostedBrowserCompanionSnapshot(write,entries));await assert.rejects(write('result.json',{}));
 });
});

test('snapshots reject same-byte replacements metadata changes hardlinks unexpected files and directory substitution',async context=>{const owner=await api();
 for(const mode of ['replacement','metadata','hardlink','unexpected','directory'])await fixture(context,async root=>{
  const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1}),directory=folder(root,'community'),path=join(directory,name);
  if(mode==='replacement'){await rename(path,path+'.retained');await writeFile(path,canonicalReleaseExecutionJson({version:1}));await rm(path+'.retained');}
  else if(mode==='metadata')await utimes(path,new Date('2020-01-01'),new Date('2020-01-01'));
  else if(mode==='hardlink')await link(path,join(root,'same-original-link'));
  else if(mode==='unexpected')await writeFile(join(directory,'000002.http.json'),'{}');
  else{await rename(directory,directory+'-retained');await mkdir(directory);await writeFile(path,canonicalReleaseExecutionJson({version:1}));}
  await assert.rejects(owner.readHostedBrowserCompanionSnapshot(write,[{path:name,sha256}]));await assert.rejects(write('result.json',{}));assert.equal(await readFile(path,'utf8'),canonicalReleaseExecutionJson({version:1}));
 });
});

test('a substitution during snapshot open poisons the writer and never returns earlier pathname bytes',async context=>{const owner=await api();await fixture(context,async root=>{
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1}),path=join(folder(root,'community'),name),native=fsPromises.open;let changed=false;
 const mocked=context.mock.method(fsPromises,'open',async(...args:Parameters<typeof fsPromises.open>)=>{if(String(args[0])===path&&!changed){changed=true;await rename(path,path+'.retained');await writeFile(path,canonicalReleaseExecutionJson({version:1}));}return native(...args);});syncBuiltinESMExports();
 try{await assert.rejects(owner.readHostedBrowserCompanionSnapshot(write,[{path:name,sha256}]));assert.equal(changed,true);await assert.rejects(write('result.json',{}));}finally{mocked.mock.restore();syncBuiltinESMExports();}
});});

test('the snapshot bounds an opened file and rejects growth before returning its original digest',async context=>{const owner=await api();await fixture(context,async root=>{
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1}),path=join(folder(root,'community'),name),probe=await open(path,'r'),prototype=Object.getPrototypeOf(probe) as FileHandle;await probe.close();const native=prototype.read;let changed=false;
 const mocked=context.mock.method(prototype,'read',async function(this:FileHandle,...args:Parameters<FileHandle['read']>){if(!changed){changed=true;await writeFile(path,Buffer.alloc(1024*1024));}return native.apply(this,args);});
 try{await assert.rejects(owner.readHostedBrowserCompanionSnapshot(write,[{path:name,sha256}]));assert.equal(changed,true);await assert.rejects(write('result.json',{}));}finally{mocked.mock.restore();}
});});

test('the complete thirty-six command inventory is bounded and excludes fixed metadata companions',async context=>{const owner=await api();await fixture(context,async root=>{
 const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),entries:{path:string;sha256:string}[]=[];
 for(let index=1;index<=18;index++)for(const kind of ['intent','http']){const path=String(index).padStart(6,'0')+'.'+kind+'.json';entries.push({path,sha256:await write(path,{version:1,index,kind})});}
 await write('command-manifest.json',{version:1});await write('result.json',{version:1});assert.equal((await owner.readHostedBrowserCompanionSnapshot(write,entries)).size,36);
 const names=await owner.readHostedBrowserCompanionSnapshot(write,entries);assert.equal(names.has('result.json'),false);assert.equal(names.has('command-manifest.json'),false);
});});

test('overlapping snapshot reads or publishing latch refusal on both operations',async context=>{const owner=await api();
 for(const mode of ['read-read','read-publish','publish-read'])await fixture(context,async root=>{
  const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1}),entries=[{path:name,sha256}];
  const first=mode==='publish-read'?write('000002.intent.json',{version:2}):owner.readHostedBrowserCompanionSnapshot(write,entries);
  const second=mode==='read-publish'?write('000002.intent.json',{version:2}):owner.readHostedBrowserCompanionSnapshot(write,entries);
  const outcomes=await Promise.allSettled([first,second]);assert(outcomes.every(row=>row.status==='rejected'),mode);await assert.rejects(write('result.json',{}));
 });
});

test('learning companions retain original bytes and reject community prefix-only publication',async context=>{const owner=await api();
 for(const name of ['prefix-snapshot.json','prefix-proof.json'])await fixture(context,async root=>{
  const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'learning-loop',identity}),path='000001.intent.json',value={version:1,purpose:'CUEVO_HOSTED_LEARNING_LOOP_UI'},sha256=await write(path,value);
  assert.equal((await owner.readHostedBrowserCompanionSnapshot(write,[{path,sha256}])).get(path)!.toString(),canonicalReleaseExecutionJson(value));await assert.rejects(write(name,{}));await assert.rejects(readFile(join(folder(root),name)));
 });
});

test('snapshot refuses changed private directory mode or owner instead of adopting it as a new baseline',async context=>{const owner=await api();
 for(const kind of ['mode','uid'])for(const level of ['recipe','scope','run'])await fixture(context,async root=>{
  const write=await owner.createHostedBrowserCompanions({repoRoot:root,recipe:'community',identity}),name='000001.intent.json',sha256=await write(name,{version:1}),run=folder(root,'community'),target=level==='run'?run:level==='scope'?dirname(run):dirname(dirname(run)),native=fsPromises.lstat;
  const mocked=context.mock.method(fsPromises,'lstat',async(...args:Parameters<typeof fsPromises.lstat>)=>{const stat=await native(...args);return String(args[0])===target?Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,kind==='mode'?{mode:Number(stat.mode)^0o040}:{uid:Number(stat.uid)+1}):stat;});syncBuiltinESMExports();
  try{await assert.rejects(owner.readHostedBrowserCompanionSnapshot(write,[{path:name,sha256}]));await assert.rejects(write('result.json',{}));}finally{mocked.mock.restore();syncBuiltinESMExports();}
 });
});
