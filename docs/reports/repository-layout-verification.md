# Repository layout verification

Date: 2026-10-01. Scope: hierarchy, navigation and binding structural rules. Company: E Deviser. Product: Cuevo. This work does not resume or declare completion of the full MVP goal.

> Supersession note, 2026-10-01: the later accepted [product documentation decision](../architecture/product-documentation-decision.md) moved the original root specification pack into docs/product. The root source-history exception described below records the earlier arrangement. Use the current [repository layout](../architecture/repository-layout.md) and [product context](../product/README.md).

## Result

Reorganized 77 existing source/test files by their owners. API domains now live under src/modules and identity/database under src/platform. Web features own components/model/copy/styles/tests; multi-feature API/session/query/form/pagination mechanisms live under shared. Worker processor lives under jobs/outbox and its pool under platform. Process entrypoints, HTTP routes, Next route paths, CSS selector behavior, authoritative SQL and original numbered source specifications remain stable.

Root/scoped AGENTS files make the layout mandatory. Every app/package/feature/domain has navigation and public-interface documentation. docs/codebase-map.md, docs/README.md, docs/specification-index.md and architecture/path-migration.md provide current and historical navigation. The architecture guard checks ownership/import direction/public surfaces/cycles and required guides, and CI plus npm run check execute it. Framework-generated next-env.d.ts is ignored and removed from the Git index while the local file is retained.

Existing uncommitted improvement work was carried through the move. Its API/UI/contracts and pending migrations are not new functionality from this task and are not claimed complete. Historical review paths/hashes are preserved. No applied SQL migration was moved or rewritten. No new framework, runtime dependency or backend architecture was introduced.

## Verification

- `npm run check:architecture`: pass, 137 source/config files with import, cycle and navigation checks.
- `npm run test:architecture`: 12 positive/negative cases pass, including lazy/type imports, public surfaces, unregistered aliases, browser/server boundaries, test-only adapters and unowned folders.
- `npm run lint` and `npm run typecheck`: pass after reorganization and guard review fixes.
- `npm test`: 192 Vitest cases, 37 discovered web cases in nine feature/shared files and four local-runtime cases pass. Web/native Node and Vitest runners remain separate; no relocated test file is silently skipped.
- `npm run build`: API, Next.js and worker builds pass. Storybook static build also passes after shared CSS relocation.
- `npm run db:test`: eight files, 197 SQL assertions pass. Existing database history and permission rules were preserved.
- `npm run test:integration`: all four discovered suites, ten cases pass. An existing first-page-only submission assertion failed on accumulated synthetic data; it now follows the authorized bounded cursor pages to find its own source. No application query/authorization was relaxed.
- `npm run e2e`: five real browser journeys pass after the move, including five-role sign-in, learning/submission, academic release/evidence, learner Progress, English/Arabic RTL/mobile and axe checks.
- Independent read-only review approved hierarchy, navigation, import/test discovery and the repaired guard. It did not independently rerun tests.
- `git diff --check`: pass.

## Limits

Architecture checks enforce static ownership and known imports; they are not a substitute for runtime authorization, product acceptance, model safety or database tests. Current Nest controller factories still compose into one application module; the folder hierarchy alone is not provider encapsulation. The original root specification pack is an intentional source-history exception. Large source functions/controllers still require normal responsibility-focused refactoring as features evolve; no arbitrary size rule or speculative framework layer was introduced.

Reference guidance: installed Next.js 16.3.8 project-structure docs explicitly permit app for routing and consistent organization; NestJS domain-module guidance informs placement. There is no universal hierarchy guaranteed by the year 2026. The binding Cuevo convention is docs/architecture/repository-layout.md, enforced by AGENTS and CI.
