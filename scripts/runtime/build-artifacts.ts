import { build, version as compilerVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile, lstat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type Service = 'api' | 'worker';
type RuntimeTarget = Service | 'api-vercel';
type PackageEntry = {
  version?: string; resolved?: string; integrity?: string; link?: boolean; dev?: boolean; devOptional?: boolean;
  dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  [key: string]: unknown;
};
type Lock = { lockfileVersion: number; packages: Record<string, PackageEntry> };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = resolve(root, '.local/runtime-artifacts');
const requiredPackFiles = ['snapshot.txt', 'pack.json', 'sources.json', 'normalized.json', 'assessment.json', 'reporting.json', 'mappings.json', 'terminology.json', 'rights.json', 'unknowns.json', 'golden-cases.json'];
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const forward = (path: string) => path.split(sep).join('/');
const json = <T,>(bytes: string): T => JSON.parse(bytes) as T;
const buildOnlyPackages = new Set(['tsx', 'typescript', 'esbuild', 'vitest', 'dotenv']);
const execute = promisify(execFile);

function packageName(specifier: string) {
  if (specifier.startsWith('node:') || specifier.startsWith('.') || isAbsolute(specifier)) return null;
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}
function lockedDependency(lock: Lock, name: string, owner = '') {
  let directory = owner;
  while (directory) {
    const path = `${directory}/node_modules/${name}`;
    if (lock.packages[path]) return path;
    const parent = directory.lastIndexOf('/');
    directory = parent === -1 ? '' : directory.slice(0, parent);
  }
  const path = `node_modules/${name}`;
  if (!lock.packages[path]) throw new Error(`Runtime dependency has no exact locked package: ${name}`);
  return path;
}
function runtimeDependencyLock(lock: Lock, imports: string[], target: RuntimeTarget) {
  if (lock.lockfileVersion !== 3) throw new Error('Runtime packaging requires reviewed npm lockfile v3.');
  const packages: Record<string, PackageEntry> = {};
  const dependencies: Record<string, string> = {};
  const visited = new Set<string>();
  const include = (name: string, owner = '', optional = false) => {
    if (name.startsWith('@cuevo/') || buildOnlyPackages.has(name)) throw new Error(`Build-only or unbundled workspace dependency in runtime graph: ${name}`);
    let path: string;
    try { path = lockedDependency(lock, name, owner); } catch (error) { if (optional) return; throw error; }
    if (visited.has(path)) return;
    visited.add(path);
    const source = lock.packages[path];
    if (source.link || !source.version || !source.integrity || !source.resolved?.startsWith('https://registry.npmjs.org/')) throw new Error(`Unreviewed runtime dependency source: ${name}`);
    const copy = { ...source }; delete copy.dev; delete copy.devOptional;
    packages[path] = copy;
    for (const child of Object.keys(source.dependencies ?? {})) include(child, path);
    for (const child of Object.keys(source.optionalDependencies ?? {})) include(child, path, true);
    // Optional peers are opt-in features (for example Swagger's TypeScript compiler), not runtime requirements.
    for (const child of Object.keys(source.peerDependencies ?? {})) if (source.peerDependenciesMeta?.[child]?.optional !== true) include(child, path);
  };
  for (const name of imports.sort()) {
    const path = lockedDependency(lock, name);
    dependencies[name] = lock.packages[path].version!;
    include(name);
  }
  const manifest = { name: `cuevo-${target}-runtime`, version: '0.1.0', private: true, type: 'module', engines: { node: '>=24 <25' }, ...(target === 'api-vercel' ? {} : { scripts: { start: 'node main.mjs' } }), dependencies };
  return { manifest, lock: { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { '': { name: manifest.name, version: manifest.version, dependencies, engines: manifest.engines }, ...Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) } } };
}

async function copyLockedPacks(target: string) {
  const sourceRoot = join(root, 'supabase/seed/curriculum');
  const files: { path: string; sha256: string; byteSize: number }[] = [];
  for (const directory of await readdir(sourceRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    if (!/^[a-z0-9-]+$/.test(directory.name)) throw new Error('Locked runtime pack directory requires review.');
    const folder = join(sourceRoot, directory.name);
    const manifestBytes = await readFile(join(folder, 'manifest.json'));
    const manifest = json<{ files: Record<string, string> }>(manifestBytes.toString());
    if (Object.keys(manifest.files).sort().join('|') !== [...requiredPackFiles].sort().join('|')) throw new Error('Locked runtime pack file set changed; review required.');
    const relativeFolder = `supabase/seed/curriculum/${directory.name}`;
    await mkdir(join(target, relativeFolder), { recursive: true });
    for (const name of ['manifest.json', ...requiredPackFiles]) {
      const path = join(folder, name);
      if (!(await lstat(path)).isFile()) throw new Error('Runtime pack symlink or non-file requires review.');
      const bytes = name === 'manifest.json' ? manifestBytes : await readFile(path);
      if (bytes.length > 500_000 || name !== 'manifest.json' && manifest.files[name] !== digest(bytes)) throw new Error('Locked runtime pack checksum/size requires review.');
      const outputPath = `${relativeFolder}/${name}`;
      await writeFile(join(target, outputPath), bytes);
      files.push({ path: outputPath, sha256: digest(bytes), byteSize: bytes.length });
    }
  }
  if (!files.length) throw new Error('No source-locked runtime curriculum artifacts found.');
  return files;
}

async function prebuiltVercelOutput(output: string, runtimeFiles: string[]) {
  const buildOutput = join(output, '.vercel/output');
  const functionRoot = join(buildOutput, 'functions/api/index.func');
  await mkdir(functionRoot, { recursive: true });
  for (const path of runtimeFiles) {
    await mkdir(dirname(join(functionRoot, path)), { recursive: true });
    await writeFile(join(functionRoot, path), await readFile(join(output, path)));
  }
  const configuration = { runtime: 'nodejs24.x', handler: 'api/index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, shouldAddSourcemapSupport: false, supportsResponseStreaming: true, maxDuration: 60 };
  await writeFile(join(functionRoot, '.vc-config.json'), `${JSON.stringify(configuration, null, 2)}\n`);
  await writeFile(join(buildOutput, 'config.json'), `${JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/api/index' }] }, null, 2)}\n`);
  const expectedNpm = json<{ packageManager: string }>(await readFile(join(root, 'package.json'), 'utf8')).packageManager;
  const npmCandidates = [join(dirname(process.execPath), 'node_modules/npm'), resolve(dirname(process.execPath), '../lib/node_modules/npm')];
  let npmRoot: string | undefined;
  for (const candidate of npmCandidates) {
    try { if (`npm@${json<{ version: string }>(await readFile(join(candidate, 'package.json'), 'utf8')).version}` === expectedNpm) { npmRoot = candidate; break; } } catch { /* Try the next standard Node installation path. */ }
  }
  if (!npmRoot) throw Error('Prebuilt packaging requires the repository-pinned npm installation beside Node.');
  const npmConfig = join(output, 'install.npmrc'); const npmGlobalConfig = join(output, 'install-global.npmrc');
  await writeFile(npmConfig, ''); await writeFile(npmGlobalConfig, '');
  const environmentKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
  const env = { ...Object.fromEntries(environmentKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), NODE_ENV: 'production', SCARF_ANALYTICS: 'false' };
  try {
    await execute(process.execPath, [join(npmRoot, 'bin/npm-cli.js'), 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/', `--userconfig=${npmConfig}`, `--globalconfig=${npmGlobalConfig}`], { cwd: functionRoot, env, timeout: 120000, maxBuffer: 2_000_000, windowsHide: true });
  } catch { throw Error('Pinned prebuilt runtime dependency installation failed; output withheld.'); }
  finally { await rm(npmConfig, { force: true }); await rm(npmGlobalConfig, { force: true }); }
  const lock = json<Lock>(await readFile(join(functionRoot, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    if ((await lstat(join(functionRoot, path))).isSymbolicLink() || json<{ version: string }>(await readFile(join(functionRoot, path, 'package.json'), 'utf8')).version !== entry.version) throw Error('Installed runtime dependency differs from the pinned production lock.');
  }
  const collect = async (directory: string): Promise<{ path: string; sha256: string }[]> => {
    const files: { path: string; sha256: string }[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await collect(path));
      else if (entry.isFile()) files.push({ path: forward(relative(output, path)), sha256: digest(await readFile(path)) });
      else throw Error('Prebuilt output contains an unexpected symlink or file type.');
    }
    return files;
  };
  // Ignore lifecycle scripts and omit their CLI links; the Node launcher needs no npm executables.
  const binDirectory = join(functionRoot, 'node_modules/.bin');
  if (forward(relative(outputRoot, binDirectory)) !== 'api-vercel/.vercel/output/functions/api/index.func/node_modules/.bin') throw Error('Prebuilt executable cleanup must stay within its exact output.');
  await rm(binDirectory, { recursive: true, force: true });
  return (await collect(buildOutput)).sort((a, b) => a.path.localeCompare(b.path));
}

export async function buildRuntimeArtifact(target: RuntimeTarget) {
  if (!['api', 'worker', 'api-vercel'].includes(target)) throw new Error('Explicit api, worker or api-vercel target required.');
  const service: Service = target === 'api-vercel' ? 'api' : target;
  const entrypoint = target === 'api-vercel' ? 'api/index.mjs' : 'main.mjs';
  const output = resolve(outputRoot, target);
  if (relative(outputRoot, output) !== target || dirname(output) !== outputRoot) throw new Error('Runtime output must remain in its exact ignored service directory.');
  await mkdir(outputRoot, { recursive: true });
  if ((await lstat(outputRoot)).isSymbolicLink()) throw new Error('Runtime artifact output symlink requires review.');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const result = await build({
    absWorkingDir: root, entryPoints: [`apps/${service}/src/${target === 'api-vercel' ? 'serverless' : 'main'}.ts`], outfile: join(output, entrypoint),
    bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external', metafile: true,
    sourcemap: false, legalComments: 'none', charset: 'utf8', tsconfig: join(root, 'tsconfig.json'),
    define: {
      CUEVO_LOCKED_PACK_ROOT_URL: JSON.stringify(target === 'api-vercel' ? '../supabase/seed/curriculum/' : './supabase/seed/curriculum/'),
      CUEVO_ANALYTICS_DIRECTORY_URL: JSON.stringify('./.local/analytics/'),
    },
    alias: { '@cuevo/contracts/analytics': join(root, 'packages/contracts/src/analytics.ts'), '@cuevo/domain': join(root, 'packages/domain/src/index.ts'), '@cuevo/contracts': join(root, 'packages/contracts/src/index.ts'), '@cuevo/config/synthetic-runtime': join(root, 'packages/config/src/synthetic-runtime.ts'), '@cuevo/config': join(root, 'packages/config/src/index.ts') },
  });
  if (!result.metafile) throw new Error('Compiler dependency manifest was not produced.');
  const outputFile = Object.values(result.metafile.outputs).find(file => file.entryPoint);
  if (!outputFile) throw new Error('Compiler entrypoint manifest was not produced.');
  const imports = [...new Set(outputFile.imports.filter(item => item.external).map(item => packageName(item.path)).filter((name): name is string => name !== null))];
  const sourceLockBytes = await readFile(join(root, 'package-lock.json'));
  const sourceLock = json<Lock>(sourceLockBytes.toString());
  if (sourceLock.packages['node_modules/esbuild']?.version !== compilerVersion) throw new Error('Installed compiler does not match the exact source lock.');
  const dependency = runtimeDependencyLock(sourceLock, imports, target);
  await writeFile(join(output, 'package.json'), `${JSON.stringify(dependency.manifest, null, 2)}\n`);
  await writeFile(join(output, 'package-lock.json'), `${JSON.stringify(dependency.lock, null, 2)}\n`);
  const packFiles = service === 'api' ? await copyLockedPacks(output) : [];
  if (target === 'api-vercel') {
    // An explicit empty static root prevents pack/provenance files becoming public assets.
    await mkdir(join(output, 'public'));
    const configuration = {
      $schema: 'https://openapi.vercel.sh/vercel.json', framework: null, buildCommand: '', outputDirectory: 'public',
      installCommand: 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
      functions: { 'api/index.mjs': { maxDuration: 60, includeFiles: 'supabase/seed/curriculum/**' } },
      rewrites: [{ source: '/:path*', destination: '/api/index' }],
    };
    await writeFile(join(output, 'vercel.json'), `${JSON.stringify(configuration, null, 2)}\n`);
  }
  const sources = await Promise.all(Object.keys(result.metafile.inputs).sort().map(async path => {
    const absolute = resolve(root, path);
    const relativePath = forward(relative(root, absolute));
    if (!/^(apps\/(api|worker)\/src|packages\/(domain|contracts|config)\/src)\//.test(relativePath) || relativePath.includes('/test/')) throw new Error('Unexpected authored runtime input requires review.');
    return { path: relativePath, sha256: digest(await readFile(absolute)) };
  }));
  const emitted = await Promise.all([entrypoint, 'package.json', 'package-lock.json', ...(target === 'api-vercel' ? ['vercel.json'] : [])].map(async path => ({ path, sha256: digest(await readFile(join(output, path))) })));
  const prebuiltFiles = target === 'api-vercel' ? await prebuiltVercelOutput(output, [entrypoint, 'package.json', 'package-lock.json', ...packFiles.map(file => file.path)]) : [];
  const artifact = { schemaVersion: 1, service, delivery: target === 'api-vercel' ? 'vercel-node-function' : 'node-process', node: '24', entrypoint, ...(target === 'api-vercel' ? { prebuiltOutput: '.vercel/output', prebuiltSha256: digest(JSON.stringify(prebuiltFiles)) } : { start: ['node', 'main.mjs'] }), compiler: { name: 'esbuild', version: compilerVersion, decoratorTransform: 'typescript-experimental-decorators', emitDecoratorMetadata: false }, sourceLockSha256: digest(sourceLockBytes), sources, dependencies: dependency.manifest.dependencies, files: [...emitted, ...packFiles, ...prebuiltFiles] };
  await writeFile(join(output, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ service, output: forward(relative(root, output)), sourceFiles: sources.length, dependencies: imports, artifactSha256: digest(JSON.stringify(artifact)) }));
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !['api', 'worker', 'api-vercel'].includes(process.argv[2])) throw new Error('Usage: node --import tsx scripts/runtime/build-artifacts.ts api|worker|api-vercel');
  await buildRuntimeArtifact(process.argv[2] as RuntimeTarget);
}
