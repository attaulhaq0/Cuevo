import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

test('isolated backend and browser lanes retain exact complete selected scope and cannot become full acceptance alone',async()=>{
 const subject=await import('./runtime-lanes');
 assert.deepEqual(subject.readTechnicalRequest(['--profile=ci','--lane=backend']),{profile:'ci',lane:'backend'});
 for(const args of [['--profile=full','--lane=backend'],['--lane=browser'],['--profile=ci','--lane=other']])assert.throws(()=>subject.readTechnicalRequest(args));
 for(const profile of ['routine','full-runtime','main-staging'] as const){
  const backend:string[]=subject.runtimeLaneSteps(profile,'backend').map(row=>row.name),browser:string[]=subject.runtimeLaneSteps(profile,'browser').map(row=>row.name);
  assert.ok(backend.includes('database'));assert.ok(backend.includes('edge-runtime'));assert.equal(backend.includes('critical-browser'),false);
  for(const step of ['clean-browser-seed','build','critical-browser','demo-seed-restore'])assert.ok(browser.includes(step));
  assert.equal(browser.includes('database'),false);assert.equal(browser.includes('integration'),false);
 }
});

test('actual aggregate consumes only bounded same-attempt JSON and refuses private or missing artifact files',async()=>{
 const subject=await import('./runtime-lanes'),root=await mkdtemp(join(tmpdir(),'cuevo-lane-aggregate-'));
 try{
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();await writeFile(join(root,'README.md'),'Frozen lane source\n');await writeFile(join(root,'.gitignore'),'.local/\n');git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','source');
  const sha=git('rev-parse','HEAD'),manifest=git('ls-files').split('\n').map(path=>({path,sha256:createHash('sha256').update(path==='README.md'?'Frozen lane source\n':'.local/\n').digest('hex')}));
  const {routineBrowserFiles}=await import('./verification-profiles');
  const common={repository:'owner/repo',sourceSha:sha,treeSha:git('rev-parse','HEAD^{tree}'),sourceDigest:createHash('sha256').update(JSON.stringify(manifest.sort((a,b)=>a.path.localeCompare(b.path)))).digest('hex'),githubRunId:'31',runAttempt:2,profile:'full-runtime' as const,browserFiles:routineBrowserFiles};
  for(const lane of ['backend','browser'] as const){await mkdir(join(root,'.local/runtime-lane-inputs',lane),{recursive:true});await writeFile(join(root,'.local/runtime-lane-inputs',lane,'lane.json'),JSON.stringify(subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps(common.profile,lane).map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]})));}
  const run=()=>spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,resolve('scripts/verification/runtime-lane-aggregate.ts')],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'true',CI:'true',GITHUB_JOB:'technical-mvp',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:sha,GITHUB_RUN_ID:'31',GITHUB_RUN_ATTEMPT:'2'}});
  const first=run();assert.equal(first.status,0,first.stderr);
  for(const mutation of ['tracked','untracked']){
   const hook=join(root,'.local','source-mutation.mjs');await writeFile(hook,`import {registerHooks} from 'node:module';import {writeFileSync} from 'node:fs';registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/runtime-lane-aggregate.ts'))return{...result,source:String(result.source).replace('const expected={',${JSON.stringify(`await import('node:fs/promises').then(fs=>fs.writeFile(${JSON.stringify(mutation==='tracked'?'README.md':'late-source.ts')},'Changed after lane reads\\n'));const expected={`)})};return result;}});`);
   const changed=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(hook).href,resolve('scripts/verification/runtime-lane-aggregate.ts')],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'true',CI:'true',GITHUB_JOB:'technical-mvp',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:sha,GITHUB_RUN_ID:'31',GITHUB_RUN_ATTEMPT:'2'}});
   assert.notEqual(changed.status,0,mutation);assert.doesNotMatch(changed.stdout,/Combined exact/);
   if(mutation==='tracked')await writeFile(join(root,'README.md'),'Frozen lane source\n');else await rm(join(root,'late-source.ts'));
  }
  await writeFile(join(root,'.local/runtime-lane-inputs/backend/private.txt'),'forbidden');assert.notEqual(run().status,0);await rm(join(root,'.local/runtime-lane-inputs/backend/private.txt'));await rm(join(root,'.local/runtime-lane-inputs/browser/lane.json'));assert.notEqual(run().status,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('runtime aggregate refuses missing failed foreign attempt source scope and substituted required lane rows',async()=>{
 const subject=await import('./runtime-lanes');
 const common={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'routine' as const,browserFiles:['foundation.spec.ts','role-home.spec.ts','role-accessibility.spec.ts','hydration-diagnostics.spec.ts','learning-lifecycle.spec.ts','customer-browser-learning-loop.spec.ts','customer-command-scope.spec.ts']};
 const receipt=(lane:'backend'|'browser')=>subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps('routine',lane).map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]});
 const backend=receipt('backend'),browser=receipt('browser');
 const combined=subject.combineRuntimeLanes([backend,browser],common);assert.equal(combined.status,'ROUTINE_VERIFIED');assert.ok(combined.rows.some(row=>row.name==='critical-browser'));
 assert.equal(backend.status,'LANE_VERIFIED');assert.notEqual(backend.status,'VERIFIED');
 for(const change of ['missing','attempt','source','rows','failed','private','duplicate']){
  const values=[structuredClone(backend),structuredClone(browser)] as Record<string,unknown>[];
  if(change==='missing')values.pop();if(change==='attempt')values[1].runAttempt=3;if(change==='source')values[1].sourceDigest='d'.repeat(64);
  if(change==='rows')(values[1].rows as unknown[]).pop();if(change==='failed')(values[1].rows as {exitCode:number}[])[0].exitCode=1;
  if(change==='private')values[1].rawConsole='private';if(change==='duplicate')values[1]=values[0];
  assert.throws(()=>subject.combineRuntimeLanes(values,common),change);
 }
});
