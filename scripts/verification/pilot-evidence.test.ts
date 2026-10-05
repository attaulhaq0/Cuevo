import assert from 'node:assert/strict';
import test from 'node:test';
import { safePilotEvidence, writeSafePilotEvidence } from './pilot-evidence';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir}from'node:fs/promises';
import{tmpdir}from'node:os';import{join,resolve}from'node:path';
import{execFileSync}from'node:child_process';import{pathToFileURL}from'node:url';
import { pilotPhaseNames, type PilotRunIdentity } from './pilot-window-rules';
const identity: PilotRunIdentity = { repository: 'attaulhaq0/Cuevo', commitSha: 'b'.repeat(40), ref: 'refs/heads/codex/cuevo-integrated-review', runId: '123', runAttempt: 1, ciRunId: '99' };
const hash = 'a'.repeat(64);
function evidence() { return { schemaVersion: 1, identity, status: 'VERIFIED', recordFailed: false, rows: pilotPhaseNames.map((name, index) => ({ name, status: 'PASSED', actionConfirmed: true, restorationAllowed: name.endsWith('private-cleanup') ? true : null, exitCode: 0, durationMs: 10, sequence: index + 1 })) }; }
function artifacts() { return { schemaVersion: 1, identity, sourceStartSha256: hash, sourceFinalSha256: hash, migrationsSha256: hash, count: 228, packageLockSha256: hash, seedSha256: hash, buildId: 'current-next-build', runtimeSourceSha256: hash }; }
test('pilot safe summary exports exact current identity and scalar proof without private records', () => {
  const result = safePilotEvidence(evidence(), artifacts(), identity);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.dataClass, 'SYNTHETIC');
  assert.equal(result.sourceUnchanged, true); assert.equal(result.rows.length, pilotPhaseNames.length);
  assert.equal(JSON.stringify(result).includes('objectPath'), false); assert.equal(JSON.stringify(result).includes('rawError'), false);
});
test('missing evidence stays unverified and never counts absent failures as zero', () => {
  const result = safePilotEvidence(null, null, identity);
  assert.equal(result.status, 'NOT_VERIFIED'); assert.equal(result.sourceUnchanged, null); assert.equal(result.artifacts, null); assert.deepEqual(result.rows, []);
});
test('safe export rejects source/run mismatch, private fields and an incomplete successful manifest', () => {
  for (const raw of [{ ...evidence(), identity: { ...identity, runId: '124' } }, { ...evidence(), rawError: 'private' }]) assert.throws(() => safePilotEvidence(raw, artifacts(), identity));
  for (const raw of [{ ...artifacts(), raw: { objectPath: 'private' } }, { ...artifacts(), sourceFinalSha256: 'c'.repeat(64) }, { ...artifacts(), seedSha256: null }, { ...artifacts(), identity: { ...identity, commitSha: 'c'.repeat(40) } }]) assert.throws(() => safePilotEvidence(evidence(), raw, identity));
});

async function temporary(action:(root:string)=>Promise<void>,prefix='cuevo-pilot-export-'){const root=await mkdtemp(join(tmpdir(),prefix));const owned=resolve(root);if(!owned.startsWith(resolve(tmpdir())+requireSeparator())||!owned.startsWith(resolve(tmpdir(),prefix)))throw Error('Temporary evidence cleanup escaped its owner.');try{await action(owned);}finally{await rm(owned,{recursive:true,force:true});}}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
async function fixture(root:string,raw:unknown=evidence(),manifest:unknown=artifacts()){const directory=join(root,'.local/pilot','123-1');await mkdir(directory,{recursive:true});await writeFile(join(directory,'evidence.json'),JSON.stringify(raw));await writeFile(join(directory,'artifact-manifest.json'),JSON.stringify(manifest));}
test('explicit filesystem export uses only exact run identity and missing evidence stays unverified',async()=>temporary(async root=>{await mkdir(join(root,'.local/pilot','999-1'),{recursive:true});await writeFile(join(root,'.local/pilot','999-1','evidence.json'),JSON.stringify(evidence()));const result=await writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha});assert.equal(result.status,'NOT_VERIFIED');const saved=JSON.parse(await readFile(join(root,'.local/cicd-safe/pilot-summary.json'),'utf8'));assert.equal(saved.artifacts,null);assert.deepEqual(saved.rows,[]);assert.equal(saved.identity.runId,'123');}));
test('filesystem export validates exact run artifacts and never writes private malformed or stale payload',async()=>temporary(async root=>{await fixture(root);const result=await writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha});assert.equal(result.status,'VERIFIED');const output=join(root,'.local/cicd-safe/pilot-summary.json'),original=await readFile(output,'utf8');await fixture(root,{...evidence(),rawError:'private child content'});await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha}));assert.equal(await readFile(output,'utf8'),original);await fixture(root,{...evidence(),identity:{...identity,commitSha:'c'.repeat(40)}});await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha}));await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:'0'.repeat(40)}));}));
test('oversized source files are rejected before summary creation',async()=>temporary(async root=>{await fixture(root);await writeFile(join(root,'.local/pilot','123-1','evidence.json'),' '.repeat(300000));await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha}));await assert.rejects(()=>readFile(join(root,'.local/cicd-safe/pilot-summary.json')),{code:'ENOENT'});}));
test('redirected source files are rejected without outside output writes',async t=>temporary(async root=>{
  await fixture(root);const directory=join(root,'.local/pilot','123-1');await rm(join(directory,'evidence.json'));
  await temporary(async outside=>{
    const source=JSON.stringify(evidence());await writeFile(join(outside,'evidence.json'),source);
    try{await symlink(join(outside,'evidence.json'),join(directory,'evidence.json'),'file');}catch(error){if(process.platform==='win32'&&(error as NodeJS.ErrnoException).code==='EPERM'){t.skip('Windows symlink creation is not permitted.');return;}throw error;}
    await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha}));
    assert.deepEqual(await readdir(outside),['evidence.json']);assert.equal(await readFile(join(outside,'evidence.json'),'utf8'),source);
    await assert.rejects(()=>readFile(join(root,'.local/cicd-safe/pilot-summary.json')),{code:'ENOENT'});
  },'cuevo-pilot-export-outside-');
}));
test('importing pilot exporter has no filesystem action even with populated environment values',async()=>temporary(async root=>{const entry=pathToFileURL(resolve(import.meta.dirname,'pilot-evidence.ts')).href,tsx=pathToFileURL(resolve(import.meta.dirname,'../../node_modules/tsx/dist/loader.mjs')).href;execFileSync(process.execPath,['--import',tsx,'--input-type=module','-e',`await import(${JSON.stringify(entry)});`],{cwd:root,env:{...process.env,GITHUB_RUN_ID:'123',CUEVO_PILOT_EXPECTED_SHA:identity.commitSha,CUEVO_PILOT_CI_RUN_ID:'99'},stdio:'pipe'});assert.deepEqual(await readdir(root),[]);}));
test('invalid run path identity and excessive directory entries fail before summary creation',async()=>temporary(async root=>{await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity:{...identity,runId:'../outside'} as PilotRunIdentity,expectedSha:identity.commitSha}));await fixture(root);const folder=join(root,'.local/pilot','123-1');await Promise.all(Array.from({length:65},(_,index)=>writeFile(join(folder,`owned-${index}.json`),'{}')));await assert.rejects(()=>writeSafePilotEvidence({workspaceRoot:root,identity,expectedSha:identity.commitSha}));}));
