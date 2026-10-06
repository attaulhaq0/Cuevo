# Approval, practice and outcome browser increment

Date: 1 October 2026. Cuevo by E Deviser.

## Implemented

The Next steps view uses current verified actor/school scope through the existing Nest API wrapper and original-key command journal. Parent has no improvement navigation or query in this increment. Teacher/admin can create human proposals from an authorized released baseline; coordinator reads permitted proposals/tasks/outcomes without grading or approval controls. Students receive only their own assigned practice and outcomes.

Proposals visibly distinguish TEACHER_AUTHORED from AI_GENERATED origin. Known observation, cited source evidence, possible interpretation, rationale and uncertainty are separate. Approve/Reject requires an explicit reason; approval offers edited title/instructions and only the human command creates an intervention. No proposal creation or navigation changes a grade. A separate Request AI analysis form returns a specific safe unavailable state for `INTELLIGENCE_UNAVAILABLE`: no model analysis was produced. It is not presented as synthetic AI success.

Student practice uses school-approved task instructions and optional reflection, with completion confirmed only by the service. Teacher links a published follow-up assessment after completion, then selects the manually released follow-up result for the same learner, assessment and objective. The API verifies exact course/version/native scale/timing. Measurement requires a positive teacher-defined raw-score threshold; it is not an official grade rule. Outcomes show baseline/follow-up values, raw difference, threshold, exact outcome state and observed-change-not-causal-proof limitation. A significantly lower follow-up remains inconclusive with its factual difference.

All forms retain original commands on uncertain retry and lock edited payloads until reconciliation. Bounded lists use Load more with validated cursors/current scope. English/Arabic copy, semantic status, visible labels, logical CSS, progressive evidence expansion and responsive row layouts reuse the design tokens. No protected browser storage, chart wall, psychological inference, authoritative AI grade or invented normalization was added.

## Verification

- Two improvement contract tests failed against empty validators, then passed: explicit human origin/evidence/approval status cannot become an executed task; missing numeric follow-up and unknown outcome states cannot become measured zero change; positive measurement threshold is required.
- A real HTTP case checks `INTELLIGENCE_UNAVAILABLE` maps to the specific no-analysis state with a definitive outcome and sanitized message.
- `node --test apps/web/test/*.test.ts`: 37 passed, 0 failed.
- Web TypeScript and targeted ESLint: exit 0.
- `npm run build -w @cuevo/web`: Next.js 16.3.8 production build exit 0.

No browser tools, live backend requests, installs, root edits or commits were performed by this worker. The parent/backend worker owns real proposal/approval/intervention/reassessment/outcome persistence and the shared browser verification.

## Remaining checks and limits

Parent should replay released baseline → teacher-authored proposal → explicit approval → own student practice completion → follow-up assignment/submission/mark/release → same-scale measured outcome. Verify rejected proposal creates no task, repeated approval/retry creates one task, current relationship denial, missing/incompatible follow-up errors and Arabic/mobile/keyboard/accessibility behavior. Live AI readiness remains unavailable until approved credentials/model/data policy are configured; this human loop does not satisfy the required live agentic AI evaluation.

Baseline/follow-up selectors use the current released-results API, with Load more for choices. A released result outside the current projection cannot be used unless the API returns it. Course/rubric/official curriculum validation and wider social/parent scope remain MVP work. No Gate 3 or MVP completion claim is made here.
