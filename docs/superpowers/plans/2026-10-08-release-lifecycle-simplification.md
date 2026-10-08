# Cuevo incremental release lifecycle implementation plan

> For agentic workers: implement task by task with disjoint owners and root review. Preserve all existing worktrees, hosted state and original receipts. The founder has approved this release simplification direction; concrete provider effects retain exact prepared approval.

**Goal:** Make first installation, subsequent staging release, recovery and rollback executable with independent milestones and one canonical check owner.

**Architecture:** Extend the existing CI/backend/web/native database/provider/active-runtime owners. Source/database proof is independently consumable. Runtime rollout pauses admission, drains actual leases and verifies desired artifacts before updating the current generation. Complete acceptance remains distinct.

**Tech stack:** Existing TypeScript/Node24, pg, Zod, GitHub Actions, Vercel API/CLI and Supabase. No new release platform or dependency unless demonstrated necessary.

**Spec:** [Incremental release lifecycle](../specs/2026-10-08-release-lifecycle-simplification.md).

## Delivery ruling after full source review

The first executable release is database-first: finish `schema-and-accounts`, then prepare `complete-backend` operating staging from confirmed installed population and 133 Auth identities with no pending SQL. Full customer verification follows in a fresh `installed-runtime` package after current generation initialization. A rollout finishes at its native result; a fresh package observes the new current state before handover. Approved package contents are never rewritten after effects.

The complete future lifecycle remains unfinished: pending schema/interface maintenance, customer handover after retained older-component rollback and long-lived bounded-history retention require further work. They must not hold up verified first-install milestones or be represented as completed by this candidate. Protected integration and actual customer acceptance remain required.

## Global constraints

- Append-only applied migration history; no hosted reset or new retry identity for an uncertain effect.
- Preserve current permission/grants/RLS/private transport/worker/source/audit/outbox rules.
- Preserve actual30second native freshness,6second modeled capacity target and approval clocks.
- Keep full customer acceptance separate from source/database and operating-staging proof.
- Freeze coherent candidate, review all changed paths independently, run required checks and integrate through protection before hosted execution.

## Task1: Reliable CI probes and modeled clock

Owners: `edge-worker.ts/.test.ts`; `hosted-schema-reconciliation-executor.test.ts`.

- [x] Reproduce stale local public socket reuse with a real loopback HTTP server; fence each local verifier request with a fresh connection, retaining one-shot deny receipts and deadlines.
- [x] Reproduce virtual-time leakage across zero-cost host promise completion; track actual awaited host/stream/module continuations and preserve native output validation.
- [x] Emit sanitized timing metrics before capacity assertions. Test natural starts, delayed host completion, held/cancelled lanes and excess latency without changing6second/30second guards.
- [x] Run each complete owner suite and preserve red/green evidence; root reviews transport and clock semantics.

## Task2: One canonical source/database producer

Owners: `verification-workflows.ts`, `steps.ts`, `runtime-lanes.ts`, `canonical-runtime-jobs.ts`, `staging-verification.ts`, `staging-verification-jobs.ts`, `.github/workflows/ci.yml` and `staging-verification.yml`, related tests.

- [x] Add isolated canonical database verification with complete replay/SQL/grants/advisors and exact safe producer evidence; remove duplicate ownership from runtime composition only where the original scope remains provably covered.
- [x] Add a strict canonical source/database reader that admits required producers independently of unrelated runtime status, with exact current main/run/attempt/steps/security receipt.
- [x] Make focused staging consume that reader instead of replaying source/database checks. Keep manual trigger/read-only retry and meaningful not-ready reporting.
- [x] Test failed database/security/source, wrong attempt/source, hidden/skipped/duplicate checks, unrelated backend/browser failure and stable original artifact identity.
- [ ] Update contracts/discovery/docs together. Run targeted workflow/admission/rules plus required checks before protected integration.

## Task3: Capability-specific preparation and immutable artifacts

Owners: backend package/prepare/runner/workflow, runtime artifact builders, safe archive/admission owners and their tests.

- [x] Define strict discriminated delivery payloads: database-only, runtime deploy, read-only pending/current inspection and rollout. Preserve legacy historical exports through explicitly versioned readers.
- [x] Database-only package builds only pending SQL delivery and original source/toolchain/policy; API/Edge builders cannot run and provider deployment cannot consume this package.
- [x] Publish runtime component archives once from the verified producer; bind source/lock/toolchain/target manifest and exact bytes. Runtime preparation consumes those official artifacts rather than rebuilding.
- [x] Read-only confirmation requires original runtime evidence and current checks without new SQL/runtime delivery.
- [ ] Test no unused builders, artifact/path/ZIP bounds, source/configuration mismatch, source changes during consumption, unknown publication and exact old receipt clocks.

## Task4: Safe admission pause and active-runtime rollout

Owners: append-only migration/SQL tests, existing dispatch/outbox and active-runtime/provider/alias owners, backend rollout composition/tests.

- [ ] Read accepted event architecture and actual claim/begin/finish controls. Define private admission pause that preserves current generation/key/Cron and blocks new wake/begin/claim while allowing current completion/failure.
- [ ] Add migration via pinned Supabase CLI migration command, with explicit private grants and deny tests. Applied230 files remain unchanged.
- [ ] Add strict previous/desired rollout binding and bounded current generation to existing state ownership. Derive compatibility from exact source/schema/event/API contracts; incompatible changes require explicit maintenance/review.
- [ ] Implement owned pause/drain, compatible pending migration consumption, exact desired API/Edge artifacts, private operating verification, exact alias transition and retained-key/job resume.
- [ ] Implement original-outcome reconciliation and backward-compatible provider rollback without reversing database history. Record actual new Edge version for retained old bytes.
- [ ] Test live lease drain/no new claim, changed ownership/source/approval, unknown commit/upload, failed verification, duplicate attempt, old→new success and safe rollback.

## Task5: Operating handoff, acceptance and usable entrypoints

Owners: backend handover/web transfer/release process, summaries/runbooks and current gate validators.

- [x] Separate an operating-staging handoff from full customer acceptance with strict purpose-specific consumers.
- [ ] Preserve completed database/accounts/runtime/web facts independently; add one operator-facing phase summary with exact next action and original evidence links, no private bytes.
- [ ] Document/run explicit first-install, pending database update, initial runtime, active rollout, frontend candidate, confirmation recovery, full rerun and customer-candidate commands.
- [ ] Test a later failure leaves earlier milestone evidence, staging cannot satisfy customer promotion, unchanged exact artifact reuse, current source/approval revocation and original unknown effect refusal.

## Task6: Complete review and hosted execution

- [ ] Self-review spec/plan coverage against every explicit invariant and executable transition. No placeholder feature, unavailable switch or same-source-only workaround may be presented as complete lifecycle.
- [ ] Run exact relevant tests, types/lint, architecture/docs/repository checks and CI contracts. Preserve earlier failed scopes and verify complete discovery.
- [ ] Obtain complementary complete nonauthor source/QA review and freeze a signed candidate; reconcile PR25's useful UI fixes before first worker activation.
- [ ] Integrate through protection, verify current integrated main source/database producer and prepare the exact original recovery package.
- [ ] Execute authentic approved original123 recovery, pending migrations/accounts, API/Edge/private operating checks and connected frontend. Record hosted counts and proof separately from CI.
- [ ] Complete hosted all-five-role English/Arabic/mobile and learning journey acceptance; report customer gates from actual evidence. Keep the persistent hosted-delivery goal active until its full requirements are verified.
