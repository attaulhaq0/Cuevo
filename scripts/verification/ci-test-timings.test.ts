import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const privateCanary = 'ci-timing-private-pupil-payload';
async function api() {
  const loaded = await import(pathToFileURL(resolve(import.meta.dirname, 'ci-test-timings.ts')).href).catch(() => null);
  assert.equal(typeof loaded?.createCiTestTimingCollector, 'function', 'The Node event timing collector must exist.');
  return loaded as typeof import('./ci-test-timings');
}
const identity = {
  sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), sourceLockSha256: 'c'.repeat(64),
  nodeVersion: process.version, runId: '51', runAttempt: 2,
  scope: 'STATELESS_SOURCE_CONTRACTS', partitionSha256: 'd'.repeat(64),
};
test('actual Node CLI single and multiple files retain exact declaration summaries without programmatic wrapper assumptions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-ci-cli-summary-'));
 try{
  await mkdir(join(root,'scripts/verification'),{recursive:true});const contents=["import{test}from'node:test';\ntest('first',()=>{});\ntest('second',()=>{});\n","import{describe,it}from'node:test';\ndescribe('outer',()=>{\n it('one',()=>{});\n it('two',()=>{});\n});\n"],files=contents.map((text,index)=>({path:`scripts/verification/cli-${index}.test.ts`,sha256:hash(text)}));for(const[index,file]of files.entries())await writeFile(join(root,file.path),contents[index]);
  const reporter=pathToFileURL(resolve(import.meta.dirname,'ci-test-timings-reporter.ts')).href;
  const cliEnvironment={...process.env};delete cliEnvironment.NODE_TEST_CONTEXT;for(const count of [1,2]){const selected=files.slice(0,count),result=spawnSync(process.execPath,['--import',pathToFileURL(resolve(import.meta.dirname,'../../node_modules/tsx/dist/loader.mjs')).href,'--test','--test-reporter='+reporter,...selected.map(file=>join(root,file.path))],{cwd:root,env:{...cliEnvironment,CUEVO_CI_TEST_TIMING_INPUT:JSON.stringify({repoRoot:root,files:selected,identity})},encoding:'utf8',maxBuffer:4*1024*1024,timeout:15000});assert.ok(result.stdout.trim(),result.stderr);const report=JSON.parse(result.stdout);assert.equal(result.status,0,JSON.stringify({count,reasons:report.reasons,summary:report.summary}));assert.equal(report.status,'PASSED');assert.equal(report.files.length,count);assert.equal(report.files.reduce((total:number,file:{cases:unknown[]})=>total+file.cases.length,0),count*2);assert.equal(report.summary.counts.topLevel,count===1?2:3);}
 }finally{await rm(root,{recursive:true,force:true});}
});
async function fixture(mode: 'pass' | 'fail' | 'skip' | 'todo' | 'empty', inspect: (input: {
  root: string; files: { path: string; sha256: string }[]; events: unknown[];
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-ci-timing-'));
  try {
    await mkdir(join(root, 'scripts', 'verification'), { recursive: true });
    const contents = [
      "import {test,suite} from 'node:test';\n" +
      "suite('controlled outer',()=>{\n" +
      "  test('same controlled name',()=>{});\n" +
      "  suite('controlled inner',()=>{test('same controlled name',()=>{});});\n" +
      "});\n",
      mode === 'empty' ? '' : "import {test} from 'node:test';\n" +
      `test('controlled ${mode}',${mode === 'skip' || mode === 'todo' ? `{${mode}:true},` : ''}()=>{` +
      (mode === 'fail' ? `process.stdout.write('${privateCanary}');process.stderr.write('${privateCanary}');throw Error('${privateCanary}');` : '') +
      '});\n',
    ];
    const files = contents.map((content, index) => ({ path: `scripts/verification/controlled-${index}.test.ts`, sha256: hash(content) }));
    for (const [index, file] of files.entries()) await writeFile(join(root, file.path), contents[index]);
    // run() deliberately refuses recursive use inside a test-file subprocess.
    // A separate real runner captures only the documented event fields; the
    // collector itself also receives the original errors/logs in that runner.
    const runner = join(root, 'observe.mjs');
    await writeFile(join(root, 'input.json'), JSON.stringify({ root, files, identity, collector: pathToFileURL(resolve(import.meta.dirname, 'ci-test-timings.ts')).href }));
    await writeFile(runner, `import {run}from'node:test';import{readFileSync}from'node:fs';import{join}from'node:path';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),api=await import(input.collector),events=[];
let clock=1000;const collector=api.createCiTestTimingCollector({repoRoot:input.root,files:input.files,identity:input.identity,now:()=>++clock});
for await(const event of run({cwd:input.root,files:input.files.map(file=>join(input.root,file.path)),concurrency:2,execArgv:[],isolation:'process'})){
collector.consume(event);const data={};if(event.data){for(const key of ['file','line','column','name','nesting','testNumber','type','skip','todo','counts','duration_ms','success'])if(event.data[key]!==undefined)data[key]=event.data[key];if(event.data.details){data.details={};for(const key of ['passed','duration_ms','type','attempt','passed_on_attempt'])if(event.data.details[key]!==undefined)data.details[key]=event.data.details[key];}}
events.push({type:event.type,data});}
process.stdout.write(JSON.stringify({result:collector.finish(),events}));`);
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const observed = spawnSync(process.execPath, ['--import', pathToFileURL(resolve(import.meta.dirname, '../../node_modules/tsx/dist/loader.mjs')).href, runner, join(root, 'input.json')], { env: environment, encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(observed.status, 0, 'The isolated Node event fixture must complete.');
    const output = JSON.parse(observed.stdout) as { result: { status: string; reasons: string[] }; events: unknown[] };
    assert.equal(output.result.status, mode === 'pass' ? 'PASSED' : 'FAILED', JSON.stringify(output.result.reasons));
    assert.equal(observed.stdout.includes(privateCanary), false);
    await inspect({ root, files, events: output.events });
  } finally {
    assert.equal(resolve(root, '..'), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
}

test('real Node events produce one case per completion and per-file timing across nested suites and duplicate names', async () => {
  const { createCiTestTimingCollector } = await api();
  await fixture('pass', async ({ root, files, events }) => {
    let clock = 1_000;
    const collector = createCiTestTimingCollector({ repoRoot: root, files, identity, now: () => ++clock });
    for (const event of events) collector.consume(event);
    const result = collector.finish();
    assert.equal(result.status, 'PASSED');
    assert.equal(result.effectAuthority, false);
    assert.equal(result.timeTargetAchieved, false);
    assert.equal(result.observationBasis, 'SUPPLIED_NODE_EVENT_STREAM');
    assert.equal(result.fileBytesConfirmed, false);
    assert.equal(result.files.length, 2);
    assert.equal(result.files.reduce((count, file) => count + file.cases.length, 0), 3);
    assert.equal(result.files.reduce((count, file) => count + file.suites.length, 0), 2);
    const duplicates = result.files.flatMap(file => file.cases).filter(row => row.titleSha256 === hash('same controlled name'));
    assert.equal(duplicates.length, 2);
    assert.notEqual(duplicates[0].suiteSha256, duplicates[1].suiteSha256);
    assert.ok(result.files.every(file => file.durationMs !== null && file.durationMs >= 0 && file.summary?.success));
    assert.ok(result.files.flatMap(file => file.cases).every(row => row.completedAtMs >= row.startedAtMs && row.durationMs >= 0));
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.equal(JSON.stringify(result).includes('same controlled name'), false);
    let hintEvaluated=false;const hostile=createCiTestTimingCollector({repoRoot:root,files,identity,now:()=>++clock});for(const event of events){const changed=structuredClone(event)as {type:string;data:Record<string,unknown>};if(changed.type==='test:dequeue')changed.data.type={toString(){hintEvaluated=true;throw Error(privateCanary);}};hostile.consume(changed);}assert.equal(hintEvaluated,false);assert.equal(hostile.finish().status,'FAILED');
    assert.deepEqual(collector.finish(), result);
  });
});

test('actual failed, skipped, TODO and empty-file runs retain safe failed evidence without accepting partial coverage', async () => {
  const { createCiTestTimingCollector } = await api();
  for (const mode of ['fail', 'skip', 'todo', 'empty'] as const) await fixture(mode, async ({ root, files, events }) => {
    let clock = 2_000;
    const collector = createCiTestTimingCollector({ repoRoot: root, files, identity, now: () => ++clock });
    events.forEach(event => collector.consume(event));
    const result = collector.finish();
    assert.equal(result.status, 'FAILED', mode);
    assert.ok(result.reasons.length > 0, mode);
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].cases.length, 2);
    if (mode === 'fail') assert.equal(result.files[1].cases[0].outcome, 'FAILED');
    if (mode === 'empty') assert.equal(result.files[1].cases.length, 0);
    const bytes = JSON.stringify(result);
    assert.equal(bytes.includes(privateCanary), false);
    assert.equal(bytes.includes('error'), false);
    assert.equal(bytes.includes('stdout'), false);
    assert.equal(bytes.includes('stderr'), false);
  });
});

test('mutating real Node terminal events refuses duplicates, foreign files, reruns, truncated coverage and contradictory summaries', async () => {
  const { createCiTestTimingCollector } = await api();
  await fixture('pass', async ({ root, files, events }) => {
    type Event = { type: string; data: Record<string, unknown> };
    const originals = events as Event[];
    const modes = ['complete', 'pass', 'summary', 'foreign', 'missing-file', 'missing-summary', 'rerun', 'negative-duration', 'contradictory-summary', 'unknown-event'] as const;
    for (const mode of modes) {
      const changed = structuredClone(originals);
      const leaf = changed.find(event => event.type === 'test:complete' && event.data.name === 'controlled pass')!;
      if (mode === 'complete') changed.push(structuredClone(leaf));
      if (mode === 'pass') changed.push(structuredClone(changed.find(event => event.type === 'test:pass' && event.data.name === 'controlled pass')!));
      if (mode === 'summary') changed.push(structuredClone(changed.find(event => event.type === 'test:summary' && event.data.file === undefined)!));
      if (mode === 'foreign') leaf.data.file = join(root, 'scripts/verification/unregistered.test.ts');
      if (mode === 'missing-file') changed.splice(0, changed.length, ...changed.filter(event => event.data.file !== join(root, files[1].path)));
      if (mode === 'missing-summary') changed.splice(0, changed.length, ...changed.filter(event => event.type !== 'test:summary'));
      if (mode === 'rerun') (leaf.data.details as Record<string, unknown>).attempt = 1;
      if (mode === 'negative-duration') (leaf.data.details as Record<string, unknown>).duration_ms = -1;
      if (mode === 'contradictory-summary') (changed.find(event => event.type === 'test:summary' && event.data.file === undefined)!.data.counts as Record<string, unknown>).passed = 50;
      if (mode === 'unknown-event') changed.push({ type: 'test:unexpected', data: { private: privateCanary } });
      let clock = 3_000;
      const collector = createCiTestTimingCollector({ repoRoot: root, files, identity, now: () => ++clock });
      changed.forEach(event => collector.consume(event));
      const result = collector.finish();
      assert.equal(result.status, 'FAILED', mode);
      assert.ok(result.reasons.length > 0, mode);
      assert.equal(JSON.stringify(result).includes(privateCanary), false);
    }
  });
});

test('event accessors, proxies and private diagnostics remain unevaluated and only fixed reasons enter evidence', async () => {
  const { createCiTestTimingCollector } = await api();
  await fixture('pass', async ({ root, files, events }) => {
    let reads = 0, clock = 4_000;
    const collector = createCiTestTimingCollector({ repoRoot: root, files, identity, now: () => ++clock });
    collector.consume(new Proxy({}, { get() { reads++; throw Error(privateCanary); }, getPrototypeOf() { reads++; throw Error(privateCanary); } }));
    collector.consume(Object.defineProperty({}, 'type', { get() { reads++; throw Error(privateCanary); } }));
    collector.consume({ type: 'test:diagnostic', data: Object.defineProperty({}, 'message', { get() { reads++; throw Error(privateCanary); } }) });
    collector.consume({ type: 'test:stdout', data: { message: privateCanary } });
    collector.consume({ type: 'test:stderr', data: { message: privateCanary } });
    events.forEach(event => collector.consume(event));
    const result = collector.finish();
    assert.equal(reads, 0);
    assert.equal(result.status, 'FAILED');
    assert.deepEqual(result.reasons, ['EVENT_INVALID']);
    assert.equal(JSON.stringify(result).includes(privateCanary), false);
    assert.equal(result.files.flatMap(file => file.cases).length, 3);
  });
});

test('registered scope inputs are strict and receipt clock failures cannot become passing evidence', async () => {
  const { createCiTestTimingCollector } = await api();
  await fixture('pass', async ({ root, files, events }) => {
    const options = { repoRoot: root, files, identity, now: () => 5_000 };
    for (const change of [
      { ...options, private: privateCanary },
      { ...options, files: [files[0], files[0]] },
      { ...options, files: [{ ...files[0], path: '../private.test.ts' }] },
      { ...options, identity: { ...identity, runAttempt: null } },
      { ...options, identity: { ...identity, private: privateCanary } },
    ]) assert.throws(() => createCiTestTimingCollector(change), /CI test timing input requires review; private contents withheld\./);
    for (const mode of ['backwards', 'throw', 'nan', 'too-long'] as const) {
      let count = 0;
      const collector = createCiTestTimingCollector({ ...options, now: () => {
        count++;
        if (mode === 'throw' && count > 1) throw Error(privateCanary);
        if (mode === 'nan' && count > 1) return NaN;
        if (mode === 'too-long') return count === 1 ? 5_000 : 90_000_000;
        return count === 1 ? 5_000 : mode === 'backwards' ? 4_000 : 5_001;
      } });
      events.forEach(event => collector.consume(event));
      const result = collector.finish();
      assert.equal(result.status, 'FAILED', mode);
      assert.ok(result.reasons.includes('CLOCK_INVALID'), mode);
      assert.equal(JSON.stringify(result).includes(privateCanary), false);
    }
  });
});

test('standalone Node reporter emits one safe bounded report and refuses empty-file success', async () => {
  const reporter = await import(pathToFileURL(resolve(import.meta.dirname, 'ci-test-timings-reporter.ts')).href).catch(() => null);
  assert.equal(typeof reporter?.default, 'function', 'The standalone Node timing reporter must exist.');
  await fixture('pass', async ({ root, files }) => {
    const reporterPath = pathToFileURL(resolve(import.meta.dirname, 'ci-test-timings-reporter.ts')).href;
    const runReporter = (configuration: unknown) => {
      const environment: NodeJS.ProcessEnv = { ...process.env, CUEVO_CI_TEST_TIMING_INPUT: JSON.stringify(configuration) };
      delete environment.NODE_TEST_CONTEXT;
      return spawnSync(process.execPath, ['--import', pathToFileURL(resolve(import.meta.dirname, '../../node_modules/tsx/dist/loader.mjs')).href, '--test', `--test-reporter=${reporterPath}`, ...files.map(file => join(root, file.path))], { cwd: root, env: environment, encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    };
    const observed = runReporter({ repoRoot: root, files, identity });
    assert.equal(observed.status, 0, 'A complete native reporter run must succeed. ' + observed.stderr);
    const result = JSON.parse(observed.stdout);
    assert.equal(result.status, 'PASSED');
    assert.equal(result.fileBytesConfirmed, true);
    assert.equal(result.files.reduce((count: number, file: { cases: unknown[] }) => count + file.cases.length, 0), 3);
    assert.equal(observed.stdout.trim().split('\n').length, 1);
    assert.ok(Buffer.byteLength(observed.stdout) < 1024 * 1024);
    assert.equal(observed.stdout.includes(root), false);
    await writeFile(join(root, files[1].path), "import{test}from'node:test';test('changed controlled source',()=>{});\n");
    const changed = runReporter({ repoRoot: root, files, identity });
    assert.notEqual(changed.status, 0);
    assert.equal(JSON.parse(changed.stdout).status, 'FAILED');
    assert.equal(JSON.parse(changed.stdout).fileBytesConfirmed, false);
    await writeFile(join(root, files[1].path), '');
    const empty = runReporter({ repoRoot: root, files, identity });
    assert.notEqual(empty.status, 0);
    assert.equal(JSON.parse(empty.stdout).status, 'FAILED');
    const malformed = runReporter({ private: privateCanary });
    assert.notEqual(malformed.status, 0);
    assert.equal(malformed.stdout.includes(privateCanary), false);
    assert.equal(JSON.parse(malformed.stdout).status, 'FAILED');
  });
});

test('actual Node reporter catches rejected streams in valid and invalid configuration and retains safe partial cases', async () => {
  await fixture('pass', async ({ root, files, events }) => {
    const reporterUrl = pathToFileURL(resolve(import.meta.dirname, 'ci-test-timings-reporter.ts')).href;
    const wrapper = join(root, 'rejecting-reporter.mjs');
    const inputFile = join(root, 'rejection-input.json');
    const partial = (events as { type: string; data: Record<string, unknown> }[])
      .filter(event => event.data.file === join(root, files[0].path));
    await writeFile(inputFile, JSON.stringify({ reporterUrl, partial, privateCanary }));
    await writeFile(wrapper, `import{readFileSync}from'node:fs';const input=JSON.parse(readFileSync(new URL('./rejection-input.json',import.meta.url),'utf8'));const{default:reporter}=await import(input.reporterUrl);
async function* rejected(){for(const event of input.partial)yield event;throw Error(input.privateCanary);}
export default async function* rejectTransport(source){for await(const event of source){void event;}for await(const chunk of reporter(rejected()))yield chunk;}`);
    const outputs = ['valid', 'invalid'].map(mode => {
      const environment: NodeJS.ProcessEnv = { ...process.env, CUEVO_CI_TEST_TIMING_INPUT: JSON.stringify(mode === 'valid' ? { repoRoot: root, files, identity } : { private: privateCanary }) };
      delete environment.NODE_TEST_CONTEXT;
      const child = spawnSync(process.execPath, ['--import', pathToFileURL(resolve(import.meta.dirname, '../../node_modules/tsx/dist/loader.mjs')).href, '--test', `--test-reporter=${pathToFileURL(wrapper).href}`, ...files.map(file => join(root, file.path))], { cwd: root, env: environment, encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
      return { mode, child };
    });
    assert.deepEqual(outputs.map(({ mode, child }) => ({ mode, leaked: child.stderr.includes(privateCanary), json: child.stdout.trim().startsWith('{') })), [
      { mode: 'valid', leaked: false, json: true }, { mode: 'invalid', leaked: false, json: true },
    ], 'Both reporter paths must catch rejected iterators before Node prints private failures.');
    for (const { mode, child } of outputs) {
      assert.notEqual(child.status, 0, mode);
      assert.equal(child.stdout.trim().split('\n').length, 1, mode);
      assert.equal(child.stdout.includes(privateCanary), false, mode);
      assert.equal(child.stderr, '', mode);
      const result = JSON.parse(child.stdout);
      assert.equal(result.status, 'FAILED', mode);
      assert.ok(result.reasons.includes('EVENT_STREAM_FAILED'), mode);
      if (mode === 'valid') {
        assert.equal(result.files[0].cases.length, 2);
        assert.equal(result.files[1].cases.length, 0);
        assert.equal(result.summary, null);
      } else assert.ok(result.reasons.includes('INPUT_REQUIRES_REVIEW'));
    }
  });
});
