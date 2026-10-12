# Cuevo frontend product, design-system and QA audit

This is the consolidated audit, duplication decision log, design-system reference, regression report and implementation summary for the founder's 12 October brief. The active goal remains incomplete while required CI, populated workflows and connected/hosted/manual acceptance remain open. The audit preserves the current MVP, domain authority, backend contracts and 231 applied migration sources.

## Source and method

The first reviewed increment is [PR47](https://github.com/attaulhaq0/Cuevo/pull/47), signed source `a0d5476517915a9c05af887d357060a841f0e52b`, stacked on unmerged PR46. Subsequent work uses `G:/Cuevo-workspaces/frontend-product-audit/Cuevo` and `codex/frontend-product-audit`. PR47's source, reviews and CI remain frozen; new changes require their own evidence.

The source audit traces actual route composition, feature/public boundaries, session admission, current query envelopes and the original command/draft journal. Current browser evidence uses actual Workspace/feature components and parsers, with controlled source reads and no real provider mutation. It is not a substitute for real Auth/API/DB/RLS acceptance.

## Route and component inventory

The web application is Next.js 16.3.8/React 19.3 with TypeScript, npm workspaces and `@cuevo/ui`. `/` composes authentication/access states or the admitted Workspace. `/account/admission` and `/account/recovery` own their explicit account workflows. The separate `/api/testing/quick-login` route is guarded synthetic/local infrastructure; it is not a remote production sign-in shortcut. Layout, error and not-found are framework boundaries, not extra product destinations.

The authenticated application has 13 query-addressed destinations: Home, School, Learning, Academic, Community, Portfolio, Development, Progress, Next steps, Curriculum, Restricted records, Account and Access. The same capability catalogue supplies Home navigation, focused workspace switching and destination search. Account/Access remain available through Profile/Search rather than being duplicated in the product rail. The 58 potentially admitted role/view pairs and seven exclusions form the existing controlled audit register; exact real membership remains server-authorized.

School, Learning, Academic, Community, Curriculum and Next steps own their real subsections. Record selection, discussion, marking, calendar dates, periods and provenance disclosures stay with each domain. All available sections are recorded separately from selected-record operations; a route screenshot cannot establish every form or mutation.

`Workspace`/`WorkspaceChrome` owns one shell. `WorkspaceTabs` plus the navigation portal owns section presentation. `CommandForm`, `CommandJournal` and `FormDrafts` own important native command/draft/retry mechanics. Shared API/session/query/pagination owners remain distinct from domain parsers and authorization. `Button`, `IconButton`, `Status`, `WorkspaceState`, headings, record/table anatomy and the controlled icon registry already provide a shared foundation.

## Prioritized findings

No new P0 security/data-integrity finding is asserted from this frontend-only audit. Existing hosted blockers remain recorded separately.

| Priority | Observed problem and source | User impact/root cause | Decision and verification |
| --- | --- | --- | --- |
| P2 | Parent Home/Portfolio/Account/School/conversations repeated missing-child guidance; empty Marking offered an unusable selection plane | Repeated explanations/actions and reserved blank space obscured the next usable step | Corrected in PR47; current-child refusal, errors, continuations and native focus retained; independent source/QA reviews bound to 23 committed files |
| P2 | Teacher Home left orphaned desktop shortcuts | Fixed grid width disagreed with the actual admitted item count | PR47 balances current rows without changing catalogue/order/actions; counts 5–9 and actual seven-item screens verified |
| P1 | Academic Gradebook disabled courses sharing a title, even across different classes | Title-only uniqueness prevented otherwise authorized course selection | Corrected with existing public course-caption logic and two current paginated class/subject reads; all three sources must be complete before admission. Bilingual actual-owner regression and original-key/source-refusal checks pass |
| P2 | School/Development summaries referenced undefined `--control-min-height`; Community/calendar controls referenced the same undefined token | Actual School timetable disclosure measured 24px with computed min-height 0 instead of the shared 44px target | Replaced six selector references with existing `--control-min-size`; actual owner now measures44px and retains native disclosure behavior in both languages/themes |
| P2 | IconButton custom guidance remained visible after Escape; it could not receive pointer hover and used undefined `--shadow-sm` | Hover/focus content could obstruct reading and lacked expected dismissal/persistence | One hoverable guidance surface, Escape dismissal while focused or hovered, cleanup on unmount and existing elevation; actual keyboard/action/hover/theme checks pass |
| P2 | Coordinator programme source controls were supplied twice by the connected owner | Loading/error/continuation recovery appeared twice for one query | Removed only the duplicate selector placement; eight bilingual regression cases and 28 affected owner/binding cases pass; programme panel and completeness guards retain authority |
| P2 | Teacher and Administrator Home recovery repeated the same refresh action at the page footer | Two controls served the same source recovery while the top state already supplied it | Keep one refresh when recovery owns it; Administrator partial state retains its footer because its partial notice has no action. Real source errors/continuations remain separate |
| P3 | Unused direct form/query/motion dependencies are candidates for cleanup | Extra packages overlap the actual single shared mechanism | Confirm all authored/import/config/script usage and transitive requirements before changing manifests; no library migration |
| Review | Community selected discussion retains two current room reads | Outer directory read and inner security revalidation overlap | Retain the inner admission guard; any shared read/suspension optimization requires explicit source/refresh/denial analysis and measurement |

Each correction is bounded to its current owner. Unknown source, denied content and missing data remain explicit; no fake chart, workload or task is added to fill an empty canvas.

## Duplication and consolidation decisions

- Retain the single existing shell, capability catalogue, form journal, query owners and token system. Their current source is verified; old documentation describing a permanent sidebar or missing theme integration is historical.
- Retain distinct role Home projections and domain-specific result/publication/guardian envelopes. Similar appearance does not make their source authority interchangeable.
- Retain private file/document consumers until exact download/hash/current-source/object-URL differences are proven safely shareable. Do not consolidate authorization or cancellation rules based on line count.
- Prefer removing repeated source controls and incorrect token names at their existing owners. Do not introduce replacement page shells, generic tables, new UI libraries or a second command mechanism.
- Compare navigation alternatives against the implemented focused model. Home already acts as the role-relevant launcher; the global catalogue is suppressed inside focused work. A new permanent sidebar or launcher rewrite has no demonstrated benefit in this audit.

## Current design-system specification

The [approved palette](../design/2026-10-03-approved-trail-colors-and-background.md) explicitly overrides the brief's default primary-brand suggestion: Royal `#145FE3` is the action fill, Pearl/blue edge communicates selection, Midnight is dark material and cyan `#4FC0DB` remains identity/illustration accent. Status/academic meanings remain independent. [Shared UI conventions](../../packages/ui/README.md) and `packages/ui/src/tokens.css` define semantic colors, typography, spacing, radii, elevation, focus, motion, control size and reading width.

Authenticated styles remain scoped to `.workspace`; approved authentication remains separate. Light/Dark/System use the existing presentation cookie and deterministic server initialization. CSS selects the appropriate decorative background without color inversion. Opaque readers preserve data/text contrast. The same illustrated icon family supplies hidden decoration and explicitly named native controls. Icon-only actions require localized accessible names.

Use existing section headers, record/state/table anatomy and 44px controls. Keep logical CSS, Arabic/RTL and natural record height. Reduced motion and forced colors preserve native focus/selection. Every status states the underlying record truth; draft, submitted, checked, released, approved and unknown are not synonyms. Current confirmation/source/receipt requirements cannot be removed for cosmetic simplicity.

## QA execution and scope

The previous controlled pass captured 116 baseline role/view screens, 186 subsection screens, 64 loading/error screens and ten illustrative populated Homes, with final targeted viewport/full-page checks. The successor captured 232 current theme/locale/viewport screens: all 58 pairs in Dark English desktop/Arabic 320px and Light English mobile/Arabic desktop. Their matrices recorded no page error, horizontal overflow or unmapped route. Contact-sheet inspection is coarse evidence, not full-size acceptance of every small label.

Twenty five-role English/Arabic Light/Dark Search checks verified open, Escape, focus return and scoped axe with no reported violations. Seventy-five existing populated-owner browser cases passed for Learning focus/read revalidation, Academic/Portfolio history refusal, School daily/account recovery and Community pagination. Actual-hook/intercepted-fetch cases are distinguished from injected-query cases in the raw coverage inventory; none proves real provider mutations.

PR47 local types/lint/build, 13 compact/focus and 46 nested cases passed, with 11 overlapping compact cases. School38/Community18 and earlier applicable Home/Portfolio/Marking49 owner tests remain separate. Architecture17/docs7/discovery15 passed. Its own exact managed CI38277116086 attempt1 completed successfully on12October at16:53:37UTC with all22jobs passed. PR47 remains open and stacked; this is not an integrated-main or hosted result.

The successor's current checks include12 shared-control regressions,9 Gradebook/Marking browser cases,20 Gradebook owner cases,28 Coordinator owner/binding cases and39 Teacher/Administrator Home owner cases. A49-case shared-control/Gradebook/sign-out/tab-focus run passed; its21 control/Gradebook cases overlap the separate smaller runs, so totals are not added as unique coverage. The Gradebook20/9 checks were repeated after the final raw-zero-row correction. Independent review caught and corrected tooltip text activating its enclosing button; pointer text and bridge clicks now keep action count zero while native Enter remains usable. It also caught an omitted Gradebook owner suite and stale-source empty-state regression; source-specific fixtures and the original raw-zero-row condition are restored. Types/build were rerun after the tooltip type correction; final evidence binds subsequent checks to actual final files.

Representative before/after evidence is saved under the current audit's `base-targeted` and `final-targeted` directories for the same Gradebook/Coordinator context, and `control-probe/before-base-controls.png` versus `after-final-controls.png` for actual School disclosures. Four Teacher/Administrator recovery screenshots additionally exercise native focused Enter and verify one refresh after the current read. These controlled records remain illustrative source inputs, not actual school accounts.

The shared tooltip's historical default title is removed so one guidance surface remains. Pointer content uses a small hover bridge, and its text/bridge cannot activate the enclosing owner button. Escape handles the currently visible surface without consuming the caller's event; the listener and ref stay inside the UI owner and clean up on unmount. A stricter remount check reproduced a delayed mouse-enter resetting dismissal while focus remained on the action. The corrected handler resets guidance only for a fresh unfocused hover; keyboard refocus remains usable. The exact event trace, failed checks and final four-locale/theme lifecycle checks are retained separately. No query, command, native clock or domain policy changes were made by that correction.

Raw screenshots, failed/successful probes, source inventories and test logs remain ignored under `.local/senior-frontend-audit`; checkpoint records exact hashes. The first control-probe setup used a wrong timetable field and timed out before measuring a summary. The corrected actual-owner probe measured the 24px disclosure and persistent tooltip; the setup failure is not a product failure or a passing test.

## Remaining gates and implementation status

Current fixes and the above findings do not finish every populated nested workflow, inverse viewport/theme/zoom combination, real source change/uncertain-command path or manual assistive-technology review. Real Supabase Auth/API/DB permissions, private delivery, learner/guardian records and consequential mutations remain connected acceptance gates.

PR46's Community body-abort cause remains unknown; its rejected HTTPS reproduction is not retried or rerouted. Supabase's current accepted private-transport predicate still fails; actual managed-owner correction is required before original231 metadata completion with zero SQL replay and subsequent two-school/133-account/runtime/web provisioning. Failed-main schema-only evidence cannot authorize a changed frontend or operating runtime.

The [implementation plan](../superpowers/plans/2026-10-12-frontend-product-qa.md) and existing active goal track corrections, review, CI and these remaining checks. No readiness percentage, all-duplicates-gone claim or customer-launch acceptance is made.
