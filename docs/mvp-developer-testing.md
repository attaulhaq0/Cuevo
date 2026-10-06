# Test the Technical MVP from the frontend

This is a developer walkthrough for the local synthetic Cuevo environment. It follows product sources [01 gates](product/overview/01-MVP-SCOPE-AND-GATES.md), [43 golden cases](product/verification/43-TESTING-GOLDEN-CASES.md), [64 demo](product/verification/64-MVP-DEMO-SCRIPT.md), [77 reference school](product/verification/77-REFERENCE-SCHOOL-SYNTHETIC-DATA.md) and [83 exit criteria](product/overview/83-MVP-EXIT-CRITERIA.md), using the current frontend and executable browser journeys. It is implementation guidance, not a new product specification or verification report.

The test proves this chain:

```text
School access → Learning → Submission → Teacher marking → Released evidence
→ Learner state → Analysis proposal → Human approval → Practice
→ Follow-up assessment → Released follow-up → Measured outcome
```

Technical fixture results do not establish official curriculum acceptance, live AI/PostHog performance, academic approval or production/legal/regional readiness. See [current implementation status](implementation-status.md) and the dated [technical exit matrix](reports/technical-mvp-exit-matrix.md).

## 1. Start the environment

Run in PowerShell from `G:\Cuevo`:

```powershell
npm run db:start
npm run dev
```

Keep the development terminal running. `dev` starts web, API and worker together. If those processes already run, reuse them; do not start a second copy on the same ports.

Check:

| Service | Address | Expected |
|---|---|---|
| Web | http://localhost:3000 | Cuevo sign-in form |
| API | http://localhost:4000/health/ready | HTTP 200, database and authentication ready |
| Worker | http://localhost:4001/health/ready | HTTP 200, processor configured; no failed queue events |

The existing bootstrap already provisions school, classes, subjects, memberships, teacher assignments, enrollment, guardian relationships, synthetic references and fixture-intelligence policy. The initial school/identity provisioning happens through bootstrap, rather than a browser registration flow.

`npm run local:bootstrap` replaces the guarded local synthetic database and reprovisions accounts. Use it only when intentionally starting a fresh test environment, after stopping the applications and other shared tests. Read the newly generated account file afterward. `db:start` preserves existing data.

## 2. Use matching accounts

Read passwords from the ignored local file `.local/synthetic-accounts.json`. Do not put them, bearer tokens or server credentials in test reports or commits.

| Role | Email | Use |
|---|---|---|
| Admin | `synthetic-001@cuevo.test` | School setup and approved policies |
| Coordinator | `synthetic-002@cuevo.test` | Objective approval and class evidence review |
| Teacher | `synthetic-004@cuevo.test` | Synthetic Class 1, Mathematics |
| Student | `synthetic-012@cuevo.test` | Enrolled in Synthetic Class 1 |
| Parent | `synthetic-072@cuevo.test` | Guardian of Synthetic student 012 |

Use **Sign out** when switching accounts, or separate browser profiles. Expect **School access verified** after login and navigation appropriate to the current role. Sessions are memory-only; a full reload can require signing in again.

Keep DevTools **Console** and **Network** open in a normal browser. Use a unique record prefix, such as `Manual MVP 2026-10-01 1430`, throughout your run. Save the actual titles and IDs in your test notes. If a record or dropdown option is missing, use **Load more** before treating it as lost data.

## 3. Check school context and objective

1. Admin → **School**: review the current school, **Synthetic Class 1**, Mathematics and existing people/access relationships.
2. Use the already approved **Synthetic school-authored explanation objective**, version `synthetic-school-1`, for the first walkthrough.
3. To test approval separately: teacher → **Academic** → **Objectives** → **Create school objective**; enter a unique title, version and synthetic description, then **Save**. Coordinator → **Academic** → **Objectives** → **Approve objective**, review and confirm. Expect **Draft objective** to become **Approved**.

Use the same approved objective and version for baseline and follow-up. These are school-authored technical examples; do not assign invented official syllabus codes.

## 4. Teacher: author and publish learning

1. **Learning** → **Create course**.
2. Select **Class: Synthetic Class 1**, **Subject: Mathematics**. Enter your unique **Title** and **Description** → **Save**.
3. Find the course → **Open course**.
4. **Add unit** → title → **Save**.
5. **Add lesson** → title and **Lesson content** → **Save**.
6. **Add activity** → title, **Activity type: Practice**, and **Instructions** → **Save**. Keep the default positions for this short sequence.
7. **Publish course** → review the confirmation → **Publish course**.
8. Expect **Published** and the saved unit, lesson and activity.
9. **Back to courses** → **Assessments** → **Create assessment**. Select this course, title it `… baseline`, use **Maximum score: 10**, enter instructions → **Save**. Leave the due date empty for this walkthrough.

Before publication, students must not receive the draft course as published learning.

## 5. Student: learn and submit

1. Sign in as student012 → **Learning** → find the course → **Open course**.
2. Read the lesson and perform the practice. Enter a reflection if offered → **Complete activity**.
3. Expect **Activity completion confirmed.**
4. **Back to courses** → **Assessments** → locate your baseline.
5. Enter **Your response** → **Submit work**.
6. Expect **Your work was submitted.** and awaiting review. Submission alone must not create an authoritative grade.

## 6. Teacher: mark, review and release

1. **Academic** → **Marking** → select the baseline submission for **Synthetic student 012**.
2. In **Link approved objective**, select the chosen **Academic objective** → **Link approved objective**.
3. Enter **Score (0–10): 0** and factual **Teacher feedback** → **Save marking draft**.
4. Expect **Marking draft — review before release**. The draft remains private to staff.
5. Review score, submitted work, feedback and objective → **Release result**.
6. Leave **Approve this released result for the current parent / guardian view** unchecked for the baseline → confirm **Release result**.
7. Expect **Released**.

Zero is deliberate test data here. It tests that a genuine zero result is preserved. Missing submissions and unknown evidence must not be represented as zero grades.

## 7. Student: trace evidence and state

1. **Academic** → **Released results** → baseline → **View evidence**.
2. Verify native **0 / 10**, source submission ID, recorded-by/time, objective version and policy/revision. Review response text separately in **Learning → Submissions**; capture result/evidence IDs from the authorized Network response.
3. **Progress** → **Refresh learner state**.
4. Check that academic evidence and recorded learning observations remain separate. Allow the worker to process events; refresh over roughly 15 seconds if the newly released source has not appeared yet.

A success message is insufficient: a later authorized read must show the same persisted source. Do not treat one result as complete curriculum coverage.

## 8. Teacher: request and review analysis

1. **Next steps** → **Proposals** → **Request analysis**.
2. Select the unique **Released baseline result** → **Request analysis**.
3. Find the proposal. Expect **Fixture analysis — synthetic/test** and **Awaiting human decision**.
4. Expand **Cited evidence** and **Show analysis source context**.
5. Verify that the source run, baseline result/evidence IDs, objective and learner belong to this run. Review observations, interpretation, uncertainty and recommended practice separately.
6. **Authorized analysis context** should distinguish recorded learning observations from permitted teacher learning options. Its bounded context does not establish complete evidence coverage.

The proposal must not release a grade, change access or assign consequential support before a human decision.

## 9. Teacher approves; student completes practice

1. On the proposal → **Approve practice**.
2. Enter **Decision reason**, a unique **Review or edit practice title**, and review/edit the instructions → **Approve practice**.
3. Expect **Approved** and the assigned practice. The baseline grade remains 0.
4. Student → **Next steps** → **Practice tasks** → find your approved title.
5. Perform the practice, enter **Reflection (optional)** → **Complete practice**.
6. Expect **Completed**. Completion itself is not evidence of improved attainment.

## 10. Create the follow-up after practice completion

1. Teacher → **Learning** → **Assessments** → **Create assessment**.
2. Use the **same course**, title `… follow-up`, **Maximum score: 10**, and appropriate synthetic instructions → **Save**.
3. Student submits this new assessment.
4. Teacher → **Academic** → **Marking** → choose the new submission.
5. Link the **same approved objective/version** as the baseline.
6. Enter **Score (0–10): 3** and feedback → **Save marking draft** → **Release result**.
7. Check **Approve this released result for the current parent / guardian view**, then confirm release.

Both follow-up submission and release must occur after practice completion. Do not reuse an earlier seeded result. The **Create assessment** form has no objective selector: link the objective through **Academic → Marking** before attempting to link the assessment to the practice. The server rejects incompatible course, objective/version, raw maximum, learner or timing.

## 11. Measure and inspect the closed loop

1. Teacher → **Next steps** → **Practice tasks** → the completed practice.
2. **Link follow-up assessment** → select the newly published compatible assessment → confirm **Link follow-up assessment**.
3. **Refresh next steps** if needed → **Measure observed change**.
4. Select the **Released follow-up result**. Enter **Minimum change on the raw score scale: 2** → **Measure observed change**.
5. Expect **Improved**, baseline **0 / 10**, follow-up **3 / 10**, difference **3** and threshold **2**; support becomes **Measured**.
6. Student → **Progress** → **Refresh learner state** → inspect support, outcome and **Cited evidence**. Verify the same baseline → practice → follow-up source chain.
7. Expect **Observed change is not proof that the practice caused the outcome.**
8. Coordinator → Overview **Review evidence and outcomes** → **Class evidence and support** → select **Synthetic Class 1** → **Show class record sources** and **Review this learner**. Expect native evidence, recorded actions and measured support separately, with **Coverage is not established**.
9. Parent072 → **Academic → Released results**: locate the unique follow-up. Then **Progress → Learner**: select **Synthetic student 012**. Verify that this run's approved follow-up is visible and its unchecked baseline is private. The parent has no **Next steps** or proposal/practice/outcome internals. Other previously approved test records may also be visible.

## 12. Exercise the rest of the MVP

| Journey | Actions | Pass condition |
|---|---|---|
| Draft and revision | On a separate unmarked assessment: student **Save draft**, fill response, **Save draft → Submit work**; teacher **Learning → Submissions → Return for revision** with feedback; student **Resubmit revised work → Submission history** | Saved content is recovered; private draft becomes teacher-visible only after submission; original and revised submissions retain distinct immutable source history |
| Quiz | Teacher **Quiz versions → Create quiz version → Save → Publish quiz version**; student answers → **Check my answers** | **Answers checked — not graded**; staff answer-key authoring fields remain private |
| Native rubric | Use a separate assessment with no marking history. Teacher **Academic → Rubrics → Create school rubric** for the same course; **Configure assessment rubric**, select assessment/rubric and confirm. Student submits; teacher links approved objective, marks criterion levels and releases. Then **Create correction draft**, change an allowed criterion level, save/release and inspect both revisions | Full criterion labels/version remain native; no invented numeric total; correction preserves earlier evidence; an already marked numeric assessment cannot be converted |
| Attention | Teacher **Progress**: student024, then student030 | Seeded decline **8 / 10 → 3 / 10**, difference −5; missing **Reference D assessment** says **A missing submission is not a zero result.** |
| Attendance/calendar | Admin **School**: academic structure/policies and parent-approved event; teacher records current-class attendance; parent checks calendar | Current relationships apply; attendance is operational context, not a grade or character judgment |
| Community | Student class post → **Thanks**, **Report**; teacher **Hide post** with approval; teacher creates parent-approved announcement | Private updates connect; hidden content disappears; parent receives only approved announcements, with no class-room access |
| Portfolio/private file | Student adds released evidence, uploads/downloads a small synthetic file and writes reflection; teacher approves exact revision for parent; student makes new private edit | Parent retains only the previously approved revision, not the unreviewed edit/history; file access remains private |
| Recognition | Admin explicitly approves recognition/optional board policy and a class learning period; student completes practice and refreshes **Development**, opts in with an alias, then opts out | Points follow approved recorded actions, separate from grades; alias appears only with participation approval |
| Report | **Progress → Download current academic result page** | Fresh source-linked native result HTML page, appropriate learner/parent scope and explicit unknown coverage |
| Curriculum metadata | Admin **Curriculum context → Record source context**, use UNKNOWN source/rights with limitations | Persisted limitations remain explicit; no unsupported CUSTOMER_READY claim |

For recognition policy edits, use the actual current policy version rather than assuming version 0. The automated recognition fixture expects a fresh policy baseline.

## 13. Developer checks on every important screen

| Layer | What to inspect |
|---|---|
| Console | No uncaught application errors or framework overlay |
| Network | Current access verified by `/v1/me`; expected success/deny responses; protected scope and `Idempotency-Key` on important POSTs; receipt IDs match later reads |
| UI error | Validation explains invalid data; 401 means missing/expired authentication, 403 means denied current access, and 409 commonly means stale version/concurrent mutation—read the actual response |
| Worker | Readiness remains healthy; pending work drains; failed queue count does not grow; new evidence/state appears after processing |
| Offline | Protected content/actions disappear; commands are not queued; reconnect revalidates current membership before restoring access |
| Session | No persistent browser session credentials or protected offline cache; avoid sharing request headers or credential-bearing exports |
| Access | Students cannot mark/release, approve proposals or inspect another learner; parents receive approved child projections only |
| Responsive | Test 1440px desktop, 768px tablet, 390×844 mobile; no horizontal overflow or hidden primary actions |
| Accessibility | English/Arabic RTL, Tab/Enter, visible focus, labels/error associations, reduced motion and 200% browser zoom |

Frontend hiding does not prove authorization. Actual cross-tenant/object/relationship/revoked-session denial needs the API and SQL/RLS suites. Browser offline/deny mocks verify presentation behavior only.

Record each manual case with: date, role, title/object IDs, steps, expected and actual behavior, pass/fail, sanitized response status/request ID, and a screenshot where useful. Capture the failing state before retrying. An unknown commit outcome must retry the original key/payload rather than create a second mutation.

## 14. Watch the automated browser tests

In a second PowerShell terminal from the repository root, while `npm run dev` stays running:

```powershell
# Pick, run and inspect journeys interactively.
npm run e2e -- --ui

# Watch the principal learning-improvement journey.
npm run e2e -- tests/e2e/improvement-loop.spec.ts --headed

# Step through a focused journey.
npm run e2e -- tests/e2e/school-learning.spec.ts --debug

# Run all browser journeys and open the resulting report.
npm run e2e
npx playwright show-report
```

For failure tracing:

```powershell
npm run e2e -- tests/e2e/improvement-loop.spec.ts --trace retain-on-failure
```

The root `e2e` script loads local environment configuration. Chromium tests run with one worker, use the existing dev server outside CI, and produce `playwright-report` plus failure screenshots under `test-results`. Some tests arrange prerequisites through the authenticated API before exercising the frontend. These tests create synthetic records and do not reset the database. Avoid running them concurrently with integration, SQL or recovery tests. Repeated full runs can conflict with mutable policy fixtures; they are not a substitute for a clean acceptance run.

## 15. Run a clean technical acceptance cycle

For full verification, stop web/API/worker and other shared tests first, then intentionally reset local synthetic state through:

```powershell
npm run verify:technical
```

This command includes the guarded clean bootstrap, repository/architecture/docs guards, lint/typecheck, configured production build, browser-secret checks, dependency/advisor checks, unit/web tests, SQL/RLS, actual API/private Realtime journeys, recovery and production-web browser tests. It requires unchanged authored source throughout. It must not reuse a running dev server or build into its active `.next` directory.

Evidence is written under `.local/verification/<timestamp>/`. Open the production browser report with:

```powershell
npx playwright show-report .local/verification/playwright-production
```

Read [verification operations](../scripts/verification/README.md) before running this cycle. Afterward restart with `npm run dev` and reread the generated account file.

The manual loop is successful when its authorized later reads show the complete source chain, human approval precedes support, parent/private boundaries hold, and the UI explains native observed change and uncertainty. A screen rendering or one happy-path test passing does not replace the full technical verification cycle.
