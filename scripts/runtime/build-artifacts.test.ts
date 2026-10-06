import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { buildRuntimeArtifact } from './build-artifacts';

test('prebuilt Vercel output contains one raw Node function, pinned installed dependencies and no static assets', async () => {
  const artifact = await buildRuntimeArtifact('api-vercel');
  const directory = resolve('.local/runtime-artifacts/api-vercel');
  const output = join(directory, '.vercel/output');
  const functionRoot = join(output, 'functions/api/index.func');
  assert.deepEqual(await readdir(output), ['config.json', 'functions']);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'config.json'), 'utf8')), { version: 3, routes: [{ src: '/(.*)', dest: '/api/index' }] });
  assert.deepEqual(JSON.parse(await readFile(join(functionRoot, '.vc-config.json'), 'utf8')), { runtime: 'nodejs24.x', handler: 'api/index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, shouldAddSourcemapSupport: false, supportsResponseStreaming: true, maxDuration: 60 });
  const lock = JSON.parse(await readFile(join(functionRoot, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string }> };
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert.equal(JSON.parse(await readFile(join(functionRoot, path, 'package.json'), 'utf8')).version, entry.version);
  }
  assert.ok(artifact.files.some(file => file.path.includes('/node_modules/pg/lib/index.js')));
  for (const file of artifact.files.filter(file => file.path.startsWith('.vercel/output/'))) assert.equal(createHash('sha256').update(await readFile(join(directory, file.path))).digest('hex'), file.sha256);
});

test('compiled API function imports without a listener and preserves actual denied routes and source-locked packs', async () => {
  const artifact = await buildRuntimeArtifact('api-vercel');
  const directory = resolve('.local/runtime-artifacts/api-vercel');
  assert.equal(artifact.delivery, 'vercel-node-function'); assert.equal(artifact.entrypoint, 'api/index.mjs');
  assert.equal(Object.hasOwn(artifact, 'start'), false);
  const packageJson = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; dependencies: Record<string, string> };
  assert.equal(packageJson.scripts, undefined);
  assert.equal(Object.keys(packageJson.dependencies).some(name => name.startsWith('@cuevo/') || ['tsx', 'typescript', 'vitest', 'esbuild'].includes(name)), false);
  assert.deepEqual(await readdir(join(directory, 'public')), []);
  const configuration = JSON.parse(await readFile(join(directory, 'vercel.json'), 'utf8'));
  assert.deepEqual(configuration.rewrites, [{ source: '/:path*', destination: '/api/index' }]);
  assert.equal(configuration.outputDirectory, 'public'); assert.deepEqual(configuration.functions['api/index.mjs'].includeFiles, ['supabase/seed/curriculum/**','pedagogy/**']);
  assert.ok(artifact.sources.some(source => source.path === 'apps/api/src/serverless.ts'));
  assert.equal(artifact.sources.some(source => source.path === 'apps/api/src/main.ts'), false);
  const packFiles = artifact.files.filter(file => file.path.startsWith('supabase/seed/curriculum/'));
  assert.ok(packFiles.length >= 12);
  for (const file of artifact.files) assert.equal(createHash('sha256').update(await readFile(join(directory, file.path))).digest('hex'), file.sha256);
  for (const file of packFiles) assert.equal(await readFile(join(directory, file.path), 'utf8'), await readFile(file.path, 'utf8'));
  assert.equal(artifact.files.filter(file => !file.path.includes('/node_modules/')).some(file => /(?:identities|seed\.sql|\.env|\/test\/|README)/.test(file.path)), false);
  const functionRoot = join(directory, '.vercel/output/functions/api/index.func');
  const script = `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(pathToFileURL(join(functionRoot, artifact.entrypoint)).href)});
    assert.ok(require.resolve('@nestjs/core').startsWith(${JSON.stringify(functionRoot)}));
    const runtime = await import(${JSON.stringify(pathToFileURL(join(functionRoot, artifact.entrypoint)).href)});
    assert.equal(typeof runtime.default, 'function'); assert.equal(runtime.config.api.bodyParser, false);
    const server = createServer((request, response) => { void runtime.default(request, response); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = 'http://127.0.0.1:' + server.address().port;
      const live = await fetch(url + '/health/live'); assert.equal(live.status, 200); assert.equal((await live.json()).service, 'cuevo-api');
      const ready = await fetch(url + '/health/ready'); assert.equal(ready.status, 503); assert.equal(ready.headers.get('cache-control'), 'no-store');
      const denied = await fetch(url + '/v1/me'); assert.equal(denied.status, 401); assert.equal((await denied.json()).code, 'AUTHENTICATION_REQUIRED');
    } finally { await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: functionRoot, env: { NODE_ENV: 'test', PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.ok(createRequire(pathToFileURL(join(functionRoot, artifact.entrypoint))).resolve('@nestjs/core').startsWith(functionRoot));
});

test('compiled API private pack root stays relative to its artifact despite an unrelated process cwd', async () => {
  const parent = resolve('.local/runtime-pack-probes'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'probe-')); const emitted = join(directory, 'api/packs.mjs');
  try {
    await cp(resolve('supabase/seed/curriculum/synthetic-primary-v1'), join(directory, 'supabase/seed/curriculum/synthetic-primary-v1'), { recursive: true });
    await build({ entryPoints: [resolve('apps/api/src/modules/curriculum/packs.ts')], outfile: emitted, bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external', define: { CUEVO_LOCKED_PACK_ROOT_URL: JSON.stringify('../supabase/seed/curriculum/') }, alias: { '@cuevo/domain': resolve('packages/domain/src/index.ts'), '@cuevo/contracts': resolve('packages/contracts/src/index.ts') } });
    const invoke = (failure: boolean) => {
      const script = `import assert from 'node:assert/strict'; const {loadRuntimeLockedPack}=await import(${JSON.stringify(pathToFileURL(emitted).href)}); ${failure ? "await assert.rejects(loadRuntimeLockedPack('synthetic-primary-v1'), {code:'CURRICULUM_REQUIRES_REVIEW'});" : "const pack=await loadRuntimeLockedPack('synthetic-primary-v1'); assert.equal(pack.pack.version,'synthetic-1'); assert.equal(pack.assessment.numeric.maxScore,10); assert.deepEqual(pack.assessment.models,['numeric','rubric']); await assert.rejects(loadRuntimeLockedPack('../outside'), {code:'CURRICULUM_REQUIRES_REVIEW'});"}`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: resolve('apps/web'), env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
    };
    invoke(false);
    const assessmentPath = join(directory, 'supabase/seed/curriculum/synthetic-primary-v1/assessment.json');
    await writeFile(assessmentPath, (await readFile(assessmentPath, 'utf8')).replace('10', '11'));
    invoke(true);
  } finally {
    assert.equal(resolve(directory, '..'), parent); await rm(directory, { recursive: true, force: true });
  }
});

test('Node and Vercel artifacts retain the private reviewed catalogue and resolve it independently of cwd', async () => {
  const source=await readFile(resolve('apps/api/src/modules/curriculum/pedagogy/revised-bloom-v1.json'));
  const manifest=JSON.parse(await readFile(resolve('apps/api/src/modules/curriculum/pedagogy/manifest.json'),'utf8'));
  assert.equal(createHash('sha256').update(source).digest('hex'),manifest.files['revised-bloom-v1.json']);
  for(const target of ['api','api-vercel']as const){
    const artifact=await buildRuntimeArtifact(target),directory=resolve('.local/runtime-artifacts',target);
    const expected=artifact.files.filter(file=>file.path==='pedagogy/revised-bloom-v1.json');
    assert.equal(expected.length,1);assert.equal(expected[0]!.sha256,manifest.files['revised-bloom-v1.json']);
    assert.deepEqual(await readFile(join(directory,expected[0]!.path)),source);
    const privateRoot=target==='api-vercel'?join(directory,'.vercel/output/functions/api/index.func'):directory;
    assert.deepEqual(await readFile(join(privateRoot,'pedagogy/revised-bloom-v1.json')),source);
    if(target==='api-vercel'){assert.deepEqual(await readdir(join(directory,'public')),[]);assert.equal(artifact.files.some(file=>file.path.includes('/static/')&&file.path.includes('pedagogy')),false);}
    const probe=join(privateRoot,target==='api-vercel'?'api/catalogue-probe.mjs':'catalogue-probe.mjs');
    await build({entryPoints:[resolve('apps/api/src/modules/curriculum/pedagogy/catalogue.ts')],outfile:probe,bundle:true,platform:'node',target:'node24',format:'esm',packages:'external',define:{CUEVO_PEDAGOGY_CATALOGUE_URL:JSON.stringify(target==='api-vercel'?'../pedagogy/revised-bloom-v1.json':'./pedagogy/revised-bloom-v1.json')},alias:{'@cuevo/domain':resolve('packages/domain/src/index.ts'),'@cuevo/contracts':resolve('packages/contracts/src/index.ts')}});
    const invoke=(tampered:boolean)=>{
      const script=`import assert from 'node:assert/strict';const{getThinkingFocusCatalogue}=await import(${JSON.stringify(pathToFileURL(probe).href)});${tampered?"assert.throws(getThinkingFocusCatalogue,{code:'THINKING_FOCUS_SOURCE_REQUIRES_REVIEW'});":"const catalogue=getThinkingFocusCatalogue();assert.equal(catalogue.taxonomyVersion,'revised-bloom-2001-cuevo-v1');assert.equal(catalogue.processes.length,6);assert.equal(catalogue.interpretation,'TASK_DEMAND_NOT_LEARNER_LEVEL');"}`;
      const child=spawnSync(process.execPath,['--input-type=module','--eval',script],{cwd:resolve('apps/web'),env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot},encoding:'utf8',timeout:10000});
      assert.equal(child.status,0,child.stderr);
    };
    try{invoke(false);await writeFile(join(privateRoot,'pedagogy/revised-bloom-v1.json'),Buffer.concat([source,Buffer.from('\n')]));invoke(true);}
    finally{await writeFile(join(privateRoot,'pedagogy/revised-bloom-v1.json'),source);await rm(probe,{force:true});}
  }
});
