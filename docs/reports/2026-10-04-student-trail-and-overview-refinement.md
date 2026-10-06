# Student trail and five-role Overview refinement

Date: 4 October 2026. Founder approved the supplied connected learning-trail image and requested Student-profile QA, bottom alignment fixes for all five Overview roles, and visual alternatives for further review. Work remains in the design worktree on `codex/cuevo-design-system`, baseline `82b761b`; the other backend chat's `G:/Cuevo` checkout is preserved.

## Implemented scope

Learning now composes the current lesson, actual activity sequence and selected task as a connected trail and task plane. Foxi uses the existing separate transparent artwork. The selected linked task resolves its original exact assessment/current-submission endpoint, then mounts the existing AssessmentList directly for one response editor. Unlinked practice retains ActivityView's original completion form and receipt validation. Task focus remains reviewed Bloom task metadata, not a learner level or prerequisite. Earlier feedback requires the same learner/assessment and stays labelled separately from current submitted work. The exact feedback action opens the existing Academic result source. Denied reads and result continuations clear private retained content.

Mobile shows the selected task with an explicitly expandable step chooser; desktop bounds the long activity list so it does not force an empty sibling column. Repeated course/unit headings are hidden only where current breadcrumbs and selected-task context already supply that information. Title, panel spacing and response preview size adapt to the viewport; long source content remains available through the original task owner.

Home keeps the five existing role compositions and callbacks. The Student recognition panel fills its available row. Empty secondary Teacher/Parent context opens progressively, while errors, actual records and paging stay available. Coordinator outcomes use natural full-width rows. Admin policy/status/audit columns no longer reserve a tall empty sibling column, and repeated per-row actions sharing the same destination remain at their section header. A Home-owned native disclosure keeps semantic headings and one UI implementation.

School removes eight empty continuation wrappers while keeping real pagination/errors. Account's Arabic learner-context header uses a scoped two-column layout and a separate Refresh row. No authentication, API, database, RLS, role, curriculum or grading implementation changed in this increment.

## Evidence and observed limits

The fresh pre-change Student audit captured 22 states: nine main workspaces plus Access/Account at 1366×768 English and 390×844 Arabic, with opened lesson and selected Development-period examples. Screens and [audit notes](C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-student-audit/audit.md) are stored externally. This read-only audit makes no protected-write or asynchronous-processing claim.

| Role Overview | Before document height | After document height |
|---|---:|---:|
| Student | 1,815px | 1,439px |
| Teacher | 984px | 900px |
| Parent | 1,889px | 1,230px |
| Coordinator | 2,071px | 1,878px |
| Admin | 1,945px | 1,767px |

Overview measurements use the same 1440×900 synthetic records on build `uDbgpreCuT98n67oLX7qQ`; later builds modify Learning only. All five Overview roles passed actual native navigation and Arabic-mobile axe with secondary disclosures open/closed. The existing Parent communication HTTP403 remains visible and actionable; the UI repair did not weaken its authority. Full evidence: `C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-home-alignment/summary.json` and role screenshots.

Final production web build: `9Pg0MqD7OXn33QhKxhrKW`, served at `http://127.0.0.1:54121/` with existing isolated API54122 and Auth/database57421/57422. A 531-entry browser/UI inventory was unchanged after tests, SHA256 `d8647d54e369480c0660f6d1164c6438446b8d5a10d3aac8f6946cae357852a8`. The source manifests are ignored local evidence. The final two persistent actual Student journeys passed in21.56s, with no failures/skips/flakes. The completion receipt's activity/learner/reflection/ID matches course readback. The linked response sends exactly one submission POST, preserves native0/10 release, opens exact Academic feedback and clears earlier response/feedback on an injected denied transport read. Transport injection checks presentation; existing real API/SQL denial tests remain separate.

Final browser report: `C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-student-audit/connected-2026-10-04T04-46-06-448Z/results.json`, SHA256 `8a9200718695be58606ecc72bae9530a54ba54cc34c1f203cb79adf7ae1a84aa`. Its `verification.md` and `screens/` preserve the actual pending-task, mobile, completion, native-zero and denied-source images. Authored repeatable tests: `tests/e2e/student-learning-journey.spec.ts`, opt-in exact isolated-runtime/build guards; ordinary runs skip its mutations.

At1366×768 the tested submitted-task action ends at700.4px after native focus. Separate read-only Learning tests passed three viewports/nine states; School/Account passed six states. School's main-bottom gap is180→20px, with160px removed from the document. Arabic Account context is63→282px at390 (212px at320), and its original390 document is257px shorter. Final scopes had no unexpected console errors/warnings, page horizontal overflow or scoped axe violations. These cases do not certify every page/data/zoom combination or whole-product customer acceptance.

All962 ordinary Vitest cases,592 web cases and4 local-runtime cases passed. Home109 and School46 owner tests passed; lint/typecheck/production build plus architecture/docs/repository guards/tests passed. The selected task comparison uses both source and actual screenshot together, saved in `cuevo-student-audit/fidelity/`; source status and exact illustration pixels differ intentionally where the actual backend or current accepted asset library differs. The same task-pane hierarchy, separate elements, native buttons and connected trail are retained; this is not a pixel-identical raster clone. Five illustrative stages from the image were not fabricated when the lesson has a different actual activity sequence. Top app chrome remains the current shared owner.

After verification, acceptance records were archived in ignored recovery SQL and the isolated application schemas/reference-school data restored from the canonical208 migrations/seed, retaining133 Auth identities and their credentials. Canonical scenario seeding used an ignored adapter changing only its exact loopback port guard to57422. A separately named synthetic School reasoning journey was then prepared through original APIs for visual review, with independently reviewed focus, recorded example/practice and a pending written response. It is a demonstration, not official curriculum or real pupil evidence. No acceptance-test titles remain in that restored customer-review dataset; no customer-authored content or the other chat's database was sanitized.

## Further visual review

Nine separate Foundry image edits were generated using the existing `gpt-image-2.5-sunburst` deployment through the bundled Image Gen CLI, high1536×1024. Each received the actual affected Student screenshot plus the founder-approved trail reference. No credentials or real pupil records were sent. Images remain external review artifacts at `C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-student-variants/`, with prompt set and receipts in ignored `.local/student-review-variants`. The image-only gallery is `http://127.0.0.1:54124/index.html`; it adds no product route, source implementation or backend dependency.

Progress, Development and Portfolio each have focused, daily and editorial alternatives. Approval is still required before replacing those compositions. Generated copy/record examples have known inconsistencies: some native feedback versus response wording, selected-period/empty-state contradictions, invented activity timestamps, generic journal controls, causal outcome wording and counts. They illustrate hierarchy only; final approved implementation must use current owners and exact records. Read `review-notes.md` in the image folder. Suggested structural starting points are Progress2, Development1 and Portfolio3, subject to correction and founder selection. No proposed design has been implemented.

This increment is locally verified in the design branch, not merged into the other chat's dirty checkout or deployed. Whole-MVP/hosted/official curriculum acceptance and broader Student visual refinement remain separate work.
