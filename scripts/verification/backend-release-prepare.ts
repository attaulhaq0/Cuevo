import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { z } from 'zod';
import { readBackendReleaseSourceEvidence } from './backend-release-admission';
import { prepareBackendReleaseIntent, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from './backend-release-contracts';
import { validateCiRun, validateReleaseControls } from './cicd-contracts';
import { canonicalReleaseReviewJson, canonicalReleaseExecutionJson, parseReleaseExecutionJson } from './release-review';
import { createCanonicalHostedMigrationPlan, canonicalHostedMigrationPlan, type HostedMigrationPlanV1 } from '../database/hosted-migration-plan';
import { createHostedMigrationWorkdirs, type HostedMigrationWorkdirs } from '../database/hosted-migration-workdirs';
import { readHostedMigrationProvider } from '../database/hosted-migration-provider';
import { prepareHostedOperatorStoragePolicy } from '../database/hosted-operator-storage-policy';
import { buildRuntimeArtifact } from '../runtime/build-artifacts';
import { buildEdgeArtifact } from '../runtime/build-edge-artifact';

const builderRepoRoot = resolve(import.meta.dirname, '../..');
const failure = () => Error('Native backend preparation requires review; contents withheld.');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const repositoryName = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/);
const secret = z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/);
const review = z.object({ category: z.enum(['source-spec-code', 'qa-regression-operations']), taskId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./:-]+$/), reportSha256: hash, evidenceSha256: hash, releaseSha: sha, treeSha: sha, baseSha: sha, sourceManifestSha256: hash, diffSha256: hash, reviewedAt: z.iso.datetime({ offset: true }) }).strict();
const inputSchema = z.object({ repoRoot: z.string(), eventPath: z.string(), repository: repositoryName, sha, ref: z.literal('refs/heads/main'), eventName: z.literal('workflow_dispatch'), runId: identifier, runAttempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), githubToken: secret, providerToken: secret, input: z.object({ targets: z.unknown(), baseSha: sha, ciRunId: identifier, reviews: z.array(review).length(2) }).strict() }).strict();
const eventSchema = z.object({ ref: z.literal('refs/heads/main'), inputs: z.object({ commit_sha: sha, ci_run_id: identifier }), repository: z.object({ full_name: repositoryName }) });
const ciSchema = z.object({ id: z.number().int().positive(), head_sha: sha, head_branch: z.literal('main'), event: z.literal('push'), status: z.literal('completed'), conclusion: z.literal('success'), path: z.literal('.github/workflows/ci.yml'), repository: z.object({ full_name: repositoryName }) });
const runSchema = z.object({ id: z.number().int().positive(), run_attempt: z.number().int().positive(), head_sha: sha, head_branch: z.literal('main'), event: z.literal('workflow_dispatch'), status: z.enum(['waiting', 'in_progress']), conclusion: z.null(), path: z.literal('.github/workflows/backend-release.yml'), repository: z.object({ full_name: repositoryName }) });
const zero = z.union([z.literal(0), z.literal('0')]).transform(() => 0 as const);
const emptySchema = z.array(z.object({ authUsers: zero, storageObjects: zero, appSchemas: z.array(z.string()).length(0), runtimeRoles: z.array(z.string()).length(0), historyPresent: z.literal(false), recoveryCronPresent: z.boolean() }).strict()).length(1);
const targetQuery = `/* CUEVO_BACKEND_EMPTY_PREPARATION */ select (select count(*) from auth.users) as "authUsers", (select count(*) from storage.objects) as "storageObjects", coalesce((select jsonb_agg(nspname order by nspname) from pg_namespace where nspname in ('app','internal','authorization')),'[]'::jsonb) as "appSchemas", coalesce((select jsonb_agg(rolname order by rolname) from pg_roles where rolname in ('cuevo_api','cuevo_worker')),'[]'::jsonb) as "runtimeRoles", to_regclass('supabase_migrations.schema_migrations') is not null as "historyPresent", to_regclass('cron.job') is not null as "recoveryCronPresent"`;
const cronQuery = "/* CUEVO_BACKEND_PREPARATION_CRON */ select not exists(select 1 from cron.job where active and(lower(coalesce(jobname,'')) like '%cuevo%' or command ~* '(request_worker_wake|configure_worker_dispatch|send_worker_wake)')) as inactive";
type NativePreparationInput = z.infer<typeof inputSchema>;
export type PreparedNativeBackendRelease = { version: 1; purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION'; repoRoot: string; expected: BackendReleaseExpected; preparedApproval: PreparedBackendReleaseIntent; plan: HostedMigrationPlanV1; stages: HostedMigrationWorkdirs['stages']; toolchainManifestPath: string; operatorStoragePolicyPath: string; artifacts: { apiRoot: string; edgeRoot: string }; bundlePath: string; bundleSha256: string };
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
function git(root: string, args: string[], input?: string) {
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
  return execFileSync('git', ['-C', root, ...args], { input, env, timeout: 15000, maxBuffer: 192 * 1024 * 1024, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
}
async function physical(root: string, path: string, kind: 'file' | 'directory') {
  if (!isAbsolute(root) || resolve(root) !== root || !isAbsolute(path) || resolve(path) !== path) throw failure();
  const part = relative(root, path); if (isAbsolute(part) || part.split(/[\\/]/).some(piece => piece === '..')) throw failure();
  let current = root;
  for (const piece of [...part.split(/[\\/]/).filter(Boolean), '']) {
    const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (piece ? !stat.isDirectory() : kind === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) throw failure();
    if (piece) current = join(current, piece);
  }
}
async function file(root: string, path: string, maximum: number) {
  await physical(root, path, 'file'); const before = await lstat(path); if (before.size > maximum) throw failure();
  const bytes = await readFile(path), after = await lstat(path);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length > maximum) throw failure();
  return bytes;
}
async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.ok || response.redirected || !response.body) throw failure();
  const declared = response.headers.get('content-length'); if (declared && (!/^\d+$/.test(declared) || Number(declared) > 512 * 1024)) throw failure();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(failure()); }; if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(failure()); });
      });
      if (signal.aborted) throw failure(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 512 * 1024) throw failure(); chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
  } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled pending reads retain cleanup. */ } }
}
async function request(url: string, token: string, query?: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { method: query === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(query === undefined ? { 'X-GitHub-Api-Version': '2022-11-28' } : { 'Content-Type': 'application/json' }) }, ...(query === undefined ? {} : { body: JSON.stringify({ query }) }), redirect: 'error', signal: controller.signal });
    if (response.url && response.url !== url) throw failure(); return await boundedJson(response, controller.signal);
  } finally { clearTimeout(timer); controller.abort(); }
}
async function authority(input: NativePreparationInput, treeSha: string) {
  const github = (path: string) => request(`https://api.github.com/repos/${input.repository}${path ? '/' + path : ''}`, input.githubToken);
  const [repository, mainRaw, ciRaw, runRaw, environment, branches, main, signatures, commit] = await Promise.all([github(''), github('git/ref/heads/main'), github('actions/runs/' + input.input.ciRunId), github('actions/runs/' + input.runId), github('environments/staging'), github('environments/staging/deployment-branch-policies'), github('branches/main/protection'), github('branches/main/protection/required_signatures'), github('git/commits/' + input.sha)]);
  const ci = ciSchema.parse(ciRaw), backend = runSchema.parse(runRaw), mainSha = z.object({ object: z.object({ type: z.literal('commit'), sha }) }).parse(mainRaw).object.sha;
  validateCiRun(ci, { sha: input.sha, repository: input.repository, ciRunId: input.input.ciRunId }); validateReleaseControls({ repository, environment, branches, main, signatures }, { repository: input.repository, environment: 'staging' });
  const environmentId = z.object({ id: z.number().int().positive(), name: z.literal('staging') }).parse(environment).id;
  z.object({ total_count: z.literal(1) }).parse(branches);
  z.object({ sha: z.literal(input.sha), tree: z.object({ sha: z.literal(treeSha) }), verification: z.object({ verified: z.literal(true), reason: z.literal('valid'), signature: z.string().min(1), payload: z.string().min(1) }) }).parse(commit);
  if (mainSha !== input.sha || String(backend.id) !== input.runId || backend.run_attempt !== input.runAttempt || backend.head_sha !== input.sha || backend.repository.full_name !== input.repository) throw failure();
  return { currentMainSha: mainSha, environmentId, ciRun: { ...ci, repository: { full_name: ci.repository.full_name } }, backendRun: { ...backend, repository: { full_name: backend.repository.full_name } } };
}
async function emptyTarget(input: NativePreparationInput, projectRef: string) {
  const provider = await readHostedMigrationProvider({ projectRef, boundProjectRef: projectRef, providerToken: input.providerToken });
  const rows = emptySchema.parse(await request(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, input.providerToken, targetQuery));
  if (rows[0].recoveryCronPresent) z.array(z.object({ inactive: z.literal(true) }).strict()).length(1).parse(await request(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, input.providerToken, cronQuery));
  if (provider.observedAtMs > Date.now() || Date.now() - provider.observedAtMs > 30000) throw failure();
  return { projectRef, boundProjectRef: projectRef, projectName: provider.projectName, projectStatus: provider.projectStatus, deploymentEnvironment: 'synthetic-staging' as const, observedAt: new Date().toISOString(), authUsers: rows[0].authUsers, storageObjects: rows[0].storageObjects, appSchemas: [], migrationVersions: [], dispatchDisabled: true as const, population: 'EMPTY' as const };
}
async function outputDirectory(root: string) {
  for (const path of [join(root, '.local'), join(root, '.local/hosted-release')]) { try { await mkdir(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw failure(); } await physical(root, path, 'directory'); }
  const probe = '.local/hosted-release/backend-bundle.json'; if (git(root, ['check-ignore', '--no-index', '--stdin'], probe + '\n').toString().trim() !== probe || git(root, ['ls-files', '--cached', '--', '.local/hosted-release']).length) throw failure();
}
async function persist(root: string, path: string, bytes: string) {
  await physical(root, join(root, '.local/hosted-release'), 'directory');
  const handle = await open(path, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  if (!(await file(root, path, 1024 * 1024)).equals(Buffer.from(bytes))) throw failure();
}
async function toolchain(root: string, sourceSha: string, treeSha: string) {
  const lockBytes = git(root, ['show', sourceSha + ':package-lock.json']), lock = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(lockBytes)) as { lockfileVersion: number; packages?: Record<string, { version?: string; integrity?: string; resolved?: string }> };
  if (!['win32', 'linux', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw failure();
  const platform = process.platform === 'win32' ? 'windows' : process.platform, cliRoot = join(root, 'node_modules/supabase'), packageRoot = join(root, `node_modules/@supabase/cli-${platform}-${process.arch}`), suffix = process.platform === 'win32' ? '.exe' : '';
  for (const path of ['node_modules/supabase', `node_modules/@supabase/cli-${platform}-${process.arch}`]) { const row = lock.packages?.[path]; if (lock.lockfileVersion !== 3 || row?.version !== '2.119.0' || !row.integrity?.startsWith('sha512-') || !row.resolved?.startsWith('https://registry.npmjs.org/')) throw failure(); }
  const cli = z.object({ name: z.literal('supabase'), version: z.literal('2.119.0'), type: z.literal('module') }).parse(JSON.parse((await file(root, join(cliRoot, 'package.json'), 65536)).toString('utf8')));
  z.object({ name: z.literal(`@supabase/cli-${platform}-${process.arch}`), version: z.literal(cli.version) }).parse(JSON.parse((await file(root, join(packageRoot, 'package.json'), 65536)).toString('utf8')));
  return { version: 1, purpose: 'CUEVO_HOSTED_MIGRATION_TOOLCHAIN', sourceSha, treeSha, sourceLockSha256: digest(lockBytes), cliVersion: cli.version, platform: `${process.platform}-${process.arch}`, cli: { shimSha256: digest(await file(root, join(cliRoot, 'dist/supabase.js'), 2 * 1024 * 1024)), binarySha256: digest(await file(root, join(packageRoot, 'bin/supabase' + suffix), 192 * 1024 * 1024)), sidecarSha256: digest(await file(root, join(packageRoot, 'bin/supabase-go' + suffix), 192 * 1024 * 1024)) } };
}
async function artifact(root: string, directory: string, built: unknown, service: 'api' | 'cuevo-worker') {
  const bytes = await file(root, join(directory, 'artifact.json'), 4 * 1024 * 1024), parsed = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) as { schemaVersion: number; service: string; files: { path: string; sha256: string }[]; denoLockSha256?: string };
  if (JSON.stringify(parsed) !== JSON.stringify(built) || parsed.schemaVersion !== 1 || parsed.service !== service || !Array.isArray(parsed.files) || !parsed.files.length || parsed.files.length > 20000) throw failure();
  const paths = new Set<string>();
  for (const row of parsed.files) { if (!row || typeof row.path !== 'string' || row.path.includes('\\') || row.path.startsWith('/') || row.path.split('/').some(piece => !piece || piece === '.' || piece === '..') || row.path === 'artifact.json' || paths.has(row.path) || !hash.safeParse(row.sha256).success) throw failure(); paths.add(row.path); if (digest(await file(root, join(directory, row.path), 32 * 1024 * 1024)) !== row.sha256) throw failure(); }
  const collect = async (path: string): Promise<string[]> => { await physical(root, path, 'directory'); const rows: string[] = []; for (const entry of await readdir(path, { withFileTypes: true })) { const next = join(path, entry.name); if (entry.isDirectory()) rows.push(...await collect(next)); else { await physical(root, next, 'file'); rows.push(relative(directory, next).replaceAll('\\', '/')); } } return rows; };
  if (!same((await collect(directory)).sort(), ['artifact.json', ...paths].sort())) throw failure();
  if (service === 'cuevo-worker' && (!hash.safeParse(parsed.denoLockSha256).success || !paths.has('deno.lock') || digest(await file(root, join(directory, 'deno.lock'), 2 * 1024 * 1024)) !== parsed.denoLockSha256)) throw failure();
  return { sha256: digest(JSON.stringify(parsed)), ...(parsed.denoLockSha256 === undefined ? {} : { denoLockSha256: parsed.denoLockSha256 }) };
}
async function workdirs(root: string, work: HostedMigrationWorkdirs, plan: HostedMigrationPlanV1) {
  if (work.projectRef !== plan.projectRef || work.sourceSha !== plan.source.sha || work.treeSha !== plan.source.tree || work.planSha256 !== canonicalHostedMigrationPlan(plan).sha256 || work.execution !== 'NOT_EXECUTED' || work.stages.length !== 4) throw failure();
  const contained = relative(join(root, '.local/hosted-release'), work.root); if (!contained || isAbsolute(contained) || contained.split(/[\\/]/).some(piece => piece === '..')) throw failure();
  await physical(root, work.root, 'directory'); let boundary = 0;
  for (const [index, stage] of work.stages.entries()) {
    const before = boundary; boundary += plan.stages[index].names.length;
    const included = plan.migrations.slice(0, boundary), pending = included.filter(row => plan.stages[index].names.includes(row.name));
    if (stage.id !== plan.stages[index].id || stage.workdir !== join(work.root, stage.id) || !same(stage.included, included) || !same(stage.pending, pending) || !same(stage.expectedBeforeVersions, plan.migrations.slice(0, before).map(row => row.version).sort()) || !same(stage.expectedAfterVersions, included.map(row => row.version).sort())) throw failure();
    const supabase = join(stage.workdir, 'supabase'), migrations = join(supabase, 'migrations');
    if (!same((await readdir(stage.workdir)).sort(), ['supabase']) || !same((await readdir(supabase)).sort(), ['config.toml', 'migrations']) || !same((await readdir(migrations)).sort(), included.map(row => row.name).sort())) throw failure();
    if (digest(await file(root, join(supabase, 'config.toml'), 8192)) !== stage.configSha256) throw failure();
    for (const row of included) if (digest(await file(root, join(migrations, row.name), 2 * 1024 * 1024)) !== row.sha256) throw failure();
  }
  if (boundary !== plan.migrations.length || !same((await readdir(work.root)).sort(), ['builder-state.json', ...work.stages.map(stage => stage.id)].sort())) throw failure();
}

/** Fixed native source/provider reads and local builders only. This package never grants approval or hosted readiness. */
export async function prepareNativeBackendRelease(value: unknown): Promise<PreparedNativeBackendRelease> {
  try {
    const input = inputSchema.parse(JSON.parse(canonicalReleaseReviewJson(value))), root = input.repoRoot;
    if (root !== builderRepoRoot) throw failure(); await physical(root, root, 'directory');
    const event = eventSchema.parse(JSON.parse((await file(parse(input.eventPath).root, input.eventPath, 48 * 1024)).toString('utf8')));
    if (event.inputs.commit_sha !== input.sha || event.inputs.ci_run_id !== input.input.ciRunId || event.repository.full_name !== input.repository) throw failure();
    const treeSha = sha.parse(git(root, ['rev-parse', input.sha + '^{tree}']).toString().trim()), sourceManifestSha256 = digest(git(root, ['ls-tree', '-r', '-z', input.sha])), diffSha256 = digest(git(root, ['diff', '--no-ext-diff', '--no-textconv', '--binary', input.input.baseSha, input.sha, '--']));
    const source = { releaseSha: input.sha, treeSha, baseSha: input.input.baseSha, fingerprints: { sourceManifestSha256, diffSha256 } };
    await readBackendReleaseSourceEvidence(root, source as Parameters<typeof readBackendReleaseSourceEvidence>[1]);
    const current = await authority(input, treeSha), placeholder = '0'.repeat(64), now = Date.now();
    const common = { repository: input.repository, releaseSha: input.sha, treeSha, baseSha: input.input.baseSha, ciRunId: input.input.ciRunId, releaseRunId: input.runId, runAttempt: input.runAttempt, environmentName: 'staging' as const, deploymentEnvironment: 'synthetic-staging' as const, targets: input.input.targets as BackendReleaseExpected['targets'], reviews: input.input.reviews.map(({ category, taskId, reportSha256, evidenceSha256 }) => ({ category, taskId, reportSha256, evidenceSha256 })) };
    const trial: BackendReleaseExpected = { ...common, ...current, now, fingerprints: { sourceManifestSha256, diffSha256, migrationPlanSha256: placeholder, migrationHistorySha256: placeholder, migrationToolchainSha256: placeholder, operatorStoragePolicySha256: placeholder, apiArtifactSha256: placeholder, edgeArtifactSha256: placeholder, denoLockSha256: placeholder } };
    const intent = (expected: BackendReleaseExpected) => ({ ...common, environmentId: expected.environmentId, version: 1, purpose: 'BACKEND_SYNTHETIC_STAGING', fingerprints: expected.fingerprints, preparedAt: new Date(expected.now).toISOString(), expiresAt: new Date(expected.now + 3600000).toISOString(), reviews: input.input.reviews });
    prepareBackendReleaseIntent(intent(trial), trial);
    const projectRef = trial.targets.supabase.projectRef, target = await emptyTarget(input, projectRef), planned = createCanonicalHostedMigrationPlan({ repoRoot: root, sourceSha: input.sha, treeSha, target, now: Date.now() });
    const plan = planned.plan; if (planned.sourceProvenance.kind !== 'VERIFIED_GIT_BLOBS' || plan.mode !== 'EMPTY_INITIAL' || plan.applied.length || plan.dispatch !== 'DISABLED' || plan.seed !== 'DISABLED' || plan.vault !== 'DISABLED') throw failure();
    await outputDirectory(root);
    const toolchainManifestPath = join(root, '.local/hosted-release/migration-toolchain.json'), operatorStoragePolicyPath = join(root, '.local/hosted-release/operator-storage-policy.json'), bundlePath = join(root, '.local/hosted-release/backend-bundle.json');
    const manifest = await toolchain(root, input.sha, treeSha), manifestBytes = canonicalReleaseReviewJson(manifest), policy = prepareHostedOperatorStoragePolicy({ sourceSha: input.sha, treeSha, projectRef });
    await persist(root, toolchainManifestPath, manifestBytes); await persist(root, operatorStoragePolicyPath, policy.canonicalJson);
    const work = await createHostedMigrationWorkdirs({ repoRoot: root, sourceSha: input.sha, treeSha, plan, outputRoot: join(root, '.local/hosted-release') }); await workdirs(root, work, plan);
    const apiRoot = join(root, '.local/runtime-artifacts/api-vercel'), edgeRoot = join(root, '.local/edge-artifacts/cuevo-worker');
    for (const directory of [join(root, '.local/runtime-artifacts'), join(root, '.local/edge-artifacts')]) { try { await mkdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw failure(); } await physical(root, directory, 'directory'); }
    const builtApi = await buildRuntimeArtifact('api-vercel'), api = await artifact(root, apiRoot, builtApi, 'api'), builtEdge = await buildEdgeArtifact(), edge = await artifact(root, edgeRoot, builtEdge, 'cuevo-worker');
    await readBackendReleaseSourceEvidence(root, source as Parameters<typeof readBackendReleaseSourceEvidence>[1]);
    const finalAuthority = await authority(input, treeSha); if (!same(finalAuthority, current)) throw failure(); await emptyTarget(input, projectRef);
    await workdirs(root, work, plan); if (!same(await toolchain(root, input.sha, treeSha), manifest) || !(await file(root, toolchainManifestPath, 48 * 1024)).equals(Buffer.from(manifestBytes)) || !(await file(root, operatorStoragePolicyPath, 8192)).equals(Buffer.from(policy.canonicalJson)) || !same(await artifact(root, apiRoot, builtApi, 'api'), api) || !same(await artifact(root, edgeRoot, builtEdge, 'cuevo-worker'), edge)) throw failure();
    const expected: BackendReleaseExpected = { ...trial, ...finalAuthority, now: Date.now(), fingerprints: { sourceManifestSha256, diffSha256, migrationPlanSha256: canonicalHostedMigrationPlan(plan).sha256, migrationHistorySha256: plan.observedHistorySha256, migrationToolchainSha256: digest(manifestBytes), operatorStoragePolicySha256: policy.sha256, apiArtifactSha256: api.sha256, edgeArtifactSha256: edge.sha256, denoLockSha256: edge.denoLockSha256! } }, preparedApproval = prepareBackendReleaseIntent(intent(expected), expected);
    const bundle = { version: 1 as const, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION' as const, repoRoot: root, expected, preparedApproval, plan, stages: work.stages, toolchainManifestPath, operatorStoragePolicyPath, artifacts: { apiRoot, edgeRoot } }, bytes = canonicalReleaseExecutionJson(bundle); parseReleaseExecutionJson(bytes);
    if (bytes.includes(input.githubToken) || bytes.includes(input.providerToken)) throw failure();
    await readBackendReleaseSourceEvidence(root, source as Parameters<typeof readBackendReleaseSourceEvidence>[1]);
    await persist(root, bundlePath, bytes); return { ...bundle, bundlePath, bundleSha256: digest(bytes) };
  } catch { throw failure(); }
}
