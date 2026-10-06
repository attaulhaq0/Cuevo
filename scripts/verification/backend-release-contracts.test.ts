import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = 'a'.repeat(40), tree = 'b'.repeat(40), base = 'c'.repeat(40), ref = 'mqxdjvsyckzocokuikmx';
const now = Date.parse('2026-10-06T12:00:00Z');
const fingerprints = { sourceManifestSha256: '1'.repeat(64), diffSha256: '2'.repeat(64), migrationPlanSha256: '3'.repeat(64), migrationHistorySha256: '4'.repeat(64), migrationToolchainSha256: 'd'.repeat(64), migrationEndpointSha256:'e'.repeat(64),operatorStoragePolicySha256: 'f'.repeat(64), apiArtifactSha256: '5'.repeat(64), edgeArtifactSha256: '6'.repeat(64), denoLockSha256: '7'.repeat(64) };
const targets = { web: { teamId: 'team_Cuevo', projectId: 'prj_Web', origin: 'https://cuevo-web.vercel.app', target: 'preview' }, api: { teamId: 'team_Cuevo', projectId: 'prj_Api', origin: 'https://cuevo-api.vercel.app', target: 'preview' }, supabase: { projectRef: ref, authOrigin: `https://${ref}.supabase.co`, edgeOrigin: `https://${ref}.supabase.co/functions/v1/cuevo-worker` } };
const assignments = [{ category: 'source-spec-code', taskId: 'source-review', reportSha256: '8'.repeat(64), evidenceSha256: '9'.repeat(64) }, { category: 'qa-regression-operations', taskId: 'qa-review', reportSha256: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64) }];
const identity = { repository: 'attaulhaq0/Cuevo', releaseSha: sha, treeSha: tree, baseSha: base, ciRunId: '31', releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: 'staging', deploymentEnvironment: 'synthetic-staging' };
function input() { return { version: 1, purpose: 'BACKEND_SYNTHETIC_STAGING', ...identity, targets: structuredClone(targets), fingerprints: { ...fingerprints }, preparedAt: '2026-10-06T11:00:00Z', expiresAt: '2026-10-07T11:00:00Z', reviews: assignments.map(row => ({ ...row, releaseSha: sha, treeSha: tree, baseSha: base, sourceManifestSha256: fingerprints.sourceManifestSha256, diffSha256: fingerprints.diffSha256, reviewedAt: '2026-10-06T10:00:00Z' })) }; }
function expected() { return { ...identity, targets: structuredClone(targets), fingerprints: { ...fingerprints }, reviews: structuredClone(assignments), now, currentMainSha: sha,
  ciRun: { id: 31, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'attaulhaq0/Cuevo' } },
  backendRun: { id: 51, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'waiting', conclusion: null, path: '.github/workflows/backend-release.yml', repository: { full_name: 'attaulhaq0/Cuevo' } } }; }
async function subject() { let module: Record<string, unknown> = {}; try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-release-contracts.ts')).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; } assert.equal(typeof module.prepareBackendReleaseIntent, 'function', 'backend intent preparation exists'); return module as typeof import('./backend-release-contracts'); }

test('the selected migration endpoint is bound before approval and cannot be removed or replaced',async()=>{const api=await subject(),body=input(),current=expected();const removed=structuredClone(body);delete (removed.fingerprints as Record<string,string>).migrationEndpointSha256;assert.throws(()=>api.prepareBackendReleaseIntent(removed,current));const prepared=api.prepareBackendReleaseIntent(body,current);assert.throws(()=>api.validatePreparedBackendReleaseIntent(prepared,{...current,fingerprints:{...current.fingerprints,migrationEndpointSha256:'0'.repeat(64)}}));});

test('backend approval binds the migration toolchain artifact and cannot admit omitted or substituted installer evidence', async () => {
  const api = await subject(), body = input(), current = expected();
  const withoutToolchain = structuredClone(body), expectedWithout = structuredClone(current);
  delete (withoutToolchain.fingerprints as Record<string, string>).migrationToolchainSha256;
  delete (expectedWithout.fingerprints as Record<string, string>).migrationToolchainSha256;
  assert.throws(() => api.prepareBackendReleaseIntent(withoutToolchain, expectedWithout));
  (body.fingerprints as Record<string, string>).migrationToolchainSha256 = 'd'.repeat(64);
  (current.fingerprints as Record<string, string>).migrationToolchainSha256 = 'd'.repeat(64);
  const prepared = api.prepareBackendReleaseIntent(body, current);
  assert.match(prepared.canonicalJson, /migrationToolchainSha256/);
  (current.fingerprints as Record<string, string>).migrationToolchainSha256 = 'e'.repeat(64);
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, current));
});

test('backend approval binds operator journal policy separately from toolchain and runtime artifacts', async () => {
  const api = await subject(), body = input(), current = expected();
  const absent = structuredClone(body), absentExpected = structuredClone(current);
  delete (absent.fingerprints as Record<string, string>).operatorStoragePolicySha256;
  delete (absentExpected.fingerprints as Record<string, string>).operatorStoragePolicySha256;
  assert.throws(() => api.prepareBackendReleaseIntent(absent, absentExpected));
  (body.fingerprints as Record<string, string>).operatorStoragePolicySha256 = 'f'.repeat(64);
  (current.fingerprints as Record<string, string>).operatorStoragePolicySha256 = 'f'.repeat(64);
  const prepared = api.prepareBackendReleaseIntent(body, current);
  assert.match(prepared.canonicalJson, /operatorStoragePolicySha256/);
  (current.fingerprints as Record<string, string>).operatorStoragePolicySha256 = 'e'.repeat(64);
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, current));
});

test('prepared backend intent binds staging source targets fingerprints reviews and exact run without claiming approval', async () => {
  const api = await subject(), prepared = api.prepareBackendReleaseIntent(input(), expected());
  assert.equal(prepared.status, 'PREPARED_ONLY'); assert.equal(prepared.sha256, createHash('sha256').update(prepared.canonicalJson).digest('hex'));
  assert.equal(Buffer.from(prepared.base64, 'base64').toString(), prepared.canonicalJson);
  assert.equal(prepared.comment, `Cuevo backend staging admission approved: sha=${sha}; run=51; attempt=1; package=sha256:${prepared.sha256}`);
  assert.doesNotMatch(prepared.canonicalJson, /approvedAt|founderVerified|healthVerified|credentials|success/);
  assert.deepEqual(api.validatePreparedBackendReleaseIntent(prepared, { ...expected(), now: now + 3600000 }), prepared);
});

test('backend intent refuses foreign source current main CI run and ambiguous backend attempt', async () => {
  const api = await subject();
  for (const patch of [{ releaseSha: base }, { treeSha: base }, { ciRunId: '99' }, { releaseRunId: '52' }, { runAttempt: 2 }, { environmentId: 124 }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
  for (const patch of [{ currentMainSha: base }, { ciRun: { ...expected().ciRun, event: 'pull_request' } }, { ciRun: { ...expected().ciRun, conclusion: 'cancelled' } }, { ciRun: { ...expected().ciRun, repository: { full_name: 'fork/Cuevo' } } }, { backendRun: { ...expected().backendRun, run_attempt: 2 } }, { backendRun: { ...expected().backendRun, status: 'completed', conclusion: 'success' } }, { backendRun: { ...expected().backendRun, path: '.github/workflows/release.yml' } }]) assert.throws(() => api.prepareBackendReleaseIntent(input(), { ...expected(), ...patch }));
});

test('backend intent rejects cross-project origins production modes and mismatched artifact history', async () => {
  const api = await subject();
  for (const patch of [{ environmentName: 'production' }, { deploymentEnvironment: 'production' }, { purpose: 'PREBUILD_RELEASE_ADMISSION' }, { fingerprints: { ...fingerprints, migrationPlanSha256: '0'.repeat(64) } }, { targets: { ...targets, api: targets.web } }, { targets: { ...targets, api: { ...targets.api, origin: 'https://other.vercel.app' } } }, { targets: { ...targets, supabase: { ...targets.supabase, authOrigin: 'https://other.supabase.co' } } }, { targets: { ...targets, supabase: { ...targets.supabase, edgeOrigin: `https://${ref}.supabase.co/functions/v1/other` } } }, { targets: { ...targets, web: { ...targets.web, origin: 'https://cuevo-web.vercel.app/path' } } }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
});

test('backend intent requires fresh two independent assigned reviews and bounded package expiry', async () => {
  const api = await subject();
  for (const patch of [{ preparedAt: '2026-10-05T10:00:00Z' }, { preparedAt: '2026-10-06T13:00:00Z' }, { expiresAt: '2026-10-06T11:30:00Z' }, { expiresAt: '2026-10-08T11:00:00Z' }, { reviews: [] }, { reviews: [input().reviews[0], input().reviews[0]] }, { reviews: input().reviews.map(row => ({ ...row, reviewedAt: '2026-10-04T12:00:00Z' })) }, { reviews: input().reviews.map(row => ({ ...row, reportSha256: '0'.repeat(64) })) }, { reviews: input().reviews.map(row => ({ ...row, treeSha: base })) }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
});

test('backend intent rejects secrets unknown fields accessors and proxies without invoking them', async () => {
  const api = await subject();
  for (const patch of [{ credentials: { SUPABASE_ACCESS_TOKEN: 'private' } }, { approved: true }, { success: true }, { fingerprint: 'extra' }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
  let calls = 0;
  const getter = { ...input(), get releaseSha() { calls++; return sha; } };
  const proxy = new Proxy(input(), { get(target, key, receiver) { calls++; return Reflect.get(target, key, receiver); } });
  assert.throws(() => api.prepareBackendReleaseIntent(getter, expected())); assert.throws(() => api.prepareBackendReleaseIntent(proxy, expected())); assert.equal(calls, 0);
});

test('saved prepared backend intent cannot change its canonical bytes digest comment or attempt on readmission', async () => {
  const api = await subject(), prepared = api.prepareBackendReleaseIntent(input(), expected());
  for (const patch of [{ canonicalJson: prepared.canonicalJson + ' ' }, { sha256: '0'.repeat(64) }, { base64: Buffer.from('{}').toString('base64') }, { comment: 'Ship it' }, { status: 'APPROVED' }]) assert.throws(() => api.validatePreparedBackendReleaseIntent({ ...prepared, ...patch }, expected()));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, { ...expected(), now: now + 86400000 }));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, { ...expected(), runAttempt: 2 }));
});


test('independent assignments and exact targets cannot mutually replace evidence with duplicate tasks or a shared origin', async () => {
  const api = await subject();
  const duplicate = input(); duplicate.reviews[1].taskId = duplicate.reviews[0].taskId;
  const duplicateExpected = expected(); duplicateExpected.reviews[1].taskId = duplicateExpected.reviews[0].taskId;
  assert.throws(() => api.prepareBackendReleaseIntent(duplicate, duplicateExpected));
  const shared = { ...targets, api: { ...targets.api, origin: targets.web.origin } };
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), targets: shared }, { ...expected(), targets: shared }));
  const wrongTeam = { ...targets, api: { ...targets.api, teamId: 'team_Other' } };
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), targets: wrongTeam }, { ...expected(), targets: wrongTeam }));
  const foreign = { ...targets, supabase: { ...targets.supabase, projectRef: 'c'.repeat(20) } };
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), targets: foreign }, { ...expected(), targets: foreign }));
});

test('canonical preparation orders independent reviews and re-admits exact lifetime boundary without inventing a receipt', async () => {
  const api = await subject();
  const original = api.prepareBackendReleaseIntent(input(), expected());
  const reordered = { ...input(), reviews: [...input().reviews].reverse() };
  assert.deepEqual(api.prepareBackendReleaseIntent(reordered, expected()), original);
  const expires = Math.min(Date.parse(input().expiresAt), Date.parse(input().reviews[0].reviewedAt) + 86400000);
  assert.equal(api.validatePreparedBackendReleaseIntent(original, { ...expected(), now: expires - 1 }).status, 'PREPARED_ONLY');
  assert.throws(() => api.validatePreparedBackendReleaseIntent(original, { ...expected(), now: expires + 1 }));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(original, { ...expected(), now: Date.parse(input().expiresAt) }));
  let traps = 0; const array = new Proxy(input().reviews, { get(target, key, receiver) { traps++; return Reflect.get(target, key, receiver); } });
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), reviews: array }, expected())); assert.equal(traps, 0);
});

const backendApprovals=(comment:string)=>[{environments:[{id:123,name:'staging'}],state:'approved',user:{id:95836629,login:'attaulhaq0',type:'User'},comment}];
test('backend official approval is separate from preparation and binds exact package run environment and founder',async()=>{const api=await subject();assert.equal(typeof api.validateFounderBackendApproval,'function');const prepared=api.prepareBackendReleaseIntent(input(),expected());const receipt=api.validateFounderBackendApproval(prepared,expected().backendRun,backendApprovals(prepared.comment),expected());assert.equal(receipt.purpose,'BACKEND_SYNTHETIC_STAGING');assert.equal(receipt.state,'approved');assert.equal(receipt.packageSha256,prepared.sha256);assert.equal(receipt.founderId,95836629);assert.equal('approvedAt'in receipt,false);assert.equal('approvalId'in receipt,false);});

test('backend approval refuses old web crosspurpose source attempt environment and ambiguous official history',async()=>{const api=await subject(),prepared=api.prepareBackendReleaseIntent(input(),expected()),entry=backendApprovals(prepared.comment)[0];for(const rows of[[],[entry,entry],[{...entry,state:'rejected'}],[{...entry,state:'pending'}],[{...entry,user:{...entry.user,type:'Bot'}}],[{...entry,user:{...entry.user,id:1}}],[{...entry,user:{...entry.user,login:'other'}}],[{...entry,environments:[{id:124,name:'staging'}]}],[{...entry,environments:[{id:123,name:'production'}]}],[{...entry,comment:prepared.comment.replace('backend staging','release')}],[{...entry,comment:prepared.comment.replace('attempt=1','attempt=2')}],[{...entry,comment:'Task approved'}]])assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,rows,expected()));for(const patch of[{path:'.github/workflows/release.yml'},{event:'workflow_run'},{run_attempt:2},{id:52},{head_sha:base},{head_branch:'feature'},{repository:{full_name:'fork/Cuevo'}}])assert.throws(()=>api.validateFounderBackendApproval(prepared,{...expected().backendRun,...patch},backendApprovals(prepared.comment),expected()));});

test('backend official approval cannot borrow inherited or accessor comments and malformed unrelated evidence remains refused',async()=>{const api=await subject(),prepared=api.prepareBackendReleaseIntent(input(),expected()),target=backendApprovals(prepared.comment)[0];let reads=0;const getter={...target,get comment(){reads++;return prepared.comment;}};assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[getter],expected()));const proxy=new Proxy(target,{get(){reads++;return prepared.comment;}});assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[proxy],expected()));const missing:Record<string,unknown>={...target};delete missing.comment;const original=Object.getOwnPropertyDescriptor(Object.prototype,'comment');try{Object.defineProperty(Object.prototype,'comment',{configurable:true,get(){reads++;return prepared.comment;}});assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[missing],expected()));}finally{if(original)Object.defineProperty(Object.prototype,'comment',original);else delete(Object.prototype as Record<string,unknown>).comment;}assert.equal(reads,0);const other={...target,state:'rejected',environments:[{id:124,name:'production'}],comment:'Other reviewed environment'};assert.equal(api.validateFounderBackendApproval(prepared,expected().backendRun,[other,target],expected()).state,'approved');assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[{...other,state:'UNKNOWN'},target],expected()));});

test('backend approval repeats immutable package current main CI and artifact bindings before accepting official comments',async()=>{const api=await subject(),prepared=api.prepareBackendReleaseIntent(input(),expected()),rows=backendApprovals(prepared.comment);for(const patch of[{sha256:'0'.repeat(64)},{base64:Buffer.from('{}').toString('base64')},{canonicalJson:prepared.canonicalJson+' '},{comment:prepared.comment+' '}])assert.throws(()=>api.validateFounderBackendApproval({...prepared,...patch},expected().backendRun,rows,expected()));for(const patch of[{currentMainSha:base},{ciRun:{...expected().ciRun,conclusion:'failure'}},{treeSha:base},{fingerprints:{...fingerprints,edgeArtifactSha256:'0'.repeat(64)}}])assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,rows,{...expected(),...patch}));assert.equal(api.validateFounderBackendApproval(prepared,{...expected().backendRun,status:'in_progress'},rows,expected()).state,'approved');});
