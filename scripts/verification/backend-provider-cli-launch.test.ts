import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,writeFile,lstat,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// The actual private CLI and physical-path function bodies run with real
// filesystem setup. Process execution and its Linux host are controlled only;
// this does not launch npm/Vercel or attest hosted deployment.
function cliBody(){
 const file=resolve(import.meta.dirname,'backend-provider-deploy.ts'),source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),functions=source.statements.filter(ts.isFunctionDeclaration).filter(node=>['apiCli','physical'].includes(node.name?.text??''));
 assert.equal(functions.length,2);const selected=functions.map(node=>node.getText(source)).join('\n')+'\napiCli;';return ts.transpileModule(selected,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
}

test('actual API CLI refuses expired admission after setup and copying immediately before deployment launch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-api-launch-'));
 try{
  const globalRoot=join(root,'controlled-global'),cliRoot=join(globalRoot,'vercel');await mkdir(join(root,'.local/hosted-release'),{recursive:true});await mkdir(join(cliRoot,'dist'),{recursive:true});await writeFile(join(cliRoot,'package.json'),JSON.stringify({name:'vercel',version:'62.1.0',bin:{vercel:'dist/index.js'}}));await writeFile(join(cliRoot,'dist/index.js'),'// Controlled pinned CLI fixture; never executed.\n');
  for(const mode of ['valid','expired','aborted'] as const){let now=1000,admissions=0,deployments=0,copied=false;const controller=new AbortController(),expires=2000,commands:string[][]=[];
   const execute=async(command:string,args:string[])=>{commands.push([command,...args]);if(command==='npm'){assert.deepEqual(Array.from(args),['root','--global']);return{stdout:globalRoot};}deployments++;assert.equal(command,'controlled-node');assert.ok(args.includes('deploy'));return{stdout:'https://cuevo-api-launch-fixture.vercel.app'};};
   const scopedWrite=async(path:Parameters<typeof writeFile>[0],bytes:Parameters<typeof writeFile>[1],options:Parameters<typeof writeFile>[2])=>{await writeFile(path,bytes,options);if(String(path).replaceAll('\\','/').endsWith('.vercel/project.json')){copied=true;if(mode==='expired')now=expires;if(mode==='aborted')controller.abort();}};
   const cli=runInNewContext(cliBody(),{execute,readFile,lstat,mkdir,writeFile:scopedWrite,realpath,resolve,join,relative,isAbsolute,randomUUID,process:{platform:'linux',execPath:'controlled-node',env:{}},failure:()=>Error('Controlled launch admission requires review.')}) as (...args:unknown[])=>Promise<string>;
   const artifact={sha256:'a'.repeat(64),files:[{path:'.vercel/output/config.json',bytes:Buffer.from('{"version":3}')},{path:'.vercel/output/functions/api/index.func/index.js',bytes:Buffer.from('export default 1;')}]} ,expected={releaseSha:'b'.repeat(40),targets:{api:{teamId:'team_Cuevo',projectId:'prj_Api'}}},admit=()=>{admissions++;assert.equal(copied,true,'all native setup/copies precede final admission');if(now>=expires)throw Error('Controlled approval expired.');};
   const pending=cli(root,artifact,expected,'private-vercel-canary','c'.repeat(64),controller.signal,admit);
   if(mode==='valid'){assert.equal(await pending,'https://cuevo-api-launch-fixture.vercel.app');assert.equal(deployments,1);}else{await assert.rejects(pending);assert.equal(deployments,0);}
   assert.equal(admissions,1);assert.equal(commands[0][0],'npm');assert.equal(copied,true);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
