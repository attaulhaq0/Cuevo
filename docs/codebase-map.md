# Cuevo codebase map

Trail public artwork is owned once by [shared characters](../apps/web/shared/characters/README.md): accepted static character/task/material assets and authenticated-only font styles. The registry contains no learner data or reward/AI/permission authority; current feature owners provide typed facts and callbacks. Independent asset QA and Sora1080upscale provenance stay in ignored/external evidence.

Student progression extension: read the [Character Progression System foundation](architecture/character-progression-system.md) and [decision](decisions/2026-10-03-character-progression-foundation.md). Formal levels, track progress, earned character/cosmetic grants and saved presentation choices are founder-authorized requested work, not implemented by this design branch. Backend ownership stays in current Development/contracts/private SQL/worker; frontend remains Development/shared character presentation and the one `packages/ui` Trail system. No empty future modules or separate XP authority are introduced.

Start at root README → AGENTS → [product context map](product/context-map.md) → this implementation map → affected app/domain README → relevant source bundle/tests. The binding layout is [architecture/repository-layout.md](architecture/repository-layout.md); all product documents are indexed under [docs/product](product/index.md).

## Applications

| Area | Entry and owner | Where to change behavior |
|---|---|---|
| Web routing | [apps/web/app](../apps/web/app), [web README](../apps/web/README.md) | Route metadata, layout, errors and page composition only |
| School operations | [school API](../apps/api/src/modules/school/README.md), [school web feature](../apps/web/features/school/README.md) | Current-school setup, scoped identity relationships, attendance, timetable/calendar and explicit privacy policy |
| Curriculum configuration | [curriculum API](../apps/api/src/modules/curriculum/README.md) | Immutable version/reference/programme context and independent overlays; official activation remains reviewed separately |
| Community | [community API](../apps/api/src/modules/community/README.md), [community web](../apps/web/features/community/README.md) | Current class/group discussion, moderation/restriction, safe reactions, approved announcements and private live invalidation |
| Private assets | [asset API](../apps/api/src/modules/assets/README.md) | Staged checksummed private byte storage, current authorized download and retirement |
| Portfolio | [portfolio API](../apps/api/src/modules/portfolio/README.md), [portfolio web](../apps/web/features/portfolio/README.md) | Immutable selected evidence/reflection, exact teacher feedback and explicitly approved parent revision |
| Recognition | [development API](../apps/api/src/modules/development/README.md), [development web](../apps/web/features/development/README.md) | Approved observed-action XP/achievements, optional alias-only class period board |
| Role home | [home feature](../apps/web/features/home/README.md) | Bounded current action queues and permitted evidence context; shell supplies navigation callback. Public `StudentTrailView` consumes current typed facts/callbacks; its illustrative Storybook records are separate from pending runtime binding. |
| School learning | [web learning feature](../apps/web/features/learning/README.md), [API school-learning module](../apps/api/src/modules/school-learning/README.md) | Courses, units, lessons, activities, submission boundaries |
| Academic truth | [web academic feature](../apps/web/features/academic/README.md), [API academic module](../apps/api/src/modules/academic/README.md) | Draft marking, approved objective context, immutable release/evidence/correction and selected learner native report pages |
| Learner progress | [web progress feature](../apps/web/features/progress/README.md), [API learner-state module](../apps/api/src/modules/learner-state/README.md) | Separate source-linked state, observations, factual signals and current staff class evidence summary |
| Improvement | [web improvement feature](../apps/web/features/improvement/README.md), [API improvement module](../apps/api/src/modules/improvement/README.md) | Authorized fixture runs, proposals, decisions, interventions, follow-up and native measurement; gate verification remains in progress |
| Authentication UI | [web auth feature](../apps/web/features/auth/README.md) | Sign-in and denied/unavailable states |
| Application composition | [web shell](../apps/web/features/shell/README.md), [API app.ts](../apps/api/src/app.ts) | Feature navigation and module registration |
| Shared web infrastructure | [shared README](../apps/web/shared/README.md) | Session context, API/retry/pagination, common forms and locale |
| API infrastructure | [platform README](../apps/api/src/platform/README.md) | Identity/current session resolution and actor/database transactions |
| Worker | [worker README](../apps/worker/README.md), [outbox processor](../apps/worker/src/jobs/outbox/processor.ts) | Claimed event processing and bounded recovery; SQL source functions live in migrations |

## Shared packages and data

| Path | Responsibility |
|---|---|
| [packages/domain](../packages/domain/README.md) | Pure authorization and curriculum readiness invariants |
| [packages/contracts](../packages/contracts/README.md) | Browser-safe boundary schemas; import @cuevo/contracts |
| [packages/config](../packages/config/README.md) | Server environment/configuration and minimized analytics mapping |
| [packages/ui](../packages/ui/README.md) | Shared semantic tokens, Button/Status and controlled CuevoIcon primitives; no school-specific policy |
| [supabase/migrations](../supabase/migrations) | Append-only schema, policy, constraints and transactional source functions |
| [supabase/seed](../supabase/seed) | Deterministic synthetic school context; no credentials |
| [supabase/tests](../supabase/tests) | Real SQL/grant/RLS/rollback golden cases |

Progress composes the documented academic native-result UI and improvement outcome UI public surfaces. Support/impact is retrieved from processed immutable events and filtered through current object access. Rubric results preserve criterion levels without a scalar normalization. Technical fixture intelligence is explicitly local-only; it is distinct from live model or academic/customer readiness.

Teacher Insight supplements immutable runs with bounded current course/reference/results, observed sources, prior support/outcomes and authorized learning options. The shared insight contract is browser-safe; server retrieval and selection validation remain in the improvement module. Progress includes a current staff class evidence page, with native sources, separate observed action/support/outcome counts and unknown coverage. Both use private source functions and current scope rather than broad student retrieval.

## Tests and operations

- API unit/contract cases: apps/api/test/unit. Real Auth/API/Postgres journeys: apps/api/test/integration.
- Web unit cases: apps/web/features/*/test and apps/web/shared/*/test; scripts/test-web.ts discovers them explicitly.
- Worker unit cases: apps/worker/test. Pure package cases: packages/*/test. Browser journeys: tests/e2e.
- Architecture guard and fixtures: scripts/architecture; `npm run check:architecture` and `npm run test:architecture`.
- Physical folder, copied-source and tracked-output hygiene: scripts/repository; `npm run check:repository` and `npm run test:repository`. Product source/history placement and links: scripts/docs.
- Build/runtime scripts: root package.json and scripts. Docker: docker/Dockerfile and docker-compose.yml. CI: .github/workflows/ci.yml.
- Local generated credentials, snapshots and verification scratch output: ignored .local. Never use it as authoritative committed documentation.

## Structural move map

The source-code navigation refactor moved API domains into modules, infrastructure into platform, web features into features/shared and worker processors into jobs. Process entrypoints, routes and SQL paths remain stable. The later documentation migration moved numbered product sources into docs/product; registry.json maps old source names to current paths. Historical plans/reports retain their reviewed paths/hashes. See [source-code path migration](architecture/path-migration.md), [product path migration](product/path-migration.md) and [hierarchy verification](reports/repository-layout-verification.md).
