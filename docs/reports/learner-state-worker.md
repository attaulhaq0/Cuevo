# Learner state and restricted worker

Date: 1 October 2026. Company E Deviser; product Cuevo.

The restricted worker now processes claimed domain events into source-linked learner state, practice/reflection observations and neutral practice signals. Academic, development, engagement, support and impact remain separate. Native academic results have normalization null; no activity can change grades, infer character or produce an intelligence score.

## Implementation boundary

`OutboxProcessor` calls only private claim/process/fail functions. `internal.process_learner_event(event_id,lease_token)` retrieves the claimed stored envelope and authoritative immutable result/evidence or activity completion. It does not use event metadata as fact authority. School/object/actor and lease state/time must match. Known setup events are explicitly acknowledged; unknown events fail with bounded retry metadata. Worker error storage receives a fixed code, never source/private error text.

Processing locks the source learner before source deduplication, writes a processed marker, observation/state/provenance and downstream state/habit events, then requires final lease acknowledgement in the same SQL transaction. A false acknowledgement raises and rolls back. Event-ID and source-object uniqueness stop repeated delivery or separate event IDs from duplicating snapshots/observations. Worker roles retain no raw app/learner/outbox privileges; health exposes only technical queue counts/lag and checks constrained role/processing privileges.

Snapshots include only processed current released results and processed completions. Source IDs therefore correspond to processed evidence. Practice/reflection counts are **RECORDED_ONLY** within an explicitly school-approved development window. Revision counts remain null because revision-after-feedback sources are not implemented; no activity click is reclassified. Support/impact remain empty/unmeasured. Synthetic seed uses an explicit 14-day school policy, not an academic threshold.

Snapshot content is bounded to 100 current native rows, 1,000 source/observation IDs and 500KB; sentinel count checks precede JSON aggregation. Overflow fails for review rather than returning a misleading partial projection. Practice signals expire when their source observation leaves the approved window, and API filters expired signals. Signal rule version follows the current approved policy version.

## API and privacy

`createLearnerStateController(identity,database)` provides `/v1/learners/:id/state`, `/v1/observations` and `/v1/signals` through the existing verified-session/current membership boundary. RLS enforces current tenant, role, learner relation and entitlement. Lists use bounded UUID pagination and optional learnerId filters. Parents cannot read raw habit/signal lists.

No state returns the full frozen UNKNOWN shape with null counts/source lists. Current snapshots return READY/CURRENT. A development projection older than the technical 60-second cache window returns READY/STALE with preserved native academic provenance and unknown development counts. This is a freshness boundary, not an academic rule. Parent state derives only approved current released result projections, uses APPROVED_PROJECTION freshness and unknown development/engagement. Parent result capacity uses a 101-row sentinel and 500KB limit with explicit 413. Current guardian RLS still governs every row.

## Database and local execution

CLI migrations add policy/state/observation/signal/processed storage, constrained processing/health functions, and successive verified fixes for source-variable ambiguity, acknowledgement, source consistency, bounds, expiry and rule version. All were applied through local `migration up --local --network-id cuevo-local`; no remote mutation/reset or git commit occurred. Synthetic seed adds learner.state entitlement and approved development window. Existing local synthetic context received the same explicit additions through a loopback/56322 checked update.

Test isolation removes current derived/outbox fixture rows inside a rolled-back owner transaction, preserving existing real synthetic work after tests. SQL tests and live API tests run sequentially with background workers stopped to avoid intentional fixture races.

## Verification evidence

Worker adapter tests failed twice before implementation; four SQL structure checks failed before migration. The first full processing golden case revealed an ambiguous SQL variable and failed nine assertions before the additive fix. Actual fresh-flow API verification caught a missing SQL token separator in list queries (503), fixed without weakening scope.

Final checks:

```text
node node_modules/supabase/dist/supabase.js test db --network-id cuevo-local
  7 files passed; 189 SQL checks passed (25 worker/state golden checks)

node node_modules/vitest/vitest.mjs run apps/api/test/learner-state apps/worker/test --reporter=dot
  4 files passed; 7 tests passed; real local integration executed

node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js apps/worker apps/api/src/learner-state apps/api/test/learner-state* packages/contracts/src/learner-state.ts
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.build.json
git diff --check -- [worker/state changed paths]
  all exit 0; no diagnostics
```

SQL cases prove wrong/stale/completed leases, false-ack rollback, cross-school source mismatch, deduplication, unchanged revision state on duplicate source, observed-only counts, unknown revision, processed completion provenance, signal expiry/rule update, raw worker-data denial, student self/peer/parent scope.

The persisted real Auth/API/Postgres integration test creates a fresh course/practice/completion and numeric released result, runs `OutboxProcessor` using the restricted worker connection, verifies native result/source observation/source IDs through the actual learner API, and recreates the processor to confirm no extra snapshot/version/count. It separately checks student self, peer denial and parent filtered projection. Local worker health after drain returned ready true, pending 0 and failed 0.

## Limits

Independent review, clean migration replay and browser progress verification remain root integration work. OpenAPI state/list response metadata is not yet complete generated-client coverage. Large learner histories require future paginated projection design. This increment does not implement revision-after-feedback, XP, weakness thresholds, AI recommendations, interventions or reassessment. Missing official curricula and real-model validation remain blockers; no full MVP completion claim follows.

Final shared-contract hardening adds optional freshness/completeness fields, finite academic/source arrays, native score/scale checks and semantic rejection of measured UNKNOWN states. The targeted contract suite passed three tests after these additions (two new cases), with typecheck/lint passing. Total worker/state scoped tests are now nine; the preceding full scoped run recorded seven before these two additions. The full SQL evidence remains 189 checks. Root will verify the final staged artifact before clean replay.
