# Cuevo API

`src/main.ts` starts the process; `src/app.ts` composes Nest controllers and HTTP/security setup. Domain behavior belongs in `src/modules/<domain>` and identity/database infrastructure in `src/platform`. See root docs/codebase-map.md and docs/architecture/repository-layout.md.

Domain owners: school, school-learning, curriculum, academic, learner-state, improvement, community, portfolio, development and assets. Each module README lists sources, entrypoints and checks. A module folder is a structural boundary; current controller factories are registered in one composition module. Keep current session, tenant, entitlement and relationship checks before every request/replay. Academic source functions remain in committed database migrations.

Run from the root: `npm run build -w @cuevo/api`, `npm run typecheck`, `npm run lint`, `npm run test:integration` after local bootstrap, and `npm run db:test`. Tests are under test/unit and test/integration. No raw SQL/credentials or authorizations belong in web code.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.
