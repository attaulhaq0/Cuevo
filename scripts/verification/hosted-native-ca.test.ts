import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fsPromises, { chmod, link, mkdir, mkdtemp, readFile, rename, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const bytes='-----BEGIN CERTIFICATE-----\nFixed synthetic certificate bytes\n-----END CERTIFICATE-----\n';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function api(){const value:Record<string,unknown>=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-native-ca.ts')).href).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;return{};});assert.equal(typeof value.prepareHostedNativeCa,'function','one private CA preparation owner is required');return value as typeof import('./hosted-native-ca');}
async function fixture(run:(directory:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'cuevo-native-ca-'));try{const directory=join(root,'private');await mkdir(directory,{mode:0o700});if(process.platform!=='win32')await chmod(directory,0o700);await run(directory);}finally{assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}}
const input=(directory:string)=>({directory,filename:'community-native-database-ca.pem' as const,bytes});

test('real CA preparation retains one opaque immutable reference and exact private bytes until retirement',async()=>{const owner=await api();await fixture(async directory=>{
 const held=await owner.prepareHostedNativeCa(input(directory));assert(Object.isFrozen(held));assert.deepEqual(Object.keys(held),[]);
 const admitted=await owner.consumeHostedNativeCa(held);assert.deepEqual(admitted,{path:join(directory,'community-native-database-ca.pem'),sha256:hash(bytes)});assert.equal(await readFile(admitted.path,'utf8'),bytes);
 await owner.retireHostedNativeCa(held);await assert.rejects(readFile(admitted.path));await assert.rejects(owner.consumeHostedNativeCa(held));await assert.rejects(owner.retireHostedNativeCa(held));
});});

test('fixed CA names remain isolated and existing files or unknown input cannot be overwritten',async()=>{const owner=await api();await fixture(async directory=>{
 const original=await owner.prepareHostedNativeCa(input(directory));const live=await owner.prepareHostedNativeCa({...input(directory),filename:'community-live-prefix-database-ca.pem'});assert.notEqual((await owner.consumeHostedNativeCa(original)).path,(await owner.consumeHostedNativeCa(live)).path);
 await assert.rejects(owner.prepareHostedNativeCa(input(directory)));assert.equal(await readFile(join(directory,'community-native-database-ca.pem'),'utf8'),bytes);
 for(const value of [{...input(directory),filename:'../outside.pem'},{...input(directory),bytes:''},{...input(directory),extra:true},{...input(directory),directory:'relative'}])await assert.rejects(owner.prepareHostedNativeCa(value as never));
 await owner.retireHostedNativeCa(original);await owner.retireHostedNativeCa(live);
});});

test('copied forged proxied or accessor CA references never execute traps or poison the genuine owner',async()=>{const owner=await api();await fixture(async directory=>{
 const held=await owner.prepareHostedNativeCa(input(directory));let traps=0;
 const proxy=new Proxy(held,{get(){traps++;throw Error('Trap');},ownKeys(){traps++;throw Error('Trap');}}),getter={get path(){traps++;return directory;}};
 for(const value of [{},{...held},Object.create(held),proxy,getter,null]){await assert.rejects(owner.consumeHostedNativeCa(value));await assert.rejects(owner.retireHostedNativeCa(value));}
 assert.equal(traps,0);assert.equal((await owner.consumeHostedNativeCa(held)).sha256,hash(bytes));await owner.retireHostedNativeCa(held);
});});

test('missing replaced linked modified and widened CA files revoke authority without deleting substitutions',async context=>{const owner=await api();
 for(const mode of ['missing','replacement','hardlink','bytes','metadata','mode'])await fixture(async directory=>{
  const held=await owner.prepareHostedNativeCa(input(directory)),path=(await owner.consumeHostedNativeCa(held)).path;
  if(mode==='missing')await rm(path);else if(mode==='replacement'){await rename(path,path+'.original');await writeFile(path,bytes,{mode:0o600});}else if(mode==='hardlink')await link(path,join(directory,'copy.pem'));else if(mode==='bytes')await writeFile(path,'changed');else if(mode==='metadata')await utimes(path,new Date('2020-01-01'),new Date('2020-01-01'));else await chmod(path,0o644);
  const native=fsPromises.lstat,mocked=mode==='mode'&&process.platform==='win32'?context.mock.method(fsPromises,'lstat',async(...args:Parameters<typeof fsPromises.lstat>)=>{const stat=await native(...args);return String(args[0])===path?Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{mode:Number(stat.mode)^0o040}):stat;}):undefined;syncBuiltinESMExports();
  try{await assert.rejects(owner.consumeHostedNativeCa(held));await assert.rejects(owner.retireHostedNativeCa(held));if(mode!=='missing')assert.equal((await readFile(path)).length>0,true);}finally{mocked?.mock.restore();syncBuiltinESMExports();}
 });
});

test('private directory replacement and owner or mode drift revoke CA retirement',async context=>{const owner=await api();
 for(const mode of ['replacement','mode','uid'])await fixture(async directory=>{
  const held=await owner.prepareHostedNativeCa(input(directory)),path=(await owner.consumeHostedNativeCa(held)).path,native=fsPromises.lstat;
  if(mode==='replacement'){await rename(directory,directory+'.original');await mkdir(directory,{mode:0o700});await writeFile(path,bytes,{mode:0o600});}
  const mocked=mode==='replacement'?undefined:context.mock.method(fsPromises,'lstat',async(...args:Parameters<typeof fsPromises.lstat>)=>{const stat=await native(...args);return String(args[0])===directory?Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,mode==='mode'?{mode:Number(stat.mode)^0o040}:{uid:Number(stat.uid)+1}):stat;});syncBuiltinESMExports();
  try{await assert.rejects(owner.retireHostedNativeCa(held));await assert.rejects(owner.retireHostedNativeCa(held));assert.equal(await readFile(path,'utf8'),bytes);}finally{mocked?.mock.restore();syncBuiltinESMExports();}
 });
});

test('CA read substitution and failed unlink cannot be retried or consume a changed file',async context=>{const owner=await api();
 for(const mode of ['read','unlink'])await fixture(async directory=>{
  const held=await owner.prepareHostedNativeCa(input(directory)),path=(await owner.consumeHostedNativeCa(held)).path;let calls=0;
  const mocked=mode==='unlink'?context.mock.method(fsPromises,'unlink',async(_path:string)=>{calls++;throw Error('Unknown unlink outcome');}):context.mock.method(fsPromises,'open',async(...args:Parameters<typeof fsPromises.open>)=>{calls++;await rename(path,path+'.original');await writeFile(path,bytes,{mode:0o600});return fsPromisesOpen(...args);});
  syncBuiltinESMExports();try{await assert.rejects(owner.retireHostedNativeCa(held));await assert.rejects(owner.retireHostedNativeCa(held));await assert.rejects(owner.consumeHostedNativeCa(held));assert.equal(calls,1);assert.equal(await readFile(path,'utf8'),bytes);}finally{mocked.mock.restore();syncBuiltinESMExports();}
 });
});
const fsPromisesOpen=fsPromises.open;

test('symlinked private ancestors cannot create a CA file',async context=>{const owner=await api();await fixture(async directory=>{
 const alias=directory+'-link';try{await symlink(directory,alias,'junction');}catch(error){if(process.platform==='win32'&&(error as NodeJS.ErrnoException).code==='EPERM'){context.skip('Host does not permit junction creation');return;}throw error;}
 await assert.rejects(owner.prepareHostedNativeCa({...input(directory),directory:alias}));await assert.rejects(readFile(join(directory,'community-native-database-ca.pem')));
});});

test('overlapping CA consumption and retirement revoke the original reference',async()=>{const owner=await api();await fixture(async directory=>{
 const held=await owner.prepareHostedNativeCa(input(directory)),first=owner.consumeHostedNativeCa(held),second=owner.retireHostedNativeCa(held);const outcomes=await Promise.allSettled([first,second]);assert(outcomes.every(row=>row.status==='rejected'));await assert.rejects(owner.retireHostedNativeCa(held));assert.equal(await readFile(join(directory,'community-native-database-ca.pem'),'utf8'),bytes);
});});

test('CA preparation creates only an absent final private directory under verified existing parents',async()=>{const owner=await api();await fixture(async parent=>{
 const directory=join(parent,'hosted-release');const held=await owner.prepareHostedNativeCa(input(directory)),certificate=await owner.consumeHostedNativeCa(held);
 assert.equal(certificate.path,join(directory,'community-native-database-ca.pem'));assert.equal(await readFile(certificate.path,'utf8'),bytes);await owner.retireHostedNativeCa(held);
 const missingParent=join(parent,'missing-parent','hosted-release');await assert.rejects(owner.prepareHostedNativeCa(input(missingParent)));await assert.rejects(readFile(join(missingParent,'community-native-database-ca.pem')));
});});

test('final directory creation rechecks original parents and refuses a substituted parent',async context=>{const owner=await api();await fixture(async parent=>{
 const directory=join(parent,'hosted-release'),native=fsPromises.mkdir;let replaced=false;
 const mocked=context.mock.method(fsPromises,'mkdir',async(...args:Parameters<typeof fsPromises.mkdir>)=>{if(String(args[0])===directory&&!replaced){replaced=true;await rename(parent,parent+'.retained');await native(parent,{mode:0o700});}return native(...args);});syncBuiltinESMExports();
 try{await assert.rejects(owner.prepareHostedNativeCa(input(directory)));assert.equal(replaced,true);await assert.rejects(readFile(join(directory,'community-native-database-ca.pem')));}finally{mocked.mock.restore();syncBuiltinESMExports();}
});});

test('retirement refuses a detectable pathname replacement at its final realpath check',async context=>{const owner=await api();await fixture(async directory=>{
 const held=await owner.prepareHostedNativeCa(input(directory)),path=(await owner.consumeHostedNativeCa(held)).path,native=fsPromises.realpath;let checks=0,replaced=false;
 const mocked=context.mock.method(fsPromises,'realpath',async(...args:Parameters<typeof fsPromises.realpath>)=>{const value=await native(...args);if(String(args[0])===path&&++checks===2){replaced=true;await rename(path,path+'.original');await writeFile(path,bytes,{mode:0o600});}return value;});syncBuiltinESMExports();
 try{await assert.rejects(owner.retireHostedNativeCa(held));assert.equal(replaced,true);assert.equal(await readFile(path,'utf8'),bytes);await assert.rejects(owner.retireHostedNativeCa(held));}finally{mocked.mock.restore();syncBuiltinESMExports();}
});});
