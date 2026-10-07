import { createHash } from 'node:crypto';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { readBackendReleaseAdmission } from './backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected, type BackendReleaseIntent } from './backend-release-contracts';
import { prepareBackendWebHandover } from './backend-web-handover';
import { validateReleaseManifest } from './cicd-contracts';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson, parseReleaseExecutionJson } from './release-review';

const fail = () => Error('Backend web transfer requires current verified public evidence; contents withheld.');
const digest = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({ offset: true });
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
export const backendWebTransferProducerPaths = [
  '.github/workflows/backend-release.yml', 'scripts/verification/backend-release.ts',
  'scripts/verification/backend-release-admission.ts', 'scripts/verification/backend-release-contracts.ts',
  'scripts/verification/backend-web-handover.ts', 'scripts/verification/backend-web-settings.ts',
  'scripts/verification/backend-api-origin.ts', 'scripts/verification/backend-hosted-fault-recovery-native.ts',
  'scripts/verification/backend-hosted-database-restore.ts', 'scripts/verification/backend-web-transfer.ts',
  'scripts/verification/backend-runtime-resume.ts',
] as const;
export function backendWebTransferEvidenceNames(deploymentId: string,installedRuntime=false) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw fail();
  return [
    ...(installedRuntime?['runtime-resume-result.json']:['schema-result.json', 'population-result.json', 'auth-result.json', 'reference-result.json']),
    ...(!installedRuntime?['runtime-roles-result.json']:[]), 'provider-result.json', 'prerequisites-result.json',
    ...['intent', 'asset', 'room', 'result'].map(suffix => `private-probe-pre-activation-${deploymentId}-${suffix}.json`),
    'data-api-configuration.json', ...(!installedRuntime?['worker-activation-intent.json', 'worker-activation-result.json','worker-activation-cleanup.json']:[]), 'worker-fault-recovery-provisional.json', 'worker-fault-recovery-result.json',
    'worker-fault-recovery-cleanup.json', 'database-restore-result.json', 'database-restore-cleanup.json',
    'api-origin-result.json', 'web-handover-result.json', 'web-settings-result.json',
  ].sort();
}
const snapshotSchema = z.object({ ciRun: z.unknown(), backendRun: z.unknown() }).strict();
const transferSchema = z.object({
  version: z.literal(1), purpose: z.literal('CUEVO_COMPLETED_BACKEND_WEB_HANDOVER'), status: z.literal('EXPORTED_VERIFIED_BACKEND_HANDOVER'),
  preparedApproval: z.object({ status: z.literal('PREPARED_ONLY'), canonicalJson: z.string().max(49152), base64: z.string().max(65536), sha256: digest, comment: z.string().max(300) }).strict(),
  originalAdmission: snapshotSchema,
  manifest: z.unknown(), manifestSha256: digest,
  settings: z.object({ settingsSha256: digest, observedAt: time, operation: z.enum(['CONFIRMED', 'NOOP']) }).strict(),
  producers: z.array(z.object({ path: z.string(), sha256: digest }).strict()).length(backendWebTransferProducerPaths.length),
  evidence: z.array(z.object({ name: z.string(), sha256: digest }).strict()).min(1).max(30),
  exportedAt: time, originalMutationExpiresAt: time, earliestProofAt: time, consumptionExpiresAt: time,
  receiptScope: z.literal('ORIGINAL_NATIVE_BACKEND_HANDOVER_AND_CLEANUP'),
  privateProofReexecuted: z.literal(false), backendMutationAllowed: z.literal(false), customerReady: z.literal(false), hostedAcceptance: z.literal(false),
}).strict();
export type BackendWebTransfer = z.infer<typeof transferSchema>;

/** Validate the historical export clock; this never extends mutation admission.
 * Detailed private probes are represented by their original receipt hashes. */
export function validateBackendWebTransfer(raw: unknown, now: number) {
  try {
    if (!Number.isSafeInteger(now) || now < 0) throw fail();
    const transfer = transferSchema.parse(JSON.parse(canonicalReleaseExecutionJson(raw)));
    const body = JSON.parse(transfer.preparedApproval.canonicalJson) as BackendReleaseIntent;
    const exported = Date.parse(transfer.exportedAt), earliest = Date.parse(transfer.earliestProofAt);
    if (exported > now || earliest > exported || exported - earliest > 3600000
      || transfer.originalMutationExpiresAt !== body.expiresAt || Date.parse(body.expiresAt) <= exported
      || Date.parse(transfer.consumptionExpiresAt) !== earliest + 86400000 || now >= earliest + 86400000) throw fail();
    const assignments = body.reviews.map(({ category, taskId, reportSha256, evidenceSha256 }) => ({ category, taskId, reportSha256, evidenceSha256 }));
    const expected = { ...body, reviews: assignments, now: exported, currentMainSha: body.releaseSha,
      ciRun: transfer.originalAdmission.ciRun, backendRun: transfer.originalAdmission.backendRun };
    // Intent-only fields are not part of the existing expected-context contract.
    const context = Object.fromEntries(Object.entries(expected).filter(([key]) => !['version', 'purpose', 'preparedAt', 'expiresAt'].includes(key)));
    const prepared = validatePreparedBackendReleaseIntent(transfer.preparedApproval, context);
    const manifest = z.object({ api: z.object({ kind: z.literal('vercel'), deploymentId: z.string(), projectId: z.string(), teamId: z.string(), origin: z.string(), artifactSha256: digest, evidenceUrl: z.string() }), worker: z.object({ kind: z.literal('supabase-edge'), projectRef: z.string(), artifactSha256: digest, denoLockSha256: digest, evidenceUrl: z.string() }), database: z.object({ projectRef: z.string(), migrations: z.array(z.object({ version: z.string(), sha256: digest })), evidenceUrl: z.string(), dataApi: z.object({ verifiedAt: time, evidenceUrl: z.string() }) }), approval: z.object({ reviewer: z.literal('attaulhaq0'), evidenceUrl: z.string() }), verifiedAt: time, publicConfig: z.object({ apiUrl: z.string(), supabaseUrl: z.string(), supabasePublishableKey: z.string() }) }).parse(transfer.manifest);
    const publicConfig = validateReleaseManifest(transfer.manifest, { sha: body.releaseSha, environment: 'staging', ciRunId: body.ciRunId, now, migrations: manifest.database.migrations });
    if (hash(canonicalReleaseReviewJson(transfer.manifest)) !== transfer.manifestSha256
      || manifest.api.projectId !== body.targets.api.projectId || manifest.api.teamId !== body.targets.api.teamId || manifest.api.origin !== body.targets.api.origin
      || manifest.worker.projectRef !== body.targets.supabase.projectRef || manifest.database.projectRef !== body.targets.supabase.projectRef
      || manifest.api.artifactSha256 !== body.fingerprints.apiArtifactSha256 || manifest.worker.artifactSha256 !== body.fingerprints.edgeArtifactSha256 || manifest.worker.denoLockSha256 !== body.fingerprints.denoLockSha256
      || [manifest.api.evidenceUrl, manifest.worker.evidenceUrl, manifest.database.evidenceUrl, manifest.database.dataApi.evidenceUrl, manifest.approval.evidenceUrl].some(url => url !== `https://github.com/${body.repository}/actions/runs/${body.releaseRunId}`)
      || publicConfig.supabaseUrl !== body.targets.supabase.authOrigin
      || hash(canonicalReleaseExecutionJson({ NEXT_PUBLIC_API_URL: publicConfig.apiUrl, NEXT_PUBLIC_SUPABASE_URL: publicConfig.supabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicConfig.supabasePublishableKey })) !== transfer.settings.settingsSha256) throw fail();
    const clocks = [Date.parse(manifest.verifiedAt), Date.parse(manifest.database.dataApi.verifiedAt), Date.parse(transfer.settings.observedAt)];
    if (clocks.some(at => at < earliest || at > exported || exported - at > 3600000)) throw fail();
    if (!same(transfer.producers.map(row => row.path).sort(), [...backendWebTransferProducerPaths].sort())
      || !same(transfer.evidence.map(row => row.name).sort(), backendWebTransferEvidenceNames(manifest.api.deploymentId,body.installedRuntime!==undefined))) throw fail();
    return { transfer, body, expected: context as BackendReleaseExpected, prepared, manifest: transfer.manifest, publicConfig, assignments, reviewFacts: body.reviews };
  } catch { throw fail(); }
}

/** Shared confined data/source read; no symlink, alias, hardlink or outside path. */
export async function readBackendWebTransferFile(root: string, path: string, maximum = 1024 * 1024) {
  if (!isAbsolute(root) || resolve(root) !== root || !isAbsolute(path) || resolve(path) !== path) throw fail();
  const part = relative(root, path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(value => !value || value === '.' || value === '..')) throw fail();
  let current = root;
  const parent = await lstat(root); if (!parent.isDirectory() || parent.isSymbolicLink() || await realpath(root) !== root) throw fail();
  for (const [index, piece] of part.split(/[\\/]/).entries()) { current = join(current, piece); const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (index < part.split(/[\\/]/).length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1 || stat.size > maximum)) throw fail(); }
  const before = await lstat(path), bytes = await readFile(path), after = await lstat(path);
  if (bytes.length > maximum || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw fail();
  return bytes;
}

export async function exportBackendWebTransfer(value: unknown) {
  try {
    const input = z.object({ repoRoot: z.string(), bundleSha256: digest, githubToken: z.string().min(1), vercelToken: z.string().min(20), installedOperator:z.object({providerToken:z.string().min(20),journalStorageKey:z.string().min(20),migrationPassword:z.string().min(1)}).strict().optional() }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value)));
    const root = input.repoRoot, folder = join(root, '.local/hosted-release');
    const bundleBytes = await readBackendWebTransferFile(root, join(folder, 'backend-bundle.json'));
    if (hash(bundleBytes) !== input.bundleSha256) throw fail();
    const bundle = z.object({ purpose: z.literal('CUEVO_BACKEND_RELEASE_EXECUTION'), repoRoot: z.literal(root), expected: z.unknown(), preparedApproval: z.unknown() }).parse(parseReleaseExecutionJson(new TextDecoder('utf8', { fatal: true }).decode(bundleBytes)));
    const supplied = bundle.expected as BackendReleaseExpected;
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.GITHUB_WORKSPACE !== root || !root.startsWith('/home/runner/work/')
      || process.env.GITHUB_SHA !== supplied.releaseSha || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
      || process.env.GITHUB_REPOSITORY !== supplied.repository || process.env.GITHUB_RUN_ID !== supplied.releaseRunId || process.env.GITHUB_RUN_ATTEMPT !== String(supplied.runAttempt) || process.env.NODE_OPTIONS) throw fail();
    const prepared = validatePreparedBackendReleaseIntent(bundle.preparedApproval, { ...supplied, now: Date.now() });
    const admit = () => readBackendReleaseAdmission({ repoRoot: root, expected: supplied, prepared, githubToken: input.githubToken });
    await admit();
    const handover = await prepareBackendWebHandover(input);
    if (handover.status !== 'PREPARED_STAGING_MANIFEST' || handover.pendingGates.length || handover.manifestPath !== join(folder, 'web-handover-manifest.json') || handover.publicConfigurationPath !== join(folder, 'web-handover-public.json') || !handover.manifestSha256) throw fail();
    const manifestBytes = await readBackendWebTransferFile(root, handover.manifestPath), manifest = parseReleaseExecutionJson(new TextDecoder('utf8', { fatal: true }).decode(manifestBytes));
    if (hash(manifestBytes) !== handover.manifestSha256 || canonicalReleaseReviewJson(manifest) !== manifestBytes.toString('utf8')) throw fail();
    const publicConfig = z.object({ apiUrl: z.string(), supabaseUrl: z.string(), supabasePublishableKey: z.string() }).strict().parse(JSON.parse((await readBackendWebTransferFile(root, handover.publicConfigurationPath, 16384)).toString('utf8')));
    const typed = z.object({ api: z.object({ deploymentId: z.string() }), verifiedAt: time, publicConfig: z.unknown() }).parse(manifest);
    if (!same(publicConfig, typed.publicConfig)) throw fail();
    const settings = z.object({ purpose: z.literal('CUEVO_STAGING_PUBLIC_WEB_SETTINGS'), status: z.literal('WEB_PUBLIC_SETTINGS_CONFIRMED'), operation: z.enum(['CONFIRMED', 'NOOP']), sourceSha: z.literal(supplied.releaseSha), runId: z.literal(supplied.releaseRunId), runAttempt: z.literal(supplied.runAttempt), packageSha256: z.literal(prepared.sha256), manifestSha256: z.literal(handover.manifestSha256), webProjectId: z.literal(supplied.targets.web.projectId), teamId: z.literal(supplied.targets.web.teamId), observedAt: time, settingsSha256: digest, pendingGates: z.array(z.unknown()).length(0), hostedAcceptance: z.literal(false), canonicalReceipt: z.null() }).parse(JSON.parse((await readBackendWebTransferFile(root, join(folder, 'web-settings-result.json'))).toString('utf8')));
    const evidence = [], proofClocks = [Date.parse(typed.verifiedAt), Date.parse(settings.observedAt)];
    for (const name of backendWebTransferEvidenceNames(typed.api.deploymentId,supplied.installedRuntime!==undefined)) {
      const bytes = await readBackendWebTransferFile(root, join(folder, name));
      // Native owners retain JSON.stringify/canonical JSON followed by LF. Hash
      // those exact bytes; normalize only the bounded in-memory timestamp read.
      const raw = JSON.parse(canonicalReleaseExecutionJson(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)))) as Record<string, unknown>;
      if(name==='runtime-resume-result.json'){
        const original=supplied.installedRuntime;if(!original)throw fail();const receipt=z.object({status:z.literal('INSTALLED_RUNTIME_REVALIDATED'),sourceSha:z.literal(supplied.releaseSha),runId:z.literal(supplied.releaseRunId),runAttempt:z.literal(supplied.runAttempt),packageSha256:z.literal(prepared.sha256),nativeExecutionVerified:z.literal(true),lockReleased:z.literal(true),original:z.unknown(),activation:z.unknown(),cleanup:z.unknown(),observedAt:time}).parse(raw);
        if(!same(receipt.original,original)||hash(canonicalReleaseExecutionJson(receipt.activation))!==original.activationReceiptSha256)throw fail();
      }
      evidence.push({ name, sha256: hash(bytes) });
      for (const key of ['observedAt', 'verifiedAt', 'createdAt']) if (typeof raw[key] === 'string') { const at = Date.parse(raw[key]); if (!Number.isFinite(at)) throw fail(); proofClocks.push(at); }
    }
    const producers = [];
    for (const path of backendWebTransferProducerPaths) producers.push({ path, sha256: hash(await readBackendWebTransferFile(root, join(root, path))) });
    const rechecked = await prepareBackendWebHandover(input);
    if (rechecked.status !== 'PREPARED_STAGING_MANIFEST' || rechecked.pendingGates.length || rechecked.manifestSha256 !== handover.manifestSha256) throw fail();
    for (const row of evidence) if (hash(await readBackendWebTransferFile(root, join(folder, row.name))) !== row.sha256) throw fail();
    for (const row of producers) if (hash(await readBackendWebTransferFile(root, join(root, row.path))) !== row.sha256) throw fail();
    const admission = await admit(), exported = Date.now(), earliest = Math.min(...proofClocks);
    if (proofClocks.some(at => at > exported || exported - at > 3600000)) throw fail();
    const body = JSON.parse(prepared.canonicalJson) as BackendReleaseIntent;
    const transfer = { version: 1, purpose: 'CUEVO_COMPLETED_BACKEND_WEB_HANDOVER', status: 'EXPORTED_VERIFIED_BACKEND_HANDOVER', preparedApproval: prepared,
      originalAdmission: { ciRun: admission.expected.ciRun, backendRun: admission.expected.backendRun }, manifest, manifestSha256: handover.manifestSha256,
      settings: { settingsSha256: settings.settingsSha256, observedAt: settings.observedAt, operation: settings.operation }, producers, evidence,
      exportedAt: new Date(exported).toISOString(), originalMutationExpiresAt: body.expiresAt, earliestProofAt: new Date(earliest).toISOString(), consumptionExpiresAt: new Date(earliest + 86400000).toISOString(),
      receiptScope: 'ORIGINAL_NATIVE_BACKEND_HANDOVER_AND_CLEANUP', privateProofReexecuted: false, backendMutationAllowed: false, customerReady: false, hostedAcceptance: false };
    validateBackendWebTransfer(transfer, exported);
    const text = canonicalReleaseExecutionJson(transfer), transferPath = join(folder, 'web-transfer.json'), handle = await open(transferPath, 'wx', 0o600);
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    return { status: 'EXPORTED_VERIFIED_BACKEND_HANDOVER' as const, transferPath, transferSha256: hash(text), manifestSha256: handover.manifestSha256, backendRunId: supplied.releaseRunId, backendRunAttempt: supplied.runAttempt, hostedAcceptance: false as const };
  } catch { throw fail(); }
}
