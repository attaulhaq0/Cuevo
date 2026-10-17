# Native Cron startup diagnostics implementation plan

> For agentic workers: execute the bounded tasks below in this session. Root arranges independent review afterward; do not spawn a reviewer, commit, publish or run native effects.

**Goal:** Retain minimized observations from the original failed startup invocation so a later genuine CI attempt can distinguish a native preflight/process failure from a framing, admission or source refusal. The original PR70 cause remains UNKNOWN.

**Architecture:** Extend the existing native Cron startup, policy and failure receipt owners. One finite observer reads the existing owned child and uses the existing startup deadline/stream budget. Cleanup's already-required exact owned-container inspection supplies terminal exit facts when available. Diagnostics never authorize or retry an effect.

**Tech stack:** Existing TypeScript/Node24.16.0, Zod, Bash fixture and controlled Node tests; no dependency or runtime adapter change.

**Spec:** [First mechanics proof](../specs/2026-10-15-worker-native-cron-first-proof.md), root-approved diagnostic scope, and preserved PR70 run38667887454/attempt1 failure evidence in the prior worktree's ignored `.local/sql-cron-native-proof-first-ci-failure`.

## Approved scope and constraints

- New manual workspace: `G:/Cuevo-workspaces/sql-cron-startup-diagnostics/Cuevo`, branch `codex/sql-cron-startup-diagnostics`, base `c4e734d07b1484262bbedbc4b9fcc73baf3eeff2`, tree `2bfc6ccc10101d28318684829f86d6ff840e4780`.
- Preserve the frozen f9/561 worktree, PR70 and all22 original failure entries. Incorporate the exact reviewed f9 Cron21 delta onto C4 while preserving all9 current UI/doc paths; only the owned codebase-map insertion needs a factual merge.
- Update the pre-Cron historical cutoff to exact C4/tree2bf, preserving old eca/561/original231 history and current-source refusal. This is a separate baseline contract delta and is frozen before diagnostic implementation.
- Startup remains exactly5000ms with a combined stdout+stderr limit of1048576bytes. SQL remains5000ms; cumulative timing/body and every transport/worker/recovery limit stay unchanged.
- Preserve strict cache/image/source/ownership/version/admission guards, the original start signal, one create/start/cleanup sequence and at-most-once unschedule behavior.
- Record only actual events. Missing/malformed/mismatched/duplicate observations remain UNKNOWN or nullable UNOBSERVED. Running/created/absent container default exit0 is not an observed exit. Cleanup-induced outcomes cannot replace the original cause.
- Export no raw stderr/stdout frame, configuration, environment, argv, path, SQL or credential content. Keep private stream buffers within the original total bound and remove/settle listeners in the existing lifetime.
- The original exception, first refusal and phase remain authoritative. An observability failure cannot replace them. No extra polling, native operation or delayed cleanup is added.
- Keep positive version2 mechanics proof semantics unchanged. Add versioned failure-only diagnostics while retaining old failure version1 admission/history.
- All work is source-only with `npm ci --ignore-scripts --no-audit --no-fund`, SCARF disabled, pinned Node/npm and G caches. No local Docker/native/CLI/server/DB/Auth/provider, commit/PR/publish or canonical effects.

## Diagnostic design

`NativeCronStartupObservation` belongs beside existing admissions in `worker-native-cron-proof-policy.ts`. It consumes the original child stdout/stderr/error/close events, a clock and the existing fixed timer. Its `handshake(assertSource)` method applies the unchanged startup-frame admission and then the source guard, preserving thrown errors. It returns the existing admitted startup facts, never sends a gate and never starts/restarts a child.

The observer exposes `diagnostic()`, `inspectOwnedExit(state)`, `beginCleanupEffects()` and `dispose()` to the existing runner. Refusal categories are CHILD_ERROR, CHILD_CLOSE, TIMER, STREAM_LIMIT, FIRST_FRAME, HANDSHAKE_ADMISSION, SOURCE_GUARD and UNKNOWN. Categories originate only in their actual handler/admission/guard branches. The first category and observation clock are latched.

Original child error presence/finite code and original close code/signal are separate fields. The fixed shell emits at most one finite preflight-stage/nonzero-exit frame on its own stderr when it fails. A stage is matched only to original terminal evidence from this observer's invocation, with existing inspected terminal container status preferred; absent or conflicting evidence stays UNKNOWN. No private child message enters the record.

The existing physical cleanup inspection may record a container exit only for an actual terminal `exited` state with a genuine finished clock before disposal begins. Existing running/created/dead/unknown/default states stay UNOBSERVED. The observer stops collecting cause/exit facts when cleanup effects begin, and its original refusal cannot be overwritten by late events.

The new failure receipt is version2 with a nested diagnostic version1. Non-startup failure records carry no startup diagnostic. The old failure version1 shape stays separately admissible. The positive proof remains version2 with its existing exact schema and fields.

## Tasks

- [x] **1. Freeze authentic C4 baseline/rebind.** Verify C4/tree2bf, old f9 source and all failure pins. Save C4's9 protected path hashes and raw codebase maps. Apply only the exact reviewed Cron delta; preserve C4's map entry and insert the exact Cron owner entry. Write the C4 cutoff test first, observe its failure against561, then change only the cutoff/tree and current provenance. Freeze the incorporated baseline separately.
- [x] **2. Observe missing diagnostics RED.** Add controlled tests in `worker-native-cron-proof.test.ts` using real EventEmitters and a controlled timer at the external timer boundary. Fail because original startup events have no finite observation owner, not because of native infrastructure. A close after a fixed preflight failure must expose the matching original stage/code; timer and aggregate stream overrun must expose their actual categories.

```ts
const original = Error('private source failure');
const observed = new NativeCronStartupObservation(child, ports);
child.stdout.emit('data', Buffer.from(validNineFieldFrame));
await assert.rejects(observed.handshake(() => { throw original; }), error => error === original);
assert.equal(observed.diagnostic().refusal, 'SOURCE_GUARD');
```

- [x] **3. Implement the finite observer and receipt projection.** Add bounded buffering, first-refusal/event latches, safe own-descriptor projection, exact source-bound frame parsing/correspondence and disposal/listener settlement. Define strict old/new failure schemas. Keep the existing positive startup admission unchanged. Add negative cases for hostile/error accessors, malformed/duplicate/missing frames, mismatched exit evidence and cleanup-induced exits.
- [x] **4. Wire only original source events.** Replace the inline startup promise with the observer and its unchanged handshake admission/source guard. Add a fixed shell EXIT diagnostic preserving original status. Observe existing owned-container terminal facts immediately after its existing admission and before physical disposal; mark cleanup effects and dispose within the existing finally lifetime. Serialize the version2 failure diagnostic without masking the first failure.
- [x] **5. Verify source-only behavior.** Confirm RED→GREEN, original first-error preservation, positive version2 unchanged, exact aggregate budget, no retry/reopen and no imported effect. Run targeted proof/policy/workflow/discovery/historical tests, root typecheck and scoped lint, architecture/docs/repository guards as required. Bash syntax checks may parse the fixture; never execute its native preflight locally.
- [ ] **6. Freeze final review package and obtain root review.** Reverify preserved f9/failure22 and protected C4 UI/SQL bytes. Save complete C4 patch plus diagnostic-only delta, raw hashes, source inventory, logs and report under ignored `.local`. Report authored behavior only; root owns independent review and a separately authorized new genuine CI candidate.

## Acceptance and remaining evidence

Controlled tests prove supplied-data/event composition and preservation of the existing bounds/authority. They neither reproduce the original native cause nor establish native RED or mechanics acceptance. The exact PR70 archive/log/clocks remain historical, and no later diagnostic can retroactively fill their missing process facts. The next actual cause requires a new reviewed source candidate and genuine Linux CI evidence.
