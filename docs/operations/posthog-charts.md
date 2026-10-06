# Cuevo PostHog chart inventory

This maintained inventory extends the [current PostHog operations](posthog.md). E Deviser organization, Cuevo project393668. The authorized expansion adds **25 unique saved insights** to the existing five internal dashboards: **43 current insights** overall and **50 chart placements**. Existing18 insights and9legacy dashboards are preserved. Read [posthog-charts.json](posthog-charts.json) for the exact new query definitions, IDs, memberships and descriptions. This is an implementation mirror; remote PostHog remains the live dashboard state, and the six proposed Data Catalog metrics remain unapproved.

## Added charts

| Insight | ID | Dashboard | Query |
|---|---|---|---|
| [Cuevo QA — diagnostic actors by language and viewport](https://us.posthog.com/project/393668/insights/mOH46tnM) | 12469322 | QA | Native Trends |
| [Cuevo QA — actors with unavailable or invalid samples](https://us.posthog.com/project/393668/insights/SpLiT7GL) | 12469323 | QA | SQL |
| [Cuevo QA — access and conflict samples by role](https://us.posthog.com/project/393668/insights/r3eDM7PM) | 12469324 | QA | Native Trends |
| [Cuevo QA — slow sample coverage and unknown timing](https://us.posthog.com/project/393668/insights/PfSEIizx) | 12469326 | QA | SQL |
| [Cuevo Team — observed product actors by role](https://us.posthog.com/project/393668/insights/PPV1Ipp5) | 12469327 | Team | Native Trends |
| [Cuevo Team — recorded action days per actor](https://us.posthog.com/project/393668/insights/AeTWiH01) | 12469328 | Team | SQL |
| [Cuevo Team — role participation across workflows](https://us.posthog.com/project/393668/insights/IUE4ddqq) | 12469329 | Team | SQL |
| [Cuevo — submission action mix](https://us.posthog.com/project/393668/insights/NudCRmyB) | 12469330 | Team, Institution DEMO | Native Trends |
| [Cuevo Team — captured activity by environment](https://us.posthog.com/project/393668/insights/vCCLgcrk) | 12469331 | Team | Native Trends |
| [Cuevo Intelligence — observed provider and model mix](https://us.posthog.com/project/393668/insights/OimlORdD) | 12469333 | Intelligence | Native Trends |
| [Cuevo Intelligence — retained latency with sample counts](https://us.posthog.com/project/393668/insights/tHxL5CzI) | 12469334 | Intelligence | SQL |
| [Cuevo Intelligence — retained tokens and usage gaps](https://us.posthog.com/project/393668/insights/YXt4QI2w) | 12469335 | Intelligence | SQL |
| [Cuevo Intelligence — supplied context and unknown counts](https://us.posthog.com/project/393668/insights/HrW0OJH8) | 12469345 | Intelligence | SQL |
| [Cuevo Intelligence — reservations, estimates and unknown billing](https://us.posthog.com/project/393668/insights/VdD2ATWp) | 12469346 | Intelligence | SQL |
| [Cuevo Intelligence — observed terminal failures](https://us.posthog.com/project/393668/insights/2mY3IwZD) | 12469348 | Intelligence | Native Trends |
| [Cuevo Intelligence — human safety and grounding review coverage](https://us.posthog.com/project/393668/insights/9NWLqqr5) | 12469349 | Intelligence | SQL |
| [Cuevo Intelligence — edited or rejected decisions](https://us.posthog.com/project/393668/insights/BQBzLUzJ) | 12469350 | Intelligence | SQL |
| [Cuevo Institution — recorded outcome comparability](https://us.posthog.com/project/393668/insights/llWKo9ZE) | 12469351 | Institution DEMO | SQL |
| [Cuevo Investor — weekly observed product actors](https://us.posthog.com/project/393668/insights/GJ4yptBg) | 12469352 | Investor | Native Trends |
| [Cuevo Investor — monthly observed product actors](https://us.posthog.com/project/393668/insights/cLlnvz9T) | 12469353 | Investor | Native Trends |
| [Cuevo — approved run follow-through observations](https://us.posthog.com/project/393668/insights/oBc9X6bs) | 12469355 | Intelligence, Institution DEMO | SQL |
| [Cuevo — matched approved-run stage timing](https://us.posthog.com/project/393668/insights/GkdtNpQA) | 12469356 | Intelligence, Institution DEMO | SQL |
| [Cuevo Team — repeat recorded learning actions](https://us.posthog.com/project/393668/insights/rczWYJtl) | 12469357 | Team | Native Retention |
| [Cuevo Investor — repeat recorded learning actions](https://us.posthog.com/project/393668/insights/9cEnXFFi) | 12469358 | Investor | Native Retention |
| [Cuevo — seven-day observed follow-through window](https://us.posthog.com/project/393668/insights/HmDhOoLf) | 12469359 | Intelligence, Institution DEMO | SQL |

## Definitions and safe interpretation

Every new chart fixes cuevo_source=cuevo-repository and schema_version2. Internal capture is SYNTHETIC/synthetic_environment=true in QA/DEMO/STAGING. QA diagnostic views explicitly select QA. Institution dashboard filters shared views to DEMO; outcome SQL also explicitly fixes DEMO. Investor views fix REAL/PRODUCTION/synthetic_environment=false and remain empty because current runtime is synthetic-only. No real-pupil capture approval follows from a chart.

Actors are school-bound HMAC acting-account references, not the learner whose record was marked. Role/workflow cells overlap. Unique product action counts deduplicate $insert_id. Resubmission proportions count actions rather than revised assignments because no task/submission identity is exported. UTC native weeks start Sunday; partial periods remain partial. Longitudinal role/retention/investor views explicitly pin reviewed pseudonym_key_version1; action-day tables retain the version column. Key rotation needs operator reconciliation and chart review.

Diagnostic coverage uses distinct actors in the observed sample, not total customers or a request denominator. Per-context sampling admits20 unique observations and5successes. Parser failure can follow a recorded success. Slow-request coverage therefore includes api_request/api_error only and keeps unknown timing visible. Runtime/hydration cannot be assigned to a feature beyond other. Empty charts can reflect unobserved/disabled capture rather than zero defects.

AI usage/context/latency/budget SQL first deduplicates immutable terminal source-event identity, exposes conflicting_source_events and then aggregates. Any conflict invalidates confident financial/latency interpretation until investigated. Linked stages repeat metadata and never join cost totals. Null token/context/latency/estimated cost stays unknown; fixture zero is recorded zero. Generation-plus-validation latency excludes queue/full-request time; sparse median/p95 shows known/unknown counts. Estimated amounts, reservations and UNKNOWN billed cost do not represent a provider invoice. Human grounding/privacy/tool-safety categories keep assessed/UNKNOWN denominators separate; one run can have different reviewers. decision_override=true includes rejected proposals and edited approvals.

Approved-run tables group by school/environment/pseudonym_key_version/intelligence_run. Source timestamps order approval → support completion → reassessment linked → recorded outcome. Reassessment linking does not itself prove student reassessment completion. Matched timing excludes unmatched pairs and is not whole-cohort completion time. The seven-day view ages selected approvals at the displayed **query_cutoff**; it is an analytical window, not a product deadline. Recent approvals await a full window. Date filters, policy pauses, no-backfill activation and indexing gaps can truncate observations; unobserved does not mean failed/abandoned. The connector could not evaluate an unset date-to placeholder in SELECT, so this is explicitly query-time age, not a historical as-of report. No follow-through or outcome composition establishes causation.

Native recurring weekly retention is narrowly learning_activity_completed → learning_activity_completed for the same observed acting account. Team retention is QA-only. Future zero cells are **not yet observable** and must not be interpreted as nonreturn; only ended, adequately captured periods support return conclusions. This is not signup/customer/learner retention. Full-product retention requires a reviewed composite action/cohort definition before expansion.

## Verification and current data

All25 new definitions validated against actual indexed data before creation. Final force-refresh after identity/null/age review returned all50 chart placements uncached with no warnings or query errors: QA9, team9, investor6, institution8, intelligence18. Shared native and SQL institution results contain DEMO only. Final query and layout readback is retained alongside the evidence. Layouts have complete nonoverlapping desktop boxes; PostHog derives mobile stacking. No visual authenticated PostHog-browser check is claimed. Existing source gate/sharing controls are preserved; all five dashboards report is_shared=false. Inline SQL edge cases verify identical retry rows collapse to2events/20tokens and absent matched pairs returnNULL for all three durations; no fabricated source events were captured.

The inspected last30-day results show133 QA diagnostics from4English-desktop actors. Arabic/mobile and adverse-sample coverage is not yet indexed in these charts. Product activity is27 QA/9DEMO actions, with1observed student and1teacher in each environment. There are2FIXTURE terminal runs, zero external fixture tokens/reservations/estimates, no duplicate metadata conflicts and billing UNKNOWN for both. The single human review is UNKNOWN in all three safety/grounding categories; it is not a passed human assessment. One QA and one DEMO linked approved run each have ordered completion/link/outcome observations; both await seven elapsed days. DEMO outcome is1numeric COMPARABLE/improved observation; no causal effect follows. All six investor charts have0qualifying activity.

No source events were injected to make these charts appear populated. Resubmission, quiz and community live ingestion remains unexercised evidence despite implemented event definitions. Previous frozen verification belongs to its source snapshot; chart expansion does not establish a new whole-MVP aggregate.

## Startup benefits and remaining telemetry

The billing API reports active Startup subscription, current period9September→9October2026 and current organization amount$0. Product analytics, error tracking, AI observability, logs, dashboards, flags/experiments, surveys and other subscribed capabilities are available. The exposed AI usage allowances/custom limits are product budgets, not a verified remaining startup dollar balance. Monetary credit balance/expiry is not exposed in this snapshot; do not infer $50k from advertised programme eligibility.

Use available benefits first for minimized confirmed product analytics, developer QA, retained AI metadata and human review. Deeper logs/metrics/traces should use OpenTelemetry with fixed operation/status/failure attributes and bounded export, enabling another destination without changing domains. Existing last-day discovery returned no log service values or APM spans. API/DB latency histograms, request error denominator, outbox backlog/age, worker retries/failures, private Realtime connection health and infrastructure saturation therefore still need privacy-reviewed instrumentation and ingest verification. Do not create fake zero-health panels from absent signals. Native $ai_generation capture, replay/Replay Vision, automated judges/scouts, surveys to users and external alerts have not been activated by this chart task.

Full logs cannot blindly forward request bodies/URLs, SQL text, JWTs, pupil IDs, prompts, answers, pastoral records or exception stacks. Keep academic/audit truth in Cuevo. Dashboard filters are analytics segmentation, not external school authorization. Reviewed exports or separately controlled access are needed for investors/institutions.

Repository verification for this dashboard/documentation increment passes check:docs/test:docs6, check:architecture/test:architecture13 and check:repository/test:repository22. No application implementation, SQL migration or dependency changed in this chart task; a new application build/full MVP aggregate was not rerun or claimed. Sanitized validation/final force-refresh/inline edge evidence is stored under ignored .local/customer-readiness/posthog-chart-expansion-readback.json. The final maintenance plan is [chart expansion](../superpowers/plans/2026-10-03-posthog-chart-expansion.md).

References: [PostHog dashboards](https://posthog.com/docs/product-analytics/dashboards), [SQL filters and variables](https://posthog.com/docs/data-warehouse/sql/variables), [anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events), [metrics](https://posthog.com/docs/metrics/basics) and [AI observability pricing](https://posthog.com/ai-observability/pricing). The founder’s3October installation change and fresh complete repository readback close Cuevo GitHub App access. Complete legacy alternate/server-client disconnection remains an external gap in [operations](posthog.md#legacy-transition-and-remaining-access).
