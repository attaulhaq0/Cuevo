# Original worker activation confirmation implementation plan

> For agentic workers: execute this plan inline after root review of the design; keep verification and integration review separate. No commit, push, CI or provider execution is authorized for this worktree task.

**Goal:** Finish original activation with truthful terminal evidence and an exact-original bounded confirmation path.

**Architecture:** Preserve the private active-runtime state owner and its CONFIRMED-only ordinary consumers. Add one native confirmation owner for initial activation and separate immutable execution evidence from current terminal activation files. The rejected same-package manual route grants no runner capability; later recovery uses the separately reviewed [fresh pending confirmation plan](2026-10-08-pending-worker-confirmation-admission.md).

**Tech stack:** TypeScript, Node 24.19.0, installed pg 8.23.1, Zod 4.6.5, node:test and esbuild-controlled native transport fixtures.

**Spec:** [Original worker activation final confirmation](../specs/2026-10-08-original-worker-activation-confirmation.md).

## Constraints

- Preserve source/tree/run/attempt/package/activation/key/runtime/API/Edge/Cron identity and original evidence clocks.
- No migrations, feature changes, provider/CI effects, commit, push or cross-chat operations.
- Confirmation uncertainty never pauses healthy dispatch or repeats source/wake/key/deployment effects.
- Same-original complete-backend live approval only; completed/expired original or changed source/run/package requires review.
- CONFIGURED never becomes ordinary installedRuntime authority. Use existing transition validation only.

## Task 1: Pure original confirmation candidate

Files: modify `scripts/database/hosted-active-runtime-state.ts` and its colocated test. The owner consumes original intent/result/cleanup and expected identity values and returns exact CONFIGURED/CONFIRMED candidate state only; it performs no I/O and creates no permit.

- [ ] Write cases that accept the exact CONFIGURED successor with matched original cleanup and accept exact CONFIRMED observation; reject source/run/package/activation/key/runtime/job/cleanup hash or clock changes, absent/duplicate/unknown fields and non-confirmable phases.
- [ ] Run the state tests and verify the new candidate export fails before implementation.
- [ ] Add `validateActiveRuntimeConfirmationCandidate` with strict schemas and canonical identity/hash equality, using `validateActiveRuntimeTransition` to validate the CONFIGURED successor and existing terminal validation for CONFIRMED.
- [ ] Run state and resume contract tests; prove ordinary metadata/private configuration readers still reject CONFIGURED.

## Task 2: Native bounded confirmation owner

Files: create `scripts/verification/backend-hosted-activation-confirmation.ts` and colocated `.test.ts`; update test discovery in `package.json`. Consume the spec's exact input/result types and pure candidate; return original confirmation evidence only after native cleanup.

- [ ] Build controlled exports tests with an actual EventEmitter-derived pg Client transport and independent transaction pending/committed state. Cover idle error/end while admission waits, TLS/identity/lock, COMMIT lost acknowledgement both persisted/unpersisted, readback failure, unlock false/throw, close failure, unchanged provider/source/private/key/Cron evidence and exact CONFIRMED zero-write reconciliation.
- [ ] Run failing tests with the supported Node runtime and controlled I/O only.
- [ ] Implement fixed owned receipt reads, current original admission, bounded provider GETs and native TLS/identity/lease owner. Attach listeners before connect, guard every boundary, query fixed current source/key/Cron/control/provider evidence and validate candidate.
- [ ] Implement one transactional CONFIGURED→CONFIRMED save/CAS/readback or zero-write exact CONFIRMED observation; record commitment as NONE/UNKNOWN/CONFIRMED independently of final cleanup.
- [ ] Implement separate unlock/close observations and append truthful final confirmation outcomes to the original activation journal after cleanup; no healthy pause or provider/product effects.
- [ ] Run the new suite and assert no unhandled Client error, bypass header, secret output, source/wake/dispatch/Cron/key/provider mutation or automatic second confirmation connection.

## Task 3: Initial activation evidence and terminal publication

Files: modify `scripts/verification/backend-hosted-activation.ts` and `.test.ts`. Keep the original execution owner; call the new native owner only after original execution evidence/cleanup succeeded.

- [ ] Add failing fixture cases for final confirmation loss, late cleanup/publication errors and truthful final file/result hash binding, with history bytes/clock preservation and active worker remaining enabled.
- [ ] Write immutable `worker-activation-execution-result.json` and `worker-activation-execution-cleanup.json` at the original evidence boundaries; store those original bytes in CONFIGURED/CONFIRMED.
- [ ] Replace the unowned second Client body with `confirmHostedWorkerActivation` and separate actual execution cleanup eligibility from final confirmation/publication review.
- [ ] Publish existing terminal result/cleanup only after confirmation finishes. Preserve phase FINAL, clear canonicalReceipt on every review and retain fixed current result/cleanup digest/clock binding. Existing consumer filenames remain the initial terminal gate.
- [ ] Run activation tests plus affected native recovery/API origin/handover tests. Confirm the original signed processing failure still pauses only its exact owned dispatch.

## Task 4: Fresh pending-confirmation package — separately reviewed

Files and interfaces are implemented through the [fresh pending-package design](../specs/2026-10-08-pending-worker-confirmation-admission.md). Root rejected a same-live-only manual mode because a failed completed run cannot satisfy existing admission. Root reviewed and approved the bridge before runner, preparation, package-scope and workflow source implementation.

- [ ] Write the separately reviewed implementation plan for fresh same-source pending-runtime-confirmation preparation, export/admission, pure contracts, zero-op plan, protected runner and current native entry.
- [ ] Prove historical original approval at actual execution/cleanup clocks, current exact protected CI/founder approval and immutable original journal/file hashes before any confirmation save.
- [ ] Keep ordinary installedRuntime consumers strict and use a separate current installed-runtime package after durable confirmed completion for remaining recovery/restore/handover/web gates.

Root reviews the design before Task 1. Root reviews the completed source/test diff before any integration or real activation. The frozen PR24 candidate remains untouched.
