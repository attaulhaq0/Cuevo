# Learner state and worker verification

Date: 2026-10-01, Asia/Riyadh. Scope: deterministic outbox processing, source-linked native academic state, recorded practice/reflection and neutral signals; approved parent projection. Full MVP remains active and unverified.

The worker now processes claimed source events with validated opaque leases and tenant-matched immutable records. It persists processed markers, learner projections, observations and downstream events with successful acknowledgment atomically. Event and source dedup prevent duplicate snapshots/observations; failed acknowledgment rolls back. Academic native results and practice/reflection remain separate. Revision remains unknown until a supported source exists; support/impact remain unmeasured.

Fresh verification:

- Clean replay of all 14 current migrations and deterministic seed passed; 133 synthetic Auth identities provisioned.
- Seven SQL files, 189 assertions passed, including source mismatch, expired/stale leases, final acknowledgment rollback, deduplication, finite projections, signal expiry and current policy context.
- Three sequential real Auth/API/Postgres integration suites passed nine tests, including fresh completion/release → restricted worker → native state/provenance and processor restart with no duplicates.
- `npm test`: 183 Vitest tests, 34 web tests and 4 local-runtime tests passed.
- Lint, typecheck and API/Next/worker builds passed.
- Five browser tests passed. The Progress surface shows native evidence separately from recorded observations and supports Arabic/mobile with no overflow, no axe violations after the semantic definition-list fix, and no duplicate GoTrue-client warnings.
- Independent specification and code-quality review passed the bounded worker scope; see learner-worker-code-review.md.

Counts are explicitly recorded-only; missing and stale counts remain null. Stale snapshots retain traceable native evidence with a refresh notice. Parent projection contains approved academic records only and omits raw habit/engagement state. Lists use bounded requests with validated cursors. Large projections fail explicitly rather than silently truncating.

During validation, a real list request exposed a missing SQL whitespace separator; the source/API test caught and fixed it. Review corrections made source event provenance consistent with processed results/completions, added pre-aggregate capacity sentinels, required final acknowledgment success, bounded the parent path, expired practice signals and updated signal rule versions. These are engineering correctness checks, not official curriculum or AI validation.

Remaining: explicit revision-after-feedback, XP/achievements/leaderboard, AI proposal/provider/grounding eval, human approval/intervention/reassessment/outcome, rubric marking, SIS daily operations, private Storage/Realtime/community and complete five-role journeys. Large-history paginated projection and full OpenAPI generated-client coverage remain documented limits. The official locked curriculum artifacts and live model/data-policy configuration remain blockers to final MVP verification.
