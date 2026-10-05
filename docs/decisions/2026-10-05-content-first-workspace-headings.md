# Content-first workspace headings

Founder selected on5October2026: content-first headings for directories and small real context captions where a record needs orientation, retaining the approved focused navigation, header, icons, Royal/Pearl/Midnight palette and natural scrolling. The supplied directory image is visual evidence, not production test wording or record content. This extends the existing [focused navigation decision](2026-10-05-focused-workspace-navigation-slot.md) and [goal acceptance](../design/2026-10-05-redesign-goal-acceptance.md).

## Ownership

`packages/ui` owns `WorkspacePageHeading`, a visible focusable h1 with optional caption, description and same-section actions. The feature invokes it directly from its admitted current source or localized loading/unknown fallback. Multiple records remain subheadings. `WorkspacePageProvider` composes optional generic workspace explanation after its children in one closed native disclosure; it holds no source, title registry, callbacks, requests or record state.

Shell removes the repeated greeting/workspace title/body/access badge above each owner. It retains the main landmark, focus on the current main h1 after deliberate navigation, profile/search/back and the same feature components. Account/Access have Shell-owned content headings. Focused main is keyboard reachable with tabindex0 because its desktop scroll area can contain static records without any otherwise tabbable controls; Home remains its existing page-flow landmark. This does not imply new authorization, mutation, auto-selection, disclosure of private sources or disabled protected offline caching.

Directory roots display the current section, while selected views may use exact human record names and their real broader context. A feature whose nested source remains independently owned keeps a useful section h1 and that source’s h2; it must never infer the selected title by DOM scraping or copy source state into Shell. Child/class/course/date/revision and publication/review/rights/approval/receipt/unknown/error facts remain with their current owners. Generic help must not contain the only instruction needed to operate a workflow.

## Verification boundary

Verify one descriptive visible h1 in each admitted root, exact-selected, loading, empty, unknown, offline and denied state; retain source-aware heading focus, current drafts, original-command locks and keyboard scroll/Back. Compare EN/AR desktop/tablet/mobile/zoom, long labels, native states, contrast/axe and hydration console evidence. Source/render tests alone do not establish all-role nested acceptance, synchronized release or hosted readiness. The current acceptance register records each dimension separately.
