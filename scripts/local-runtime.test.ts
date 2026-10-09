import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, createRuntimeUrls } from './configure-local';
import { replayPlan } from './database/replay-plan';

test('the actual Cuevo config authorizes the advertised local target', () => {
  assert.doesNotThrow(() => assertCuevoLocalConfig(readFileSync('supabase/config.toml', 'utf8')));
});
test('bootstrap refuses another project or Supabase port before service actions', () => {
  const valid = 'project_id = "cuevo"\n[api]\nport = 56321\n[db]\nport = 56322\n';
  for (const config of [valid.replace('"cuevo"', '"other"'), valid.replace('56321', '54321'), valid.replace('56322', '54322')]) {
    assert.throws(() => assertCuevoLocalConfig(config));
  }
});
test('container URLs retain constrained runtime roles and host URLs remain loopback', () => {
  const urls = createRuntimeUrls({ API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:56322/postgres' }, { api: 'synthetic-api', worker: 'synthetic-worker' });
  assert.equal(new URL(urls.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(urls.DOCKER_DATABASE_URL).hostname, 'host.docker.internal');
  assert.equal(new URL(urls.DOCKER_DATABASE_URL).username, 'cuevo_api');
  assert.equal(new URL(urls.DOCKER_WORKER_DATABASE_URL).username, 'cuevo_worker');
  assert.equal(urls.DOCKER_SUPABASE_URL, 'http://host.docker.internal:56321');
});
test('local credential provisioning rejects remote hosts and legacy project ports', () => {
  const valid = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:56322/postgres' };
  for (const target of [
    { ...valid, API_URL: 'https://remote.supabase.co' },
    { ...valid, API_URL: 'http://localhost:54321' },
    { ...valid, DB_URL: 'postgresql://postgres:synthetic@remote.example:56322/postgres' },
    { ...valid, DB_URL: 'postgresql://postgres:synthetic@localhost:54322/postgres' },
  ]) assert.throws(() => assertCuevoLocalTarget(target));
});

// Execute the actual bootstrap/start/reset owners in isolated child processes.
// Only external process/PostgreSQL transport and the unrelated seed runners are intercepted.
async function bootstrapFixture(scenario = 'none') {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-bootstrap-reuse-'));
  const ownerRoot = resolve(import.meta.dirname, '..');
  const fixtureProject = 'cuevo-bootstrap-' + root.split(/[\\/]/).at(-1)!.slice(-6).toLowerCase();
  const fixtureApiPort = '61421', fixtureDbPort = '61422';
  const files = readdirSync(join(ownerRoot, 'supabase/migrations')).filter(name => name.endsWith('.sql'));
  const sources = files.map(name => ({ name, bytes: readFileSync(join(ownerRoot, 'supabase/migrations', name)) }));
  const plan = replayPlan(sources);
  try {
    for (const path of ['scripts/database', 'supabase/migrations', 'supabase/seed']) await mkdir(join(root, path), { recursive: true });
    for (const path of ['scripts/bootstrap-local.ts', 'scripts/start-supabase.ts', 'scripts/database/reset-local.ts', 'scripts/database/replay-workdir.ts', 'scripts/database/replay-plan.ts', 'scripts/configure-local.ts']) {
      await writeFile(join(root, path), await readFile(join(ownerRoot, path)));
    }
    for (const file of sources) await writeFile(join(root, 'supabase/migrations', file.name), file.bytes);
    const fixtureConfig = (await readFile(join(ownerRoot, 'supabase/config.toml'), 'utf8')).replace('project_id = "cuevo"', `project_id = "${fixtureProject}"`).replaceAll('56321', fixtureApiPort).replaceAll('56322', fixtureDbPort);
    await writeFile(join(root, 'supabase/config.toml'), fixtureConfig);
    await writeFile(join(root, 'supabase/seed/seed.sql'), 'select 1; -- synthetic fixture seed');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    const mutationName = files.find(name => ![...plan.before.slice(-1), plan.prerequisite, '20261001211007_intelligence_frozen_policy_reasoning.sql'].includes(name))!;
    const preload = `
import { registerHooks } from 'node:module';
import { execFileSync as actualExec } from 'node:child_process';
import * as fs from 'node:fs';
import * as promises from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from ${JSON.stringify(pathToFileURL(join(ownerRoot, 'node_modules/esbuild/lib/main.js')).href)};
const root=${JSON.stringify(root)}, scenario=${JSON.stringify(scenario)}, mutationName=${JSON.stringify(mutationName)};
const fixtureProject=${JSON.stringify(fixtureProject)}, fixtureApiPort=${JSON.stringify(fixtureApiPort)}, fixtureDbPort=${JSON.stringify(fixtureDbPort)};
const log = value => fs.appendFileSync(resolve(root, 'events.jsonl'), JSON.stringify(value)+'\\n');
const mutate = kind => {
  if(kind==='config') fs.appendFileSync(resolve(root,'supabase/config.toml'),'\\n# changed during bootstrap\\n');
  else if(kind==='staged'||kind==='prerequisite') {
    const replay=fs.readdirSync(resolve(root,'.local/migration-replay'))[0];
    fs.appendFileSync(resolve(root,'.local/migration-replay',replay,(kind==='prerequisite'?'prerequisite':'prefix')+'/supabase/migrations',mutationName),'\\n-- changed staged source\\n');
  } else fs.appendFileSync(resolve(root,'supabase/migrations',mutationName),'\\n-- changed during bootstrap\\n');
};
const safeChildEnv={TEMP:process.env.TEMP,TMP:process.env.TMP,SystemRoot:process.env.SystemRoot,PATH:process.env.PATH};
globalThis.bootstrapTransport={
  fs:promises,
  readFile: async(path,...args)=>{if(String(path).replaceAll('\\\\','/').startsWith(root.replaceAll('\\\\','/')+'/supabase/migrations/'))log({kind:'preparation-source-read'});return promises.readFile(path,...args);},
  writeFile: async(path,...args)=>{if(String(path).replaceAll('\\\\','/').match(/\\/(prefix|prerequisite)\\/supabase\\/migrations\\//))log({kind:'prepared-sql-write'});return promises.writeFile(path,...args);},
  prepared:()=>log({kind:'prepared'}),
  exec:(executable,args,options)=>{
    if(executable==='docker'&&JSON.stringify(args)===JSON.stringify(['network','inspect','cuevo-local'])) {log({kind:'network',args});return '';}
    if(executable!==process.execPath)throw Error('Unrecognized fixture executable refused');
    const cli=resolve(root,'node_modules/supabase/dist/supabase.js');
    if(args[0]===cli&&JSON.stringify(args.slice(1))===JSON.stringify(['status','-o','json'])){log({kind:'status'});return JSON.stringify({API_URL:'http://127.0.0.1:'+fixtureApiPort,DB_URL:'postgresql://postgres:synthetic@127.0.0.1:'+fixtureDbPort+'/postgres'});}
    if(args[0]===cli&&[['start'],['db','reset'],['migration','up']].some(prefix=>prefix.every((value,index)=>args[index+1]===value))&&args.includes('--network-id')&&args[args.indexOf('--network-id')+1]==='cuevo-local') {
      const action=args[1]==='db'?'reset':args[1]==='migration'?'up':args[1];
      log({kind:'cli',action,args});
      if(action==='start'&&scenario.startsWith('after-start-')&&!scenario.includes('unused-')) mutate(scenario.slice(12));
      if(action==='reset'&&scenario==='after-reset-staged') mutate('prerequisite');
      if(action==='reset'&&scenario==='after-reset-unused-prefix') mutate('staged');
      if(action==='start'&&scenario==='after-start-unused-prerequisite') mutate('prerequisite');
      return '';
    }
    const script=args.find(arg=>arg.endsWith('.ts'))?.replaceAll('\\\\','/');
    if([resolve(root,'scripts/start-supabase.ts'),resolve(root,'scripts/database/reset-local.ts')].map(path=>path.replaceAll('\\\\','/')).includes(script)&&JSON.stringify(args.slice(0,2))===JSON.stringify(['--import','tsx']))return actualExec(executable,['--import',pathToFileURL(resolve(root,'preload.mjs')).href,args[2]],{...options,env:safeChildEnv});
    if(script&&['scripts/database/harden-local-worker-transport.ts','scripts/configure-local.ts','scripts/seed-auth.ts','scripts/seed-reference-scenarios.ts','scripts/runtime/drain-local-reference.ts'].map(name=>resolve(root,name).replaceAll('\\\\','/')).includes(script)){log({kind:'later-runner',script});return '';}
    throw Error('Unrecognized fixture subprocess refused');
  },
  Pool:class {
    async query(sql){
      if(sql.includes('select version from'))return {rows:fs.readdirSync(resolve(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort().map(name=>({version:name.slice(0,14)}))};
      if(sql.includes('check_function_bodies')){if(scenario==='during-validation-await')mutate('source');return {rows:[{ready:true}]};}
      log({kind:'seed'});return {rows:[]};
    }
    async end(){log({kind:'pool-end'});}
  }
};
registerHooks({resolve(specifier,context,next){if(specifier==='fixture:bootstrap-fs'||specifier==='fixture:bootstrap-process'||specifier==='fixture:bootstrap-pg')return {url:specifier,shortCircuit:true};if(specifier.startsWith('.')&&context.parentURL&&context.parentURL.includes('/scripts/')&&!specifier.endsWith('.ts'))return {url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};return next(specifier,context);},load(url,context,next){
  if(url==='fixture:bootstrap-process')return {format:'module',shortCircuit:true,source:'export const execFileSync=globalThis.bootstrapTransport.exec;'};
  if(url==='fixture:bootstrap-pg')return {format:'module',shortCircuit:true,source:'export const Pool=globalThis.bootstrapTransport.Pool;'};
  if(url.includes('/node_modules/pg/'))return {format:'module',shortCircuit:true,source:'export const Pool=globalThis.bootstrapTransport.Pool;'};
  if(url==='fixture:bootstrap-fs')return {format:'module',shortCircuit:true,source:'export const {mkdir,mkdtemp,readdir}=globalThis.bootstrapTransport.fs; export const writeFile=globalThis.bootstrapTransport.writeFile; export const readFile=globalThis.bootstrapTransport.readFile;'};
  if(url.endsWith('.ts')&&url.includes('/scripts/')){
    let source=fs.readFileSync(new URL(url),'utf8').replaceAll("'node:child_process'","'fixture:bootstrap-process'").replaceAll("'pg'","'fixture:bootstrap-pg'");
    // The transport fixture's physical project is unique. Original target guards are separately
    // exercised above; this child changes only their fixed synthetic project/port constants.
    if(url.endsWith('/configure-local.ts'))source=source.replaceAll('"cuevo"','"'+fixtureProject+'"').replaceAll('56321',fixtureApiPort).replaceAll('56322',fixtureDbPort);
    if(url.endsWith('/replay-workdir.ts')) source=source.replaceAll("'node:fs/promises'","'fixture:bootstrap-fs'").replace(/export async function createReplayWorkdirs\\(\\)\\s*\\{/,'export async function createReplayWorkdirs(){globalThis.bootstrapTransport.prepared();');
    return {format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};
  }
  return next(url,context);
}});
`;
    await writeFile(join(root, 'preload.mjs'), preload);
  if (scenario === 'unknown-command') {
      const probe = "for (const [exe,args] of [['supabase',['db','reset']], [process.execPath,['unknown']], ['docker',['restart','anything']]]) { try { globalThis.bootstrapTransport.exec(exe,args,{}); process.exitCode=1; } catch {} }";
      execFileSync(process.execPath, ['--import', pathToFileURL(join(root, 'preload.mjs')).href, '--input-type=module', '-e', probe], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { TEMP: process.env.TEMP, TMP: process.env.TMP, SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
      assert.equal(await readFile(join(root, 'events.jsonl'), 'utf8').catch(() => ''), '');
      return { failed: false, failureDetails: '', events: [], prefixCopies: plan.before.length * 2 + 1 };
    }
    if (scenario === 'import-only' || scenario === 'forged-replay' || scenario === 'mutated-replay-files' || scenario === 'mutated-replay-plan') {
      const bootstrapUrl = pathToFileURL(join(root, 'scripts/bootstrap-local.ts')).href;
      const startUrl = pathToFileURL(join(root, 'scripts/start-supabase.ts')).href;
      const resetUrl = pathToFileURL(join(root, 'scripts/database/reset-local.ts')).href;
      const replayUrl = pathToFileURL(join(root, 'scripts/database/replay-workdir.ts')).href;
      const probe = scenario === 'import-only'
        ? `await import(${JSON.stringify(bootstrapUrl)}); await import(${JSON.stringify(startUrl)}); await import(${JSON.stringify(resetUrl)});`
        : scenario.startsWith('mutated-replay-')
          ? `const {createReplayWorkdirs,assertReplayWorkdirs}=await import(${JSON.stringify(replayUrl)}); const replay=await createReplayWorkdirs(); ${scenario==='mutated-replay-files'?'replay.files[1]=replay.files[0];':'replay.plan.before.reverse();'} try {assertReplayWorkdirs(replay); process.exitCode=1;} catch {}`
        : `const {startCuevoSupabase}=await import(${JSON.stringify(startUrl)}); try { await startCuevoSupabase({root:'supplied',prefix:'supplied',prerequisite:'supplied',files:[],plan:{}}); process.exitCode=1; } catch {}`;
      execFileSync(process.execPath, ['--import', pathToFileURL(join(root, 'preload.mjs')).href, '--input-type=module', '-e', probe], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { TEMP: process.env.TEMP, TMP: process.env.TMP, SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
      const text = await readFile(join(root, 'events.jsonl'), 'utf8').catch(() => '');
      if(scenario.startsWith('mutated-replay-')) assert.equal(text.includes('"cli"'),false);
      else assert.equal(text, '');
      return { failed: false, failureDetails: '', events: [], prefixCopies: plan.before.length * 2 + 1 };
    }
    let failed = false, failureDetails = '';
    try {
      const entry = scenario === 'standalone-start' ? 'scripts/start-supabase.ts' : scenario === 'standalone-reset' ? 'scripts/database/reset-local.ts' : 'scripts/bootstrap-local.ts';
      execFileSync(process.execPath, ['--import', pathToFileURL(join(root, 'preload.mjs')).href, join(root, entry)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { TEMP: process.env.TEMP, TMP: process.env.TMP, SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
    } catch (error) { failed = true; failureDetails = String((error as { stderr?: Buffer }).stderr ?? error); }
    const eventText = await readFile(join(root, 'events.jsonl'), 'utf8').catch(() => '');
    const events = eventText.trim() ? eventText.trim().split('\n').map(line => JSON.parse(line) as { kind: string; action?: string }) : [];
    return { failed, failureDetails, events, prefixCopies: plan.before.length * 2 + 1 };
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('bootstrap subprocess harness refuses unknown commands and provides no installed Supabase executable', async () => {
  assert.equal((await bootstrapFixture('unknown-command')).failed, false);
});

test('local operations import without effects and supplied replay metadata cannot reach any subprocess', async () => {
  for (const scenario of ['import-only', 'forged-replay']) assert.equal((await bootstrapFixture(scenario)).failed, false);
});

test('captured replay object cannot substitute duplicate file membership or changed ordering', async () => {
  for(const scenario of ['mutated-replay-files','mutated-replay-plan'])assert.equal((await bootstrapFixture(scenario)).failed,false);
});

test('standalone start and reset preserve independent preparation and advertised local command sequences', async () => {
  for (const [scenario, expected] of [['standalone-start', ['start']], ['standalone-reset', ['reset', 'up', 'up', 'up']]] as const) {
    const result = await bootstrapFixture(scenario);
    assert.equal(result.failed, false, result.failureDetails);
    assert.equal(result.events.filter(event => event.kind === 'prepared').length, 1);
    assert.equal(result.events.filter(event => event.kind === 'prepared-sql-write').length, result.prefixCopies);
    assert.deepEqual(result.events.filter(event => event.kind === 'cli').map(event => event.action), expected);
  }
});

test('one actual guarded bootstrap prepares replay SQL once while retaining the full ordered local effects', async () => {
  const result = await bootstrapFixture();
  assert.equal(result.failed, false, result.failureDetails);
  assert.equal(result.events.filter(event => event.kind === 'prepared').length, 1);
  assert.equal(result.events.filter(event => event.kind === 'prepared-sql-write').length, result.prefixCopies);
  assert.equal(result.events.filter(event => event.kind === 'preparation-source-read').length, readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).length);
  assert.deepEqual(result.events.filter(event => event.kind === 'cli').map(event => event.action), ['start', 'reset', 'up', 'up', 'up']);
  assert.equal(result.events.filter(event => event.kind === 'seed').length, 1);
});

test('reused bootstrap source config and staged bytes are freshly checked after startup before reset', async () => {
  for (const mutation of ['source', 'config', 'staged']) {
    const result = await bootstrapFixture('after-start-' + mutation);
    assert.equal(result.failed, true, mutation);
    assert.deepEqual(result.events.filter(event => event.kind === 'cli').map(event => event.action), ['start'], mutation);
    assert.equal(result.events.filter(event => event.kind === 'seed').length, 0);
  }
});

test('changed replay bytes between reset and prerequisite application refuse the next local mutation', async () => {
  const result = await bootstrapFixture('after-reset-staged');
  assert.equal(result.failed, true);
  assert.deepEqual(result.events.filter(event => event.kind === 'cli').map(event => event.action), ['start', 'reset']);
  assert.equal(result.events.filter(event => event.kind === 'seed').length, 0);
});

test('unused staged prefix is not reread but prerequisite is checked before its own effect',async()=>{
  const unused=await bootstrapFixture('after-reset-unused-prefix');
  assert.equal(unused.failed,false,unused.failureDetails);
  assert.deepEqual(unused.events.filter(event=>event.kind==='cli').map(event=>event.action),['start','reset','up','up','up']);
  const later=await bootstrapFixture('after-start-unused-prerequisite');
  assert.equal(later.failed,true);
  assert.deepEqual(later.events.filter(event=>event.kind==='cli').map(event=>event.action),['start','reset']);
});

test('source drift during awaited final database validation prevents synthetic seed execution', async () => {
  const result = await bootstrapFixture('during-validation-await');
  assert.equal(result.failed, true);
  assert.deepEqual(result.events.filter(event => event.kind === 'cli').map(event => event.action), ['start', 'reset', 'up', 'up', 'up']);
  assert.equal(result.events.filter(event => event.kind === 'seed').length, 0);
  assert.equal(result.events.filter(event => event.kind === 'pool-end').length, 1);
});
