# Frontend product QA implementation plan

> **For agentic workers:** Use subagent-driven-development for independent audit tasks, then review every implemented change against its exact source and evidence.

**Goal:** Complete the authorized senior frontend audit and implement the highest-value verified improvements while the original Supabase owner correction is pending.

**Architecture:** Retain the existing Next.js web application, feature owners, shared session/API/form mechanisms and `@cuevo/ui` primitives. PR47 is frozen at `a0d5476517915a9c05af887d357060a841f0e52b`; subsequent work is isolated in `codex/frontend-product-audit` and cannot borrow PR47 CI or release proof.

**Tech stack:** Next.js 16.3.8, React, TypeScript, npm 11.17.0, Node 24.16.0, repository Playwright/axe and existing unit/render runners.

**Spec:** The user's 12 October senior frontend audit brief, [current goal acceptance](../../design/2026-10-05-redesign-goal-acceptance.md), numbered design sources 36/37/62/63/79 and the relevant domain bundles in the product context map.

## Global constraints

- Work only on G: with the pinned runtime and G: TEMP/npm/Playwright directories. Preserve the primary uncommitted checkout and frozen PR46/PR47/main sources.
- Preserve all 231 migration bytes/history, database/RLS/contracts, credentials and original command/source/receipt identities. No provider writes or shared service resets for this audit.
- Keep the approved Royal/Pearl/Midnight palette; brand cyan remains its documented identity accent. Preserve English/Arabic, the current icon family, native actions and accessible controls.
- Do not create filler records/cards, new feature branches, permission bypasses, replacement frameworks or abstractions justified only by line count.
- The blocked Community HTTPS reproduction remains blocked. This UI audit never fabricates cancellation proof or weakens runtime admission.
- Every finding names its actual source and state, severity, user impact, root cause, regression risk and verification. Unknown and untested remain explicit.

## Task 1: Inventory and coverage reconciliation

- [x] Enumerate actual Next routes and query-addressed Workspace views, admitted role choices, subsection owners, dialogs/forms/tables and shared public components.
- [x] Trace session admission, capabilities, query ownership, command/draft/retry behavior and theme initialization against code rather than old descriptions.
- [x] Inspect apparent duplication and unused exports with their import/callers and domain differences. Record evidence for consolidation or retention; do not merge superficially similar flows.
- [x] Reconcile the previous 58-role/view and 186-subsection audit with current committed bytes. Mark populated/theme/interaction gaps separately.

## Task 2: Current theme and interaction capture

- [x] Render the actual Workspace and source parsers using the existing controlled audit harness, with unknown requests refused and mutations denied.
- [x] Capture all admitted role/view combinations in Light and Dark, English desktop and Arabic narrow mobile; inspect representative inverse locale/tablet cases.
- [x] Inspect the saved images, run scoped axe, and check keyboard focus, dialog Escape, native controls, clipping and console errors. Record each limitation rather than treating a screenshot as full accessibility acceptance.
- [x] Execute existing isolated populated-owner workflow tests that do not require the blocked DB/provider environment. Select suites from the coverage inventory; do not bootstrap or reset a shared stack.

## Task 3: Prioritized corrections

- [x] Write the initial findings in `docs/reports/2026-10-12-frontend-product-qa.md` before substantial code changes.
- [x] For each confirmed correction, reproduce the actual owner/state, identify a minimal fix and use meaningful regression checks. Retain failed evidence and existing source/command/draft guards.
- [x] Implement at the existing owning feature or shared primitive; update that owner's README and appropriate tests/discovery. Record architectural trade-offs before introducing a new boundary.
- [x] Verify before/after screenshots and relevant keyboard/RTL/mobile/theme behavior after each correction. Reject attractive mockups that conceal unsupported workflows.

## Task 4: Maintainable deliverables

- [x] Consolidate findings, duplication decisions, current design-system conventions, execution results and implementation summary in the single report, linking the existing authoritative token/palette/navigation documents.
- [x] Update the existing goal acceptance register and codebase map to locate the report. Historical plans/reports retain their dates and scope.
- [x] Separate available local verification, remaining connected/hosted/manual review and external owner correction. No all-issues-gone or customer-readiness claim.

## Task 5: Verification and reviewable publication

- [ ] Run checks appropriate to changed owners: types/lint, meaningful owner/browser tests, production build, architecture/docs and repository hygiene where required.
- [ ] Freeze source/evidence pins and obtain independent source and visual/QA reviews of the final bytes.
- [ ] Publish a signed coherent successor candidate with truthful stacked dependencies and its own required CI. Protected integration and new-main proof remain mandatory before release inputs change.
- [ ] Save the checkpoint and update the existing automation through its tool. Keep the goal active while required CI, section or connected acceptance remains incomplete.
