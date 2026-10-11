import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { readCanonicalEdgeBuildSources } from '../database/hosted-migration-plan';
const fail = () => Error('Prepared Edge compiler snapshot requires review; contents withheld.'), hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
type Snapshot = ReturnType<typeof readCanonicalEdgeBuildSources>;
const snapshots = new WeakMap<object, Snapshot>();
/** Opaque fixed-byte snapshot selected before compilation; caller labels never supply source authority. */
export function captureEdgeCompilerSnapshot(repoRoot: string) { const value = readCanonicalEdgeBuildSources(repoRoot), snapshot = Object.freeze({ sourceSha: value.sourceSha, treeSha: value.treeSha }); snapshots.set(snapshot, value); return snapshot; }
function original(value: object) { const found = snapshots.get(value); if (!found) throw fail(); return found; }
export async function compileEdgeCompilerSnapshot(value: object) {
  const selected = original(value), files = new Map(selected.files.map(file => [file.path, Buffer.from(file.bytes)]));
  const result = await build({ entryPoints: ['apps/worker/src/edge.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', metafile: true, sourcemap: false, legalComments: 'none', charset: 'utf8', logLevel: 'silent', plugins: [{ name: 'cuevo-fixed-edge-source', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => { if (args.path === 'pg') return { path: 'pg', external: true }; const aliases: Record<string, string> = { '@cuevo/contracts/analytics': 'packages/contracts/src/analytics.ts', '@cuevo/config/synthetic-runtime': 'packages/config/src/synthetic-runtime.ts' }; const wanted = aliases[args.path] ?? (args.kind === 'entry-point' ? args.path.replace(/^\.\//, '') : args.path.startsWith('.') ? posix.normalize(posix.join(posix.dirname(args.importer), args.path)) : ''); const path = [wanted, wanted.replace(/\.js$/, '.ts'), wanted + '.ts', wanted + '/index.ts'].find(path => files.has(path)); if (!path) throw fail(); return { path, namespace: 'cuevo-fixed' }; });
    builder.onLoad({ filter: /.*/, namespace: 'cuevo-fixed' }, args => { const bytes = files.get(args.path); if (!bytes) throw fail(); return { contents: bytes, loader: 'ts' }; });
  } }] });
  const emitted = Object.values(result.metafile!.outputs); if (emitted.length !== 1 || emitted[0].imports.some(row => !row.external || row.path !== 'pg') || emitted[0].imports.length !== 1 || !result.outputFiles?.length) throw fail();
  const sources = Object.keys(result.metafile!.inputs).map(path => path.replace(/^cuevo-fixed:/, '')).sort().map(path => { const bytes = files.get(path); if (!bytes) throw fail(); return { path, sha256: hash(bytes) }; });
  return { code: result.outputFiles[0].text, sources, sourceSha: selected.sourceSha, treeSha: selected.treeSha, sourceLock: Buffer.from(files.get('package-lock.json')!), denoLock: Buffer.from(files.get('apps/worker/deno.lock')!), compilerInputSha256: hash(Buffer.from(JSON.stringify(sources))), compilerOutputSha256: hash(result.outputFiles[0].contents) };
}
export async function assertEdgeCompilerSnapshotCurrent(value: object) { const before = original(value), after = readCanonicalEdgeBuildSources(before.root); if (before.sourceSha !== after.sourceSha || before.treeSha !== after.treeSha || before.files.length !== after.files.length || before.files.some((row, index) => row.path !== after.files[index].path || row.sha256 !== after.files[index].sha256)) throw fail(); }
