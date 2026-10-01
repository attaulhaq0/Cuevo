# School and Learning Implementation Plan

**Goal:** Let an authorized teacher create a curriculum-neutral course, lesson and assessment in their assigned class, and let an enrolled student learn and submit work using a real Nest API and private PostgreSQL persistence.

**Architecture:** Extend the verified Cuevo foundation. Existing Supabase identity and current membership resolution precede every protected request. All commands use actor/school transactions, Idempotency-Key, fingerprint replay, audit and outbox; RLS and composite tenant foreign keys add enforcement. No direct browser CRUD, AI writes or official curriculum assertions.

**Sources:** 01, 03, 05, 07, 13, 14, 17, 38, 39, 43, 44, 61, 64, 77, 81, 83, 87; domain-foundation and database-foundation reports.

## Frozen REST contract

All responses are JSON; list response `{items:[],nextCursor:null}` with page limits (max 100). UUIDs identify records; request bodies use Zod strict schemas. Errors use `{code,message,requestId}`. Timestamps use ISO strings. Important POST commands require `Idempotency-Key` length 8–200; replay returns original response; differing request with same key conflicts 409.

- `GET /v1/classes` → list `{id,name,yearGroupId}` under current class scope.
- `GET /v1/subjects` → list `{id,name}` under current school scope.
- `GET /v1/people` → list `{userId,displayName,role}` under existing current scope.
- `GET /v1/courses` → list `{id,classId,subjectId,title,description,status,createdAt}` visible through current class relationship.
- `POST /v1/courses` body `{classId,subjectId,title,description}`; assigned teacher only, permitted admin school owner. Creates DRAFT course with command/audit/outbox. Active school and `learning` entitlement required.
- `POST /v1/courses/:id/publish` body `{}`; current authorized course owner, idempotent publication. Students read only PUBLISHED courses.
- `GET /v1/courses/:id` → `{...course,units:[{id,title,sequence,lessons:[{id,title,sequence,body,status,activities:[{id,title,kind,instructions,sequence}]}]}]}`.
- `POST /v1/courses/:id/units` body `{title,sequence}` authorized course teacher.
- `POST /v1/units/:id/lessons` body `{title,sequence,body}` creates published synthetic school-authored lesson. No official references implied.
- `POST /v1/lessons/:id/activities` body `{title,kind:'reading'|'practice'|'assignment'|'quiz'|'reflection',instructions,sequence}`.
- `POST /v1/activities/:id/complete` body `{reflection?:string}` enrolled student self only; unique completion records; practice/revision/reflection observations eventually derive from eligible domain events.
- `GET /v1/assessments` → list `{id,courseId,title,instructions,maxScore,status,dueAt,policyVersion}` under class scope.
- `POST /v1/assessments` body `{courseId,title,instructions,maxScore,dueAt?:string}` creates published numeric School Custom synthetic assessment with policyVersion1. Numeric scale is teacher-defined, no official grade thresholds/attainment mapping.
- `POST /v1/assessments/:id/submissions` body `{content}` enrolled student self only; immutable submitted version and audit. Repeated request is idempotent; different submission while SUBMITTED rejects 409 until teacher returns it in later iteration.
- `GET /v1/submissions` → teacher course queue, student own, parent excludes submissions until separately approved; item `{id,assessmentId,learnerId,content,status,revision,submittedAt,assessmentTitle,learnerName}`. Missing empty is never zero.

## Task 1 Backend

Allowed files: one new CLI-generated migration and relevant supabase/tests; apps/api/src/school-learning/**; packages/contracts/src/school-learning.ts exports. Integrate through `registerSchoolLearning` or Nest controller registration in apps/api/src/app.ts. Shared IdentityService/Database supplied dependencies; do not create alternative auth. Schema rows: courses, units, lessons, activities, activity_completions, assessments, submissions. Composite school references; current teacher/learner/class policies; active membership and entitlements. API role explicit CRUD only needed via RLS; immutable completion/submitted revisions; purpose-specific role rules in server. Seed adds learning/assessment entitlement to synthetic schools through deterministic fixture update. Tests cover cross-tenant/class/learner/parent denial, missing key/unknown fields, replay conflict, duplicate submission, rollback and current relationship revocation.

## Task 2 Browser

Allowed files apps/web/** and packages/ui/**. Consume frozen API contract using current in-memory access token and selected verified school from existing Providers. Student/Teacher/Admin get a Learning navigation action; parent/coordinator authorized reads only where API permits. Teacher class/course forms and lesson/assessment/submission views use real commands. Student submit and activity completion show pending/failure/retry. Never show success until confirmed API response. Retry uncertain commands with original key; offline actions not cached. Translate keys English/Arabic; use shared tokens. Keep school-authored synthetic demo context clear. Do not build new dashboards or official readiness claims.

## Task 3 Integration evidence

API tests with real local Supabase sign-in and constrained PostgreSQL role prove teacher → course → unit → lesson → activity → student completion → assessment → submission; use a clean deterministic seed. Verify unrelated teacher/student/parent/cross-school denial, duplicate command/replay collision and revocation. Browser test repeats real teacher/student journey at desktop and Arabic/mobile. Run migration replay/database tests, typecheck/lint/unit/build, inspect screen, update gate evidence. Academic marking/evidence release stays next task; Gate1 is claimed only if the critical school/learning paths work.
