# Academic review context and recovery implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Checkboxes record observed completion, not estimated readiness.

**Goal:** Let an academic approver read the saved objective description, and make a failed rubric prerequisite load recover through the current screen.

**Architecture:** Extend the existing protected academic read projection and browser parser. Keep the current query/session infrastructure and correct the academic owner's error/loading precedence. No database policy, grading rule or new runtime module is required.

**Tech Stack:** TypeScript, NestJS/Fastify, PostgreSQL, React/Next.js 16, Playwright and axe.

**Spec:** Sources [05](../../product/curriculum/05-CURRICULUM-ENGINE.md), [17](../../product/domains/17-ASSESSMENT-GRADEBOOK-FUNCTIONAL-SPEC.md), [37](../../product/design/37-UI-SCREEN-INVENTORY.md), [63](../../product/design/63-ACCESSIBILITY-RTL-I18N.md), [83](../../product/overview/83-MVP-EXIT-CRITERIA.md); findings EU-01/EU-02 in the [functional review](../../product/qa/MVP-FUNCTIONAL-GAP-REVIEW.md).

## Global constraints

- Keep academic authorization, source versioning, role separation, audit and immutable result history unchanged.
- Read descriptions as untrusted text; React text rendering must escape markup.
- Failed protected reads must clear their owned working inputs through existing mechanisms.
- English and Arabic/RTL, current scope, mobile, keyboard and accessible error states remain required.
- Preserve prior uncommitted work; root owns browser/database mutation windows.

## Task 1: Reproduce the two customer defects

**Files:** Create `tests/e2e/customer-academic-review-context.spec.ts`.

**Interfaces:** Uses provisioned synthetic accounts and visible academic create/approve forms; uses route interception only to simulate a failed prerequisite read. Observes ordinary API receipts without bypassing commands.

- [x] Add a browser case: teacher opens Rubrics with a course read returning503; assert a single error, zero Loading statuses, then remove the failure and refresh into usable controls.
- [x] Add a browser case: teacher creates a bilingual school objective; coordinator must read its exact description before approving, and still read it on Arabic mobile afterward.
- [x] Run `node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/customer-academic-review-context.spec.ts --config scripts/verification/playwright.production.config.ts` against the pre-fix build. Retain actual failing assertions and screenshots. An account-fixture failure is not a reproduced product defect.

## Task 2: Expose complete objective review context

**Files:** Modify `apps/api/src/modules/academic/academic.service.ts`, `apps/web/features/academic/model.ts`, `apps/web/features/academic/components/references.tsx`, owner READMEs; extend `apps/web/features/academic/test/academic-contract.test.ts` and `apps/api/test/integration/academic-api.test.ts`.

**Interfaces:** Existing reference creation/list/approval responses add `description: string`; current School Custom creation requires1–4000 characters. No new endpoint or broader source access.

- [x] Add persisted `r.description` to `referenceFields`, which is used by creation/list/approval response reads.
- [x] Require a nonempty description bounded to4000 in `AcademicReference` and `parseReference`. Reject absent context instead of offering a blind approval.
- [x] Render `<p className="lesson-content">{reference.description}</p>` before the evidence disclosure and Approve action.
- [x] Extend meaningful parser cases: missing description fails; bilingual text and literal markup remain plain source text.
- [x] In the actual Auth/API academic journey, assert the description returned by create/list/approve equals the submitted source.

## Task 3: Correct the rubric failure state

**Files:** Modify `apps/web/features/academic/components/academic-workspace.tsx` and the existing owner README.

**Interfaces:** Existing `usePaginatedLearningQuery` state; `loaded=false,error!=null` is a terminal failed read, not pending work.

- [x] Preserve the not-yet-loaded gate on initial tab transition; render an error before Loading and suppress Loading once any required read failed.
- [x] Present the consolidated prerequisite error once; retain source-specific continuation paging when reads succeed.
- [x] Verify the simulated503 replaces Loading, local Refresh recovers, and the current protected form rules remain intact.

## Task 4: Verify and record the precise outcome

- [x] Run web unit cases and typecheck/lint after the parser/UI changes.
- [x] Run the actual academic integration journey in its exclusive mutation window.
- [x] Rebuild configured production assets and rerun both browser cases with screenshots, console/page errors, Arabic390px and axe.
- [x] Update the functional review, acceptance evidence and owner navigation; run architecture/docs/repository guards and fixture tests.
- [x] Keep unrelated missing assessment/file/intelligence/reporting capabilities open. These two repairs cannot establish complete MVP acceptance.
