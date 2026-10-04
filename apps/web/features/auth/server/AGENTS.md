# Local review server owner

Inherit root and apps/web instructions. This exact owner implements the founder-authorized local synthetic quick login documented in `docs/decisions/2026-10-04-local-review-quick-login.md`.

- Browser code must not import this folder or `auth/api.ts`. Keep `server-only` in that public entry.
- The only admitted runtime Node imports here are filesystem promises, path and URL; no database/runtime server configuration or other application implementation.
- Default-off and explicit local origin/Auth/source guards precede all credential reads or sign-in. Hosted deployments and production customer contexts must remain unavailable.
- Preserve source-locked synthetic actors and actual Auth verification. Never create membership, accept arbitrary credentials, fabricate roles or bypass existing API authorization.
- Passwords stay server-only. Return only the necessary session fields after exact identity validation; use no-store and fixed safe errors. Do not log credentials, token responses or raw parse/provider errors.
- Current source tests and actual browser/API membership verification remain separate from pure guards. No paid provider call, remote account change or customer data is authorized.
