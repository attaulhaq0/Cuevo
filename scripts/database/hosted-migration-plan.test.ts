import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const projectRef = 'mqxdjvsyckzocokuikmx';
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const source = { sha: 'a'.repeat(40), tree: 'b'.repeat(40) };
const now = Date.parse('2026-10-06T00:00:00Z');
const sources = () => readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).map(name => ({ name, bytes: readFileSync('supabase/migrations/' + name) }));
const target = () => ({ projectRef, boundProjectRef: projectRef, projectName: 'Cuevo', projectStatus: 'ACTIVE_HEALTHY', deploymentEnvironment: 'synthetic-staging' as const, observedAt: '2026-10-05T23:00:00Z', authUsers: 0, storageObjects: 0, appSchemas: [] as string[], migrationVersions: [] as string[], dispatchDisabled: true, population: 'EMPTY' as 'EMPTY' | 'GUARDED_SYNTHETIC' });
async function api() {
  const path = resolve(import.meta.dirname, 'hosted-migration-plan.ts');
  let module: Record<string, unknown> = {};
  try { module = await import(pathToFileURL(path).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.planHostedMigrations, 'function', 'metadata-only hosted migration planner is implemented');
  return module as typeof import('./hosted-migration-plan');
}
function git(cwd: string, ...args: string[]) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim(); }
function fixture(run: (root: string, sha: string, tree: string) => void | Promise<void>, complete = false) {
  const root = mkdtempSync(join(tmpdir(), 'cuevo-migration-plan-'));
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(root, '.gitattributes'), '* text eol=lf\n');
  if (complete) for (const row of sources()) writeFileSync(join(root, 'supabase/migrations', row.name), row.bytes);
  else writeFileSync(join(root, 'supabase/migrations/20260101000000_example.sql'), 'begin;\nselect 1;\ncommit;\n');
  writeFileSync(join(root, 'README.md'), 'Synthetic Git fixture\n');
  git(root, 'init', '--quiet'); git(root, 'add', '.');
  git(root, '-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'synthetic migration source');
  const sha = git(root, 'rev-parse', 'HEAD'), tree = git(root, 'rev-parse', 'HEAD^{tree}');
  return Promise.resolve().then(() => run(root, sha, tree)).finally(() => rmSync(root, { recursive: true, force: true }));
}

test('initial plan retains every original migration and both nonlexical dependencies without SQL or activation', async () => {
  const { planHostedMigrations } = await api();
  const plan = planHostedMigrations({ sources: sources(), source, target: target(), now });
  assert.equal(plan.mode, 'EMPTY_INITIAL'); assert.equal(plan.provenance, 'CALLER_SUPPLIED_SOURCE');
  assert.equal(plan.dispatch, 'DISABLED'); assert.equal(plan.seed, 'DISABLED'); assert.equal(plan.vault, 'DISABLED');
  assert.equal(plan.migrations.length, sources().length); assert.equal(plan.pending.length, sources().length);
  const names = plan.migrations.map(row => row.name);
  assert.ok(names.indexOf('20261002021737_native_academic_source_identity.sql') < names.indexOf('20261002021206_curriculum_context_lifecycle.sql'));
  assert.ok(names.indexOf('20261002204500_posthog_environment_claim.sql') < names.indexOf('20261002195537_posthog_intelligence_observability.sql'));
  assert.equal(new Set(names).size, names.length);
  assert.equal(plan.migrations.find(row => row.version === '20261001211007')?.sha256, digest(Buffer.alloc(0)));
  assert.equal(JSON.stringify(plan).includes('create function'), false);
});

test('initial plan refuses foreign, stale, unknown and populated targets', async () => {
  const { planHostedMigrations } = await api();
  for (const patch of [{ boundProjectRef: 'c'.repeat(20) }, { deploymentEnvironment: 'production' }, { projectName: 'Other' }, { projectStatus: 'PAUSED' }, { observedAt: '2026-10-04T00:00:00Z' }, { observedAt: '2026-10-07T00:00:00Z' }, { authUsers: 1 }, { storageObjects: 1 }, { appSchemas: ['app'] }, { dispatchDisabled: false }, { authUsers: null }, { extra: true }]) {
    assert.throws(() => planHostedMigrations({ sources: sources(), source, target: { ...target(), ...patch }, now }));
  }
});

test('incremental history is the exact reviewed ordered prefix and only missing compatible rows remain pending', async () => {
  const { planHostedMigrations } = await api();
  const initial = planHostedMigrations({ sources: sources(), source, target: target(), now });
  const applied = initial.migrations.slice(0, initial.stages[0].names.length + initial.stages[1].names.length);
  const current = { ...target(), authUsers: 133, appSchemas: ['internal', 'app', 'authorization'], population: 'GUARDED_SYNTHETIC' as const, migrationVersions: [...applied.map(row => row.version)].reverse() };
  const priorReceipt = { projectRef, sourceSha: source.sha, treeSha: source.tree, migrations: applied.map(({ version, sha256 }) => ({ version, sha256 })) };
  const plan = planHostedMigrations({ sources: sources(), source, target: current, priorReceipt, now });
  assert.equal(plan.mode, 'INCREMENTAL');
  assert.deepEqual(plan.pending.map(row => row.version), initial.migrations.slice(applied.length).map(row => row.version));
  assert.equal(plan.pending.some(row => row.version === '20261002021737'), false);
  assert.equal(plan.provenance, 'CALLER_SUPPLIED_SOURCE');
  for (const receipt of [undefined, { ...priorReceipt, projectRef: 'c'.repeat(20) }, { ...priorReceipt, migrations: applied.slice(1) }, { ...priorReceipt, migrations: [...priorReceipt.migrations, priorReceipt.migrations[0]] }, { ...priorReceipt, migrations: priorReceipt.migrations.map((row, index) => index === 0 ? { ...row, sha256: '0'.repeat(64) } : row) }]) {
    assert.throws(() => planHostedMigrations({ sources: sources(), source, target: current, priorReceipt: receipt, now }));
  }
  assert.throws(() => planHostedMigrations({ sources: sources(), source, target: { ...current, migrationVersions: applied.filter(row => row.version !== '20261002021737').map(row => row.version) }, priorReceipt, now }));
});

test('a completed prior release admits one append-only migration without treating its full prefix as an unknown partial stage', async () => {
  const { planHostedMigrations } = await api(), original = sources();
  const installed = planHostedMigrations({ sources: original, source, target: target(), now });
  const appended = { name: '20261007000000_verified_incremental_fixture.sql', bytes: Buffer.from('begin; select 1; commit;\n') };
  const priorReceipt = { projectRef, sourceSha: source.sha, treeSha: source.tree, migrations: installed.migrations.map(({ version, sha256 })=>({version,sha256})), completedSourceMigrationCount: installed.migrations.length };
  const current = { ...target(), authUsers:133,appSchemas:['app','internal','authorization'],population:'GUARDED_SYNTHETIC',migrationVersions:installed.migrations.map(row=>row.version) };
  const plan = planHostedMigrations({ sources:[...original,appended],source:{sha:'c'.repeat(40),tree:'d'.repeat(40)},target:current,priorReceipt,now });
  assert.equal(plan.mode,'INCREMENTAL'); assert.deepEqual(plan.pending.map(row=>row.name),[appended.name]);
  assert.throws(()=>planHostedMigrations({sources:[...original,appended],source,target:current,priorReceipt:{...priorReceipt,completedSourceMigrationCount:installed.migrations.length+1},now}));
  assert.throws(()=>planHostedMigrations({sources:[...original,appended],source,target:current,priorReceipt:{...priorReceipt,migrations:priorReceipt.migrations.slice(0,-1)},now}));
});

test('canonical source loader reads actual Git blobs and ignores CRLF checkout serialization', async () => {
  const { readCanonicalMigrationSources } = await api();
  await fixture((root, sha, tree) => {
    const path = join(root, 'supabase/migrations/20260101000000_example.sql');
    writeFileSync(path, 'begin;\r\nselect 1;\r\ncommit;\r\n');
    const loaded = readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree });
    assert.equal(loaded.provenance.kind, 'VERIFIED_GIT_BLOBS');
    assert.equal(loaded.sources.length, 1);
    assert.equal(Buffer.from(loaded.sources[0].bytes).toString(), 'begin;\nselect 1;\ncommit;\n');
    assert.notEqual(digest(loaded.sources[0].bytes), digest(readFileSync(path)));
  });
});

test('source loader refuses wrong SHA/tree, working migration changes and additional authored migrations', async () => {
  const { readCanonicalMigrationSources } = await api();
  await fixture((root, sha, tree) => {
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: 'HEAD', treeSha: tree }));
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: '0'.repeat(40), treeSha: tree }));
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: '0'.repeat(40) }));
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: 'relative-root', sourceSha: sha, treeSha: tree }));
    writeFileSync(join(root, 'supabase/migrations/20260101000000_example.sql'), 'select 2;\n');
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree }));
    git(root, 'checkout', '--', 'supabase/migrations/20260101000000_example.sql');
    writeFileSync(join(root, 'supabase/migrations/20260101000001_added.sql'), 'select 3;\n');
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree }));
  });
});

test('actual repository canonical migration loader retains the current complete source while unrelated edits remain separate', async () => {
  const { readCanonicalMigrationSources } = await api();
  const root = resolve(import.meta.dirname, '../..');
  const sha = git(root, 'rev-parse', 'HEAD'), tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const loaded = readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree });
  assert.equal(loaded.sources.length, sources().length);
  assert.equal(loaded.provenance.sourceSha, sha); assert.equal(loaded.provenance.treeSha, tree);
  const native = loaded.sources.find(row => row.name === '20261002021737_native_academic_source_identity.sql');
  assert.ok(native); assert.equal(digest(native.bytes), '52066e47c55d0529d9a5bd3e2295fdceaffad64ecd40a71366c426d087872bac');
});


test('release entry refuses unrelated tracked drift while the migration loader remains scoped', async () => {
  const { readCanonicalMigrationSources, createCanonicalHostedMigrationPlan } = await api();
  await fixture((root, sha, tree) => {
    writeFileSync(join(root, 'README.md'), 'Changed unrelated tracked source\n');
    assert.equal(readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree }).sources.length, 1);
    assert.throws(() => createCanonicalHostedMigrationPlan({ repoRoot: root, sourceSha: sha, treeSha: tree, target: target(), now }));
  });
});

test('loader rejects replacement refs and canonical metadata has reproducible content hashes', async () => {
  const { readCanonicalMigrationSources, planHostedMigrations, canonicalHostedMigrationPlan } = await api();
  await fixture((root, sha, tree) => {
    git(root, 'replace', sha, sha);
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree }));
  });
  const plan = planHostedMigrations({ sources: sources(), source, target: target(), now });
  const emitted = canonicalHostedMigrationPlan(plan);
  assert.equal(emitted.sha256, digest(emitted.json));
  assert.deepEqual(JSON.parse(emitted.json), plan);
  assert.deepEqual(emitted, canonicalHostedMigrationPlan(planHostedMigrations({ sources: [...sources()].reverse(), source, target: target(), now })));
});


test('incremental plan refuses a partial deployment stage even with matching prior hashes', async () => {
  const { planHostedMigrations } = await api();
  const initial = planHostedMigrations({ sources: sources(), source, target: target(), now });
  const applied = initial.migrations.slice(0, initial.stages[0].names.length - 1);
  const current = { ...target(), authUsers: 133, appSchemas: ['app', 'internal', 'authorization'], population: 'GUARDED_SYNTHETIC' as const, migrationVersions: applied.map(row => row.version) };
  assert.throws(() => planHostedMigrations({ sources: sources(), source, target: current, priorReceipt: { projectRef, sourceSha: source.sha, treeSha: source.tree, migrations: applied.map(({ version, sha256 }) => ({ version, sha256 })) }, now }));
});

test('loader refuses symbolic linked migration bytes and staged drift before presenting Git provenance', async () => {
  const { readCanonicalMigrationSources } = await api();
  await fixture((root, _sha, _tree) => {
    const blob = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], { input: 'outside.sql', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }).trim();
    git(root, 'update-index', '--cacheinfo', '120000,' + blob + ',supabase/migrations/20260101000000_example.sql');
    git(root, '-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'synthetic linked migration');
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: git(root, 'rev-parse', 'HEAD'), treeSha: git(root, 'rev-parse', 'HEAD^{tree}') }));
  });
});

test('canonical serialization refuses injected authority, omitted state and accessor payloads', async () => {
  const { planHostedMigrations, canonicalHostedMigrationPlan } = await api();
  const plan = planHostedMigrations({ sources: sources(), source, target: target(), now });
  for (const value of [{ ...plan, success: true }, { ...plan, provenance: 'VERIFIED_GIT_BLOBS' }, { ...plan, dispatch: 'ENABLED' }]) assert.throws(() => canonicalHostedMigrationPlan(value as typeof plan));
  let read = false;
  const accessor = { ...plan, get projectRef() { read = true; return projectRef; } };
  assert.throws(() => canonicalHostedMigrationPlan(accessor)); assert.equal(read, false);
});


test('raw working SQL drift cannot hide behind Git assume-unchanged metadata', async () => {
  const { readCanonicalMigrationSources } = await api();
  await fixture((root, sha, tree) => {
    git(root, 'update-index', '--assume-unchanged', 'supabase/migrations/20260101000000_example.sql');
    writeFileSync(join(root, 'supabase/migrations/20260101000000_example.sql'), 'select 99;\n');
    assert.throws(() => readCanonicalMigrationSources({ repoRoot: root, sourceSha: sha, treeSha: tree }));
  });
});


test('clean canonical release entry binds actual migration provenance and verifies previous committed receipt source', async () => {
  const { createCanonicalHostedMigrationPlan, canonicalHostedMigrationPlan } = await api();
  await fixture((root, sha, tree) => {
    const result = createCanonicalHostedMigrationPlan({ repoRoot: root, sourceSha: sha, treeSha: tree, target: target(), now });
    assert.equal(result.sourceProvenance.kind, 'VERIFIED_GIT_BLOBS');
    assert.equal(result.plan.provenance, 'CALLER_SUPPLIED_SOURCE');
    assert.equal(result.priorReceiptProvenance, 'NOT_APPLICABLE');
    assert.equal(JSON.parse(canonicalHostedMigrationPlan(result.plan).json).source.sha, sha);
    const priorReceipt = { projectRef, sourceSha: sha, treeSha: '0'.repeat(40), migrations: result.plan.migrations.map(({ version, sha256 }) => ({ version, sha256 })) };
    const current = { ...target(), population: 'GUARDED_SYNTHETIC' as const, authUsers: 133, appSchemas: ['app', 'internal', 'authorization'], migrationVersions: result.plan.migrations.map(row => row.version) };
    assert.throws(() => createCanonicalHostedMigrationPlan({ repoRoot: root, sourceSha: sha, treeSha: tree, target: current, priorReceipt, now }));
  }, true);
});

test('canonical completed Git source admits an append-only delta and preserves exact historical provenance', async () => {
 const { createCanonicalHostedMigrationPlan,verifyCompletedMigrationPrefix }=await api();
 await fixture(async(root,priorSha,priorTree)=>{
  const initial=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:priorSha,treeSha:priorTree,target:target(),now});
  const count=initial.plan.migrations.length;
  const appended='20261007120000_verified_canonical_append.sql';
  writeFileSync(join(root,'supabase/migrations',appended),'begin;\nselect 1;\ncommit;\n');
  git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','append one immutable migration');
  const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}');
  const priorReceipt={projectRef,sourceSha:priorSha,treeSha:priorTree,migrations:initial.plan.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:count};
  const populated={...target(),authUsers:133,storageObjects:11,appSchemas:['app','authorization','internal'],population:'GUARDED_SYNTHETIC' as const,migrationVersions:initial.plan.migrations.map(row=>row.version)};
  const current=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:populated,priorReceipt,now});
  assert.equal(current.plan.migrations.length,count+1);assert.equal(current.plan.applied.length,count);assert.deepEqual(current.plan.pending.map(row=>row.name),[appended]);
  assert.equal(current.priorReceiptProvenance,'VERIFIED_PRIOR_GIT_SOURCE_HASHES_ONLY');assert.equal(verifyCompletedMigrationPrefix(root,current.plan),true);
  assert.deepEqual(current.plan.priorCompletedRelease,{sourceSha:priorSha,treeSha:priorTree,migrationCount:count});
  assert.deepEqual(current.plan.stages.slice(0,-1).map(stage=>stage.names),[[],[],[]]);
  for(const change of [{...priorReceipt,treeSha:'0'.repeat(40)},{...priorReceipt,completedSourceMigrationCount:count-1},{...priorReceipt,migrations:priorReceipt.migrations.map((row,index)=>index===0?{...row,sha256:'0'.repeat(64)}:row)}])assert.throws(()=>createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:populated,priorReceipt:change,now}));
 },true);
});

test('completed canonical populated source with no delta has no pending SQL and cannot forge completion for a partial historical tree', async () => {
 const { createCanonicalHostedMigrationPlan,verifyCompletedMigrationPrefix }=await api();
 await fixture(async(root,sha,tree)=>{
  const initial=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:sha,treeSha:tree,target:target(),now});
  const receipt={projectRef,sourceSha:sha,treeSha:tree,migrations:initial.plan.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.plan.migrations.length};
  const populated={...target(),authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],population:'GUARDED_SYNTHETIC' as const,migrationVersions:receipt.migrations.map(row=>row.version)};
  const current=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:sha,treeSha:tree,target:populated,priorReceipt:receipt,now});
  assert.equal(current.plan.pending.length,0);assert.ok(current.plan.stages.every(stage=>stage.names.length===0));assert.equal(verifyCompletedMigrationPrefix(root,current.plan),true);
  const partial=receipt.migrations.slice(0,-1),bad={...receipt,migrations:partial,completedSourceMigrationCount:partial.length};
  assert.throws(()=>createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:sha,treeSha:tree,target:{...populated,migrationVersions:partial.map(row=>row.version)},priorReceipt:bad,now}));
 },true);
});

test('verified committed schema stage can resume before population without claiming a completed source release',async()=>{
 const subject=await api();const initial=subject.planHostedMigrations({sources:sources(),source,target:target(),now}),applied=initial.migrations.slice(0,initial.stages[0].names.length);
 const current={...target(),population:'SCHEMA_ONLY',authUsers:0,storageObjects:3,appSchemas:['app','authorization','internal'],migrationVersions:applied.map(row=>row.version)};
 const priorReceipt={projectRef,sourceSha:source.sha,treeSha:source.tree,migrations:applied.map(({version,sha256})=>({version,sha256}))};
 const continued=subject.planHostedMigrations({sources:sources(),source,target:current,priorReceipt,now});
 assert.equal(continued.mode,'INCREMENTAL');assert.equal(continued.priorCompletedRelease,undefined);assert.deepEqual(continued.priorSchemaRelease,{sourceSha:source.sha,treeSha:source.tree,migrationCount:applied.length});assert.equal(continued.stages[0].names.length,0);assert.equal(continued.pending.length,initial.migrations.length-applied.length);
 assert.throws(()=>subject.planHostedMigrations({sources:sources(),source,target:{...current,authUsers:1},priorReceipt,now}));
 assert.throws(()=>subject.planHostedMigrations({sources:sources(),source,target:current,priorReceipt:{...priorReceipt,migrations:priorReceipt.migrations.slice(0,-1)},now}));
});

test('bounded historical Git batches retain each exact original migration byte and reject changed tree identity',async()=>{
 const subject=await api();const root=resolve(import.meta.dirname,'../..'),sha=git(root,'rev-parse','HEAD'),tree=git(root,'rev-parse','HEAD^{tree}');
 const historical=subject.readHistoricalMigrationSources(root,sha,tree),current=subject.readCanonicalMigrationSources({repoRoot:root,sourceSha:sha,treeSha:tree});
 assert.deepEqual(historical.map(row=>({name:row.name,sha256:digest(row.bytes)})),current.sources.map(row=>({name:row.name,sha256:digest(row.bytes)})));
 assert.throws(()=>subject.readHistoricalMigrationSources(root,sha,'0'.repeat(40)));
});

test('canonical source acquisition batches real Git blobs and refuses incomplete or wrong transport bytes without dropping physical checks',async()=>{
 const subject=await api();await fixture(async(root)=>{
  for(let index=2;index<=33;index++)writeFileSync(join(root,'supabase/migrations',`20260101${String(index).padStart(6,'0')}_source_fixture.sql`),`select ${index};\n`);
  git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Many immutable sources');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}');
  const childProcess=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),original=childProcess.execFileSync,calls:string[][]=[];let corruption:'none'|'truncated'|'wrong-id'='none';
  childProcess.execFileSync=((file:string,args:string[],options:unknown)=>{
   if(file==='git')calls.push([...args]);const output=original(file,args,options as Parameters<typeof execFileSync>[2]);
   if(file==='git'&&args.includes('--batch')&&Buffer.isBuffer(output)){if(corruption==='truncated')return output.subarray(0,output.length-1);if(corruption==='wrong-id')return Buffer.concat([Buffer.from('0'.repeat(40)),output.subarray(40)]);}
   return output;
  }) as typeof execFileSync;syncBuiltinESMExports();
  try{
   const loaded=subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha});assert.equal(loaded.sources.length,33);assert.equal(calls.some(args=>args.includes('cat-file')&&args.includes('blob')),false,'one process per migration cannot consume the freshness window');assert.ok(calls.filter(args=>args.includes('--batch')).length<=3);
   for(const row of loaded.sources)assert.deepEqual(Buffer.from(row.bytes),readFileSync(join(root,'supabase/migrations',row.name)));
   for(const value of ['truncated','wrong-id'] as const){corruption=value;assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}));}
   corruption='none';git(root,'update-index','--assume-unchanged','supabase/migrations/20260101000000_example.sql');writeFileSync(join(root,'supabase/migrations/20260101000000_example.sql'),'select 999;\n');assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}));
  }finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
 });
});

test('completed-prefix and canonical prior receipts share exact historical batches without per-migration Git reads',async()=>{
 const subject=await api();await fixture(async(root,priorSha,priorTree)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:priorSha,treeSha:priorTree,target:target(),now}).plan;
  writeFileSync(join(root,'supabase/migrations/20261007150000_completed_batch_delta.sql'),'begin; select 1; commit;\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','One exact appended source');
  const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}'),priorReceipt={projectRef,sourceSha:priorSha,treeSha:priorTree,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length},current={...target(),population:'GUARDED_SYNTHETIC',authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)};
  const childProcess=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),original=childProcess.execFileSync,calls:string[][]=[];let corrupt=false;
  childProcess.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);const output=original(file,args,options as Parameters<typeof execFileSync>[2]);return file==='git'&&args.includes('--batch')&&corrupt&&Buffer.isBuffer(output)?output.subarray(0,output.length-1):output;}) as typeof execFileSync;syncBuiltinESMExports();
  try{
   const result=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:current,priorReceipt,now});assert.equal(subject.verifyCompletedMigrationPrefix(root,result.plan),true);assert.deepEqual(result.plan.pending.map(row=>row.name),['20261007150000_completed_batch_delta.sql']);assert.equal(calls.some(args=>args.includes('show')&&args.some(value=>value.startsWith(priorSha+':supabase/migrations/'))),false,'verified prior bytes must not spawn one Git process per migration');
   for(const priorCompletedRelease of [{...result.plan.priorCompletedRelease!,treeSha:'0'.repeat(40)},{...result.plan.priorCompletedRelease!,migrationCount:initial.migrations.length-1},{...result.plan.priorCompletedRelease!,sourceSha:'0'.repeat(40)}])assert.throws(()=>subject.verifyCompletedMigrationPrefix(root,{...result.plan,priorCompletedRelease}));
   corrupt=true;assert.throws(()=>subject.verifyCompletedMigrationPrefix(root,result.plan));corrupt=false;
   assert.throws(()=>subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:current,priorReceipt:{...priorReceipt,migrations:priorReceipt.migrations.map((row,index)=>index?row:{...row,sha256:'0'.repeat(64)})},now}));
  }finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
 },true);
});

test('active installed runtime can prepare only an explicit same-source read-only zero-pending plan',async()=>{
 const subject=await api();assert.equal(typeof subject.createCanonicalInstalledRuntimePlan,'function');
 const method=subject.createCanonicalInstalledRuntimePlan;
 await fixture(async(root,sha,tree)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:sha,treeSha:tree,target:target(),now}).plan;
  const priorReceipt={projectRef,sourceSha:sha,treeSha:tree,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length};
  const active={...target(),population:'ACTIVE_SYNTHETIC',dispatchDisabled:false,authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)};
  const input={repoRoot:root,sourceSha:sha,treeSha:tree,target:active,priorReceipt,now,operation:'INSTALLED_RUNTIME_READ_ONLY' as const};
  const result=method(input);assert.equal(result.plan.runtimeOnly,true);assert.equal(result.plan.pending.length,0);assert.ok(result.plan.stages.every(stage=>!stage.names.length));
  assert.throws(()=>subject.createCanonicalHostedMigrationPlan(input));
  assert.throws(()=>method({...input,operation:'MIGRATE'} as unknown as typeof input));
  assert.throws(()=>method({...input,target:{...active,migrationVersions:active.migrationVersions.slice(0,-1)}}));
 },true);
});

test('canonical schema-only prefix at a former full-source boundary admits only a new committed append',async()=>{
 const subject=await api();await fixture(async(root,sourceSha,treeSha)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,prior={projectRef,sourceSha,treeSha,migrations:initial.migrations.map(({version,sha256})=>({version,sha256}))};
  const append='20261007140000_schema_only_delta.sql';writeFileSync(join(root,'supabase/migrations',append),'begin; select 1; commit;\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','append after completed schema without population');
  const current={...target(),population:'SCHEMA_ONLY',authUsers:0,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)};
  const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:git(root,'rev-parse','HEAD'),treeSha:git(root,'rev-parse','HEAD^{tree}'),target:current,priorReceipt:prior,now}).plan;
  assert.deepEqual(plan.pending.map(row=>row.name),[append]);assert.equal(plan.priorCompletedRelease,undefined);assert.equal(subject.verifyPriorSchemaPrefix(root,plan),true);
  const forged={...plan,priorSchemaRelease:{...plan.priorSchemaRelease!,migrationCount:plan.priorSchemaRelease!.migrationCount-1}};assert.throws(()=>subject.verifyPriorSchemaPrefix(root,forged));
 },true);
});
