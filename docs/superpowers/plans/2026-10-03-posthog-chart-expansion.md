# PostHog chart expansion implementation plan

**Goal:** Make Cuevo's existing internal PostHog dashboards useful for QA, product operations, intelligence governance, institution demonstrations and future real adoption using the current minimized event contract.

**Architecture:** Read-only analytics projections of confirmed Cuevo events; academic truth, audit and authorization remain in the application. Extend existing dashboards and reuse charts rather than duplicate definitions. No runtime, migration, model-call or replay change is required.

**Sources:** [42 observability](../../product/platform/42-OBSERVABILITY-POSTHOG.md), [39 governance](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [current operations](../../operations/posthog.md), [delivery decision](../../decisions/2026-10-02-posthog-current-repository.md), current worker mapper/browser sampling and PostHog connector dashboard/query skills.

## Constraints

Current capture is SYNTHETIC QA/DEMO/STAGING only. Source/schema/environment/data-class filters are mandatory; institution SQL explicitly fixes DEMO. Real adoption fixes REAL/PRODUCTION/synthetic=false and remains empty until separately authorized capture. Pseudonymous actors identify acting accounts within schools; cross-role stages use run linkage rather than a person funnel. Diagnostic sampling cannot establish error rates or an SLA. Missing metadata remains unknown. Aggregate AI cost, tokens and latency only on terminal run observations. Outcome composition and follow-through do not establish causal effectiveness. Preserve legacy data, current assets, sharing settings and subscriptions. Do not enable replay, live model calls, external messages or scheduled paid analysis.

## Execution

- [x] Inspect existing 18 insights, five current dashboards, complete proposed metric catalog, current capture and Startup billing snapshot. No approved matching metric exists.
- [x] Obtain independent source-based chart coverage review and sampling/actor/run caveats.
- [x] Validate25 additional QA segment/affected-actor, product role/action-day/workflow/submission, terminal AI metadata/human review, run-linked follow-through, DEMO outcome and real-only repeat/adoption definitions.
- [x] Save25 successful, nonduplicative query definitions to existing dashboards. Preserve existing layouts; append complete nonoverlapping desktop boxes with readable titles/descriptions. All five remain private. Independent review fixed terminal-event deduplication, conflict visibility, identity-key version and zero-pair timingNULL.
- [x] Force-refresh all50 chart placements after final query fixes; all uncached/no warnings/errors. Investor results remain empty, institution SQL/native results contain DEMO only, unknown billing/review stays unknown. Inline SQL retry/empty-pair checks pass without captured source events.
- [x] Persist [chart inventory](../../operations/posthog-charts.md) and [exact25new definitions](../../operations/posthog-charts.json), update operations/navigation and pass docs6/architecture13/repository22 guards. Current saved queries and inline dedup/empty-pair cases verified. No authenticated visual dashboard acceptance, native technical-log/trace ingestion or remaining credit-balance verification is claimed.

Query trials and sanitized live metadata belong in ignored .local/customer-readiness. The maintained inventory is implementation guidance, not a competing product specification or an approved metric catalog.
