# ADR: consistent repository navigation

Date: 2026-10-01. Status: accepted under the founder's instruction to make a navigable hierarchy mandatory.

Keep the existing TypeScript monorepo, Next.js web, Nest/Fastify API, PostgreSQL/Supabase and worker architecture. Group backend domains under modules and technical adapters under platform. Group frontend feature components, models, copy, styles and tests under features; promote existing multi-feature mechanisms to shared. Keep framework routing/process entrypoints stable and public interfaces explicit.

The installed Next 16.3.8 structure guidance permits this arrangement and does not require a src directory or a prescribed role tree. Nest module guidance supports grouping domain capabilities and deliberate exports. No framework, database authority, role policy, HTTP path or production integration changes are authorized by folder cleanup. Current controller factories still compose into one Nest application module; a hierarchy alone does not create provider encapsulation.

The initial source-at-root exception is superseded by the later [product documentation decision](product-documentation-decision.md). Product sources now live in docs/product with numbered identities/facts/versions and historical report hashes preserved. Applied SQL history remains append-only. Current layout conventions override illustrative folder diagrams only for code placement. Tests remain discoverable after moves.

The tradeoff is small app-specific public surface files and an architecture guard, in exchange for clearer ownership and fewer hidden cross-feature dependencies. New abstractions must still be justified by actual reuse. Existing unfinished improvement changes are carried through the move without being presented as completed product work.
