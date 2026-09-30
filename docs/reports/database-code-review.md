# Cuevo database foundation manual review

Date: 1 October 2026. Independent review scope: `supabase/migrations/20260930234201_foundation.sql`, `supabase/tests/*.sql`, `supabase/seed/seed.sql`, `docs/reports/database-foundation.md` and the saved foundation plan/design. The reviewer did not author the migration, seed or SQL tests. No source edits or database test reruns were performed during this review.

Artifact reviewed: `.local/review-database.patch`, SHA-256 `0F691E8353E6CFCD57FA55382CAA282904DB332F34BBE132D63F2CF5EE98AFE3`. The patch also contains local configuration and identities; conclusions below concern the assigned migration/test/SQL-seed scope.

## Specification compliance verdict

**Pass for this foundation scope; no actionable important defects identified.** The migration implements private app/internal/authorization schemas, explicit Data API denial, non-owner/non-BYPASSRLS runtime roles, tenant-safe composite relationships, current membership/entitlement/relationship checks, forced RLS, immutable audit, transactional idempotency/outbox infrastructure and deterministic synthetic fixtures. It does not invent curriculum or academic grading rules or create premature official readiness claims.

The API credential and transaction-local verified actor are the declared trust boundary. Current-session verification is performed through the restricted authorization helper before API protected work; SQL RLS adds current membership, tenant, entitlement and relationship enforcement. This review does not reinterpret the trusted server SQL credential as a public client authentication mechanism.

## Code quality verdict

**Pass for this foundation scope.** Private privileged helpers use fixed empty search paths, schema-qualified objects and constrained EXECUTE grants. RLS helpers avoid recursion without exposing privileged raw data functions to Data API roles. Context errors fail closed. Outbox and idempotency helpers use stored context rather than caller-supplied tenant/actor arguments.

The tests exercise real SQL visibility and denial, revocation, mutation grants, immutable audit and durable-state transitions. The integrator reports 108 local checks passed, including red/green corrections for NULL bounds and private default function grants. This reviewer inspected those cases but did not independently rerun them, as instructed. The earlier implementation report was still marked pending at review time; report refresh is an evidence-maintenance item, not a source-code finding.

## Reviewed security and recovery evidence

- **Roles and grants:** migration lines 4–32 and 314–321 keep runtime roles constrained and revoke schema/table/function access from `public`, `anon`, `authenticated` and `service_role`. Global default function EXECUTE is revoked for the migration owner, addressing PostgreSQL's global PUBLIC default separately from per-schema grants. Migration-created tables are forced through RLS at lines 295–300.
- **Tenancy and relationships:** composite school keys prevent cross-school class, enrollment, teacher and parent links. Helpers at lines 126–168 verify active schools, current memberships, dated entitlements and current approved parent/teacher/enrollment relationships. Self scope is limited by the actor's valid school membership; teacher/parent targets additionally require active student membership. RLS exposes ordinary directory/class context only within the corresponding scope.
- **Session checks:** `is_current_session` at lines 170–174 verifies session ownership, expiry, deletion and ban status. Session tests cover another actor's token, expiry, banned users, deletion and missing session IDs. The API must continue invoking this helper before every protected request; it is separate from database row-scope checks.
- **Privileged functions:** all SECURITY DEFINER helpers pin `search_path=''`; owner-powered queries are schema-qualified. Internal tools remain granted only to the API/worker roles. The API must schema-validate purpose-specific metadata and authorize domain commands before invoking generic infrastructure tools; these helpers are not public mutation endpoints.
- **Idempotency:** lines 213–237 scope reservations by school, actor, command and key, require a SHA-256 fingerprint, lock the selected reservation and preserve completed responses. Repeated keys with different input are rejected. Explicit NULL fingerprints/completion values cannot bypass the checks. A same-transaction failure removes the reservation along with other writes.
- **Audit:** lines 176–184 and 238–262 stamp context, constrain payloads, deny raw API access and prevent UPDATE/DELETE/TRUNCATE with immutable triggers. Missing metadata/identity falls through to NOT NULL/table constraints rather than becoming an accepted partial record. The suite checks API and owner update/delete denial.
- **Outbox:** lines 248–257 deduplicate by school/key and compare actor/type/entity/version/payload on replay. Lines 264–292 bound batch/lease/retry parameters, atomically claim using `FOR UPDATE SKIP LOCKED`, rotate random lease tokens, reject stale/expired acknowledgements, cap attempts and preserve failures for inspection. NULL batch/lease/retry values are explicitly rejected. Tests cover replay mismatch, retry, stale token, expiry, exhaustion and rollback.
- **Synthetic seed:** IDs and school populations are reproducible. All people are marked synthetic. Reference-school counts match specification 77; the second tenant provides isolation fixtures. Subject names are school context, not official standards, syllabus content or regulatory requirements.

## Limits and documentation follow-up

The inspected SQL suite proves its sequential fixture cases. It is not evidence of concurrency stress, database outage recovery, real child-data governance, private Storage/Realtime implementation, academic result release or full MVP readiness. Those later scopes were not reported as current defects.

Refresh `docs/reports/database-foundation.md` with actual green commands/counts and the implemented context contract. Its text currently says the API sets `app.session_id`, while the examined migration's context helpers use `app.actor_id` and `app.school_id`, and current-session verification is an explicit API prerequisite through `is_current_session`. Aligning that description avoids future integrators believing session enforcement occurs automatically in the row policies.

No production/compliance or CUSTOMER_READY curriculum claim follows from this foundation review.
