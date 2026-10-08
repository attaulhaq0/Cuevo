# Fresh approval for pending original worker confirmation

Status: Route B source design approved by root on 8 October 2026; implementation and controlled verification are in progress. No hosted/provider execution or release acceptance is recorded. The rejected same-live-original manual route is replaced by this fresh same-source package.

## Purpose and governing boundary

Permit a later protected backend run to finish one original activation whose signed execution and original operator/Auth cleanup succeeded, but whose final confirmation failed or had an unknown COMMIT. The original workflow may be completed and failed, and its approval may have expired. Only a fresh current package and official founder approval authorize the later confirmation.

Current source SHA and tree must equal the original activation source SHA and tree exactly. Ancestor status, matching application output, matching migration files or another package's approval cannot replace that equality. A changed source needs a separately reviewed original-to-current bridge; this route refuses it.

Governing sources remain product 02/40/61/67/81/82, the accepted event-processing architecture and 2 October worker decision, and the [single active-state ownership decision](../../decisions/2026-10-08-active-runtime-state-ownership.md). Keep the existing private state engine, worker processor, domain authority and installed-runtime readers. The permitted native change is one exact CONFIGURED → CONFIRMED transition, or read-only observation of the exact CONFIRMED successor after an earlier unknown COMMIT. No migration, account provisioning, provider deployment, replacement key, source command, wake, dispatch change or Cron change is admitted.

## Distinct current and original identities

Add the execution scope `pending-runtime-confirmation` to the existing backend package and workflow. Add `pendingRuntimeConfirmation` as a distinct optional field in `BackendReleaseIntent` and `BackendReleaseExpected`; it is required only for this scope. Do not populate `installedRuntime` from CONFIGURED metadata or widen `readInstalledRuntimeMetadata` or `readActiveRuntimeConfiguration`.

The current identity is the new package's repository, releaseSha/treeSha/baseSha, canonical CI run and mandatory-job proof, releaseRunId/runAttempt, staging environment ID, source/diff fingerprints, prepared/expires clocks, independent reviews and package digest. Its current release run must differ from the original activation run; its package digest must differ from the original package. These are later approval facts, never rewritten original facts.

The original identity remains source/tree, originalRunId/attempt/package, activationId, runtimeSha256, API deployment ID/URL, Edge ID/version, endpoint, Vault secret name, jobId and original creation/execution/cleanup clocks. The fresh confirmation result carries current identity in top-level source/run/attempt/package fields and an explicit `original` object containing the original identity and evidence digests. Neither result nor journal reattributes original execution to the current run.

The strict approval projection is:

```ts
type PendingRuntimeConfirmationBinding = {
  version: 1;
  purpose: 'CUEVO_PENDING_ORIGINAL_WORKER_CONFIRMATION';
  original: {
    sourceSha: string;
    treeSha: string;
    runId: string;
    runAttempt: number;
    packageSha256: string;
    activationId: string;
    runtimeSha256: string;
    apiDeploymentId: string;
    apiUrl: string;
    edgeId: string;
    edgeVersion: number;
    endpoint: string;
    vaultSecretName: string;
    jobId: number;
    createdAt: string;
  };
  originalExportSha256: string;
  originalIntentSha256: string;
  originalActivationSha256: string;
  originalCleanupSha256: string;
  originalJournalPrefixSha256: string;
  originalWakeKeySha256: string;
  originalRuntimeConfigurationSha256: string;
  configuredPublicStateSha256: string;
  confirmedPublicStateSha256: string;
  observedPhase: 'CONFIGURED' | 'CONFIRMED';
  observedPublicStateSha256: string;
  originalArtifact: {
    runId: string;
    runAttempt: number;
    artifactId: string;
    archiveSha256: string;
    jsonSha256: string;
    jobsSha256: string;
    expiresAt: string;
  };
};
```

All IDs, hashes, URLs and clocks receive the existing bounded strict schema rules. `originalArtifact` is official transport provenance. It creates no effect authority. The configured/confirmed public hashes include the entire strict public active state and original activation/cleanup, with wakeKey/runtimeConfig absent. A transition between those two exact states is the sole permitted preparation-to-execution state change. Unknown fields, replacement identities and opaque caller `verified`/`allowed` fields are refused.

## Original evidence transport is an explicit prerequisite

Fresh Actions runners do not retain the original runner's ignored files. The current generic `cuevo-backend-schema-result-*` artifact omits `worker-activation-execution-result.json` and `worker-activation-execution-cleanup.json`; it cannot currently deliver the required original evidence. `worker-activation-private.json` and runtime configuration must never be uploaded to fill that gap.

Add an original-producer export within `scripts/verification`, owner `backend-hosted-activation-export.ts`. Its read-only `exportOriginalWorkerActivationExecution(value)` accepts the original owned root, bundle path/digest and original run environment. It reads only original owned intent, execution result, execution cleanup, frozen journal prefix, private original key file and private runtime configuration. It validates the original package at the original execution/cleanup clock; the current original run environment still must match that bundle. It computes hashes of private material locally and emits an allowlisted credential-free single JSON file `worker-activation-execution-export.json`. No private file path, raw key/configuration, token, password, certificate, console output or error text enters this export.

The export envelope has purpose `CUEVO_ORIGINAL_WORKER_ACTIVATION_EXECUTION_EXPORT`, version 1, original prepared package and original expected snapshot, exact original intent/execution result/execution cleanup, immutable original journal-prefix bytes and digest, original raw signing-key digest, canonical runtime-configuration digest and explicit original active-state identity. Bound its JSON to 256 KiB and its archive to 2 MiB. Use strict producer schemas rather than unrestricted copies of passthrough objects. Preserve canonical JSON and original newline-bearing file hashes separately where file identity matters. The journal prefix must include exactly the original INTENT/key-prepared/execution-final stages needed to bind activation identity, original command key and signing-key digest. Its captured endpoint never advances when later confirmation stages append.

The original protected job gains an `always()` export step after `activate` that has no provider/database credentials and succeeds only when the immutable successful execution result and successful original execution cleanup exist. A failed final confirmation can therefore retain this export. An actual signed execution failure, missing/failed cleanup, partial file, conflicting file or unknown original key cannot produce it. Then upload exactly this single export as `cuevo-worker-activation-execution-${originalRunId}-${originalRunAttempt}` using the pinned artifact action, fixed retention and no wildcard path. The producer step and upload step must be official completed success even if the parent activate step/job/run concludes failure. Export transport success never relabels that failed activation invocation successful.

Older failed attempts lacking this export remain REQUIRES_REVIEW. A current operator cannot fabricate the export from CONFIGURED state or reconstruct lost original cleanup/key evidence. A native-only bootstrap of missing historical transport would require a separate reviewed proof route. This proposal does not grant one.

## Official original-artifact admission

Add `backend-hosted-activation-export-admission.ts`, following the bounded original-proof pattern in `backend-schema-completion-admission.ts`, without adopting its whole-run-success condition. Proposed APIs:

```ts
readOriginalWorkerActivationExecutionAdmission({
  repository, sourceSha, originalRunId, runAttempt,
  artifactId, exportJsonSha256, githubToken,
}): Promise<OriginalWorkerActivationExecutionEvidence>;

validateOriginalWorkerActivationExecutionExport(value, now):
  OriginalWorkerActivationExecutionEvidence;
```

The native official reader accepts only the fixed repository, exact source/branch/workflow/run/attempt, terminal original run, official artifact name/ID/archive digest, bounded archive size, current nonexpired artifact and one exact export JSON member. Reuse `createGithubCodeqlArtifactReader` and `readSingleJsonArchive`; refuse extra archive members, duplicate names, links, path traversal and changed size/hash. Original run conclusion may be success or failure; cancelled, timed-out, skipped, in-progress or unknown original runs are refused in this bounded route.

Read the original run/attempt jobs and approvals. Require one original protected schema job, exact original run/source/attempt, completed successful original official-approval step, and completed successful export/upload steps in order. `activate` may conclude failure only when the export independently proves its successful execution/cleanup boundary. Validate the retained original prepared package at its historical cleanup clock and require that clock within its original approval lifetime. Match official original founder ID, staging environment and exact original package comment; do not call the current-only `validateOfficialFounderApproval` with a completed failed run or rewrite its status. Implement a dedicated historical metadata validator modeled on `validateCompletedSchemaRecoveryApproval` with explicit terminal-failure allowance and no current effect authority.

Original run creation/preparation/execution/cleanup/export/artifact/job-completion clocks must be ordered and no later than now. Repeat official run, approvals, job page and artifact metadata after download and before consumption. Any changed observation, missing exact producer step, expired artifact, missing export or ambiguous attempt is review. The returned evidence is metadata only; injected readers in unit tests never create a native permit.

## Preparation and no-op runtime plan

Extend `backend-release-prepare.ts` input with a strict `pendingActivationSelection` containing repository/source/original run/attempt/artifact ID/export JSON digest. It is required for `pending-runtime-confirmation` and refused for other scopes. The fresh workflow dispatch inputs retain exact current commit and canonical CI run; selection arrives through the existing validated backend input JSON.

Preparation retains its existing metadata-only credential recipients: GitHub release metadata token and Supabase management token. It receives no native operator password, CA, private runtime/key, Storage key or Vercel token. It downloads and validates the original public export and reads a separate fixed pending-state public query from `hosted-active-runtime-state.ts`. Proposed exports `activeRuntimeConfirmationPublicQuery(projectRef)` and `readPendingRuntimeConfirmationMetadata(rows, originalExport, projectRef)` omit wakeKey/runtimeConfig before returning any management response; no private decrypted fields are selected for this route. The reader validates CONFIGURED or its exact expected CONFIRMED public successor using the export's original identity, activation and cleanup. It returns candidate metadata only, never installed-runtime metadata.

Generalize the private `installedTarget` preparation helper from an active-runtime boolean to an explicit mode `INACTIVE_INSTALL | CONFIRMED_RUNTIME | PENDING_CONFIRMATION`. The pending mode requires complete installed migration and synthetic population receipts, exact 133 Auth population, source/tree equality to the original export, current private runtime roles/transport, exact original active dispatch endpoint/secret/allow-local and exact active original Cron. It must not apply the inactive-dispatch or inactive-Cron admission used by ordinary complete-backend preparation. Ordinary confirmed mode continues calling the unchanged `readInstalledRuntimeMetadata`.

Reuse `createCanonicalInstalledRuntimePlan` through a bounded accepted operation discriminator `INSTALLED_RUNTIME_READ_ONLY | PENDING_RUNTIME_CONFIRMATION`, or expose `createCanonicalPendingRuntimeConfirmationPlan` calling the same internal no-op-plan builder. In either case output the existing `HostedMigrationPlanV1` with `runtimeOnly:true`, `pending:[]`, four empty stage name lists, fully applied matching source-locked migrations and prior completed source receipt. No schema reconciliation template or unresolved migration review is permitted. Plan dispatch/seed/vault values `DISABLED` describe executable effects; target observation remains active synthetic dispatch. A zero-pending plan is independently validated, never inferred merely from scope.

Build current API/Edge artifacts through the existing preparation owner to bind exact source and toolchain fingerprints. They remain inert artifacts and cannot be deployed by this scope. Preserve existing migration-history/source/private inventory evidence requirements. If a required schema-recovery completion exists, consume its existing completed proof only as read evidence; add the pending scope to that specific read admission without admitting stage execution. Re-read original artifact metadata, pending public state, dispatch/Cron/population/history and current official source/CI before final package publication. Bind both candidate public-state hashes and the actual observed phase/hash in `pendingRuntimeConfirmation`.

In `backend-release-contracts.ts`, add the new strict binding and scope to intent/expected schemas and equality checks. Require installedSource plus pendingRuntimeConfirmation, forbid installedSchema/installedRuntime/reconciledPrefix and focused stagingVerification, require current canonical CI mandatory jobs proof and exact original/current source/tree equality. Refuse the binding in every other scope. Existing current staging founder comment/package digest behavior stays unchanged; it now includes the pending binding in the exact package bytes presented for approval.

## Fresh official approval and protected workflow

Extend `readBackendReleaseAdmission` with effect scope `PENDING_RUNTIME_CONFIRMATION`. It accepts only the new execution scope, strict pending binding, canonical CI proof and existing exact current main/Git/official founder controls. `COMPLETE_BACKEND` explicitly refuses pending scope; `SCHEMA_AND_SYNTHETIC_AUTH` cannot admit it. The new effect discriminator expresses purpose and adds no callable migration/provider capability.

Add the dispatch scope option and an explicitly gated protected step in `backend-release.yml`. The existing preparation job uploads only its own credential-free current package and the validated original export under fixed paths. The protected staging job first executes ordinary metadata-only `approval` for the exact new package. Only afterward does its `confirm-pending-activation` step receive GH_TOKEN, SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, CUEVO_MIGRATION_DATABASE_PASSWORD and CUEVO_DATABASE_TLS_CA. It receives no synthetic password, journal-Storage key, provisioning credentials or preview bypass capability.

All current mutation/release-consumer steps retain their explicit old scope conditions. Pending scope can run only preparation, current approval, the confirmation step and safe result upload. It cannot run bootstrap/provision/deploy/activate/verify-private/recovery/restore/bind/handover/configure/export-web. The step does not acquire a CLI or restore image. Workflow contract tests must deny private credential attachment to preparation/approval and deny any other protected phase for this scope.

## Narrow native current-to-original confirmation

Keep one native session/transition implementation under `backend-hosted-activation-confirmation.ts`. Retain `confirmHostedWorkerActivation` for the initial original activation. Add a distinct fresh-scope entry `confirmPendingHostedWorkerActivation(value)` which validates current pending purpose and official admission before reading private state. Both use one internal fixed native confirmation protocol; neither exports arbitrary query/callback/write ports to callers.

The fresh input contains current repoRoot/expected/preparedApproval, GitHub/provider/Vercel metadata tokens and original-bound operator URL/password/CA. It does not accept runtimeConfig, signing key, original identity, caller receipt booleans or replacement state. The prepared bundle carries the validated public export/selection by fixed path and digest. Re-admit its official original artifact after current approval. Under the selected endpoint, verified operator TLS and original project advisory lease, read one bounded private active state from the existing Vault name. Recover its private runtime configuration only inside this owner. Its canonical digest must equal the original export and approval binding; `prepareHostedRuntimeRecipients` validates original source/runtime/targets against current same-source targets. The raw key digest must equal independent original export/journal evidence, not a hash derived from the candidate itself. This avoids weakening the ordinary CONFIRMED-only private configuration reader.

Pass independently admitted original identity/key/configuration/activation/cleanup to `validateActiveRuntimeConfirmationCandidate`. Match either exact prepared CONFIGURED hash or exact original CONFIRMED successor; refuse every other phase/hash. Validate current native source/history/population/private grants/transport/analytics, original source event attribution/audit/idempotency/completion, signing Vault key, active dispatch/Cron and fixed current GET provider metadata/settings/secrets. Preserve provider producer run/package identity, which may precede activation within existing same-source reuse; compare source/tree/artifacts/runtime/team/project using existing provider current-facts rules and verify its original operation digest.

Immediately before the save repeat current approval/source, original export metadata and exact native candidate/control. The sole write is the existing `vault.update_secret` for CONFIGURED → CONFIRMED under fixed-name CAS and explicit original-state comparison, with original cleanup added unchanged. Record a current confirmation/COMMIT intent in the restored original journal before commitment. An acknowledgement/readback failure remains UNKNOWN; rollback is not evidence that COMMIT failed. No automatic second connection/save/retry occurs in that invocation. Exact CONFIRMED observation makes zero saves.

After exact readback, final source/approval, acknowledged unlock, native close and journal settlement, retain a separate current `worker-activation-reconciliation-result.json` and cleanup receipt with current result digest. Append new journal entries after the immutable transported original prefix, including explicit current and original identities. Do not rewrite failed original `worker-activation-result.json`, execution files, clocks, source command pointers or original prefix. Publication conflicts are review; exact existing bytes alone may be reused. Preserve commitment, unlock and close as independent observations. Any failure leaves healthy worker/key/dispatch/Cron untouched.

Current reconciliation is not original activation success or full-backend handover evidence. Ordinary installed-runtime preparation may later consume only genuinely CONFIRMED native metadata through its existing separate current package/approval and revalidation gates. This route grants no consumer shortcut and no hosted/MVP acceptance.

## Concrete downstream release continuation

Use three identities: original activation O, fresh confirmation run B and later ordinary installed-runtime verification run C. B has the strictly confirmation-only scope above. C is a fresh same-source `installed-runtime` dispatch with its own canonical CI admission, protected staging approval and current package. This is the minimal route that preserves current consumer authority. B's package cannot be edited after approval to set `executionScope:'installed-runtime'` or to add installedRuntime; both edits change the approved package digest. B's confirmation result is not an installed-runtime permit.

After B settles genuine CONFIRMED state, C's existing `prepareNativeBackendRelease` uses `activeRuntimePublicQuery` and unchanged `readInstalledRuntimeMetadata` to read O's original activation identity and successful execution/cleanup from Vault. C produces its own zero-pending `runtimeOnly` plan and installedRuntime binding, independently of O's failed terminal files and B's reconciliation result. Missing/changed CONFIRMED state still blocks C. The current initial Task 3 layout stores the original immutable execution result/cleanup in Vault, so those native records retain the genuine successful execution boundary even when O's overall final invocation failed.

In C, existing `resume-runtime` calls unchanged `readActiveRuntimeConfiguration` under native current admission, returns private original configuration only to the protected job, and calls `revalidateActiveRuntime`. It writes C's `runtime-private.json`, CA, `runtime-resume-result.json` and `provider-result.json` with `DEPLOYED_ACTIVE_REVALIDATED`, retaining O's original activation separately. It creates only C's existing protected-preview capability for exact original deployment transport. No O terminal file is copied over C's consumer filenames as a fabricated success.

Then C runs the existing explicit order `verify → verify-private → verify-recovery → verify-restore → bind-api → handover → configure-web → export-web-handover`. The verified owner of each phase admits C's current package and records its new result under C's run/attempt/package. The fault owner already calls `revalidateActiveRuntime` when installedRuntime exists and reads O's activation/cleanup from that native result at `backend-hosted-fault-recovery-native.ts`; it uses a fresh C fault-probe command identity, not O's activation command. The restore owner verifies C's owned drill under its existing credentials, isolation and cleanup. The API origin owner already uses O's activation identity from native revalidation while requiring fault/restore proofs belonging to C. `backend-web-handover.ts` similarly obtains fresh current native runtime proof and substitutes native O activation/cleanup only for its explicitly historical activation fields; remaining prerequisite/private/fault/restore/provider/source gates belong to C. Its `originalActivation` binding keeps O's original run/attempt/package/digest alongside the current C handover identity.

Web settings and `export-web-handover` remain the existing C protected owners after complete current C gates. The later web release consumes C's official successful completed public handover artifact through the existing exact backend-to-web bridge. Neither B nor failed O can masquerade as that completed producer. Failed O files and B reconciliation evidence remain retained historical artifacts; C's successful current proof is a distinct denominator.

If the product requires B's own fresh run to execute those existing fault/restore/API/handover/web phases after confirmation, root must approve a broader current package scope whose exact prepared intent explicitly includes that continuation capability. It would need a current-to-confirmed installedRuntime projection derived under the B package without changing package bytes, plus reviewed consumer/runner admission and credentials for every added phase. That is not the `pending-runtime-confirmation` scope implemented here; silently switching B's scope or accepting its receipt as installedRuntime would bypass current approval. The bounded B→C sequence requires no such new release capability.

## Required tests and remaining review gates

Use supported Node 24 controlled exported-function tests with real Client error/end semantics and independent pending/SAVE/COMMIT/readback state. Prove expired/completed failed original approval plus fresh current approval works; unchanged original files remain failed; current identities differ while original identities/clocks/hashes remain exact. Deny changed source/tree/project/artifact/run/attempt/package, unapproved current run, reused old approval, missing or forged original export, expired/missing artifact, wrong producer steps, malformed clocks/journal, public secret leakage, nonzero pending migrations and unsupported scopes.

Test preparation metadata projection and artifact ZIP boundaries, current package exact binding, pending/no-op-plan refusal in migration/provider/account consumers, protected workflow credential routing, and runner allowlist. Test CONFIGURED transition, exact CONFIRMED reconciliation after unknown COMMIT with zero writes, changed original key together with changed live keys, same-source earlier provider package, live control leases, original actor/school attribution, all awaited-boundary liveness, late journal/result cleanup failures and canonical digest consistency. Confirm ordinary installed metadata/config readers still refuse CONFIGURED.

Implementation requires root approval of this Route B, owner/map/decision documentation, synchronized required test discovery, lint/typecheck and architecture/docs/repository checks. Actual provider/native execution, artifact retention acceptance, final CI, hosted recovery/restore/handover and customer acceptance remain separate. Missing original transport is a stated blocker, never guessed native evidence.
