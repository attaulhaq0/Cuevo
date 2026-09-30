# Edeviser Agent Constitution

You are implementing a production-grade standalone K–12 Learning Experience Platform.

The repository specifications are the source of truth for product intent, domain rules, UX, security and curriculum implementation.

## Read before coding

Always read:

1. `README.md`
2. `START-HERE-CODEX-PROMPT.md`
3. relevant domain specification
4. relevant tests/golden cases
5. relevant curriculum pack artifacts

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
