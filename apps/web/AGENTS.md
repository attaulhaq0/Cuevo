# Web contributor instructions

Inherit root AGENTS.md. Read this app README, docs/codebase-map.md and the affected feature README. Preserve the framework-generated block below; it is an additional version-specific reminder.

- app is for Next route composition; feature UI/model/messages/styles/test files belong under features/<feature>.
- Shared session, requests, query hooks, forms and locale belong under shared and cannot import features. Shared design primitives belong in packages/ui.
- Cross-feature imports use only documented model.ts/api.ts/copy.ts/ui.tsx surfaces. Keep parsers separate from UI re-exports so Node tests stay browser/server independent.
- Never import @cuevo/config, database clients, Nest modules, server filesystem/network adapters or secrets into browser feature/shared code.
- Use English/Arabic translation keys, logical CSS and shared tokens. Preserve uncertain original-key retry, current membership revalidation, parent projections and disabled protected offline caching.
- Unit tests are discovered under features/*/test and shared/*/test; use the root web test runner rather than an obsolete flat test glob. Verify moved screens through Playwright/RTL/mobile/axe, plus typecheck/lint/build and architecture guards.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
