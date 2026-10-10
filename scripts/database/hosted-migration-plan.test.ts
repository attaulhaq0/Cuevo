import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
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
test('closed child144 plan retains marker124 and omits only the source-verified installed first20 migrations',async()=>{
 const subject=await api(),input=(await import('./hosted-original-child-recovery.fixture')).originalChildRecoveryPlanFixture({sha:'a'.repeat(40),tree:'b'.repeat(40)}),plan=subject.planHostedMigrations(input);assert.equal(plan.applied.length,144);assert.equal(plan.pending.length,87);assert.equal(plan.stages[0].names.length,0);assert.equal(plan.stages[1].names.length,0);assert.equal(plan.stages[2].names.length,36);assert.equal(plan.stages[2].names[0],input.originalChildRecovery.template.stageRows[144].name);assert.equal(plan.priorSchemaRelease?.migrationCount,124);assert.equal(plan.priorCompletedRelease,undefined);assert.equal((plan as unknown as{reconciledChild:{observedMigrationCount:number}}).reconciledChild.observedMigrationCount,144);assert.equal(subject.canonicalHostedMigrationPlan(plan).sha256.length,64);
 for(const mode of ['missing','fake-prior144','reference','marker','partial145','foreign','rows']){const changed=structuredClone(input);if(mode==='missing'||mode==='fake-prior144')delete(changed as{originalChildRecovery?:unknown}).originalChildRecovery;if(mode==='fake-prior144')changed.priorReceipt.migrations=input.originalChildRecovery.template.stageRows.slice(0,144).map(({version,sha256})=>({version,sha256}));if(mode==='reference')delete(changed.originalChildRecovery as{catalogueReference?:unknown}).catalogueReference;if(mode==='marker')changed.originalChildRecovery.installedMarker.migrationCount=144;if(mode==='partial145')changed.target.migrationVersions.push(changed.sources[144].name.slice(0,14));if(mode==='foreign')changed.originalChildRecovery.template.selection.originalRunId='38009133497';if(mode==='rows')changed.originalChildRecovery.template.stageRows[124].sha256='f'.repeat(64);assert.throws(()=>subject.planHostedMigrations(changed),mode);}
});

test('canonical planning source observations preserve public results and expose only the actual acquired SQL bytes',async()=>{
 const subject=await api();assert.equal(typeof (subject as unknown as Record<string,unknown>).createCanonicalHostedMigrationPlanAndSources,'function');
 await fixture(async(root,sourceSha,treeSha)=>{
  const observed=subject.createCanonicalHostedMigrationPlanAndSources({repoRoot:root,sourceSha,treeSha,target:target(),now}),ordinary=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now});
  assert.deepEqual(observed.result,ordinary);assert.deepEqual(Object.keys(observed.result).sort(),['plan','priorReceiptProvenance','sourceProvenance']);assert.equal(observed.sources.length,ordinary.plan.migrations.length);
  for(const row of observed.result.plan.migrations)assert.equal(createHash('sha256').update(observed.sources.find(source=>source.name===row.name)!.bytes).digest('hex'),row.sha256);
  const prior={projectRef,sourceSha,treeSha,migrations:ordinary.plan.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:ordinary.plan.migrations.length},active={...target(),population:'ACTIVE_SYNTHETIC',authUsers:133,appSchemas:['app','authorization','internal'],dispatchDisabled:false,migrationVersions:ordinary.plan.migrations.map(row=>row.version)},input={repoRoot:root,sourceSha,treeSha,target:active,priorReceipt:prior,now};
  const wrappers=[['createCanonicalInstalledRuntimePlanAndSources','createCanonicalInstalledRuntimePlan','INSTALLED_RUNTIME_READ_ONLY'],['createCanonicalPendingRuntimeConfirmationPlanAndSources','createCanonicalPendingRuntimeConfirmationPlan','PENDING_RUNTIME_CONFIRMATION'],['createCanonicalRuntimeRolloutPlanAndSources','createCanonicalRuntimeRolloutPlan','RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE']]as const;
  for(const [name,original,operation]of wrappers){const args={...input,operation},wrapperObservation=(subject[name]as (value:unknown)=>typeof observed)(args);assert.deepEqual(wrapperObservation.result,(subject[original]as (value:unknown)=>unknown)(args));assert.equal(wrapperObservation.result.plan.runtimeOnly,true);assert.equal(wrapperObservation.sources.length,ordinary.plan.migrations.length);assert.throws(()=> (subject[name]as(value:unknown)=>unknown)({...args,priorReceipt:{...prior,migrations:prior.migrations.slice(1)}}));}
  git(root,'update-index','--assume-unchanged','supabase/migrations/'+ordinary.plan.migrations[0].name);writeFileSync(join(root,'supabase/migrations',ordinary.plan.migrations[0].name),'select 999;\n');assert.throws(()=>subject.createCanonicalHostedMigrationPlanAndSources({repoRoot:root,sourceSha,treeSha,target:target(),now}));
 },true);
});
test('pending confirmation no-op plan is verified against actual complete source and refuses a forged active history',async()=>{const subject=await api();assert.equal(typeof subject.createCanonicalPendingRuntimeConfirmationPlan,'function');await fixture(async(root,sourceSha,treeSha)=>{const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,prior={projectRef,sourceSha,treeSha,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length},active={...target(),population:'ACTIVE_SYNTHETIC',authUsers:133,appSchemas:['app','authorization','internal'],dispatchDisabled:false,migrationVersions:initial.migrations.map(row=>row.version)},input={repoRoot:root,sourceSha,treeSha,target:active,priorReceipt:prior,now,operation:'PENDING_RUNTIME_CONFIRMATION' as const};const result=subject.createCanonicalPendingRuntimeConfirmationPlan(input);assert.equal(result.plan.runtimeOnly,true);assert.equal(result.plan.pending.length,0);assert(result.plan.stages.every(row=>row.names.length===0));assert.equal(result.sourceProvenance.kind,'VERIFIED_GIT_BLOBS');assert.throws(()=>subject.createCanonicalPendingRuntimeConfirmationPlan({...input,priorReceipt:{...prior,migrations:prior.migrations.slice(1)}}));assert.throws(()=>subject.createCanonicalPendingRuntimeConfirmationPlan({...input,treeSha:'f'.repeat(40)}));assert.throws(()=>subject.createCanonicalPendingRuntimeConfirmationPlan({...input,target:{...active,migrationVersions:active.migrationVersions.slice(1)}}));},true);});
function fixture(run: (root: string, sha: string, tree: string) => void | Promise<void>, complete = false, retainLooseObjects = false) {
  const root = mkdtempSync(join(tmpdir(), 'cuevo-migration-plan-'));
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(root, '.gitattributes'), '* text eol=lf\n');
  if (complete) for (const row of sources()) writeFileSync(join(root, 'supabase/migrations', row.name), row.bytes);
  else writeFileSync(join(root, 'supabase/migrations/20260101000000_example.sql'), 'begin;\nselect 1;\ncommit;\n');
  writeFileSync(join(root, 'README.md'), 'Synthetic Git fixture\n');
  git(root, 'init', '--quiet');
  // Object-loss cases must retain the exact loose objects they remove, before any fixture commit can launch maintenance.
  if (retainLooseObjects) git(root, 'config', 'maintenance.auto', 'false');
  git(root, 'add', '.');
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
  const appended = { name: '20261009000000_verified_incremental_fixture.sql', bytes: Buffer.from('begin; select 1; commit;\n') };
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
  const { readCanonicalMigrationSources,readHistoricalMigrationSources } = await api();
  const root = resolve(import.meta.dirname, '../..');
  const sha = git(root, 'rev-parse', 'HEAD'), tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const childProcess=createRequire(import.meta.url)('node:child_process')as typeof import('node:child_process'),original=childProcess.execFileSync,calls:string[][]=[];
  childProcess.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);return original(file,args,options as Parameters<typeof execFileSync>[2]);})as typeof execFileSync;syncBuiltinESMExports();
  let loaded:ReturnType<typeof readCanonicalMigrationSources>,historical:ReturnType<typeof readHistoricalMigrationSources>;
  const began=performance.now();
  try{loaded=readCanonicalMigrationSources({repoRoot:root,sourceSha:sha,treeSha:tree});assert.equal(calls.filter(args=>args.includes('--batch')).length,1);assert.equal(calls.length,7);assert.equal(calls.filter(args=>args.includes('--show-toplevel')&&args.includes('--is-shallow-repository')).length,1);calls.length=0;historical=readHistoricalMigrationSources(root,sha,tree);assert.equal(calls.filter(args=>args.includes('--batch')).length,1);}
  finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
  assert.equal(loaded.sources.length, sources().length);
  assert.deepEqual(historical.map(row=>({name:row.name,sha256:digest(row.bytes)})),loaded.sources.map(row=>({name:row.name,sha256:digest(row.bytes)})));
  console.log(JSON.stringify({purpose:'CURRENT_MIGRATION_BLOB_TRANSPORT_PARITY',sourceSha:sha,treeSha:tree,migrationCount:loaded.sources.length,canonicalGitCalls:7,canonicalRootPropertyProcesses:1,canonicalBlobProcesses:1,historicalBlobProcesses:1,canonicalAndHistoricalDurationMs:Math.trunc(performance.now()-began),sourceSetSha256:digest(JSON.stringify(loaded.sources.map(row=>({name:row.name,sha256:digest(row.bytes)})))),providerEffects:false,hostedTiming:false}));
  assert.equal(loaded.provenance.sourceSha, sha); assert.equal(loaded.provenance.treeSha, tree);
  const native = loaded.sources.find(row => row.name === '20261002021737_native_academic_source_identity.sql');
  assert.ok(native); assert.equal(digest(native.bytes), '52066e47c55d0529d9a5bd3e2295fdceaffad64ecd40a71366c426d087872bac');
});

test('real committed oversized migration bytes retain per-blob and total limits within the existing transport cap',async()=>{
 const subject=await api();await fixture(async(root)=>{
  const large=Buffer.alloc(2*1024*1024,65),path=join(root,'supabase/migrations/20260101000000_example.sql');
  writeFileSync(path,Buffer.concat([large,Buffer.from('A')]));git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Oversized original blob');
  let sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}');assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}));assert.throws(()=>subject.readHistoricalMigrationSources(root,sourceSha,treeSha));
  writeFileSync(path,large);for(let index=1;index<=8;index++)writeFileSync(join(root,'supabase/migrations',`2026010100000${index}_oversized_total.sql`),large);git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Oversized total original bytes');
  sourceSha=git(root,'rev-parse','HEAD');treeSha=git(root,'rev-parse','HEAD^{tree}');assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}));assert.throws(()=>subject.readHistoricalMigrationSources(root,sourceSha,treeSha));
 });
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

function malformedMetadataLineEnding(result:Buffer,mode:'carriage'|'nul'){
  const delimiter=result.indexOf(0x0a);assert.ok(delimiter>=0,'Metadata fixture requires its original LF delimiter');
  return Buffer.concat([result.subarray(0,delimiter),Buffer.from([mode==='carriage'?0x0d:0x00]),result.subarray(delimiter)]);
}
test('current canonical root properties use one strict multi-result Git query and reject malformed framing',async()=>{
  const original=Buffer.from([0x47,0x80,0x0a,0xff,0x0a]),before=Buffer.from(original);
  assert.deepEqual(malformedMetadataLineEnding(original,'carriage'),Buffer.from([0x47,0x80,0x0d,0x0a,0xff,0x0a]));
  assert.deepEqual(malformedMetadataLineEnding(original,'nul'),Buffer.from([0x47,0x80,0x00,0x0a,0xff,0x0a]));
  assert.deepEqual(original,before);
  assert.throws(()=>malformedMetadataLineEnding(Buffer.from('no metadata delimiter'),'carriage'));
  const subject=await api();await fixture((root,sourceSha,treeSha)=>{
    const cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync,calls:string[][]=[];let mode='ordinary';
    cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);const result=nativeExec(file,args,options as Parameters<typeof execFileSync>[2]);if(file==='git'&&args.includes('--show-toplevel')&&args.includes('--is-shallow-repository')&&Buffer.isBuffer(result)){if(mode==='extra')return Buffer.concat([result,Buffer.from('unexpected\n')]);if(mode==='missing')return Buffer.from(result.toString().split('\n').slice(1).join('\n'));if(mode==='carriage'||mode==='nul')return malformedMetadataLineEnding(result,mode);if(mode==='shallow')return Buffer.from(result.toString().replace('\nfalse\n','\ntrue\n'));if(mode==='scrambled')return Buffer.from(result.toString().split('\n').reverse().join('\n'));}return result;}) as typeof execFileSync;syncBuiltinESMExports();
    try{
      assert.equal(subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}).sources.length,1);
      const metadata=calls.filter(args=>args[2]==='rev-parse'&&!args.at(-1)!.includes(':supabase/migrations'));assert.equal(metadata.length,1,'five canonical root/revision metadata properties must share one current query');
      for(mode of ['extra','missing','carriage','nul','shallow','scrambled'])assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}),mode);
      mode='ordinary';assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha:'0'.repeat(40),treeSha}));assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha:'0'.repeat(40)}));
    }finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
  });
});

test('combined canonical metadata preserves separate worktree and historical graft boundaries',async()=>{
  const subject=await api();await fixture(root=>{
    const worktree=join(root,'.local/canonical-worktree');mkdirSync(join(root,'.local'));git(root,'worktree','add','--detach','--quiet',worktree,'HEAD');
    const sourceSha=git(worktree,'rev-parse','HEAD'),treeSha=git(worktree,'rev-parse','HEAD^{tree}'),input={repoRoot:worktree,sourceSha,treeSha};
    assert.equal(subject.readCanonicalMigrationSources(input).sources.length,1);assert.equal(subject.readHistoricalMigrationSources(worktree,sourceSha,treeSha).length,1);
    const graft=git(worktree,'rev-parse','--git-path','info/grafts'),graftPath=resolve(worktree,graft);mkdirSync(resolve(graftPath,'..'),{recursive:true});writeFileSync(graftPath,sourceSha+'\n');
    assert.throws(()=>subject.readCanonicalMigrationSources(input));assert.throws(()=>subject.readHistoricalMigrationSources(worktree,sourceSha,treeSha));
  });
});

test('owned canonical migration operation acquires immutable SQL once while every read verifies current physical source',async()=>{
  const subject=await api();await fixture(async(root,sourceSha,treeSha)=>{
    const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),fs=createRequire(import.meta.url)('node:fs') as typeof import('node:fs'),nativeExec=cp.execFileSync,nativeRead=fs.readFileSync,crypto=createRequire(import.meta.url)('node:crypto') as typeof import('node:crypto'),nativeHash=crypto.createHash;let blobs=0,currentQueries=0,physicalReads=0,replayLockedHashes=0;
    const first=plan.migrations[0].name;
    cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git'&&args.includes('--batch'))blobs++;if(file==='git'&&args.includes('--show-toplevel')&&args.includes('--is-shallow-repository'))currentQueries++;return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;
    fs.readFileSync=((path:Parameters<typeof nativeRead>[0],options?:unknown)=>{if(String(path)===join(root,'supabase/migrations',first))physicalReads++;return nativeRead(path,options as Parameters<typeof nativeRead>[1]);}) as typeof nativeRead;
    crypto.createHash=((...args:Parameters<typeof nativeHash>)=>{if(new Error().stack?.includes('replayPlan'))replayLockedHashes++;return nativeHash(...args);}) as typeof nativeHash;syncBuiltinESMExports();
    try{
      subject.readCanonicalMigrationSources(input);subject.readCanonicalMigrationSources(input);assert.equal(blobs,2);blobs=0;currentQueries=0;physicalReads=0;replayLockedHashes=0;
      const token=subject.prepareCanonicalMigrationOperation(input),firstRead=subject.readCanonicalMigrationOperation(token,input);for(let index=0;index<3;index++)assert.deepEqual(subject.readCanonicalMigrationOperation(token,input),firstRead);assert.equal(blobs,1);assert.equal(replayLockedHashes,4,'four locked replay source hashes execute once');assert.equal(currentQueries,5);assert.equal(physicalReads,5);assert.deepEqual(firstRead.rows,plan.migrations);assert.deepEqual(firstRead.order,plan.migrations.map(row=>row.name));assert.equal(Object.keys(token as object).length,0);
      firstRead.sources[0].bytes[0]^=1;firstRead.rows[0].sha256='0'.repeat(64);firstRead.replay.before.reverse();assert.deepEqual(subject.readCanonicalMigrationOperation(token,input).rows,plan.migrations);assert.equal(digest(subject.readCanonicalMigrationOperation(token,input).sources[0].bytes),plan.migrations.find(row=>row.name===firstRead.sources[0].name)!.sha256);subject.disposeCanonicalMigrationOperation(token);assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));
    }finally{cp.execFileSync=nativeExec;fs.readFileSync=nativeRead;crypto.createHash=nativeHash;syncBuiltinESMExports();}
  },true);
});

test('canonical migration operations reject wrong bindings descriptors and disposed or foreign tokens without fallback',async()=>{
 const subject=await api();await fixture((root,sourceSha,treeSha)=>{
  const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,input={repoRoot:root,sourceSha,treeSha,plan};let traps=0;
  const token=subject.prepareCanonicalMigrationOperation(input);
  for(const value of[null,{},JSON.parse(JSON.stringify(token)),new Proxy(token,{get(){traps++;throw Error('Private trap');},getPrototypeOf(){traps++;throw Error('Private trap');}})]){assert.throws(()=>subject.readCanonicalMigrationOperation(value,input));assert.throws(()=>subject.disposeCanonicalMigrationOperation(value));}assert.equal(traps,0);subject.readCanonicalMigrationOperation(token,input);
  for(const field of['repoRoot','sourceSha','treeSha','plan'] as const){const held=subject.prepareCanonicalMigrationOperation(input),changed={...input};if(field==='repoRoot')changed.repoRoot=root+'/foreign';if(field==='sourceSha')changed.sourceSha='0'.repeat(40);if(field==='treeSha')changed.treeSha='0'.repeat(40);if(field==='plan')changed.plan={...plan,observedAt:'2026-10-05T22:00:00Z'};assert.throws(()=>subject.readCanonicalMigrationOperation(held,changed));assert.throws(()=>subject.readCanonicalMigrationOperation(held,input));subject.disposeCanonicalMigrationOperation(held);}
  const getter={...input,get plan(){traps++;return plan;}};assert.throws(()=>subject.prepareCanonicalMigrationOperation(getter));const exact=subject.prepareCanonicalMigrationOperation(input);assert.throws(()=>subject.readCanonicalMigrationOperation(exact,getter));assert.equal(traps,0);assert.throws(()=>subject.readCanonicalMigrationOperation(exact,input));subject.disposeCanonicalMigrationOperation(exact);subject.disposeCanonicalMigrationOperation(token);assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));
 },true);
});

test('retained canonical migration source rechecks hidden bytes inventory and current Git state then poisons drift',async()=>{
 const subject=await api();for(const mode of['hidden','untracked','head','graft','replace','filtered']as const)await fixture((root,sourceSha,treeSha)=>{
  const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},token=subject.prepareCanonicalMigrationOperation(input),path='supabase/migrations/'+plan.migrations[0].name,original=readFileSync(join(root,path));
  if(mode==='hidden'){git(root,'update-index','--assume-unchanged',path);writeFileSync(join(root,path),'select 999;\n');}if(mode==='untracked')writeFileSync(join(root,'supabase/migrations/20990101000000_unreviewed.sql'),'select 1;\n');if(mode==='head')git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','--allow-empty','-m','Later HEAD');if(mode==='graft'){const path=git(root,'rev-parse','--git-path','info/grafts');writeFileSync(resolve(root,path),sourceSha+'\n');}if(mode==='replace')git(root,'replace',sourceSha,sourceSha);if(mode==='filtered'){git(root,'update-index','--skip-worktree',path);writeFileSync(join(root,path),Buffer.concat([original,Buffer.from('select 999;\n')]));}
  assert.throws(()=>subject.readCanonicalMigrationOperation(token,input),mode);if(mode==='hidden'||mode==='filtered')writeFileSync(join(root,path),original);assert.throws(()=>subject.readCanonicalMigrationOperation(token,input),'failed source owner must not reacquire after drift');subject.disposeCanonicalMigrationOperation(token);
 },true);
});

test('reentrant current migration reads invalidate the same original source operation',async()=>{
 const subject=await api();await fixture((root,sourceSha,treeSha)=>{
  const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},token=subject.prepareCanonicalMigrationOperation(input),cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync;let reentered=false;
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(!reentered&&file==='git'&&args.includes('--show-toplevel')){reentered=true;assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));}return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;syncBuiltinESMExports();
  try{assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));assert.equal(reentered,true);assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();subject.disposeCanonicalMigrationOperation(token);}
 },true);
});

test('retained migration sources refuse missing original Git blobs and malformed existence metadata',async()=>{
 const subject=await api();await fixture(root=>{
  const path='supabase/migrations/20990101000000_unique_missing_blob.sql';writeFileSync(join(root,path),'select 1; -- '+root+'\n');git(root,'-c','gc.auto=0','add',path);git(root,'-c','gc.auto=0','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Unique original source');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}');
  const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},token=subject.prepareCanonicalMigrationOperation(input),blob=git(root,'rev-parse',sourceSha+':'+path),objects=resolve(root,git(root,'rev-parse','--git-path','objects')),file=resolve(objects,blob.slice(0,2),blob.slice(2));assert.ok(objects.startsWith(root+'\\')||objects.startsWith(root+'/'));assert.ok(file.startsWith(objects+'\\')||file.startsWith(objects+'/'));unlinkSync(file);assert.throws(()=>subject.readCanonicalMigrationSources(input));assert.throws(()=>subject.readCanonicalMigrationOperation(token,input),'a retained operation cannot ignore an absent original blob');subject.disposeCanonicalMigrationOperation(token);
 },true,true);
 await fixture((root,sourceSha,treeSha)=>{
  const plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync;let mode='ordinary';
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{const result=nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);if(file==='git'&&args.includes('--batch-check')&&Buffer.isBuffer(result)){const text=result.toString();if(mode==='extra')return Buffer.concat([result,Buffer.from('extra\n')]);if(mode==='missing')return Buffer.from(text.split('\n').slice(1).join('\n'));if(mode==='type')return Buffer.from(text.replace(' blob ',' tree '));if(mode==='size')return Buffer.from(text.replace(/ blob ([0-9]+)/,' blob 2097153'));if(mode==='id')return Buffer.from('0'.repeat(40)+text.slice(40));}return result;}) as typeof nativeExec;syncBuiltinESMExports();
  try{for(mode of['extra','missing','type','size','id']){const token=subject.prepareCanonicalMigrationOperation(input);assert.throws(()=>subject.readCanonicalMigrationOperation(token,input),mode);assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));subject.disposeCanonicalMigrationOperation(token);}}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
 },true);
});

test('owned prior migration inventories acquire each original historical payload and replay once',async()=>{
 const subject=await api();await fixture((root,priorSha,priorTree)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:priorSha,treeSha:priorTree,target:target(),now}).plan,append='20990101000000_owned_prior_append.sql';writeFileSync(join(root,'supabase/migrations',append),'select 1;\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Append after historical source');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}'),priorReceipt={projectRef,sourceSha:priorSha,treeSha:priorTree,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length},current={...target(),population:'GUARDED_SYNTHETIC',authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)},plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:current,priorReceipt,now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync;let blobs=0,ancestry=0;
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git'&&args.includes('--batch'))blobs++;if(file==='git'&&args.includes('merge-base'))ancestry++;return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;syncBuiltinESMExports();
  try{subject.readVerifiedCompletedMigrationSources(root,plan);subject.readVerifiedCompletedMigrationSources(root,plan);assert.equal(blobs,2);const token=subject.prepareCanonicalMigrationOperation(input);blobs=0;ancestry=0;const first=subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_COMPLETED');assert.ok(first);for(let index=0;index<3;index++)assert.deepEqual(subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_COMPLETED'),first);assert.equal(blobs,1);assert.equal(ancestry,4);assert.deepEqual(subject.readVerifiedCompletedMigrationSources(root,plan,token),first.sources);first.sources[0].bytes[0]^=1;assert.equal(digest(subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_COMPLETED')!.sources[0].bytes),digest(subject.readHistoricalMigrationSources(root,priorSha,priorTree)[0].bytes));subject.disposeCanonicalMigrationOperation(token);
  }finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
 },true);
});

test('retained schema inventories preserve prefix semantics while invalid prior bindings poison current ownership',async()=>{
 const subject=await api();await fixture((root,sourceSha,treeSha)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,priorReceipt={projectRef,sourceSha,treeSha,migrations:initial.migrations.map(({version,sha256})=>({version,sha256}))},schemaTarget={...target(),population:'SCHEMA_ONLY',appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)},plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:schemaTarget,priorReceipt,now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},token=subject.prepareCanonicalMigrationOperation(input),first=subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_SCHEMA');assert.ok(first);assert.deepEqual(subject.readVerifiedPriorSchemaSources(root,plan,token),first.sources);assert.equal(subject.verifyPriorSchemaPrefix(root,plan,token),true);assert.equal(subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_COMPLETED'),null);subject.disposeCanonicalMigrationOperation(token);
  for(const mode of['kind','count','oldtree','oldsource','plan','descriptor'] as const){const held=subject.prepareCanonicalMigrationOperation(input),changed=structuredClone(plan);let traps=0;if(mode==='count')changed.priorSchemaRelease!.migrationCount--;if(mode==='oldtree')changed.priorSchemaRelease!.treeSha='0'.repeat(40);if(mode==='oldsource')changed.priorSchemaRelease!.sourceSha='0'.repeat(40);if(mode==='plan')changed.observedAt='2026-10-05T22:00:00Z';if(mode==='kind')assert.throws(()=>subject.readCanonicalMigrationPriorSources(held,input,'FOREIGN' as never));else if(mode==='descriptor'){const getter={...plan,get source(){traps++;return plan.source;}};assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,getter,held));assert.equal(traps,0);}else assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,changed,held));assert.throws(()=>subject.readCanonicalMigrationOperation(held,input));subject.disposeCanonicalMigrationOperation(held);}
  const empty={repoRoot:root,sourceSha,treeSha,plan:initial},emptyToken=subject.prepareCanonicalMigrationOperation(empty);assert.equal(subject.readCanonicalMigrationPriorSources(emptyToken,empty,'PRIOR_SCHEMA'),null);assert.equal(subject.readVerifiedCompletedMigrationSources(root,initial,emptyToken),null);for(const bad of[null,{},JSON.parse(JSON.stringify(emptyToken))]){assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,initial,bad as never));assert.throws(()=>subject.readVerifiedCompletedMigrationSources(root,initial,bad as never));}subject.disposeCanonicalMigrationOperation(emptyToken);assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,initial,emptyToken));
  const prefix=initial.migrations.slice(0,initial.stages[0].names.length),partial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:{...schemaTarget,migrationVersions:prefix.map(row=>row.version)},priorReceipt:{projectRef,sourceSha,treeSha,migrations:prefix.map(({version,sha256})=>({version,sha256}))},now}).plan,prefixInput={repoRoot:root,sourceSha,treeSha,plan:partial},prefixToken=subject.prepareCanonicalMigrationOperation(prefixInput);assert.deepEqual(subject.readVerifiedPriorSchemaSources(root,partial,prefixToken),subject.readVerifiedPriorSchemaSources(root,partial));subject.disposeCanonicalMigrationOperation(prefixToken);
 },true);
});

test('an exact current source also supplies its same-identity prior inventory without a second payload',async()=>{
 const subject=await api();await fixture((root,sourceSha,treeSha)=>{const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,prefix=initial.migrations.slice(0,initial.stages[0].names.length),current={...target(),population:'SCHEMA_ONLY',appSchemas:['app','authorization','internal'],migrationVersions:prefix.map(row=>row.version)},plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:current,priorReceipt:{projectRef,sourceSha,treeSha,migrations:prefix.map(({version,sha256})=>({version,sha256}))},now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync;let payloads=0;
 cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git'&&args.includes('--batch'))payloads++;return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;syncBuiltinESMExports();try{const operation=subject.prepareCanonicalMigrationOperation(input);subject.readVerifiedPriorSchemaSources(root,plan,operation);subject.readVerifiedPriorSchemaSources(root,plan,operation);assert.equal(payloads,1,'the exact same private original source is already acquired');subject.disposeCanonicalMigrationOperation(operation);}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
 },true);
});

test('retained historical metadata refuses lost old trees and fresh current source drift without recapture',async()=>{
 const subject=await api();for(const mode of['oldtree','current']as const)await fixture(root=>{
  writeFileSync(join(root,'README.md'),'Unique historical tree '+root+'\n');git(root,'-c','gc.auto=0','add','README.md');git(root,'-c','gc.auto=0','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Unique prior tree');const priorSha=git(root,'rev-parse','HEAD'),priorTree=git(root,'rev-parse','HEAD^{tree}');
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:priorSha,treeSha:priorTree,target:target(),now}).plan;writeFileSync(join(root,'supabase/migrations/20990101000000_prior_metadata_delta.sql'),'select 1; -- '+root+'\n');git(root,'-c','gc.auto=0','add','.');git(root,'-c','gc.auto=0','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Append current tree');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}'),priorReceipt={projectRef,sourceSha:priorSha,treeSha:priorTree,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length},schemaTarget={...target(),population:'GUARDED_SYNTHETIC',authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)},plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:schemaTarget,priorReceipt,now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},token=subject.prepareCanonicalMigrationOperation(input);assert.ok(subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_COMPLETED'));
  if(mode==='oldtree'){const objects=resolve(root,git(root,'rev-parse','--git-path','objects')),file=resolve(objects,priorTree.slice(0,2),priorTree.slice(2));assert.ok(objects.startsWith(root+'\\')||objects.startsWith(root+'/'));assert.ok(file.startsWith(objects+'\\')||file.startsWith(objects+'/'));unlinkSync(file);}else{const path='supabase/migrations/'+plan.migrations[0].name;git(root,'update-index','--assume-unchanged',path);writeFileSync(join(root,path),'select 999;\n');}assert.throws(()=>subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_COMPLETED'));assert.throws(()=>subject.readCanonicalMigrationOperation(token,input));subject.disposeCanonicalMigrationOperation(token);
 },true,true);
});

test('owned historical child144 sources retain original marker124 and distinct current applied144 authority',async()=>{
 const subject=await api(),root=mkdtempSync(join(tmpdir(),'cuevo-owned-child144-source-')),repository=resolve(import.meta.dirname,'../..');
 try{git(root,'clone','--shared','--no-checkout','--quiet',repository,'.');git(root,'checkout','--quiet','--detach','1a493ad735798bb6d3fa0ffaabc779e62149ac37');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','--allow-empty','-m','Distinct current child recovery');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}'),raw=(await import('./hosted-original-child-recovery.fixture')).originalChildRecoveryPlanFixture({sha:sourceSha,tree:treeSha}),plan=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:raw.target,priorReceipt:raw.priorReceipt,originalChildRecovery:raw.originalChildRecovery,now:raw.now}).plan,input={repoRoot:root,sourceSha,treeSha,plan},baseline=subject.readVerifiedPriorSchemaSources(root,plan);assert.ok(baseline);assert.equal(plan.applied.length,144);assert.equal(plan.priorSchemaRelease?.migrationCount,124);assert.notEqual(plan.source.sha,plan.priorSchemaRelease?.sourceSha);
  const token=subject.prepareCanonicalMigrationOperation(input),cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync;let payloads=0;
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git'&&args.includes('--batch'))payloads++;return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;syncBuiltinESMExports();try{assert.deepEqual(subject.readVerifiedPriorSchemaSources(root,plan,token),baseline);assert.deepEqual(subject.readCanonicalMigrationPriorSources(token,input,'PRIOR_SCHEMA')!.sources,baseline);assert.equal(payloads,1);}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();subject.disposeCanonicalMigrationOperation(token);}
  for(const mode of['marker','tree','source','applied']as const){const held=subject.prepareCanonicalMigrationOperation(input),changed=structuredClone(plan);if(mode==='marker')changed.priorSchemaRelease!.migrationCount=144;if(mode==='tree')changed.priorSchemaRelease!.treeSha='0'.repeat(40);if(mode==='source')changed.priorSchemaRelease!.sourceSha=sourceSha;if(mode==='applied')changed.applied=changed.applied.slice(0,124);assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,changed,held),mode);assert.throws(()=>subject.readCanonicalMigrationOperation(held,input));subject.disposeCanonicalMigrationOperation(held);}
 }finally{assert.ok(root.startsWith(resolve(tmpdir())+'\\')||root.startsWith(resolve(tmpdir())+'/'));rmSync(root,{recursive:true,force:true});}
});

test('canonical preparation privately hands its original acquisition to the workdir builder',async()=>{
 const subject=await api(),builder=await import('./hosted-migration-workdirs');await fixture(async(root,sourceSha,treeSha)=>{
  writeFileSync(join(root,'.gitignore'),'.local/\n');git(root,'add','.gitignore');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Ignore owned delivery');sourceSha=git(root,'rev-parse','HEAD');treeSha=git(root,'rev-parse','HEAD^{tree}');const input={repoRoot:root,sourceSha,treeSha,target:target(),now},cp=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=cp.execFileSync,crypto=createRequire(import.meta.url)('node:crypto') as typeof import('node:crypto'),nativeHash=crypto.createHash;let payloads=0,replayHashes=0;
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git'&&args.includes('--batch'))payloads++;return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;crypto.createHash=((...args:Parameters<typeof nativeHash>)=>{if(new Error().stack?.includes('replayPlan'))replayHashes++;return nativeHash(...args);}) as typeof nativeHash;syncBuiltinESMExports();
  try{const prepared=subject.createCanonicalMigrationPreparationAndOperation({...input,mode:'HOSTED_MIGRATIONS'});const work=await builder.createHostedMigrationWorkdirs({...input,plan:prepared.result.plan,outputRoot:join(root,'.local/hosted-release')},prepared.operation);assert.equal(payloads,1);assert.equal(replayHashes,4,'one private original replay supplies both planner and builder');assert.equal(work.planSha256,subject.canonicalHostedMigrationPlan(prepared.result.plan).sha256);prepared.sources[0].bytes[0]^=1;const binding={repoRoot:root,sourceSha,treeSha,plan:prepared.result.plan};subject.readCanonicalMigrationOperation(prepared.operation,binding);subject.disposeCanonicalMigrationOperation(prepared.operation);assert.throws(()=>subject.readCanonicalMigrationOperation(prepared.operation,binding));
  }finally{cp.execFileSync=nativeExec;crypto.createHash=nativeHash;syncBuiltinESMExports();}
 },true);
});

test('private preparation modes preserve legacy results and bind only the final runtime plan',async()=>{
 const subject=await api();await fixture((root,sourceSha,treeSha)=>{
  const base={repoRoot:root,sourceSha,treeSha,target:target(),now},initial=subject.createCanonicalHostedMigrationPlan(base).plan,prior={projectRef,sourceSha,treeSha,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length},active={...target(),population:'ACTIVE_SYNTHETIC',authUsers:133,appSchemas:['app','authorization','internal'],dispatchDisabled:false,migrationVersions:initial.migrations.map(row=>row.version)},runtime={...base,target:active,priorReceipt:prior},cases=[['INSTALLED_RUNTIME_READ_ONLY','createCanonicalInstalledRuntimePlanAndSources'],['PENDING_RUNTIME_CONFIRMATION','createCanonicalPendingRuntimeConfirmationPlanAndSources'],['RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE','createCanonicalRuntimeRolloutPlanAndSources']] as const;
  for(const[mode,name]of cases){const old=subject[name]({...runtime,operation:mode} as never),current=subject.createCanonicalMigrationPreparationAndOperation({...runtime,mode});assert.deepEqual(current.result,old.result);assert.deepEqual(current.sources,old.sources);assert.equal(current.result.plan.runtimeOnly,true);assert.equal('operation'in old,false);const binding={repoRoot:root,sourceSha,treeSha,plan:current.result.plan};subject.readCanonicalMigrationOperation(current.operation,binding);const altered={...current.result.plan,runtimeOnly:undefined};assert.throws(()=>subject.readCanonicalMigrationOperation(current.operation,{...binding,plan:altered}));subject.disposeCanonicalMigrationOperation(current.operation);}
  let traps=0;for(const value of[{...base,mode:'FOREIGN'},{...runtime,mode:'INSTALLED_RUNTIME_READ_ONLY',reconciliationTemplate:{}},{...base,mode:'INSTALLED_RUNTIME_READ_ONLY'},{...base,mode:'HOSTED_MIGRATIONS',sources:[]},{...base,mode:'HOSTED_MIGRATIONS',get target(){traps++;return target();}}])assert.throws(()=>subject.createCanonicalMigrationPreparationAndOperation(value as never));assert.equal(traps,0);
  const native=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),nativeExec=native.execFileSync;let payloads=0;native.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git'&&args.includes('--batch'))payloads++;return nativeExec(file,args,options as Parameters<typeof nativeExec>[2]);}) as typeof nativeExec;syncBuiltinESMExports();try{const current=subject.createCanonicalMigrationPreparationAndOperation({...runtime,mode:'INSTALLED_RUNTIME_READ_ONLY'});subject.readVerifiedCompletedMigrationSources(root,current.result.plan,current.operation);assert.equal(payloads,1,'same-current prior completed bytes are internally retained from genuine acquisition');subject.disposeCanonicalMigrationOperation(current.operation);}finally{native.execFileSync=nativeExec;syncBuiltinESMExports();}
 },true);
});

test('private planning handoff retains exact public plan and canonical batch serialization boundaries',async()=>{
 const subject=await api(),batches=await import('./hosted-migration-batches');await fixture((root,sourceSha,treeSha)=>{const current=subject.createCanonicalMigrationPreparationAndOperation({repoRoot:root,sourceSha,treeSha,target:target(),now,mode:'HOSTED_MIGRATIONS'}),loaded=subject.readCanonicalMigrationOperation(current.operation,{repoRoot:root,sourceSha,treeSha,plan:current.result.plan}),included=current.result.plan.migrations.map(({name,version,sha256})=>({name,version,sha256})).slice(0,loaded.boundaries[0]),workdir=join(root,'.local/hosted-release/batch-source'),stage={id:'prefix' as const,workdir,included,pending:included,expectedBeforeVersions:[],expectedAfterVersions:included.map(row=>row.version).sort(),configSha256:'cc91534b07b96e61b993f179225a9929b65e965d19a5a02e242c79126166b4ff',commandArgs:['db','push','--linked','--project-ref',projectRef,'--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json']};try{assert.deepEqual(batches.deriveCanonicalHostedMigrationBatches({repoRoot:root,sourceSha,treeSha,plan:current.result.plan,stage},current.operation),batches.deriveHostedMigrationBatches({sources:current.sources,stage}));}finally{subject.disposeCanonicalMigrationOperation(current.operation);}},true);
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
  const appended='20261009120000_verified_canonical_append.sql';
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
  writeFileSync(join(root,'supabase/migrations/20260101000002_source_fixture.sql'),Buffer.from([0,255,10,254,128]));
  git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Many immutable sources');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}');
  const modes=['truncated','wrong-id','wrong-type','wrong-size','missing-header-newline','missing-body-newline','trailing','missing-entry','oversized-blob','oversized-total']as const;
  const childProcess=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),original=childProcess.execFileSync,calls:string[][]=[];let corruption:'none'|typeof modes[number]='none';
  childProcess.execFileSync=((file:string,args:string[],options:unknown)=>{
   if(file==='git')calls.push([...args]);const output=original(file,args,options as Parameters<typeof execFileSync>[2]);
   if(file==='git'&&args.includes('--batch')&&Buffer.isBuffer(output)){
    const newline=output.indexOf(10),header=output.subarray(0,newline).toString('ascii'),size=Number(header.split(' ')[2]),bodyEnd=newline+1+size;
    if(corruption==='truncated')return output.subarray(0,output.length-2);
    if(corruption==='wrong-id')return Buffer.concat([Buffer.from('0'.repeat(40)),output.subarray(40)]);
    if(corruption==='wrong-type')return Buffer.concat([Buffer.from(header.replace(' blob ',' tree ')+'\n'),output.subarray(newline+1)]);
    if(corruption==='wrong-size')return Buffer.concat([Buffer.from(header.slice(0,header.lastIndexOf(' ')+1)+(size+1)+'\n'),output.subarray(newline+1)]);
    if(corruption==='missing-header-newline')return Buffer.concat([output.subarray(0,newline),output.subarray(newline+1)]);
    if(corruption==='missing-body-newline'){const changed=Buffer.from(output);changed[bodyEnd]=0;return changed;}
    if(corruption==='trailing')return Buffer.concat([output,Buffer.from('unexpected')]);
    if(corruption==='missing-entry')return output.subarray(0,bodyEnd+1);
    if(corruption==='oversized-blob')return Buffer.concat([Buffer.from(header.slice(0,header.lastIndexOf(' ')+1)+(2*1024*1024+1)+'\n'),output.subarray(newline+1)]);
    if(corruption==='oversized-total'){const ids=String((options as {input:string}).input).trim().split('\n'),large=Buffer.alloc(2*1024*1024,65);return Buffer.concat(ids.slice(0,9).flatMap(id=>[Buffer.from(id+' blob '+large.length+'\n'),large,Buffer.from('\n')]));}
   }
   return output;
  }) as typeof execFileSync;syncBuiltinESMExports();
  try{
   const loaded=subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha});assert.equal(loaded.sources.length,33);assert.equal(calls.some(args=>args.includes('cat-file')&&args.includes('blob')),false,'one process per migration cannot consume the freshness window');assert.equal(calls.filter(args=>args.includes('--batch')).length,1,'one bounded transport reads the complete admitted immutable source set');
   for(const row of loaded.sources)assert.deepEqual(Buffer.from(row.bytes),readFileSync(join(root,'supabase/migrations',row.name)));
   assert.deepEqual(Buffer.from(loaded.sources.find(row=>row.name==='20260101000002_source_fixture.sql')!.bytes),Buffer.from([0,255,10,254,128]));
   for(const value of modes){corruption=value;assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}),value+' must refuse exact transport');}
   corruption='none';git(root,'update-index','--assume-unchanged','supabase/migrations/20260101000000_example.sql');writeFileSync(join(root,'supabase/migrations/20260101000000_example.sql'),'select 999;\n');assert.throws(()=>subject.readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}));
  }finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
 });
});

test('completed-prefix and canonical prior receipts share exact historical batches without per-migration Git reads',async()=>{
 const subject=await api();await fixture(async(root,priorSha,priorTree)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:priorSha,treeSha:priorTree,target:target(),now}).plan;
  writeFileSync(join(root,'supabase/migrations/20261009150000_completed_batch_delta.sql'),'begin; select 1; commit;\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','One exact appended source');
  const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}'),priorReceipt={projectRef,sourceSha:priorSha,treeSha:priorTree,migrations:initial.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:initial.migrations.length},current={...target(),population:'GUARDED_SYNTHETIC',authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)};
  const childProcess=createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process'),original=childProcess.execFileSync,calls:string[][]=[];let corrupt=false;
  childProcess.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);const output=original(file,args,options as Parameters<typeof execFileSync>[2]);return file==='git'&&args.includes('--batch')&&corrupt&&Buffer.isBuffer(output)?output.subarray(0,output.length-1):output;}) as typeof execFileSync;syncBuiltinESMExports();
  try{
   const result=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:current,priorReceipt,now});assert.equal(subject.verifyCompletedMigrationPrefix(root,result.plan),true);assert.deepEqual(result.plan.pending.map(row=>row.name),['20261009150000_completed_batch_delta.sql']);assert.equal(calls.some(args=>args.includes('show')&&args.some(value=>value.startsWith(priorSha+':supabase/migrations/'))),false,'verified prior bytes must not spawn one Git process per migration');
   assert.equal(typeof subject.readVerifiedCompletedMigrationSources,'function');calls.length=0;const completed=subject.readVerifiedCompletedMigrationSources(root,result.plan);assert.ok(completed);assert.equal(completed.length,initial.migrations.length);assert.equal(calls.filter(args=>args.includes('--batch')).length,1,'one verified acquisition returns its original bytes');for(const row of completed)assert.equal(createHash('sha256').update(row.bytes).digest('hex'),initial.migrations.find(item=>item.name===row.name)!.sha256);assert.equal(subject.readVerifiedCompletedMigrationSources(root,{...result.plan,priorCompletedRelease:undefined}),null);
   for(const priorCompletedRelease of [{...result.plan.priorCompletedRelease!,treeSha:'0'.repeat(40)},{...result.plan.priorCompletedRelease!,migrationCount:initial.migrations.length-1},{...result.plan.priorCompletedRelease!,sourceSha:'0'.repeat(40)}])assert.throws(()=>subject.verifyCompletedMigrationPrefix(root,{...result.plan,priorCompletedRelease}));
   corrupt=true;assert.throws(()=>subject.verifyCompletedMigrationPrefix(root,result.plan));assert.throws(()=>subject.readVerifiedCompletedMigrationSources(root,result.plan));corrupt=false;
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
  const append='20261009140000_schema_only_delta.sql';writeFileSync(join(root,'supabase/migrations',append),'begin; select 1; commit;\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','append after completed schema without population');
  const current={...target(),population:'SCHEMA_ONLY',authUsers:0,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version)};
  const sourceShaNow=git(root,'rev-parse','HEAD'),treeShaNow=git(root,'rev-parse','HEAD^{tree}'),input={repoRoot:root,sourceSha:sourceShaNow,treeSha:treeShaNow,target:current,priorReceipt:prior,now};
  assert.throws(()=>subject.planHostedMigrations({sources:sources().concat({name:append,bytes:Buffer.from('begin; select 1; commit;\n')}),source:{sha:sourceShaNow,tree:treeShaNow},target:current,priorReceipt:prior,now}),'caller-supplied rows cannot establish a former complete Git source boundary');
  const plan=subject.createCanonicalHostedMigrationPlan(input).plan;
  assert.deepEqual(plan.pending.map(row=>row.name),[append]);assert.equal(plan.priorCompletedRelease,undefined);assert.equal(subject.verifyPriorSchemaPrefix(root,plan),true);
  assert.equal(plan.applied.length,initial.migrations.length);assert.deepEqual(plan.priorSchemaRelease,{sourceSha,treeSha,migrationCount:initial.migrations.length});
  const forged={...plan,priorSchemaRelease:{...plan.priorSchemaRelease!,migrationCount:plan.priorSchemaRelease!.migrationCount-1}};assert.throws(()=>subject.verifyPriorSchemaPrefix(root,forged));
  for(const mode of ['partial-prior','partial-history','wrong-tree','current-source-not-complete','changed-old-row','auth-present','active-target']){
   const changed=structuredClone(input);
   if(mode==='partial-prior'){changed.priorReceipt.migrations.pop();changed.target.migrationVersions.pop();}
   if(mode==='partial-history')changed.target.migrationVersions.pop();
   if(mode==='wrong-tree')changed.priorReceipt.treeSha='0'.repeat(40);
   if(mode==='current-source-not-complete'){changed.priorReceipt.sourceSha=sourceShaNow;changed.priorReceipt.treeSha=treeShaNow;}
   if(mode==='changed-old-row')changed.priorReceipt.migrations[0].sha256='0'.repeat(64);
   if(mode==='auth-present')changed.target.authUsers=1;
   if(mode==='active-target')changed.target.population='ACTIVE_SYNTHETIC';
   assert.throws(()=>subject.createCanonicalHostedMigrationPlan(changed),mode);
  }
 },true);
});
test('normal runtime rollout permits changed source provenance with exact installed schema and never admits pending SQL',async()=>{
 const subject=await api();await fixture(async(root,sourceSha,treeSha)=>{
  const initial=subject.createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,target:target(),now}).plan,priorReceipt={projectRef,sourceSha,treeSha,completedSourceMigrationCount:initial.migrations.length,migrations:initial.migrations.map(({version,sha256})=>({version,sha256}))};
  writeFileSync(join(root,'README.md'),'Verified ordinary API correction\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','runtime source changes with installed schema');
  const input={repoRoot:root,sourceSha:git(root,'rev-parse','HEAD'),treeSha:git(root,'rev-parse','HEAD^{tree}'),target:{...target(),population:'ACTIVE_SYNTHETIC',authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:initial.migrations.map(row=>row.version),dispatchDisabled:false},priorReceipt,now,operation:'RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE' as const};
  const result=subject.createCanonicalRuntimeRolloutPlan(input);assert.equal(result.plan.runtimeOnly,true);assert.equal(result.plan.pending.length,0);assert.notEqual(result.plan.source.sha,sourceSha);
  assert.throws(()=>subject.createCanonicalInstalledRuntimePlan({...input,operation:'INSTALLED_RUNTIME_READ_ONLY'}));
  writeFileSync(join(root,'supabase/migrations/20261008150000_requires_compatibility.sql'),'begin;select 1;commit;\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','pending SQL requires separate compatibility');
  assert.throws(()=>subject.createCanonicalRuntimeRolloutPlan({...input,sourceSha:git(root,'rev-parse','HEAD'),treeSha:git(root,'rev-parse','HEAD^{tree}')}));
 },true);
});

function reconciliationTemplateFor(rows:{name:string;version:string;sha256:string}[],recovery:{sha:string;tree:string}){
 const originalIdentity={projectRef,sourceSha:'d87455114cac2d22d63d040ce5b13e6b2e74e743',treeSha:'1e85393d46beb4f5356e07277a13a7ef33cc67d9',planSha256:'413d23ed86f7379b3e88b90e09370762ce576d0395f4c4fceaa44d0f3abf3cf1',stageId:'prefix',stageSha256:'5f9e1d7804d816dc3ee387f126f946a0ee0ac3b192b3d4973774cbf33b2ba506',databaseUrl:'postgresql://postgres.mqxdjvsyckzocokuikmx@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',approvalDigest:'d46d4616c1b9eecdcd474b080bfefac98ee959fb7c54819d510773fc661a98de',ciRunId:'37702851953',certificateSha256:'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'};
 const ownerJson=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',identity:originalIdentity})+'\n',payload=(state:string)=>({version:1,identity:originalIdentity,state,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'});
 const first=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:payload('INTENT'),payloadSha256:digest(JSON.stringify(payload('INTENT')))})+'\n',second=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:2,previousSha256:digest(first),payload:payload('REQUIRES_REVIEW'),payloadSha256:digest(JSON.stringify(payload('REQUIRES_REVIEW')))})+'\n';
 return{version:1,purpose:'CUEVO_UNKNOWN_PREFIX_RECONCILIATION_TEMPLATE',recoverySource:{sourceSha:recovery.sha,treeSha:recovery.tree,ciRunId:'37710000000',releaseRunId:'37710000001',runAttempt:1},originalRunId:'37703459549',originalRunAttempt:1,originalIdentity,ownerJson,recordJson:[first,second],stageRows:rows.slice(0,123),prefixRows:rows.slice(0,120),configSha256:'cc91534b07b96e61b993f179225a9929b65e965d19a5a02e242c79126166b4ff',historySha256:'e'.repeat(64),cataloguePolicySha256:'f'.repeat(64),catalogueSha256:'1'.repeat(64),absencePolicySha256:'2'.repeat(64),endpointSha256:'3'.repeat(64)};
}

test('120 schema-only planning requires the exact original reconciliation template and current recovery source',async()=>{
 const subject=await api(),files=sources(),initial=subject.planHostedMigrations({sources:files,source,target:target(),now}),prefix=initial.migrations.slice(0,120),priorReceipt={projectRef,sourceSha:'d87455114cac2d22d63d040ce5b13e6b2e74e743',treeSha:'1e85393d46beb4f5356e07277a13a7ef33cc67d9',migrations:prefix.map(({version,sha256})=>({version,sha256}))};
 const current={...target(),population:'SCHEMA_ONLY',appSchemas:['app','authorization','internal'],migrationVersions:prefix.map(row=>row.version)},input={sources:files,source,target:current,priorReceipt,now};
 assert.throws(()=>subject.planHostedMigrations(input));
 const template=reconciliationTemplateFor(initial.migrations,source),plan=subject.planHostedMigrations({...input,reconciliationTemplate:template});assert.equal(plan.applied.length,120);assert.deepEqual(plan.stages[0].names,initial.migrations.slice(120,123).map(row=>row.name));assert.ok(plan.reconciliationTemplate);subject.canonicalHostedMigrationPlan(plan);
 assert.throws(()=>subject.planHostedMigrations({...input,reconciliationTemplate:{...template,originalRunId:'37703459550'}}));
 assert.throws(()=>subject.planHostedMigrations({...input,reconciliationTemplate:{...template,recoverySource:{...template.recoverySource,sourceSha:'9'.repeat(40)}}}));
 assert.throws(()=>subject.canonicalHostedMigrationPlan({...plan,reconciliationTemplate:undefined}));
 assert.throws(()=>subject.canonicalHostedMigrationPlan({...plan,reconciliationTemplate:{...template,prefixRows:template.prefixRows.slice(0,-1)}} as never));
});


test('native original-prefix verifier rejects120 without template and re-admits exact Git-linked recovery',async()=>{
 const subject=await api(),repository=resolve(import.meta.dirname,'../..'),root=mkdtempSync(join(tmpdir(),'cuevo-exact-prefix-recovery-'));
 try{
  git(root,'clone','--shared','--no-checkout','--quiet',repository,'.');git(root,'checkout','--quiet','--detach','d87455114cac2d22d63d040ce5b13e6b2e74e743');
  const sha=git(root,'rev-parse','HEAD'),tree=git(root,'rev-parse','HEAD^{tree}'),loaded=subject.readCanonicalMigrationSources({repoRoot:root,sourceSha:sha,treeSha:tree}),initial=subject.planHostedMigrations({sources:loaded.sources,source:{sha,tree},target:target(),now}),prefix=initial.migrations.slice(0,120),priorReceipt={projectRef,sourceSha:sha,treeSha:tree,migrations:prefix.map(({version,sha256})=>({version,sha256}))};
  const current={...target(),population:'SCHEMA_ONLY',appSchemas:['app','authorization','internal'],migrationVersions:prefix.map(row=>row.version)},template=reconciliationTemplateFor(initial.migrations,{sha,tree}),input={repoRoot:root,sourceSha:sha,treeSha:tree,target:current,priorReceipt,now,reconciliationTemplate:template};
  assert.throws(()=>subject.createCanonicalHostedMigrationPlan({...input,reconciliationTemplate:undefined}));
  const cp=createRequire(import.meta.url)('node:child_process')as typeof import('node:child_process'),nativeExec=cp.execFileSync,calls:string[][]=[];
  cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);return nativeExec(file,args,options as Parameters<typeof execFileSync>[2]);})as typeof execFileSync;syncBuiltinESMExports();
  let admitted:ReturnType<typeof subject.createCanonicalHostedMigrationPlan>['plan'];
  try{admitted=subject.createCanonicalHostedMigrationPlan(input).plan;assert.equal(calls.filter(args=>args.includes('--batch')).length,1,'identical current and prior source use the same actual private acquisition');}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
  assert.equal(subject.verifyPriorSchemaPrefix(root,admitted),true);assert.throws(()=>subject.verifyPriorSchemaPrefix(root,{...admitted,reconciliationTemplate:undefined}));
  assert.equal(subject.readVerifiedPriorSchemaSources(root,initial),null);assert.equal(subject.verifyPriorSchemaPrefix(root,initial),false);
  calls.length=0;cp.execFileSync=((file:string,args:string[],options:unknown)=>{if(file==='git')calls.push([...args]);return nativeExec(file,args,options as Parameters<typeof execFileSync>[2]);})as typeof execFileSync;syncBuiltinESMExports();
  let originalRows:ReturnType<typeof subject.readVerifiedPriorSchemaSources>;
  try{originalRows=subject.readVerifiedPriorSchemaSources(root,admitted);assert.equal(calls.filter(args=>args.includes('--batch')).length,1,'verified prefix reader returns its one actual original source acquisition');}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}
  assert.ok(originalRows);assert.deepEqual(originalRows.map(row=>({name:row.name,sha256:digest(row.bytes)})),loaded.sources.map(row=>({name:row.name,sha256:digest(row.bytes)})));
  const retained=subject.prepareCanonicalMigrationOperation({repoRoot:root,sourceSha:sha,treeSha:tree,plan:admitted});assert.deepEqual(subject.readVerifiedPriorSchemaSources(root,admitted,retained),originalRows);assert.deepEqual(subject.readCanonicalMigrationPriorSources(retained,{repoRoot:root,sourceSha:sha,treeSha:tree,plan:admitted},'PRIOR_SCHEMA')!.sources,originalRows);subject.disposeCanonicalMigrationOperation(retained);
  originalRows[0].bytes[0]^=1;assert.equal(digest(subject.readVerifiedPriorSchemaSources(root,admitted)![0].bytes),digest(loaded.sources[0].bytes),'returned data cannot replace the next actual source verification');
  for(const mode of ['tree','source','count','order','hash','template','template-source','template-original']as const){
   const changed=structuredClone(admitted);
   if(mode==='tree')changed.priorSchemaRelease!.treeSha='0'.repeat(40);
   if(mode==='source')changed.priorSchemaRelease!.sourceSha='0'.repeat(40);
   if(mode==='count')changed.priorSchemaRelease!.migrationCount=119;
   if(mode==='order')[changed.migrations[0],changed.migrations[1]]=[changed.migrations[1],changed.migrations[0]];
   if(mode==='hash')changed.migrations[0].sha256='0'.repeat(64);
   if(mode==='template')changed.reconciliationTemplate=undefined;
   if(mode==='template-source')(changed.reconciliationTemplate as typeof template).recoverySource.sourceSha='0'.repeat(40);
   if(mode==='template-original')(changed.reconciliationTemplate as typeof template).originalIdentity.treeSha='0'.repeat(40);
   assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,changed),mode+' cannot supply verified historical rows');
  }
  assert.throws(()=>subject.verifyPriorSchemaPrefix(root,{...admitted,priorSchemaRelease:{...admitted.priorSchemaRelease!,migrationCount:119}}));
  git(root,'checkout','--orphan','foreign-identical-count');writeFileSync(join(root,'README.md'),'Independent same-count original fixture\n');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Foreign original with identical migration count');
  const foreignSha=git(root,'rev-parse','HEAD'),foreignTree=git(root,'rev-parse','HEAD^{tree}');assert.throws(()=>subject.readVerifiedPriorSchemaSources(root,{...admitted,source:{sha:foreignSha,tree:foreignTree}}),'exact migration count and bytes cannot bypass original ancestry');
 }finally{rmSync(root,{recursive:true,force:true});}
});
