# Cuevo by E Deviser

Cuevo is a standalone K–12 Learning Experience Platform connecting school context, learning, assessment, evidence, learner development, approved support and measured outcomes. E Deviser is the company.

## Start and navigate

- [AGENTS.md](AGENTS.md): binding contributor/agent rules.
- [START-HERE](START-HERE-CODEX-PROMPT.md): task entry protocol.
- [Product context](docs/product/README.md): complete specifications, [task reading guide](docs/product/context-map.md) and [source index](docs/product/index.md).
- [Codebase map](docs/codebase-map.md): implementation ownership and public interfaces.
- [Repository layout](docs/architecture/repository-layout.md): hierarchy and dependency rules.
- [Integrated source handover](docs/reports/2026-10-04-cuevo-integration-handover.md): canonical consolidation plan, preserved authorities, current verification and remaining release gates.
- [Current status](docs/implementation-status.md): integration verification and customer acceptance remain in progress. Official curriculum, live-provider and hosted acceptance remain separate.
- [Scalable event architecture](docs/architecture/scalable-event-processing.md): accepted full-app foundation, staged progression, evidence and improvement gates; locally verified execution with hosted/load acceptance pending.
- [Documentation index](docs/README.md): architecture, decisions, reports and plans.
- [PostHog analytics](docs/operations/posthog.md): current QA/team/investor/institution dashboards, minimized live synthetic capture and local activation/disable commands.

- [Character progression foundation](docs/architecture/character-progression-system.md): founder-authorized extension of current Development XP, with numbered levels, earned cosmetics and saved permitted presentation; [backend plan](docs/superpowers/plans/2026-10-03-character-progression-foundation.md) queued behind the current verification checkpoint, with runtime implementation pending.

Read a small common foundation and the relevant task bundle. Do not assume all product context is already loaded or reread every document for every small task. Numbered specifications govern intent; reports and plans describe evidence/work.

## Run locally

Prerequisites: Docker Desktop, supported Node 24 LTS/toolchain and npm 11.17.0. Synthetic data only.

```powershell
npm ci
npm run local:bootstrap
npm run dev
```

local:bootstrap resets only the verified local Cuevo database, applies migrations, generates ignored credentials and provisions synthetic identities. Separate ports/network preserve other stacks. Account details stay in ignored .local/synthetic-accounts.json. Open [Cuevo](http://localhost:3000), [API readiness](http://localhost:4000/health/ready) and [worker readiness](http://localhost:4001/health/ready). Current sessions are memory-only; server secrets stay out of the browser.

Use `npm run db:reset` or `local:bootstrap` for clean local replay. The [immutable migration dependency plan](docs/decisions/2026-10-02-immutable-migration-replay-order.md) preserves applied SQL history while resolving its explicit native-source prerequisite before lifecycle creation. Direct lexical CLI reset does not cover this historical dependency.

## Verify

```powershell
npm run check:repository
npm run test:repository
npm run check:architecture
npm run test:architecture
npm run check:docs
npm run test:docs
npm run lint
npm run typecheck
npm test
npm run db:test
npm run test:integration
npm run build
npm run e2e
npm run storybook
npm run verify:technical
```

Architecture/documentation checks enforce ownership, imports and navigation; product/security verification remains required. The full earlier product brief is retained in [product history](docs/product/history/source-readme.md). Current names/paths/context-loading rules supersede its former root file list.

`verify:technical` runs the guarded clean synthetic bootstrap, configured production web build, source/RLS/authorization tests, real API/private Realtime checks, recovery and all-role browser matrix. It requires unchanged authored source hashes throughout the run. It never establishes official curriculum, live-provider or production/legal acceptance from fixture results.
