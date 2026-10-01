# School and learning backend independent review

Status: REVIEW COMPLETE — pass for the bounded school-learning backend increment. No unresolved important finding remains in the frozen final artifact. The reviewer did not author the school-learning service/migrations and did not rerun tests or change backend source during this review.

Scope: saved `docs/superpowers/plans/2026-10-01-school-learning.md`, `apps/api/src/school-learning/**`, `packages/contracts/src/school-learning.ts`, migrations `20260930235603_school_learning.sql`, `20261001000056_school_learning_visibility.sql` and `20261001000305_school_learning_scope_guards.sql`, and relevant API/SQL tests. Source requirements include 13/14/17/38/39/43/51/61/77/81.

Frozen artifact: `.local/review-school-learning.patch`, SHA-256 `819F4923E6B2854565F0021864A76DDB917E2275E78C37ED305CD1C022F4FC74`. The reviewer read the final implementation, additive corrections, tests and backend report, and checked the final artifact includes those corrections. This is an independent manual review, not a CodeRabbit result.

## Final specification verdict

**Pass for this increment.** The implementation supports curriculum-neutral school-authored course/unit/lesson/activity authoring, current student completion, teacher-defined numeric assessment and immutable student submission. It reuses the existing identity/current-session boundary and current school membership; every command checks the current operation entitlement and target scope inside its transaction before replay or mutation. Database grants, RLS and tenant-safe compound foreign keys add enforcement. Audit, outbox and stored response commit with the domain mutation.

The detailed tree has an intentional temporary capacity limit of 100 total unit/lesson/activity nodes and 500 KB serialized lesson/activity content, returning explicit 413 without partial success. The parent accepted this bounded small-vertical-slice behavior. It does not satisfy future large-course child pagination; the implementation report states that limit clearly. No academic result release, official curriculum mapping, intelligence or MVP completion is claimed.

## Final quality verdict

**Pass for integration, with the documented limits below.** Strict Zod schemas reject caller-supplied authoritative fields; SQL values are parameterized. The command dispatch keeps shared authentication and transaction helpers. Normalized errors and no-store responses preserve privacy. Scoped privileged helpers use an empty search path and current tenant/object checks. The correction uses course-row fields for INSERT RETURNING while preserving active-class denial. Current source exposes the request, pagination, idempotency, response and common error contract through OpenAPI.

The author reports 14 backend tests passing without skips and 134 real SQL checks passing. This reviewer inspected the evidence and test bodies but did not independently execute them, per the parent instruction. The real API scenario now revokes the successful teacher assignment and student enrollment, asserts replay is denied through HTTP, and restores fixtures in finally. Tests also exercise changed fingerprints, duplicate submission, strict malformed input, foreign tenant and parent denial, failed-command retry, the generated document, and oversized detail refusal.

## Remediation verified in the final artifact

1. `service.ts` calls `authorizeCommand` before `internal.begin_command` or completed replay. Its SQL combines current target predicates with `has_entitlement` for learning/assessment, closing stored-response access after relationship or entitlement loss. Actual HTTP replay revocation assertions supplement the pure control-flow regression.
2. Detail queries use limits with an overflow sentinel and cumulative node/content budgets. It throws a documented `LEARNING_DETAIL_TOO_LARGE` 413 rather than returning a truncated tree. The bounded nested query pattern is acceptable for the current 100-node slice; later pagination should replace it for larger courses.
3. The scope-guard migration replaces raw `*_course` lookups with current tenant/course read checks and an assessment entitlement check where appropriate. Direct API role calls no longer retrieve another context's parent IDs. Fixed search paths and Data API execution denial remain intact.
4. `active_class` is included in the row-based course SELECT policy, aligning archived class denial with the existing content helper without reintroducing the stable self-lookup defect.
5. Controller metadata derives strict POST schemas from Zod and declares list parameters, required command keys, response shapes, school selection and error schemas. The generated-document regression verifies representative course request/list contracts.

## Integration and verification limits

The parent still needs clean migration replay, browser teacher/student journeys, Arabic/mobile/accessibility checks and the final repository suite. The integration suite's `CUEVO_REQUIRE_INTEGRATION=1` guard must be enabled in the integration/release stage after bootstrap so missing local fixtures cannot turn into a passing skipped suite. SQL and real API revocation tests must run sequentially because the latter briefly changes authoritative fixture relationships.

No concurrency stress, curriculum academic acceptance, private Storage/Realtime, teacher marking, evidence release, learner state or intelligence workflow is certified by this review. These are subsequent scopes, not unresolved defects in this assigned bounded increment. Course detail over the documented capacity remains unavailable until a paginated navigation contract is implemented.

## Historical findings on the initial snapshot — all addressed above

### [P1] Revalidate current object scope before completed replay

`apps/api/src/school-learning/service.ts:59–63` reserves the idempotency key, then returns its stored response when COMPLETED before calling the object-scoped mutation path. Current authentication, membership and school-context entitlement are checked, but revoking a teacher assignment or student enrollment does not remove those facts. The actor can replay the original successful request and receive its stored course, reflection or submission response even though a fresh read/write is denied by RLS. Stored submitted content is new delivery of protected data after relationship revocation.

Authorize the target object using the current course/class/subject relationship in the same command transaction before returning a completed response. Apply that rule to every command, including course/assessment creation bodies and child target IDs. Regression cases must replay existing course/lesson/submission/completion requests after revoking assignment/enrollment and assert denial with no returned stored content.

### [P2] Bound the nested course-detail query

`apps/api/src/school-learning/service.ts:46–49` loads every unit, then every lesson and activity, with a query per unit/lesson and no LIMIT. Valid sequence values permit thousands of children and lesson bodies up to 50 KB. A single authorized request therefore scales without a bounded response or query count, bypassing the API's list pagination and risking memory/latency exhaustion. The nested response contract should explicitly provide bounded pages or a documented bounded preview with continuation and accessible overflow handling; silent truncation would hide learning content.

### [P2] Scope directly callable privileged hierarchy lookups

Migration `20260930235603_school_learning.sql:36–38,52,82` defines and grants API execution of SECURITY DEFINER helpers `unit_course`, `lesson_course`, `activity_course` and `assessment_course`. They accept arbitrary school/child IDs and return parent course IDs without checking the current actor or requested school. Their policy callers add authorization, but direct runtime-role calls bypass that layer. This violates the declared private helper rule and permits cross-school relationship metadata queries if a runtime query path reaches them.

Use helpers that return data only for the current authorized tenant/object, or remove direct runtime execution and expose narrowly scoped authorized predicate wrappers. Keep the fixed search path and explicit grant deny boundary. Add direct helper tests for a foreign school, unknown context and revoked relationship.

### [P2] Preserve active-class denial in the course visibility correction

Migration `20261001000056_school_learning_visibility.sql` correctly avoids stable self-lookups during INSERT RETURNING, but its student/parent/coordinator SELECT branches omit the active-class check present in `can_read_course`. The foundation `can_view_class` checks assignments/enrollment and does not itself check class status. Course metadata may remain visible after class archival while child content is hidden through the older helper. Preserve active-class enforcement using the row's class ID without a self-lookup on the newly inserted course, and test published course reads after class archival.

### [P2] Include the frozen contract in generated OpenAPI

`apps/api/src/school-learning/controller.ts` declares bearer authentication but accepts raw Fastify request bodies/query fields without request DTOs or operation body/query/header/response schema metadata. The generated OpenAPI can list paths while omitting validated POST fields, required Idempotency-Key, pagination and response/error contracts. Expose the frozen runtime contract in OpenAPI and verify representative command/list schemas before claiming the module contract is implemented.

## Positive observations

Current source reuses shared Supabase session verification and current membership resolution, applies strict Zod input validation, uses parameterized query values, constrains authors and submission roles, returns normalized errors and no-store responses, and wraps domain mutations with idempotency/audit/outbox in one actor transaction. Learning rows use composite school foreign keys, explicit grants and forced RLS. Parent submission access is denied and submission/completion updates are immutable. Teacher-defined numeric assessment context does not introduce official thresholds or academic claims.

The implementation agent completed the scoped real Auth/API/Postgres and pgTAP cases and reported the final green commands in `docs/reports/school-learning-backend.md`. A passing screen, SQL suite or happy-path API journey alone is not a full MVP exit.
