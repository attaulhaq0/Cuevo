import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { replayPlan, nativeSourceMigration, posthogEnvironmentMigration, posthogIntelligenceMigration } from './replay-plan';

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^\d{14}$/);
const projectRef = z.string().regex(/^[a-z]{20}$/);
const rowSchema = z.object({ version, sha256: digest }).strict();
const identitySchema = z.object({ sha, tree: sha }).strict();
const targetSchema = z.object({
  projectRef, boundProjectRef: projectRef, projectName: z.string(), projectStatus: z.literal('ACTIVE_HEALTHY'),
  deploymentEnvironment: z.literal('synthetic-staging'), observedAt: z.iso.datetime({ offset: true }),
  authUsers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), storageObjects: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  appSchemas: z.array(z.enum(['app', 'internal', 'authorization'])).max(3), migrationVersions: z.array(version).max(1000),
  dispatchDisabled: z.literal(true), population: z.enum(['EMPTY', 'GUARDED_SYNTHETIC']),
}).strict();
const priorSchema = z.object({ projectRef, sourceSha: sha, treeSha: sha, migrations: z.array(rowSchema).min(1).max(1000) }).strict();
const failure = () => new Error('Hosted migration source, target or verified history requires review; contents withheld.');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export type MigrationSource = { name: string; bytes: Uint8Array };
export type CanonicalMigrationSources = {
  sources: MigrationSource[];
  provenance: { kind: 'VERIFIED_GIT_BLOBS'; sourceSha: string; treeSha: string; migrationTreeSha: string; manifestSha256: string };
};
export type HostedMigrationPlanV1 = {
  version: 1; mode: 'EMPTY_INITIAL' | 'INCREMENTAL'; provenance: 'CALLER_SUPPLIED_SOURCE';
  source: { sha: string; tree: string }; projectRef: string; observedAt: string;
  migrations: { name: string; version: string; sha256: string }[]; applied: { version: string; sha256: string }[];
  pending: { name: string; version: string; sha256: string }[];
  stages: { id: 'prefix' | 'native' | 'pre-observability' | 'remaining'; names: string[] }[];
  sourceSetSha256: string; observedHistorySha256: string;
  dispatch: 'DISABLED'; seed: 'DISABLED'; vault: 'DISABLED';
};

/** Caller-supplied source/history is planning input, never execution admission or proof of Git review. */
export function planHostedMigrations(input: { sources: MigrationSource[]; source: unknown; target: unknown; priorReceipt?: unknown; now: number }): HostedMigrationPlanV1 {
  const identity = identitySchema.safeParse(input.source), target = targetSchema.safeParse(input.target);
  if (!identity.success || !target.success || !Number.isSafeInteger(input.now) || input.now < 0) throw failure();
  const current = target.data, observedAt = Date.parse(current.observedAt);
  if (current.projectRef !== current.boundProjectRef || current.projectName.toLowerCase() !== 'cuevo' || observedAt > input.now || input.now - observedAt > 86400000
    || new Set(current.migrationVersions).size !== current.migrationVersions.length || new Set(current.appSchemas).size !== current.appSchemas.length) throw failure();
  if (!Array.isArray(input.sources) || input.sources.length > 1000 || input.sources.some(row => !row || typeof row.name !== 'string' || !(row.bytes instanceof Uint8Array))) throw failure();
  let replay: ReturnType<typeof replayPlan>;
  try { replay = replayPlan(input.sources); } catch { throw failure(); }
  const order = [...replay.before, replay.prerequisite, ...replay.remaining];
  if (order.length !== input.sources.length || new Set(order).size !== order.length) throw failure();
  const migrations = order.map(name => ({ version: name.slice(0, 14), sha256: hash(input.sources.find(row => row.name === name)!.bytes), name }));
  const history = [...current.migrationVersions].sort();
  let applied: { version: string; sha256: string }[] = [];
  const initial = history.length === 0;
  if (initial) {
    if (current.population !== 'EMPTY' || current.authUsers !== 0 || current.storageObjects !== 0 || current.appSchemas.length !== 0 || input.priorReceipt !== undefined) throw failure();
  } else {
    const prior = priorSchema.safeParse(input.priorReceipt);
    const prefix = migrations.slice(0, history.length);
    if (!prior.success || current.population !== 'GUARDED_SYNTHETIC' || current.authUsers < 1 || current.appSchemas.length !== 3
      || prior.data.projectRef !== current.projectRef || new Set(prior.data.migrations.map(row => row.version)).size !== prior.data.migrations.length
      || JSON.stringify(prefix.map(row => row.version).sort()) !== JSON.stringify(history)) throw failure();
    const canonicalRows = (rows: { version: string; sha256: string }[]) => JSON.stringify([...rows].sort((a, b) => a.version.localeCompare(b.version)));
    if (canonicalRows(prior.data.migrations) !== canonicalRows(prefix.map(({ version, sha256 }) => ({ version, sha256 })))) throw failure();
    const boundaries = [replay.before.length, replay.before.length + 1, replay.before.length + 1 + replay.remaining.indexOf(posthogIntelligenceMigration), migrations.length];
    if (!boundaries.includes(history.length)) throw failure();
    applied = prefix.map(({ version, sha256 }) => ({ version, sha256 }));
  }
  const pending = migrations.slice(applied.length);
  const priorToIntelligence = replay.remaining.slice(0, replay.remaining.indexOf(posthogIntelligenceMigration));
  if (!priorToIntelligence.includes(posthogEnvironmentMigration)) throw failure();
  const stageSources: HostedMigrationPlanV1['stages'] = [
    { id: 'prefix', names: replay.before }, { id: 'native', names: [nativeSourceMigration] },
    { id: 'pre-observability', names: priorToIntelligence },
    { id: 'remaining', names: replay.remaining.slice(priorToIntelligence.length) },
  ];
  const stages = stageSources.map(stage => ({ ...stage, names: stage.names.filter(name => pending.some(row => row.name === name)) }));
  return { version: 1, mode: initial ? 'EMPTY_INITIAL' : 'INCREMENTAL', provenance: 'CALLER_SUPPLIED_SOURCE', source: identity.data,
    projectRef: current.projectRef, observedAt: current.observedAt, migrations, applied, pending, stages,
    sourceSetSha256: hash(JSON.stringify(migrations)), observedHistorySha256: hash(JSON.stringify(history)), dispatch: 'DISABLED', seed: 'DISABLED', vault: 'DISABLED' };
}

const gitEnvironment = () => Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TMP', 'TEMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
function gitReader(root: string) {
  return (args: string[]) => {
    try { return execFileSync('git', ['-C', root, ...args], { env: gitEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, shell: false }); }
    catch { throw failure(); }
  };
}
function checkedRoot(repoRoot: string) {
  if (!isAbsolute(repoRoot)) throw failure();
  let actual: string;
  try { actual = realpathSync(repoRoot); } catch { throw failure(); }
  if (resolve(repoRoot) !== actual || lstatSync(repoRoot).isSymbolicLink()) throw failure();
  const git = gitReader(actual);
  if (realpathSync(git(['rev-parse', '--show-toplevel']).toString('utf8').trim()) !== actual || git(['rev-parse', '--is-shallow-repository']).toString('utf8').trim() !== 'false') throw failure();
  const grafts = git(['rev-parse', '--git-path', 'info/grafts']).toString('utf8').trim();
  try { if (readFileSync(isAbsolute(grafts) ? grafts : join(actual, grafts)).length) throw failure(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure(); }
  if (git(['for-each-ref', '--format=%(refname)', 'refs/replace']).length) throw failure();
  return { root: actual, git };
}

/** Real Git metadata and binary blobs are loaded independently of normalized working-file bytes. */
export function readCanonicalMigrationSources(input: { repoRoot: string; sourceSha: string; treeSha: string }): CanonicalMigrationSources {
  if (!sha.safeParse(input.sourceSha).success || !sha.safeParse(input.treeSha).success) throw failure();
  const { root, git } = checkedRoot(input.repoRoot);
  if (git(['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim() !== input.sourceSha
    || git(['rev-parse', '--verify', `${input.sourceSha}^{tree}`]).toString('utf8').trim() !== input.treeSha) throw failure();
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', input.sourceSha, '--', 'supabase/migrations']);
  if (git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'supabase/migrations']).length) throw failure();
  for (const path of ['supabase', 'supabase/migrations']) if (lstatSync(join(root, path)).isSymbolicLink()) throw failure();
  const tree = git(['ls-tree', '-r', '-z', input.sourceSha, '--', 'supabase/migrations']);
  const entries = tree.toString('utf8').split('\0').filter(Boolean);
  if (!entries.length || entries.length > 1000) throw failure();
  const sources = entries.map(entry => {
    const match = entry.match(/^100644 blob ([a-f0-9]{40})\tsupabase\/migrations\/(\d{14}_[a-z0-9_]+\.sql)$/);
    if (!match) throw failure();
    const [, blob, name] = match;
    if (!lstatSync(join(root, 'supabase/migrations', name)).isFile()) throw failure();
    const bytes = git(['cat-file', 'blob', blob]);
    const working = readFileSync(join(root, 'supabase/migrations', name));
    // Only CRLF/LF serialization is tolerated; Git filters cannot conceal altered SQL bytes.
    const normalize = (value: Uint8Array) => Buffer.from(value.filter((byte, index) => byte !== 13 || value[index + 1] !== 10));
    if (bytes.length > 2 * 1024 * 1024 || working.length > 2 * 1024 * 1024 || !normalize(bytes).equals(normalize(working))) throw failure();
    return { name, bytes: new Uint8Array(bytes) };
  });
  if (new Set(sources.map(row => row.name.slice(0, 14))).size !== sources.length) throw failure();
  const physical = readdirSync(join(root, 'supabase/migrations'));
  if (physical.length !== sources.length || physical.some(name => !sources.some(row => row.name === name))) throw failure();
  return { sources, provenance: { kind: 'VERIFIED_GIT_BLOBS', sourceSha: input.sourceSha, treeSha: input.treeSha,
    migrationTreeSha: git(['rev-parse', `${input.sourceSha}:supabase/migrations`]).toString('utf8').trim(), manifestSha256: hash(tree) } };
}

/** A release entry also requires all tracked and untracked authored source to match the admitted commit. */
export function createCanonicalHostedMigrationPlan(input: { repoRoot: string; sourceSha: string; treeSha: string; target: unknown; priorReceipt?: unknown; now: number }) {
  const loaded = readCanonicalMigrationSources(input);
  const { git } = checkedRoot(input.repoRoot);
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', input.sourceSha, '--']);
  if (git(['ls-files', '--others', '--exclude-standard', '-z']).length) throw failure();
  const plan = planHostedMigrations({ sources: loaded.sources, source: { sha: input.sourceSha, tree: input.treeSha }, target: input.target, priorReceipt: input.priorReceipt, now: input.now });
  if (input.priorReceipt !== undefined) {
    const prior = priorSchema.parse(input.priorReceipt);
    if (git(['rev-parse', '--verify', `${prior.sourceSha}^{commit}`]).toString('utf8').trim() !== prior.sourceSha
      || git(['rev-parse', `${prior.sourceSha}^{tree}`]).toString('utf8').trim() !== prior.treeSha) throw failure();
    git(['merge-base', '--is-ancestor', prior.sourceSha, input.sourceSha]);
    for (const row of prior.migrations) {
      const current = plan.migrations.find(value => value.version === row.version);
      if (!current || hash(git(['show', `${prior.sourceSha}:supabase/migrations/${current.name}`])) !== row.sha256) throw failure();
    }
  }
  return { plan, sourceProvenance: loaded.provenance, priorReceiptProvenance: input.priorReceipt === undefined ? 'NOT_APPLICABLE' as const : 'VERIFIED_PRIOR_GIT_SOURCE_HASHES_ONLY' as const }; 
}
const plannedRowSchema = rowSchema.extend({ name: z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/) }).strict();
const planSchema = z.object({
  version: z.literal(1), mode: z.enum(['EMPTY_INITIAL', 'INCREMENTAL']), provenance: z.literal('CALLER_SUPPLIED_SOURCE'), source: identitySchema,
  projectRef, observedAt: z.iso.datetime({ offset: true }), migrations: z.array(plannedRowSchema).min(1).max(1000), applied: z.array(rowSchema).max(1000), pending: z.array(plannedRowSchema).max(1000),
  stages: z.array(z.object({ id: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), names: z.array(z.string()).max(1000) }).strict()).length(4),
  sourceSetSha256: digest, observedHistorySha256: digest, dispatch: z.literal('DISABLED'), seed: z.literal('DISABLED'), vault: z.literal('DISABLED'),
}).strict();
function jsonSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 20) throw failure();
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') throw failure();
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw failure();
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure();
    Object.defineProperty(result, key, { value: jsonSnapshot(field.value, depth + 1), enumerable: true, configurable: true, writable: true });
  }
  return result;
}
/** Canonical JSON is a validated metadata serialization, never Git, hosted or release admission. */
export function canonicalHostedMigrationPlan(plan: HostedMigrationPlanV1) {
  const value = planSchema.parse(jsonSnapshot(plan));
  if (value.sourceSetSha256 !== hash(JSON.stringify(value.migrations)) || value.observedHistorySha256 !== hash(JSON.stringify(value.applied.map(row => row.version).sort()))
    || new Set(value.migrations.map(row => row.version)).size !== value.migrations.length || value.migrations.some(row => row.name.slice(0, 14) !== row.version)
    || JSON.stringify(value.pending) !== JSON.stringify(value.migrations.slice(value.applied.length))
    || JSON.stringify(value.applied) !== JSON.stringify(value.migrations.slice(0, value.applied.length).map(({ version, sha256 }) => ({ version, sha256 })))
    || value.stages.map(stage => stage.id).join('|') !== 'prefix|native|pre-observability|remaining'
    || JSON.stringify(value.stages.flatMap(stage => stage.names)) !== JSON.stringify(value.pending.map(row => row.name))) throw failure();
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return '[' + item.map(canonical).join(',') + ']';
    if (item !== null && typeof item === 'object') return '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + canonical((item as Record<string, unknown>)[key])).join(',') + '}';
    return JSON.stringify(item);
  };
  const json = canonical(value);
  if (Buffer.byteLength(json) > 1024 * 1024) throw failure();
  return { json, sha256: hash(json) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 5 || process.argv[2] !== '--input') throw failure();
  const inputBytes = readFileSync(resolve(process.argv[3]));
  if (inputBytes.length > 1024 * 1024) throw failure();
  const input = JSON.parse(inputBytes.toString('utf8')) as Parameters<typeof createCanonicalHostedMigrationPlan>[0];
  if (process.argv[4] !== '--metadata-only') throw failure();
  const result = createCanonicalHostedMigrationPlan(input);
  console.log(JSON.stringify({ ...canonicalHostedMigrationPlan(result.plan), sourceProvenance: result.sourceProvenance }));
}
