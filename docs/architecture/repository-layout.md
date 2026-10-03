# Repository layout and dependency rules

Status: binding repository convention. Reviewed 1 October 2026 against the installed Next.js 16.3.8 documentation and NestJS module guidance. There is no universal folder tree mandated by the year; Cuevo chooses one consistent, feature-oriented layout for its existing modular monolith.

## Start here

Read root README/AGENTS/START-HERE, then docs/product/context-map.md for task-specific product sources and docs/codebase-map.md for implementation entrypoints. Read nearest scoped AGENTS, owner README, tests and source-locked curriculum artifacts before changing a domain. Stored context must be explicitly retrieved; no repeated full-corpus read is required for every small task.

## Canonical layout

```text
apps/
  api/
    src/
      app.ts                         # API composition and HTTP setup
      main.ts                        # Process entrypoint
      serverless.ts                  # Hosted HTTP composition, existing API domain boundary
      # Curriculum pack/spool paths are owner- or artifact-relative, never implicit cwd configuration.
      modules/<domain>/              # Domain controllers/services/orchestration
      platform/<capability>/         # Identity and database infrastructure
    test/unit/                       # Isolated API/contract checks
    test/integration/                # Auth + API + database journeys
  web/
    app/                             # Next route files and global shell styles
    public/                          # Decorative-byte boundary; current static Auth uses feature assets
    features/<feature>/
      components/                    # Feature UI
      model.ts                       # Browser-safe types and response validation
      api.ts                         # Feature API hooks when needed
      ui.tsx                         # Narrow public UI surface
      copy.ts                        # Public feature copy, when composition needs it
      messages.ts                    # English/Arabic feature copy
      styles.css                     # Feature styles using shared tokens
      test/                          # Feature unit tests
      README.md                      # Purpose, public interfaces and verification
    shared/
      api/                           # Request, retry, response and pagination mechanisms
      components/                    # App-shared forms, feedback and branding
      hooks/                         # App-wide query hooks
      i18n/                          # Global locale and common copy
      session/                       # Browser auth/session context and membership verification
  worker/
    src/main.ts                      # Local/persistent process composition
    src/edge.ts                      # Bounded hosted worker composition
    # Edge imports only exact portable contracts/analytics and config/synthetic-runtime surfaces.
    src/jobs/<job>/                  # Outbox job processors
    src/platform/                   # Worker infrastructure
    test/
packages/
  contracts/                         # Browser-safe boundary schemas
  domain/                            # Pure domain rules; no app/provider I/O
  config/                            # Server configuration/policies; exact portable synthetic-runtime export for Edge
  ui/                                # Browser-safe design primitives and tokens
supabase/{migrations,seed,tests}/      # Database authority and authorization tests
tests/e2e/                           # Cross-application browser journeys
scripts/                             # Development and verification entrypoints
scripts/runtime/                     # Operator-owned child environment/process launch
docker/                              # Container definitions
docs/{architecture,decisions,reports}/
docs/product/                        # Canonical product corpus, registry and context map
docs/product/history/                # Original manifest and superseded brief snapshots
.github/workflows/                   # CI
```

Do not create empty future folders or placeholder packages. Add packages/testing only when shared test fixtures justify it. Keep the API/worker process paths and Next route conventions stable. Folder organization does not by itself create Nest provider encapsulation; the current API composes controllers into one application module. Introduce real provider/module exports when behavior needs them, without claiming folder moves supply runtime isolation.

## Ownership and imports

1. Put code beside the feature/domain that owns it. Promote code to shared only when multiple features actually use the same mechanism. Do not create catch-all helpers/utils/services folders or duplicate provider-specific branches.
2. API modules may use platform and shared packages. Platform cannot depend on modules. Runtime applications cannot import another application's implementation. Integration tests may compose API and worker explicitly.
3. Web routes and shell compose feature public interfaces. Features use shared infrastructure and packages/ui/contracts. Cross-feature dependencies use only the documented model.ts, api.ts, copy.ts or ui.tsx surface. Feature internals never import shell composition, and shared never imports a feature.
4. packages/domain and contracts are browser-safe and cannot import server configuration, database clients, filesystem/network adapters or app code. packages/ui cannot import server/app code. packages/config is server-only and must never enter web imports.
5. Use @cuevo/* public package exports; never reach across packages through relative paths into src. Use explicit public feature surfaces across features. Keep local relative imports short and unambiguous. Type imports, re-exports and lazy imports obey the same boundary rules.
6. Keep routing/bootstrap files focused on composition. Keep controller, service, provider, policy, query and component responsibilities explicit; split a growing file by responsibility rather than inventing layers for their own sake.
7. Name directories and ordinary files in kebab-case; preserve framework names such as AGENTS.md, README.md, page.tsx and layout.tsx. API domain files use descriptive .controller.ts/.service.ts names. Avoid global index barrels that combine browser and server code or mix parser exports with UI exports.
8. Unit tests belong to the owning feature/package or app unit suite. Auth/database/API journeys belong in app integration suites; browser journeys stay in tests/e2e; SQL/RLS tests stay in supabase/tests. Runners must discover all relocated tests. A skipped integration run never counts as release evidence.
9. A new domain/feature, public interface, top-level directory or move must update its README, docs/codebase-map.md and affected scoped instructions, imports, test discovery and configuration in the same change. A new architectural boundary requires a decision record. Do not silently broaden the architecture.
10. Generated output, secrets, local credentials, node_modules, dist, .next and reports from test tools stay ignored. Human-authored validation reports belong in docs/reports; current status belongs in docs/implementation-status.md. Checked-in SQL migration history is append-only after application; folder cleanup is never permission to rewrite it.

## Product documentation and source history

Customer presentation follows root AGENTS UI rules: primary labels use authorized names and meaningful class/date/revision context. Internal IDs, hashes and source/run keys never substitute for a customer label; explicit provenance/support details retain auditability. Missing context stays unknown and actionable in English/Arabic.

Root Markdown is limited to README, AGENTS and START-HERE. The 00–88 product specification corpus lives in docs/product grouped by purpose, with numbered identities, source facts and versions preserved. Product index/context-map/registry route agents and humans to the relevant source. The original manifest and full earlier brief are historical snapshots there, not current path instructions. This newer user-authorized decision supersedes the temporary source-at-root exception. Applied SQL history remains untouched; historical reports retain the paths/hashes they originally reviewed and resolve old filenames through registry.json.

Keep the original manifest and earlier briefs together in docs/product/history. Each active specification/implementation has one home. Do not keep copy/backup source trees, empty legacy directories or speculative placeholder modules in authored paths. Check physical directories after source moves as well as Git status; Git does not represent empty folders. Ignored local recovery archives are not committed source context.

Applied migration bytes remain immutable through Git filters as well as editing. New migrations use LF before first application; any required exact-path preservation for already applied bytes must have a staged/check-out hash check. The [Git byte preservation decision](../decisions/2026-10-02-migration-git-byte-preservation.md) preserves12 newly applied CRLF sources without changing historical canonical blobs.

## Enforcement and verification

`npm run check:architecture` checks canonical source roots, navigation files, relative/public-package imports, dependency direction, browser/server boundaries, unresolved local imports, feature surfaces and cycles. `npm run check:docs` checks root Markdown placement, the complete product registry, hashes and current documentation links. Both run in CI/aggregate checks with their fixture tests. They enforce structural rules, not authorization, browser, database or academic correctness.

`npm run check:repository` checks physical authored directory ownership/emptiness, duplicate authored runtime sources and numbered specifications, and tracked generated/secret paths. `npm run test:repository` exercises positive/negative fixtures. It uses existing Git tracked/nonignored files and separately inspects nonignored directories. Build/dependency output and documented historical/forwarding surfaces are intentional exclusions. Content comparison detects exact or normalized copies, not semantic equivalence; domain ownership review remains required. The guard and fixtures run in CI and the aggregate check command.

For a move, inspect status first, preserve all existing edits, update imports from resolved old paths, verify test discovery and run architecture checks, lint, typecheck, unit/integration tests and affected builds. Repeat browser journeys when UI modules move. No feature is completed by changing its folder.

## References

- Next.js installed version: node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md; [official project structure](https://nextjs.org/docs/app/getting-started/project-structure). Next is unopinionated and explicitly supports keeping app solely for routing.
- [NestJS modules](https://docs.nestjs.com/modules): group related domain capabilities and expose deliberate public interfaces.
- Cuevo specifications 02, 49, 62, 68 and 81 govern the modular monolith, task scope and protected data boundary.
