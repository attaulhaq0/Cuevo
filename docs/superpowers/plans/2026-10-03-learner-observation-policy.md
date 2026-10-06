# Learner Observation Policy Implementation Plan

> **For agentic workers:** Implement only after the current root-owned acceptance window is terminal. Use the existing Learner State owner, current private source processor, contracts and UI. This document is read-only implementation preparation, not policy approval or runtime evidence.

**Goal:** Let a newly admitted school administrator explicitly approve the observation window required for learning/habit/state processing, without seed rows or owner SQL.

**Architecture:** Add current-policy read, a versioned administrator command and immutable approval history beside existing `app.learner_state_policies`. Preserve its current row as the processor's authority; commit history/current pointer/audit/outbox/idempotent receipt together. A policy transition requests bounded per-learner refresh through the existing outbox, not synchronous whole-school reprocessing or another task ledger.

**Sources:** [08 learner state](../../product/domains/08-LEARNER-STATE-MODEL.md), [09 Habit](../../product/domains/09-HABIT-LEARNER-DEVELOPMENT.md), [11 automation](../../product/domains/11-SIGNAL-REALTIME-AND-AUTOMATION.md), [14 SIS](../../product/domains/14-SIS-MIS-FUNCTIONAL-SPEC.md), [38 events](../../product/platform/38-API-DATA-AND-EVENT-CONTRACTS.md), [39 governance](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [63 RTL/accessibility](../../product/design/63-ACCESSIBILITY-RTL-I18N.md), [81 grants](../../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), current [event foundation](../../architecture/scalable-event-processing.md), [worker decision](../../decisions/2026-10-02-event-triggered-worker.md) and [new-school chain](2026-10-03-new-school-customer-chain.md). The existing SQL bound is1–365days; it is an implementation limit, not an official school policy or recommended default.

## Confirmed cold-school gap

`internal.admit_initial_school` creates approved school/admin/person/entitlement/source/audit/outbox only. It creates no `app.learner_state_policies`. Reference seed and test fixtures insert that row directly. No normal API controller, request contract or customer form writes it.

The current processor explicitly requires the policy before learning/result processing: `internal.process_learner_event` checks the active school and `learner.state` entitlement, then reads `app.learner_state_policies` and raises22023 “Approved development window required” when absent. Current revision/habit refresh likewise refuses missing policy. Academic mutations can still commit while their derived outbox processing cannot complete. Current reads keep missing/stale development counts and windows unknown; processed source requirements can leave staff/learner academic projections incomplete. Do not reinterpret this as zero learning or weaken the processor to choose a default.

School Automation already reports LEARNER_STATE unconfigured/window unknown, but its control destination opens general School policy rather than a window approval form. The existing table has school_id, development_window_days, version and approved_by, with no approval timestamp/history. Add the missing controlled workflow rather than assigning policy at admission without consent.

## Task 1: Private current policy and immutable approvals

**Owners:** `apps/api/src/modules/learner-state`, `packages/contracts/src/learner-state.ts` or one narrowly named observation-policy contract/export, additive `supabase/migrations`, owning tests and README. No raw API/Data API grant to the current/history tables.

- [ ] Add strict read `{schoolId,policy:null|{version,developmentWindowDays,approvedByName,approvedAt},status:UNCONFIGURED|CONFIGURED}` and confirmed command `{developmentWindowDays: integer1..365,expectedVersion: integer>=0,reason: bounded text,confirmApproval:true}`. A null historical approval date/name remains unknown; do not invent dates for seeded rows.
- [ ] Add GET/POST `/v1/learner-observation-policy` through a dedicated Learner State controller composed in normal `createApp`. Current admin plus `school.context`/`learner.state` required for writes; staff current scope may read minimized configuration. Parents/students receive no administrative policy source.
- [ ] Add immutable private `learner_observation_policy_revisions` with exact school/version/window/approved actor/reason/time, current-row consistency and no update/delete/truncate/runtime raw grants. Preserve existing policy bytes/history; imported existing rows are marked historical with unknown approval time rather than fabricated new approval.
- [ ] Write a private owner command that checks current scope and exact current version before original-key replay, serializes this school policy, appends approved revision, updates the established current row and records canonical audit/outbox/receipt together. No automatic14day default and no activation from entitlement alone. Unchecked confirmation, stale revision, wrong school/role, invalid window and reused key with changed intent deny.
- [ ] Current read verifies current row/history consistency; unavailable or inconsistent source is review-required. Record explicit operator/historical provenance separately from a new administrator approval.

## Task 2: Transition and bounded source recovery

**Owners:** Existing Learner State private functions and `apps/worker/src/jobs/outbox/processor.ts`; current outbox/event schema and worker authority stay authoritative.

- [ ] Define version1 `learner.observation_policy.approved` metadata containing only the exact approved policy version. Source validation binds event actor/school/entity/version to the immutable policy revision and current approved policy; this event never authorizes a model call, grade write or XP award.
- [ ] First approval allows future source processing. An ordinary old pending source retries through current domain authority. Failed/exhausted events must not be erased, reset indiscriminately or marked complete because approval exists. Add an explicit bounded domain recovery command only if needed to reconcile existing approved exact sources; each new refresh source has stable identity, current authorization and audit, preserving original failure history.
- [ ] Window changes invalidate current development/signal freshness until exact learner refresh under the current version is confirmed. Preserve factual observations, historical signals and native results. Older rule_version signals cannot be presented as current; source snapshots should declare their applied policy version so a larger/smaller new window cannot appear fresh from an older computation.
- [ ] Process the policy transition in bounded pages of authorized current learners with relevant retained learning/result/observation sources, using existing cursor/event semantics. Materialize candidates before paging, cap each invocation within current worker5second statement/20second batch limits, and emit idempotent exact per-learner refresh sources plus one continuation as needed. The continuation is another delivery source on the existing outbox, not an independent durable task registry.
- [ ] Per-learner refresh repeats current member/course/programme/source checks, observes the new approved window and existing read caps: academic/support100, observation IDs1000, explicit overflow/review. Preserve recorded-only/null semantics, especially revision absence. A policy-only learner with no factual sources stays UNKNOWN rather than receiving invented zero observations.
- [ ] Do not run a whole-school scan on every ordinary source event. Policy approval performs bounded planning once; event processing remains exact-learner/source scoped. Define due/retry/abandoned recovery, no-progress behavior and scalar timing/count/cost evidence before accepting the handler.
- [ ] Historical XP awards and period policies remain immutable and are not repriced or re-awarded when this observation window changes. Existing optional recognition uses its own approved policy/period/current source ledger. Do not let policy refresh broaden an AI saved context or parent publication implicitly.

## Task 3: Administrator setup and truthful missing states

**Owners:** Current Progress/Learner State feature or School policy composition through its documented public surface; reuse existing CommandForm, tokens, locale and session mechanisms.

- [ ] Add a standalone “Learning observation window” administrator panel that can be opened before any learner has results or current projection. Show unconfigured/unknown explicitly and require an empty, deliberately chosen days field, reason and unchecked confirmation. Do not mount policy creation solely beneath an already-successful learner detail.
- [ ] Read current version/time/approver and preserve typed original-key/revision basis on uncertain save. A successful receipt confirms approval, not completed historical refresh. Show separate pending/confirmed/review-required refresh state from authoritative receipts.
- [ ] Route School Automation LEARNER_STATE “Review current controls” to this owning panel. Keep attention policy, recognition points and intelligence execution distinct; the days field never becomes an overall learner score.
- [ ] Existing learner/state views continue to show UNKNOWN when unconfigured and clear stale counts after a transition until refreshed. Provide a current administrator next step; students/parents receive concise school-contact guidance without administrative internals.
- [ ] New-school chain must approve this policy through the real new administrator screen before baseline activity/result processing. No owner insert or copied seed policy may satisfy that chain.

## Verification and acceptance

- [ ] Offline contracts/controller/model tests cover1/365bounds, missing policy, explicit no-default input, null historical approval, confirmation, current version/key and role/tenant denial.
- [ ] SQL/grant tests independently prove raw-table/helper denial for anon/authenticated/service_role/API/worker, immutable revisions, atomic audit/outbox, original-key consistency and current policy/source checks before replay.
- [ ] Real cold-school Auth/API test starts with no policy, commits one authorized learning source and observes documented unknown/failure, approves via normal API and verifies bounded source recovery without grade/XP mutation or fabricated source. Changing window retains facts while refreshing only current authorized projections.
- [ ] Browser new-school admin explicitly chooses window, teacher/learner complete the source loop, worker receipts update exact state, and teacher can request governed fixture analysis. Test Arabic390px/keyboard/axe/console, offline/unknown save, current-version conflict and no source/secret primary labels.
- [ ] Load/recovery tests cover page boundaries, duplicate approval delivery, abandoned refresh continuation, withdrawn learner/course, policy changed during processing, stale previous-version sources and bounded no-progress. Missing capture is not zero errors; denied/failed processing never becomes completed through a fixture shortcut.
- [ ] Run appropriate type/lint/unit/API/SQL/RLS/build/browser plus architecture/docs/repository guards. Record exact applied migration hashes and scoped execution/restoration; do not claim complete new-school onboarding or whole MVP from policy unit tests.

## Current checkpoint

Plan only; no source/runtime/database/Auth/provider/network operation was executed. Attention policy, recognition policy/period and intelligence purpose/execution approval already have normal customer controls; this missing observation-window authority is separate. The current root-owned113browser run remains exclusive.
