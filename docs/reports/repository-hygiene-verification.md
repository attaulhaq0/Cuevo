# Repository hygiene verification

Date: 2026-10-01. Scope: duplicate files, physical folder remnants, generated artifacts, source history and future enforcement. Company: E Deviser. Product: Cuevo.

## Findings and cleanup

The independent audit found no byte-identical authored file copies, no copies after normalizing BOM/line endings/surrounding whitespace, and no zero-byte authored files. All 89 numbered product IDs and paths are unique, current hashes match their files, and original hashes match Git HEAD sources. No numbered source remains at root or outside its registered product group. Content comparisons do not establish the absence of semantically equivalent code; ownership/import boundaries and human review remain required.

Fourteen empty legacy directories remained on disk after the source move: six former API domain/platform paths, four former web component feature paths, the web components parent, and web lib/messages/test. Git does not track empty directories, which explains why file-based checks missed them. They were moved into ignored .local/hierarchy-cleanup-2026-10-01 after confirming their absolute paths and emptiness. Obsolete root .next, apps/web/storybook-static and supabase/.config-reference directories were archived there too. A deletion attempt was automatically rejected with “blocked by policy”; the cleanup used reversible archival without deletion.

Dependencies and valid ignored output remain where their tools expect them: node_modules, apps/web/.next, app dist and test-tool output. Local recovery archives are not active source/context. The small feature model/api/ui/copy exports are documented public boundaries; docs/specification-index.md is an intentional forwarding entry. Applied SQL migration history and existing improvement work were preserved.

The original manifest and earlier full briefs now share docs/product/history. Active links and the docs checker follow their new location. The manifest bytes are unchanged; brief edits adjust navigation links only. A dated note identifies the earlier root-specification exception in the hierarchy report as superseded by the accepted product-documentation decision.

## Binding rules and verification

Root AGENTS and the repository layout now require one active source/implementation home, no copied source trees or empty legacy/placeholder folders, and physical folder inspection after moves. Repository hygiene guard/fixtures complement the existing architecture and product-documentation guards and run in CI/aggregate checks. Historical briefs have one checked home; historical reports remain evidence rather than competing current rules.

Final validation:

- `npm run check:repository`: passed across 377 existing tracked/nonignored files and 90 authored directories. No hygiene violations.
- Whole-authored-inventory normalized comparison: 377 files, zero duplicate groups and zero zero-byte files. Separate physical scans found no empty authored directories or obsolete active paths.
- `npm run test:repository`: 22 cases passed. Regression fixtures cover copied app/package/container roots, README/CSS-only copies, route and config-named implementations, normalized runtime/product/SQL copies, empty folders and tracked generated/credential paths. A temporary real Git fixture verifies ignored/deleted paths, deduplication and credential-byte omission.
- `npm run check:architecture` and `npm run test:architecture`: passed; 143 source/config files and 12 fixtures.
- `npm run check:docs` and `npm run test:docs`: passed; 89 source identities/paths/hashes and six fixtures including the single historical home.
- Lint, typecheck and `git diff --check`: passed.
- Original manifest comparison to Git HEAD: identical bytes. Independent history review found substantive brief/product statements preserved.
- Independent read-only review found no current authored hierarchy/copy violations. Review gaps in copied app roots, route/config-named duplicates and overbroad credential names were fixed and regression-tested.

This task changes repository hygiene and verification tooling; application runtime, browser journeys and database/security suites were not rerun because no application behavior or SQL changed. It does not establish curriculum readiness or MVP completion. Static filename rules are not a secret-content scanner; ignored output and symlink targets are not traversed. Existing authored files are regular files with no symlink directories found. Semantically similar implementations still require normal review.
