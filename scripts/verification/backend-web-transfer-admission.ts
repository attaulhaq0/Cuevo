import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { readBackendReleaseSourceEvidence } from './backend-release-admission';
import { readCanonicalMigrationSources } from '../database/hosted-migration-plan';
import { validateCiRun, validateReleaseControls } from './cicd-contracts';
import { canonicalReleaseExecutionJson, parseReleaseExecutionJson } from './release-review';
import { readBackendWebTransferFile, validateBackendWebTransfer } from './backend-web-transfer';

const fail = () => Error('Completed backend web handover consumption requires review; contents withheld.');
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// Official Actions timestamps may serialize only whole seconds. This comparison
// admits precision loss in chronology, never extra proof/expiry validity.
const officialBefore = (left: string, right: string) => Math.floor(Date.parse(left) / 1000) < Math.floor(Date.parse(right) / 1000);
const inputSchema = z.object({ repoRoot: z.string(), githubToken: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/),
  releaseSha: sha, ciRunId: identifier, backendRunId: identifier, backendRunAttempt: positive, artifactId: identifier, transferSha256: digest,
  web: z.object({ teamId: z.string().regex(/^team_[A-Za-z0-9]+$/), projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), target: z.literal('preview') }).strict(),
}).strict();
type Input = z.infer<typeof inputSchema>;
const runSchema = z.object({ id: positive, run_attempt: positive, repository: z.object({ full_name: z.string() }), head_sha: sha, head_branch: z.literal('main'),
  path: z.literal('.github/workflows/backend-release.yml'), event: z.literal('workflow_dispatch'), status: z.literal('completed'), conclusion: z.literal('success'),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
});
const approvalSchema = z.object({ environments: z.array(z.object({ id: positive, name: z.string() })).min(1).max(20), state: z.enum(['approved', 'rejected', 'pending']),
  user: z.object({ id: positive, login: z.string(), type: z.string() }), comment: z.string().max(2000),
});

/** Completed-run receipt consumption is distinct from live mutation admission.
 * This checks the real terminal run, never rewrites it as waiting/in_progress. */
export function validateCompletedBackendWebApproval(rawRun: unknown, rawApprovals: unknown, transferRaw: unknown, now: number) {
  try {
    const admitted = validateBackendWebTransfer(transferRaw, now), { body, prepared, transfer } = admitted;
    const run = runSchema.parse(rawRun);
    if (String(run.id) !== body.releaseRunId || run.run_attempt !== body.runAttempt || run.repository.full_name !== body.repository || run.head_sha !== body.releaseSha
      || officialBefore(body.preparedAt, run.created_at) || officialBefore(run.updated_at, transfer.exportedAt) || Date.parse(run.updated_at) > now) throw fail();
    const approvals = z.array(approvalSchema).max(100).parse(JSON.parse(canonicalReleaseExecutionJson(rawApprovals)));
    const matching = approvals.filter(row => row.environments.some(environment => environment.id === body.environmentId || environment.name === 'staging'));
    if (matching.length !== 1) throw fail();
    const approval = matching[0];
    if (approval.environments.length !== 1 || approval.environments[0].id !== body.environmentId || approval.environments[0].name !== 'staging'
      || approval.state !== 'approved' || approval.user.id !== 95836629 || approval.user.login !== 'attaulhaq0' || approval.user.type !== 'User' || approval.comment !== prepared.comment) throw fail();
    return { ...admitted, backendRun: run, founderId: 95836629 as const, founderLogin: 'attaulhaq0' as const };
  } catch { throw fail(); }
}

type ZipEntry = { fileName: string; uncompressedSize: number; compressedSize: number; generalPurposeBitFlag: number; compressionMethod: number; externalFileAttributes: number };
type Zip = { entryCount: number; on(name: 'error' | 'entry' | 'end', listener: (...args: never[]) => void): void; readEntry(): void; close(): void; openReadStream(entry: ZipEntry, callback: (error: Error | null, stream?: Readable) => void): void };
const { yauzl } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { yauzl: { fromBuffer(bytes: Buffer, options: object, callback: (error: Error | null, zip?: Zip) => void): void } };

/** Existing locked ZIP reader, exactly one plain JSON entry, no disk extraction. */
export async function readBackendWebTransferArchive(bytes: Uint8Array, archiveSha256: string, transferSha256: string): Promise<unknown> {
  try {
    if (!digest.safeParse(archiveSha256).success || !digest.safeParse(transferSha256).success || bytes.byteLength > 2 * 1024 * 1024 || hash(bytes) !== archiveSha256) throw fail();
    const file = await new Promise<Buffer>((done, reject) => {
      let opened: Zip | undefined, reader: Readable | undefined, settled = false, count = 0, body: Buffer | undefined;
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); reader?.destroy(); opened?.close(); if (error || !body) reject(fail()); else done(body); };
      const timer = setTimeout(() => finish(fail()), 10000);
      yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
        if (settled) { zip?.close(); return; } if (error || !zip) return finish(fail()); opened = zip;
        if (zip.entryCount !== 1) return finish(fail());
        zip.on('error', (() => finish(fail())) as (...args: never[]) => void);
        zip.on('end', (() => count === 1 ? finish() : finish(fail())) as (...args: never[]) => void);
        zip.on('entry', ((entry: ZipEntry) => {
          const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (++count !== 1 || entry.fileName !== 'web-transfer.json' || entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod)
            || ![0, 0x8000].includes(kind) || entry.externalFileAttributes & 0x10 || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 1 || entry.uncompressedSize > 192 * 1024 || entry.compressedSize > 2 * 1024 * 1024) return finish(fail());
          zip.openReadStream(entry, (readError, stream) => {
            if (readError || !stream || settled) { stream?.destroy(); return finish(fail()); } reader = stream;
            const parts: Buffer[] = []; let size = 0;
            stream.on('error', () => finish(fail()));
            stream.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 192 * 1024 || size > entry.uncompressedSize) return finish(fail()); parts.push(chunk); });
            stream.on('end', () => { if (settled || size !== entry.uncompressedSize) return finish(fail()); body = Buffer.concat(parts); zip.readEntry(); });
          });
        }) as (...args: never[]) => void);
        zip.readEntry();
      });
    });
    if (hash(file) !== transferSha256) throw fail();
    const text = new TextDecoder('utf8', { fatal: true }).decode(file), value = parseReleaseExecutionJson(text);
    if (canonicalReleaseExecutionJson(value) !== text) throw fail();
    return value;
  } catch { throw fail(); }
}

async function boundedBytes(response: Response, signal: AbortSignal, maximum: number) {
  if (!response.ok || response.redirected || !response.body) throw fail();
  const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw fail();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) {
    const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(fail()); }; if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true }); void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(fail()); });
    });
    if (signal.aborted) throw fail(); if (part.done) break; size += part.value.length; if (size > maximum) throw fail(); parts.push(part.value);
  } return Buffer.concat(parts); } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Pending cancelled reads own cleanup. */ } }
}

export async function readCompletedBackendWebTransferAdmission(value: unknown) {
  try {
    const input: Input = inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));
    // Trusted manual main runner only. The caller's web-purpose/approval
    // admission remains a separate obligation of the existing release owner.
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.GITHUB_WORKSPACE !== input.repoRoot
      || !input.repoRoot.startsWith('/home/runner/work/') || process.env.GITHUB_SHA !== input.releaseSha || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.NODE_OPTIONS) throw fail();
    const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).parse(process.env.GITHUB_REPOSITORY);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    const urlFor = (path: string) => `https://api.github.com/repos/${repository}${path ? '/' + path : ''}`;
    const get = async (path: string) => {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), response = await fetch(urlFor(path), { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', cache: 'no-store', credentials: 'omit', signal });
      return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(await boundedBytes(response, signal, 512 * 1024))) as unknown;
    };
    try {
      const run = runSchema.parse(await get('actions/runs/' + input.backendRunId));
      if (String(run.id) !== input.backendRunId || run.run_attempt !== input.backendRunAttempt || run.repository.full_name !== repository || run.head_sha !== input.releaseSha) throw fail();
      const artifactSchema = z.object({ id: positive, name: z.literal(`cuevo-web-handover-${input.backendRunId}-${input.backendRunAttempt}`), size_in_bytes: z.number().int().min(1).max(2 * 1024 * 1024), expired: z.literal(false), digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        created_at: z.iso.datetime({ offset: true }), expires_at: z.iso.datetime({ offset: true }), workflow_run: z.object({ id: z.literal(Number(input.backendRunId)), head_branch: z.literal('main'), head_sha: z.literal(input.releaseSha) }) });
      const artifact = artifactSchema.parse(await get('actions/artifacts/' + input.artifactId));
      const now = Date.now();
      if (String(artifact.id) !== input.artifactId || Date.parse(artifact.created_at) < Date.parse(run.created_at) || Date.parse(artifact.created_at) > Date.parse(run.updated_at) || Date.parse(artifact.expires_at) <= now) throw fail();
      const archiveSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), archiveUrl = urlFor('actions/artifacts/' + input.artifactId + '/zip');
      let response = await fetch(archiveUrl, { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: archiveSignal });
      if (response.status === 302) {
        const target = new URL(response.headers.get('location') ?? ''); void response.body?.cancel().catch(() => undefined);
        if (target.protocol !== 'https:' || target.username || target.password || target.port || target.hash || !(/^productionresultssa[a-z0-9]+\.blob\.core\.windows\.net$/.test(target.hostname) || /^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(target.hostname))) throw fail();
        response = await fetch(target, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: archiveSignal });
      }
      const archive = await boundedBytes(response, archiveSignal, 2 * 1024 * 1024);
      if (archive.byteLength !== artifact.size_in_bytes) throw fail();
      const raw = await readBackendWebTransferArchive(archive, artifact.digest.slice(7), input.transferSha256), initial = validateBackendWebTransfer(raw, now);
      if (initial.body.repository !== repository || initial.body.releaseSha !== input.releaseSha || initial.body.ciRunId !== input.ciRunId || initial.body.releaseRunId !== input.backendRunId || initial.body.runAttempt !== input.backendRunAttempt
      || initial.body.targets.web.teamId !== input.web.teamId || initial.body.targets.web.projectId !== input.web.projectId || initial.body.targets.web.target !== input.web.target || officialBefore(artifact.created_at, initial.transfer.exportedAt)) throw fail();
      await readBackendReleaseSourceEvidence(input.repoRoot, initial.expected);
      for (const row of initial.transfer.producers) if (hash(await readBackendWebTransferFile(input.repoRoot, join(input.repoRoot, row.path))) !== row.sha256) throw fail();
      const migrations = readCanonicalMigrationSources({ repoRoot: input.repoRoot, sourceSha: input.releaseSha, treeSha: initial.body.treeSha }).sources
        .map(row => ({ version: row.name.slice(0, 14), sha256: hash(row.bytes) })).sort((a, b) => a.version.localeCompare(b.version));
      const manifestMigrations = z.object({ database: z.object({ migrations: z.array(z.object({ version: z.string(), sha256: digest })) }) }).parse(initial.manifest).database.migrations;
      if (canonicalReleaseExecutionJson([...manifestMigrations].sort((a, b) => a.version.localeCompare(b.version))) !== canonicalReleaseExecutionJson(migrations)) throw fail();
      const [repo, main, ci, environment, branches, protection, signatures, commit, approvals] = await Promise.all([
        get(''), get('git/ref/heads/main'), get('actions/runs/' + input.ciRunId), get('environments/staging'), get('environments/staging/deployment-branch-policies'),
        get('branches/main/protection'), get('branches/main/protection/required_signatures'), get('git/commits/' + input.releaseSha), get('actions/runs/' + input.backendRunId + '/approvals'),
      ]);
      validateCiRun(ci, { sha: input.releaseSha, repository, ciRunId: input.ciRunId });
      validateReleaseControls({ repository: repo, environment, branches, main: protection, signatures }, { repository, environment: 'staging' });
      z.object({ total_count: z.literal(1) }).parse(branches);
      z.object({ id: z.literal(initial.body.environmentId), name: z.literal('staging') }).parse(environment);
      z.object({ object: z.object({ type: z.literal('commit'), sha: z.literal(input.releaseSha) }) }).parse(main);
      z.object({ sha: z.literal(input.releaseSha), tree: z.object({ sha: z.literal(initial.body.treeSha) }), verification: z.object({ verified: z.literal(true), reason: z.literal('valid'), signature: z.string().min(1), payload: z.string().min(1) }) }).parse(commit);
      const admitted = validateCompletedBackendWebApproval(run, approvals, raw, Date.now());
      const finalRun = runSchema.parse(await get('actions/runs/' + input.backendRunId)), finalArtifact = artifactSchema.parse(await get('actions/artifacts/' + input.artifactId));
      if (canonicalReleaseExecutionJson(finalRun) !== canonicalReleaseExecutionJson(run) || canonicalReleaseExecutionJson(finalArtifact) !== canonicalReleaseExecutionJson(artifact)) throw fail();
      validateCiRun(await get('actions/runs/' + input.ciRunId), { sha: input.releaseSha, repository, ciRunId: input.ciRunId });
      z.object({ object: z.object({ sha: z.literal(input.releaseSha) }) }).parse(await get('git/ref/heads/main'));
      await readBackendReleaseSourceEvidence(input.repoRoot, initial.expected); validateBackendWebTransfer(raw, Date.now());
      if (controller.signal.aborted) throw fail();
      return { purpose: 'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION' as const, provenance: 'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE' as const,
        manifest: admitted.manifest, publicConfig: admitted.publicConfig, reviewFacts: admitted.reviewFacts, assignments: admitted.assignments,
        backendIdentity: { repository, sourceSha: input.releaseSha, treeSha: admitted.body.treeSha, baseSha: admitted.body.baseSha, ciRunId: input.ciRunId, runId: input.backendRunId, runAttempt: input.backendRunAttempt, artifactId: input.artifactId,
          artifactSha256: artifact.digest.slice(7), transferSha256: input.transferSha256, manifestSha256: admitted.transfer.manifestSha256, packageSha256: admitted.prepared.sha256, web: admitted.body.targets.web, settingsSha256: admitted.transfer.settings.settingsSha256,
          earliestProofAt: admitted.transfer.earliestProofAt, exportedAt: admitted.transfer.exportedAt, consumptionExpiresAt: admitted.transfer.consumptionExpiresAt },
        observedAt: new Date().toISOString(), privateProofReexecuted: false as const, backendMutationAllowed: false as const, customerReady: false as const, hostedAcceptance: false as const };
    } finally { clearTimeout(timer); controller.abort(); }
  } catch { throw fail(); }
}
