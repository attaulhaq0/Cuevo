import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('actual configured build CLI scopes backend and web without duplicating unrelated commands',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-build-scopes-'));
 try{
  await writeFile(join(root,'.env.local'),'NEXT_PUBLIC_API_URL=http://127.0.0.1:4000\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture\n');
  const callsPath=join(root,'calls.json'),hook=join(root,'transport.mjs');
  await writeFile(hook,`import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {writeFileSync} from 'node:fs';const calls=[];childProcess.spawnSync=(executable,args,options)=>{calls.push({executable,args,cwd:options.cwd,env:Object.fromEntries(['NODE_ENV','NEXT_TELEMETRY_DISABLED','NEXT_PUBLIC_API_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','NODE_OPTIONS'].filter(key=>options.env[key]!==undefined).map(key=>[key,options.env[key]]))});writeFileSync(process.env.CUEVO_TEST_BUILD_CALLS_PATH,JSON.stringify(calls));return{status:calls.length===Number(process.env.CUEVO_TEST_BUILD_FAILURE_INDEX)?1:0};};syncBuiltinESMExports();`);
  const run=(args:string[],failureIndex=0)=>spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(hook).href,resolve('scripts/verification/build-workspaces.ts'),...args],{cwd:root,encoding:'utf8',env:{...process.env,CUEVO_TEST_BUILD_CALLS_PATH:callsPath,CUEVO_TEST_BUILD_FAILURE_INDEX:String(failureIndex),SUPABASE_SERVICE_ROLE_KEY:'private-service-canary',OPENAI_API_KEY:'private-ai-canary',NODE_OPTIONS:'',NODE_ENV:'development'}});
  const callRows=async()=>JSON.parse(await readFile(callsPath,'utf8')) as {args:string[];cwd:string;env:Record<string,string>}[];
  const backend=run(['--scope=backend']);assert.equal(backend.status,0,backend.stderr);const backendCalls=await callRows();assert.equal(backendCalls.length,2,'backend must not build Next');assert.deepEqual(backendCalls.map(row=>row.args),[['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.build.json'],['node_modules/typescript/bin/tsc','-p','apps/worker/tsconfig.build.json']]);
  const web=run(['--scope=web']);assert.equal(web.status,0,web.stderr);const webCalls=await callRows();assert.equal(webCalls.length,1,'browser must not repeat server compiler checks');assert.deepEqual(webCalls[0].args,[resolve(root,'node_modules/next/dist/bin/next'),'build']);assert.equal(webCalls[0].cwd,resolve(root,'apps/web'));assert.deepEqual(webCalls[0].env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_API_URL:'http://127.0.0.1:4000',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:56321',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'});
  const complete=run([]);assert.equal(complete.status,0,complete.stderr);const completeCalls=await callRows();assert.equal(completeCalls.length,3,'default complete build retains both compiler configs and Next');assert.deepEqual(completeCalls.map(row=>row.args),[...backendCalls.map(row=>row.args),webCalls[0].args]);assert.deepEqual(completeCalls[2],webCalls[0],'default Next build retains the exact configured web environment');
  for(const args of [['--scope=backend','--scope=web'],['--scope=full'],['--skip=web']]){await rm(callsPath);const invalid=run(args);assert.notEqual(invalid.status,0);await assert.rejects(readFile(callsPath),{code:'ENOENT'});await writeFile(callsPath,'[]');}
  const failed=run(['--scope=backend'],1);assert.notEqual(failed.status,0);assert.equal((await callRows()).length,1,'failure stops before the next compiler command');
 }finally{await rm(root,{recursive:true,force:true});}
});
