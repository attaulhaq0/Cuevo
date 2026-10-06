import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { prepareNativeBackendRelease } from './backend-release-prepare';
import { readBackendReleaseAdmission } from './backend-release-admission';
import { validatePreparedBackendReleaseIntent } from './backend-release-contracts';
import { parseCanonicalReleaseReviewJson, parseReleaseExecutionJson } from './release-review';
import { createHostedOperatorStorageBootstrap } from '../database/hosted-operator-storage-bootstrap';
import { executeNativeHostedMigrations } from '../database/hosted-migration-executor';

const failure = () => Error('Backend release step requires review; private contents withheld.');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const bundleSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_BACKEND_RELEASE_EXECUTION'), repoRoot: z.string(), expected: z.unknown(), preparedApproval: z.unknown(), plan: z.unknown(), stages: z.array(z.unknown()).max(4), toolchainManifestPath: z.string(), operatorStoragePolicyPath: z.string(), artifacts: z.object({ apiRoot: z.string(), edgeRoot: z.string() }).strict() }).strict();
const privateNames = ['CUEVO_MIGRATION_DATABASE_PASSWORD', 'CUEVO_DATABASE_TLS_CA', 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY', 'CUEVO_AUTH_PROVISIONING_KEY', 'VERCEL_TOKEN'];
function required(env: Record<string, string | undefined>, key: string) { const value = env[key]; if (!value?.trim()) throw failure(); return value; }
async function ownedFile(root: string, path: string, maxBytes: number) {
  if (!isAbsolute(path) || resolve(path) !== path || await realpath(root) !== root) throw failure();
  const part = relative(root, path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(piece => !piece || piece === '.' || piece === '..')) throw failure();
  let current = root;
  for (const [index, piece] of part.split(/[\\/]/).entries()) { current = join(current, piece); const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (index === part.split(/[\\/]/).length - 1 ? !stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes : !stat.isDirectory())) throw failure(); }
  const before = await lstat(path), bytes = await readFile(path), after = await lstat(path);
  if (bytes.length > maxBytes || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw failure();
  return bytes;
}
async function record(root: string, filename: string, value: unknown) {
  const path = join(root, '.local/hosted-release', filename), handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
/** The workflow owns credential recipients; native owners recheck current official
 * source/approval and provider state before their original operations. */
export async function runBackendReleasePhase({ mode, repoRoot, env }: { mode: 'prepare' | 'approval' | 'bootstrap-schema'; repoRoot: string; env: Record<string, string | undefined> }) {
  try {
    if (!isAbsolute(repoRoot) || resolve(repoRoot) !== repoRoot || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw failure();
    if (mode === 'prepare') {
      if (privateNames.some(key => !!env[key])) throw failure();
      const result = await prepareNativeBackendRelease({ repoRoot, eventPath: required(env, 'GITHUB_EVENT_PATH'), repository: required(env, 'GITHUB_REPOSITORY'), sha: required(env, 'GITHUB_SHA'), ref: required(env, 'GITHUB_REF'), eventName: required(env, 'GITHUB_EVENT_NAME'), runId: required(env, 'GITHUB_RUN_ID'), runAttempt: Number(required(env, 'GITHUB_RUN_ATTEMPT')), githubToken: required(env, 'GH_TOKEN'), providerToken: required(env, 'SUPABASE_ACCESS_TOKEN'), input: parseCanonicalReleaseReviewJson(required(env, 'CUEVO_BACKEND_RELEASE_INPUT_JSON')) });
      await writeFile(required(env, 'GITHUB_OUTPUT'), `bundle-path=${result.bundlePath}\nbundle-sha256=${result.bundleSha256}\n`, { flag: 'a' });
      await writeFile(required(env, 'GITHUB_STEP_SUMMARY'), `## Cuevo backend schema package\n\nPrepared source and artifacts; no schema, accounts, worker or deployment changed.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(result.preparedApproval.canonicalJson), null, 2)}\n\`\`\`\n\nTo admit this exact schema package, use this comment when approving **staging**:\n\n\`${result.preparedApproval.comment}\`\n`, { flag: 'a' });
      return { status: 'PREPARED_ONLY' as const, hostedAcceptance: false };
    }
    const bundlePath = required(env, 'CUEVO_BACKEND_BUNDLE_PATH');
    if (bundlePath !== join(repoRoot, '.local/hosted-release/backend-bundle.json')) throw failure();
    const bytes = await ownedFile(repoRoot, bundlePath, 1024 * 1024);
    if (digest(bytes) !== required(env, 'CUEVO_BACKEND_BUNDLE_SHA256')) throw failure();
    const bundle = bundleSchema.parse(parseReleaseExecutionJson(new TextDecoder('utf8', { fatal: true }).decode(bytes)));
    const identity = z.object({ repository: z.literal(required(env, 'GITHUB_REPOSITORY')), releaseSha: z.literal(required(env, 'GITHUB_SHA')), releaseRunId: z.literal(required(env, 'GITHUB_RUN_ID')), runAttempt: z.literal(Number(required(env, 'GITHUB_RUN_ATTEMPT'))), environmentName: z.literal('staging'), deploymentEnvironment: z.literal('synthetic-staging') }).parse(bundle.expected);
    if (bundle.repoRoot !== repoRoot || identity.runAttempt < 1) throw failure();
    validatePreparedBackendReleaseIntent(bundle.preparedApproval, { ...bundle.expected as object, now: Date.now() });
    const shared = { repoRoot, expected: bundle.expected, preparedApproval: bundle.preparedApproval, githubToken: required(env, 'GH_TOKEN') };
    await readBackendReleaseAdmission({ repoRoot, expected: bundle.expected, prepared: bundle.preparedApproval, githubToken: shared.githubToken });
    if (mode === 'approval') return { status: 'ADMITTED' as const, hostedAcceptance: false };
    // Validate every needed input before the first provider mutation.
    const migrationPassword = required(env, 'CUEVO_MIGRATION_DATABASE_PASSWORD'), journalStorageKey = required(env, 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'), providerToken = required(env, 'SUPABASE_ACCESS_TOKEN'), ca = required(env, 'CUEVO_DATABASE_TLS_CA');
    if (!ca.includes('-----BEGIN CERTIFICATE-----') || Buffer.byteLength(ca) > 512 * 1024) throw failure();
    const certificatePath = join(repoRoot, '.local/hosted-release/database-ca.pem');
    await mkdir(join(repoRoot, '.local/hosted-release'), { recursive: true });
    const certificateHandle = await open(certificatePath, 'wx', 0o600);
    try { await certificateHandle.writeFile(ca); await certificateHandle.sync(); } finally { await certificateHandle.close(); }
    const bootstrap = await createHostedOperatorStorageBootstrap({ ...shared, providerToken, journalStorageKey, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath });
    const bucket = await bootstrap.bootstrap(); await record(repoRoot, 'bucket-result.json', bucket);
    if (bucket.status === 'REQUIRES_REVIEW') throw failure();
    const toolchainKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ'];
    const toolchain = Object.fromEntries(toolchainKeys.filter(key => env[key] !== undefined).map(key => [key, env[key]!]));
    const result = await executeNativeHostedMigrations({ ...shared, providerToken, journalStorageKey, migrationPassword, plan: bundle.plan, stages: bundle.stages, certificate: { path: certificatePath, sha256: digest(ca) }, toolchainManifestPath: bundle.toolchainManifestPath, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath, toolchain });
    await record(repoRoot, 'schema-result.json', result);
    if (!['COMMITTED', 'NOOP'].includes(result.status)) throw failure();
    return result;
  } catch { throw failure(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2];
  if (!['prepare', 'approval', 'bootstrap-schema'].includes(mode)) throw failure();
  try { const result = await runBackendReleasePhase({ mode: mode as 'prepare' | 'approval' | 'bootstrap-schema', repoRoot: process.cwd(), env: process.env }); console.log(JSON.stringify({ step: mode, status: result.status, hostedAcceptance: false })); }
  catch { console.error('Cuevo backend step requires review. Inspect retained source-bound receipts; private contents withheld.'); process.exitCode = 1; }
}
