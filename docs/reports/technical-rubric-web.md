# Native rubric browser integration

Date: 2026-10-01. Product: Cuevo. Company: E Deviser.

Scope: Task 2 frontend from the [technical MVP plan](../superpowers/plans/2026-10-01-technical-mvp-completion.md). Sources 04/13/17/18/36/37/43/63/79/83 govern immutable native criteria, teacher authority, parent approval, evidence and bilingual accessibility. This worker did not author API/contracts/SQL, reset local data or execute database-mutating browser tests.

## Implemented

The existing Academic workspace adds a Rubrics tab for permitted school staff. Teachers/admins create a course-owned immutable rubric version with bounded criteria and allowed level keys/labels/descriptions. The form retains its original request in the existing command journal on uncertain response; edited payloads cannot become an accidental duplicate. A separate confirmed command configures a same-course rubric on an assessment using its expected policy version.

Marking uses the server-provided immutable rubric definition. Every criterion requires an allowed selection; current native criterion keys, titles, level labels/descriptions, rubric version and policy must match that definition. Draft review shows criterion levels and feedback separately from released records. Teacher correction creates a new revision; explicit result release and unchecked-by-default parent approval retain the existing command flow.

Numeric and rubric responses are discriminated. Rubric native records have no scalar score/maxScore and require normalized:null. Released results, marking review and learner progress use the same NativeResultView through the documented academic public interface. Evidence remains linked to its original submitted work and revision. Learning assessment rows label rubric context without displaying a phantom maximum. Numeric Improvement baseline/follow-up choices filter to native numeric records, avoiding unsupported rubric score comparisons.

## Verification

The initial new rubric/result/marking/assessment tests failed against inherited numeric-only validators. They passed after native model discrimination, permitted criterion/version checks and rubric source validation. The progress rubric case also failed before adding native-union handling.

- All web feature/shared tests: 51 passed, zero failed/skipped.
- Focused TypeScript and ESLint: exit 0.
- Next.js 16.3.8 production build: passed.
- Playwright list: the isolated rubric-truth and improvement-loop journeys are discovered.

The new rubric-truth browser journey creates its own course/assessment, authors and configures rubric through the UI, submits independent learner evidence, marks an allowed criterion, releases explicitly for the parent, verifies parent source evidence, corrects/releases a second criterion revision, then checks own-student result and worker-backed Progress. It asserts no numeric score display, preserves rubric version, and includes Arabic 390px/reduced-motion/axe/runtime-error checks. Bounded-list continuation loads this run's sources rather than depending on previous tests or first-page position.

The isolated `npm run e2e -- tests/e2e/rubric-truth.spec.ts` passed one test (24.4 seconds; 26.3 seconds total) against the stable local web/API/worker processes. It verified the UI-created rubric, criterion marking and approved parent source, second human correction revision, retained first evidence revision, own learner native result and processed Progress, with Arabic 390×844, reduced motion, zero axe violations and no page runtime errors. The Browser plugin was unavailable, so the repository Playwright workflow was used. Focused Arabic mobile and English 1440×900 screenshots were saved to ignored `.local/technical-mvp-visuals/rubric-ar-mobile-1.png`, `rubric-ar-mobile-2.png`, `rubric-en-desktop-1.png` and `rubric-en-desktop-2.png`; visual inspection confirmed criterion labels/version without a scalar grade.

The checks establish this technical native-rubric journey, not official curriculum readiness or a whole MVP gate. Unknown/missing criteria reject authority; no official grading rule or normalization is inferred. Root coordinates clean-seed full regression, remaining school/community/portfolio and final gate evidence.
