# Technical improvement and progress browser integration

Date: 2026-10-01. Product: Cuevo. Company: E Deviser.

This increment implements Task 1 frontend behavior from the [technical MVP plan](../superpowers/plans/2026-10-01-technical-mvp-completion.md) and [technical acceptance decision](../decisions/2026-10-01-technical-mvp.md). Sources 04/08–12/21/36/37/43/63/78/79/83 govern evidence, support, human decisions, uncertainty and bilingual accessibility. The implementation preserves existing uncommitted source/document moves and improvement behavior.

## Implemented behavior

Generated proposals require the frozen API fields generationMode FIXTURE or LIVE and a persisted intelligenceRunId. Teacher-authored proposals require HUMAN with null run metadata. Fixture proposals display “Fixture analysis — synthetic/test” in English/Arabic, explain that synthetic output does not establish live model performance, and show their source run alongside cited evidence. Known observations, possible interpretation, rationale and uncertainty remain separate. Explicit human approval/rejection remains the only path to a practice task; original-key retry uses the existing in-memory command journal.

Progress validates and renders full authorized support items and source-linked outcome measurements. Active ID sets match ASSIGNED/COMPLETED items; MEASURED items require matching outcomes. Measurements require a completed support source, matching baseline, compatible native numeric scales, real follow-up/difference/positive threshold, consistent outcome/reason and non-causality. Explicit zero remains zero. Unknown and approved parent projections contain no internal support/outcomes. Stale habit windows retain genuine support/outcome sources. Parent improvement queries are disabled even if this feature is composed independently.

The read-only OutcomeList is exported through improvement/ui.tsx and reused by Progress. No shell/layout, shared contract, API, worker or database changes were authored by this frontend worker. Feature READMEs describe the deliberate public surfaces. Shared warm tokens, logical CSS, semantic status, bidi isolation, evidence disclosures and reduced-motion behavior are preserved.

## Verification performed

Regression-first parser tests failed against the inherited validators for unsupported measured impact, absent support source checks, missing follow-up/difference, incomplete measured support and fixture authorship without a run. The implementation made those cases pass. Additional red/green cases cover decimal numeric representation, outcome reason and measurement time preceding completion.

- `node --test apps/web/features/improvement/test/improvement.test.ts apps/web/features/progress/test/learner-state.test.ts`: 16 tests passed, zero failed.
- `npm run test -w @cuevo/web`: 45 tests passed across all nine feature/shared files, zero failed or skipped.
- Web TypeScript and focused ESLint for improvement/progress/new browser spec: exit 0.
- `npm run build -w @cuevo/web`: Next.js 16.3.8 production build passed.
- `npx playwright test tests/e2e/improvement-loop.spec.ts --list`: one independent Chromium journey discovered.
- Scoped `git diff --check`: exit 0.
- `npm run check:architecture` and `npm run check:docs`: passed after feature README/public-surface updates; architecture and documentation fixture suites passed 12 and six tests respectively.

## Browser verification pending

The new improvement-loop browser journey creates its own published course, zero baseline, submission/mark/release source; requests fixture analysis through UI; reviews provenance and explicitly approves edited practice; completes it as the learner; creates follow-up after completion; links and measures through UI; waits for source-driven Progress refresh; checks native values/provenance and parent internal denial. It includes Arabic at 390px, no horizontal overflow, reduced motion, axe and runtime-error checks. It does not rely on earlier E2E source records.

The initial coordinated browser run reached measured source persistence, but its polling callback refreshed and immediately counted before asynchronous rendering, repeatedly clearing the page. The failure artifact showed Loading learner state; root separately confirmed completed outbox events and measured support/outcome in the snapshot. A second run exposed the same timing issue in the list continuation helper following proposal creation. Helpers now wait for the known loading state or exact state response to settle before checking rows; no product assertion was removed. A final live rerun remains pending root's sequential mutation window.

The final isolated `npm run e2e -- tests/e2e/improvement-loop.spec.ts` passed one test (23.3 seconds; 29.3 seconds total), and the stable-runtime focused screenshot rerun passed (22.1 seconds; 24.0 seconds total). It established the persisted fixture proposal, explicit teacher decision, learner completion, comparable follow-up release/measurement, processed own-student support/outcome, Arabic mobile/axe/reduced motion/runtime-error assertions and parent internal denial. Browser plugin was unavailable, so the repository Playwright workflow was used. Initial full-page screenshots were too long because accumulated synthetic history was present; focused 390×844 Arabic and 1440×900 English viewport screenshots were captured and visually inspected at the proposal and measured-outcome rows. They are ignored local evidence at `.local/technical-mvp-visuals/improvement-ar-mobile-1.png`, `improvement-ar-mobile-2.png`, `improvement-en-desktop-1.png` and `improvement-en-desktop-2.png`.

Root coordinates final structural/documentation and clean-seed verification. This report establishes the fresh frontend and isolated browser behavior above, not a whole Gate 3/4/5, live model quality or full MVP completion. The complete curriculum, school/community/portfolio, safety, recovery and five-role exit checks remain separate.
