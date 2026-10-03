# Edeviser Agent Constitution

You are implementing a production-grade standalone K–12 Learning Experience Platform.

The repository specifications are the source of truth for product intent, domain rules, UX, security and curriculum implementation.

E Deviser is the company. Cuevo is the product.

## Read before coding

Always read:

1. `README.md`
2. `START-HERE-CODEX-PROMPT.md`
3. relevant domain specification
4. relevant tests/golden cases
5. relevant curriculum pack artifacts

Product sources live in `docs/product`. Read `docs/product/context-map.md` to load the common foundation and affected task bundle, and use `docs/product/index.md` or `registry.json` for exact source IDs/current paths. Stored documents are not automatically loaded AI context; explicitly read relevant requirements, tests and approved artifacts. Do not reread all sources for every small task or infer missing authoritative facts from a summary.

For code navigation also read `docs/codebase-map.md`, `docs/architecture/repository-layout.md`, the nearest scoped `AGENTS.md`, and the affected feature/domain README. Scoped instructions add detail; they never weaken this constitution.

For outbox, worker execution, event wakeups, scheduling or asynchronous workflow changes, read `docs/architecture/scalable-event-processing.md` and `docs/decisions/2026-10-02-event-triggered-worker.md`. They record the accepted full-app foundation, locally verified execution and remaining hosted/load gates; domain authority and numbered product requirements remain unchanged.

For analytics, diagnostics or external dashboard changes, read `docs/operations/posthog.md` and `docs/decisions/2026-10-02-posthog-current-repository.md`. Capture must preserve current school approval, fixed environment/data class, source/lease authority, minimized fields and distinct destination receipts. Never relabel synthetic QA/demo/staging as real adoption, upload raw pupil content/console/stack/AI prompts, count missing capture as zero errors, or infer attainment/causation from product event totals. CI/ordinary tests must not silently enable remote ingestion. A project URL/source marker is not an authorization or ingestion firewall; complete legacy disconnection and external viewer isolation require separate evidence.

For student XP, numbered levels, character progression, cosmetics or presentation selection, read `docs/architecture/character-progression-system.md` and `docs/decisions/2026-10-03-character-progression-foundation.md`, plus numbered sources 09/12/15/39/58/63/79/80 and current Development contracts/tests. The founder authorized this bounded foundation; documentation is not implementation acceptance. Extend the existing Development authority and source-backed XP ledger, never create a second award engine or per-school branch. School point/level/presentation policies are explicit, versioned and approved; new policy values never reprice historical awards or silently relevel existing tracks. Class-period rank, school-scoped progression, cosmetic ownership and academic attainment remain separate. Only authorized deterministic processing creates earned transitions/grants; frontend selections and AI never award them. Unknown/disabled progress stays nullable; cosmetic availability changes do not erase valid history. Preserve current scope, original-key retry, private grants/RLS, audit/outbox and append-only migrations. Paid store/wallet/payment flows and unrestricted student AI remain outside this foundation. Use the one Trail design system, English/Arabic, quiet/no-character alternatives and confirmed-receipt feedback.

## Mandatory repository hierarchy rule

Keep the codebase organized by deployable application, domain/feature ownership and dependency direction. This is a binding convention for every human contributor and coding agent. The canonical tree and allowed dependencies are in `docs/architecture/repository-layout.md`; `docs/codebase-map.md` is the navigation entrypoint.

- Keep Next.js route files in `apps/web/app`; put feature UI, models, copy, styles and unit tests together in `apps/web/features/<feature>`.
- Put app-wide browser/session/API/form mechanisms in `apps/web/shared`; shared code must not depend on feature code. Reusable design primitives/tokens belong in `packages/ui`.
- Put API domain controllers/services in `apps/api/src/modules/<domain>` and infrastructure in `apps/api/src/platform/<capability>`. Keep bootstrap composition in `app.ts` and `main.ts`. A folder does not itself establish runtime module isolation.
- Put worker jobs in `apps/worker/src/jobs` and worker infrastructure in `apps/worker/src/platform`.
- Shared packages must not import application implementation. Runtime applications must not import another application. Browser code must not import server configuration or database/runtime infrastructure.
- Cross-feature imports must use documented public surfaces (`model.ts`, `api.ts`, `copy.ts`, `ui.tsx`). Cross-package imports must use `@cuevo/*` exports. Do not create catch-all utility folders, empty future modules, duplicate implementations or barrel files that mix server and browser code.
- Keep unit tests with their owner, API/database journeys in `apps/api/test/integration`, browser journeys in `tests/e2e`, and SQL/RLS tests in `supabase/tests`. Update test discovery when moving tests.
- Every new domain/feature or move must update its README, the codebase map, scoped instructions, imports and affected configuration in the same change. Record new architectural boundaries in a decision record.
- Run `npm run check:architecture` and `npm run test:architecture`, plus checks appropriate to the changed code. These structural checks are required in CI and do not replace security or product verification.
- Keep root Markdown limited to README, AGENTS and START-HERE. Product specifications belong in `docs/product` with a maintained task context map, index and registry; implementation docs belong in the appropriate `docs` area or owner README. Preserve numbered source identities, facts, versions and historical evidence during moves. Applied SQL migration history remains append-only.
- Run `npm run check:docs` and `npm run test:docs` after documentation changes. Every product source move/change must update its registry path/hash, context links and affected entrypoints in the same change. Historical reports resolve former source filenames through the registry and never become competing product rules.
- Maintain one active implementation and source location. Never leave copied source trees, backup/copy folders, empty legacy directories or placeholder modules in authored paths. After a move inspect the physical folders as well as Git, because Git does not track empty directories. Preserve original briefs only in `docs/product/history`; local recovery archives belong in ignored `.local` and are not active context.
- Run `npm run check:repository` and `npm run test:repository` with structural changes. They check repository hygiene alongside architecture/docs guards. Dependencies and generated build/test output stay ignored; never commit generated files or secrets. Intentional forwarding surfaces and historical evidence are permitted when documented. Static duplicate checks do not prove the absence of semantically equivalent implementations; reviewers still inspect ownership and domain boundaries.

## Non-negotiable rules

1. Never invent curriculum facts, standards, syllabus codes, grading rules or accreditation requirements.
2. Never browse live web sources during normal implementation to decide an official curriculum rule. Use source-locked repository artifacts.
3. Never hard-code a school, customer, curriculum or programme into the core architecture.
4. Never solve configuration with duplicate code branches.
5. Never trust frontend hiding as authorization.
6. Every protected request must verify tenant, entitlement, role, relationship and object scope as applicable.
7. Never expose service-role, database credentials or AI secrets to the browser.
8. Never let AI directly write authoritative grades, access permissions, official curriculum mappings or accreditation claims.
9. AI proposals are not authoritative records.
10. Evidence is not inference. Inference is not fact.
11. Missing is not zero. Unknown is not false.
12. Behaviour/habit signals are not academic attainment.
13. Never create one composite student-quality/intelligence/character score.
14. Never infer psychological or character traits from telemetry.
15. Never use attendance, grades, discipline or engagement as an unqualified proxy for intelligence or character.
16. Never create unrestricted social networking for minors.
17. Student communication is school-scoped, permissioned, moderated and auditable.
18. Prefer deterministic rules for deterministic conditions.
19. Use generative AI only where interpretation, synthesis, generation or personalization adds value.
20. Use an orchestrator for multi-step agentic workflows.
21. Every AI tool call must be authorized, purpose-limited and schema validated.
22. High-impact actions require human approval unless an explicit low-risk deterministic automation policy permits otherwise.
23. Curriculum packs are versioned immutable contexts.
24. Curriculum, jurisdiction and quality/accreditation are separate axes.
25. English and Arabic/RTL are first-class.
26. Responsive mobile/web behavior is part of done.
27. Use the design system and tokens; avoid one-off visual systems.
28. Motion must communicate state, hierarchy, progress or feedback and respect reduced-motion preferences.
29. Do not add dashboard cards merely to fill whitespace.
30. Every important mutation is idempotent.
31. Every important academic mutation is auditable.
32. Use a transactional outbox for reliable asynchronous events.
33. Database migrations are the source of truth.
34. Do not rely on automatic RLS alone; grants and policies must be explicitly tested.
35. New tables must not be automatically exposed to the Data API.
36. Protected Realtime uses private channels and authorization.
37. Student/quality/pastoral files remain private.
38. Do not mark a curriculum or quality framework customer-ready until its status and evidence meet the pack acceptance criteria.
39. Do not mark a feature complete because a screen renders or unit tests pass.
40. When uncertain, stop at UNKNOWN/REQUIRES_REVIEW and document the blocker.

## Architecture

Default application architecture:

```text
Next.js 16 web
      ↓
NestJS + Fastify API
      ↓
Domain modules
      ↓
PostgreSQL / Supabase
      ↓
Outbox
      ↓
Worker
```

Do not introduce microservices without an ADR proving a scaling/team/operational reason.

Use the accepted event-driven foundation for new asynchronous capabilities: authorized source mutation, audit and durable outbox commit together; coalesced authenticated post-commit wakes request bounded worker execution; scheduled recovery finds due or abandoned work. Preserve the worker-owned processor and private domain authority. Immediate save confirmation does not wait for derived work, and an event never independently authorizes an AI call or high-impact action. Every new handler must define its event schema/version compatibility, owner, source validation, idempotency, completion/review semantics, privacy, recovery and latency/cost limits. Follow the staged full-app progression in the architecture plan; add durable long-job execution, tenant fairness or another runner only with requirements, measured need and an ADR. A wake is a delivery hint, not a second authoritative task ledger.

## MVP boundary

Build the MVP only until Gate 5 passes.

The MVP proves:

```text
School → Learning → Assessment → Evidence → Learner State → Habit Signal → Intelligence → Approval → Intervention → Reassessment → Outcome
```

plus the minimum social, parent and engagement experience defined in the MVP documents.

## Agent workflow

### Before coding

- inspect repository
- inspect current branch/status
- read relevant docs
- inspect existing abstractions
- identify dependencies
- identify security implications
- identify tests
- write a small plan

### While coding

- preserve existing domain invariants
- reuse components
- keep changes small/coherent
- keep migrations explicit
- add tests with changes
- never silently broaden scope

### After coding

Run as applicable:

- typecheck
- lint
- unit tests
- integration tests
- API tests
- database tests
- RLS/authorization deny tests
- Playwright
- RTL
- mobile viewport tests
- accessibility checks
- AI evaluation harness
- migration verification
- build

## UI rule

### Customer language and record identity

- Never use a raw UUID, shortened hash, database key, enum or internal source/run/version identifier as a primary heading, card title, dropdown label, table label or navigation item.
- Display authorized human context: person/course/assessment/objective name, class/year, date and meaningful revision/status as applicable. Distinguish same-name records with real context, never invented facts or an opaque ID suffix.
- When a needed name/context is missing, show a clear localized unavailable/unknown state and an actionable recovery path. Do not silently replace it with an ID.
- Keep technical identifiers available only inside an explicitly opened source/provenance or support detail when necessary for audit/support. Translate explanations into plain English/Arabic; customers should not need SQL, revisions, request keys or fixture terminology to operate supported workflows.
- Preserve truthful demo, evidence, approval and curriculum limitations using concise customer language. Friendly wording never converts fixture/unverified content into live/official claims.
- Review every affected role/screen and test representative primary labels, duplicates and unknown states. A screen that renders is not customer acceptance.
- Keep acceptance-test records out of customer demonstrations. Restore the guarded synthetic reference-school environment after tests; never sanitize or overwrite customer-authored content to hide technical test titles.
- Keep server HTML and the client's first render deterministic. Pass locale/snapshots from the server; run browser/time-dependent initialization after hydration when it changes visible markup. Test browser console warnings as well as page errors. Reproduce extension-injected DOM separately from application mismatches; never hide broad hydration failures with blanket suppression.

Each screen must answer:

- Who is using it?
- What action/decision is supported?
- What is the primary action?
- Why does the user need this information?
- What evidence/context should be visible?
- What happens on empty/error/offline/denied/unknown states?

## AI rule

Every AI workflow must have:

- purpose
- actor
- data classification
- allowed context
- tools
- model/provider
- output schema
- provenance
- approval state
- audit
- failure behavior
- cost/latency limits

## Stop conditions

Stop and mark blocked when:

- an authoritative source is missing
- rights/access are unclear
- a requested action conflicts with a domain invariant
- an authorization rule is ambiguous
- a new dependency would bypass architecture
- a curriculum rule would require guessing
