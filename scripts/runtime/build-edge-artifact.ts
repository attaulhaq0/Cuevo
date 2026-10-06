import { build, version as compilerVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = resolve(root, '.local/edge-artifacts');
const output = resolve(outputRoot, 'cuevo-worker');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
type LockEntry = { version?: string; resolved?: string; integrity?: string; link?: boolean; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> };
/** Exact portable analytics and synthetic-target boundaries are bundled; server package entrypoints remain excluded. */
export function validateEdgeBundleOwnership(sources: string[], imports: string[]) {
  if (imports.length !== 1 || imports[0] !== 'pg') throw Error('Edge runtime must use only the reviewed external pg package.');
  if (!sources.length || sources.some(path => {
    if (path === 'packages/contracts/src/analytics.ts' || path === 'packages/config/src/synthetic-runtime.ts') return false;
    return !path.startsWith('apps/worker/src/') || path.split('/').some(segment => !segment || segment === '.' || segment === '..');
  })) throw Error('Edge bundle crossed worker implementation or exact portable boundary ownership.');
}
export function validateDenoLock(value: unknown, expected: { path: string; version: string; integrity: string }[]) {
  const lock = value as { version?: string; specifiers?: Record<string, string>; npm?: Record<string, { integrity?: string }> };
  if (!lock || lock.version !== '4' || JSON.stringify(lock.specifiers) !== JSON.stringify({ 'npm:pg@8.23.1': '8.23.1' }) || !lock.npm) throw Error('Captured Deno 2.1.4 lock and exact pg entrypoint required.');
  const actual = Object.entries(lock.npm).map(([key, entry]) => {
    const versionKey = key.split('_')[0]; const separator = versionKey.lastIndexOf('@');
    return { name: versionKey.slice(0, separator), version: versionKey.slice(separator + 1), integrity: entry.integrity };
  });
  const wanted = expected.map(entry => ({ name: entry.path.split('/node_modules/').at(-1)!.replace(/^node_modules\//, ''), version: entry.version, integrity: entry.integrity }));
  const canonical = (rows: { name: string; version: string; integrity?: string }[]) => JSON.stringify(rows.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)));
  if (canonical(actual) !== canonical(wanted)) throw Error('Deno dependency resolution diverges from the approved npm versions or integrity.');
}
function npmGraph(lock: { lockfileVersion: number; packages: Record<string, LockEntry> }) {
  if (lock.lockfileVersion !== 3 || lock.packages['node_modules/pg']?.version !== '8.23.1') throw Error('Reviewed pg 8.23.1 npm lockfile required.');
  const visited = new Set<string>(); const rows: { path: string; version: string; integrity: string }[] = [];
  const include = (name: string, owner = '', optional = false) => {
    let parent = owner; let path = '';
    while (parent) { const candidate = `${parent}/node_modules/${name}`; if (lock.packages[candidate]) { path = candidate; break; } parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''; }
    if (!path) path = `node_modules/${name}`;
    const source = lock.packages[path]; if (!source) { if (optional) return; throw Error('Required npm dependency is not locked.'); }
    if (visited.has(path)) return; visited.add(path);
    if (source.link || !source.version || !source.integrity || !source.resolved?.startsWith('https://registry.npmjs.org/')) throw Error('Edge npm dependency requires an exact registry/integrity source.');
    rows.push({ path, version: source.version, integrity: source.integrity });
    for (const child of Object.keys(source.dependencies ?? {})) include(child, path);
    for (const child of Object.keys(source.optionalDependencies ?? {})) include(child, path, true);
    for (const child of Object.keys(source.peerDependencies ?? {})) if (source.peerDependenciesMeta?.[child]?.optional !== true) include(child, path);
  };
  include('pg'); return rows.sort((a, b) => a.path.localeCompare(b.path));
}
export async function buildEdgeArtifact() {
  if (relative(outputRoot, output) !== 'cuevo-worker' || dirname(output) !== outputRoot) throw Error('Exact ignored Edge output required.');
  await mkdir(outputRoot, { recursive: true }); if ((await lstat(outputRoot)).isSymbolicLink()) throw Error('Edge artifact root cannot be a symlink.');
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const result = await build({ absWorkingDir: root, entryPoints: ['apps/worker/src/edge.ts'], outfile: join(output, 'index.ts'), bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', packages: 'external', alias: { '@cuevo/contracts/analytics': './packages/contracts/src/analytics.ts', '@cuevo/config/synthetic-runtime': './packages/config/src/synthetic-runtime.ts' }, metafile: true, sourcemap: false, legalComments: 'none', charset: 'utf8' });
  const emitted = Object.values(result.metafile!.outputs).find(item => item.entryPoint); if (!emitted) throw Error('Edge compiler source manifest unavailable.');
  const imports = [...new Set(emitted.imports.filter(item => item.external).map(item => item.path))];
  const sourcePaths = Object.keys(result.metafile!.inputs).sort().map(source => relative(root, resolve(root, source)).split(sep).join('/'));
  validateEdgeBundleOwnership(sourcePaths, imports);
  await writeFile(join(output, 'deno.json'), JSON.stringify({ imports: { pg: 'npm:pg@8.23.1' }, lock: { path: './deno.lock', frozen: true } }, null, 2) + '\n');
  const lockBytes = await readFile(join(root, 'package-lock.json')); const dependencies = npmGraph(JSON.parse(lockBytes.toString()));
  const denoLockBytes = await readFile(join(root, 'apps/worker/deno.lock'));
  validateDenoLock(JSON.parse(denoLockBytes.toString()), dependencies);
  await writeFile(join(output, 'deno.lock'), denoLockBytes);
  const sources = await Promise.all(sourcePaths.map(async path => ({ path, sha256: hash(await readFile(resolve(root, path))) })));
  const files = await Promise.all(['index.ts', 'deno.json', 'deno.lock'].map(async path => ({ path, sha256: hash(await readFile(join(output, path))) })));
  const artifact = { schemaVersion: 1, service: 'cuevo-worker', runtime: 'deno', entrypoint: 'index.ts', imports: ['npm:pg@8.23.1'], compiler: { name: 'esbuild', version: compilerVersion }, sourceLockSha256: hash(lockBytes), denoLockSha256: hash(denoLockBytes), dependencyEnforcement: 'FROZEN_DENO_BUILD_VALIDATION_HOSTED_BUNDLER_REQUIRES_VERIFICATION', sources, dependencies, files };
  await writeFile(join(output, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
  if ((await readdir(output)).length !== 4) throw Error('Unexpected generated Edge artifact files.');
  return artifact;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { await buildEdgeArtifact(); console.log('Generated the worker-owned Edge artifact without runtime secrets.'); }
