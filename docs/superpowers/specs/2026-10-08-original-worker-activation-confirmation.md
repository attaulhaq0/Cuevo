# Original worker activation final confirmation

Status: root approved Tasks 1–3 for the initial route on 8 October 2026; source implementation and controlled verification are in progress. Fresh pending confirmation source is implemented under its separately reviewed package contract. No provider operation or acceptance is recorded by this design.

## Purpose and authority

Finish the existing initial worker activation truthfully after its signed source, duplicate-wake denial and scheduled-recovery proof. Preserve the same activation ID, original command key, signing key, runtime configuration, source/tree, release run/attempt/package, API deployment, Edge ID/version, Vault secret and Cron job. A confirmation failure neither authorizes a replacement activation nor pauses healthy active dispatch.

The source baseline is `d094bdd15e38567f286ab28b7ffdd829aa5b80f5`, tree `a74b3eb55f5fe38aaca1eea649dfed57abfb14b0`. Governing product sources are 02, 40, 61, 67, 81 and 82; the accepted event-processing architecture and 2 October worker decision retain one private processor/outbox. The 8 October active-runtime-state ownership decision retains one pure state owner. This repair changes operator verification only; no migrations, feature behavior, provider deployment, CI execution or release acceptance is included.

## Observed defect

The supported Node 24.19.0 reproduction is retained in the native-admission-cohort checkout under `.local/provider-next-phase-activation-confirmation-node24-20261008`, evidence SHA256 `813f3a77775e704b7d373fb0e97a19476ef01fbcf89dd2f38392831c4f04bcdb`. It executes the exact final confirmation body with controlled ports and the installed pg 8.23.1 idle-error handler without any connection or provider request.

`backend-hosted-activation.ts` currently writes successful result, CONFIGURED state and successful original cleanup before opening a second Client. That Client has no error/end listeners. Idle loss during awaited official admission can reach an uncaught error; a later refused query returns review while earlier files retain success. Final unlock/end failure can also retain a non-null canonical success receipt. A remotely committed CONFIRMED state with an unavailable acknowledgement/readback cannot be inferred from rollback.

## Chosen boundary

Use one narrowly scoped native confirmation owner, `scripts/verification/backend-hosted-activation-confirmation.ts`, called by the original initial route. It receives only the current original approved bundle context, provider metadata credentials, original runtime configuration and operator TLS connection inputs. No caller supplies a callback, receipt-verification boolean, token, replacement state, key or operation identity. The separately reviewed pending-runtime-confirmation package now supplies the fresh same-source manual route.

The exported interface is:

```ts
type HostedWorkerActivationConfirmationInput = {
  repoRoot: string;
  expected: unknown;
  preparedApproval: unknown;
  githubToken: string;
  providerToken: string;
  vercelToken: string;
  runtimeConfig: unknown;
  operatorDatabaseUrl: string;
  operatorPassword: string;
};

type HostedWorkerActivationConfirmationResult = {
  purpose: 'CUEVO_ORIGINAL_WORKER_ACTIVATION_CONFIRMATION';
  status: 'ORIGINAL_ACTIVATION_CONFIRMED' | 'REQUIRES_REVIEW';
  basis: 'CONFIGURED_TRANSITION' | 'EXACT_CONFIRMED_READBACK' | null;
  sourceSha: string | null;
  projectRef: string | null;
  runId: string | null;
  runAttempt: number | null;
  packageSha256: string | null;
  activationId: string | null;
  originalActivationSha256: string | null;
  originalCleanupSha256: string | null;
  stateReadbackSha256: string | null;
  commitment: 'NONE' | 'UNKNOWN' | 'CONFIRMED';
  lockReleased: boolean;
  sessionClosed: boolean;
  observedAt: string;
  canonicalReceipt: string | null;
  hostedAcceptance: false;
};
export function confirmHostedWorkerActivation(
  value: unknown,
): Promise<HostedWorkerActivationConfirmationResult>;
```

The initial owner accepts only the same original complete-backend bundle, current unchanged source/main, still-live original release run and unexpired original official approval. Existing admission remains unchanged. `installed-runtime`, schema/account, reconcile-schema and changed source/run/attempt/package are refused. This initial bound alone cannot resume a failed completed workflow: a fresh same-source pending confirmation package must bind the preserved original evidence, current protected CI and fresh official approval. The rejected same-live-only manual route is not implemented or claimed as recoverability. Cross-source reuse remains refused.

## Immutable execution evidence and current results

The original route writes `worker-activation-execution-result.json` at its existing execution-evidence boundary and `worker-activation-execution-cleanup.json` after its original operator unlock/end and Auth logout settle. These files retain original clocks and canonical hash binding. CONFIGURED stores the original execution result; CONFIRMED adds exactly the matched original execution cleanup. Their identity/key/configuration and original activation bytes never change during confirmation.

The existing `worker-activation-result.json` and `worker-activation-cleanup.json` become the initial route's current terminal files. They are written only after the final confirmation session has completed. Success requires exact durable CONFIRMED readback, acknowledged advisory unlock, successful native close and final source/approval admission. Failure records REQUIRES_REVIEW and clears canonicalReceipt. Final result/cleanup share a canonical result digest and current terminal clock; phase remains FINAL for existing handover contracts. Cleanup combines both native sessions with Auth closure while retaining original execution cleanup separately. Earlier execution evidence is clearly named and cannot satisfy those existing consumer file paths. File write/fsync/close uncertainty can still leave partial matching bytes; direct consumers therefore require current official successful activation-step provenance and observation-only native CONFIRMED revalidation beside those files. A later marker file would share the same uncertainty and is not introduced.

After initial confirmation failure, failed original terminal files remain failed and immutable. The separate [pending-package design](2026-10-08-pending-worker-confirmation-admission.md) must produce a distinct confirmation receipt bound to current admission and original hashes; it may confirm exact CONFIGURED or reconcile exact CONFIRMED after uncertain COMMIT. It never rewrites an earlier failed activation or claims that original invocation completed. Ordinary installed-runtime consumers retain their genuine CONFIRMED requirement. The fresh package explicitly defines how current recovery/restore/handover consumers proceed; that route is implemented and source verification is in progress; actual hosted execution remains unaccepted.

All confirmation stages and failed outcomes append to the existing original activation journal. No second task ledger, replacement operation key or generic retry engine is introduced. Receipt file conflicts, unsafe paths, partial publication and journal failure remain review. Reconciliation success publication may reuse only exact already-present canonical bytes; conflicting retained evidence is refused.

## Native confirmation protocol

1. Parse strict inputs, validate the original prepared package at the current clock, read current official admission and selected provider endpoint, and validate owned root/receipt paths. Read exact original intent, execution result and execution cleanup. Require their original activation/run/package/runtime/API/Edge/source/key naming, clocks, released lease, closed Auth sessions and canonical digest to match.
2. Attach error and end listeners before connect. The session owns a lost flag and explicit ending state. Every query and awaited external/file boundary is guarded by live TLS checks before and after. Require encrypted authorized TLS 1.2/1.3, a nonempty peer certificate and hostname verification; verify postgres session identity, postgres database, TLS and supported server version. Acquire the same project-scoped advisory lock.
3. Read one private active state from the fixed Vault name. A pure `validateActiveRuntimeConfirmationCandidate` in `scripts/database/hosted-active-runtime-state.ts` accepts only exact CONFIGURED or exact CONFIRMED state matching the immutable original intent/result/cleanup and current original approved identity. It produces a candidate for this confirmation owner only. `readInstalledRuntimeMetadata` and `readActiveRuntimeConfiguration` remain strictly CONFIRMED.
4. Re-observe fixed GET provider metadata: original Vercel deployment/team/project/source/artifact/operation identity, encrypted runtime settings and original active Edge ID/version/authentication configuration and secret hashes. No preview bypass header is requested or sent. Require fresh source/private population/current membership/runtime grants/transport privacy/analytics-disabled checks, exact original signing-key equality, active original Cron definition and exact dispatch endpoint/secret/allow-local ownership. Read original source/probe completion and durable audit/idempotency evidence without replaying the command or wake. Recheck original source/approval and unchanged candidate immediately before transition.
5. For CONFIGURED, construct the same state's CONFIRMED successor with only the matched original cleanup. Use existing `validateActiveRuntimeTransition`, a transaction with fixed-name compare/read/save, explicit COMMIT intent and exact readback under the same live lease. A thrown COMMIT or unavailable readback is UNKNOWN, regardless of rollback. Never automatically create another connection or save again in that invocation.
6. If the observed state is already exactly CONFIRMED, perform read-only reconciliation and no save. This resolves a prior unknown COMMIT only through fresh native evidence; changed/absent/duplicate/malformed/INTENT/REQUIRES_REVIEW state refuses.
7. Recheck official source/approval and exact state/control before cleanup. Unlock acknowledgement and session end are separate facts. An acknowledged unlock remains true even if close fails; overall confirmation stays review. Set ending only for intentional close and retain listeners through completion. Publish current confirmation success/canonical bytes only after readback, unlock, close and journal publication all settle.

## Failure and cleanup policy

Read-only confirmation loss, stale evidence, provider refusal, changed ownership, native end or receipt publication failure never call configure_worker_dispatch, cron.unschedule, provider POST, Auth login, source command, signed wake or deployment. Leave exact original state/key/dispatch and retained evidence for review.

The original activation owner keeps its existing bounded cleanup only for an actual execution failure before the successful execution/cleanup evidence boundary. It verifies its original owned dispatch and Cron before pause/unschedule and retains unknown results. Split that execution-failure decision from later confirmation/publication failures so a generic REQUIRES_REVIEW status cannot pause a healthy active worker after execution succeeded.

## Verification

Use the real Client/EventEmitter lifecycle semantics in controlled exported-function tests, without native/provider network. Add pending transaction state to the existing fixture so SAVE, COMMIT persistence, acknowledgement and readback are independent. Required cases cover normal order, idle error/end during admission, query/readback TLS loss, wrong native identity, changed source/approval/dispatch/key/Cron/provider/runtime, final COMMIT persisted/unpersisted with lost acknowledgement, exact confirmed reconciliation with zero saves, false/throwing unlock, acknowledged unlock plus failed close, late journal/result publication failure, absent/duplicate/malformed state, and immutable historical clocks/hashes.

Assert no unhandled error, no secret output or preview headers, no new key/source/wake/provider effect on any confirmation path, one bounded transition only, original active worker preserved on late review, final result/cleanup hashes match, failed originals stay failed, strict installed-runtime readers deny CONFIGURED, and the runner refuses all other scopes/identities. Existing signed execution failure still pauses only its exact original dispatch.

Run supported Node 24.19.0 targeted activation/confirmation/state/runner suites, relevant hosted-plan/release/handover contracts, lint and typecheck, required architecture/docs/repository checks and their fixture tests. Temporary output uses `F:/cuevo-native-admission-temp`; generated dependencies/output stay ignored. Full hosted execution, restore, consumer release and customer acceptance remain separate gates.

## Alternatives considered

Adding only error/end listeners fixes the uncaught symptom but leaves stale receipts, missing final native observations and unknown COMMIT stranded. Broadly admitting CONFIGURED through installed-runtime would let incomplete runtime state satisfy ordinary downstream authority. A new pending-runtime package scope could support completed/expired original runs, but it changes preparation/contracts/workflow admission and requires a separate reviewed original-to-current bridge. This repair chooses the smallest existing-route bound and refuses that broader reuse.
