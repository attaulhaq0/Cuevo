# Pending original worker confirmation implementation plan

> For agentic workers: use subagent-driven development task by task with root review between boundaries. Initial Tasks 1–3 were reviewed and their working-source evidence frozen before this plan began. Route B source work is approved and in progress. No commit, push, CI dispatch, provider or native operation is authorized by this plan.

**Goal:** Let a fresh protected same-source backend package confirm one original CONFIGURED activation, or observe its exact CONFIRMED successor after an unknown COMMIT, while preserving failed original terminal files and original evidence.

**Architecture:** One pure original export contract, one official historical artifact admission owner and the existing pure active-state/native confirmation owners. Current preparation/approval/runner/workflow retain distinct current identities; CONFIGURED never becomes ordinary installed-runtime metadata. Subsequent recovery/restore/API/handover/web work uses a separate fresh ordinary installed-runtime package.

**Tech stack:** TypeScript, supported Node 24.19.0, installed pg 8.23.1 and Zod 4.6.5, node:test, controlled native lifecycle fixtures and the existing bounded single-JSON ZIP reader. No new dependency or migration.

**Spec:** [Fresh pending confirmation admission](../specs/2026-10-08-pending-worker-confirmation-admission.md). The root constraints below narrow its export transport: raw private expected/prepared/runtime/provider values never enter the public export.

## Global constraints

- Preserve exact original source/tree/run/attempt/package/activation/key/runtime/API/Edge/Cron identity, original file hashes, execution/cleanup clocks and successful frozen journal prefix.
- Current source/tree equal original exactly; current run differs from original run, and current package digest differs from original package. Fresh current canonical CI, independent review and official founder approval are mandatory.
- Validate original prepared package at original execution and cleanup clocks and match original official founder approval exactly. A completed failed original run is historical evidence, never current authority.
- Frozen journal ends at exactly one successful `EXECUTION_FINAL`; every preceding required stage must be valid, ordered and consistent. No later confirmation/current FINAL/pause/review bytes enter that prefix.
- Public export JSON maximum 256 KiB; artifact/archive maximum 2 MiB; raw frozen journal-prefix maximum 64 KiB and maximum 64 lines. Fail before parsing unbounded inputs.
- Build public envelope fields explicitly through strict allowlists. Do not spread raw expected, prepared, runtime, provider responses, native state, errors or journal objects into public output. Only the validated credential-free prepared package and reconstructed credential-free historical expected context may be retained.
- The exporter checks private canaries remain absent from every emitted string and byte sequence, including encoded variants; strict schema refusal and allowlisted projection are primary controls, canary assertions are verification.
- Runtime plan is actually `runtimeOnly:true`, fully applied source-locked migrations, `pending:[]`, four empty stage lists and matching source/plan/history/endpoint/toolchain fingerprints. Scope text alone never proves no-op.
- No migrations/account provisioning/provider deploy/new key/source command/wake/dispatch/Cron changes. One fixed Vault CONFIGURED → CONFIRMED CAS or exact CONFIRMED zero-write observation only.
- Existing `readInstalledRuntimeMetadata` and `readActiveRuntimeConfiguration` remain CONFIRMED-only. No generic query ports, caller booleans, callback permits or broad recovery scopes.
- B confirmation scope executes only preparation, current approval, confirmation and safe upload. Original O remains failed where it failed; later consumer C has its own installed-runtime approval and results.
- All generated private files/output remain ignored. No production edits before initial Tasks 1–3 review; root owns final high-level integration and approval checkpoints.

## File ownership and parallel schedule

| Work unit | Owned files | Dependency |
|---|---|---|
| A: pure public export and binding contracts | new `scripts/verification/backend-hosted-activation-export-contracts.ts` and `.test.ts` | Starts after initial Tasks 1–3 review; publishes strict signatures before B |
| B: official artifact/historical approval admission | new `scripts/verification/backend-hosted-activation-export-admission.ts` and `.test.ts` | Can develop controlled readers in parallel with A; consumes A's final contract |
| Root: original export filesystem wrapper | new `backend-hosted-activation-export.ts` and `.test.ts`; original runner/workflow export composition | After A; no overlapping edits with A/B |
| Root: public state/current contracts/no-op preparation | existing state/plan/prepare/contracts/admission files and tests | After A/B reviewed; root may delegate disjoint database files with explicit locks |
| Root: native/runner/workflow integration | existing confirmation owner, runner, discovery, workflow, maps/README/decision | After all lower-level green boundaries |

No agent concurrently edits `backend-release-contracts.ts`, `backend-release-prepare.ts`, `backend-release.ts`, `package.json`, `scripts/verification/steps.ts` or `.github/workflows/backend-release.yml`. Root makes coordinated discovery and integration edits. Each subagent reports exact files and red/green commands; root reviews both security requirements and behavior before integrating.

## Common interfaces to lock before parallel implementation

Task A exports `OriginalWorkerActivationExecutionExport` and `ValidatedOriginalWorkerActivationExecution` as the sole cross-owner types. Use strict schemas with no index signatures for runtime values. The public envelope contains these named fields:

```ts
type OriginalWorkerActivationExecutionExport = {
  version: 1;
  purpose: 'CUEVO_ORIGINAL_WORKER_ACTIVATION_EXECUTION_EXPORT';
  originalPreparedApproval: PreparedBackendReleaseIntent;
  originalExpected: OriginalBackendExpectedPublic;
  originalIdentity: OriginalActiveRuntimeIdentity;
  originalIntent: OriginalActivationIntent;
  originalActivation: OriginalActivationExecution;
  originalCleanup: OriginalActivationExecutionCleanup;
  originalFiles: {
    identitySha256: string;
    intentSha256: string;
    activationSha256: string;
    cleanupSha256: string;
    journalPrefixSha256: string;
  };
  originalJournalPrefix: string;
  originalWakeKeySha256: string;
  originalRuntimeConfigurationSha256: string;
  exportedAt: string;
};
type ValidatedOriginalWorkerActivationExecution = {
  envelope: OriginalWorkerActivationExecutionExport;
  original: OriginalActiveRuntimeIdentity;
  originalExportSha256: string;
  originalIdentityFileSha256: string;
  originalIntentSha256: string;
  originalActivationSha256: string;
  originalCleanupSha256: string;
  originalJournalPrefixSha256: string;
  originalWakeKeySha256: string;
  originalRuntimeConfigurationSha256: string;
  configuredPublicStateSha256: string;
  confirmedPublicStateSha256: string;
  effectAuthority: false;
};
```

`PreparedBackendReleaseIntent` is the existing strict credential-free package type. `OriginalBackendExpectedPublic` reproduces only the existing validated expected schema fields needed to validate that package at historical clocks: repository/source/tree/base/CI/run/attempt/environment/scope/targets/fingerprints/review assignments/currentMainSha/normalized CI run/normalized original backend run and canonical CI proof, plus existing installed-source/schema-recovery fields when required. Construct each field explicitly. It excludes tokens, raw GitHub responses, provider data, native configuration and unknown properties. `OriginalActiveRuntimeIdentity` matches the existing strict active-state identity schema exactly. The three original receipt types are strict exact successful producer schemas, including all known current fields rather than passthrough unknowns.

Task B exports:

```ts
type OriginalWorkerActivationSelection = {
  repository: 'attaulhaq0/Cuevo';
  sourceSha: string;
  originalRunId: string;
  runAttempt: number;
  artifactId: string;
  exportJsonSha256: string;
};
type OriginalWorkerActivationExecutionEvidence =
  ValidatedOriginalWorkerActivationExecution & {
    evidence: 'OFFICIAL_ORIGINAL_WORKER_EXECUTION_METADATA';
    artifactId: string;
    artifactSha256: string;
    exportJsonSha256: string;
    jobsSha256: string;
    artifactExpiresAt: string;
    originalFounderId: 95836629;
    effectAuthority: false;
  };
export function readOriginalWorkerActivationExecutionAdmission(
  value: OriginalWorkerActivationSelection & {githubToken:string},
): Promise<OriginalWorkerActivationExecutionEvidence>;
```

The pure validator signature remains the spec name:

```ts
export function validateOriginalWorkerActivationExecutionExport(
  value: unknown, now: number,
): ValidatedOriginalWorkerActivationExecution;
```

`PendingRuntimeConfirmationBinding` uses the spec's exact fields. Root owns its current-package schema and exports it as a type from `backend-release-contracts.ts` after Task A is reviewed. Do not introduce a second divergent field list.

## Task 1: Pure original execution export contracts — owner A

**Files:** Create `backend-hosted-activation-export-contracts.ts` and `.test.ts` in `scripts/verification`. Read current `hosted-active-runtime-state.ts`, `backend-hosted-activation.ts`, `backend-hosted-recovery.ts`, `backend-release-contracts.ts`, `release-review.ts`, and the Route B spec.

**Produces:** `validateOriginalWorkerActivationExecutionExport`, the strict envelope/validated types above, `createOriginalWorkerActivationExecutionExport` and a public confirmation candidate projection helper. No filesystem/network/native reads.

```ts
export function createOriginalWorkerActivationExecutionExport(value:{
  expected:unknown; preparedApproval:unknown;
  identityBytes:Uint8Array; intentBytes:Uint8Array;
  activationBytes:Uint8Array; cleanupBytes:Uint8Array;
  journalBytes:Uint8Array; wakeKey:string; runtimeConfig:unknown;
  now:number;
}): ValidatedOriginalWorkerActivationExecution;
```

- [ ] Write one exact successful literal fixture with separate execution/cleanup/publication clocks, original canonical prepared package, normalized expected context, exact immutable active identity file and full source-backed current execution result. Record original raw-file hashes independently using literal newline-bearing input bytes.
- [ ] Test missing export function fails before implementation. Then test valid CONFIGURED and confirmed-public projections use identical original identity/activation/job and differ only phase/cleanup; return no private key/configuration.
- [ ] Test original prepared package validates at both activation.observedAt and cleanup.observedAt. Deny original package expired before cleanup, prepared after execution, changed original run/attempt/package/source/tree and mismatched original review/CI fields. Old expiry relative to current `now` alone does not deny valid historical evidence.
- [ ] Parse UTF-8 with fatal decoding and reject BOM, lone surrogate, duplicate/unknown object properties after canonical strict admission, arrays/proxies/getters/nonfinite numbers. Use `canonicalReleaseExecutionJson` and strict schemas; hash raw files separately from canonical receipt values.
- [ ] Require one frozen journal prefix ending at successful `EXECUTION_FINAL`, retaining bytes exactly through its terminating newline. Validate stage allowlist and order: INTENT_RECORDED, PRIVATE_PROBE_INTENT, PRIVATE_PROBES_CONFIRMED, KEY_PREPARED, EDGE_KEY_INTENT, EDGE_KEY_CONFIRMED, DISPATCH_INTENT, DISPATCH_CONFIRMED, SOURCE_COMMAND_INTENT, SOURCE_AND_WAKE_CONFIRMED, SIGNED_SOURCE_VERIFIED, CRON_INTENT, CRON_PENDING_COMMIT, CRON_CONFIRMED, RECOVERY_SOURCE_INTENT, RECOVERY_PENDING_RELEASE, RECOVERY_RELEASE_CONFIRMED, SCHEDULED_RECOVERY_VERIFIED, RECOVERY_RESULT, ACTIVATION_VERIFIED, EXECUTION_FINAL. Each stage has its own exact field schema taken from the current producer. No unknown or duplicated required stage is accepted. Match source/probe/recovery event IDs, original command key, body digest, wake ID, Vault name/key digest, job ID/Cron definition and terminal key/dispatch/session status to receipt evidence.
- [ ] Deny OWNED_DISPATCH_DISABLED, any review terminal, failed cleanup, null result digest, unknown key, unscheduled recovery, contradictory event/job fields, missing newline, malformed line, out-of-order clocks, >64 lines, >64 KiB prefix, >256 KiB envelope. Later confirmation/current records may exist in the input journal only after the successful frozen prefix; exclude them from exported prefix/hash.
- [ ] Build public envelope by explicit field assignments. Strictly validate prepared/expected projections first; never copy raw caller objects. Validate raw-key hash and canonical runtimeConfig hash independently; scan emitted bytes for private canaries and encoded variants in tests. Unknown nested activation/recovery/expected/intent/journal fields must refuse rather than leak.
- [ ] Run RED then GREEN with the supported Node command below. Send root exact signatures, changed files and coverage before B imports them.

Meaningful assertion shape:

```ts
const exportValue=createOriginalWorkerActivationExecutionExport(fixture);
assert.equal(exportValue.envelope.originalFiles.activationSha256,rawActivationHash);
assert.equal(exportValue.originalWakeKeySha256,originalKeyHash);
assert.equal(exportValue.effectAuthority,false);
assert.equal(JSON.stringify(exportValue).includes(privateKey),false);
assert.throws(()=>validateOriginalWorkerActivationExecutionExport({
  ...exportValue.envelope, originalActivation:{...activation,sourceProcessed:false},
},now));
```

## Task 2: Official artifact and historical founder admission — owner B

**Files:** Create `backend-hosted-activation-export-admission.ts` and `.test.ts`. Consume Task 1 types/functions; read `backend-schema-completion-admission.ts`, `single-json-archive.ts`, `staging-security.ts` and current workflow metadata contracts. Do not edit Task A files or generic archive/helper owners.

**Produces:** `readOriginalWorkerActivationExecutionAdmission` above and controlled supplied-evidence readers:

```ts
export function validateOriginalWorkerActivationExecutionApproval(
  rawRun:unknown,rawApprovals:unknown,
  value:unknown,now:number,
): ValidatedOriginalWorkerActivationExecution & {originalFounderId:95836629};
export function readOriginalWorkerActivationExecutionEvidence(
  selection:OriginalWorkerActivationSelection & {now:number},
  github:(path:string)=>Promise<unknown>,
  artifactReader:(artifactId:number)=>Promise<Uint8Array>,
): Promise<OriginalWorkerActivationExecutionEvidence>;
```

- [ ] Write controlled official run/job/approval/artifact/archive fixtures before implementation. An original completed run/job may conclude failure only with successful original approval/export/upload steps and independently successful execution/cleanup evidence. Current official run is not supplied to this historical reader.
- [ ] Require original fixed repository, backend workflow path, `main`, workflow_dispatch, exact run/attempt/source, terminal status and success/failure conclusion; refuse cancelled/timed_out/skipped/unknown/in-progress. Do not mutate raw run status to call current approval validation.
- [ ] Historical approval validator reconstructs original expected current-run context only at its original execution and cleanup clocks, validates original package bytes/digest/comment and exact official staging approval. Require founder ID 95836629/login attaulhaq0/type User, approved state, one exact staging environment ID/name and one matching exact original prepared.comment. No raw approval package string alone establishes official approval.
- [ ] Require official schema job/run/attempt/source and ordered successful steps `Re-admit official founder package before private credentials`, `Export immutable original worker execution evidence`, `Retain original worker activation execution evidence`. Require the activate step completed success/failure and compatible export evidence, unique ordered step names/numbers and artifact created after original cleanup/export and inside original job/run clocks. The overall failed job is not a failed export.
- [ ] Require artifact exact name `cuevo-worker-activation-execution-${runId}-${attempt}`, selected ID, SHA256 digest, 1..2 MiB size, nonexpired state, exact workflow_run source/branch/run and current expiry. Reuse single JSON archive admission with fileName `worker-activation-execution-export.json`, maximumJsonBytes 256*1024 and exact selected JSON digest; no extraction.
- [ ] Test archives with added file/directory, duplicate member, symlink, path traversal, encrypted member, wrong size/hash, oversized inflate, invalid canonical JSON and private canary. Test complete changed artifact/run/job/approval pages on second read are refused.
- [ ] Native official reader uses only fixed GitHub GET paths and bounded artifact download, 15-second request limits and 180-second overall limit. Repeat original run/attempt jobs/approvals/artifact metadata after archive validation. No database/provider/current approval or effect capability is returned.
- [ ] Observe RED, implement minimal owner, observe GREEN. Send root green command and exact admission proof fields; root integrates discovery after A/B contracts agree.

```ts
const evidence=await readOriginalWorkerActivationExecutionEvidence(selection,
  controlledGithub,controlledArtifact);
assert.equal(evidence.originalFounderId,95836629);
assert.equal(evidence.effectAuthority,false);
assert.equal(evidence.envelope.originalActivation.runId,originalRunId);
await assert.rejects(readOriginalWorkerActivationExecutionEvidence(selection,
  changedSecondApprovalReader,controlledArtifact));
```

## Task 3: Original owned-files export wrapper — root

**Files:** Create `backend-hosted-activation-export.ts` and `.test.ts`; after initial Tasks 1–3 finish, add only the credential-free original identity-file retention to `backend-hosted-activation.ts`/test. Later compose export mode in `backend-release.ts` and workflow under Task 7. Do not broaden initial activation execution authority.

**Consumes:** Task 1 creator/validator. **Produces:**

```ts
export function exportOriginalWorkerActivationExecution(value:{
  repoRoot:string;bundlePath:string;bundleSha256:string;
  repository:string;sourceSha:string;runId:string;runAttempt:number;
}):Promise<{status:'ORIGINAL_EXECUTION_EXPORTED';path:string;
  sha256:string;originalRunId:string;originalRunAttempt:number;
  hostedAcceptance:false}>;
```

- [ ] Add failing temporary owned-file tests for exact bundle and current original environment identity, success after final confirmation failed, no export after actual execution/cleanup failure, conflicting export, symlink/hardlink/path escape and after-read file changes.
- [ ] At the original INTENT boundary, construct the exact same identity object used by saveActive once and retain it in create-only `worker-activation-identity.json` before private state commitment. It contains only the strict original state identity, no key/configuration. This is required because existing original intent/execution files do not preserve the exact state identity.createdAt/apiUrl/tree together; export cannot invent that clock or fetch private native state. Add a controlled test proving identity file bytes match actual original state identity exactly and omit private canaries. Legacy attempts lacking this file refuse the new export.
- [ ] Read only original owned bundle, immutable identity file, intent, execution result/cleanup, journal, original private key file and runtime-private file. Enforce exact original run/attempt/source/tree/package and bounded file identity checks before/after read. Read current original files only; never use failed overall terminal result as successful execution or recover original evidence from native CONFIGURED.
- [ ] Construct creator input and write only the credential-free canonical export with create-only mode 0600, sync/close settlement and exact readback. Reuse existing exact bytes only when identical; conflicting or incomplete prior publication returns sanitized review. Keep generated private paths out of public envelope.
- [ ] Controlled tests put raw keys/passwords/tokens/CA/provider JSON inside private inputs and prove output and logs omit them; unexpected raw expected/prepared/runtime/provider fields refuse. Test 256 KiB envelope/64 KiB prefix cutoffs before publication.
- [ ] Run wrapper + Task 1 tests and independent review before workflow composition.

## Task 4: Public pending candidate and real no-op plan — root or isolated database owner

**Files:** Modify `scripts/database/hosted-active-runtime-state.ts`/test and `hosted-migration-plan.ts`/test. Do not weaken existing public/private schemas or CONFIRMED ordinary readers.

**Produces:**

```ts
export function activeRuntimeConfirmationPublicQuery(projectRef:string):string;
export function readPendingRuntimeConfirmationMetadata(
  rows:unknown,originalExport:OriginalWorkerActivationExecutionExport,
  projectRef:string,
):{observedPhase:'CONFIGURED'|'CONFIRMED';observedPublicStateSha256:string;
  configuredPublicStateSha256:string;confirmedPublicStateSha256:string};
export function createCanonicalPendingRuntimeConfirmationPlan(input:{
  repoRoot:string;sourceSha:string;treeSha:string;target:unknown;
  priorReceipt:unknown;now:number;operation:'PENDING_RUNTIME_CONFIRMATION';
}):ReturnType<typeof createCanonicalInstalledRuntimePlan>;
```

- [ ] Test pending query returns no raw wakeKey/runtimeConfig, rejects invalid project and duplicate/missing rows. Exact CONFIGURED+null cleanup or exact CONFIRMED+original cleanup works; every changed identity/key-related projection/activation/job/clock/hash or unknown phase refuses. Ordinary metadata reader still rejects CONFIGURED.
- [ ] Keep pending schema comparison pure. Database owner must not import the new verification I/O wrapper: share the credential-free proof type via type-only import or a narrow pure contract without creating a database→verification-provider→database cycle. Root reviews dependency graph.
- [ ] Test canonical pending plan against actual Git blob migration sources, tree/source pair, historical completed receipt and full installed history. Deny missing/extra migrations, changed applied bytes, wrong order/hash/name/version, different prior source/tree, nonzero pending/stage names, partial schema and fake fingerprints. Assert dispatch/seed/vault executable values disabled and runtimeOnly true.
- [ ] Reuse the existing internal installed no-op builder, with an explicit pending operation entry. Do not infer plan from a caller's runtimeOnly flag or duplicate migration planning logic. Preserve sourceProvenance and exact plan/history/toolchain fingerprints.
- [ ] Run new tests, existing state/resume/migration plan/history tests and architecture checks; review before preparation imports.

## Task 5: Current package contracts and metadata-only preparation — root

**Files:** Modify `backend-release-contracts.ts`/test, `backend-release-prepare.ts`/test, `backend-release-admission.ts`/test. Root owns cross-file package field consistency.

- [ ] Add strict `PendingRuntimeConfirmationBinding` matching the spec, `pending-runtime-confirmation` scope and strict selection in preparation input. Require binding+installedSource only for pending scope; forbid installedRuntime/installedSchema/reconciledPrefix/focused stagingVerification. Require current canonical CI proof and exact original/current source/tree with different run/package.
- [ ] Add failing exported prepare/admission tests for completed failed original plus fresh current package success, expired original approval valid only historically, unapproved current package denial, changed current/original source/tree/attempt/artifact/phase/fingerprint and old package reuse denial.
- [ ] Generalize private installedTarget mode explicitly to inactive, confirmed, pending. Pending uses Task 2 official export and Task 4 projection, complete source/migration/population receipt/history, exact 133 Auth identities, original active dispatch/Cron/transport, current selected endpoint and zero-pending real plan. Recheck artifact/provider/state/history/current source/CI before final package publication.
- [ ] Emit fixed owned current files: `worker-activation-execution-export.json` canonical public export, `pending-activation-selection.json` canonical public selection and existing backend-bundle.json containing only their fixed path/digest descriptors in a strict `pendingActivationEvidence` field. Do not populate raw private state/configuration into package/artifact/summary.
- [ ] Add `PENDING_RUNTIME_CONFIRMATION` effect to current official admission, refusing every other scope/mixture. Existing COMPLETE_BACKEND explicitly refuses pending; SCHEMA_AND_SYNTHETIC_AUTH cannot admit it. Current official founder comment binds complete new package including original evidence digests.
- [ ] If current installed source contains prior schema-recovery completion, consume existing completed proof for inspection without pending migration effect. Root adds narrow read-only pending consumption checks only; no native migration effect permit. No Storage key enters prepare.
- [ ] Run current contracts/prepare/admission + pending artifact/state/plan suites and actual required discovery checks. Review normalized prepared/expected/output field allowlists with private canary tests.

## Task 6: Fresh narrow native confirmation entry — root

**Files:** Modify `backend-hosted-activation-confirmation.ts`/test; retain initial entry compatibility and one internal session/transition implementation. No edits to ordinary configuration reader.

**Produces:**

```ts
export function confirmPendingHostedWorkerActivation(value:{
  repoRoot:string;expected:unknown;preparedApproval:unknown;
  githubToken:string;providerToken:string;vercelToken:string;
  operatorDatabaseUrl:string;operatorPassword:string;certificate:string;
}):Promise<HostedPendingWorkerActivationConfirmationResult>;
```

Result reuses existing commitment/basis/readback/unlock/closure/publication semantics, has purpose `CUEVO_PENDING_ORIGINAL_WORKER_CONFIRMATION`, current source/run/attempt/package, explicit original identity/evidence digests, status `ORIGINAL_ACTIVATION_CONFIRMED | REQUIRES_REVIEW`, canonicalReceipt nullable and hostedAcceptance false. Input cannot supply runtimeConfig/key/replacement identity/callback authority.

- [ ] Write controlled exported-function tests before implementation using actual pg error/end semantics and independent transaction state. Fresh current approved B confirms old O while old expiry remains historical; exact already-CONFIRMED O gives zero writes.
- [ ] Read current owned package evidence after current PENDING admission; repeat official original artifact admission. Open verified selected operator TLS session with error/end ownership, postgres identity, original advisory lease and per-query/external/file liveness guards.
- [ ] Read original private state only in the native owner; validate independent export key/runtime hashes, current same-source recipient schema and public candidate pair. Call existing `validateActiveRuntimeConfirmationCandidate` using admitted original identity/activation/cleanup. State-derived key hashes cannot establish original retention.
- [ ] Validate native actual source/history/private grants/population/transport/analytics, original event school/admin attribution/audit/idempotency, exact key/Cron/dispatch leases and current provider source/artifact/runtime/team/project plus original provider operation digest. Preserve earlier same-source provider run/package.
- [ ] Recheck current approval, original artifact metadata and candidate/control immediately before one fixed Vault CAS. Sync sanitized B+O COMMIT intent to restored original prefix journal before commitment. Unknown COMMIT/readback remains UNKNOWN; no retry/new session in that invocation. CONFIRMED reconciliation never saves.
- [ ] Test lost admission/file/provider/query/TLS/unlock/close, changed source/key/config/Cron/control/artifact, wrong actor/event, journal/write/sync/close publication faults, 256 KiB/2 MiB/64 KiB bounds and private canaries. Assert no provider POST/Auth login/source/wake/configure/unschedule/deploy/migration calls.
- [ ] Publish B's distinct current reconciliation result/cleanup only after acknowledged readback/unlock/close and settled journal/publication. Failed O terminal files and original prefix stay byte-identical; exact existing B canonical bytes alone may be reused.
- [ ] Run initial+pending confirmation/state/resume suites and controlled real initial/confirmation composition. Review unknown commitment and incomplete-success artifacts before runner exposure.

## Task 7: Runner, workflow, safe original transport and discovery — root

**Files:** Modify `backend-release.ts`/test, `backend-workflow.test.ts`, `.github/workflows/backend-release.yml`, `package.json`, `scripts/verification/steps.ts` and `rules.test.ts`. Root integrates shared field/schema changes once.

- [ ] Add `export-activation-execution` original wrapper mode and `confirm-pending-activation` pending native mode. Runtime allowlist pending permits only approval/confirm-pending-activation; all bootstrap/provision/deploy/activate/recovery/restore/bind/handover/web modes refuse before private owner creation. Export mode verifies original complete-backend environment/bundle at historical clocks without demanding completed original run live approval again.
- [ ] Runner validates fixed current bundle/root/env/digests and explicit pending scope before obtaining credentials. Confirmation input uses current selected endpoint/operator password/CA, provider/GitHub/Vercel only; no synthetic password, journal-Storage key, runtimeConfig or private key from caller.
- [ ] Workflow scope options add pending-runtime-confirmation. After original complete-backend activate, add always-gated `Export immutable original worker execution evidence` with only current bundle vars/GitHub environment metadata and no private env. Its creator-only successful execution/cleanup guard refuses partial actual execution. Then fixed upload `Retain original worker activation execution evidence` uploads exactly worker-activation-execution-export.json under original run/attempt artifact name with 14-day retention.
- [ ] Current prepare artifact includes only fixed current package+public original evidence paths and inert build artifacts. Protected staging approval precedes pending confirmation credentials. Pending step condition exactly pending scope; only safe result upload follows. Existing other scope conditions stay exact.
- [ ] Add real runner tests: fresh approved B branch invokes one native confirmation, reviews propagate, old O failed bytes untouched, all other scopes/effects deny, missing evidence/artifact/current approval refuses, private export leakage refuses. Workflow tests inspect parsed steps/credentials and frozen artifact paths, not incidental text.
- [ ] Synchronize new verification tests in `test:cicd`, required cicd-fixtures and stateless list exactly once; database tests remain existing hosted-plan/replay owners. Extend rules.test.ts discovery assertions. No new workflow dispatch/CI run occurs here.
- [ ] Verify full initial Tasks1–3 regression and pending exported suites, lint/typecheck, check:cicd and structural guards. Root independently inspects actual diff and no-effect tests before acceptance.

## Task 8: Current documentation and O→B→C handoff — root

**Files:** Update `scripts/verification/README.md`, `scripts/database/README.md`, `docs/codebase-map.md`, and add `docs/decisions/2026-10-08-pending-worker-confirmation-admission.md`. Preserve spec numbered sources/registry unchanged; these are implementation documents.

- [ ] Document original export filename/artifact bounds, successful EXECUTION_FINAL frozen prefix, no private field transport, official historical approval versus current founder approval, pending scope/no-op plan and required fresh current identities.
- [ ] Record O original failed invocation, B confirmation-only current package and C ordinary fresh installed-runtime package. C uses unchanged native CONFIRMED metadata/config readers and existing resume/verify/private/fault/restore/API/handover/web phases; B never silently switches approved package scope.
- [ ] Document missing original export/cleanup/key evidence as review. Already failed legacy attempts cannot be fabricated from CONFIGURED state. Broader old-to-new-source bridge or same-B-run consumer continuation requires separate root approval.
- [ ] Run docs/architecture/repository checks+fixtures after final docs and source integration. Record supported Node command, exact red/green outcomes and all remaining hosted/provider/CI/customer gates, with no completion claim based only on controlled source tests.

## Verification commands and review gates

Local PowerShell commands use the supported runtime and original approved temporary root:

```powershell
$env:TEMP='F:/cuevo-native-admission-temp'
$env:TMP='F:/cuevo-native-admission-temp'
$cuevoNode='C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $cuevoNode --version
& $cuevoNode --import tsx --test scripts/verification/backend-hosted-activation-export-contracts.test.ts
& $cuevoNode --import tsx --test scripts/verification/backend-hosted-activation-export-admission.test.ts
& $cuevoNode --import tsx --test scripts/verification/backend-hosted-activation-export.test.ts
& $cuevoNode --import tsx --test scripts/database/hosted-active-runtime-state.test.ts scripts/database/hosted-migration-plan.test.ts scripts/database/hosted-migration-history.test.ts
& $cuevoNode --import tsx --test scripts/verification/backend-hosted-activation.test.ts scripts/verification/backend-hosted-activation-confirmation.test.ts scripts/verification/backend-runtime-resume.test.ts
& $cuevoNode --import tsx --test scripts/verification/backend-release-contracts.test.ts scripts/verification/backend-release-prepare.test.ts scripts/verification/backend-release-admission.test.ts scripts/verification/backend-release.test.ts scripts/verification/backend-workflow.test.ts scripts/verification/rules.test.ts
& $cuevoNode node_modules/eslint/bin/eslint.js scripts/database/hosted-active-runtime-state.ts scripts/database/hosted-migration-plan.ts scripts/verification/backend-hosted-activation-export-contracts.ts scripts/verification/backend-hosted-activation-export-admission.ts scripts/verification/backend-hosted-activation-export.ts scripts/verification/backend-hosted-activation-confirmation.ts scripts/verification/backend-release-contracts.ts scripts/verification/backend-release-prepare.ts scripts/verification/backend-release-admission.ts scripts/verification/backend-release.ts
& $cuevoNode --import tsx scripts/verification/typecheck-workspaces.ts
& $cuevoNode --import tsx scripts/verification/cicd-check.ts
& $cuevoNode --import tsx scripts/architecture/check.ts
& $cuevoNode --import tsx --test scripts/architecture/rules.test.ts scripts/architecture/synthetic-runtime.test.ts
& $cuevoNode --import tsx scripts/docs/check.ts
& $cuevoNode --import tsx --test scripts/docs/rules.test.ts scripts/docs/governance.test.ts
& $cuevoNode --import tsx scripts/repository/check.ts
& $cuevoNode --import tsx --test scripts/repository/rules.test.ts
git diff --check
```

Every task first observes the intended test failure, then implements the minimal contract and observes pass. Verification is scoped to authored changes and repeated only for new code or unresolved failures. Root reviews A/B independent security contracts, then original export/native/current admission and final complete diff. No deploy/CI/provider invocation, commit, push or acceptance claim follows automatically from this plan.
