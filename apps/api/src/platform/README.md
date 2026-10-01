# API platform

`identity/identity.service.ts` resolves verified sessions/current stored memberships. `identity/supabase-auth.ts` verifies tokens with Auth. `database/database.ts` supplies bounded pools and actor/school transaction context. Platform code depends on domain/contracts/config public packages, never application domain modules. Tests live in apps/api/test/unit and integration.

Product source lookup: [task context map](../../../../docs/product/context-map.md); numbered IDs resolve through the product registry.

`request-limits/request-limits.ts` applies fixed one-minute read/write and connection-address budgets before protected routes perform Auth/database work. It stores bounded hashes in process memory, ignores untrusted forwarding headers, and returns a sanitized 429 with Retry-After. It supplements domain-level community limits and current authorization. It is a single-process safeguard; shared production gateway limits require deployment policy.

Database actor transactions record only fixed outcome, elapsed time and pool waiting count. SQL strings, parameters, actor identifiers and database errors stay out of timing telemetry. Request telemetry records fixed route templates/status/correlation; worker telemetry records queue lag and delivery outcomes. These records support local investigation; production alert delivery remains a deployment concern.
