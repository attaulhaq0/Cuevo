# Learner state and worker independent review

Status: REVIEW COMPLETE — specification and quality pass for the bounded learner-state/restricted-worker increment. No unresolved important defect was found in the final artifact. No implementation source, tests, database or runtime services were changed or executed by this reviewer.

Scope: saved learner-state-worker plan; worker processor/main and constrained pool; learner-state controller/contracts; CLI migrations beginning `20261001002531`, `02733`, `02809`, `02836`, `02931`, `02954` and `03115`; SQL worker golden cases and relevant tests. Source requirements include 04/08/09/11/38/39/42/43/61/81.

Frozen artifact: `.local/review-worker-v2.patch`, SHA-256 `F0974C0EF3CEBE8622AD98AA7FAADE38B61F8D401BEBB29FE19E6386A030E04F`. The reviewer inspected the final source, additive corrections, tests and `docs/reports/learner-state-worker.md`, and checked the artifact includes those changes. This is an independent manual review, not a CodeRabbit report.

## Final verdict

**Specification pass for this increment.** Deterministic processing stays inside the existing outbox/worker architecture and derives state from tenant-matched released result/evidence and immutable activity completions. Academic values, recorded practice/reflection, engagement and unmeasured support/impact are distinct; revision and normalization remain unknown. No trait, intelligence or weak-attainment score is introduced. Parent views remain an approved academic-only projection under current relationship checks.

**Quality pass for integration.** Processing validates opaque leases, current expiry and authoritative source identity before mutation, serializes source deduplication by learner, and atomically commits markers/state/observations/downstream events with successful acknowledgment. Fixed search paths and restricted execution grants preserve the private runtime boundary. Source-consistent bounded arrays, expiry filters, policy-version updates and parent capacity checks address the initial concerns. Oversized histories fail explicitly for review; large-history pagination remains a documented later capability.

## Verification evidence inspected

The author reports the full SQL suite passed seven files and 189 checks, including 25 worker/state golden checks. The reported module run passed seven tests across four files with actual local integration, followed by two additional shared-contract cases passing in the targeted contract run (nine module checks total). This reviewer inspected those cases and outputs in the implementation report without independently rerunning them.

The SQL suite tests wrong/completed/stale token denial, false final acknowledgment rollback, source-object deduplication across event IDs, no duplicate snapshot version, recorded count/null revision separation, unprocessed completion exclusion, finite signal expiry/current rule version, tenant mismatch and raw worker/student/peer/parent access. The real Auth/API/Postgres journey creates fresh practice/completion and released numeric evidence, processes it under the dedicated worker connection, retrieves native state/observation/event provenance, then recreates the processor and confirms counts/version do not duplicate. Current health after queue drain is reported ready with zero pending/failed entries.

These are sequential fixture and restart checks, not two-worker concurrency stress or lease exhaustion under sustained load. The parent still needs final clean migration replay, browser progress/RTL/mobile/accessibility checks and whole-repository verification. OpenAPI state/list generated-client metadata remains incomplete and is explicitly documented; it does not weaken the current runtime authorization path.

## Source observations

The worker delegates privileged data retrieval and processing to a narrow private function accepting only the claimed event ID and opaque lease token. It has no raw academic/learner table grants. The function locks the outbox event, validates PROCESSING state and current unexpired lease, retrieves authoritative result/evidence or immutable completion records by tenant/object, and ignores untrusted payload claims. Source deduplication is serialized per learner and persists independently of event delivery ID.

Processing inserts the source-linked observation/projection/downstream event and completes the original delivery inside one SQL statement transaction. Final acknowledgment must return true; lease expiry causes an exception and rollback of state/markers. Unknown event kinds fail and return to the bounded outbox retry path. Explicit known setup events may be acknowledged without projection. Worker code keeps errors to fixed technical codes and prevents overlapping ticks.

Native academic rows come from current immutable released results whose source events have been processed. Engagement counts similarly include processed immutable completions. Practice/reflection observations derive from explicit activity kinds; revision remains unknown, with no invented click-to-revision inference. Normalized attainment stays null. Support and impact remain unmeasured. Counts identify recorded-only completeness rather than implying all real-world practice was captured.

Current API queries reuse verified session/membership and tenant transactions. State, observation and signal RLS verifies current learner relationships and learner-state entitlement. Parent receives only current school-approved released academic projection; raw habit and signal access is excluded. Parent academic reads have a 101-row sentinel and explicit 100-row/500 KB capacity refusal rather than an unlimited response.

## Initial concerns addressed in current source

1. Old practice signals originally remained ACTIVE forever. Current source computes expiry at the earliest observation leaving the configured window, and the signal endpoint excludes expired rows without requiring a new event. Old snapshots expose stale freshness and unknown development/engagement counts while retaining traceable native academic evidence.
2. The original snapshot aggregate could include an authoritative result whose delivery had not been processed, while sourceEventIds listed only processed events. The provenance correction limits academic/engagement aggregation to processed source identities and retains their event IDs.
3. Original JSON/array bounds were checked only after unbounded aggregation. Current source uses 101/1001 sentinels before large projection arrays and limits event aggregation; oversized projections fail explicitly for review instead of truncating an apparently complete result.
4. Parent projection originally bypassed worker output bounds. The API now enforces the same small-view capacity boundary.
5. Signal policy updates originally reused a stale ruleVersion. The final upsert copies the active policy version together with count/window/source fields.

## Review boundaries

The capacity limits deliberately stop oversized learner snapshots; future scalable/history pagination is not certified. The event worker is not evidence of live intelligence, interventions, XP or full MVP exit. Revision observations need actual revision source relationships before implementation. Synthetic approved window policy is not an academic threshold or psychological label.

The final artifact and author/parent evidence are cited above. This review did not rerun tests or change current fixtures. Concurrency stress, real expiration under load, browser Arabic/mobile/accessibility and clean migration replay still require explicit parent-owned evidence before broader completion claims. The reviewed code and sequential tests establish this bounded deterministic increment, not a full MVP exit.
