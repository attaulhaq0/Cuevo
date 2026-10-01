# School and learning verification

Date: 2026-10-01 (Asia/Riyadh). This increment adds real school-authored learning and submissions to the Cuevo foundation. It does not claim completed academic grading, official curriculum validation or MVP exit.

Teacher/admin can create courses, units, lessons, activities and numeric assessments. Course publication is explicit; current enrolled students complete published activities and submit immutable work. Teacher queue reads current assigned submissions. Every command/replay rechecks current tenant, membership, entitlement and object relationship, uses strict inputs and persists idempotent response/audit/outbox atomically. Parent raw submissions remain unavailable.

Fresh verification after a clean synthetic reset:

- Four committed migrations replayed; all 133 synthetic Auth users provisioned.
- `npm run db:test`: 5 files, 134 assertions passed.
- `npm run test:integration`: actual local Auth/Nest/API/Postgres scenario passed, including replay after teacher assignment and student enrollment revocation.
- `npm test`: 169 Vitest tests, 17 web tests and 4 local-runtime tests passed.
- Lint, typecheck and API/Next/worker builds passed.
- `npm run e2e`: 3 tests passed: required login viewports/RTL/accessibility, five real role logins, and teacher course/unit/lesson/activity/publication/assessment → student completion/submission with Arabic mobile/axe checks.
- Independent backend specification/code-quality review passed after five findings were fixed; details in school-learning-code-review.md.

During integration, stable RLS helper self-lookups could not see a new course in INSERT RETURNING; an additive policy correction reads the checked row directly. Review also found replay before current object authorization, unbounded nested reads, overly broad private helper metadata reads, active-class inconsistency and incomplete OpenAPI. Additive scope guards, pre-replay checks, capacity budgets and contract metadata addressed them with regression evidence. Database test tooling is prepared outside per-file rollback transactions to avoid extension races; queue fixtures are isolated transactionally from prior synthetic events.

Remaining limits: course trees cap at 100 nodes and 500KB with explicit 413; browser list pages currently show up to 100 records with no continuation controls; activity confirmation query and persistent SSR session are pending. SIS setup mutations, attendance/timetable/calendar, academic marking/release/evidence, learner-state/worker, live intelligence, intervention/outcome, community and full five-role journeys remain. Missing locked official packs and live AI configuration are still external blockers. A successful learning journey does not establish Gate 5.
