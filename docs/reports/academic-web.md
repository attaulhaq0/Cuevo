# Academic truth browser increment

Date: 1 October 2026. Cuevo by E Deviser.

## Implemented

The existing workspace has an Academic navigation view under the `assessment` entitlement. Staff objectives, teacher/admin marking and released results use the frozen Nest endpoints and existing verified Bearer/school/idempotency wrapper. Students/parents see only the API-provided released result projection; no draft query is issued for those roles. Coordinator can review/approve school objectives but has no grading form.

Teachers/admins create a school-authored synthetic objective with explicit version and DRAFT state. Coordinator/admin reviews and explicitly approves it. The marking queue shows submitted work, learner, maximum score, policy version, linked objective and current marking revision. Before result history, an approved objective can be linked using the expected policy version. Missing approval/context shows an actionable instruction instead of a release control.

Teacher marking is a draft command with score, feedback, expected policy/revision and explicit source-submission evidence. The score form is hidden until the selected objective resolves to an approved reference in the current authorized list; missing/unapproved context offers the objective link/review action. A legitimate zero stays zero; an absent value is rejected and never substituted. The draft remains REVIEW and is visibly separated from released grades. After checking the native score/feedback/work/objective, the teacher opens the explicit release confirmation. Parent visibility is an unchecked checkbox and sends `parentVisible:false` unless the human checks it. Release only occurs on the final form submission, never through navigation/render.

Corrections create another draft with the latest expected revision. The UI explains immutable history and keeps previous released result/evidence rows in the released view. Native score/max/policy are retained. No normalized attainment meter, official grade boundary, AI author or accreditation claim is added.

Released-result rows progressively expand source evidence metadata: source submission ID, human actor, timestamp, quality, academic version, policy version, revision and permitted visibility. Protected raw work is loaded only through teacher marking. Evidence responses are validated and do not contain submission content. English/Arabic copy, logical CSS, semantic status and native labeled inputs use shared tokens. Parent checkbox defaults off, remains locked during uncertain retry, and preserves its original payload in the session command journal.

## Verification

Three academic contract tests failed against empty validators, then passed after validation: missing native score versus explicit zero; draft/unknown states cannot appear approved/released; source evidence requires reference/result revision provenance. All existing auth, learning API and membership cases remain green.

Commands run for this increment:

- `node --test apps/web/test/*.test.ts`: 26 passed, 0 failed, including five pagination regressions and the approved-reference marking guard.
- Web TypeScript and targeted ESLint: exit 0.
- `npm run build -w @cuevo/web`: Next.js 16.3.8 production build exit 0.

No browser tools, installs, root edits or Git commits were performed by this worker. Live API/database/backend migration and shared browser verification remain parent-owned. This report does not claim Gate 2.

## Limits and parent verification

Objectives, marking and results now offer explicit Load more controls with bounded 100-record requests, validated next cursors, duplicate-ID reconciliation and current actor/school/path/refresh reset. The list is only declared fully loaded after a null cursor. A later-page failure preserves already loaded rows and offers retry. Selected submissions and uncertain command journals survive page append. No protected list cache is persisted. Classes/subjects authoring choices remain the first bounded 100 records. Rubric marking and complete source-locked curriculum validation remain outside this numeric increment. Names in actor provenance currently appear as opaque actor IDs because the frozen API has no actor display-name projection. Memory-only sessions and multiple-school selection limitations remain.

Verify teacher submitted work → objective link → draft mark → human review → explicit release → own student result/evidence, then correction retaining prior evidence. Check parent remains empty with default private release and sees only the safe projection after explicit parent approval under current guardian relationship. Repeat keyboard/mobile/Arabic and denial/stale revision/uncertain retry states before recording combined academic-truth acceptance.
