import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,writeFile,lstat,realpath,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// The actual private CLI and physical-path function bodies run with real
// filesystem setup. Process execution and its Linux host are controlled only;
// this does not launch npm/Vercel or attest hosted deployment.
function cliBody(){
 const file=resolve(import.meta.dirname,'backend-provider-deploy.ts'),source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),functions=source.statements.filter(ts.isFunctionDeclaration).filter(node=>['apiCli','prepareApiCli','physical','file'].includes(node.name?.text??''));
 const selected=functions.map(node=>node.getText(source)).join('\n')+'\n({apiCli,prepare:typeof prepareApiCli==="undefined"?undefined:prepareApiCli});';return ts.transpileModule(selected,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
}

test('actual API CLI refuses expired admission after setup and copying immediately before deployment launch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-api-launch-'));
 try{
  const globalRoot=join(root,'controlled-global'),cliRoot=join(globalRoot,'vercel');await mkdir(join(root,'.local/hosted-release'),{recursive:true});await mkdir(join(cliRoot,'dist'),{recursive:true});await writeFile(join(cliRoot,'package.json'),JSON.stringify({name:'vercel',version:'62.1.0',bin:{vercel:'dist/index.js'}}));await writeFile(join(cliRoot,'dist/index.js'),'// Controlled pinned CLI fixture; never executed.\n');
  for(const mode of ['valid','expired','aborted'] as const){let now=1000,admissions=0,deployments=0,copied=false;const controller=new AbortController(),expires=2000,commands:string[][]=[];
   const execute=async(command:string,args:string[])=>{commands.push([command,...args]);if(command==='npm'){assert.deepEqual(Array.from(args),['root','--global']);return{stdout:globalRoot};}deployments++;assert.equal(command,'controlled-node');assert.ok(args.includes('deploy'));return{stdout:'https://cuevo-api-launch-fixture.vercel.app'};};
   const scopedWrite=async(path:Parameters<typeof writeFile>[0],bytes:Parameters<typeof writeFile>[1],options:Parameters<typeof writeFile>[2])=>{await writeFile(path,bytes,options);if(String(path).replaceAll('\\','/').endsWith('.vercel/project.json')){copied=true;if(mode==='expired')now=expires;if(mode==='aborted')controller.abort();}};
   const {apiCli:cli,prepare}=runInNewContext(cliBody(),{execute,readFile,lstat,mkdir,writeFile:scopedWrite,realpath,readdir,resolve,join,relative,isAbsolute,randomUUID,hash:(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),process:{platform:'linux',execPath:'controlled-node',env:{}},failure:()=>Error('Controlled launch admission requires review.')}) as {apiCli:(...args:unknown[])=>Promise<string>;prepare:(...args:unknown[])=>Promise<unknown>};
   const artifact={sha256:'a'.repeat(64),files:[{path:'.vercel/output/config.json',bytes:Buffer.from('{"version":3}')},{path:'.vercel/output/functions/api/index.func/index.js',bytes:Buffer.from('export default 1;')}]} ,expected={releaseSha:'b'.repeat(40),targets:{api:{teamId:'team_Cuevo',projectId:'prj_Api'}}},admit=async()=>{admissions++;assert.equal(copied,true,'all native setup/copies precede final admission');return()=>{if(now>=expires)throw Error('Controlled approval expired.');};};
   const prepared=await prepare(root,artifact,expected),pending=cli(prepared,expected,'private-vercel-canary','c'.repeat(64),controller.signal,admit);
   if(mode==='valid'){assert.equal(await pending,'https://cuevo-api-launch-fixture.vercel.app');assert.equal(deployments,1);}else{await assert.rejects(pending);assert.equal(deployments,0);}
   assert.equal(admissions,mode==='aborted'?0:1);assert.equal(commands[0][0],'npm');assert.equal(copied,true);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('actual API delivery completes delayed discovery and all copies before renewing live admission, then admits one launch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-api-preparation-'));
 try{
  const globalRoot=join(root,'global'),cliRoot=join(globalRoot,'vercel');await mkdir(join(root,'.local/hosted-release'),{recursive:true});await mkdir(join(cliRoot,'dist'),{recursive:true});await writeFile(join(cliRoot,'package.json'),JSON.stringify({name:'vercel',version:'62.1.0',bin:{vercel:'dist/index.js'}}));await writeFile(join(cliRoot,'dist/index.js'),'// Controlled CLI never executed.\n');
  let now=1000,preparedAt=0,admittedAt=0,deployments=0,copies=0;const execute=async(command:string,args:string[])=>{if(command==='npm'){now+=16000;return{stdout:globalRoot};}assert.equal(command,'controlled-node');assert.ok(args.includes('--prebuilt'));assert.equal(now-admittedAt,1500,'only retained final input checks consume the current cohort');assert.ok(30000-(now-admittedAt)>=6000,'retained checks leave the unchanged modeled capacity margin');deployments++;return{stdout:'https://cuevo-api-prepared.vercel.app'};};
  const scopedWrite=async(path:Parameters<typeof writeFile>[0],bytes:Parameters<typeof writeFile>[1],options:Parameters<typeof writeFile>[2])=>{await writeFile(path,bytes,options);now+=2000;copies++;};
  const scopedRead=async(...args:Parameters<typeof readFile>)=>{const bytes=await readFile(...args);if(admittedAt)now+=100;return bytes;};const subject=runInNewContext(cliBody(),{execute,readFile:scopedRead,lstat,mkdir,writeFile:scopedWrite,realpath,readdir,resolve,join,relative,isAbsolute,randomUUID,hash:(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),process:{platform:'linux',execPath:'controlled-node',env:{}},failure:()=>Error('Controlled launch admission requires review.')}) as {prepare?:(...args:unknown[])=>Promise<unknown>;apiCli:(...args:unknown[])=>Promise<string>};
  const files=Array.from({length:12},(_,index)=>({path:'.vercel/output/static/file-'+index+'.txt',bytes:Buffer.from('locked-'+index)})),artifact={sha256:'a'.repeat(64),files},expected={releaseSha:'b'.repeat(40),targets:{api:{teamId:'team_Cuevo',projectId:'prj_Api'}}};
  assert.equal(typeof subject.prepare,'function','real API preparation must finish independently before live admission');
  const prepared=await subject.prepare!(root,artifact,expected);preparedAt=now;assert.ok(preparedAt-1000>30000,'modeled setup exceeds the unchanged native lifetime');assert.equal(deployments,0);assert.equal(copies,13);
  const admit=async()=>{await Promise.resolve();admittedAt=now;return()=>{assert.ok(now-admittedAt<30000);};};
  assert.equal(await subject.apiCli(prepared,expected,'private-canary','c'.repeat(64),new AbortController().signal,admit),'https://cuevo-api-prepared.vercel.app');assert.equal(deployments,1);assert.equal(copies,13,'launch must not rematerialize delivery');
  await assert.rejects(subject.apiCli(prepared,expected,'private-canary','c'.repeat(64),new AbortController().signal,admit));assert.equal(deployments,1,'prepared execution is one-attempt');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('prepared API refuses changed delivery configuration bytes inventory executable recipients and final authority without a launch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-api-integrity-'));
 try{
  const globalRoot=join(root,'global'),cliRoot=join(globalRoot,'vercel'),packagePath=join(cliRoot,'package.json'),cliPath=join(cliRoot,'dist/index.js'),packageBytes=JSON.stringify({name:'vercel',version:'62.1.0',bin:{vercel:'dist/index.js'}});await mkdir(join(root,'.local/hosted-release'),{recursive:true});await mkdir(join(cliRoot,'dist'),{recursive:true});
  for(const mode of ['file','extra','project','executable','package','source','target','lease','expiry','aborted','renewal-file','renewal-executable','renewal-target','final-check-expiry']as const){
   await writeFile(packagePath,packageBytes);await writeFile(cliPath,'// Controlled original executable.\n');let delivery='',deployments=0,admissions=0;const execute=async(command:string)=>{if(command==='npm')return{stdout:globalRoot};deployments++;return{stdout:'https://cuevo-integrity.vercel.app'};};
   const scopedWrite=async(path:Parameters<typeof writeFile>[0],bytes:Parameters<typeof writeFile>[1],options:Parameters<typeof writeFile>[2])=>{await writeFile(path,bytes,options);if(String(path).replaceAll('\\','/').endsWith('.vercel/project.json'))delivery=resolve(String(path),'../..');};
   let expired=false;const scopedRead=async(...args:Parameters<typeof readFile>)=>{const bytes=await readFile(...args);if(mode==='final-check-expiry'&&admissions)expired=true;return bytes;};const subject=runInNewContext(cliBody(),{execute,readFile:scopedRead,lstat,mkdir,writeFile:scopedWrite,realpath,readdir,resolve,join,relative,isAbsolute,randomUUID,hash:(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),process:{platform:'linux',execPath:'controlled-node',env:{}},failure:()=>Error('Controlled launch refused.')})as{prepare:(...args:unknown[])=>Promise<unknown>;apiCli:(...args:unknown[])=>Promise<string>};
   const artifact={sha256:'a'.repeat(64),files:[{path:'.vercel/output/config.json',bytes:Buffer.from('{"version":3}')}]},expected={releaseSha:'b'.repeat(40),targets:{api:{teamId:'team_Cuevo',projectId:'prj_Api'}}},selected=structuredClone(expected),prepared=await subject.prepare(root,artifact,expected),controller=new AbortController();
   if(mode==='file')await writeFile(join(delivery,'.vercel/output/config.json'),'{"version":4}');if(mode==='extra')await writeFile(join(delivery,'unexpected.txt'),'unexpected');if(mode==='project')await writeFile(join(delivery,'.vercel/project.json'),'{}');if(mode==='executable')await writeFile(cliPath,'// substituted executable');if(mode==='package')await writeFile(packagePath,'{}');if(mode==='source')selected.releaseSha='c'.repeat(40);if(mode==='target')selected.targets.api.projectId='prj_Foreign';if(mode==='aborted')controller.abort();
   await assert.rejects(subject.apiCli(prepared,selected,'private-canary','c'.repeat(64),controller.signal,async()=>{admissions++;if(mode==='renewal-file')await writeFile(join(delivery,'.vercel/output/config.json'),'changed during admission');if(mode==='renewal-executable')await writeFile(cliPath,'changed during admission');if(mode==='renewal-target')selected.targets.api.projectId='prj_Foreign';return()=>{if(mode==='lease'||mode==='expiry'||expired)throw Error('Controlled current authority refused.');};}));assert.equal(deployments,0,mode);assert.equal(admissions,['lease','expiry','renewal-file','renewal-executable','renewal-target','final-check-expiry'].includes(mode)?1:0,mode+' should refuse at its own boundary');
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
