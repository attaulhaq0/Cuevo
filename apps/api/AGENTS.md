# API contributor instructions

Inherit root AGENTS.md. Read this app README, docs/codebase-map.md, the affected module README and source specifications before coding.

- Keep main.ts/app.ts for composition; domain controllers/services live under src/modules and infrastructure under src/platform.
- Platform cannot import domain modules. Modules consume packages through @cuevo public exports; cross-module imports require a documented public.ts surface.
- Reuse verified identity/current-session and actor transaction boundaries. Every protected query, mutation and replay checks current tenant/entitlement/role/relationship/object scope.
- Keep authoritative SQL changes in append-only supabase/migrations and verify grants/RLS. Do not expose helpers through browser Data API as a shortcut.
- Unit/contract tests: test/unit. Real Auth/API/Postgres tests: test/integration; run sequentially because revocation fixtures intentionally change current relationships.
- Update module navigation and run architecture, typecheck, lint, relevant API/SQL and build checks. In-progress improvement work must not be silently altered or declared complete during refactors.
