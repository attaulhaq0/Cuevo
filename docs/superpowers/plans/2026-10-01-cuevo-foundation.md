# Cuevo Foundation Implementation Plan

> **For agentic workers:** Use Superpowers task implementation, specification review and verification before completion. Execute autonomously under the founder's explicit instruction.

**Goal:** Establish a runnable, secure and bilingual Cuevo foundation that later learning-loop increments can build on.

**Architecture:** Next.js 16 → NestJS/Fastify → private Supabase Postgres → transactional outbox → worker. Shared npm workspace packages hold domain invariants, contracts, configuration and UI tokens.

**Tech Stack:** TypeScript, npm workspaces, Next.js 16, NestJS, Fastify, PostgreSQL 17/Supabase, Zod, Vitest, Playwright, Docker Node 24 LTS.

**Spec:** docs/superpowers/specs/2026-10-01-cuevo-foundation-design.md and numbered repository source specifications.

## Global constraints

- Company: E Deviser. Product: Cuevo.
- Next.js 16 web → NestJS + Fastify API → PostgreSQL / Supabase → Outbox → Worker.
- Never trust frontend hiding as authorization.
- Every protected request must verify tenant, entitlement, role, relationship and object scope as applicable.
- English and Arabic/RTL are first-class.
- Every important mutation is idempotent.
- Every important academic mutation is auditable.
- Database migrations are the source of truth.
- New tables must not be automatically exposed to the Data API.
- Curriculum, jurisdiction and quality/accreditation are separate axes.
- No official curriculum content without source-locked artifacts and known rights.

## Task 1: Reproducible workspace and deployment skeleton

Files: root package.json/package-lock.json/tsconfig.json/eslint.config.mjs/vitest.config.ts; app/package manifests; .env.example; docker-compose.yml; docker/Dockerfile; .github/workflows/ci.yml; scripts/.

Produces npm run dev, test, lint, typecheck, build; local Supabase at ports 56321–56327; ignored local env generation; CI checks without secrets.

- [ ] Initialize local main with verified origin; commit original specification pack and naming decision.
- [ ] Pin runtime/dependencies and npm package manager. Set up workspace scripts.
- [ ] Validate required environment names without printing secrets; all live integrations fail closed when unavailable.
- [ ] Run dependency install, workspace typecheck and health startup.

## Task 2: Database identity and tenant foundation

Files: supabase/config.toml; supabase/migrations/202610010001_foundation.sql; supabase/seed/; supabase/tests/; scripts/db-*.

Produces private app, internal and authorization schemas; schools, memberships, current parent/class/enrolment relationships, academic structure, entitlements; audit, idempotency and outbox storage. Dedicated runtime roles have no owner/BYPASSRLS privilege. Tenant-owned relationships use composite foreign keys. Data API roles have no business schema grants. Local deterministic reference-school fixtures use 77 population (1 admin, 2 coordinators, 8 teachers, 60 students, 60 parents, 4 year groups, 6 classes, 8 subjects) and a second-school denial fixture.

- [ ] Write database cases for anonymous denial, cross-school denial, student self scope, current parent relation, teacher assignment, coordinator/admin scope, revoked membership/relationship and immutable audit.
- [ ] Verify the cases fail before implementation.
- [ ] Implement committed migration and deterministic seed with synthetic identities only.
- [ ] Reset from clean migrations; run database cases and inspect grants/RLS.

## Task 3: Domain authorization and curriculum readiness

Files: packages/domain/src/authorization.ts, curriculum.ts, errors.ts; packages/domain/test/authorization.test.ts, curriculum.test.ts.

Produces validated ActorContext/Role and capability scopes; requireCapability and requireLearnerScope deny helpers; curriculum lifecycle/fact/readiness types and pure pack validation. Missing/unknown input cannot become false or zero.

- [ ] Test forged role, cross-school, disabled entitlement, expired/revoked relation, unassigned teacher and incomplete official pack promotion.
- [ ] Observe red tests.
- [ ] Implement minimal policy and pack validation from specs 05/06/07/39/69/76/81/85.
- [ ] Run targeted tests and typecheck; review exported interfaces before integration.

## Task 4: Nest API and worker foundation

Files: apps/api/src/identity/, database/, health/, app.module.ts, main.ts; apps/worker/src/; packages/contracts/src/; packages/config/src/.

Produces GET /health/live, GET /health/ready, GET /v1/me with verified current session/membership; normalized request-ID error contract. Worker health reports database/outbox state. Authentication errors and database outages are distinct; protected endpoints fail closed. Production refuses local test-auth modes and unapproved origins.

- [ ] Write API tests for missing/invalid/revoked session, forged school, unavailable dependencies and sanitized errors.
- [ ] Observe failures then wire verified Supabase Auth and current database context.
- [ ] Add transaction helper setting local actor/school context and ensure rollback clears it.
- [ ] Verify API/database positive and denial cases, correlation IDs and health behavior.

## Task 5: Shared accessible bilingual shell

Files: apps/web/app/, apps/web/components/, apps/web/messages/, packages/ui/src/tokens.css, .storybook/; tests/e2e/foundation.spec.ts.

Produces Cuevo login and session-bound workspace; English/Arabic RTL and responsive shell, server/API status and accurate unknown/not-configured states. No fictional learning metrics or completed-gate claims.

- [ ] Build translation-key and logical-CSS shell with accessible labels and keyboard focus.
- [ ] Wire Supabase sign-in and /v1/me; derive role/navigation from verified server response.
- [ ] Browser-check loading, denied, unavailable, locale direction, 390/768/1024/1440 widths and reduced motion.
- [ ] Run accessibility checks, build and bundle secret scan.

## Task 6: Foundation evidence and continuation

Files: docs/implementation-status.md; docs/decisions/; docs/reports/foundation-verification.md; README.md runtime instructions.

- [ ] Review implementation against specification and inspect committed diff.
- [ ] Run lint, typecheck, unit, API, database and browser checks plus build.
- [ ] Record exact pass/fail and external blockers; commit coherent foundation.
- [ ] Continue school/learning → academic release → state/habit → intelligence/approval → intervention/outcome → community/parent/roles → curriculum validation → Gate 5. Each domain receives its own task brief and relevant golden cases before implementation.
