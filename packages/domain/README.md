# Pure domain rules

Public API: @cuevo/domain through src/index.ts. authorization.ts enforces capability and learner-scope invariants on trusted context; curriculum.ts separates source rights, fact status, lifecycle and readiness; errors.ts defines safe DomainError. These pure rules do not verify identity themselves. No app, server-config, provider, database or filesystem/network dependency belongs here. Tests live in test.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.
