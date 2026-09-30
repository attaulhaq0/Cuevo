# Cuevo foundation manual code review

Date: 1 October 2026. Review scope: `apps/api/**`, `packages/config/**`, `packages/contracts/**`, `packages/domain/**`, their tests, and the saved foundation design/plan. Database migration review is deferred until the database implementation report is green. Web, worker and deployment files are outside this review scope.

Artifact reviewed: `.local/review-foundation.patch`, SHA-256 `A1723A1E9EF91082E110839BCB5267B58F8552878B3C3098B9B3B64E0B327920`, with the source snapshot and working files used for line references. This is an internal manual review, not CodeRabbit output. The reviewer previously authored Task 3 domain code, so the domain portion is a second-pass self-review; API/config review is independent of its implementation.

No passing tests were rerun. The integrator reported successful lint, typecheck, build, 105 domain cases, eight identity cases, four HTTP cases and four config cases. Those reports support the review but do not substitute for the missing integration checks identified below.

## Specification compliance verdict

**Changes required for the current foundation readiness and recovery behavior.** The architecture, verified-user/current-membership authorization path, tenant/entitlement/role boundaries, private server database path and curriculum source-lock constraints follow the design. However, the readiness endpoint currently declares success based on insufficient dependency checks, and idle database failures can terminate the process. These conflict with Task 4 dependency readiness and the recovery behavior required by the design.

No current authoritative mutation endpoint exists. Idempotency/outbox execution is intentionally deferred to the next domain-command increment, so absence of mutation idempotency in this read-only API is not a defect in this scope.

## Task quality verdict

**Changes required.** The implementation is concise and passes the reported foundation tests. Session verification is performed by Supabase Auth before JWT claims are inspected, the auth subject is compared, current stored session checks precede membership resolution, requested school IDs are treated only as a selector, and exact entitlement checks follow persisted roles. Protected `/v1/me` responses use `no-store` and sanitize unexpected exceptions. The transaction helper parameterizes actor/school context with transaction-local settings and rolls back failures.

The current tests do not cover configured-but-unreachable Auth, reachable-but-unmigrated/privileged database connections, idle pool errors, or malformed configured origin/base URLs. These are current boot/recovery conditions, not future learning-feature gaps.

## Actionable findings

### [P1] Handle idle PostgreSQL pool errors without terminating the API

Location: `apps/api/src/database/database.ts:5`.

The constructed `pg.Pool` has no `error` listener. When an idle connected client loses its PostgreSQL connection, `pg-pool` removes that client and emits `error` on the pool (`node_modules/pg-pool/index.js:52`). An unhandled EventEmitter error terminates the Node process. A database restart after a successful request can therefore kill the entire API instead of preserving liveness and returning dependency-unavailable responses.

Add a sanitized pool-error handler at construction, leave removal of the failed connection to pg-pool, and verify that a new query can reconnect after the database returns. Do not log the raw error object because it may contain connection or query details.

### [P2] Check actual authentication and application schema readiness

Locations: `apps/api/src/app.ts:27`, `apps/api/src/database/database.ts:16`.

`database.ready()` checks only `SELECT 1`; authentication readiness checks only that URL/key strings are populated. A reachable empty database, missing authorization functions, denied runtime grants, an owner/BYPASSRLS connection, or an unreachable Auth service can produce `/health/ready` 200 while every `/v1/me` request fails or the mandated constrained database boundary is absent.

Use bounded actual Auth health checks and database checks for required schema/function existence, runtime execution privileges and a non-owner/non-BYPASSRLS runtime role. Keep missing dependencies 503 and distinguish liveness from readiness. Add configured-outage and missing-schema cases; generic SQL reachability is insufficient evidence of application readiness.

### [P2] Reject malformed base URLs and browser origins before application boot

Location: `packages/config/src/index.ts:6`.

`z.url()` accepts URLs with arbitrary schemes and with path/query/fragment/userinfo. For example, `SUPABASE_URL=ftp://host` passes the environment parser but fails Supabase client construction. `API_ALLOWED_ORIGIN=https://app.example/login` passes parsing but differs from the browser's `Origin: https://app.example`, causing all intended browser API access to be denied. The production check validates only presence, so these configurations are treated as complete.

Require HTTP(S) service base origins without credentials, query or fragments, and require an exact browser origin without a non-root path. Use HTTPS in production for public browser/Auth origins while preserving explicit HTTP localhost development. Validate PostgreSQL connection schemes separately and redact values in configuration diagnostics.

## Follow-up verification boundary

After fixes, rerun affected configuration/API tests and lint/typecheck. The database agent/integrator should verify session revocation, memberships and transaction-local actor/school isolation against the completed constrained database runtime role. These source changes alone cannot establish database/RLS or end-to-end authentication readiness.

Official England, Cambridge 0580 and Qatar curriculum artifacts remain `UNKNOWN/REQUIRES_REVIEW`. Domain validation tests establish rejection/metadata semantics only and cannot provide academic source approval.

## Implemented remediation and verification

The original findings above refer to the reviewed snapshot. Remediation changed `apps/api/src/database/database.ts`, `apps/api/src/identity/supabase-auth.ts`, `apps/api/src/app.ts`, `packages/config/src/index.ts`, and their tests. The same idle-error defect was fixed in the worker through `apps/worker/src/database.ts`, its test and the existing main entry point.

- API and worker pools consume idle connection errors and log only fixed service/error codes. pg-pool retains responsibility for removing failed clients; subsequent checks can reconnect. No raw database error is logged.
- API readiness checks actual Auth `/auth/v1/health` with a three-second timeout, no redirect and no user token. It probes the current runtime role for NOSUPERUSER/NOBYPASSRLS and absence of ownership of private tables, functions or schemas. Required app/internal objects, authorization function existence and runtime schema/function privileges must be present. Both required authorization functions are executed without an actor to confirm they work. Failure reports only booleans/503. Readiness responses are `no-store`.
- Configuration requires HTTP(S) base/browser origins with no credentials, non-root path, query or fragment, normalizes a root slash to the exact origin, and requires HTTPS for production browser/Auth origins. Development HTTP loopback remains valid. PostgreSQL connections require the postgres/postgresql scheme, hostname, username and database. Role aliases are not guessed; actual role capabilities are checked by readiness. Config errors include variable names only.

The red-first regression command produced **25 failures and 13 passes across four files** before remediation. The final affected-suite run passed **46 tests in five files**: config 23, API database 5, HTTP 8, identity 8, worker 2. Tests replace external fetch/query operations while exercising the real HTTP adapter and policy code; they do not certify database contents through a mock.

Final checks, all exit 0:

```text
node node_modules/vitest/vitest.mjs run packages/config/test apps/api/test apps/worker/test
  5 files passed; 46 tests passed

node node_modules/typescript/bin/tsc --noEmit
  no diagnostics

node node_modules/eslint/bin/eslint.js packages/config apps/api apps/worker
  no diagnostics

git diff --check -- apps/api packages/config apps/worker docs/reports/foundation-code-review.md
  no diagnostics
```

Live local checks used ignored `.env.local` without printing any credentials. Direct dependency probe returned `{configured:true,database:true,authentication:true}`. An actual `createApp()` HTTP injection returned `/health/ready` 200 with `{status:"ready",database:true,authentication:true}` and `Cache-Control: no-store`. This proves the current local role/schema/Auth health path; it does not claim browser login, session revocation or full MVP verification.

Current remediation verdict: the three reported findings are addressed with targeted red/green regression evidence and a local readiness check. Root integration and database/RLS review remain separate gates. Worker processor status remains `not_configured`; this remediation fixes its pool recovery only and does not certify worker event processing.
