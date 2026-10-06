# Current-school operations backend

Date: 1 October 2026. Scope: Technical MVP Task 3 backend. Product Cuevo by E Deviser. Root coordinates migration application, runtime registration, web implementation and independent verification.

createSchoolController(identity,database) registers /v1/school. GET /context returns current school details, conservative current policy, labeled school intelligence approval flags and bounded authorized attendance/timetable/calendar pages. GET /:resource exposes years, terms, year-groups, classes, subjects, people, enrollments, teacher-assignments, guardian-relationships, attendance, timetable, calendar, report-periods, policies and entitlements. Lists enforce school.operations, current role and object/learner/class filters, a maximum 100 rows plus sentinel, 500KB response budget and validated UUID cursors. Entitlement listing is read-only.

POST commands are separate current-school actions for details, years/terms/year-groups/classes/subjects, /people/:id/configure, enrollments, teacher-assignments, guardian-relationships, attendance, timetable/calendar/report periods and policy approvals. API schemas reject arbitrary authority fields and SQL validates purpose-specific fields/target scope before idempotent replay. Setup/access/policy commands require current admin; attendance permits scoped current teacher/admin. Every successful command commits mutation, audit, outbox and immutable receipt together. Current sessions/memberships are resolved by the existing IdentityService before requests; no frontend role hiding is used as authorization.

This increment administers already provisioned same-school identities. It never creates a tenant, creates an Auth account, accepts an unknown UUID or attaches another tenant's Auth user. Role/status/assignment/enrollment/guardian changes require confirmAccessChange true; admin cannot remove their own current access and the last current admin is protected. First synthetic tenant and identity population remains privileged local bootstrap. Official curriculum, grades, entitlements and provider approvals are unaffected.

Attendance records present/absent/late/excused as a school fact. Corrections require expectedRevision plus a reason and append immutable linked history. Missing attendance remains unrecorded rather than absent. Parent/student reads exclude staff notes. Attendance is not a learner intelligence/character proxy. Timetable entries require current teacher/class/subject assignment and deterministic overlap denial; calendar and report periods preserve school scope/date windows. Parent attendance/upcoming access is off when no approved policy exists and current guardian relationship governs later reads. Versioned policies record approving admin/reason; unrestricted student messaging stays false. Recognition/analytics flags do not themselves enable an unimplemented delivery or grading behavior.

CLI generated 20261001085412_current_school_operations.sql. It reuses the foundation tables for school configuration and creates only private policy/attendance/timetable/calendar/report-period history. Explicit RLS/grants deny raw writes and Data API/worker access. Current admin and purpose-limited private source functions perform the mutations; schemas remain unexposed.

Verification by this worker:

- Three service cases failed against an empty service before implementation; final seven school service/contract tests passed.
- API TypeScript build and targeted ESLint passed.
- Shared root typecheck temporarily reported an unrelated web import-extension diagnostic during concurrent UI work; no web/parser import was modified by this worker.
- SQL070 and real Auth/API school-operations-api.test.ts are written and await root's scheduled DB/runtime run. They cover same-key replay, changed fingerprints, term containment, foreign/unprovisioned identity denial, self-admin protection, confirmation, teacher setup denial, attendance revision/history, conservative parent approval/revocation, no academic mutation and private grants.

No migration application/reset/seed/runtime start or DB-mutating test was performed here. SQL syntax, runtime policies, clean replay and browser/accessibility/RTL/mobile are unverified until integrated execution. Do not infer Task 3 or MVP completion from the unit/build evidence.

Read sources: 07 school modularity, 14 SIS, 18 reporting, 38 API/events, 39 governance, 44 vertical slice, 61 deny matrix, 64 demo and 81 grants/RLS, plus root/scoped API instructions, current repository layout, Technical MVP decision/plan and the existing foundation/domain tests/SQL. Source curriculum/rights/customer/production readiness remains separate.

## Current receipt and membership corrections

Root integration identified the Nest default POST201 response while the established command receipt contract expects200. A real Fastify/Nest HTTP regression failed201 before adding explicit response200; all eight school unit/HTTP cases then passed. Duplicate Idempotency-Key metadata on details was removed. Typecheck and targeted ESLint passed.

Independent review identified that admin attendance authorization checked target role/status but omitted target membership effective dates. Additive CLI migration20261001091104_school_attendance_current_membership.sql now checks the learner's current effective_from/effective_to alongside current enrollment/class. SQL070 adds expired learner new-write/replay and future learner denial cases. The applied85412 history remains untouched. This worker did not apply the correction or run SQL; root schedules its database verification.

Repeated live integration left prior attendance for the fixture date. The integration fixture now reads its existing revision and supplies that exact expectedRevision plus an explicit reviewed correction reason when repeating; it asserts the next two immutable revisions. This preserves concurrency/source checks and allows accumulated synthetic work without assuming an empty attendance history. The change passed TypeScript/targeted lint; root owns the next live execution.
