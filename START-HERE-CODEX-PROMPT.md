# Start here — Cuevo implementation

E Deviser is the company. Cuevo is the product. Build the standalone K–12 Learning Experience Platform from repository specifications; do not invent curriculum, grading, policy or accreditation facts.

## Required entrypoints

1. Read [AGENTS.md](AGENTS.md) and [README.md](README.md).
2. Read [product context map](docs/product/context-map.md), [codebase map](docs/codebase-map.md) and [implementation status](docs/implementation-status.md).
3. When unfamiliar, complete the initial product/architecture baseline in the context map. For every task read its domain bundle, nearest scoped AGENTS/owner README, tests/golden cases and approved curriculum artifacts.
4. Follow [MVP gates](docs/product/overview/01-MVP-SCOPE-AND-GATES.md), [exit criteria](docs/product/overview/83-MVP-EXIT-CRITERIA.md) and [implementation order](docs/product/delivery/87-IMPLEMENTATION-ORDER-FINAL.md).

The current consolidation uses one [integrated source handover](docs/reports/2026-10-04-cuevo-integration-handover.md) for checkpoint identities, ownership reconciliation, verification and release blockers. Earlier branch reports retain their original evidence scope; they do not establish acceptance for the combined source.

The full corpus lives under [docs/product](docs/product/README.md). [Index](docs/product/index.md) and [registry](docs/product/registry.json) resolve every numbered source and former root filename. The full earlier starting brief is retained at [source-start-here](docs/product/history/source-start-here.md); current paths and context-loading rules supersede its older root reading list.

## Working protocol

Inspect Git changes, preserve existing work, identify source rules/dependencies/security/tests, write a small plan and implement coherent increments. Follow [repository layout](docs/architecture/repository-layout.md); update owner README/maps/links with structural changes. Run documentation/architecture checks and relevant product verification. Stored files are not automatically loaded into an AI model; read requirements explicitly.

Architecture remains Next.js 16 → NestJS/Fastify → PostgreSQL/Supabase → transactional outbox → worker. Browser hiding is not authorization. Academic mutations remain server-controlled, idempotent, audited and source-linked. AI returns proposals with human approval for consequential actions. English/Arabic RTL, responsive behavior, accessibility and denied/error/unknown states remain part of done.

Do not browse live academic sources during normal implementation. Exact source-locked versions, known rights, approved applicability and academic review are required. UNKNOWN/REQUIRES_REVIEW/SOURCE_RESTRICTED facts never become guessed official content or customer-ready claims.

A screen or unit test is not MVP exit. Only documented clean-seed browser/API/DB/RLS/deny/AI/recovery/mobile/RTL/accessibility evidence establishes the relevant gate. Record missing prerequisites without claiming completion. Read the [full product brief](docs/product/history/source-readme.md) and exact numbered sources when broader context is needed.
