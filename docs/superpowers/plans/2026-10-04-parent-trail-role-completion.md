# Parent Trail role completion implementation plan

> **For agentic workers:** Use the existing owner boundaries and implement one task at a time with independent source review. `superpowers:subagent-driven-development` or `superpowers:executing-plans` may organize execution; the root owns runtime, build and final acceptance. Steps use checkboxes to record actual completion.

**Goal:** Complete the selected Parent journey with clear approved feedback, school dates/support, approved portfolio work and current school conversations using the existing application and APIs.

**Architecture:** Keep Home, Academic/Progress, School, Portfolio and Community as the sole owners of their current reads and actions. Share the existing ChildSelector, private source envelopes, native result renderer and command journal. Add selected-record presentation inside those owners; do not create a second dashboard, event store, message engine or parent authority.

**Tech stack:** Next.js 16, React, TypeScript, existing `@cuevo/ui` Trail components/tokens, existing API contracts and shared session/forms/pagination. No dependency or database change is required by this plan.

**Spec:** [Approved role compositions](../../design/2026-10-03-approved-role-compositions.md), [Trail migration specification](../specs/2026-10-03-cuevo-trail-mvp-redesign.md), [approved colors/background](../../design/2026-10-03-approved-trail-colors-and-background.md), and exact [Parent references 042–048](../../design/references/README.md). The latest founder instruction authorizes Teacher completion followed by Parent, Coordinator and Admin, with final review at the end. A stale intermediate approval paragraph in the composition document is not a new approval gate; root owns its correction.

## Saved scoped checkpoint — 4 October 2026

The Parent implementation is saved in `1e58471`, with two positive integration-fixture corrections in `e1828f5`. Home, approved report/Progress, School calendar/operational context, selected approved Portfolio and child-scoped conversations use their existing owners. Current denied continuations withhold retained records; original create/send/read/report actions recover their exact keys and payloads. Parent reports enforce publication approval on every page/export, and fresh result links retain child selection. Approved text/file readers, native zero/rubric values, source dates and current event/publication limits are preserved.

The frozen preview `ynckDai4LuiIt-ICa5RHz` passed 532 web tests, typecheck/lint/build and architecture/docs/repository checks. Scoped browser evidence includes Home current/denial/keyboard/native zoom, calendar/source continuations, selected text/file work and downloads, conversation original-command recovery and report/evidence/publication failures. Eleven focused actual Auth/API/database/Storage cases passed in rollback tenants for school context, calendar maintenance, conversations and publication revocation during file delivery. Earlier duplicate-identity positive fixtures correctly failed current server guards; the test correction retained those guards and separate denial cases. This is a scoped migration checkpoint, not Gate 5, official curriculum, hosted or complete customer acceptance. The complete cross-role journey and final founder review remain open while Coordinator and Admin proceed.

## Execution boundary and source facts

This plan was prepared read-only against design worktree `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo`. Root froze the scoped Teacher checkpoints through `c6c7e18` on 4 October and delegated Parent Home and Portfolio. Their focused source, browser and isolated API evidence does not establish Gate 5 or full customer acceptance. Preserve `G:/Cuevo`, Auth and the saved Teacher work. Root alone builds/starts/stops the isolated preview and arranges real API/DB/relationship/publication checks. Intercepted presentation evidence never becomes live acceptance.

Read root/web instructions, `docs/product/context-map.md`, `docs/codebase-map.md`, owner READMEs, sources14/18/19/36/37/39/43/63/80, exact tests and locked synthetic curriculum artifacts. Sources17/04/16 apply to Academic/Portfolio work. Missing teacher/unit/approval-time/coverage facts remain unavailable; use no invented values or live curriculum lookups.

The seven originals were opened individually. They are 1536×1024 composition evidence, with approximately 50px outer body margins and 18–24px gaps. Retain the actual current header, icons, Royal/Pearl/Midnight materials and background. Use responsive flow rather than copying fixed empty heights. Home 042 and overview043 are one journey; Progress044 does not authorize the pictured private baseline/follow-up comparison. Portfolio046 supplies a wide feedback/reflection/work reading plane. Messages047 supplies list → selected thread → factual context; attachments and server-saved drafts remain unsupported. Calendar048 supplies date/month → actual selected event; fabricated categories, course/task links, teachers or rooms remain unsupported.

## Current child selection: avoid an unnecessary global full-directory gate

`useChildContext` and `ChildSelector` already consume the current guardian-authorized directory. An explicitly selected child on a successful loaded page can be legitimate while a later directory page remains available. Do not impose `nextCursor === null` on every Parent read merely to browse more children. Continue to show directory paging and treat additional children as unexamined choices.

Require a current resolved child, a successful current directory frame and an unambiguous **loaded** human label before mounting dependent private content. A loading/access-generation frame or current directory error hides dependent reads. A continuation error must remain explicit; decide whether it invalidates an already verified selected child from actual server contract and identity evidence, not from a generic “all pages complete” rule. Automatic single-child selection already waits for no remaining cursor. If identical current loaded names/class labels cannot be distinguished, show review rather than an ID suffix. Root should verify whether a new duplicate on a later page must clear the selection; the current helper already does so on the loaded set.

Pure test examples for the affected owner:

```ts
assert.equal(selectedParentChild({ loaded: true, loading: false, error: null, nextCursor: later }, childA)?.id, childA.id);
assert.equal(selectedParentChild({ loaded: true, loading: false, error: denied, nextCursor: later }, childA), null);
assert.equal(selectedParentChild({ loaded: true, loading: true, error: null, nextCursor: null }, childA), null);
```

`selectedParentChild` is a task-local helper only if needed by more than one changed Home/Community call site; do not add a global session abstraction for a single use. Preserve actual ChildSelector selection authority and API reauthorization.

## Task 1: Make Parent Home truthful about the selected available record

**Owner/files:** Modify `apps/web/features/home/components/parent-trail-home-connected.tsx`, `parent-trail-home.tsx`, `parent-home-binding-model.ts`, `parent-trail-messages.ts`, `parent-trail.css`, owner README; extend `test/parent-home-binding.test.ts` and existing Parent view/render tests. Keep root role routing and shell unchanged.

**Current contract:** `/v1/learners/:id/academic-report?limit=25` is `CURRENT_RELEASED_PAGE`, with exact school/learner/publication, native result, assessment/reference title, source `createdAt` and actorId. It does not provide teacher display name, course/unit or approval timestamp. Portfolio items require `REVIEWED`, parentVisible and exact child. Calendar is current guardian-authorized; school-wide events remain school-wide. Announcements are general approved school updates across current children unless source attribution says otherwise. Home already consumes the exact-child conversation list query supported by `conversationQuerySchema`.

- [ ] Add failing model/render cases for wrong child, withdrawn/private result, unavailable supporting source, a school-wide event, later-page results and same-name child ambiguity.
- [ ] Run the focused cases and observe the intended failing behavior before edits.
- [ ] Replace unconditional “Latest approved feedback” claims with “Selected approved feedback”/“Available approved feedback” when the report has continuation or failed continuation. A global latest claim requires the complete current comparison set. Do not auto-load every source to manufacture a summary.
- [ ] Preserve 042 feedback → explanation → report action → exact native/source context in one reading plane. Use existing exact Academic result navigation. Keep teacher/date unavailable states honest.
- [ ] Replace upcoming `description: child.displayName` with actual source class context or localized school-wide context. An event at `classId:null` must not be attributed to the selected child. Keep general announcement fallback identified as school communication.
- [ ] Keep lower loaded-record disclosures/paging usable and labelled, with errors beside their source. Do not turn failed reads into “nothing to do.”
- [ ] Verify Home desktop1536/1366, short laptop, EN/AR390/320 and 200% zoom with the same real selected records; no duplicated header or filler support advice. Commit only this owner checkpoint after root approval of evidence.

Suggested assertions:

```ts
assert.equal(parentHomeEventContext({ classId: null, className: null }, labels), labels.schoolWide);
assert.equal(parentHomeFeedbackHeading({ nextCursor: cursor, moreError: null }, labels), labels.availableFeedback);
assert.throws(() => parseParentHomeReport(privateResult, schoolId, childId), LearningApiError);
```

The final assertion checks the existing strict parser behavior; private records never become an undefined result silently.

## Task 2: Preserve exact Parent approved report/progress context

**Owner/files:** Review `apps/web/features/academic/components/academic-workspace.tsx`, `results.tsx`, `native-result.tsx`, and Progress `components/progress-workspace.tsx`, `components/report-export.tsx`, `report.ts`; change only selected Parent presentation/copy/styles actually required by044. Extend their existing exact-child/native/publication/report tests. Existing Academic was accepted during Teacher work; do not reopen its mutation engine.

**Current gate:** Exact released numeric/rubric sources, current Parent sharing and current guardian relationship remain server-owned. `APPROVED_PROJECTION` excludes private support/impact, habits/XP and raw intelligence. Current report page and period export scope do not establish full curriculum coverage. Source date is source creation/submission as contracted; no teacher name is borrowed from conversations.

- [ ] Capture the current selected result and report at the reference viewport; record concrete mismatch before changing code.
- [ ] Use the existing `NativeResultView`, feedback and source description in one wide approved-result plane. Keep unknown coverage in its separate small context plane; no new baseline/follow-up comparison or attainment calculation.
- [ ] Retain exact result/source intent, current result/publication revisions, page continuation and current authorized export. No broad result directory is added for Parent.
- [ ] Verify numeric recorded zero, native rubric full descriptors, wrong-child/malformed source, current Parent revoke and delayed export after child/access change. Run `academic-report`, `result-parent-publication` and Parent Progress cases in root’s isolated window.
- [ ] Leave this owner unchanged if the current composition satisfies044 within current contract; document that decision with matching capture rather than editing for its own sake.

## Task 3: Give Parent dates a selected event/agenda composition in School

**Owner/files:** Modify `apps/web/features/school/components/school-day-records.tsx` and `school-workspace.tsx` only at their Parent composition boundary; add a focused browser-safe model/component under School only if the calendar unit materially grows the current owner. Modify `day-messages.ts`, `styles.css`, README; add `test/parent-calendar.test.ts` and extend `current-source.test.ts`. `parent-learning-support.tsx` and `parent-support-model.ts` retain their existing source/course authority.

**Current gate:** Reuse `/v1/school/calendar?limit=...&learnerId=child`, current school policy and enrollment filtering. No day/month query or event mutation is introduced. Existing source rows carry class/title/description/start/end/revision/publication. `classId:null` denotes school-wide scope. Parent cannot configure calendar, attendance or support approvals.

- [ ] Add failing pure cases for date validation, multi-day event overlap, timezone-labelled source dates, school-wide scope, exact selected event, child A→B and partial empty date. Reuse the strict date-roundtrip pattern already tested by School.
- [ ] Keep one date/month selection with post-hydration initial date. On desktop use a readable month/date overview and selected event detail; at mobile use a compact date control/agenda with selected detail below. Both consume the same current source rows and selected event key.
- [ ] Month navigation changes presentation over loaded rows; it does not claim there are no events outside those rows. Keep current paging/error states visible and allow continued retrieval.
- [ ] Show actual event title/start/end/class/description; omit unsupported categories, curriculum focus, teacher, room and portfolio/event links. “Open event” opens inline detail unless the source provides a verified existing destination.
- [ ] Keep timetable/recorded attendance separate and policy-gated; an empty event date is not absence or completion. Existing Parent support still selects an exact current course and displays only active published instructions with UTC effective dates.
- [ ] Verify source failure, more-page failure, wrong-child late read, policy disabled, withdrawn event/support and guardian revoke. Root runs `customer-school-context`, `parent-learning-support`, `school-maintenance` and calendar browser cases separately from intercepted layout evidence.

Suggested selection signature:

```ts
type ParentEventSelection = { childId: string; eventId: string };
function currentParentEvent(selection: ParentEventSelection | null, childId: string, events: ScheduleRow[]): ScheduleRow | null;
```

This function returns only a row already admitted by the current owner; it never authorizes the source.

## Task 4: Select one approved portfolio item while preserving the source-work owner

**Owner/files:** Modify `apps/web/features/portfolio/components/portfolio-workspace.tsx` at Parent list/detail branch, `presentation-model.ts`, `messages.ts`, `styles.css`, README; create/extend selected Parent presentation tests. Reuse `components/source-work.tsx` and artifact download current guards. Do not duplicate item/source-work query or renderer.

**Current gate:** Exact child/item/revision; Parent item is `REVIEWED` and parentVisible. Source text/files require `sourceWorkApproved`; file access stays private and current reauthorization applies. Parent gets no reflection editor, review, revoke, organisation mutation, general locker or unshared history. Current approved reflection and feedback are separate source facts.

- [ ] Add failing pure/render tests for selected item A vs B, same title with real task/date/revision context, unreviewed/private item, wrong child, missing identity and source-work approval false.
- [ ] Keep an approved-item directory with human task/date/revision labels; open one selected item. Main reading order is approved feedback → actual reviewed reflection → approved selected work. Factual source/date/native context stays beside it on desktop and below it on mobile.
- [ ] Parent selection uses IDs/revision only as working intent; no protected item snapshot is cached. Refresh revalidates current item/revision/publication; changed/withdrawn selection clears detail and gives recovery.
- [ ] Home’s portfolio action may open the Portfolio owner generically until a reviewed exact item navigation surface exists. If adding one, extend the documented `NavigationIntent` union and tests with one owner/source pair; destination reauthorizes it. Do not smuggle item content through navigation state.
- [ ] Keep every loaded approved item and continuation reachable. Use the one existing `PortfolioSourceWork` when explicitly opened, with existing focus/download/source guards.
- [ ] Root verifies `portfolio-sharing-recovery`, `customer-portfolio-text-work`, Parent revoked publication, current document download and wrong-child late read, plus EN/AR/mobile/zoom/axe.

## Task 5: Make Parent conversations fit selected child context without moving pending commands

**Owner/files:** Modify Community `components/parent-conversations.tsx`, `conversation-thread.tsx`, `conversation-state-model.ts`, `conversation-model.ts`, `conversation-messages.ts`, `styles.css`, README and their tests. Community workspace composition may pass the existing selected child; keep Teacher/Admin conversation behavior intact.

**Current contract:** `conversationQuerySchema` already supports optional `learnerId`. Actor-authorized conversation list/choice/thread/message/report/paused state remains current server authority. Plain-text body maximum is4,000; there are no supported attachments, server-saved drafts or “Review draft” command. A committed message receipt establishes in-app availability only; delivered/read/notification claims require their actual receipts.

- [ ] Add failing cases for Parent thread belongs to childA while selection childB, same-title threads, wrong parent, paused policy, exact current thread identity and pending create/send original payload through child switch/revalidation.
- [ ] Use current selected-child composition for the Parent list query/filter and create choices, with a visible exact child name. A generic actor-wide list is legitimate when explicitly labelled across children; do not stamp it as the selected child. Choose one clear current mode and avoid duplicate lists.
- [ ] Render list → one current thread → factual child/class/subject/participants. Desktop may keep directory beside selected thread if it does not duplicate queries/commands; mobile keeps back-to-list and one reachable composer.
- [ ] If child changes while an original create/send is pending, retain the original command in its own thread/context and give an explicit recovery view; freeze dependent selection or require returning to that original context for reconciliation. Never restore childA body/consent in a childB composer.
- [ ] Keep typed unsent message drafts keyed to existing exact choice/thread; source/actor/denied clearing and current receipt validators remain decisive. Refresh is read-only and must remain reachable on denied/unavailable recovery without enabling a new action.
- [ ] Root verifies actual `parent-conversations`, concern reporting, visible/hidden message states, current policy disable, participant/guardian revoke, unchanged-key replay and delayed prior actor/child responses; then 1536/390/320 EN/AR keyboard/axe/zoom screenshots against047.

## Task 6: Root integration and acceptance

- [ ] Before each owner edit, freeze other active patches and record current Git status. Exclude unrelated dirty Curriculum/shared API candidate until its own gates pass.
- [ ] Run owner tests, `npm run typecheck --workspace @cuevo/web`, focused lint, `npm run check:architecture`/`test:architecture`, `check:docs`/`test:docs`, and structural repository checks if files/interfaces move.
- [ ] Build only from a root-confirmed frozen source; compare source hashes before/after. Run intercepted browser source cases as presentation-only evidence with all remote/domain writes blocked or explicitly synthetic intercepted.
- [ ] Compare matching approved reference/state/viewport and actual current render. Include1536/1366 short laptop,390/375/320, light/Midnight, EN/AR, native200% zoom, enlarged text, keyboard/return focus,44px targets, axe and hydration console warnings. Check pending/denied/partial/empty/unknown/source-changed states, not only the seeded happy path.
- [ ] Run real current guardian/publication/source/readback/deny/API/DB cases in the owned isolated runtime. Restore the guarded synthetic environment; never sanitize customer-authored content or report fixture data as real adoption/attainment.
- [ ] Update owner README/codebase navigation only for actual new public surfaces or moves; preserve root Markdown limits and exact source identities. Commit one coherent owner after verification; final Parent acceptance remains open until all five owner journeys are checked.
- [ ] Continue Coordinator and Admin after the Parent checkpoint, preserving founder’s final-review order. Do not declare all-role redesign, Gate5, official curriculum or production acceptance from this plan, screenshots or local tests.

## Plan evidence and deliberately excluded work

The plan is authored documentation, not implemented Parent acceptance. It was derived from current source owners and originals042–048. Earlier Child-directory recommendation was narrowed: full directory traversal is required only when an actual completeness/ambiguity claim needs it, not to use an already verified selected child. General announcements and school-wide dates stay unattributed. Unsupported comparison, attachment, draft, calendar-write, AI-support and record-name fields are omitted. Auth and the one Trail system remain unchanged.
