import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
