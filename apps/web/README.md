# Cuevo web

Next route composition lives in app. Feature-owned UI/models/copy/styles/tests live in features. Shared browser session/API/form/i18n mechanisms live in shared; design primitives/tokens live in packages/ui. Read root docs/codebase-map.md and the binding repository layout before placement changes.

Public feature surfaces: model.ts (response types/validation), api.ts (feature hooks when needed), ui.tsx (components used by composition/other features), copy.ts (feature copy needed by the shell). Keep these distinct so Node parser tests do not import TSX or server code. Do not import another feature's components directly. Server configuration/database/auth secrets never enter browser imports.

Run from root: `npm run build -w @cuevo/web`, `npm run typecheck`, `npm run lint`, `npm run test -w @cuevo/web`, `npm run e2e` against the configured local app, and `npm run storybook:build`. scripts/test-web.ts discovers all feature/shared Node test files. Feature CSS is imported in stable order by app/layout.tsx. Initial sessions remain in memory and offline protected caching remains disabled.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.

Rendered customer focus/class-context regressions are in `tests/e2e/customer-navigation-context.spec.ts`. The opt-in `customer-performance.spec.ts` uses the production build and normal local API/worker for action-to-visible-content, private bytes and two-browser Realtime measurements; it labels cancelled requests separately and writes only ignored scalar evidence. Read [measured scope and remaining limits](../../docs/reports/customer-browser-performance.md). These checks do not substitute for the complete all-role/frozen release gate.
