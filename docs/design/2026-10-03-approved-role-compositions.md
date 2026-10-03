# Approved Cuevo role compositions

3 October 2026. This document records the founder-selected Student, Teacher and Parent body layouts for the existing Trail redesign. The direction is approved; this document does not claim those complete journeys have been implemented or accepted. The [migration specification](../superpowers/specs/2026-10-03-cuevo-trail-mvp-redesign.md) and [implementation plan](../superpowers/plans/2026-10-03-cuevo-trail-implementation.md) remain the execution entrypoints. Numbered product sources and current protected contracts determine supported behavior.

The reference review used the design worktree on `codex/cuevo-design-system` at `726618c`. An unrelated uncommitted Curriculum candidate remains unaccepted and is excluded from this documentation checkpoint. The separate backend checkout and its services/database must not be interrupted.

## Shared foundation and retained presentation

Retain the current global header, account/search/Appearance/sign-out mechanisms, official logo, illustrated icons and individual illustrations. Authentication remains the approved static desktop/tablet Learning Studio and compact single-Foxi mobile composition. No new application, alternative renderer, role-specific token system or duplicate form/API owner is authorized by these references.

Use the [approved palette and background rule](2026-10-03-approved-trail-colors-and-background.md): solid Royal blue primary actions, Pearl + blue edge selected controls, existing semantic status treatments and the dedicated Midnight Trail dark source. The references' older flat icons, cyan navigation selections and gradient controls are superseded. All roles use the one decorative background owner with opaque readable content panels.

| Layer | Current owner and responsibility |
|---|---|
| Semantic typography, spacing, radius, color, focus, density and motion | `packages/ui/src/tokens.css`; one shared foundation, not independent Student/adult systems. |
| React primitives and illustrated icons | `@cuevo/ui` Button, Status and CuevoIcon; 39 semantic icon names at this checkpoint. Shared CSS also provides field/form/tab/table anatomy. This is not yet a complete library of every page layout. |
| Logo, foreground illustrations, character poses and background | Existing browser-shared assets/characters registry. Decorative presentation grants no academic, reward or access authority. |
| Header, permitted workspace navigation and theme | Existing Shell with shared session/capability mechanisms. Search currently finds permitted workspaces; the picture does not establish search across all records. |
| Scoped requests, child selection, drafts and command recovery | Existing shared hooks, ChildSelector, API client, CommandJournal and CommandForm. Preserve original keys/payloads and current access invalidation. |
| Role and domain compositions | Existing Home, School, Learning, Academic, Progress, Improvement, Portfolio, Community and other feature owners. Domain fields, approval, mutation receipts and source validators stay with their owner. |

The foundation is widely used, while larger selected-record/context/decision layouts are unevenly migrated. Generic learning/detail CSS still influences multiple owners. Consolidate repeated anatomy as its consumers migrate; do not introduce a speculative universal dashboard engine. Shared code must not import feature implementation.

## Selected Student composition

The founder selected `C:/Users/hp/AppData/Local/Temp/codex-clipboard-3b3a30ad-ef42-45b5-91aa-9aae81c8fbc3.png` for the lower Student sections. Preserve the current header, Trail scene, task-edge Foxi, independent task/pedestal/journey assets and hide/quiet preferences. Keep the current goal and task above; make daily work, released feedback, actual dates, recorded milestones and approved updates visible below instead of presenting all current records as closed history.

Use actual own tasks, released native results, approved practice, goals, events, notices and source-backed recognition. An all-clear statement requires complete current work-source evidence. A date tile requires an actual authorized event. Partial/error/unavailable reads cannot establish either; recorded zero remains distinct from unavailable or disabled recognition. No illustrated reward, unit, teacher, event or completion state becomes a frontend default.

## Selected Teacher compositions

The founder supplied 29 Teacher references in `G:/1 approch UI`, covering 017–033, 067–073, 079–080, 085, 092 and 098. Their exact paths, dimensions and SHA256 hashes were recorded in the external Teacher reference manifest; all 29 were inspected. Their selected-work/editor/context relationships determine body composition beneath the retained current header.

| References | Intended composition | Existing ownership and capability boundary |
|---|---|---|
| 017, 018 classes and class detail | Named directory → selected class/task/evidence context | School/Learning/Home/Progress; reuse current human context and source projections. |
| 019, 020 planning and editor | Local outline → one activity/lesson editor → current objective/source context | Learning content and Curriculum period planning. Rich text, drag/reorder and separate notes require existing contract support. |
| 021, 067 assessment preparation | Exact private assessment/quiz context → explicit publication review | Existing preparation/quiz/availability/resources. Checked quiz answers remain separate from authoritative grades. |
| 022, 068 marking | Original work → native numeric or complete rubric → human feedback/review | Academic marking. Small integer choices only where the actual scale permits them; arbitrary maxima use native input and rubrics never become a scalar. |
| 023 evidence | Exact source work beside released native result, recorder/date/feedback | Academic EvidenceDetail and current document source. Preserve revision identity and unavailable label recovery. |
| 024, 025 profile and signals | Human learner context with academic, observed and support sources separate | School/Progress/Attention. No behavior/ability composite or guessed trait. Current attention stays visible. |
| 026, 027, 070 proposal review | Evidence → possible interpretation → proposed practice → human reason/decision | Improvement proposal/decision. Origin, mode and uncertainty stay explicit. Changed source resets new consent; original retry remains exact. |
| 028, 029, 071 practice and measurement | Exact practice → compatible released follow-up → native observed outcome | Improvement/Academic. No causal claim from observed change or completion before confirmed receipt. |
| 030, 031, 073 communication and moderation | Named current thread → readable timeline → explicit proportionate action | Community/Conversations. No unrestricted student messaging, invented attachments or moderation authority. |
| 032, 033 calendar and attendance | Current class/date → selected operational record/action | School. Calendar projects existing records; no invented meetings or mark-all behavior. |
| 069 release and correction | Exact reviewed result → independent Parent sharing decision → immutable history | Academic. Student release cannot depend on Parent sharing; current record-specific publication stays authoritative. |
| 072 portfolio review | Exact source/reflection → explicit review and family visibility | Portfolio. Parent visibility is current publication of the exact reviewed revision, not inherited approval. |
| 085 native reporting | Native source report separate from proposed narrative | Academic/Progress support current factual reporting; automated narrative/transcript generation and official claims remain separately gated. |
| 092 restricted follow-up | Authorized purpose-bound factual note/manual review | Restricted records only; wider wellbeing, team cases and retention/compliance automation remain future scope. |
| 098 Teacher mobile | One current review action first; source evidence separately below | Home and the same domain owners/actions; mobile-specific reading order with complete context/recovery. |
| 079, 080 governed assistance | Future planning copilot/assessment drafting direction | These pictures do not establish completed current planning/assessment assistance or authorize new MVP controls. |

A local course outline belongs to the selected Learning workflow; it is not a permanent application sidebar. Desktop outline/editor/context relationships become selected record, primary action and secondary context in stacked panels or an explicitly opened sheet on mobile.

## Selected Parent journey

The seven founder-supplied Parent PNGs are all 1536 × 1024. They describe views and states of one Parent journey across existing feature owners, not seven new routes or another app. The Home and child-overview references overlap; use one current Home composition and existing selected-child/report context rather than duplicate dashboards.

| Exact reference | Selected body composition | Existing owner and current scope |
|---|---|---|
| `G:/1 approch UI/042-parent-home-desktop.png` | Large approved-feedback reading plane; compact upcoming and communication beside it; approved portfolio and school support below | Home `parent-trail-home.tsx` / `parent-trail-home-connected.tsx` / `parent-home-binding-model.ts`. Academic report, current portfolio, shared calendar, conversations and school support retain their owners. |
| `G:/1 approch UI/043-parent-child-overview-desktop.png` | Exact child identity; selected approved feedback/native result; source context; current review date and portfolio beside it | Shared ChildSelector/use-child-context, Home, Academic and School. This is selected-child context in the existing journey, not a second Home implementation. |
| `G:/1 approch UI/044-parent-progress-desktop.png` | Wide approved-feedback/native-result plane; source/date context aside; separate coverage and report action | Academic approved reports/released results and Parent-safe Progress state. Preserve native values, unknown coverage and exact Parent publication. |
| `G:/1 approch UI/045-parent-upcoming-desktop.png` | Selected actual school update or shared work; next authorized date, context and help beside it | School school-day-records / parent-learning-support and Community parent announcements. Reuse existing published information; no new assignment or event authority. |
| `G:/1 approch UI/046-parent-approved-portfolio-desktop.png` | One selected approved portfolio item; source feedback, actual reviewed reflection and selected-work action; factual record context aside | Portfolio workspace/source-work, exact current child/item/revision parser and private-file/document owners. Parent gets no reflection editor, review, revoke or unshared history. |
| `G:/1 approch UI/047-parent-messages-desktop.png` | Named conversation list → one selected thread/timeline/composer → optional factual child context | Community parent-conversations / conversation-thread / conversation model and state model. Current school-scoped Parent–Teacher communication already exists; retain its policy, choices, current participant authorization, receipt and delivery rules. |
| `G:/1 approch UI/048-parent-calendar-desktop.png` | Authorized month/date selection → selected event detail; compact related context | School current calendar projection and school-day-records. This is a view over published current events, not a second event store or calendar mutation owner. |

### Reference geometry and content density

At the reference viewport, body margins are approximately 50px and panel gaps 18–24px. Heading/child context occupy roughly y=110–215, with main panels beginning near y=230. Adapt these relationships below the actual retained header; do not duplicate the pictured header or copy absolute positioning into the app.

Home/overview use a main/context ratio near 1.65:1; Progress near 2.2:1. Portfolio uses one wide selected item and a narrower source context. Messages uses approximately 353/674/378px list/thread/context columns; Calendar approximately 886/551px month/event panels. These are measured composition references, not fixed-width requirements at every viewport.

For Home 042, keep the feedback hierarchy: teacher context → actual feedback → plain-language explanation → report action → native result/source context. Overview 043 places its report action in the lower source panel; Progress 044 keeps the native result inside the main reading plane with the report action below. In Portfolio, keep approved feedback, reviewed reflection and selected evidence distinct. A report, reflection, event and school update do not become interchangeable generic cards.

The Upcoming reference leaves considerable unused space below its action. Do not reproduce that fixed empty panel height. Omit unsupported promotional/future cards instead of filling gaps. Long real feedback, rubric criteria, events and conversations grow in normal flow; natural scroll for those records or enlarged text remains necessary. Review summary density at normal laptop use without clipping or hiding important records.

### Parent data corrections required by current contracts

- **Native progress:** the pictured 2/4 → 3/4 and +1 comparison is not present in the current Parent projection. Render the exact released numeric/rubric result. Comparison anatomy is conditional on explicit current Parent-safe authority for both compatible records; no private intervention outcome, habit/XP or raw intelligence is borrowed to populate it. Unknown coverage is separate from a known result.
- **Date and teacher context:** current academic reports expose source `createdAt`, `actorId`, assessment/reference titles and native values, but not a teacher display name, course/unit or an approval timestamp. Label the source date truthfully. Portfolio provides its exact reviewed revision/date and learner/class/year/course/task/submission context, but not reviewer display name or unit. Show missing names/context as localized unavailable; never infer approval date from result creation, join a teacher from a conversation, or expose actorId as a label. Additional context requires a reviewed authorized projection through the existing owner.
- **Publication:** teacher release, exact Parent sharing and exact reviewed portfolio revision are separate facts. Use current server publication authority; withdrawn/revoked/unreviewed work must disappear on access revalidation. Browser hiding is not authorization.
- **Communication:** the pictures' future-inbox caption is outdated relative to current Parent–Teacher conversations. Reuse the implemented policy/participant/creation/message/read/report-concern/paused flow. The policy defaults disabled; the plain-text message contract permits up to 4,000 characters. The pictured attachment, server-saved draft, Review draft and overflow extras are not established by current contracts; omit them. Existing memory-session draft/retry behavior remains in its current owner. Nothing is sent automatically; committed in-app availability does not prove email/push delivery.
- **Child scope:** exact current child selection must govern report, portfolio, support and attributed events. The conversation owner currently lists actor-authorized conversations across children; any selected-child composition needs explicit current-child filtering/selection validation, without changing server authority or relabeling a different child's thread. A pending original command must not be rebound to a replacement child.
- **School announcements:** the Home announcement URL is guardian-authorized across current children. Stamping a response with the selected child does not prove every announcement is about that child. Label these general approved school updates unless actual class/current-child evidence permits attribution.
- **Calendar and upcoming:** reuse the existing current published-event and selected-child enrollment filtering. School-wide events remain school-wide. Event title, dates, class, description and any supported time/location come from the actual source. Do not invent learning-review categories, event/portfolio links, teachers, rooms or calendar color classes. An event uses an inline detail action unless an authorized source supplies a real destination.
- **Support:** use School's explicit course/current-child support projection and effective dates. Do not derive advice from private telemetry or substitute the reference's fictional instruction. Duplicate course names require real available context; ambiguous choices stay unavailable with recovery.
- **Latest/next:** incomplete pages, errors or unavailable reads cannot establish a global latest result, next event or all-clear state. Either load the required current source or label the visible selection as an available loaded record. Keep pagination and failure recovery visible.

### Parent mobile composition

Use the same source/action/form implementation with a different reading order. At narrow widths, child selection and the current approved record/action come first; native values and source context follow; actual upcoming/portfolio/support records remain accessible below. Do not squeeze desktop context tables into tiny horizontal cards.

Messages should move from the thread list to one selected thread with a clear back action; optional context is below or in a deliberate sheet. Keep the supported composer reachable above the keyboard and preserve original-command recovery. Calendar should use an agenda/selected-date list and compact date control at narrow widths instead of seven columns of tiny event text. The month and agenda share the same events and selection authority.

## Implementation sequence and acceptance

1. Reconcile reviewed stable canonical source/context changes through Git before each affected owner. Preserve current Auth/header/assets and exclude unrelated unaccepted work. Do not reset the other chat's database or stop its services.
2. Improve repeated record heading/context/selection/reading/decision/state anatomy in the existing design system as actual consumers need it. Remove superseded owner rules in the same change. Keep Student, Teacher, Parent, Coordinator and Admin information architecture distinct.
3. Implement the approved Student lower sections in Home, then complete Teacher owner workflows against the 29 references. Prepare Parent desktop/mobile reference comparisons within the same staged redesign, keeping existing action owners.
4. Parent delivery proceeds through Home/current child → approved report/progress → School upcoming/calendar/support → exact portfolio → conversations. The selected directions do not need another visual-selection approval. Show each connected owner checkpoint for correction; do not declare all-role acceptance from a Home/story/image pass.
5. Verify current child A→B, access-generation change, revoked guardian relation, withdrawn publication, wrong-child/late response and partial/paged/error/offline states. Validate permitted report/item/native source and current event/course/thread identity. Preserve unsent and pending original commands without moving their content or consent to a new child/source.
6. Check same-viewport reference/render comparisons, light/Midnight, EN/AR RTL, normal 1536/1366 and short laptop screens, 390/375/320px mobile, 200% native zoom, large text, keyboard/focus/return, 44px targets, axe and hydration console warnings. Keep numeric scale direction and semantic dates intact.
7. Run meaningful affected owner tests, typecheck/lint/build and architecture/docs/repository guards. Actual API/source/readback/publication/deny/DB verification requires an owned isolated runtime; intercepted presentation evidence must stay labeled separately. No complete redesign or Gate 5 claim while those gates remain open.

Useful existing regression owners include Home parent-home-binding tests, shared child-context tests, Academic parent report/publication and native-result cases, School current parent page/support tests, Portfolio exact review/publication/recovery tests, Community conversation source/receipt/replay tests and the existing e2e cross-role journeys. Adapt assertions to the real selected records and current backend; do not remove them to make screenshots pass.

Parent connected checks include `parent-context-loading.spec.ts`, `parent-learning-support.spec.ts`, `parent-conversations.spec.ts`, `customer-school-context.spec.ts`, `academic-report.spec.ts`, `academic-period-report.spec.ts`, `result-parent-publication.spec.ts`, `portfolio-sharing-recovery.spec.ts` and `customer-portfolio-text-work.spec.ts` under `tests/e2e`. The locked synthetic-primary/pathway curriculum artifacts preserve native zero, missing-not-zero, full rubric criteria, Parent-approved-only visibility and immutable history. The pictured 0–4 example does not replace their current native 0–10 scale or establish an official curriculum rule.

## Design-system judgment

One design system gives consistent control meaning, coordinated theme/icon changes, accessible defaults, predictable bilingual/mobile behavior and reusable implementation boundaries. Its costs are migration effort, CSS cascade regressions and premature abstraction. Forcing every role into the same card grid would erase the actual task hierarchy; a beautiful primitive does not establish a usable connected workflow.

The recommendation is one shared foundation with deliberately different role compositions and a small amount of repeated record/context/decision anatomy. Keep domain logic and source authority in existing owners. Separate Student and adult visualizations are useful review artifacts; separate applications, palettes or command implementations are unnecessary.

## Reference evidence and status

External Teacher evidence: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/qa/teacher-reference-design-system/references.json` plus five contact sheets. External Parent evidence uses `parent-references.json` in that same folder, with exact hashes/dimensions and the independent reference review. These generated/local review artifacts are not runtime source and are not committed as application assets.

Only documentation and external reference evidence change in this checkpoint. Parent layout implementation, source reconciliation and connected acceptance remain pending under the active redesign goal.
