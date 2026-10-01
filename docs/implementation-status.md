# Cuevo implementation status

Date: 2026-10-01 (Asia/Riyadh). Company: E Deviser. Product: Cuevo.

The goal is active. MVP exit is not verified. This document records evidence rather than planned capabilities.

## Initial inventory

- 92 Markdown specifications plus MANIFEST.json; no application or executable tests at start.
- GitHub attaulhaq0/Cuevo exists, public and empty. Local main initialized with that origin.
- Supabase Cuevo mqxdjvsyckzocokuikmx: healthy development project, Singapore, Postgres 17; no app tables/migrations/buckets.
- PostHog Cuevo project 393668 in Edeviser organization: connected; SDK credentials not locally configured.
- Docker healthy; unrelated Edeviser-Kiro services use 5432x. Cuevo uses separate 5632x.

## Gate evidence

| Gate | Status | Evidence |
|---|---|---|
| 0 Architecture | IN_PROGRESS | Design, monorepo, private database, API/worker health, tokens and local bootstrap verified; broader deployment/threat documentation pending |
| 1 School + Learning | IN_PROGRESS | Five-role sign-in and teacher → course/lesson/activity/assessment → student completion/submission verified; SIS setup/daily operations remain |
| 2 Academic Truth | IN_PROGRESS | Numeric marking/release/evidence/correction/approved parent flow verified; rubric and full academic cases remain |
| 3 Intelligence Loop | IN_PROGRESS | Restricted worker, five-dimensional state and neutral practice/reflection signals verified; proposal/approval/intervention/outcome remain |
| 4 Experience | NOT_IMPLEMENTED | Five role journeys not verified |
| 5 Verification | NOT_VERIFIED | Exit suite absent at start |

## Critical external blockers

1. England selected subject, Cambridge IGCSE Mathematics 0580 and Qatar official requirement bundles lack local dated sources, known rights, normalized artifacts and academic approval. Implement generic School Custom synthetic cases; official readiness remains REQUIRES_REVIEW.
2. No configured AI provider secret or approved provider data-policy configuration. Live-model evaluation cannot pass until those exist. Do not fabricate a secret or claim fixture outputs prove production AI.
3. Production environment, data residency/legal acceptance, academic sign-off and restore drill are unverified. Singapore development does not establish Qatar compliance.

## Infrastructure concerns discovered

Remote Supabase default public-schema grants expose new objects to anon/authenticated/service_role. An existing public.rls_auto_enable SECURITY DEFINER event helper is executable by anon/authenticated according to advisors. Local committed migration hardens postgres-owned defaults, private schema/table/function grants and runtime roles; 108 local database assertions passed. Remote configuration is not changed yet. Remote Data API on/off status is UNKNOWN; exposed-schema configuration alone does not prove the setting.

## Foundation evidence

See docs/reports/foundation-verification.md and the independent code/database reviews. Clean local bootstrap, real five-role sign-in, 151 domain/config/API/worker tests, 11 web tests, 108 database assertions, builds and responsive/RTL login browser checks passed. Subsequent feature work does not inherit a Gate 5 claim from foundation tests.

## School and learning evidence

See docs/reports/school-learning-verification.md. Clean four-migration replay, 134 database assertions, actual Auth/API/Postgres learning and revoked-replay tests, 169 Vitest + 17 web + 4 runtime tests and three browser tests passed. Academic marking and source evidence release are the next implementation task. Official content remains unverified.

## Numeric academic evidence

See docs/reports/academic-verification.md. Numeric School Custom marking/release/source evidence/correction and explicit parent-approved projection verified. Final 164 SQL checks, sequential real integration, 176 Vitest + 26 web + 4 runtime tests and four browser tests passed. Independent review passed after recoverable-reference marking guard. Live worker/state and rubric support are the next work units.

GitHub CI run 36794876955 passed on commit 3ea5822 (foundation and school learning). Later commits/features require their own CI evidence; this result is not attributed to uncommitted academic work.

## Learner state evidence

See docs/reports/learner-state-verification.md. Clean 14-migration replay, 189 database assertions, nine sequential real integration tests, 183 Vitest + 34 web + 4 runtime tests and five browser tests passed. Worker processes immutable source events and preserves independent state dimensions; revision and outcome remain unmeasured.

GitHub CI run 36796037536 passed on numeric academic commit f9db639; run 36796276441 passed on a1130fc. Uncommitted worker changes require their own hosted checks.
