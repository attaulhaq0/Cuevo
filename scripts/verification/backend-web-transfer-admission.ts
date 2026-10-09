import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { readSingleJsonArchive } from './single-json-archive';
import { readBackendReleaseSourceEvidence,readBackendReleaseSourceEvidenceAndGuard } from './backend-release-admission';
import { readCanonicalMigrationSources } from '../database/hosted-migration-plan';
import { validateCiRun, validateReleaseControls } from './cicd-contracts';
import { canonicalReleaseExecutionJson } from './release-review';
import { readBackendWebTransferFile, validateBackendWebTransfer,validateOperatingBackendWebTransfer } from './backend-web-transfer';
import {validateOperatingStagingHandoff} from './operating-staging-handoff';
import {readCanonicalRuntimeJobsAndGuard} from './canonical-runtime-jobs';
import {createGithubCodeqlArtifactReader} from './staging-security';
import {captureCanonicalSourceContext} from './canonical-source-jobs';

const fail = () => Error('Completed backend web handover consumption requires review; contents withheld.');
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// Official Actions timestamps may serialize only whole seconds. This comparison
// admits precision loss in chronology, never extra proof/expiry validity.
const officialBefore = (left: string, right: string) => Math.floor(Date.parse(left) / 1000) < Math.floor(Date.parse(right) / 1000);
const inputSchema = z.object({ handoff:z.enum(['customer-candidate','operating-staging']).default('customer-candidate'),repoRoot: z.string(), githubToken: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/),
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
export function validateSelectedBackendWebTransfer(raw:unknown,now:number,handoff:'customer-candidate'|'operating-staging'='customer-candidate'){return handoff==='operating-staging'?validateOperatingBackendWebTransfer(raw,now):validateBackendWebTransfer(raw,now);}
export function validateCompletedBackendWebApproval(rawRun: unknown, rawApprovals: unknown, transferRaw: unknown, now: number,handoff:'customer-candidate'|'operating-staging'='customer-candidate') {
  try {
    const admitted = validateSelectedBackendWebTransfer(transferRaw, now,handoff), { body, prepared, transfer } = admitted;
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

/** Existing fixed backend JSON contract delegates to the shared bounded archive owner. */
export async function readBackendWebTransferArchive(bytes: Uint8Array, archiveSha256: string, transferSha256: string): Promise<unknown> {
  try { return (await readSingleJsonArchive(bytes, { archiveSha256, jsonSha256: transferSha256, fileName: 'web-transfer.json', maximumJsonBytes: 192 * 1024 })).value; }
  catch { throw fail(); }
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
    const context=captureCanonicalSourceContext(input.repoRoot,input.releaseSha,undefined);
    const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).parse(process.env.GITHUB_REPOSITORY);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000);
    const sourceArtifactReader=createGithubCodeqlArtifactReader(repository,input.githubToken,controller.signal);
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
      const raw = await readBackendWebTransferArchive(archive, artifact.digest.slice(7), input.transferSha256), initial = validateSelectedBackendWebTransfer(raw, now,input.handoff);
      if (initial.body.repository !== repository || initial.body.releaseSha !== input.releaseSha || initial.body.ciRunId !== input.ciRunId || initial.body.releaseRunId !== input.backendRunId || initial.body.runAttempt !== input.backendRunAttempt
      || initial.body.targets.web.teamId !== input.web.teamId || initial.body.targets.web.projectId !== input.web.projectId || initial.body.targets.web.target !== input.web.target || officialBefore(artifact.created_at, initial.transfer.exportedAt)) throw fail();
      await readBackendReleaseSourceEvidence(input.repoRoot, initial.expected);
      for (const row of initial.transfer.producers) if (hash(await readBackendWebTransferFile(input.repoRoot, join(input.repoRoot, row.path))) !== row.sha256) throw fail();
      const migrations = readCanonicalMigrationSources({ repoRoot: input.repoRoot, sourceSha: input.releaseSha, treeSha: initial.body.treeSha }).sources
        .map(row => ({ version: row.name.slice(0, 14), sha256: hash(row.bytes) })).sort((a, b) => a.version.localeCompare(b.version));
      if(input.handoff==='operating-staging'){const operating=validateOperatingStagingHandoff(initial.manifest,Date.parse(initial.transfer.exportedAt));if(operating.database.migrationCount!==migrations.length||operating.database.migrationManifestSha256!==hash(canonicalReleaseExecutionJson(migrations)))throw fail();}else{const manifestMigrations = z.object({ database: z.object({ migrations: z.array(z.object({ version: z.string(), sha256: digest })) }) }).parse(initial.manifest).database.migrations;if (canonicalReleaseExecutionJson([...manifestMigrations].sort((a, b) => a.version.localeCompare(b.version))) !== canonicalReleaseExecutionJson(migrations)) throw fail();}
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
      validateCompletedBackendWebApproval(run, approvals, raw, Date.now(),input.handoff);
      const canonical=await readCanonicalRuntimeJobsAndGuard(ci,get,sourceArtifactReader);if(canonicalReleaseExecutionJson(canonical.proof)!==canonicalReleaseExecutionJson(initial.body.canonicalRuntimeVerification))throw fail();
      const finalSource=await readBackendReleaseSourceEvidenceAndGuard(input.repoRoot, initial.expected); validateSelectedBackendWebTransfer(raw, Date.now(),input.handoff);
      const finalRun = runSchema.parse(await get('actions/runs/' + input.backendRunId)), finalArtifact = artifactSchema.parse(await get('actions/artifacts/' + input.artifactId));
      if (canonicalReleaseExecutionJson(finalRun) !== canonicalReleaseExecutionJson(run) || canonicalReleaseExecutionJson(finalArtifact) !== canonicalReleaseExecutionJson(artifact)) throw fail();
      const [finalRepo,finalMain,finalCi,finalEnvironment,finalBranches,finalProtection,finalSignatures,finalCommit,finalApprovals]=await Promise.all([get(''),get('git/ref/heads/main'),get('actions/runs/'+input.ciRunId),get('environments/staging'),get('environments/staging/deployment-branch-policies'),get('branches/main/protection'),get('branches/main/protection/required_signatures'),get('git/commits/'+input.releaseSha),get('actions/runs/'+input.backendRunId+'/approvals')]);
      validateCiRun(finalCi,{sha:input.releaseSha,repository,ciRunId:input.ciRunId});if(canonicalReleaseExecutionJson(finalCi)!==canonicalReleaseExecutionJson(ci)||canonicalReleaseExecutionJson(finalCommit)!==canonicalReleaseExecutionJson(commit))throw fail();
      validateReleaseControls({repository:finalRepo,environment:finalEnvironment,branches:finalBranches,main:finalProtection,signatures:finalSignatures},{repository,environment:'staging'});z.object({total_count:z.literal(1)}).parse(finalBranches);z.object({id:z.literal(initial.body.environmentId),name:z.literal('staging')}).parse(finalEnvironment);z.object({object:z.object({sha:z.literal(input.releaseSha)})}).parse(finalMain);
      const admitted=validateCompletedBackendWebApproval(finalRun,finalApprovals,raw,Date.now(),input.handoff);
      await canonical.refreshOriginalMetadata();validateCompletedBackendWebApproval(finalRun,await get('actions/runs/'+input.backendRunId+'/approvals'),raw,Date.now(),input.handoff);
      validateSelectedBackendWebTransfer(raw,Date.now(),input.handoff);finalSource.finalPhysical();context.finalMetadata();canonical.assertOriginalValidity();
      if (controller.signal.aborted||Date.now()>=Date.parse(artifact.expires_at)) throw fail();
      return { purpose: input.handoff==='operating-staging'?'OPERATING_BACKEND_WEB_HANDOVER_CONSUMPTION' as const:'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION' as const, provenance: 'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE' as const,
        manifest: admitted.manifest, publicConfig: admitted.publicConfig, reviewFacts: admitted.reviewFacts, assignments: admitted.assignments,
        originalEvidence: admitted.transfer.evidence,
        backendIdentity: { repository, sourceSha: input.releaseSha, treeSha: admitted.body.treeSha, baseSha: admitted.body.baseSha, ciRunId: input.ciRunId, runId: input.backendRunId, runAttempt: input.backendRunAttempt, artifactId: input.artifactId,
          artifactSha256: artifact.digest.slice(7), transferSha256: input.transferSha256, manifestSha256: admitted.transfer.manifestSha256, packageSha256: admitted.prepared.sha256, web: admitted.body.targets.web, settingsSha256: admitted.transfer.settings.settingsSha256,
          earliestProofAt: admitted.transfer.earliestProofAt, exportedAt: admitted.transfer.exportedAt, consumptionExpiresAt: admitted.transfer.consumptionExpiresAt },
        observedAt: new Date().toISOString(), privateProofReexecuted: false as const, backendMutationAllowed: false as const, customerReady: false as const, hostedAcceptance: false as const };
    } finally { clearTimeout(timer); controller.abort(); }
  } catch { throw fail(); }
}
