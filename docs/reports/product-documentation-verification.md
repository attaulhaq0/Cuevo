# Product documentation migration verification

Date: 2026-10-01. Scope: product source placement, agent/human navigation and context retrieval. No application behavior, database migrations, official curriculum fact or readiness status is changed by this work.

Moved all 89 numbered source specifications from repository root into docs/product with nine purpose groups: overview, domains, curriculum, quality, design, platform, verification, delivery and research. Quality/accreditation remains independent of curriculum/jurisdiction. Root Markdown now contains only README.md, AGENTS.md and START-HERE-CODEX-PROMPT.md. The original manifest/version/former naming and the full previous product/start briefs are preserved as historical context.

Product index and registry cover every ID 00–88 exactly once. Registry records original path/hash and current path/hash. Source bodies preserve academic statements and version/rights/UNKNOWN constraints; navigational source references were converted to valid relative Markdown links where necessary. Original SHA-256 values were independently compared with Git HEAD for all 89 sources: all matched. Current hashes/path existence/coverage checks also passed.

The task context map gives initial orientation and per-domain bundles, requiring the nearest owner instructions, relevant source tests and approved curriculum artifacts. It expressly distinguishes stored product context from loaded model context and prohibits guessing missing authoritative facts. Current root/owner guides and the repository layout supersede the previous temporary source-at-root rule; historical reports retain their reviewed paths/hashes, resolved through the registry/migration index.

Verification:

- npm run check:docs passed for 89 unique sources, current/original manifest coverage, root placement, source hashes and current local links.
- npm run test:docs passed five positive/negative cases for missing/duplicate/escaping sources, changed hashes, root clutter, original manifest identities and broken navigation links.
- npm run check:architecture passed for 140 source/config files and required product navigation.
- npm run test:architecture passed twelve dependency/layout fixtures.
- Lint and typecheck passed.
- git diff --check passed.
- Independent read-only final review approved navigation, integrity and progressive context. It compared all original hashes and product text against Git history, finding only navigational link changes in numbered sources 49 and 87. The static guard validates current bytes/registry and original hash shape/manifest coverage; historical immutability still relies on Git review, not a claim that checksums alone prove authority.

CI and the aggregate check command now execute documentation checks/tests. These checks do not establish academic approval, file rights, live AI quality or MVP acceptance. Source-locked official packs, production prerequisites and unfinished implementation remain unchanged.
