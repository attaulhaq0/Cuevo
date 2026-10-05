# Selected focused workspace navigation

Founder selected on 4 October 2026: retain the full permitted global menu on the dashboard; use focused navigation inside workspaces; use a full-width record directory before selection and one selected reading/editing area afterward. This direction applies to all five profiles and current sections/nested owners. The founder subsequently selected the Student Learning Desk composition and authorized compact refinement with one supported Portfolio preview. Current source implements these bounded layouts, while full role/section/release acceptance remains open.

## Shared navigation rule

Home retains the current identity header, Search, Profile/Appearance/sign-out and permitted global menu. Inside a workspace, one compact contextual row replaces the repeated global and subsection rails: Back to dashboard, current workspace switcher and that owner's actual permitted subsections. The switcher uses the same permitted product-workspace catalogue as the Home menu; Search additionally offers the existing Account/Access profile destinations. Account and Access remain in Profile and are not duplicated in the product-workspace rail.

Zero subsections means no empty tab strip. One subsection uses static current context. Multiple subsections use one readable selection rail, with logical overflow when labels cannot fit. Do not invent tabs for headings, filters, chapters, period selectors or record directories. Related actions/context belong beside the existing section heading when space permits. Selected deep work retains its actual source/list Back separately from Back to dashboard.

The shared Shell/WorkspaceChrome uses the UI-owned presentational navigation portal; each existing feature keeps the section items, selection, hooks, source intent, focus, forms and actions. Reuse `packages/ui` tokens and presentational primitives. Features do not import Shell internals, shared infrastructure does not import features, and no new record router, duplicate renderer, fetch/command owner or application is introduced. A deliberately admitted different subsection reveals the current main heading; Refresh, same section and rejected/disabled changes preserve reading position. Switcher dismissal on resize/external scroll preserves reachable current focus.

## Directory and selected work

A fresh browse entry uses the full available width for current authorized names, meaningful context, existing filters/actions and pagination. No empty detail column or automatic first-record form appears. A current exact Home/source link already represents explicit selection and may open that source directly after authorization. Current Student self context, a sole unambiguous approved child and source-defined policy/course context do not require artificial directories.

After deliberate selection, a compact same-owner directory/outline may sit beside one reading/editing area. Gradebooks and native comparisons retain the width required for comparison. Short sources keep their natural height; long discussions, material and forms scroll naturally. Mobile uses directory → detail → Back to directory in one column, preserving currently supported browse context without duplicating forms or requests. New deep URLs or persistent navigation state are not implied by this decision.

## Role and owner scope

| Role | Focused catalogue and record context |
|---|---|
| Student | Own School, Community, Portfolio, Development, Learning, Academic, Progress and Next steps when permitted. Exact task/feedback and explicit recognition period remain independent. No Curriculum/Restricted records or staff actions. |
| Teacher | Current assigned courses/classes, marking/native results, evidence, proposals/practice/outcomes, planning and permitted operational/review owners. Preserve source/revision and existing approval scope. |
| Coordinator | Current course/class/period and programme review, evidence/native outcomes and permitted read/review owners. No Restricted records or teacher grading authority. |
| Parent | Current authorized child, approved feedback/portfolio, School, Community, Learning, Academic and Progress as admitted. No Development, Next steps, Curriculum or Restricted records. |
| Admin | Existing School configuration/people/policies/automation/audit, curriculum, development, academic/learning and other admitted owners. Restricted records retain separate purpose/object policy; navigation never grants authority. |

Learning, Academic, School, Community, Next steps and Curriculum already own role-specific subsection catalogues. Progress, Portfolio, Development, Restricted records and Account/Access retain their real selectors and source sections without fabricated peer tabs. Course → unit → lesson → activity, marking/release, room/thread/composer, exact portfolio source/reflection/review, practice/reassessment/native outcome, and current period/policy controls remain with existing nested owners.

## States required across all admitted owners

| State | Presentation and action |
|---|---|
| Records, none selected | Full-width directory, no implicit detail/highlight/editor. Short selection guidance. |
| Confirmed empty | Concise no-record state only after a successful sufficiently complete current read; supported browse/create/setup/refresh only. |
| No filter/search match | Preserve and clear/change the actual supported filter; do not describe the school as empty or add a new filter. |
| Loading/current authorization | Local status; withhold invalid source/actions. Current permitted navigation remains reachable. |
| Partial/continued source | Show admitted current facts and local continuation/error. Never imply latest, full history or complete coverage. |
| Offline/read error | Preserve the existing protected caching/session policy; truthful local recovery, no empty/all-clear or success claim. |
| Denied/relationship loss | Withhold protected detail/editor and follow current source/session recovery. No role hiding as authorization. |
| Missing/ambiguous/withdrawn/changed | Plain localized context and exact recovery; no UUID fallback, guessed names, next-row auto-selection or revision rebasing. |
| Unsent input | Retain exact actor/school/record/revision working intent only under existing supported draft rules. Never move text or consent to a new source. |
| Pending/uncertain mutation | Preserve original request key/payload/source and existing locks/recovery. Navigation must not resend, auto-save, discard or falsely confirm it. |
| Confirmed receipt | Show the exact action/readback; derived work, approval, sharing, grading and awards remain separate. |

## Visual review and verification

Current external review inputs and outputs are in `C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-focused-student`. Three Student Home proposals preserve the full global menu, compact current task, real feedback source/action, goal review, next task and explicit recognition choice. Separate illustrative directory/selected task proposals explain focused navigation. They are images, not connected implementations or customer acceptance. Exact hashes, prompts, prior capture/build identities and generation limits are recorded externally; do not import image screenshots as UI.

The earlier alternative Student concepts are historical; the Learning Desk attachment is selected. On5October2026 the founder selected content-first directory headings and small real context captions where a record needs orientation; see the [heading decision](../decisions/2026-10-05-content-first-workspace-headings.md). Preserve canonical Royal/Pearl/Midnight, actual illustrated asset bytes and static authentication. No backend, database, session, XP, Bloom, grading or publication rule changes are required for this navigation direction.

Implementation verification must cover all current role/entitlement catalogues and nested owners; zero/one/many subsections; zero/one/many/deep records; unknown/partial/deny/paging; source change; unsent and original-key pending work; English/Arabic, desktop/mobile/tablet, 100%/200% native zoom, keyboard/focus, contrast and hydration. Run affected owner, architecture/docs/repository and appropriate integration/browser checks. The existing full browser CI gate remains separate and failed at this checkpoint; image/source review cannot establish release readiness.

5October approved content-first amendment: WorkspacePageHeading keeps the current content h1 and real optional caption with its existing feature owner; Shell retains main/section/destination focus, reachable focused scroll and one optional generic help disclosure after work. The repeated generic title/body/access badge is removed. Preserve all source/approval/unknown/error/native/draft/command context. See docs/decisions/2026-10-05-content-first-workspace-headings.md through the codebase map. Actual all-role nested visual/functional acceptance and synchronized release remain separately recorded.
